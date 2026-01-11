/**
 * Processing Orchestrator
 * Coordinates the end-to-end workflow:
 * 1. Find related Claude conversations
 * 2. Build artifacts
 * 3. Upload to GitHub (or save locally if offline)
 * 4. Update config
 */

import * as path from 'path';
import { ConversationParser } from './conversationParser';
import { ArtifactBuilder } from './artifactBuilder';
import { githubService } from './githubService';
import { StorageService } from './storageService';
import { ConfigMigration } from './configMigration';
import { GitService } from './gitService';
import { AuthService } from './authService';
import { ProcessingResult, ConversationArtifact } from '../models';

export class ProcessingOrchestrator {
  /**
   * Process unpushed commits and create/update gist
   */
  static async processUnpushedCommits(
    repoPath: string,
    options: {
      public?: boolean;
      timeWindowHours?: number;
    } = {}
  ): Promise<ProcessingResult> {
    console.log('TraceAI: Processing unpushed commits...');

    try {
      // Get git info
      const repoInfo = await GitService.getRepoInfo(repoPath);
      if (!repoInfo) {
        return {
          success: false,
          error: 'Not a git repository',
          sessions_processed: 0,
          files_modified: 0
        };
      }

      // Get unpushed commits
      const commits = await GitService.getUnpushedCommits(repoPath);
      if (commits.length === 0) {
        console.log('TraceAI: No unpushed commits found');
        return {
          success: true,
          sessions_processed: 0,
          files_modified: 0,
          warnings: ['No unpushed commits found']
        };
      }

      console.log(`TraceAI: Found ${commits.length} unpushed commit(s)`);

      // Get all changed files
      const changedFiles = GitService.getAllChangedFiles(commits);
      console.log(`TraceAI: ${changedFiles.length} file(s) changed`);

      // Find conversations that modified these files
      const conversations = await this.findConversationsForFiles(
        repoPath,
        changedFiles,
        options.timeWindowHours || 24
      );

      if (conversations.length === 0) {
        console.log('TraceAI: No conversations found for changed files');
        return {
          success: true,
          sessions_processed: 0,
          files_modified: changedFiles.length,
          warnings: ['No Claude conversations found for changed files']
        };
      }

      console.log(`TraceAI: Found ${conversations.length} related conversation(s)`);

      // Build artifact from conversations
      const artifact = await ArtifactBuilder.buildMultiConversationArtifact(
        conversations,
        repoPath,
        {
          branch: repoInfo.branch,
          correlateGit: true
        }
      );

      // Try to upload to GitHub
      const uploaded = await this.uploadOrStore(
        repoPath,
        artifact,
        options.public || false
      );

      return {
        success: true,
        artifact,
        gist_url: uploaded.gist_url,
        gist_id: uploaded.gist_id,
        sessions_processed: conversations.length,
        files_modified: artifact.stats.files_modified,
        warnings: uploaded.warnings
      };
    } catch (error: any) {
      console.error('TraceAI: Processing failed:', error);
      return {
        success: false,
        error: error.message || 'Unknown error',
        sessions_processed: 0,
        files_modified: 0
      };
    }
  }

  /**
   * Process latest conversation manually
   */
  static async processLatestConversation(
    repoPath: string,
    options: {
      public?: boolean;
      sessionId?: string;
    } = {}
  ): Promise<ProcessingResult> {
    console.log('TraceAI: Processing latest conversation...');

    try {
      // Find conversation
      const convFile = options.sessionId
        ? ConversationParser.findConversationFile(repoPath, options.sessionId)
        : ConversationParser.findConversationFile(repoPath);

      console.log(`TraceAI: Processing ${path.basename(convFile)}`);

      // Get git info
      const repoInfo = await GitService.getRepoInfo(repoPath);

      // Build artifact
      const artifact = await ArtifactBuilder.buildArtifact(
        convFile,
        repoPath,
        {
          branch: repoInfo?.branch,
          correlateGit: true
        }
      );

      // Upload or store
      const uploaded = await this.uploadOrStore(
        repoPath,
        artifact,
        options.public || false
      );

      return {
        success: true,
        artifact,
        gist_url: uploaded.gist_url,
        gist_id: uploaded.gist_id,
        sessions_processed: 1,
        files_modified: artifact.stats.files_modified,
        warnings: uploaded.warnings
      };
    } catch (error: any) {
      console.error('TraceAI: Processing failed:', error);
      return {
        success: false,
        error: error.message || 'Unknown error',
        sessions_processed: 0,
        files_modified: 0
      };
    }
  }

