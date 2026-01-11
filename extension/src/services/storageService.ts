/**
 * Storage Service
 * Handles local artifact storage for offline mode
 * Automatically syncs to GitHub when online
 */

import * as fs from 'fs';
import * as path from 'path';
import { ConversationArtifact, TraceAIConfig } from '../models';

export interface StoredArtifact {
  artifact: ConversationArtifact;
  stored_at: string;
  synced_to_gist: boolean;
  gist_id?: string;
  gist_url?: string;
  sync_error?: string;
}

export class StorageService {
  private static readonly ARTIFACTS_DIR = '.traceai/artifacts';
  private static readonly CONFIG_FILE = '.traceai/config.json';
  private static readonly SYNC_QUEUE_FILE = '.traceai/sync-queue.json';

  /**
   * Save artifact locally
   */
  static async saveArtifact(
    repoPath: string,
    artifact: ConversationArtifact,
    options: {
      syncedToGist?: boolean;
      gistId?: string;
      gistUrl?: string;
    } = {}
  ): Promise<string> {
    const artifactsDir = path.join(repoPath, this.ARTIFACTS_DIR);

    // Create directory if it doesn't exist
    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }

    const storedArtifact: StoredArtifact = {
      artifact,
      stored_at: new Date().toISOString(),
      synced_to_gist: options.syncedToGist || false,
      gist_id: options.gistId,
      gist_url: options.gistUrl
    };

    // Generate filename from session ID
    const filename = `${artifact.metadata.session_id}.json`;
    const filePath = path.join(artifactsDir, filename);

    // Write artifact
    fs.writeFileSync(filePath, JSON.stringify(storedArtifact, null, 2), 'utf-8');

