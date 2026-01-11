/**
 * Artifact Builder Service
 * Ports Python artifact building logic to TypeScript
 * Builds complete conversation artifacts from parsed data
 */

import * as path from 'path';
import {
  ConversationArtifact,
  ArtifactMetadata,
  ConversationMessage,
  CodeMapping,
  ConversationStats,
  ToolCall,
  ClaudeConversationEntry,
  ConversationMetadata
} from '../models';
import { ConversationParser } from './conversationParser';
import { MappingExtractor } from './mappingExtractor';

const ARTIFACT_VERSION = '2.0.0';

export class ArtifactBuilder {
  /**
   * Build a conversation artifact from a single conversation file
   */
  static async buildArtifact(
    convFilePath: string,
    repoPath: string,
    options: {
      prNumber?: number;
      branch?: string;
      correlateGit?: boolean;
    } = {}
  ): Promise<ConversationArtifact> {
    // Get metadata
    const metadata = ConversationParser.getConversationMetadata(convFilePath);

    // Extract code mappings
    let mappings: CodeMapping[] = MappingExtractor.extractCodeMappings(convFilePath, repoPath) as CodeMapping[];

    // Optionally correlate with git
    if (options.correlateGit !== false) {
      mappings = await MappingExtractor.correlateWithGitBlame(
        mappings,
        repoPath
      );
    }

    return this.buildArtifactFromData(
      convFilePath,
      repoPath,
      mappings,
      metadata,
      options.prNumber,
      options.branch
    );
  }

  /**
   * Build artifact from pre-processed data
   */
  static buildArtifactFromData(
    convFilePath: string,
    repoPath: string,
    mappings: CodeMapping[],
    metadata: ConversationMetadata,
    prNumber?: number,
    branch?: string
  ): ConversationArtifact {
    const messages = ConversationParser.parseConversationToArray(convFilePath);

    // Build conversation messages
    const conversation: ConversationMessage[] = [];
    for (let i = 0; i < messages.length; i++) {
      const entry = messages[i];

      if (entry.type === 'user') {
        conversation.push({
          index: i,
          role: 'user',
          content: ConversationParser.extractTextFromMessage(
            entry.message.content
          ),
          timestamp: entry.timestamp,
          tool_calls: []
        });
      } else if (entry.type === 'assistant') {
        const contentData = entry.message.content;
        const text = ConversationParser.extractTextFromMessage(contentData);
        const toolCallsData = ConversationParser.extractToolCallsFromMessage(contentData);

        const toolCalls: ToolCall[] = toolCallsData.map(tc => ({
          name: tc.name,
          id: tc.id,
          input: tc.input
        }));

        conversation.push({
          index: i,
          role: 'assistant',
          content: text,
          timestamp: entry.timestamp,
          tool_calls: toolCalls,
          usage: entry.message.usage
        });
      }
    }

    // Calculate statistics
    const stats = this.calculateStats(messages, mappings);

    // Calculate duration
    let durationSeconds: number | undefined;
    try {
      const startTime = new Date(metadata.start_time);
      const endTime = new Date(metadata.end_time);
      durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000;
    } catch (error) {
      durationSeconds = undefined;
    }

    // Build metadata
    const repoName = path.basename(repoPath);
    const artifactMetadata: ArtifactMetadata = {
      version: ARTIFACT_VERSION,
      session_id: metadata.session_id,
      pr_number: prNumber,
      repo_path: repoPath,
      repo_name: repoName,
      branch: branch,
      start_time: metadata.start_time,
      end_time: metadata.end_time,
      duration_seconds: durationSeconds,
      created_at: new Date().toISOString()
    };

    // Build artifact
    const artifact: ConversationArtifact = {
      conversation_id: `traceai-${metadata.session_id.substring(0, 8)}`,
      metadata: artifactMetadata,
      mappings: mappings,
      conversation: conversation,
      stats: stats
    };

    return artifact;
  }

