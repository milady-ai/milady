/**
 * Unit tests for twitter-verify.ts — whitelist eligibility via X/Twitter.
 *
 * Table-driven tests cover:
 * - Tweet URL parsing (valid/invalid formats)
 * - FxTwitter fetch timeout and HTTP failure handling
 * - Verification message generation
 * - Tweet content matching (address, hashtag, handle fallback)
 * - Whitelist storage (load, save, mark, check, list, overwrite, persistence)
 *
 * Addresses: [Integration DoD][MW-10] (#475)
 *
 * @see twitter-verify.ts
 */

import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────

// Mock @elizaos/core logger
vi.mock("@elizaos/core", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock resolveStateDir to use a temp dir
const MOCK_STATE_DIR = path.join(__dirname, "__test_state__");
vi.mock("../config/paths", () => ({
  resolveStateDir: () => MOCK_STATE_DIR,
}));

// ── Import after mocks ──────────────────────────────────────────────────

import {
  generateVerificationMessage,
  getVerifiedAddresses,
  isAddressWhitelisted,
  loadWhitelist,
  markAddressVerified,
  verifyTweet,
} from "./twitter-verify";

// ── Constants ────────────────────────────────────────────────────────────

const WALLET = "0x1234567890abcdef1234567890abcdef12345678";
const VALID_TWEET_URL = "https://x.com/miladyai/status/1234567890";

// ── Helpers ──────────────────────────────────────────────────────────────

function mockFetchResponse(params: {
  ok: boolean;
  status: number;
  body?: unknown;
  jsonReject?: boolean;
}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: params.ok,
    status: params.status,
    json: params.jsonReject
      ? vi.fn().mockRejectedValue(new Error("invalid json"))
      : vi.fn().mockResolvedValue(params.body),
  } as unknown as Response);

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// ── Setup / Teardown ─────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  if (!fs.existsSync(MOCK_STATE_DIR)) {
    fs.mkdirSync(MOCK_STATE_DIR, { recursive: true });
  }
  const wlPath = path.join(MOCK_STATE_DIR, "whitelist.json");
  if (fs.existsSync(wlPath)) fs.unlinkSync(wlPath);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  const wlPath = path.join(MOCK_STATE_DIR, "whitelist.json");
  if (fs.existsSync(wlPath)) fs.unlinkSync(wlPath);
  if (fs.existsSync(MOCK_STATE_DIR)) {
    try {
      fs.rmdirSync(MOCK_STATE_DIR);
    } catch {
      // not empty or not found — ignore
    }
  }
});

// ── Tests ────────────────────────────────────────────────────────────────

