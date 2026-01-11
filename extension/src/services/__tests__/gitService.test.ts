/**
 * Unit tests for GitService
 */

import { GitService } from '../gitService';
import * as fs from 'fs';
import * as path from 'path';

describe('GitService', () => {
  describe('isGitRepository', () => {
    it('should return false for non-git directory', () => {
      expect(GitService.isGitRepository('/tmp/non-existent')).toBe(false);
    });

    it('should return false for directory without .git', () => {
      expect(GitService.isGitRepository(__dirname)).toBe(false);
    });
  });

  describe('extractRepoFullName', () => {
    // Access private method via type assertion for testing
    const extractRepoFullName = (GitService as any).extractRepoFullName;

    it('should extract from HTTPS URL', () => {
      expect(extractRepoFullName('https://github.com/owner/repo.git')).toBe('owner/repo');
      expect(extractRepoFullName('https://github.com/owner/repo')).toBe('owner/repo');
    });

    it('should extract from SSH URL', () => {
      expect(extractRepoFullName('git@github.com:owner/repo.git')).toBe('owner/repo');
    });

    it('should return undefined for invalid URL', () => {
      expect(extractRepoFullName('not-a-url')).toBeUndefined();
      expect(extractRepoFullName('')).toBeUndefined();
      expect(extractRepoFullName(undefined)).toBeUndefined();
    });
  });

  describe('parseGitLogOutput', () => {
    const parseGitLogOutput = (GitService as any).parseGitLogOutput;

    it('should parse git log output correctly', () => {
      const output = `abc123
John Doe
2024-01-01T00:00:00Z
Initial commit
---FILES---
file1.ts
file2.ts
---END---
def456
Jane Smith
2024-01-02T00:00:00Z
Add feature
---FILES---
file3.ts
---END---`;

      const commits = parseGitLogOutput(output);

      expect(commits).toHaveLength(2);
      expect(commits[0].sha).toBe('abc123');
      expect(commits[0].author).toBe('John Doe');
      expect(commits[0].message).toBe('Initial commit');
      expect(commits[0].files).toEqual(['file1.ts', 'file2.ts']);

      expect(commits[1].sha).toBe('def456');
      expect(commits[1].message).toBe('Add feature');
      expect(commits[1].files).toEqual(['file3.ts']);
    });

    it('should handle empty output', () => {
      expect(parseGitLogOutput('')).toEqual([]);
    });

    it('should handle malformed output gracefully', () => {
      const output = 'abc123\nSome text\n---END---';
      const commits = parseGitLogOutput(output);
      expect(commits).toEqual([]);
    });
  });

  describe('getAllChangedFiles', () => {
    it('should collect all unique files from commits', () => {
      const commits = [
        {
          sha: 'abc',
          author: 'Test',
          timestamp: '2024-01-01',
          message: 'Test',
          files: ['file1.ts', 'file2.ts']
        },
        {
          sha: 'def',
          author: 'Test',
          timestamp: '2024-01-02',
          message: 'Test',
          files: ['file2.ts', 'file3.ts']
        }
      ];

      const files = GitService.getAllChangedFiles(commits);

      expect(files).toHaveLength(3);
      expect(files).toContain('file1.ts');
      expect(files).toContain('file2.ts');
      expect(files).toContain('file3.ts');
    });

    it('should return empty array for no commits', () => {
      expect(GitService.getAllChangedFiles([])).toEqual([]);
    });
  });

  describe('getGitDir', () => {
    it('should return null for non-git directory', () => {
      expect(GitService.getGitDir('/tmp/non-existent')).toBeNull();
    });
  });

  describe('hookExists', () => {
    it('should return false for non-existent hook', () => {
      expect(GitService.hookExists('/tmp/non-existent', 'pre-push')).toBe(false);
    });
  });

  describe('isTraceAIHook', () => {
    it('should return false for non-existent hook', () => {
      expect(GitService.isTraceAIHook('/tmp/non-existent', 'pre-push')).toBe(false);
    });
  });
});