  /**
   * Upload artifact to GitHub or store locally if offline
   */
  private static async uploadOrStore(
    repoPath: string,
    artifact: ConversationArtifact,
    isPublic: boolean
  ): Promise<{
    gist_id?: string;
    gist_url?: string;
    warnings?: string[];
  }> {
    const warnings: string[] = [];

    // Check authentication
    const isAuthenticated = await AuthService.isAuthenticated();

    if (!isAuthenticated) {
      console.log('TraceAI: Not authenticated, storing locally');
      warnings.push('Not authenticated with GitHub, artifact saved locally');

      // Save locally
      await StorageService.saveArtifact(repoPath, artifact, {
        syncedToGist: false
      });

      // Add to sync queue
      StorageService.addToSyncQueue(repoPath, artifact.metadata.session_id);

      return { warnings };
    }

    // Try to upload to GitHub
    try {
      // Initialize GitHub service
      const initialized = await githubService.initialize();
      if (!initialized) {
        throw new Error('Failed to initialize GitHub service');
      }

      // Check for existing gist
      const existingConfig = StorageService.loadConfig(repoPath);
      const existingGistId = existingConfig?.gist_id;

      // Create or update gist
      const gistResponse = await githubService.createOrUpdateGist(
        artifact,
        existingGistId,
        {
          public: isPublic,
          description: `TraceAI: ${artifact.metadata.branch || 'main'} - ${artifact.stats.files_modified} files modified`
        }
      );

      if (!gistResponse) {
        throw new Error('Failed to create/update gist');
      }

      console.log(`TraceAI: Gist ${existingGistId ? 'updated' : 'created'}: ${gistResponse.html_url}`);

      // Save artifact locally with gist info
      await StorageService.saveArtifact(repoPath, artifact, {
        syncedToGist: true,
        gistId: gistResponse.id,
        gistUrl: gistResponse.html_url
      });

      // Update config
      const config = ConfigMigration.createNewConfig({
        gistId: gistResponse.id,
        gistUrl: gistResponse.html_url,
        branch: artifact.metadata.branch,
        prNumber: artifact.metadata.pr_number,
        sessionIds: artifact.metadata.session_ids || [artifact.metadata.session_id],
        repoName: artifact.metadata.repo_name,
        filesModified: artifact.stats.files_modified
      });

      StorageService.saveConfig(repoPath, config);

      // Remove from sync queue if it was there
      StorageService.removeFromSyncQueue(repoPath, artifact.metadata.session_id);

      return {
        gist_id: gistResponse.id,
        gist_url: gistResponse.html_url,
        warnings
      };
    } catch (error: any) {
      console.error('TraceAI: Failed to upload to GitHub:', error);
      warnings.push(`Failed to upload to GitHub: ${error.message}`);

      // Save locally as fallback
      await StorageService.saveArtifact(repoPath, artifact, {
        syncedToGist: false
      });

      // Add to sync queue
      StorageService.addToSyncQueue(repoPath, artifact.metadata.session_id);

      return { warnings };
    }
  }

  /**
   * Find conversations that modified specific files
   */
  private static async findConversationsForFiles(
    repoPath: string,
    files: string[],
    timeWindowHours: number
  ): Promise<string[]> {
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - timeWindowHours);

    try {
      const allConversations = ConversationParser.listConversationFiles(repoPath);

      const matchingConversations: string[] = [];

      for (const conv of allConversations) {
        const modTime = new Date(conv.modified_time);

        // Skip if outside time window
        if (modTime < cutoffTime) {
          continue;
        }

        // Quick check: does this conversation mention any of our files?
        // We'll do a simple grep-style search through the conversation
        try {
          const messages = ConversationParser.parseConversationToArray(conv.path);
          let hasFileMatch = false;

          for (const message of messages) {
            if (message.type !== 'assistant') continue;

            const toolCalls = ConversationParser.extractToolCallsFromMessage(
              message.message.content
            );

            for (const toolCall of toolCalls) {
              if (toolCall.name === 'Edit' || toolCall.name === 'Write') {
                const filePath = toolCall.input.file_path as string;
                if (filePath) {
                  // Normalize path
                  const normalizedPath = path.normalize(filePath);
                  const found = files.some(f =>
                    normalizedPath.includes(f) || f.includes(normalizedPath)
                  );

                  if (found) {
                    hasFileMatch = true;
                    break;
                  }
                }
              }
            }

            if (hasFileMatch) break;
          }

          if (hasFileMatch) {
            matchingConversations.push(conv.path);
          }
        } catch (error) {
          console.warn(`TraceAI: Failed to check conversation ${conv.session_id}:`, error);
        }
      }

      return matchingConversations;
    } catch (error) {
      console.error('TraceAI: Failed to find conversations:', error);
      return [];
    }
  }

  /**
   * Sync queued artifacts to GitHub
   */
  static async syncQueuedArtifacts(repoPath: string): Promise<{
    synced: number;
    failed: number;
  }> {
    const queue = StorageService.getSyncQueue(repoPath);
    let synced = 0;
    let failed = 0;

    // Check authentication
    const isAuthenticated = await AuthService.isAuthenticated();
    if (!isAuthenticated) {
      console.log('TraceAI: Not authenticated, cannot sync');
      return { synced: 0, failed: queue.length };
    }

    // Initialize GitHub service
    const initialized = await githubService.initialize();
    if (!initialized) {
      console.log('TraceAI: Failed to initialize GitHub service');
      return { synced: 0, failed: queue.length };
    }

    for (const sessionId of queue) {
      const stored = StorageService.loadArtifact(repoPath, sessionId);
      if (!stored) {
        console.warn(`TraceAI: Artifact ${sessionId} not found`);
        StorageService.removeFromSyncQueue(repoPath, sessionId);
        failed++;
        continue;
      }

      try {
        const gistResponse = await githubService.createGist(stored.artifact, {
          public: false
        });

        if (gistResponse) {
          // Mark as synced
          StorageService.markAsSynced(
            repoPath,
            sessionId,
            gistResponse.id,
            gistResponse.html_url
          );

          // Remove from queue
          StorageService.removeFromSyncQueue(repoPath, sessionId);

          synced++;
          console.log(`TraceAI: Synced ${sessionId} to ${gistResponse.html_url}`);
        } else {
          failed++;
        }
      } catch (error: any) {
        console.error(`TraceAI: Failed to sync ${sessionId}:`, error);
        StorageService.markSyncError(repoPath, sessionId, error.message);
        failed++;
      }
    }

    return { synced, failed };
  }
}
