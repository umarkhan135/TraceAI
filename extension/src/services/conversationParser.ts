/**
 * Conversation Parser Service
 * Ports Python parser.py functionality to TypeScript
 * Handles parsing Claude Code conversation JSONL files
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  ClaudeConversationEntry,
  ConversationMetadata,
  ConversationFileInfo,
  ToolCall
} from '../models';

export class ConversationParser {
  /**
   * Get the Claude projects directory for a given project path
   */
  private static getProjectDirectoryName(projectPath: string): string {
    // Normalize path separators to forward slashes and prepend hyphen
    const normalized = projectPath.replace(/\\/g, '/').replace(/\//g, '-');
    return normalized.startsWith('-') ? normalized : '-' + normalized;
  }

  /**
   * Find the Claude projects directory for a workspace
   */
  static findClaudeProjectsDir(projectPath: string): string {
    const projectDirName = this.getProjectDirectoryName(projectPath);
    const claudeProjectsDir = path.join(
      os.homedir(),
      '.claude',
      'projects',
      projectDirName
    );

    if (!fs.existsSync(claudeProjectsDir)) {
      throw new Error(
        `No Claude Code conversations found for ${projectPath}\n` +
        `Expected directory: ${claudeProjectsDir}`
      );
    }

    return claudeProjectsDir;
  }

  /**
   * Find a specific conversation file or the most recent one
   */
  static findConversationFile(
    projectPath: string,
    sessionId?: string
  ): string {
    const claudeProjectsDir = this.findClaudeProjectsDir(projectPath);

    if (sessionId) {
      const convFile = path.join(claudeProjectsDir, `${sessionId}.jsonl`);
      if (!fs.existsSync(convFile)) {
        throw new Error(`Session ${sessionId} not found in ${claudeProjectsDir}`);
      }
      return convFile;
    }

    // Find most recent conversation
    const files = fs.readdirSync(claudeProjectsDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => path.join(claudeProjectsDir, f));

    if (files.length === 0) {
      throw new Error(`No conversation files found in ${claudeProjectsDir}`);
    }

    // Sort by modification time, most recent first
    files.sort((a, b) => {
      const statA = fs.statSync(a);
      const statB = fs.statSync(b);
      return statB.mtimeMs - statA.mtimeMs;
    });

    return files[0];
  }

  /**
   * List all conversation files for a project
   */
  static listConversationFiles(projectPath: string): ConversationFileInfo[] {
    try {
      const claudeProjectsDir = this.findClaudeProjectsDir(projectPath);
      const files = fs.readdirSync(claudeProjectsDir)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => {
          const filePath = path.join(claudeProjectsDir, f);
          const stats = fs.statSync(filePath);
          return {
            session_id: path.basename(f, '.jsonl'),
            path: filePath,
            modified_time: stats.mtime.toISOString(),
            size_bytes: stats.size
          };
        });

      // Sort by modification time, most recent first
      files.sort((a, b) =>
        new Date(b.modified_time).getTime() - new Date(a.modified_time).getTime()
      );

      return files;
    } catch (error) {
      return [];
    }
  }

  /**
   * Parse a conversation JSONL file
   */
  static *parseConversation(jsonlPath: string): Generator<ClaudeConversationEntry> {
    if (!fs.existsSync(jsonlPath)) {
      throw new Error(`Conversation file not found: ${jsonlPath}`);
    }

    const content = fs.readFileSync(jsonlPath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const entry = JSON.parse(line) as ClaudeConversationEntry;
        yield entry;
      } catch (error) {
        console.warn(`Warning: Failed to parse line ${i + 1} in ${jsonlPath}:`, error);
        continue;
      }
    }
  }

  /**
   * Parse conversation into array
   */
  static parseConversationToArray(jsonlPath: string): ClaudeConversationEntry[] {
    return Array.from(this.parseConversation(jsonlPath));
  }

  /**
   * Get conversation metadata
   */
  static getConversationMetadata(jsonlPath: string): ConversationMetadata {
    const messages = this.parseConversationToArray(jsonlPath);

    if (messages.length === 0) {
      throw new Error(`No valid messages found in ${jsonlPath}`);
    }

    const sessionId = messages[0].sessionId || 'unknown';
    const startTime = messages[0].timestamp;
    const endTime = messages[messages.length - 1].timestamp;

    const userMessages = messages.filter(m => m.type === 'user').length;
    const assistantMessages = messages.filter(m => m.type === 'assistant').length;

    return {
      session_id: sessionId,
      start_time: startTime,
      end_time: endTime,
      total_messages: messages.length,
      user_messages: userMessages,
      assistant_messages: assistantMessages
    };
  }

  /**
   * Extract tool calls from message content
   */
  static extractToolCallsFromMessage(messageContent: any): ToolCall[] {
    if (!Array.isArray(messageContent)) {
      return [];
    }

    const toolCalls: ToolCall[] = [];
    for (const item of messageContent) {
      if (typeof item === 'object' && item !== null && item.type === 'tool_use') {
        toolCalls.push({
          name: item.name || '',
          id: item.id || '',
          input: item.input || {}
        });
      }
    }

    return toolCalls;
  }

  /**
   * Extract text from message content
   */
  static extractTextFromMessage(messageContent: any): string {
    if (typeof messageContent === 'string') {
      return messageContent;
    }

    if (Array.isArray(messageContent)) {
      const textParts: string[] = [];
      for (const item of messageContent) {
        if (typeof item === 'object' && item !== null && item.type === 'text') {
          textParts.push(item.text || '');
        } else if (typeof item === 'string') {
          textParts.push(item);
        }
      }
      return textParts.join(' ');
    }

    return String(messageContent);
  }

  /**
   * Find the user prompt that triggered an assistant message
   */
  static findUserPromptForMessage(
    messages: ClaudeConversationEntry[],
    currentIndex: number
  ): ClaudeConversationEntry | null {
    // Look backwards from current message
    for (let i = currentIndex - 1; i >= 0; i--) {
      if (messages[i].type === 'user') {
        const content = messages[i].message.content;

        // Check if this is a tool result message (should be skipped)
        if (Array.isArray(content)) {
          const isToolResult = content.every(
            item => typeof item === 'object' && item !== null && 'tool_use_id' in item
          );
          if (isToolResult) {
            continue;
          }
        }

        return messages[i];
      }
    }

    return null;
  }

  /**
   * Find multiple conversation files by time window
   */
  static findConversationsInTimeWindow(
    projectPath: string,
    startTime: Date,
    endTime: Date
  ): string[] {
    try {
      const allConversations = this.listConversationFiles(projectPath);

      return allConversations
        .filter(conv => {
          const modTime = new Date(conv.modified_time);
          return modTime >= startTime && modTime <= endTime;
        })
        .map(conv => conv.path);
    } catch (error) {
      return [];
    }
  }

  /**
   * Check if a conversation file was modified recently
   */
  static isConversationRecent(
    jsonlPath: string,
    hoursAgo: number = 24
  ): boolean {
    try {
      const stats = fs.statSync(jsonlPath);
      const modTime = stats.mtime.getTime();
      const cutoff = Date.now() - (hoursAgo * 60 * 60 * 1000);
      return modTime >= cutoff;
    } catch (error) {
      return false;
    }
  }
}
