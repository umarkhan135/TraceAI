import * as vscode from 'vscode';
import { Octokit } from '@octokit/rest';
import { ConversationArtifact } from './types';
import { cache } from './cache';

export class GitHubClient {
  private octokit: Octokit | null = null;

  initialize(token: string): void {
    if (token) {
      this.octokit = new Octokit({ auth: token });
    } else {
      this.octokit = new Octokit();
    }
  }

  async fetchGist(gistId: string): Promise<ConversationArtifact | null> {
    if (!this.octokit) {
      vscode.window.showWarningMessage('TraceAI: GitHub client not initialized');
      return null;
    }

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

  async fetchGistArtifact(gistId: string): Promise<ConversationArtifact | null> {
    return this.fetchGist(gistId);
  }

  async findGistsForRepo(repoFullName: string): Promise<string[]> {
    if (!this.octokit) {
      return [];
    }

    try {
      const response = await this.octokit.gists.list({ per_page: 100 });
      const gistIds: string[] = [];

      for (const gist of response.data) {
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

  async fetchAllGistsForRepo(repoFullName: string): Promise<ConversationArtifact | null> {
    if (!this.octokit) {
      console.warn('TraceAI: GitHub client not initialized');
      return null;
    }

    try {
      console.log(`TraceAI: Searching for all Gists for repo: ${repoFullName}`);

      const gistIds = await this.findGistsForRepo(repoFullName);

      if (gistIds.length === 0) {
        console.log('TraceAI: No Gists found for this repository');
        return null;
      }

      console.log(`TraceAI: Found ${gistIds.length} Gists for ${repoFullName}`);

      const artifacts: ConversationArtifact[] = [];
      for (const gistId of gistIds) {
        const artifact = await this.fetchGist(gistId);
        if (artifact) {
          artifacts.push(artifact);
        }
      }

      if (artifacts.length === 0) {
        console.log('TraceAI: No valid artifacts found');
        return null;
      }

      const merged = this.mergeArtifacts(artifacts);
      console.log(`TraceAI: Merged ${artifacts.length} artifacts with ${merged.mappings.length} total mappings`);

      return merged;
    } catch (error) {
      console.error('TraceAI: Failed to fetch all Gists:', error);
      return null;
    }
  }

  private mergeArtifacts(artifacts: ConversationArtifact[]): ConversationArtifact {
    if (artifacts.length === 0) {
      throw new Error('Cannot merge empty artifact list');
    }

    if (artifacts.length === 1) {
      return artifacts[0];
    }

    const sorted = artifacts.sort((a, b) => {
      const timeA = new Date(a.metadata.end_time).getTime();
      const timeB = new Date(b.metadata.end_time).getTime();
      return timeB - timeA;
    });

    const base = sorted[0];

    const allMappings: typeof base.mappings = [];
    const allConversations: typeof base.conversation = [];
    let totalPrompts = 0;
    let totalTokens = 0;
    let filesModified = new Set<string>();

    for (const artifact of artifacts) {
      for (const mapping of artifact.mappings) {
        allMappings.push({
          ...mapping,
          prompt_preview: `[PR #${artifact.metadata.pr_number || 'N/A'}] ${mapping.prompt_preview}`,
        });
      }

      const offset = allConversations.length;
      for (const msg of artifact.conversation) {
        allConversations.push({
          ...msg,
          index: msg.index + offset,
        });
      }

      totalPrompts += artifact.stats.total_prompts;
      totalTokens += artifact.stats.total_tokens;

      for (const mapping of artifact.mappings) {
        filesModified.add(mapping.file);
      }
    }

    const merged: ConversationArtifact = {
      version: base.version,
      conversation_id: `merged-${artifacts.length}-conversations`,
      metadata: {
        ...base.metadata,
        session_id: `merged-${artifacts.map(a => a.metadata.session_id).join('-')}`,
        pr_number: null,
        gist_url: null,
      },
      mappings: allMappings,
      conversation: allConversations,
      stats: {
        total_messages: allConversations.length,
        total_prompts: totalPrompts,
        files_modified: filesModified.size,
        total_tokens: totalTokens,
        ai_generated_lines: null,
      },
      summary: null,
    };

    return merged;
  }
}

export const githubClient = new GitHubClient();
