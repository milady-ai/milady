import { describe, it, expect, vi } from "vitest";
import { GammaApiClient } from "../utils/gammaApi";

function createMockRuntime(responseData: unknown, ok = true) {
  return {
    fetch: vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 429,
      json: vi.fn().mockResolvedValue(responseData),
      text: vi.fn().mockResolvedValue(JSON.stringify(responseData)),
      headers: new Headers({ "retry-after": "1" }),
    }),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  } as unknown as Parameters<typeof GammaApiClient.prototype.search>[0];
}

describe("GammaApiClient", () => {
  it("should search markets via /public-search", async () => {
    const mockResults = [{ id: 1, question: "Will BTC hit 100k?" }];
    const runtime = createMockRuntime(mockResults);
    const client = new GammaApiClient();

    const results = await client.search(runtime, "bitcoin");
    expect(results).toEqual(mockResults);
    expect(runtime.fetch).toHaveBeenCalledWith(
      expect.stringContaining("gamma-api.polymarket.com/public-search?q=bitcoin")
    );
  });

  it("should fetch events by tag", async () => {
    const mockEvents = [{ id: 1, title: "NBA Finals" }];
    const runtime = createMockRuntime(mockEvents);
    const client = new GammaApiClient();

    const results = await client.getEventsByTag(runtime, "sports", { limit: 10 });
    expect(results).toEqual(mockEvents);
  });

  it("should fetch tags list", async () => {
    const mockTags = [{ id: "1", label: "Sports" }];
    const runtime = createMockRuntime(mockTags);
    const client = new GammaApiClient();

    const results = await client.getTags(runtime);
    expect(results).toEqual(mockTags);
  });

  it("should fetch sports market types", async () => {
    const mockTypes = { marketTypes: ["moneyline", "spread", "total"] };
    const runtime = createMockRuntime(mockTypes);
    const client = new GammaApiClient();

    const results = await client.getSportsMarketTypes(runtime);
    expect(results).toEqual(mockTypes);
  });
});
