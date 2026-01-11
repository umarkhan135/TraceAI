import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CacheEntry, ConversationArtifact } from './types';

interface CacheFile {
  version: string;
  entries: Record<string, CacheEntry<ConversationArtifact>>;
}

export class TraceAICache {
  private memoryCache: Map<string, CacheEntry<ConversationArtifact>> = new Map();

  private workspacePath: string | null = null;

  private static readonly CACHE_VERSION = '1.0';

  initialize(workspacePath: string): void {
    this.workspacePath = workspacePath;
    this.loadFromDisk();
  }

  private getCacheFilePath(): string | null {
    if (!this.workspacePath) {
      return null;
    }
    return path.join(this.workspacePath, '.vscode', 'traceai-cache.json');
  }

  private loadFromDisk(): void {
    const cachePath = this.getCacheFilePath();
    if (!cachePath) {
      return;
    }

    try {
      if (fs.existsSync(cachePath)) {
        const content = fs.readFileSync(cachePath, 'utf8');
        const cacheFile = JSON.parse(content) as CacheFile;

        if (cacheFile.version !== TraceAICache.CACHE_VERSION) {
          console.log('TraceAI: Cache version mismatch, clearing cache');
          this.clearDiskCache();
          return;
        }

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

  private saveToDisk(): void {
    const cachePath = this.getCacheFilePath();
    if (!cachePath) {
      return;
    }

    try {
      const vscodeDir = path.dirname(cachePath);
      if (!fs.existsSync(vscodeDir)) {
        fs.mkdirSync(vscodeDir, { recursive: true });
      }

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

  async get(key: string): Promise<ConversationArtifact | null> {
    const entry = this.memoryCache.get(key);

    if (!entry) {
      return null;
    }

    if (Date.now() >= entry.expiresAt) {
      this.memoryCache.delete(key);
      this.saveToDisk();
      return null;
    }

    return entry.data;
  }

  async set(key: string, artifact: ConversationArtifact, ttlSeconds: number): Promise<void> {
    const entry: CacheEntry<ConversationArtifact> = {
      data: artifact,
      timestamp: Date.now(),
      expiresAt: Date.now() + (ttlSeconds * 1000)
    };

    this.memoryCache.set(key, entry);

    this.saveToDisk();

    console.log(`TraceAI: Cached artifact ${key} (expires in ${ttlSeconds}s)`);
  }

  async clear(): Promise<void> {
    this.memoryCache.clear();
    this.clearDiskCache();
    console.log('TraceAI: Cache cleared');
  }

  async invalidate(key: string): Promise<void> {
    this.memoryCache.delete(key);
    this.saveToDisk();
    console.log(`TraceAI: Invalidated cache entry: ${key}`);
  }

  getStats(): { entries: number; keys: string[] } {
    return {
      entries: this.memoryCache.size,
      keys: Array.from(this.memoryCache.keys())
    };
  }
}

export const cache = new TraceAICache();