describe("twitter-verify (MW-10)", () => {
  // ===================================================================
  //  1. Verification Message Generation
  // ===================================================================

  describe("generateVerificationMessage", () => {
    it("includes agent name and shortened wallet address", () => {
      const msg = generateVerificationMessage(
        "TestAgent",
        "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      );
      expect(msg).toContain("TestAgent");
      expect(msg).toContain("0xd8dA...6045");
      expect(msg).toContain("#MiladyAgent");
    });

    it.each([
      [
        "Milady Agent",
        "0xABCDEF1234567890abcdef1234567890ABCDEF12",
        "0xABCD...EF12",
      ],
      [
        "Agent 🤖",
        "0x1111111111111111111111111111111111111111",
        "0x1111...1111",
      ],
      ["", "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "0xd8dA...6045"],
    ])("formats correctly for agent=%s addr=%s → expects %s", (agentName, addr, expectedShort) => {
      const msg = generateVerificationMessage(agentName, addr);
      expect(msg).toContain(expectedShort);
      expect(msg).toContain("#MiladyAgent");
    });
  });

  // ===================================================================
  //  2. Tweet URL Parsing (table-driven)
  // ===================================================================

  describe("verifyTweet — URL parsing", () => {
    it.each([
      "https://example.com/not-twitter",
      "https://x.com/miladyai/post/123",
      "https://twitter.com/miladyai/status/not-a-number",
      "not a url at all",
      "https://google.com/something",
      "https://twitter.com/user",
      "https://twitter.com/user/likes",
      "",
    ])("rejects invalid tweet URL format: %s", async (url) => {
      const result = await verifyTweet(url, WALLET);
      expect(result).toEqual({
        verified: false,
        error: "Invalid tweet URL. Use a twitter.com or x.com status URL.",
        handle: null,
      });
    });
  });

  // ===================================================================
  //  3. Fetch Failures (table-driven)
  // ===================================================================

  describe("verifyTweet — fetch failures", () => {
    it("handles fetch failures with a user-facing retry message", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("network timeout")),
      );
      const result = await verifyTweet(VALID_TWEET_URL, WALLET);
      expect(result).toEqual({
        verified: false,
        error: "Could not reach tweet verification service. Try again later.",
        handle: null,
      });
    });

    it("maps 404 responses to tweet-not-found guidance", async () => {
      mockFetchResponse({ ok: false, status: 404 });
      const result = await verifyTweet(VALID_TWEET_URL, WALLET);
      expect(result).toEqual({
        verified: false,
        error:
          "Tweet not found. Make sure the URL is correct and the tweet is public.",
        handle: null,
      });
    });

    it.each([
      [500, "HTTP 500"],
      [502, "HTTP 502"],
      [503, "HTTP 503"],
      [429, "HTTP 429"],
    ])("maps non-OK HTTP %d to status-aware error", async (status, expectedSubstring) => {
      mockFetchResponse({ ok: false, status });
      const result = await verifyTweet(VALID_TWEET_URL, WALLET);
      expect(result.verified).toBe(false);
      expect(result.error).toContain(expectedSubstring);
    });

    it("handles invalid JSON from verification service", async () => {
      mockFetchResponse({ ok: true, status: 200, jsonReject: true });
      const result = await verifyTweet(VALID_TWEET_URL, WALLET);
      expect(result).toEqual({
        verified: false,
        error: "Invalid response from verification service",
        handle: null,
      });
    });

    it("fails when tweet content is missing", async () => {
      mockFetchResponse({ ok: true, status: 200, body: { tweet: {} } });
      const result = await verifyTweet(VALID_TWEET_URL, WALLET);
      expect(result).toEqual({
        verified: false,
        error: "Could not read tweet content",
        handle: null,
      });
    });

    it("fails when tweet object is missing entirely", async () => {
      mockFetchResponse({ ok: true, status: 200, body: { code: 200 } });
      const result = await verifyTweet(VALID_TWEET_URL, WALLET);
      expect(result).toEqual({
        verified: false,
        error: "Could not read tweet content",
        handle: null,
      });
    });
  });

  // ===================================================================
  //  4. Message Content Matching (table-driven)
  // ===================================================================

  describe("verifyTweet — content matching", () => {
    it("fails when tweet is missing wallet address evidence", async () => {
      mockFetchResponse({
        ok: true,
        status: 200,
        body: {
          tweet: {
            text: "Verifying my Milady agent #MiladyAgent",
            author: { screen_name: "miladyai" },
          },
        },
      });
      const result = await verifyTweet(VALID_TWEET_URL, WALLET);
      expect(result).toEqual({
        verified: false,
        error:
          "Tweet does not contain your wallet address. Make sure you copied the full verification message.",
        handle: "miladyai",
      });
    });

    it("fails when hashtag is missing", async () => {
      mockFetchResponse({
        ok: true,
        status: 200,
        body: {
          tweet: {
            text: `Verifying wallet 0x1234...5678 without hashtag`,
            author: { screen_name: "miladyai" },
          },
        },
      });
      const result = await verifyTweet(VALID_TWEET_URL, WALLET);
      expect(result).toEqual({
        verified: false,
        error: "Tweet is missing #MiladyAgent hashtag.",
        handle: "miladyai",
      });
    });

    it("verifies tweets that include address evidence and hashtag", async () => {
      const fetchMock = mockFetchResponse({
        ok: true,
        status: 200,
        body: {
          tweet: {
            text: `Verifying my Milady agent "Milady" | 0x1234...5678 #MiladyAgent`,
            author: { screen_name: "miladyai" },
          },
        },
      });
      const result = await verifyTweet(VALID_TWEET_URL, WALLET);
      expect(result).toEqual({
        verified: true,
        error: null,
        handle: "miladyai",
      });
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.fxtwitter.com/miladyai/status/1234567890",
        expect.objectContaining({
          headers: { "User-Agent": "MiladyVerifier/1.0" },
        }),
      );
    });

    it("verifies tweet with full address prefix match", async () => {
      mockFetchResponse({
        ok: true,
        status: 200,
        body: {
          tweet: {
            text: `Verifying ${WALLET.slice(0, 10)} #MiladyAgent`,
            author: { screen_name: "holder" },
          },
        },
      });
      const result = await verifyTweet(VALID_TWEET_URL, WALLET);
      expect(result.verified).toBe(true);
    });

    it("falls back to URL screen name when author.screen_name is missing", async () => {
      mockFetchResponse({
        ok: true,
        status: 200,
        body: {
          tweet: {
            text: `0x1234...5678 #MiladyAgent`,
            author: {},
          },
        },
      });
      const result = await verifyTweet(VALID_TWEET_URL, WALLET);
      expect(result.verified).toBe(true);
      expect(result.handle).toBe("miladyai"); // from URL
    });
  });

  // ===================================================================
  //  5. Whitelist Storage (CRUD)
  // ===================================================================

  describe("whitelist storage", () => {
    it("returns empty whitelist when no file exists", () => {
      const wl = loadWhitelist();
      expect(wl.verified).toEqual({});
    });

    it("marks address as verified and persists to disk", () => {
      markAddressVerified(
        "0xABCD1234567890abcdef1234567890ABCDEF1234",
        "https://twitter.com/user/status/123",
        "testuser",
      );
      expect(
        isAddressWhitelisted("0xABCD1234567890abcdef1234567890ABCDEF1234"),
      ).toBe(true);

      // Confirm raw JSON on disk
      const raw = fs.readFileSync(
        path.join(MOCK_STATE_DIR, "whitelist.json"),
        "utf-8",
      );
      const data = JSON.parse(raw);
      expect(
        data.verified["0xabcd1234567890abcdef1234567890abcdef1234"],
      ).toBeDefined();
    });

    it("is case-insensitive for address lookup", () => {
      markAddressVerified("0xABCD", "url", "user");
      expect(isAddressWhitelisted("0xabcd")).toBe(true);
    });

    it("returns false for non-whitelisted address", () => {
      expect(
        isAddressWhitelisted("0x0000000000000000000000000000000000000000"),
      ).toBe(false);
    });

    it("lists all verified addresses", () => {
      markAddressVerified("0xAAAA", "url1", "user1");
      markAddressVerified("0xBBBB", "url2", "user2");
      const addrs = getVerifiedAddresses();
      expect(addrs).toHaveLength(2);
      expect(addrs).toContain("0xaaaa");
      expect(addrs).toContain("0xbbbb");
    });

    it("overwrites existing entry on re-verification", () => {
      markAddressVerified("0xABCD", "url1", "user1");
      markAddressVerified("0xabcd", "url2", "user2");
      const wl = loadWhitelist();
      expect(Object.keys(wl.verified)).toHaveLength(1);
      expect(wl.verified["0xabcd"].handle).toBe("user2");
      expect(wl.verified["0xabcd"].tweetUrl).toBe("url2");
    });

    it("stores timestamp on verification", () => {
      const before = new Date().toISOString();
      markAddressVerified("0xTIME", "url", "user");
      const wl = loadWhitelist();
      const ts = wl.verified["0xtime"].timestamp;
      expect(ts).toBeDefined();
      expect(new Date(ts).getTime()).toBeGreaterThanOrEqual(
        new Date(before).getTime(),
      );
    });
  });
});
