/**
 * GitHub Service
 * Ports Python github_client.py to TypeScript
 * Handles gist creation, updates, and fetching
 */

import { Octokit } from '@octokit/rest';
import { ConversationArtifact } from '../models';
import { AuthService } from './authService';
import * as vscode from 'vscode';

export interface GistFile {
  filename: string;
  content: string;
}

export interface GistResponse {
  id: string;
  html_url: string;
  url: string;
  description: string;
  public: boolean;
  created_at: string;
  updated_at: string;
}

export class GitHubService {
  private octokit: Octokit | null = null;
  private authenticated: boolean = false;

  /**
   * Initialize GitHub client with authentication
   */
  async initialize(): Promise<boolean> {
    try {
      const token = await AuthService.getAccessToken();
      if (!token) {
        console.log('TraceAI: No GitHub token available');
        return false;
      }

      this.octokit = new Octokit({ auth: token });
      this.authenticated = true;

      // Verify authentication by getting user
      await this.octokit.users.getAuthenticated();
      return true;
    } catch (error) {
      console.error('TraceAI: Failed to initialize GitHub client:', error);
      this.authenticated = false;
      return false;
    }
  }

  /**
   * Ensure client is initialized
   */
  private async ensureInitialized(): Promise<boolean> {
    if (this.authenticated && this.octokit) {
      return true;
    }
    return await this.initialize();
  }

  /**
   * Create a new gist from conversation artifact
   */
  async createGist(
    artifact: ConversationArtifact,
    options: {
      public?: boolean;
      description?: string;
    } = {}
  ): Promise<GistResponse | null> {
    if (!await this.ensureInitialized()) {
      throw new Error('GitHub authentication required');
    }

    const description = options.description ||
      `TraceAI Conversation - ${artifact.conversation_id}`;

    const files = this.prepareGistFiles(artifact);

    try {
      const response = await this.octokit!.gists.create({
        description,
        public: options.public || false,
        files
      });

      return {
        id: response.data.id || '',
        html_url: response.data.html_url || '',
        url: response.data.url || '',
        description: response.data.description || '',
        public: response.data.public || false,
        created_at: response.data.created_at || '',
        updated_at: response.data.updated_at || ''
      };
    } catch (error: any) {
      console.error('TraceAI: Failed to create gist:', error);
      throw new Error(`Failed to create gist: ${error.message}`);
    }
  }

  /**
   * Update an existing gist
   */
  async updateGist(
    gistId: string,
    artifact: ConversationArtifact
  ): Promise<GistResponse | null> {
    if (!await this.ensureInitialized()) {
      throw new Error('GitHub authentication required');
    }

    const files = this.prepareGistFiles(artifact);

    try {
      const response = await this.octokit!.gists.update({
        gist_id: gistId,
        files
      });

      return {
        id: response.data.id || '',
        html_url: response.data.html_url || '',
        url: response.data.url || '',
        description: response.data.description || '',
        public: response.data.public || false,
        created_at: response.data.created_at || '',
        updated_at: response.data.updated_at || ''
      };
    } catch (error: any) {
      console.error('TraceAI: Failed to update gist:', error);
      throw new Error(`Failed to update gist: ${error.message}`);
    }
  }

  /**
   * Create or update a gist (idempotent)
   */
  async createOrUpdateGist(
    artifact: ConversationArtifact,
    existingGistId?: string,
    options: {
      public?: boolean;
      description?: string;
    } = {}
  ): Promise<GistResponse | null> {
    if (existingGistId) {
      try {
        // Try to update existing gist
        return await this.updateGist(existingGistId, artifact);
      } catch (error) {
        console.warn('TraceAI: Failed to update gist, creating new one');
        // Fall through to create new gist
      }
    }

    // Create new gist
    return await this.createGist(artifact, options);
  }

  /**
   * Fetch a gist by ID
   */
  async fetchGist(gistId: string): Promise<ConversationArtifact | null> {
    if (!await this.ensureInitialized()) {
      // Try to fetch without authentication (public gists)
      return this.fetchPublicGist(gistId);
    }

    try {
      const response = await this.octokit!.gists.get({
        gist_id: gistId
      });

      // Look for conversation.json file
      const files = response.data.files;
      if (!files || !files['conversation.json']) {
        throw new Error('Gist does not contain conversation.json');
      }

      const content = files['conversation.json'].content;
      if (!content) {
        throw new Error('conversation.json is empty');
      }

      const artifact = JSON.parse(content) as ConversationArtifact;
      return artifact;
    } catch (error: any) {
      console.error(`TraceAI: Failed to fetch gist ${gistId}:`, error);
      return null;
    }
  }

  /**
   * Fetch a public gist without authentication
   */
  private async fetchPublicGist(gistId: string): Promise<ConversationArtifact | null> {
    try {
      const publicOctokit = new Octokit();
      const response = await publicOctokit.gists.get({
        gist_id: gistId
      });

      const files = response.data.files;
      if (!files || !files['conversation.json']) {
        throw new Error('Gist does not contain conversation.json');
      }

      const content = files['conversation.json'].content;
      if (!content) {
        throw new Error('conversation.json is empty');
      }

      const artifact = JSON.parse(content) as ConversationArtifact;
      return artifact;
    } catch (error: any) {
      console.error(`TraceAI: Failed to fetch public gist ${gistId}:`, error);
      return null;
    }
  }

