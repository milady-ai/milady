import type { IAgentRuntime } from "@elizaos/core";
import {
  GAMMA_API_URL,
  GAMMA_RATE_LIMIT_EVENTS,
  GAMMA_RATE_LIMIT_GENERAL,
  GAMMA_RATE_LIMIT_MARKETS,
  GAMMA_RATE_LIMIT_SEARCH,
  GAMMA_RATE_LIMIT_WINDOW_MS,
} from "../constants";
import { TokenBucketRateLimiter } from "./rateLimiter";

export class GammaApiClient {
  private readonly generalLimiter: TokenBucketRateLimiter;
  private readonly eventsLimiter: TokenBucketRateLimiter;
  private readonly marketsLimiter: TokenBucketRateLimiter;
  private readonly searchLimiter: TokenBucketRateLimiter;

  constructor() {
    const windowMs = GAMMA_RATE_LIMIT_WINDOW_MS;
    // Use 80% of limit as safety margin
    this.generalLimiter = new TokenBucketRateLimiter({
      maxTokens: Math.floor(GAMMA_RATE_LIMIT_GENERAL * 0.8),
      refillRate: Math.floor(GAMMA_RATE_LIMIT_GENERAL * 0.8),
      refillIntervalMs: windowMs,
    });
    this.eventsLimiter = new TokenBucketRateLimiter({
      maxTokens: Math.floor(GAMMA_RATE_LIMIT_EVENTS * 0.8),
      refillRate: Math.floor(GAMMA_RATE_LIMIT_EVENTS * 0.8),
      refillIntervalMs: windowMs,
    });
    this.marketsLimiter = new TokenBucketRateLimiter({
      maxTokens: Math.floor(GAMMA_RATE_LIMIT_MARKETS * 0.8),
      refillRate: Math.floor(GAMMA_RATE_LIMIT_MARKETS * 0.8),
      refillIntervalMs: windowMs,
    });
    this.searchLimiter = new TokenBucketRateLimiter({
      maxTokens: Math.floor(GAMMA_RATE_LIMIT_SEARCH * 0.8),
      refillRate: Math.floor(GAMMA_RATE_LIMIT_SEARCH * 0.8),
      refillIntervalMs: windowMs,
    });
  }

  private async rateLimitedFetch(
    runtime: IAgentRuntime,
    url: string,
    limiter: TokenBucketRateLimiter,
    retriesLeft = 3
  ): Promise<unknown> {
    await this.generalLimiter.waitForToken();
    await limiter.waitForToken();

    const doFetch = runtime.fetch ?? globalThis.fetch;
    const response = await doFetch(url);

    if (response.status === 429) {
      if (retriesLeft <= 0) {
        throw new Error(`Gamma API rate limited after max retries: ${url}`);
      }
      runtime.logger.warn(`[gammaApi] Rate limited on ${url}, retries left: ${retriesLeft}`);
      await new Promise((r) => setTimeout(r, 2000));
      return this.rateLimitedFetch(runtime, url, limiter, retriesLeft - 1);
    }

    if (!response.ok) {
      throw new Error(`Gamma API error ${response.status}: ${await response.text()}`);
    }

    return response.json();
  }

  async search(runtime: IAgentRuntime, query: string, limitPerType = 10): Promise<unknown> {
    const url = `${GAMMA_API_URL}/public-search?q=${encodeURIComponent(query)}&limit_per_type=${limitPerType}`;
    return this.rateLimitedFetch(runtime, url, this.searchLimiter);
  }

  async getEventsByTag(
    runtime: IAgentRuntime,
    tagId: string,
    options?: { limit?: number; order?: string; ascending?: boolean }
  ): Promise<unknown> {
    const params = new URLSearchParams({
      tag_id: tagId,
      closed: "false",
      active: "true",
      limit: String(options?.limit ?? 20),
      order: options?.order ?? "volume",
      ascending: String(options?.ascending ?? false),
    });
    const url = `${GAMMA_API_URL}/events?${params.toString()}`;
    return this.rateLimitedFetch(runtime, url, this.eventsLimiter);
  }

  async getTags(runtime: IAgentRuntime): Promise<unknown> {
    const url = `${GAMMA_API_URL}/tags`;
    return this.rateLimitedFetch(runtime, url, this.generalLimiter);
  }

  async getMarketById(runtime: IAgentRuntime, id: string): Promise<unknown> {
    const url = `${GAMMA_API_URL}/markets/${id}`;
    return this.rateLimitedFetch(runtime, url, this.marketsLimiter);
  }

  async getSportsMarketTypes(runtime: IAgentRuntime): Promise<unknown> {
    const url = `${GAMMA_API_URL}/sports/market-types`;
    return this.rateLimitedFetch(runtime, url, this.generalLimiter);
  }

  async getPublicProfile(runtime: IAgentRuntime, address: string): Promise<unknown> {
    const url = `${GAMMA_API_URL}/public-profile?address=${address}`;
    return this.rateLimitedFetch(runtime, url, this.generalLimiter);
  }
}