    console.log(`TraceAI: Saved artifact locally to ${filePath}`);
    return filePath;
  }

  /**
   * Load artifact from local storage
   */
  static loadArtifact(
    repoPath: string,
    sessionId: string
  ): StoredArtifact | null {
    const filePath = path.join(
      repoPath,
      this.ARTIFACTS_DIR,
      `${sessionId}.json`
    );

    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as StoredArtifact;
    } catch (error) {
      console.error(`TraceAI: Failed to load artifact ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * List all locally stored artifacts
   */
  static listArtifacts(repoPath: string): StoredArtifact[] {
    const artifactsDir = path.join(repoPath, this.ARTIFACTS_DIR);

    if (!fs.existsSync(artifactsDir)) {
      return [];
    }

    const files = fs.readdirSync(artifactsDir)
      .filter(f => f.endsWith('.json'));

    const artifacts: StoredArtifact[] = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(
          path.join(artifactsDir, file),
          'utf-8'
        );
        artifacts.push(JSON.parse(content) as StoredArtifact);
      } catch (error) {
        console.warn(`TraceAI: Failed to load artifact ${file}:`, error);
      }
    }

    // Sort by stored_at descending
    artifacts.sort((a, b) =>
      new Date(b.stored_at).getTime() - new Date(a.stored_at).getTime()
    );

    return artifacts;
  }

  /**
   * Get unsynced artifacts (for offline queue)
   */
  static getUnsyncedArtifacts(repoPath: string): StoredArtifact[] {
    const all = this.listArtifacts(repoPath);
    return all.filter(a => !a.synced_to_gist);
  }

  /**
   * Mark artifact as synced
   */
  static markAsSynced(
    repoPath: string,
    sessionId: string,
    gistId: string,
    gistUrl: string
  ): boolean {
    const artifact = this.loadArtifact(repoPath, sessionId);
    if (!artifact) {
      return false;
    }

    artifact.synced_to_gist = true;
    artifact.gist_id = gistId;
    artifact.gist_url = gistUrl;
    artifact.sync_error = undefined;

    const filePath = path.join(
      repoPath,
      this.ARTIFACTS_DIR,
      `${sessionId}.json`
    );

    try {
      fs.writeFileSync(filePath, JSON.stringify(artifact, null, 2), 'utf-8');
      return true;
    } catch (error) {
      console.error(`TraceAI: Failed to mark artifact as synced:`, error);
      return false;
    }
  }

  /**
   * Mark artifact with sync error
   */
  static markSyncError(
    repoPath: string,
    sessionId: string,
    error: string
  ): boolean {
    const artifact = this.loadArtifact(repoPath, sessionId);
    if (!artifact) {
      return false;
    }

    artifact.sync_error = error;

    const filePath = path.join(
      repoPath,
      this.ARTIFACTS_DIR,
      `${sessionId}.json`
    );

    try {
      fs.writeFileSync(filePath, JSON.stringify(artifact, null, 2), 'utf-8');
      return true;
    } catch (error) {
      console.error(`TraceAI: Failed to mark sync error:`, error);
      return false;
    }
  }

  /**
   * Save config.json
   */
  static saveConfig(
    repoPath: string,
    config: TraceAIConfig
  ): boolean {
    try {
      const configPath = path.join(repoPath, this.CONFIG_FILE);
      const configDir = path.dirname(configPath);

      // Create directory if it doesn't exist
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
      return true;
    } catch (error) {
      console.error('TraceAI: Failed to save config:', error);
      return false;
    }
  }

  /**
   * Load config.json
   */
  static loadConfig(repoPath: string): TraceAIConfig | null {
    const configPath = path.join(repoPath, this.CONFIG_FILE);

    if (!fs.existsSync(configPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content) as TraceAIConfig;
    } catch (error) {
      console.error('TraceAI: Failed to load config:', error);
      return null;
    }
  }

  /**
   * Add artifact to sync queue
   */
  static addToSyncQueue(
    repoPath: string,
    sessionId: string
  ): boolean {
    const queuePath = path.join(repoPath, this.SYNC_QUEUE_FILE);
    const queueDir = path.dirname(queuePath);

    // Create directory if it doesn't exist
    if (!fs.existsSync(queueDir)) {
      fs.mkdirSync(queueDir, { recursive: true });
    }

    let queue: string[] = [];

    // Load existing queue
    if (fs.existsSync(queuePath)) {
      try {
        const content = fs.readFileSync(queuePath, 'utf-8');
        queue = JSON.parse(content);
      } catch (error) {
        console.warn('TraceAI: Failed to load sync queue, creating new');
      }
    }

    // Add session if not already in queue
    if (!queue.includes(sessionId)) {
      queue.push(sessionId);

      try {
        fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2), 'utf-8');
        return true;
      } catch (error) {
        console.error('TraceAI: Failed to save sync queue:', error);
        return false;
      }
    }

    return true;
  }

  /**
   * Get sync queue
   */
  static getSyncQueue(repoPath: string): string[] {
    const queuePath = path.join(repoPath, this.SYNC_QUEUE_FILE);

    if (!fs.existsSync(queuePath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(queuePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error('TraceAI: Failed to load sync queue:', error);
      return [];
    }
  }

  /**
   * Remove from sync queue
   */
  static removeFromSyncQueue(
    repoPath: string,
    sessionId: string
  ): boolean {
    const queuePath = path.join(repoPath, this.SYNC_QUEUE_FILE);

    if (!fs.existsSync(queuePath)) {
      return false;
    }

    try {
      const content = fs.readFileSync(queuePath, 'utf-8');
      let queue: string[] = JSON.parse(content);

      queue = queue.filter(id => id !== sessionId);

      fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2), 'utf-8');
      return true;
    } catch (error) {
      console.error('TraceAI: Failed to update sync queue:', error);
      return false;
    }
  }

  /**
   * Clear sync queue
   */
  static clearSyncQueue(repoPath: string): boolean {
    const queuePath = path.join(repoPath, this.SYNC_QUEUE_FILE);

    try {
      if (fs.existsSync(queuePath)) {
        fs.unlinkSync(queuePath);
      }
      return true;
    } catch (error) {
      console.error('TraceAI: Failed to clear sync queue:', error);
      return false;
    }
  }

  /**
   * Clean up old artifacts (keep last N)
   */
  static cleanupOldArtifacts(
    repoPath: string,
    keepLast: number = 50
  ): number {
    const artifacts = this.listArtifacts(repoPath);

    if (artifacts.length <= keepLast) {
      return 0;
    }

    // Keep synced artifacts and recent ones
    const toDelete = artifacts
      .filter(a => a.synced_to_gist)
      .slice(keepLast);

    let deletedCount = 0;

    for (const artifact of toDelete) {
      const filePath = path.join(
        repoPath,
        this.ARTIFACTS_DIR,
        `${artifact.artifact.metadata.session_id}.json`
      );

      try {
        fs.unlinkSync(filePath);
        deletedCount++;
      } catch (error) {
        console.warn(`TraceAI: Failed to delete old artifact:`, error);
      }
    }

    return deletedCount;
  }

  /**
   * Get storage statistics
   */
  static getStorageStats(repoPath: string): {
    total_artifacts: number;
    synced: number;
    unsynced: number;
    total_size_bytes: number;
  } {
    const artifacts = this.listArtifacts(repoPath);
    const artifactsDir = path.join(repoPath, this.ARTIFACTS_DIR);

    let totalSize = 0;

    if (fs.existsSync(artifactsDir)) {
      const files = fs.readdirSync(artifactsDir)
        .filter(f => f.endsWith('.json'));

      for (const file of files) {
        try {
          const stats = fs.statSync(path.join(artifactsDir, file));
          totalSize += stats.size;
        } catch (error) {
          // Ignore errors
        }
      }
    }

    return {
      total_artifacts: artifacts.length,
      synced: artifacts.filter(a => a.synced_to_gist).length,
      unsynced: artifacts.filter(a => !a.synced_to_gist).length,
      total_size_bytes: totalSize
    };
  }
}
