import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConversationArtifact } from './types';

/**
 * Local file loader for TraceAI artifacts
 * Reads from .traceai/artifacts.json in the workspace
 */
export class LocalLoader {
  private artifactCache: Map<string, ConversationArtifact> = new Map();

  /**
   * Load artifact from local .traceai directory
   */
  async loadArtifact(workspacePath: string): Promise<ConversationArtifact | null> {
    // Check cache first
    const cached = this.artifactCache.get(workspacePath);
    if (cached) {
      return cached;
    }

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
   * Watch for changes to the artifact file
   */
  createFileWatcher(workspacePath: string): vscode.FileSystemWatcher {
    const pattern = new vscode.RelativePattern(workspacePath, '.traceai/artifacts.json');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    watcher.onDidChange(() => {
      console.log('TraceAI: Artifact file changed, clearing cache');
      this.artifactCache.delete(workspacePath);
    });

    watcher.onDidCreate(() => {
      console.log('TraceAI: Artifact file created');
      this.artifactCache.delete(workspacePath);
    });

    watcher.onDidDelete(() => {
      console.log('TraceAI: Artifact file deleted');
      this.artifactCache.delete(workspacePath);
    });

    return watcher;
  }

  /**
   * Clear cached artifacts
   */
  clearCache(): void {
    this.artifactCache.clear();
  }
}

// Singleton instance
export const localLoader = new LocalLoader();
