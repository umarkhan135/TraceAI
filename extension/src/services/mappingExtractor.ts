/**
 * Mapping Extractor Service
 * Ports Python mapper.py functionality to TypeScript
 * Extracts code mappings from Claude Code conversations
 */

import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';
import {
  CodeMapping,
  ClaudeConversationEntry,
  ToolCall
} from '../models';
import { ConversationParser } from './conversationParser';

export class MappingExtractor {
  /**
   * Extract code mappings from a conversation file
   */
  static extractCodeMappings(
    jsonlPath: string,
    repoPath: string
  ): Partial<CodeMapping>[] {
    const mappings: Partial<CodeMapping>[] = [];
    const messages = ConversationParser.parseConversationToArray(jsonlPath);

    for (let i = 0; i < messages.length; i++) {
      const entry = messages[i];

      if (entry.type !== 'assistant') {
        continue;
      }

      const content = entry.message.content;
      if (!Array.isArray(content)) {
        continue;
      }

      const toolCalls = ConversationParser.extractToolCallsFromMessage(content);
      if (toolCalls.length === 0) {
        continue;
      }

      // Find the user message that triggered this assistant response
      const userMessage = ConversationParser.findUserPromptForMessage(messages, i);
      if (!userMessage) {
        continue;
      }

      const prompt = ConversationParser.extractTextFromMessage(
        userMessage.message.content
      );
      const promptTimestamp = userMessage.timestamp;

      // Find the index of the user message
      let userMessageIndex = 0;
      for (let idx = 0; idx < messages.length; idx++) {
        if (messages[idx] === userMessage) {
          userMessageIndex = idx;
          break;
        }
      }

      // Process each tool call
      for (const toolCall of toolCalls) {
        const toolName = toolCall.name;
        const toolInput = toolCall.input;

        // Only process Edit and Write tools
        if (toolName !== 'Edit' && toolName !== 'Write') {
          continue;
        }

        let filePath = toolInput.file_path as string;
        if (!filePath) {
          continue;
        }

        // Make path relative to repo
        try {
          const absolutePath = path.resolve(repoPath, filePath);
          filePath = path.relative(repoPath, absolutePath);
        } catch (error) {
          // Keep original path if relative conversion fails
        }

        // Extract line numbers and confidence
        let lines: [number, number] | null = null;
        let confidence = 0.9;

        if (toolName === 'Edit') {
          const result = this.extractLineNumbersFromEdit(
            toolInput,
            path.join(repoPath, filePath)
          );
          lines = result.lines;
          confidence = result.confidence;
        } else if (toolName === 'Write') {
          const result = this.extractLineNumbersFromWrite(toolInput);
          lines = result.lines;
          confidence = result.confidence;
        }

        const mapping: Partial<CodeMapping> = {
          file: filePath,
          lines: lines,
          prompt_index: userMessageIndex,
          prompt_preview: prompt.length > 100 ? prompt.substring(0, 100) + '...' : prompt,
          timestamp: entry.timestamp,
          tool: toolName as 'Edit' | 'Write',
          tool_input: toolInput,
          confidence: confidence
        };

        mappings.push(mapping);
      }
    }

    return mappings;
  }

