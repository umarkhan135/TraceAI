/**
 * Unit tests for ConversationParser
 */

import { ConversationParser } from '../conversationParser';

describe('ConversationParser', () => {
  describe('getProjectDirectoryName', () => {
    it('should convert path to directory name format', () => {
      // Access private method for testing via type assertion
      const getProjectDirectoryName = (ConversationParser as any).getProjectDirectoryName;

      expect(getProjectDirectoryName('C:/Users/test/repo')).toBe('-C:-Users-test-repo');
      expect(getProjectDirectoryName('/home/user/project')).toBe('-home-user-project');
      expect(getProjectDirectoryName('C:\\Users\\test\\repo')).toBe('-C:-Users-test-repo');
    });
  });

  describe('extractTextFromMessage', () => {
    it('should extract text from string content', () => {
      const content = 'Hello, world!';
      expect(ConversationParser.extractTextFromMessage(content)).toBe('Hello, world!');
    });

    it('should extract text from array content', () => {
      const content = [
        { type: 'text', text: 'Hello' },
        { type: 'text', text: 'World' }
      ];
      expect(ConversationParser.extractTextFromMessage(content)).toBe('Hello World');
    });

    it('should handle mixed content types', () => {
      const content = [
        { type: 'text', text: 'Hello' },
        'World',
        { type: 'other', data: 'ignored' }
      ];
      expect(ConversationParser.extractTextFromMessage(content)).toBe('Hello World');
    });

    it('should convert non-string, non-array to string', () => {
      expect(ConversationParser.extractTextFromMessage(123)).toBe('123');
      expect(ConversationParser.extractTextFromMessage(null)).toBe('null');
    });
  });

  describe('extractToolCallsFromMessage', () => {
    it('should extract tool calls from message content', () => {
      const content = [
        { type: 'text', text: 'Hello' },
        {
          type: 'tool_use',
          name: 'Edit',
          id: 'tool-123',
          input: { file_path: 'test.ts', old_string: 'foo', new_string: 'bar' }
        },
        {
          type: 'tool_use',
          name: 'Write',
          id: 'tool-456',
          input: { file_path: 'new.ts', content: 'hello' }
        }
      ];

      const toolCalls = ConversationParser.extractToolCallsFromMessage(content);
      expect(toolCalls).toHaveLength(2);
      expect(toolCalls[0].name).toBe('Edit');
      expect(toolCalls[0].id).toBe('tool-123');
      expect(toolCalls[1].name).toBe('Write');
      expect(toolCalls[1].id).toBe('tool-456');
    });

    it('should return empty array for non-array content', () => {
      expect(ConversationParser.extractToolCallsFromMessage('text')).toEqual([]);
      expect(ConversationParser.extractToolCallsFromMessage(null)).toEqual([]);
    });

    it('should return empty array when no tool_use items', () => {
      const content = [
        { type: 'text', text: 'Hello' },
        { type: 'other', data: 'test' }
      ];
      expect(ConversationParser.extractToolCallsFromMessage(content)).toEqual([]);
    });
  });

  describe('findUserPromptForMessage', () => {
    it('should find the most recent user message', () => {
      const messages = [
        {
          type: 'user' as const,
          message: { content: 'First prompt' },
          timestamp: '2024-01-01T00:00:00Z',
          sessionId: 'test'
        },
        {
          type: 'assistant' as const,
          message: { content: 'First response' },
          timestamp: '2024-01-01T00:01:00Z',
          sessionId: 'test'
        },
        {
          type: 'user' as const,
          message: { content: 'Second prompt' },
          timestamp: '2024-01-01T00:02:00Z',
          sessionId: 'test'
        },
        {
          type: 'assistant' as const,
          message: { content: 'Second response' },
          timestamp: '2024-01-01T00:03:00Z',
          sessionId: 'test'
        }
      ];

      const prompt = ConversationParser.findUserPromptForMessage(messages, 3);
      expect(prompt).not.toBeNull();
      expect(ConversationParser.extractTextFromMessage(prompt!.message.content)).toBe('Second prompt');
    });

    it('should skip tool result messages', () => {
      const messages = [
        {
          type: 'user' as const,
          message: { content: 'First prompt' },
          timestamp: '2024-01-01T00:00:00Z',
          sessionId: 'test'
        },
        {
          type: 'assistant' as const,
          message: { content: [{ type: 'tool_use', name: 'Read' }] },
          timestamp: '2024-01-01T00:01:00Z',
          sessionId: 'test'
        },
        {
          type: 'user' as const,
          message: { content: [{ tool_use_id: 'tool-123', content: 'result' }] },
          timestamp: '2024-01-01T00:02:00Z',
          sessionId: 'test'
        },
        {
          type: 'assistant' as const,
          message: { content: 'Response' },
          timestamp: '2024-01-01T00:03:00Z',
          sessionId: 'test'
        }
      ];

      const prompt = ConversationParser.findUserPromptForMessage(messages, 3);
      expect(prompt).not.toBeNull();
      expect(ConversationParser.extractTextFromMessage(prompt!.message.content)).toBe('First prompt');
    });

    it('should return null if no user message found', () => {
      const messages = [
        {
          type: 'assistant' as const,
          message: { content: 'Response' },
          timestamp: '2024-01-01T00:00:00Z',
          sessionId: 'test'
        }
      ];

      const prompt = ConversationParser.findUserPromptForMessage(messages, 0);
      expect(prompt).toBeNull();
    });
  });

  describe('isConversationRecent', () => {
    it('should return false for non-existent file', () => {
      expect(ConversationParser.isConversationRecent('/non/existent/file.jsonl')).toBe(false);
    });
  });
});
