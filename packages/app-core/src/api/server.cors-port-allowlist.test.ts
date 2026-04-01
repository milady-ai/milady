import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildCorsAllowedPorts, isAllowedLocalOrigin } from "./server.js";

/* ── Env snapshot/restore ─────────────────────────────────────────── */

const ENV_KEYS = [
  "MILADY_API_PORT",
  "ELIZA_PORT",
  "MILADY_PORT",
  "MILADY_GATEWAY_PORT",
  "MILADY_HOME_PORT",
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
    if (saved[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = saved[k];
    }
  }
});

/* ── buildCorsAllowedPorts ────────────────────────────────────────── */

describe("buildCorsAllowedPorts", () => {
  it("returns default ports when no env vars set", () => {
    const ports = buildCorsAllowedPorts();
    // Core service ports
    expect(ports.has("31337")).toBe(true);
    expect(ports.has("2138")).toBe(true);
    expect(ports.has("18789")).toBe(true);
    expect(ports.has("2142")).toBe(true);
    // Electrobun renderer static server range (5174–5200)
    for (let p = 5174; p <= 5200; p++) {
      expect(ports.has(String(p))).toBe(true);
    }
  });

  it("respects MILADY_API_PORT override", () => {
    process.env.MILADY_API_PORT = "9000";
    const ports = buildCorsAllowedPorts();
    expect(ports.has("9000")).toBe(true);
    // 31337 is no longer the API port, but it may still be in the Electrobun range check —
    // the key assertion is that the override port is present
    expect(ports.has("31337")).toBe(false);
  });

  it("respects ELIZA_PORT as fallback for API port", () => {
    process.env.ELIZA_PORT = "8888";
    const ports = buildCorsAllowedPorts();
    expect(ports.has("8888")).toBe(true);
  });

  it("MILADY_API_PORT takes precedence over ELIZA_PORT", () => {
    process.env.MILADY_API_PORT = "9000";
    process.env.ELIZA_PORT = "8888";
    const ports = buildCorsAllowedPorts();
    expect(ports.has("9000")).toBe(true);
    expect(ports.has("8888")).toBe(false);
  });

  it("respects MILADY_PORT override", () => {
    process.env.MILADY_PORT = "3000";
    const ports = buildCorsAllowedPorts();
    expect(ports.has("3000")).toBe(true);
    expect(ports.has("2138")).toBe(false);
  });
});

/* ── isAllowedLocalOrigin ─────────────────────────────────────────── */

describe("isAllowedLocalOrigin", () => {
  const defaultPorts = new Set(["31337", "2138", "18789", "2142"]);

  it("allows localhost on configured port", () => {
    expect(isAllowedLocalOrigin("http://localhost:31337", defaultPorts)).toBe(
      true,
    );
  });

  it("allows 127.0.0.1 on configured port", () => {
    expect(isAllowedLocalOrigin("http://127.0.0.1:2138", defaultPorts)).toBe(
      true,
    );
  });

  it("allows [::1] on configured port", () => {
    expect(isAllowedLocalOrigin("http://[::1]:18789", defaultPorts)).toBe(true);
  });

  it("rejects localhost on non-configured port", () => {
    expect(isAllowedLocalOrigin("http://localhost:9999", defaultPorts)).toBe(
      false,
    );
  });

  it("rejects localhost on arbitrary high port", () => {
    expect(isAllowedLocalOrigin("http://localhost:45678", defaultPorts)).toBe(
      false,
    );
  });

  it("rejects non-localhost hosts even on configured port", () => {
    expect(
      isAllowedLocalOrigin("http://evil.example.com:31337", defaultPorts),
    ).toBe(false);
  });

  it("rejects non-http protocols", () => {
    expect(isAllowedLocalOrigin("ftp://localhost:31337", defaultPorts)).toBe(
      false,
    );
  });

  it("rejects malformed URLs", () => {
    expect(isAllowedLocalOrigin("not-a-url", defaultPorts)).toBe(false);
  });

  it("uses default port 80 for http without explicit port", () => {
    const ports = new Set(["80"]);
    expect(isAllowedLocalOrigin("http://localhost", ports)).toBe(true);
    expect(isAllowedLocalOrigin("http://localhost", defaultPorts)).toBe(false);
  });

  it("uses default port 443 for https without explicit port", () => {
    const ports = new Set(["443"]);
    expect(isAllowedLocalOrigin("https://localhost", ports)).toBe(true);
    expect(isAllowedLocalOrigin("https://localhost", defaultPorts)).toBe(false);
  });

  it("reads from env when no allowedPorts argument given", () => {
    process.env.MILADY_API_PORT = "5555";
    expect(isAllowedLocalOrigin("http://localhost:5555")).toBe(true);
    expect(isAllowedLocalOrigin("http://localhost:31337")).toBe(false);
  });
});
