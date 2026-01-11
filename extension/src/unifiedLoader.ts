import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConversationArtifact } from './types';
import { githubClient } from './githubClient';
import { localLoader } from './localLoader';
import { getRepoInfo } from './gitUtils';

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
   * 1. Get repository information from Git
   * 2. Fetch ALL TraceAI Gists for this repository from GitHub
   * 3. Merge them into a unified artifact
   * 4. Cache to .traceai/artifacts.json
   *
   * This enables showing AI-generated code from multiple PRs/conversations
   */
  private async loadFromConfig(workspacePath: string): Promise<ConversationArtifact | null> {
    const configPath = path.join(workspacePath, '.traceai', 'config.json');

    // Check if we have a recent cached artifact
    const artifactsPath = path.join(workspacePath, '.traceai', 'artifacts.json');
    if (fs.existsSync(artifactsPath)) {
      const stats = fs.statSync(artifactsPath);
      const now = Date.now();
      const cacheAge = now - stats.mtimeMs;
      const config = vscode.workspace.getConfiguration('traceai');
      const maxAge = config.get<number>('cacheExpiration', 3600) * 1000;

      // If cache is fresh, use it
      if (cacheAge < maxAge) {
        console.log('TraceAI: Using cached artifacts.json (fresh)');
        try {
          const content = fs.readFileSync(artifactsPath, 'utf8');
          return JSON.parse(content) as ConversationArtifact;
        } catch (error) {
          console.warn('TraceAI: Failed to parse cached artifacts, will refetch');
        }
      }
    }

    // Get repository information
    const repoInfo = await getRepoInfo(workspacePath);
    if (!repoInfo) {
      console.log('TraceAI: Unable to determine repository information');

      // Fallback: if config.json exists, try to fetch that single Gist
      if (fs.existsSync(configPath)) {
        return this.loadSingleGistFromConfig(configPath, workspacePath);
      }

      return null;
    }

    console.log(`TraceAI: Found repository: ${repoInfo.fullName}`);

    // Fetch ALL Gists for this repository
    const artifact = await githubClient.fetchAllGistsForRepo(repoInfo.fullName);

    if (!artifact) {
      console.log('TraceAI: Failed to fetch Gists for repository');

      // Fallback: if config.json exists, try to fetch that single Gist
      if (fs.existsSync(configPath)) {
        return this.loadSingleGistFromConfig(configPath, workspacePath);
      }

      return null;
    }

    // Cache the merged artifact locally
    await this.cacheArtifactLocally(workspacePath, artifact);

    console.log(`TraceAI: Loaded merged artifact with ${artifact.mappings.length} mappings`);
    return artifact;
  }

  /**
   * Fallback: Load a single Gist from config.json
   * Used when we can't determine repository info or fetch all Gists
   */
  private async loadSingleGistFromConfig(
    configPath: string,
    workspacePath: string
  ): Promise<ConversationArtifact | null> {
    try {
      const configContent = fs.readFileSync(configPath, 'utf8');
      const config: TraceAIConfig = JSON.parse(configContent);

      console.log(`TraceAI: Falling back to single Gist: ${config.gist_id}`);

      const artifact = await githubClient.fetchGist(config.gist_id);

      if (artifact) {
        await this.cacheArtifactLocally(workspacePath, artifact);
      }

      return artifact;
    } catch (error) {
      console.error('TraceAI: Failed to load single Gist from config:', error);
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
