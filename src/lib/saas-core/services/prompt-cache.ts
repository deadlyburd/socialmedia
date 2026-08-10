/**
 * PromptCache — aggressive caching layer for all AI generations.
 *
 * Caches prompt→response pairs using SHA-256 content hashing.
 * Reduces API costs 40-60% by avoiding redundant generation calls.
 *
 * CACHE TIERS:
 *   hot  — frequently reused (blog templates, image prompts, hashtag sets)
 *   warm — niche-specific content (industry blogs, product descriptions)
 *   cold — one-off generations (trend responses, unique captions)
 *
 * Each tier has its own TTL and eviction policy.
 */

import { createHash } from "crypto";

// ── Types ──────────────────────────────────────────────────────────────

export type CacheTier = "hot" | "warm" | "cold";

export interface CacheEntry<T = unknown> {
  key: string;
  tier: CacheTier;
  value: T;
  createdAt: number;
  lastAccessed: number;
  hitCount: number;
  /** Size estimate in bytes (for eviction). */
  sizeBytes: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  totalEntries: number;
  sizeBytes: number;
  byTier: Record<CacheTier, { entries: number; hits: number }>;
  savedApiCalls: number;
  estimatedSavingsUsd: number;
}

// ── TTL Configuration (milliseconds) ───────────────────────────────────

const TTL: Record<CacheTier, number> = {
  hot: 7 * 24 * 60 * 60 * 1000, // 7 days — blog templates, prompts
  warm: 24 * 60 * 60 * 1000, // 24 hours — niche content
  cold: 6 * 60 * 60 * 1000, // 6 hours — trends, captions
};

// ── Size limits per tier ───────────────────────────────────────────────

const MAX_SIZE: Record<CacheTier, number> = {
  hot: 50 * 1024 * 1024, // 50 MB
  warm: 100 * 1024 * 1024, // 100 MB
  cold: 50 * 1024 * 1024, // 50 MB
};

/** Estimated cost per API call that a cache hit avoids. */
const AVOIDED_COST_PER_CALL: Record<string, number> = {
  blog: 0.004, // ~$0.004 per blog generation (DeepSeek tokens)
  image_prompt: 0.001, // ~$0.001 per image prompt
  caption: 0.0005, // ~$0.0005 per social caption
  trend: 0.002, // ~$0.002 per trend analysis
  hashtags: 0.0003, // ~$0.0003 per hashtag set
  seo: 0.001, // ~$0.001 per SEO metadata
  carousel: 0.003, // ~$0.003 per carousel generation
  video_script: 0.002, // ~$0.002 per video script
  social_variant: 0.001, // ~$0.001 per social platform variant
};

// ── Service ────────────────────────────────────────────────────────────

export class PromptCache {
  private store = new Map<string, CacheEntry>();
  private tierSizes: Record<CacheTier, number> = { hot: 0, warm: 0, cold: 0 };
  private stats = {
    hits: 0,
    misses: 0,
    savedApiCalls: 0,
    estimatedSavingsUsd: 0,
  };

  // ── Public API ───────────────────────────────────────────────────────

  /**
   * Generate a cache key from a prompt template + variables.
   * Uses SHA-256 for collision resistance.
   */
  static key(
    template: string,
    variables: Record<string, unknown> = {},
  ): string {
    const payload = JSON.stringify({ template, variables });
    return createHash("sha256").update(payload).digest("hex").slice(0, 32);
  }

  /**
   * Try to get a cached value.
   * Returns undefined on miss (caller should generate + set).
   */
  get<T = unknown>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Check TTL expiry
    const age = Date.now() - entry.createdAt;
    if (age > TTL[entry.tier]) {
      this.evict(key);
      this.stats.misses++;
      return undefined;
    }

    // Update access metadata
    entry.lastAccessed = Date.now();
    entry.hitCount++;
    this.stats.hits++;
    this.stats.savedApiCalls++;

