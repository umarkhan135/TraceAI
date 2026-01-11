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

export class LocalLoader {
  private artifactCache: Map<string, ConversationArtifact> = new Map();
  private configCache: Map<string, TraceAIConfig> = new Map();

  async loadArtifact(workspacePath: string): Promise<ConversationArtifact | null> {
    const cached = this.artifactCache.get(workspacePath);
    if (cached) {
      return cached;
    }

    const config = await this.loadConfig(workspacePath);
    if (config && config.gist_id) {
      console.log(`TraceAI: Found config with Gist ID ${config.gist_id}, fetching...`);
      const artifact = await this.loadFromGist(workspacePath, config.gist_id);
      if (artifact) {
        return artifact;
      }
    }

    return await this.loadFromLocalFile(workspacePath);
  }

  private async loadConfig(workspacePath: string): Promise<TraceAIConfig | null> {
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

      this.configCache.set(workspacePath, config);

      return config;
    } catch (error) {
      if (error instanceof Error) {
        console.error(`TraceAI: Failed to load config: ${error.message}`);
      }
      return null;
    }
  }

  private async loadFromGist(workspacePath: string, gistId: string): Promise<ConversationArtifact | null> {
    try {
      const artifact = await githubClient.fetchGistArtifact(gistId);
      if (artifact) {
        this.artifactCache.set(workspacePath, artifact);

        await this.cacheArtifactLocally(workspacePath, artifact);

        console.log(`TraceAI: Loaded artifact from Gist with ${artifact.mappings.length} mappings`);
        return artifact;
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error(`TraceAI: Failed to fetch from Gist: ${error.message}`);
      }
      return await this.loadFromLocalCache(workspacePath);
    }

    return null;
  }

  private async loadFromLocalFile(workspacePath: string): Promise<ConversationArtifact | null> {
    const artifactPath = path.join(workspacePath, '.traceai', 'artifacts.json');

    try {
      if (!fs.existsSync(artifactPath)) {
        console.log(`TraceAI: No artifact found at ${artifactPath}`);
        return null;
      }

      const content = fs.readFileSync(artifactPath, 'utf8');
      const artifact = JSON.parse(content) as ConversationArtifact;

      if (!artifact.version || !artifact.mappings || !artifact.conversation) {
        console.log('TraceAI: Invalid artifact structure');
        return null;
      }

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

  private async cacheArtifactLocally(workspacePath: string, artifact: ConversationArtifact): Promise<void> {
    const cacheDir = path.join(workspacePath, '.traceai', '.cache');
    const cachePath = path.join(cacheDir, 'artifact.json');

    try {
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }

      fs.writeFileSync(cachePath, JSON.stringify(artifact, null, 2), 'utf8');
    } catch (error) {
      console.warn('TraceAI: Failed to cache artifact locally');
    }
  }

  createFileWatcher(workspacePath: string): vscode.Disposable {
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

    return {
      dispose: () => {
        configWatcher.dispose();
        artifactWatcher.dispose();
      }
    };
  }

  clearCache(): void {
    this.artifactCache.clear();
    this.configCache.clear();
  }
}

export const localLoader = new LocalLoader();
