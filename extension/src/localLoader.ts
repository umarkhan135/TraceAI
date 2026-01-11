import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConversationArtifact } from './types';
import { githubClient } from './githubClient';

interface TraceAIConfig {
  gist_id: string;
  gist_url: string;
  branch: string;
  last_updated: string;
  session_id: string;
}

/**
 * Local file loader for TraceAI artifacts
 * Reads from .traceai/config.json (preferred) or .traceai/artifacts.json (fallback)
 * Can fetch from GitHub Gist if config.json points to one
 */
export class LocalLoader {
  private artifactCache: Map<string, ConversationArtifact> = new Map();
  private configCache: Map<string, TraceAIConfig> = new Map();

  /**
   * Load artifact from local .traceai directory or fetch from Gist
   */
  async loadArtifact(workspacePath: string): Promise<ConversationArtifact | null> {
    // Check cache first
    const cached = this.artifactCache.get(workspacePath);
    if (cached) {
      return cached;
    }

    // Try loading from config.json first (preferred)
    const config = await this.loadConfig(workspacePath);
    if (config && config.gist_id) {
      console.log(`TraceAI: Found config with Gist ID ${config.gist_id}, fetching...`);
      const artifact = await this.loadFromGist(workspacePath, config.gist_id);
      if (artifact) {
        return artifact;
      }
    }

    // Fallback: Try loading from local artifacts.json
    return await this.loadFromLocalFile(workspacePath);
  }

  /**
   * Load config.json to get Gist information
   */
  private async loadConfig(workspacePath: string): Promise<TraceAIConfig | null> {
    // Check cache first
    const cached = this.configCache.get(workspacePath);
    if (cached) {
      return cached;
    }

    const configPath = path.join(workspacePath, '.traceai', 'config.json');

    try {
      if (!fs.existsSync(configPath)) {
        return null;
      }

      const content = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(content) as TraceAIConfig;

      // Cache the config
      this.configCache.set(workspacePath, config);

      return config;
    } catch (error) {
      if (error instanceof Error) {
        console.error(`TraceAI: Failed to load config: ${error.message}`);
      }
      return null;
    }
  }

  /**
   * Load artifact from GitHub Gist and cache locally
   */
  private async loadFromGist(workspacePath: string, gistId: string): Promise<ConversationArtifact | null> {
    try {
      const artifact = await githubClient.fetchGistArtifact(gistId);
      if (artifact) {
        // Cache in memory
        this.artifactCache.set(workspacePath, artifact);

        // Also save to local cache file for offline access
        await this.cacheArtifactLocally(workspacePath, artifact);

        console.log(`TraceAI: Loaded artifact from Gist with ${artifact.mappings.length} mappings`);
        return artifact;
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error(`TraceAI: Failed to fetch from Gist: ${error.message}`);
      }
      // Fallback to local cache if Gist fetch fails
      return await this.loadFromLocalCache(workspacePath);
    }

    return null;
  }

  /**
   * Load artifact from local artifacts.json file
   */
  private async loadFromLocalFile(workspacePath: string): Promise<ConversationArtifact | null> {
    const artifactPath = path.join(workspacePath, '.traceai', 'artifacts.json');

    try {
      if (!fs.existsSync(artifactPath)) {
        console.log(`TraceAI: No artifact found at ${artifactPath}`);
        return null;
      }

      const content = fs.readFileSync(artifactPath, 'utf8');
      const artifact = JSON.parse(content) as ConversationArtifact;

      // Validate basic structure
      if (!artifact.version || !artifact.mappings || !artifact.conversation) {
        console.log('TraceAI: Invalid artifact structure');
        return null;
      }

      // Cache the artifact
      this.artifactCache.set(workspacePath, artifact);
      console.log(`TraceAI: Loaded artifact with ${artifact.mappings.length} mappings`);

      return artifact;
    } catch (error) {
      if (error instanceof Error) {
        console.error(`TraceAI: Failed to load artifact: ${error.message}`);
      }
      return null;
    }
  }

  /**
   * Load artifact from local cache (offline fallback)
   */
  private async loadFromLocalCache(workspacePath: string): Promise<ConversationArtifact | null> {
    const cachePath = path.join(workspacePath, '.traceai', '.cache', 'artifact.json');

    try {
      if (!fs.existsSync(cachePath)) {
        return null;
      }

      const content = fs.readFileSync(cachePath, 'utf8');
      const artifact = JSON.parse(content) as ConversationArtifact;

      console.log('TraceAI: Loaded artifact from local cache (offline mode)');
      this.artifactCache.set(workspacePath, artifact);

      return artifact;
    } catch (error) {
      return null;
    }
  }

  /**
   * Save artifact to local cache for offline access
   */
  private async cacheArtifactLocally(workspacePath: string, artifact: ConversationArtifact): Promise<void> {
    const cacheDir = path.join(workspacePath, '.traceai', '.cache');
    const cachePath = path.join(cacheDir, 'artifact.json');

    try {
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }

      fs.writeFileSync(cachePath, JSON.stringify(artifact, null, 2), 'utf8');
    } catch (error) {
      // Silent fail - caching is optional
      console.warn('TraceAI: Failed to cache artifact locally');
    }
  }

  /**
   * Watch for changes to the config and artifact files
   */
  createFileWatcher(workspacePath: string): vscode.Disposable {
    // Watch config.json
    const configPattern = new vscode.RelativePattern(workspacePath, '.traceai/config.json');
    const configWatcher = vscode.workspace.createFileSystemWatcher(configPattern);

    configWatcher.onDidChange(() => {
      console.log('TraceAI: Config file changed, clearing cache');
      this.configCache.delete(workspacePath);
      this.artifactCache.delete(workspacePath);
    });

    configWatcher.onDidCreate(() => {
      console.log('TraceAI: Config file created');
      this.configCache.delete(workspacePath);
      this.artifactCache.delete(workspacePath);
    });

    configWatcher.onDidDelete(() => {
      console.log('TraceAI: Config file deleted');
      this.configCache.delete(workspacePath);
      this.artifactCache.delete(workspacePath);
    });

    // Watch artifacts.json (fallback)
    const artifactPattern = new vscode.RelativePattern(workspacePath, '.traceai/artifacts.json');
    const artifactWatcher = vscode.workspace.createFileSystemWatcher(artifactPattern);

    artifactWatcher.onDidChange(() => {
      console.log('TraceAI: Artifact file changed, clearing cache');
      this.artifactCache.delete(workspacePath);
    });

    artifactWatcher.onDidCreate(() => {
      console.log('TraceAI: Artifact file created');
      this.artifactCache.delete(workspacePath);
    });

    artifactWatcher.onDidDelete(() => {
      console.log('TraceAI: Artifact file deleted');
      this.artifactCache.delete(workspacePath);
    });

    // Return disposable that disposes both watchers
    return {
      dispose: () => {
        configWatcher.dispose();
        artifactWatcher.dispose();
      }
    };
  }

  /**
   * Clear cached artifacts
   */
  clearCache(): void {
    this.artifactCache.clear();
    this.configCache.clear();
  }
}

// Singleton instance
export const localLoader = new LocalLoader();
