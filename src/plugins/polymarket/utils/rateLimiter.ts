export interface RateLimiterConfig {
  /** Maximum tokens in the bucket */
  maxTokens: number;
  /** Tokens to add per refill */
  refillRate: number;
  /** Milliseconds between refills */
  refillIntervalMs: number;
}

export class TokenBucketRateLimiter {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;
  private readonly refillIntervalMs: number;
  private lastRefillTime: number;

  constructor(config: RateLimiterConfig) {
    this.maxTokens = config.maxTokens;
    this.refillRate = config.refillRate;
    this.refillIntervalMs = config.refillIntervalMs;
    this.tokens = config.maxTokens;
    this.lastRefillTime = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillTime;
    const tokensToAdd = Math.floor(elapsed / this.refillIntervalMs) * this.refillRate;
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefillTime = now;
    }
  }

  tryConsume(count = 1): boolean {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }

  async waitForToken(maxRetries = 10): Promise<void> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (this.tryConsume()) return;
      const elapsed = Date.now() - this.lastRefillTime;
      const waitMs = Math.max(10, this.refillIntervalMs - elapsed);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    // Force consume after max retries — caller should handle degraded state
    this.refill();
    this.tokens = Math.max(0, this.tokens - 1);
  }

  get availableTokens(): number {
    this.refill();
    return this.tokens;
  }
}
