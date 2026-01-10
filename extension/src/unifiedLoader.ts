import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConversationArtifact } from './types';
import { githubClient } from './githubClient';
import { localLoader } from './localLoader';

/**
 * Configuration file structure from .traceai/config.json
 */
interface TraceAIConfig {
  gist_id: string;
  gist_url: string;
  pr_number?: number;
  session_id: string;
  last_updated: string;
}

/**
 * Unified loader that:
 * 1. Checks for .traceai/config.json (created by pipeline)
 * 2. If config exists, fetches from GitHub Gist and caches locally
 * 3. Falls back to local .traceai/artifacts.json if no config
 *
 * This implements the integration flow from PHASETWO.md
 */
export class UnifiedLoader {
  private artifactCache: Map<string, ConversationArtifact> = new Map();

  /**
   * Load artifact using the complete integration flow
   */
  async loadArtifact(workspacePath: string): Promise<ConversationArtifact | null> {
    // Check memory cache first
    const cached = this.artifactCache.get(workspacePath);
    if (cached) {
      console.log('TraceAI: Using cached artifact');
      return cached;
    }

    // Try config-based workflow first (new integration path)
    const configArtifact = await this.loadFromConfig(workspacePath);
    if (configArtifact) {
      this.artifactCache.set(workspacePath, configArtifact);
      return configArtifact;
    }

    // Fall back to local artifacts.json (backward compatibility)
    console.log('TraceAI: No config found, falling back to local loader');
    const localArtifact = await localLoader.loadArtifact(workspacePath);
    if (localArtifact) {
      this.artifactCache.set(workspacePath, localArtifact);
    }

    return localArtifact;
  }

  /**
   * Load artifact using config.json workflow:
   * 1. Read .traceai/config.json
   * 2. Fetch from GitHub Gist using gist_id
   * 3. Cache to .traceai/artifacts.json
   */
  private async loadFromConfig(workspacePath: string): Promise<ConversationArtifact | null> {
    const configPath = path.join(workspacePath, '.traceai', 'config.json');

    // Check if config exists
    if (!fs.existsSync(configPath)) {
      console.log('TraceAI: No config.json found');
      return null;
    }

    try {
      // Read config file
      const configContent = fs.readFileSync(configPath, 'utf8');
      const config: TraceAIConfig = JSON.parse(configContent);

      console.log(`TraceAI: Found config for Gist ${config.gist_id}`);

      // Check if we have a cached artifacts.json that's recent
      const artifactsPath = path.join(workspacePath, '.traceai', 'artifacts.json');
      if (fs.existsSync(artifactsPath)) {
        const stats = fs.statSync(artifactsPath);
        const configStats = fs.statSync(configPath);

        // If artifacts.json is newer than config.json, use it
        if (stats.mtimeMs >= configStats.mtimeMs) {
          console.log('TraceAI: Using cached artifacts.json (newer than config)');
          const content = fs.readFileSync(artifactsPath, 'utf8');
          return JSON.parse(content) as ConversationArtifact;
        }
      }

      // Fetch from GitHub Gist
      console.log('TraceAI: Fetching from GitHub Gist...');
      const artifact = await githubClient.fetchGist(config.gist_id);

      if (!artifact) {
        console.log('TraceAI: Failed to fetch from Gist');
        return null;
      }

      // Cache the artifact locally
      await this.cacheArtifactLocally(workspacePath, artifact);

      console.log(`TraceAI: Loaded artifact from Gist with ${artifact.mappings.length} mappings`);
      return artifact;

    } catch (error) {
      if (error instanceof Error) {
        console.error(`TraceAI: Failed to load from config: ${error.message}`);
      }
      return null;
    }
  }

  /**
   * Cache the fetched artifact to .traceai/artifacts.json
   */
  private async cacheArtifactLocally(
    workspacePath: string,
    artifact: ConversationArtifact
  ): Promise<void> {
    const traceaiDir = path.join(workspacePath, '.traceai');
    const artifactsPath = path.join(traceaiDir, 'artifacts.json');

    try {
      // Ensure .traceai directory exists
      if (!fs.existsSync(traceaiDir)) {
        fs.mkdirSync(traceaiDir, { recursive: true });
      }

      // Write artifact to file
      fs.writeFileSync(
        artifactsPath,
        JSON.stringify(artifact, null, 2),
        'utf8'
      );

      console.log(`TraceAI: Cached artifact to ${artifactsPath}`);
    } catch (error) {
      console.error('TraceAI: Failed to cache artifact locally:', error);
      // Non-fatal error - artifact is still usable from memory
    }
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
    localLoader.clearCache();
    console.log('TraceAI: Cache cleared');
  }
}

// Singleton instance
export const unifiedLoader = new UnifiedLoader();