  /**
   * Delete a gist
   */
  async deleteGist(gistId: string): Promise<boolean> {
    if (!await this.ensureInitialized()) {
      throw new Error('GitHub authentication required');
    }

    try {
      await this.octokit!.gists.delete({
        gist_id: gistId
      });
      return true;
    } catch (error: any) {
      console.error(`TraceAI: Failed to delete gist ${gistId}:`, error);
      return false;
    }
  }

  /**
   * Prepare gist files from artifact
   */
  private prepareGistFiles(artifact: ConversationArtifact): Record<string, { content: string }> {
    const files: Record<string, { content: string }> = {};

    // Main artifact as JSON
    files['conversation.json'] = {
      content: JSON.stringify(artifact, null, 2)
    };

    // Generate README.md with summary
    files['README.md'] = {
      content: this.generateMarkdownSummary(artifact)
    };

    return files;
  }

  /**
   * Generate markdown summary for gist README
   */
  private generateMarkdownSummary(artifact: ConversationArtifact): string {
    const lines: string[] = [];

    lines.push(`# TraceAI Conversation: ${artifact.conversation_id}`);
    lines.push('');
    lines.push('This conversation was captured by [TraceAI](https://github.com/yourteam/traceai),');
    lines.push('an LLM-native code provenance tool for AI-assisted development.');
    lines.push('');

    // Metadata section
    lines.push('## Metadata');
    lines.push('');
    lines.push(`- **Session ID**: \`${artifact.metadata.session_id}\``);
    if (artifact.metadata.session_ids && artifact.metadata.session_ids.length > 1) {
      lines.push(`- **Merged Sessions**: ${artifact.metadata.session_ids.length}`);
    }
    if (artifact.metadata.pr_number) {
      lines.push(`- **PR Number**: #${artifact.metadata.pr_number}`);
    }
    if (artifact.metadata.repo_name) {
      lines.push(`- **Repository**: ${artifact.metadata.repo_name}`);
    }
    if (artifact.metadata.branch) {
      lines.push(`- **Branch**: \`${artifact.metadata.branch}\``);
    }
    lines.push(`- **Started**: ${artifact.metadata.start_time}`);
    lines.push(`- **Ended**: ${artifact.metadata.end_time}`);
    if (artifact.metadata.duration_seconds) {
      const durationMins = (artifact.metadata.duration_seconds / 60).toFixed(1);
      lines.push(`- **Duration**: ${durationMins} minutes`);
    }
    lines.push('');

    // Statistics section
    lines.push('## Summary');
    lines.push('');
    lines.push(`- **Total Prompts**: ${artifact.stats.total_prompts}`);
    lines.push(`- **Files Modified**: ${artifact.stats.files_modified}`);
    lines.push(`- **Total Messages**: ${artifact.stats.total_messages}`);
    lines.push(`- **Tokens Used**: ${artifact.stats.total_tokens.toLocaleString()}`);
    if (artifact.stats.total_lines_changed) {
      lines.push(`- **Lines Changed**: ${artifact.stats.total_lines_changed}`);
    }
    lines.push('');

    // AI-generated summary if available
    if (artifact.summary) {
      lines.push('## AI Summary');
      lines.push('');
      lines.push(artifact.summary);
      lines.push('');
    }

    // Files modified section
    if (artifact.mappings.length > 0) {
      lines.push('## Files Modified');
      lines.push('');

      const fileMap = new Map<string, typeof artifact.mappings>();
      for (const mapping of artifact.mappings) {
        if (!fileMap.has(mapping.file)) {
          fileMap.set(mapping.file, []);
        }
        fileMap.get(mapping.file)!.push(mapping);
      }

      for (const [file, mappings] of fileMap) {
        lines.push(`### \`${file}\``);
        lines.push('');
        lines.push(`Modified ${mappings.length} time(s):`);
        lines.push('');

        for (let i = 0; i < Math.min(mappings.length, 5); i++) {
          const mapping = mappings[i];
          const promptText = mapping.prompt_preview.length > 80
            ? mapping.prompt_preview.substring(0, 80) + '...'
            : mapping.prompt_preview;
          lines.push(`${i + 1}. **${promptText}**`);
          lines.push(`   - Tool: \`${mapping.tool}\``);
          if (mapping.lines) {
            lines.push(`   - Lines: ${mapping.lines[0]}-${mapping.lines[1]}`);
          }
          lines.push(`   - Time: ${mapping.timestamp}`);
          lines.push('');
        }

        if (mappings.length > 5) {
          lines.push(`... and ${mappings.length - 5} more change(s)`);
          lines.push('');
        }
      }
    }

    // Footer
    lines.push('---');
    lines.push('');
    lines.push('*Generated by [TraceAI](https://github.com/yourteam/traceai) • ');
    lines.push(`Artifact Version ${artifact.metadata.version}*`);

    return lines.join('\n');
  }

  /**
   * Get rate limit information
   */
  async getRateLimit(): Promise<{
    remaining: number;
    limit: number;
    reset: Date;
  } | null> {
    if (!await this.ensureInitialized()) {
      return null;
    }

    try {
      const response = await this.octokit!.rateLimit.get();
      return {
        remaining: response.data.rate.remaining,
        limit: response.data.rate.limit,
        reset: new Date(response.data.rate.reset * 1000)
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.authenticated;
  }
}

// Export singleton instance
export const githubService = new GitHubService();
