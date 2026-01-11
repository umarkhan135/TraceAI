/**
 * Unit tests for StorageService
 */

import { StorageService } from '../storageService';
import { ConversationArtifact } from '../../models';

describe('StorageService', () => {
  const mockArtifact: ConversationArtifact = {
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
      total_tokens: 1000
    },
    mappings: [],
    conversation: []
  };

  describe('getStorageStats', () => {
    it('should return zero stats for non-existent directory', () => {
      const stats = StorageService.getStorageStats('/tmp/non-existent-repo');

      expect(stats.total_artifacts).toBe(0);
      expect(stats.synced).toBe(0);
      expect(stats.unsynced).toBe(0);
      expect(stats.total_size_bytes).toBe(0);
    });
  });

  describe('loadArtifact', () => {
    it('should return null for non-existent artifact', () => {
      const artifact = StorageService.loadArtifact('/tmp/non-existent', 'session-123');
      expect(artifact).toBeNull();
    });
  });

  describe('listArtifacts', () => {
    it('should return empty array for non-existent directory', () => {
      const artifacts = StorageService.listArtifacts('/tmp/non-existent');
      expect(artifacts).toEqual([]);
    });
  });

  describe('getUnsyncedArtifacts', () => {
    it('should return empty array for non-existent directory', () => {
      const unsynced = StorageService.getUnsyncedArtifacts('/tmp/non-existent');
      expect(unsynced).toEqual([]);
    });
  });

  describe('loadConfig', () => {
    it('should return null for non-existent config', () => {
      const config = StorageService.loadConfig('/tmp/non-existent');
      expect(config).toBeNull();
    });
  });

  describe('getSyncQueue', () => {
    it('should return empty array for non-existent queue', () => {
      const queue = StorageService.getSyncQueue('/tmp/non-existent');
      expect(queue).toEqual([]);
    });
  });

  describe('cleanupOldArtifacts', () => {
    it('should return 0 for non-existent directory', () => {
      const deleted = StorageService.cleanupOldArtifacts('/tmp/non-existent', 50);
      expect(deleted).toBe(0);
    });
  });

  describe('storage operations', () => {
    // These tests would require actual file system operations
    // In a real test suite, you'd use a temporary directory
    // For now, we test the error paths

    it('should handle save errors gracefully', () => {
      // Invalid path should fail but not throw
      const result = StorageService.saveConfig('/invalid/\x00/path', {
        version: '2.0.0',
        gist_id: 'test',
        gist_url: 'https://gist.github.com/test',
        session_ids: ['test'],
        last_updated: new Date().toISOString(),
        artifact_version: '2.0.0'
      });
      expect(result).toBe(false);
    });
  });
});
