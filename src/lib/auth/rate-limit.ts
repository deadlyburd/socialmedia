/**
 * Token-bucket rate limiter — in-memory, no external deps.
 *
 * Each "key" (IP, email, or route) gets a bucket of tokens.
 * Each request consumes one token. Bucket refills over time.
 * When bucket is empty, requests are rejected with 429.
 */

const RATE_LIMIT_AUTH_MAX = parseInt(process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS ?? "10", 10);
const RATE_LIMIT_AUTH_WINDOW_MS = parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_SEC ?? "900", 10) * 1000;

interface Bucket {
  tokens: number;
  lastRefill: number;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private maxTokens: number;
  private refillMs: number;
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(maxTokens: number, windowMs: number) {
    this.maxTokens = maxTokens;
    this.refillMs = windowMs;
    // Cleanup expired buckets every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 300_000);
  }

  /** Try to consume a token. Returns true if allowed, false if rate limited. */
  consume(key: string): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: this.maxTokens - 1, lastRefill: now };
      this.buckets.set(key, bucket);
      return true;
    }

    // Refill tokens based on elapsed time
    const elapsed = now - bucket.lastRefill;
    const refillAmount = Math.floor(elapsed / this.refillMs) * this.maxTokens;
    if (refillAmount > 0) {
      bucket.tokens = Math.min(this.maxTokens, bucket.tokens + refillAmount);
      bucket.lastRefill = now;
    }

    if (bucket.tokens > 0) {
      bucket.tokens--;
      return true;
    }

    return false;
  }

  /** Get remaining tokens (for headers). */
  remaining(key: string): number {
    return this.buckets.get(key)?.tokens ?? this.maxTokens;
  }

  /** Remove expired buckets to prevent memory leaks. */
  private cleanup(): void {
    const cutoff = Date.now() - this.refillMs * 2;
    for (const [key, bucket] of this.buckets) {
      if (bucket.lastRefill < cutoff) {
        this.buckets.delete(key);
      }
    }
  }

  /** Stop cleanup timer. */
  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}

/** Pre-configured rate limiter for auth endpoints. */
export const authRateLimiter = new RateLimiter(
  RATE_LIMIT_AUTH_MAX,
  RATE_LIMIT_AUTH_WINDOW_MS,
);

/**
 * Rate limit by IP + action combination.
 * Example key: "192.168.1.1:login"
 */
export function rateLimitByIP(
  ip: string,
  action: string,
): { allowed: boolean; remaining: number } {
  const key = `${ip}:${action}`;
  const allowed = authRateLimiter.consume(key);
  return { allowed, remaining: authRateLimiter.remaining(key) };
}

/**
 * Rate limit by email (for password attempts).
 */
export function rateLimitByEmail(
  email: string,
  action: string,
): { allowed: boolean; remaining: number } {
  const key = `${email.toLowerCase()}:${action}`;
  const allowed = authRateLimiter.consume(key);
  return { allowed, remaining: authRateLimiter.remaining(key) };
}