  /**
   * Build merged artifact from multiple conversation files
   */
  static async buildMultiConversationArtifact(
    convFilePaths: string[],
    repoPath: string,
    options: {
      prNumber?: number;
      branch?: string;
      correlateGit?: boolean;
    } = {}
  ): Promise<ConversationArtifact> {
    if (convFilePaths.length === 0) {
      throw new Error('No conversation files provided');
    }

    // If only one conversation, use single artifact builder
    if (convFilePaths.length === 1) {
      return this.buildArtifact(convFilePaths[0], repoPath, options);
    }

    // Process all conversations
    const allMappings: CodeMapping[] = [];
    const allMessages: ClaudeConversationEntry[] = [];
    const sessionIds: string[] = [];
    let earliestStartTime: string | null = null;
    let latestEndTime: string | null = null;

    for (const convFile of convFilePaths) {
      const metadata = ConversationParser.getConversationMetadata(convFile);
      sessionIds.push(metadata.session_id);

      // Track time range
      if (!earliestStartTime || metadata.start_time < earliestStartTime) {
        earliestStartTime = metadata.start_time;
      }
      if (!latestEndTime || metadata.end_time > latestEndTime) {
        latestEndTime = metadata.end_time;
      }

      // Extract mappings
      let mappings = MappingExtractor.extractCodeMappings(convFile, repoPath);
      allMappings.push(...(mappings as CodeMapping[]));

      // Collect messages
      const messages = ConversationParser.parseConversationToArray(convFile);
      allMessages.push(...messages);
    }

    // Correlate all mappings with git
    const correlatedMappings = options.correlateGit !== false
      ? await MappingExtractor.correlateWithGitBlame(allMappings, repoPath)
      : allMappings as CodeMapping[];

    // Build conversation messages
    const conversation: ConversationMessage[] = [];
    for (let i = 0; i < allMessages.length; i++) {
      const entry = allMessages[i];

      if (entry.type === 'user') {
        conversation.push({
          index: i,
          role: 'user',
          content: ConversationParser.extractTextFromMessage(entry.message.content),
          timestamp: entry.timestamp,
          tool_calls: []
        });
      } else if (entry.type === 'assistant') {
        const contentData = entry.message.content;
        const text = ConversationParser.extractTextFromMessage(contentData);
        const toolCallsData = ConversationParser.extractToolCallsFromMessage(contentData);

        const toolCalls: ToolCall[] = toolCallsData.map(tc => ({
          name: tc.name,
          id: tc.id,
          input: tc.input
        }));

        conversation.push({
          index: i,
          role: 'assistant',
          content: text,
          timestamp: entry.timestamp,
          tool_calls: toolCalls,
          usage: entry.message.usage
        });
      }
    }

    // Calculate stats
    const stats = this.calculateStats(allMessages, correlatedMappings);

    // Calculate duration
    let durationSeconds: number | undefined;
    if (earliestStartTime && latestEndTime) {
      try {
        const startTime = new Date(earliestStartTime);
        const endTime = new Date(latestEndTime);
        durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000;
      } catch (error) {
        durationSeconds = undefined;
      }
    }

    // Build metadata
    const repoName = path.basename(repoPath);
    const artifactMetadata: ArtifactMetadata = {
      version: ARTIFACT_VERSION,
      session_id: sessionIds[0], // Primary session
      session_ids: sessionIds,
      pr_number: options.prNumber,
      repo_path: repoPath,
      repo_name: repoName,
      branch: options.branch,
      start_time: earliestStartTime || new Date().toISOString(),
      end_time: latestEndTime || new Date().toISOString(),
      duration_seconds: durationSeconds,
      created_at: new Date().toISOString()
    };

    // Build artifact
    const artifact: ConversationArtifact = {
      conversation_id: `traceai-merged-${sessionIds[0].substring(0, 8)}`,
      metadata: artifactMetadata,
      mappings: correlatedMappings,
      conversation: conversation,
      stats: stats
    };

    return artifact;
  }

  /**
   * Calculate statistics from messages and mappings
   */
  private static calculateStats(
    messages: ClaudeConversationEntry[],
    mappings: CodeMapping[]
  ): ConversationStats {
    const userMessages = messages.filter(m => m.type === 'user');
    const assistantMessages = messages.filter(m => m.type === 'assistant');

    // Calculate total tokens
    let totalTokens = 0;
    for (const msg of assistantMessages) {
      const usage = msg.message.usage;
      if (usage) {
        totalTokens += (usage.input_tokens || 0) + (usage.output_tokens || 0);
      }
    }

    // Calculate total lines changed
    let totalLinesChanged = 0;
    for (const mapping of mappings) {
      if (mapping.lines) {
        totalLinesChanged += mapping.lines[1] - mapping.lines[0] + 1;
      }
    }

    // Get unique files
    const uniqueFiles = new Set(mappings.map(m => m.file));

    return {
      total_messages: messages.length,
      total_prompts: userMessages.length,
      files_modified: uniqueFiles.size,
      total_tokens: totalTokens,
      total_lines_changed: totalLinesChanged
    };
  }

  /**
   * Generate a fallback summary for an artifact
   */
  static generateFallbackSummary(artifact: ConversationArtifact): string {
    const stats = artifact.stats;
    const metadata = artifact.metadata;

    const lines: string[] = [];

    lines.push('# Conversation Summary');
    lines.push('');
    lines.push(`This conversation involved ${stats.total_prompts} prompts and modified ${stats.files_modified} file(s).`);
    lines.push('');

    if (metadata.session_ids && metadata.session_ids.length > 1) {
      lines.push(`Merged from ${metadata.session_ids.length} conversation sessions.`);
      lines.push('');
    }

    if (artifact.mappings.length > 0) {
      lines.push('## Files Modified');
      lines.push('');

      const fileMap = MappingExtractor.aggregateMappingsByFile(artifact.mappings);
      for (const [file, fileMappings] of fileMap) {
        lines.push(`- **${file}**: ${fileMappings.length} change(s)`);
      }
      lines.push('');
    }

    if (stats.total_lines_changed && stats.total_lines_changed > 0) {
      lines.push(`Total lines changed: ${stats.total_lines_changed}`);
      lines.push('');
    }

    return lines.join('\n');
  }
}
