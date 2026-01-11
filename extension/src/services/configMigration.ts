/**
 * Config Migration Service
 * Handles migration from legacy Python config format to new TypeScript format
 */

import * as fs from 'fs';
import * as path from 'path';
import { TraceAIConfig, LegacyTraceAIConfig } from '../models';

const CURRENT_CONFIG_VERSION = '2.0.0';
const CURRENT_ARTIFACT_VERSION = '2.0.0';

export class ConfigMigration {
  /**
   * Check if config needs migration
   */
  static needsMigration(configPath: string): boolean {
    if (!fs.existsSync(configPath)) {
      return false;
    }

    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content);

      // Check if it's a legacy config (no version field)
      return !config.version || config.version !== CURRENT_CONFIG_VERSION;
    } catch (error) {
      return false;
    }
  }

  /**
   * Migrate legacy config to new format
   */
  static migrateConfig(configPath: string): TraceAIConfig | null {
    if (!fs.existsSync(configPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      const legacyConfig = JSON.parse(content) as LegacyTraceAIConfig;

      // Create new config from legacy
      const newConfig: TraceAIConfig = {
        version: CURRENT_CONFIG_VERSION,
        gist_id: legacyConfig.gist_id,
        gist_url: legacyConfig.gist_url,
        branch: legacyConfig.branch,
        pr_number: legacyConfig.pr_number,
        session_ids: [legacyConfig.session_id], // Convert single session to array
        last_updated: legacyConfig.last_updated,
        artifact_version: CURRENT_ARTIFACT_VERSION,
        metadata: {
          total_sessions: 1
        }
      };

      return newConfig;
    } catch (error) {
      console.error('TraceAI: Failed to migrate config:', error);
      return null;
    }
  }

  /**
   * Migrate config file in place
   */
  static migrateConfigFile(configPath: string): boolean {
    if (!this.needsMigration(configPath)) {
      console.log('TraceAI: Config is already up to date');
      return true;
    }

    console.log('TraceAI: Migrating config to new format...');

    // Create backup
    const backupPath = configPath + '.backup';
    try {
      fs.copyFileSync(configPath, backupPath);
      console.log(`TraceAI: Created backup at ${backupPath}`);
    } catch (error) {
      console.error('TraceAI: Failed to create backup:', error);
      return false;
    }

    // Migrate
    const newConfig = this.migrateConfig(configPath);
    if (!newConfig) {
      console.error('TraceAI: Migration failed');
      return false;
    }

    // Write new config
    try {
      fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf-8');
      console.log('TraceAI: Config migrated successfully');
      return true;
    } catch (error) {
      console.error('TraceAI: Failed to write migrated config:', error);

      // Restore backup
      try {
        fs.copyFileSync(backupPath, configPath);
        console.log('TraceAI: Restored from backup');
      } catch (restoreError) {
        console.error('TraceAI: Failed to restore backup:', restoreError);
      }

      return false;
    }
  }

  /**
   * Auto-migrate config for a repository
   */
  static autoMigrateRepo(repoPath: string): boolean {
    const configPath = path.join(repoPath, '.traceai', 'config.json');

    if (!fs.existsSync(configPath)) {
      console.log('TraceAI: No config found, nothing to migrate');
      return true;
    }

    return this.migrateConfigFile(configPath);
  }

  /**
   * Batch migrate all repositories in a directory
   */
  static batchMigrate(parentDir: string): {
    total: number;
    migrated: number;
    failed: number;
    skipped: number;
  } {
    const results = {
      total: 0,
      migrated: 0,
      failed: 0,
      skipped: 0
    };

    if (!fs.existsSync(parentDir)) {
      return results;
    }

    const entries = fs.readdirSync(parentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const repoPath = path.join(parentDir, entry.name);
      const configPath = path.join(repoPath, '.traceai', 'config.json');

      if (!fs.existsSync(configPath)) {
        continue;
      }

      results.total++;

      if (!this.needsMigration(configPath)) {
        results.skipped++;
        continue;
      }

      const success = this.migrateConfigFile(configPath);
      if (success) {
        results.migrated++;
      } else {
        results.failed++;
      }
    }

    return results;
  }

  /**
   * Validate config format
   */
  static validateConfig(config: any): config is TraceAIConfig {
    return (
      typeof config === 'object' &&
      config !== null &&
      typeof config.version === 'string' &&
      typeof config.gist_id === 'string' &&
      typeof config.gist_url === 'string' &&
      Array.isArray(config.session_ids) &&
      typeof config.last_updated === 'string' &&
      typeof config.artifact_version === 'string'
    );
  }

  /**
   * Get config version
   */
  static getConfigVersion(configPath: string): string | null {
    if (!fs.existsSync(configPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content);
      return config.version || '1.0.0'; // Legacy configs are 1.0.0
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if config is legacy format
   */
  static isLegacyConfig(config: any): config is LegacyTraceAIConfig {
    return (
      typeof config === 'object' &&
      config !== null &&
      !config.version && // No version field = legacy
      typeof config.session_id === 'string' && // Has single session_id
      !Array.isArray(config.session_ids) // No session_ids array
    );
  }

  /**
   * Create new config from scratch
   */
  static createNewConfig(options: {
    gistId: string;
    gistUrl: string;
    branch?: string;
    prNumber?: number;
    sessionIds: string[];
    repoName?: string;
    filesModified?: number;
  }): TraceAIConfig {
    return {
      version: CURRENT_CONFIG_VERSION,
      gist_id: options.gistId,
      gist_url: options.gistUrl,
      branch: options.branch,
      pr_number: options.prNumber,
      session_ids: options.sessionIds,
      last_updated: new Date().toISOString(),
      artifact_version: CURRENT_ARTIFACT_VERSION,
      metadata: {
        repo_name: options.repoName,
        total_sessions: options.sessionIds.length,
        files_modified: options.filesModified
      }
    };
  }

  /**
   * Merge configs (for multi-session scenarios)
   */
  static mergeConfigs(
    existing: TraceAIConfig,
    newSessionIds: string[],
    newGistId?: string,
    newGistUrl?: string
  ): TraceAIConfig {
    // Combine session IDs (deduplicate)
    const allSessionIds = [
      ...new Set([...existing.session_ids, ...newSessionIds])
    ];

    return {
      ...existing,
      gist_id: newGistId || existing.gist_id,
      gist_url: newGistUrl || existing.gist_url,
      session_ids: allSessionIds,
      last_updated: new Date().toISOString(),
      metadata: {
        ...existing.metadata,
        total_sessions: allSessionIds.length
      }
    };
  }

  /**
   * Get migration summary for a config
   */
  static getMigrationSummary(configPath: string): {
    needs_migration: boolean;
    current_version: string | null;
    target_version: string;
    is_valid: boolean;
    backup_exists: boolean;
  } {
    const currentVersion = this.getConfigVersion(configPath);
    const backupPath = configPath + '.backup';

    let isValid = false;
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(content);
        isValid = this.validateConfig(config) || this.isLegacyConfig(config);
      } catch (error) {
        isValid = false;
      }
    }

    return {
      needs_migration: this.needsMigration(configPath),
      current_version: currentVersion,
      target_version: CURRENT_CONFIG_VERSION,
      is_valid: isValid,
      backup_exists: fs.existsSync(backupPath)
    };
  }
}
