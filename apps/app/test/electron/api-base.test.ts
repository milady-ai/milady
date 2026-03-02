import { describe, expect, it } from "vitest";

import {
  normalizeApiBase,
  resolveExternalApiBase,
} from "../../electrobun/src/api-base";

describe("normalizeApiBase", () => {
  it("accepts http/https URLs and returns origin", () => {
    expect(normalizeApiBase("https://example.com/api/v1")).toBe(
      "https://example.com",
    );
    expect(normalizeApiBase("http://127.0.0.1:2138/path")).toBe(
      "http://127.0.0.1:2138",
    );
  });

  it("rejects non-http protocols", () => {
    expect(normalizeApiBase("ws://localhost:2138")).toBeNull();
    expect(normalizeApiBase("file:///tmp/test")).toBeNull();
  });
});

describe("resolveExternalApiBase", () => {
  it("prefers the test override when provided", () => {
    const resolved = resolveExternalApiBase({
      MILADY_API_BASE_URL: "https://api.prod.milady.ai",
      MILADY_ELECTRON_TEST_API_BASE: "http://127.0.0.1:9999",
    });

    expect(resolved.base).toBe("http://127.0.0.1:9999");
    expect(resolved.source).toBe("MILADY_ELECTRON_TEST_API_BASE");
    expect(resolved.invalidSources).toEqual([]);
  });

  it("skips invalid higher-priority values and keeps searching", () => {
    const resolved = resolveExternalApiBase({
      MILADY_API_BASE_URL: "not a url",
      MILADY_API_BASE: "http://127.0.0.1:31337",
    });

    expect(resolved.base).toBe("http://127.0.0.1:31337");
    expect(resolved.source).toBe("MILADY_API_BASE");
    expect(resolved.invalidSources).toEqual(["MILADY_API_BASE_URL"]);
  });
});
