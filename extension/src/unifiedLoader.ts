import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConversationArtifact, LocalArtifactConfig } from './types';

/**
 * Unified loader for local artifacts.
 *
 * Reads artifacts directly from .traceai/ directory without GitHub API calls.
 * This is much simpler and faster than the previous Gist-based approach.
 */
export class UnifiedLoader {
  private artifactCache: Map<string, ConversationArtifact> = new Map();

  /**
   * Load artifacts from .traceai/ directory
   */
  async loadArtifact(workspacePath: string): Promise<ConversationArtifact | null> {
    // Check memory cache
    const cached = this.artifactCache.get(workspacePath);
    if (cached) {
      console.log('TraceAI: Using cached artifact');
      return cached;
    }

    // Load from local files
    const artifact = await this.loadFromLocal(workspacePath);

    if (artifact) {
      this.artifactCache.set(workspacePath, artifact);
    }

    return artifact;
  }

  /**
   * Load artifacts from .traceai/ directory
   */
  private async loadFromLocal(workspacePath: string): Promise<ConversationArtifact | null> {
    const configPath = path.join(workspacePath, '.traceai', 'config.json');

    // Check if config exists
    if (!fs.existsSync(configPath)) {
      console.log('TraceAI: No config.json found');
      return null;
    }

    try {
      // Read config
      const configContent = fs.readFileSync(configPath, 'utf8');
      const config: LocalArtifactConfig = JSON.parse(configContent);

      // Load all artifact files
      const artifacts: ConversationArtifact[] = [];

      for (const filename of config.artifact_files) {
        const artifactPath = path.join(workspacePath, '.traceai', filename);

        if (fs.existsSync(artifactPath)) {
          const content = fs.readFileSync(artifactPath, 'utf8');
          const artifact = JSON.parse(content) as ConversationArtifact;
          artifacts.push(artifact);
        } else {
          console.warn(`TraceAI: Artifact not found: ${filename}`);
        }
      }

      if (artifacts.length === 0) {
        console.log('TraceAI: No artifacts loaded');
        return null;
      }

      // Single artifact - return directly
      if (artifacts.length === 1) {
        console.log(`TraceAI: Loaded 1 artifact with ${artifacts[0].mappings.length} mappings`);
        return artifacts[0];
      }

      // Multiple artifacts - merge
      const merged = this.mergeArtifacts(artifacts);
      console.log(`TraceAI: Merged ${artifacts.length} artifacts with ${merged.mappings.length} total mappings`);
      return merged;

    } catch (error) {
      console.error('TraceAI: Failed to load artifacts:', error);
      return null;
    }
  }

  /**
   * Merge multiple artifacts into one
   */
  private mergeArtifacts(artifacts: ConversationArtifact[]): ConversationArtifact {
    // Sort by end_time (most recent first)
    const sorted = artifacts.sort((a, b) => {
      const timeA = new Date(a.metadata.end_time).getTime();
      const timeB = new Date(b.metadata.end_time).getTime();
      return timeB - timeA;
    });

    const base = sorted[0];
    const merged: ConversationArtifact = {
      ...base,
      conversation_id: `merged-${artifacts.length}-conversations`,
      mappings: [],
      conversation: [],
      stats: {
        total_messages: 0,
        total_prompts: 0,
        files_modified: 0,
        total_tokens: 0,
        ai_generated_lines: null
      }
    };

    // Merge all mappings and conversations
    for (const artifact of sorted) {
      // Add mappings with PR prefix if available
      const prefix = artifact.metadata.pr_number ? `[PR #${artifact.metadata.pr_number}] ` : '';

      // Calculate index offset for this artifact (based on current merged conversation length)
      const indexOffset = merged.conversation.length;

      // Add mappings with updated prompt_index to match offset conversations
      for (const mapping of artifact.mappings) {
        merged.mappings.push({
          ...mapping,
          prompt_index: mapping.prompt_index + indexOffset,  // ✅ Update prompt_index!
          prompt_preview: prefix + mapping.prompt_preview
        });
      }

      // Merge conversations (offset indices)
      for (const msg of artifact.conversation) {
        merged.conversation.push({
          ...msg,
          index: msg.index + indexOffset
        });
      }

      // Aggregate stats
      merged.stats.total_messages += artifact.stats.total_messages;
      merged.stats.total_prompts += artifact.stats.total_prompts;
      merged.stats.total_tokens += artifact.stats.total_tokens || 0;
    }

    // Count unique files
    const uniqueFiles = new Set(merged.mappings.map(m => m.file));
    merged.stats.files_modified = uniqueFiles.size;

    return merged;
  }

  /**
   * Create file watcher for config.json changes
   */
  createConfigWatcher(workspacePath: string): vscode.FileSystemWatcher {
    const pattern = new vscode.RelativePattern(workspacePath, '.traceai/config.json');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    watcher.onDidChange(() => {
      console.log('TraceAI: config.json changed, clearing cache');
      this.clearCache();
    });

    watcher.onDidCreate(() => {
      console.log('TraceAI: config.json created, clearing cache');
      this.clearCache();
    });

    watcher.onDidDelete(() => {
      console.log('TraceAI: config.json deleted, clearing cache');
      this.clearCache();
    });

    return watcher;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.artifactCache.clear();
    console.log('TraceAI: Cache cleared');
  }
}

// Singleton instance
export const unifiedLoader = new UnifiedLoader();
