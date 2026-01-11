/**
 * Unit tests for MappingExtractor
 */

import { MappingExtractor } from '../mappingExtractor';

describe('MappingExtractor', () => {
  describe('extractLineNumbersFromWrite', () => {
    it('should calculate line count from content', () => {
      // Access private method via type assertion
      const extractLineNumbersFromWrite = (MappingExtractor as any).extractLineNumbersFromWrite;

      const result1 = extractLineNumbersFromWrite({ content: 'line1\nline2\nline3' });
      expect(result1.lines).toEqual([1, 3]);
      expect(result1.confidence).toBe(0.95);

      const result2 = extractLineNumbersFromWrite({ content: 'single line' });
      expect(result2.lines).toEqual([1, 1]);
      expect(result2.confidence).toBe(0.95);

      const result3 = extractLineNumbersFromWrite({ content: '' });
      expect(result3.lines).toBeNull();
      expect(result3.confidence).toBe(0.5);
    });

    it('should handle content without trailing newline', () => {
      const extractLineNumbersFromWrite = (MappingExtractor as any).extractLineNumbersFromWrite;

      const result = extractLineNumbersFromWrite({ content: 'line1\nline2' });
      expect(result.lines).toEqual([1, 2]);
    });
  });

  describe('aggregateMappingsByFile', () => {
    it('should group mappings by file', () => {
      const mappings = [
        {
          file: 'file1.ts',
          lines: [1, 10] as [number, number],
          prompt_index: 0,
          prompt_preview: 'Edit file1',
          timestamp: '2024-01-01T00:00:00Z',
          tool: 'Edit' as const,
          tool_input: {},
          confidence: 0.9
        },
        {
          file: 'file1.ts',
          lines: [20, 30] as [number, number],
          prompt_index: 1,
          prompt_preview: 'Edit file1 again',
          timestamp: '2024-01-01T00:01:00Z',
          tool: 'Edit' as const,
          tool_input: {},
          confidence: 0.9
        },
        {
          file: 'file2.ts',
          lines: [1, 5] as [number, number],
          prompt_index: 2,
          prompt_preview: 'Edit file2',
          timestamp: '2024-01-01T00:02:00Z',
          tool: 'Edit' as const,
          tool_input: {},
          confidence: 0.9
        }
      ];

      const byFile = MappingExtractor.aggregateMappingsByFile(mappings);

      expect(byFile.size).toBe(2);
      expect(byFile.get('file1.ts')?.length).toBe(2);
      expect(byFile.get('file2.ts')?.length).toBe(1);
    });
  });

  describe('getMappingSummary', () => {
    it('should return correct summary for empty mappings', () => {
      const summary = MappingExtractor.getMappingSummary([]);

      expect(summary.total_mappings).toBe(0);
      expect(summary.unique_files).toBe(0);
      expect(summary.avg_confidence).toBe(0.0);
    });

    it('should calculate correct summary statistics', () => {
      const mappings = [
        {
          file: 'file1.ts',
          lines: [1, 10] as [number, number],
          prompt_index: 0,
          prompt_preview: 'Edit',
          timestamp: '2024-01-01T00:00:00Z',
          tool: 'Edit' as const,
          tool_input: {},
          confidence: 0.9
        },
        {
          file: 'file1.ts',
          lines: null,
          prompt_index: 1,
          prompt_preview: 'Write',
          timestamp: '2024-01-01T00:01:00Z',
          tool: 'Write' as const,
          tool_input: {},
          confidence: 0.8
        },
        {
          file: 'file2.ts',
          lines: [1, 5] as [number, number],
          prompt_index: 2,
          prompt_preview: 'Edit',
          timestamp: '2024-01-01T00:02:00Z',
          tool: 'Edit' as const,
          tool_input: {},
          confidence: 1.0
        }
      ];

      const summary = MappingExtractor.getMappingSummary(mappings);

      expect(summary.total_mappings).toBe(3);
      expect(summary.unique_files).toBe(2);
      expect(summary.avg_confidence).toBe(0.9);
      expect(summary.line_level_mappings).toBe(2);
      expect(summary.file_level_mappings).toBe(1);
      expect(summary.tools_used).toEqual({
        'Edit': 2,
        'Write': 1
      });
    });
  });

  describe('isGitRepository', () => {
    it('should return false for non-git directory', () => {
      const isGitRepository = (MappingExtractor as any).isGitRepository;
      expect(isGitRepository('/tmp/non-existent')).toBe(false);
    });
  });
});
