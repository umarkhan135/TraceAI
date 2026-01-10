/**
 * ============================================================================
 * TRACEAI CACHE
 * ============================================================================
 *
 * Provides caching for GitHub Gist artifacts to mitigate API rate limits.
 * Per CLAUDE.md: "Aggressive caching in workspace .vscode/ directory"
 *
 * CACHE STRATEGY:
 * 1. Memory cache (fastest) - Lost on extension reload
 * 2. File cache in .vscode/traceai-cache.json (persistent) - Survives reloads
 *
 * The cache respects the traceai.cacheExpiration setting (default: 3600 seconds)
 *
 * NOTE: This cache is for GitHub Gist data. Local artifacts (.traceai/artifacts.json)
 * use the localLoader.ts which has its own file-watcher-based invalidation.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CacheEntry, ConversationArtifact } from './types';

/**
 * Cache file structure stored in .vscode/traceai-cache.json
 */
interface CacheFile {
  version: string;
  entries: Record<string, CacheEntry<ConversationArtifact>>;
}

/**
 * TraceAICache provides two-tier caching:
 * - Tier 1: In-memory Map (fast, volatile)
 * - Tier 2: .vscode/traceai-cache.json (slower, persistent)
 */
export class TraceAICache {
  // In-memory cache for fast access
  private memoryCache: Map<string, CacheEntry<ConversationArtifact>> = new Map();

  // Path to the workspace's .vscode directory
  private workspacePath: string | null = null;

  // Cache file version for future migrations
  private static readonly CACHE_VERSION = '1.0';

  /**
   * Initialize the cache with the workspace path
   * Call this when the extension activates
   */
  initialize(workspacePath: string): void {
    this.workspacePath = workspacePath;
    this.loadFromDisk();
  }

  /**
   * Get the path to the cache file
   */
  private getCacheFilePath(): string | null {
    if (!this.workspacePath) {
      return null;
    }
    return path.join(this.workspacePath, '.vscode', 'traceai-cache.json');
  }

  /**
   * Load cache from .vscode/traceai-cache.json
   */
  private loadFromDisk(): void {
    const cachePath = this.getCacheFilePath();
    if (!cachePath) {
      return;
    }

    try {
      if (fs.existsSync(cachePath)) {
        const content = fs.readFileSync(cachePath, 'utf8');
        const cacheFile = JSON.parse(content) as CacheFile;

        // Validate version
        if (cacheFile.version !== TraceAICache.CACHE_VERSION) {
          console.log('TraceAI: Cache version mismatch, clearing cache');
          this.clearDiskCache();
          return;
        }

        // Load entries into memory cache, filtering expired ones
        const now = Date.now();
        for (const [key, entry] of Object.entries(cacheFile.entries)) {
          if (now < entry.expiresAt) {
            this.memoryCache.set(key, entry);
          }
        }

        console.log(`TraceAI: Loaded ${this.memoryCache.size} cached entries from disk`);
      }
    } catch (error) {
      console.error('TraceAI: Failed to load cache from disk:', error);
    }
  }

  /**
   * Save cache to .vscode/traceai-cache.json
   */
  private saveToDisk(): void {
    const cachePath = this.getCacheFilePath();
    if (!cachePath) {
      return;
    }

    try {
      // Ensure .vscode directory exists
      const vscodeDir = path.dirname(cachePath);
      if (!fs.existsSync(vscodeDir)) {
        fs.mkdirSync(vscodeDir, { recursive: true });
      }

      // Filter out expired entries before saving
      const now = Date.now();
      const entries: Record<string, CacheEntry<ConversationArtifact>> = {};

      for (const [key, entry] of this.memoryCache.entries()) {
        if (now < entry.expiresAt) {
          entries[key] = entry;
        }
      }

      const cacheFile: CacheFile = {
        version: TraceAICache.CACHE_VERSION,
        entries
      };

      fs.writeFileSync(cachePath, JSON.stringify(cacheFile, null, 2), 'utf8');
    } catch (error) {
      console.error('TraceAI: Failed to save cache to disk:', error);
    }
  }

  /**
   * Clear the disk cache file
   */
  private clearDiskCache(): void {
    const cachePath = this.getCacheFilePath();
    if (cachePath && fs.existsSync(cachePath)) {
      try {
        fs.unlinkSync(cachePath);
      } catch (error) {
        console.error('TraceAI: Failed to clear disk cache:', error);
      }
    }
  }

  /**
   * Get cached artifact by key (usually Gist ID)
   *
   * @param key - The cache key (e.g., Gist ID)
   * @returns The cached artifact or null if not found/expired
   */
  async get(key: string): Promise<ConversationArtifact | null> {
    const entry = this.memoryCache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() >= entry.expiresAt) {
      // Remove expired entry
      this.memoryCache.delete(key);
      this.saveToDisk();
      return null;
    }

    return entry.data;
  }

  /**
   * Store artifact in cache
   *
   * @param key - The cache key (e.g., Gist ID)
   * @param artifact - The artifact to cache
   * @param ttlSeconds - Time-to-live in seconds (from traceai.cacheExpiration setting)
   */
  async set(key: string, artifact: ConversationArtifact, ttlSeconds: number): Promise<void> {
    const entry: CacheEntry<ConversationArtifact> = {
      data: artifact,
      timestamp: Date.now(),
      expiresAt: Date.now() + (ttlSeconds * 1000)
    };

    // Store in memory
    this.memoryCache.set(key, entry);

    // Persist to disk
    this.saveToDisk();

    console.log(`TraceAI: Cached artifact ${key} (expires in ${ttlSeconds}s)`);
  }

  /**
   * Clear all cached data (memory and disk)
   */
  async clear(): Promise<void> {
    this.memoryCache.clear();
    this.clearDiskCache();
    console.log('TraceAI: Cache cleared');
  }

  /**
   * Remove specific entry from cache
   *
   * @param key - The cache key to invalidate
   */
  async invalidate(key: string): Promise<void> {
    this.memoryCache.delete(key);
    this.saveToDisk();
    console.log(`TraceAI: Invalidated cache entry: ${key}`);
  }

  /**
   * Get cache statistics for debugging
   */
  getStats(): { entries: number; keys: string[] } {
    return {
      entries: this.memoryCache.size,
      keys: Array.from(this.memoryCache.keys())
    };
  }
}

// Singleton instance
export const cache = new TraceAICache();