  /**
   * Extract line numbers from Edit tool call
   */
  private static extractLineNumbersFromEdit(
    toolInput: Record<string, any>,
    filePath: string
  ): { lines: [number, number] | null; confidence: number } {
    const oldString = toolInput.old_string as string;

    if (!oldString || !fs.existsSync(filePath)) {
      return { lines: null, confidence: 0.5 };
    }

    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');

      if (!fileContent.includes(oldString)) {
        return { lines: null, confidence: 0.3 };
      }

      const index = fileContent.indexOf(oldString);
      const linesBefore = fileContent.substring(0, index).split('\n').length - 1;
      const linesInOld = oldString.split('\n').length - 1;

      const startLine = linesBefore + 1;
      const endLine = startLine + linesInOld;

      return { lines: [startLine, endLine], confidence: 0.95 };
    } catch (error) {
      console.warn(`Warning: Could not extract line numbers from ${filePath}:`, error);
      return { lines: null, confidence: 0.5 };
    }
  }

  /**
   * Extract line numbers from Write tool call
   */
  private static extractLineNumbersFromWrite(
    toolInput: Record<string, any>
  ): { lines: [number, number] | null; confidence: number } {
    const content = toolInput.content as string;

    if (!content) {
      return { lines: null, confidence: 0.5 };
    }

    let numLines = (content.match(/\n/g) || []).length;

    if (content && !content.endsWith('\n')) {
      numLines += 1;
    }

    if (numLines === 0) {
      numLines = 1;
    }

    return { lines: [1, numLines], confidence: 0.95 };
  }

  /**
   * Correlate mappings with git blame
   */
  static async correlateWithGitBlame(
    mappings: Partial<CodeMapping>[],
    repoPath: string,
    timeWindowSeconds: number = 300
  ): Promise<CodeMapping[]> {
    // Check if directory is a git repo
    if (!this.isGitRepository(repoPath)) {
      console.warn(`Warning: ${repoPath} is not a git repository, skipping git correlation`);
      return mappings as CodeMapping[];
    }

    const enhancedMappings: CodeMapping[] = [];

    for (const mapping of mappings) {
      const filePath = mapping.file!;
      const timestampStr = mapping.timestamp!;

      let mappingTime: Date;
      try {
        mappingTime = new Date(timestampStr);
      } catch (error) {
        enhancedMappings.push(mapping as CodeMapping);
        continue;
      }

      try {
        const absFilePath = path.join(repoPath, filePath);

        if (!fs.existsSync(absFilePath)) {
          enhancedMappings.push(mapping as CodeMapping);
          continue;
        }

        // Get recent commits for this file
        const commits = await this.getFileCommits(repoPath, filePath, 10);

        const matchingCommits = [];
        for (const commit of commits) {
          const commitTime = new Date(commit.timestamp);
          const timeDiff = Math.abs(
            (commitTime.getTime() - mappingTime.getTime()) / 1000
          );

          if (timeDiff <= timeWindowSeconds) {
            matchingCommits.push({
              sha: commit.sha.substring(0, 7),
              time: commit.timestamp,
              message: commit.message.split('\n')[0],
              time_diff_seconds: timeDiff
            });
          }
        }

        if (matchingCommits.length > 0) {
          mapping.confidence = Math.min((mapping.confidence || 0.9) + 0.05, 1.0);
          mapping.git_commits = matchingCommits;
        }
      } catch (error) {
        console.warn(`Warning: Could not correlate git blame for ${filePath}:`, error);
      }

      enhancedMappings.push(mapping as CodeMapping);
    }

    return enhancedMappings;
  }

  /**
   * Check if a directory is a git repository
   */
  private static isGitRepository(repoPath: string): boolean {
    const gitDir = path.join(repoPath, '.git');
    return fs.existsSync(gitDir);
  }

  /**
   * Get recent commits for a file
   */
  private static async getFileCommits(
    repoPath: string,
    filePath: string,
    maxCount: number = 10
  ): Promise<Array<{ sha: string; message: string; timestamp: string; author: string }>> {
    return new Promise((resolve, reject) => {
      const format = '%H%n%an%n%aI%n%s%n---END---';
      const command = `git log --format="${format}" -n ${maxCount} -- "${filePath}"`;

      child_process.exec(
        command,
        { cwd: repoPath },
        (error, stdout, stderr) => {
          if (error) {
            resolve([]);
            return;
          }

          const commits = [];
          const entries = stdout.split('---END---').filter(e => e.trim());

          for (const entry of entries) {
            const lines = entry.trim().split('\n');
            if (lines.length >= 4) {
              commits.push({
                sha: lines[0],
                author: lines[1],
                timestamp: lines[2],
                message: lines[3]
              });
            }
          }

          resolve(commits);
        }
      );
    });
  }

  /**
   * Aggregate mappings by file
   */
  static aggregateMappingsByFile(
    mappings: CodeMapping[]
  ): Map<string, CodeMapping[]> {
    const byFile = new Map<string, CodeMapping[]>();

    for (const mapping of mappings) {
      const filePath = mapping.file;
      if (!byFile.has(filePath)) {
        byFile.set(filePath, []);
      }
      byFile.get(filePath)!.push(mapping);
    }

    return byFile;
  }

  /**
   * Get mapping summary statistics
   */
  static getMappingSummary(mappings: CodeMapping[]): {
    total_mappings: number;
    unique_files: number;
    avg_confidence: number;
    line_level_mappings: number;
    file_level_mappings: number;
    tools_used: Record<string, number>;
  } {
    if (mappings.length === 0) {
      return {
        total_mappings: 0,
        unique_files: 0,
        avg_confidence: 0.0,
        line_level_mappings: 0,
        file_level_mappings: 0,
        tools_used: {}
      };
    }

    const uniqueFiles = new Set(mappings.map(m => m.file));
    const avgConfidence = mappings.reduce((sum, m) => sum + m.confidence, 0) / mappings.length;

    const toolsUsed: Record<string, number> = {};
    for (const mapping of mappings) {
      const tool = mapping.tool;
      toolsUsed[tool] = (toolsUsed[tool] || 0) + 1;
    }

    const lineLevelMappings = mappings.filter(m => m.lines !== null).length;
    const fileLevelMappings = mappings.length - lineLevelMappings;

    return {
      total_mappings: mappings.length,
      unique_files: uniqueFiles.size,
      avg_confidence: Math.round(avgConfidence * 100) / 100,
      line_level_mappings: lineLevelMappings,
      file_level_mappings: fileLevelMappings,
      tools_used: toolsUsed
    };
  }
}
