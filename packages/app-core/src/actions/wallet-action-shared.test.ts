import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildAuthHeaders,
  getWalletActionApiPort,
} from "./wallet-action-shared.js";

const ENV_KEYS = [
  "MILADY_API_PORT",
  "ELIZA_PORT",
  "MILADY_API_TOKEN",
  "ELIZA_API_TOKEN",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("getWalletActionApiPort", () => {
  it("returns the configured API port", () => {
    process.env.MILADY_API_PORT = "9000";
    expect(getWalletActionApiPort()).toBe("9000");
  });

  it("falls back to ELIZA_PORT", () => {
    process.env.ELIZA_PORT = "8888";
    expect(getWalletActionApiPort()).toBe("8888");
  });

  it("returns a string", () => {
    expect(typeof getWalletActionApiPort()).toBe("string");
  });
});

describe("buildAuthHeaders", () => {
  it("returns empty object when no token is set", () => {
    expect(buildAuthHeaders()).toEqual({});
  });

  it("returns Bearer header when MILADY_API_TOKEN is set", () => {
    process.env.MILADY_API_TOKEN = "tok_test";
    const headers = buildAuthHeaders();
    expect(headers.Authorization).toBe("Bearer tok_test");
  });

  it("does not double-prefix Bearer tokens", () => {
    process.env.MILADY_API_TOKEN = "Bearer tok_test";
    const headers = buildAuthHeaders();
    expect(headers.Authorization).toBe("Bearer tok_test");
    expect(headers.Authorization).not.toContain("Bearer Bearer");
  });
});
