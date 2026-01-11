/**
 * Unit tests for ConfigMigration
 */

import { ConfigMigration } from '../configMigration';
import { TraceAIConfig, LegacyTraceAIConfig } from '../../models';

describe('ConfigMigration', () => {
  describe('validateConfig', () => {
    it('should validate correct v2.0 config', () => {
      const config: TraceAIConfig = {
        version: '2.0.0',
        gist_id: 'abc123',
        gist_url: 'https://gist.github.com/user/abc123',
        session_ids: ['session-1', 'session-2'],
        last_updated: '2024-01-01T00:00:00Z',
        artifact_version: '2.0.0'
      };

      expect(ConfigMigration.validateConfig(config)).toBe(true);
    });

    it('should reject config without version', () => {
      const config = {
        gist_id: 'abc123',
        gist_url: 'https://gist.github.com/user/abc123',
        session_ids: ['session-1'],
        last_updated: '2024-01-01T00:00:00Z'
      };

      expect(ConfigMigration.validateConfig(config)).toBe(false);
    });

    it('should reject config without required fields', () => {
      const config = {
        version: '2.0.0',
        gist_id: 'abc123'
        // Missing other required fields
      };

      expect(ConfigMigration.validateConfig(config)).toBe(false);
    });

    it('should reject non-object config', () => {
      expect(ConfigMigration.validateConfig(null)).toBe(false);
      expect(ConfigMigration.validateConfig('string')).toBe(false);
      expect(ConfigMigration.validateConfig(123)).toBe(false);
      expect(ConfigMigration.validateConfig([])).toBe(false);
    });

    it('should accept config with optional fields', () => {
      const config: TraceAIConfig = {
        version: '2.0.0',
        gist_id: 'abc123',
        gist_url: 'https://gist.github.com/user/abc123',
        session_ids: ['session-1'],
        last_updated: '2024-01-01T00:00:00Z',
        artifact_version: '2.0.0',
        branch: 'feature/test',
        pr_number: 42,
        metadata: {
          repo_name: 'test-repo',
          total_sessions: 1,
          files_modified: 5
        }
      };

      expect(ConfigMigration.validateConfig(config)).toBe(true);
    });
  });

  describe('isLegacyConfig', () => {
    it('should identify legacy config correctly', () => {
      const legacyConfig: LegacyTraceAIConfig = {
        gist_id: 'abc123',
        gist_url: 'https://gist.github.com/user/abc123',
        session_id: 'single-session',
        last_updated: '2024-01-01T00:00:00Z'
      };

      expect(ConfigMigration.isLegacyConfig(legacyConfig)).toBe(true);
    });

    it('should reject v2.0 config as legacy', () => {
      const newConfig: TraceAIConfig = {
        version: '2.0.0',
        gist_id: 'abc123',
        gist_url: 'https://gist.github.com/user/abc123',
        session_ids: ['session-1'],
        last_updated: '2024-01-01T00:00:00Z',
        artifact_version: '2.0.0'
      };

      expect(ConfigMigration.isLegacyConfig(newConfig)).toBe(false);
    });

    it('should reject invalid objects', () => {
      expect(ConfigMigration.isLegacyConfig(null)).toBe(false);
      expect(ConfigMigration.isLegacyConfig('string')).toBe(false);
      expect(ConfigMigration.isLegacyConfig({})).toBe(false);
    });
  });

  describe('createNewConfig', () => {
    it('should create valid v2.0 config', () => {
      const config = ConfigMigration.createNewConfig({
        gistId: 'abc123',
        gistUrl: 'https://gist.github.com/user/abc123',
        sessionIds: ['session-1', 'session-2'],
        branch: 'main',
        prNumber: 42,
        repoName: 'test-repo',
        filesModified: 10
      });

      expect(config.version).toBe('2.0.0');
      expect(config.gist_id).toBe('abc123');
      expect(config.session_ids).toEqual(['session-1', 'session-2']);
      expect(config.branch).toBe('main');
      expect(config.pr_number).toBe(42);
      expect(config.metadata?.repo_name).toBe('test-repo');
      expect(config.metadata?.total_sessions).toBe(2);
      expect(config.metadata?.files_modified).toBe(10);
      expect(config.artifact_version).toBe('2.0.0');
    });

    it('should handle minimal config', () => {
      const config = ConfigMigration.createNewConfig({
        gistId: 'abc123',
        gistUrl: 'https://gist.github.com/user/abc123',
        sessionIds: ['session-1']
      });

      expect(config.version).toBe('2.0.0');
      expect(config.session_ids).toEqual(['session-1']);
      expect(config.branch).toBeUndefined();
      expect(config.pr_number).toBeUndefined();
      expect(config.metadata?.total_sessions).toBe(1);
    });
  });

  describe('mergeConfigs', () => {
    it('should merge session IDs correctly', () => {
      const existing: TraceAIConfig = {
        version: '2.0.0',
        gist_id: 'old-gist',
        gist_url: 'https://gist.github.com/user/old',
        session_ids: ['session-1', 'session-2'],
        last_updated: '2024-01-01T00:00:00Z',
        artifact_version: '2.0.0'
      };

      const merged = ConfigMigration.mergeConfigs(
        existing,
        ['session-2', 'session-3'],
        'new-gist',
        'https://gist.github.com/user/new'
      );

      expect(merged.gist_id).toBe('new-gist');
      expect(merged.gist_url).toBe('https://gist.github.com/user/new');
      expect(merged.session_ids).toEqual(['session-1', 'session-2', 'session-3']);
      expect(merged.metadata?.total_sessions).toBe(3);
    });

    it('should deduplicate session IDs', () => {
      const existing: TraceAIConfig = {
        version: '2.0.0',
        gist_id: 'gist',
        gist_url: 'https://gist.github.com/user/gist',
        session_ids: ['session-1', 'session-2'],
        last_updated: '2024-01-01T00:00:00Z',
        artifact_version: '2.0.0'
      };

      const merged = ConfigMigration.mergeConfigs(
        existing,
        ['session-1', 'session-2']
      );

      expect(merged.session_ids).toEqual(['session-1', 'session-2']);
      expect(merged.metadata?.total_sessions).toBe(2);
    });

    it('should preserve existing gist if not provided', () => {
      const existing: TraceAIConfig = {
        version: '2.0.0',
        gist_id: 'old-gist',
        gist_url: 'https://gist.github.com/user/old',
        session_ids: ['session-1'],
        last_updated: '2024-01-01T00:00:00Z',
        artifact_version: '2.0.0',
        metadata: {
          repo_name: 'test-repo'
        }
      };

      const merged = ConfigMigration.mergeConfigs(existing, ['session-2']);

      expect(merged.gist_id).toBe('old-gist');
      expect(merged.gist_url).toBe('https://gist.github.com/user/old');
      expect(merged.metadata?.repo_name).toBe('test-repo');
    });
  });

  describe('needsMigration', () => {
    it('should return false for non-existent file', () => {
      expect(ConfigMigration.needsMigration('/tmp/non-existent.json')).toBe(false);
    });
  });

  describe('getConfigVersion', () => {
    it('should return null for non-existent file', () => {
      expect(ConfigMigration.getConfigVersion('/tmp/non-existent.json')).toBeNull();
    });
  });

  describe('getMigrationSummary', () => {
    it('should provide summary for non-existent config', () => {
      const summary = ConfigMigration.getMigrationSummary('/tmp/non-existent.json');

      expect(summary.needs_migration).toBe(false);
      expect(summary.current_version).toBeNull();
      expect(summary.target_version).toBe('2.0.0');
      expect(summary.is_valid).toBe(false);
      expect(summary.backup_exists).toBe(false);
    });
  });
});
