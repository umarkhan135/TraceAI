/**
 * Unit tests for ArtifactBuilder
 */

import { ArtifactBuilder } from '../artifactBuilder';
import { ClaudeConversationEntry } from '../../models';

describe('ArtifactBuilder', () => {
  describe('calculateStats', () => {
    const calculateStats = (ArtifactBuilder as any).calculateStats;

    it('should calculate correct statistics', () => {
      const messages: ClaudeConversationEntry[] = [
        {
          type: 'user',
          message: { content: 'Test prompt' },
          timestamp: '2024-01-01T00:00:00Z',
          sessionId: 'test'
        },
        {
          type: 'assistant',
          message: {
            content: 'Response',
            usage: {
              input_tokens: 100,
              output_tokens: 50
            }
          },
          timestamp: '2024-01-01T00:01:00Z',
          sessionId: 'test'
        },
        {
          type: 'user',
          message: { content: 'Another prompt' },
          timestamp: '2024-01-01T00:02:00Z',
          sessionId: 'test'
        },
        {
          type: 'assistant',
          message: {
            content: 'Another response',
            usage: {
              input_tokens: 200,
              output_tokens: 100
            }
          },
          timestamp: '2024-01-01T00:03:00Z',
          sessionId: 'test'
        }
      ];

      const mappings = [
        {
          file: 'file1.ts',
          lines: [1, 10] as [number, number],
          prompt_index: 0,
          prompt_preview: 'Test',
          timestamp: '2024-01-01T00:00:00Z',
          tool: 'Edit' as const,
          tool_input: {},
          confidence: 0.9
        },
        {
          file: 'file2.ts',
          lines: [1, 5] as [number, number],
          prompt_index: 1,
          prompt_preview: 'Test',
          timestamp: '2024-01-01T00:01:00Z',
          tool: 'Write' as const,
          tool_input: {},
          confidence: 0.9
        }
      ];

      const stats = calculateStats(messages, mappings);

      expect(stats.total_messages).toBe(4);
      expect(stats.total_prompts).toBe(2);
      expect(stats.files_modified).toBe(2);
      expect(stats.total_tokens).toBe(450); // 100+50+200+100
      expect(stats.total_lines_changed).toBe(15); // (10-1+1) + (5-1+1)
    });

    it('should handle messages without usage data', () => {
      const messages: ClaudeConversationEntry[] = [
        {
          type: 'user',
          message: { content: 'Test' },
          timestamp: '2024-01-01T00:00:00Z',
          sessionId: 'test'
        },
        {
          type: 'assistant',
          message: { content: 'Response' },
          timestamp: '2024-01-01T00:01:00Z',
          sessionId: 'test'
        }
      ];

      const stats = calculateStats(messages, []);

      expect(stats.total_tokens).toBe(0);
      expect(stats.total_messages).toBe(2);
    });

    it('should handle mappings without line numbers', () => {
      const mappings = [
        {
          file: 'file1.ts',
          lines: null,
          prompt_index: 0,
          prompt_preview: 'Test',
          timestamp: '2024-01-01T00:00:00Z',
          tool: 'Edit' as const,
          tool_input: {},
          confidence: 0.5
        }
      ];

      const stats = calculateStats([], mappings);

      expect(stats.files_modified).toBe(1);
      expect(stats.total_lines_changed).toBe(0);
    });
  });

  describe('generateFallbackSummary', () => {
    it('should generate readable summary', () => {
      const artifact = {
        conversation_id: 'test-123',
        metadata: {
          version: '2.0.0',
          session_id: 'session-123',
          repo_path: '/test/repo',
          start_time: '2024-01-01T00:00:00Z',
          end_time: '2024-01-01T01:00:00Z',
          created_at: '2024-01-01T01:00:00Z'
        },
        stats: {
          total_messages: 10,
          total_prompts: 5,
          files_modified: 3,
          total_tokens: 1000,
          total_lines_changed: 50
        },
        mappings: [
          {
            file: 'file1.ts',
            lines: [1, 10] as [number, number],
            prompt_index: 0,
            prompt_preview: 'Add feature',
            timestamp: '2024-01-01T00:00:00Z',
            tool: 'Edit' as const,
            tool_input: {},
            confidence: 0.9
          },
          {
            file: 'file1.ts',
            lines: [20, 30] as [number, number],
            prompt_index: 1,
            prompt_preview: 'Fix bug',
            timestamp: '2024-01-01T00:30:00Z',
            tool: 'Edit' as const,
            tool_input: {},
            confidence: 0.9
          },
          {
            file: 'file2.ts',
            lines: [1, 5] as [number, number],
            prompt_index: 2,
            prompt_preview: 'Create new file',
            timestamp: '2024-01-01T00:45:00Z',
            tool: 'Write' as const,
            tool_input: {},
            confidence: 0.95
          }
        ],
        conversation: []
      };

      const summary = ArtifactBuilder.generateFallbackSummary(artifact);

      expect(summary).toContain('Conversation Summary');
      expect(summary).toContain('5 prompts');
      expect(summary).toContain('3 file(s)');
      expect(summary).toContain('Files Modified');
      expect(summary).toContain('file1.ts');
      expect(summary).toContain('file2.ts');
      expect(summary).toContain('50');
    });

    it('should handle artifact with no mappings', () => {
      const artifact = {
        conversation_id: 'test-123',
        metadata: {
          version: '2.0.0',
          session_id: 'session-123',
          repo_path: '/test/repo',
          start_time: '2024-01-01T00:00:00Z',
          end_time: '2024-01-01T01:00:00Z',
          created_at: '2024-01-01T01:00:00Z'
        },
        stats: {
          total_messages: 2,
          total_prompts: 1,
          files_modified: 0,
          total_tokens: 100
        },
        mappings: [],
        conversation: []
      };

      const summary = ArtifactBuilder.generateFallbackSummary(artifact);

      expect(summary).toContain('Conversation Summary');
      expect(summary).toContain('1 prompts');
      expect(summary).not.toContain('Files Modified');
    });

    it('should handle merged sessions', () => {
      const artifact = {
        conversation_id: 'test-merged',
        metadata: {
          version: '2.0.0',
          session_id: 'session-1',
          session_ids: ['session-1', 'session-2', 'session-3'],
          repo_path: '/test/repo',
          start_time: '2024-01-01T00:00:00Z',
          end_time: '2024-01-01T03:00:00Z',
          created_at: '2024-01-01T03:00:00Z'
        },
        stats: {
          total_messages: 30,
          total_prompts: 15,
          files_modified: 10,
          total_tokens: 5000
        },
        mappings: [],
        conversation: []
      };

      const summary = ArtifactBuilder.generateFallbackSummary(artifact);

      expect(summary).toContain('Merged from 3 conversation sessions');
    });
  });
});
