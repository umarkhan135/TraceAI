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
      console.log(`TraceAI: Attempting to fetch Gist ${gistId}...`);
      const response = await this.octokit.gists.get({ gist_id: gistId });
      const gist = response.data;
      console.log(`TraceAI: Gist fetched successfully, files:`, Object.keys(gist.files || {}));

      // Find the TraceAI artifact file (look for .json file)
      const files = gist.files;
      if (!files) {
        console.error('TraceAI: Gist has no files');
        return null;
      }

      for (const filename of Object.keys(files)) {
        console.log(`TraceAI: Checking file: ${filename}`);
        if (filename.endsWith('.json')) {
          const file = files[filename];
          if (file?.content) {
            try {
              const artifact = JSON.parse(file.content) as ConversationArtifact;

              // Validate it's a TraceAI artifact
              if (artifact.version && artifact.mappings && artifact.conversation) {
                console.log(`TraceAI: Valid artifact found in ${filename}`);
                await cache.set(gistId, artifact, cacheExpiration);
                return artifact;
              } else {
                console.warn(`TraceAI: ${filename} is not a valid TraceAI artifact`);
              }
            } catch (parseError) {
              console.error(`TraceAI: Failed to parse ${filename}:`, parseError);
              continue;
            }
          } else {
            console.warn(`TraceAI: ${filename} has no content`);
          }
        }
      }

      console.error('TraceAI: No valid artifact found in Gist');
      return null;
    } catch (error) {
      if (error instanceof Error) {
        console.error(`TraceAI: Failed to fetch Gist ${gistId}:`, error.message);
        console.error(`TraceAI: Full error:`, error);
      }
      return null;
    }
  }

  /**
   * Alias for fetchGist - fetches Gist artifact by ID
   */
  async fetchGistArtifact(gistId: string): Promise<ConversationArtifact | null> {
    return this.fetchGist(gistId);
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