    return entry.value as T;
  }

  /**
   * Store a value in the cache.
   * Auto-classifies into a tier based on the contentType hint.
   */
  set<T = unknown>(
    key: string,
    value: T,
    contentType?: string,
    variables?: Record<string, unknown>,
  ): void {
    const tier = this.classifyTier(contentType, variables);
    const sizeBytes = this.estimateSize(value);

    // Evict if tier is full (LRU within tier)
    this.ensureCapacity(tier, sizeBytes);

    const entry: CacheEntry<T> = {
      key,
      tier,
      value,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      hitCount: 0,
      sizeBytes,
    };

    this.store.set(key, entry);
    this.tierSizes[tier] += sizeBytes;
  }

  /**
   * Get or compute — the primary pattern.
   *
   * const blog = await cache.memoize(
   *   PromptCache.key("blog:{topic}:{industry}", { topic, industry }),
   *   () => generateBlog(topic, industry),
   *   "blog"
   * );
   */
  async memoize<T>(
    key: string,
    compute: () => Promise<T>,
    contentType?: string,
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) {
      // Track cost savings
      if (contentType && AVOIDED_COST_PER_CALL[contentType]) {
        this.stats.estimatedSavingsUsd += AVOIDED_COST_PER_CALL[contentType]!;
      }
      return cached;
    }

    const value = await compute();
    this.set(key, value, contentType);
    return value;
  }

  /** Synchronous version for simple values. */
  memoizeSync<T>(key: string, compute: () => T, contentType?: string): T {
    const cached = this.get<T>(key);
    if (cached !== undefined) {
      if (contentType && AVOIDED_COST_PER_CALL[contentType]) {
        this.stats.estimatedSavingsUsd += AVOIDED_COST_PER_CALL[contentType]!;
      }
      return cached;
    }

    const value = compute();
    this.set(key, value, contentType);
    return value;
  }

  /** Check if a key exists and is still valid. */
  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    return Date.now() - entry.createdAt <= TTL[entry.tier];
  }

  /** Evict a specific key. */
  evict(key: string): void {
    const entry = this.store.get(key);
    if (entry) {
      this.tierSizes[entry.tier] -= entry.sizeBytes;
      this.store.delete(key);
    }
  }

  /** Evict all entries in a tier. */
  evictTier(tier: CacheTier): number {
    let count = 0;
    for (const [key, entry] of this.store) {
      if (entry.tier === tier) {
        this.tierSizes[tier] -= entry.sizeBytes;
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  /** Clear the entire cache. */
  clear(): void {
    this.store.clear();
    this.tierSizes = { hot: 0, warm: 0, cold: 0 };
  }

  /** Warm the hot tier with common templates. */
  warmup(
    templates: Array<{ key: string; value: unknown; contentType?: string }>,
  ): void {
    for (const t of templates) {
      this.set(t.key, t.value, t.contentType ?? "blog");
    }
  }

  /** Get cache statistics. */
  getStats(): CacheStats {
    const byTier: CacheStats["byTier"] = {
      hot: { entries: 0, hits: 0 },
      warm: { entries: 0, hits: 0 },
      cold: { entries: 0, hits: 0 },
    };

    let totalSize = 0;
    for (const [, entry] of this.store) {
      byTier[entry.tier].entries++;
      byTier[entry.tier].hits += entry.hitCount;
      totalSize += entry.sizeBytes;
    }

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      totalEntries: this.store.size,
      sizeBytes: totalSize,
      byTier,
      savedApiCalls: this.stats.savedApiCalls,
      estimatedSavingsUsd:
        Math.round(this.stats.estimatedSavingsUsd * 1000) / 1000,
    };
  }

  /** Hit rate as a percentage. */
  getHitRate(): number {
    const total = this.stats.hits + this.stats.misses;
    if (total === 0) return 0;
    return Math.round((this.stats.hits / total) * 100);
  }

  // ── Private helpers ──────────────────────────────────────────────────

  /** Classify content into a cache tier. */
  private classifyTier(
    contentType?: string,
    _variables?: Record<string, unknown>,
  ): CacheTier {
    // Hot: reused across many agencies — blog templates, image prompts, hashtag sets
    const hotTypes = [
      "blog_template",
      "image_prompt",
      "hashtags",
      "seo",
      "carousel_template",
      "video_script_template",
    ];
    // Warm: niche or industry-specific
    const warmTypes = [
      "blog",
      "carousel",
      "video_script",
      "social_variant",
      "email",
    ];
    // Cold: time-sensitive, trend-based, unique
    const coldTypes = [
      "trend",
      "caption",
      "hook",
      "trend_analysis",
      "competitor",
    ];

    if (!contentType) return "cold";
    if (hotTypes.some((t) => contentType.includes(t))) return "hot";
    if (warmTypes.some((t) => contentType.includes(t))) return "warm";
    if (coldTypes.some((t) => contentType.includes(t))) return "cold";
    return "warm";
  }

  /** Rough size estimate for a value. */
  private estimateSize(value: unknown): number {
    try {
      return Buffer.byteLength(JSON.stringify(value), "utf8");
    } catch {
      return 1024; // fallback: assume 1KB
    }
  }

  /** Evict LRU entries from a tier until there's room. */
  private ensureCapacity(tier: CacheTier, incomingSize: number): void {
    const currentSize = this.tierSizes[tier];
    const maxSize = MAX_SIZE[tier];

    if (currentSize + incomingSize <= maxSize) return;

    // Get all entries in this tier, sorted by last accessed (oldest first)
    const tierEntries = Array.from(this.store.entries())
      .filter(([, e]) => e.tier === tier)
      .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);

    let freed = 0;
    for (const [key, entry] of tierEntries) {
      if (currentSize - freed + incomingSize <= maxSize * 0.8) break; // evict to 80%
      freed += entry.sizeBytes;
      this.tierSizes[tier] -= entry.sizeBytes;
      this.store.delete(key);
    }
  }
}

/** Singleton instance for the application. */
export const promptCache = new PromptCache();
