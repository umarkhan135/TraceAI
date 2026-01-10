import * as vscode from 'vscode';
import { Octokit } from '@octokit/rest';
import { ConversationArtifact } from './types';
import { cache } from './cache';

/**
 * GitHub API client for fetching Gist data
 */
export class GitHubClient {
  private octokit: Octokit | null = null;

  /**
   * Initialize the GitHub client with a token
   */
  initialize(token: string): void {
    if (token) {
      this.octokit = new Octokit({ auth: token });
    } else {
      // Unauthenticated client (lower rate limits)
      this.octokit = new Octokit();
    }
  }

  /**
   * Fetch a Gist by ID and parse the TraceAI artifact
   */
  async fetchGist(gistId: string): Promise<ConversationArtifact | null> {
    if (!this.octokit) {
      vscode.window.showWarningMessage('TraceAI: GitHub client not initialized');
      return null;
    }

    // Check cache first
    const config = vscode.workspace.getConfiguration('traceai');
    const cacheExpiration = config.get<number>('cacheExpiration', 3600);

    const cached = await cache.get(gistId);
    if (cached) {
      return cached;
    }

    try {
      const response = await this.octokit.gists.get({ gist_id: gistId });
      const gist = response.data;

      // Find the TraceAI artifact file (look for .json file)
      const files = gist.files;
      if (!files) {
        return null;
      }

      for (const filename of Object.keys(files)) {
        if (filename.endsWith('.json')) {
          const file = files[filename];
          if (file?.content) {
            try {
              const artifact = JSON.parse(file.content) as ConversationArtifact;

              // Validate it's a TraceAI artifact
              if (artifact.version && artifact.mappings && artifact.conversation) {
                await cache.set(gistId, artifact, cacheExpiration);
                return artifact;
              }
            } catch {
              // Not valid JSON or not a TraceAI artifact
              continue;
            }
          }
        }
      }

      return null;
    } catch (error) {
      if (error instanceof Error) {
        console.error(`TraceAI: Failed to fetch Gist ${gistId}:`, error.message);
      }
      return null;
    }
  }

  /**
   * Search for TraceAI Gists associated with a repository
   */
  async findGistsForRepo(repoFullName: string): Promise<string[]> {
    if (!this.octokit) {
      return [];
    }

    try {
      // List authenticated user's gists and filter by description/content
      const response = await this.octokit.gists.list({ per_page: 100 });
      const gistIds: string[] = [];

      for (const gist of response.data) {
        // Check if gist description mentions the repo
        if (gist.description?.includes(repoFullName) ||
            gist.description?.includes('traceai')) {
          gistIds.push(gist.id);
        }
      }

      return gistIds;
    } catch (error) {
      console.error('TraceAI: Failed to search for Gists:', error);
      return [];
    }
  }
}

// Singleton instance
export const githubClient = new GitHubClient();
