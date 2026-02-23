import { describe, expect, it } from "bun:test";
import { loadMoltbookConfig } from "../config.ts";

describe("plugin-moltbook config", () => {
  it("loads defaults", () => {
    const loaded = loadMoltbookConfig({});

    expect(loaded.apiBaseUrl).toBe("https://www.moltbook.com/api/v1");
    expect(loaded.timeoutMs).toBe(30_000);
    expect(loaded.maxResponseChars).toBe(50_000);
    expect(loaded.credentialsPath).toContain("moltbook");
  });

  it("accepts canonical www host", () => {
    const loaded = loadMoltbookConfig({
      MOLTBOOK_API_BASE_URL: "https://www.moltbook.com/api/v1/",
    });

    expect(loaded.apiBaseUrl).toBe("https://www.moltbook.com/api/v1");
  });

  it("rejects non-www host", () => {
    expect(() =>
      loadMoltbookConfig({
        MOLTBOOK_API_BASE_URL: "https://moltbook.com/api/v1",
      }),
    ).toThrow("www.moltbook.com");
  });

  it("rejects non-api-v1 paths", () => {
    expect(() =>
      loadMoltbookConfig({
        MOLTBOOK_API_BASE_URL: "https://www.moltbook.com/api/v2",
      }),
    ).toThrow("/api/v1");
  });

  it("rejects insecure protocol", () => {
    expect(() =>
      loadMoltbookConfig({
        MOLTBOOK_API_BASE_URL: "http://www.moltbook.com/api/v1",
      }),
    ).toThrow("https");
  });
});
