import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mockFetch = vi.hoisted(() => vi.fn());

vi.stubGlobal("fetch", mockFetch);

import { MiladyClient } from "@miladyai/app-core/api/client";

const TEST_BASE_URL = "http://localhost:3000";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("QA: Onboarding", () => {
  let client: MiladyClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new MiladyClient(TEST_BASE_URL);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("ONB-001: submitOnboarding with valid data succeeds", () => {
    it("should submit onboarding data without throwing", async () => {
      const validPayload = {
        provider: "openai",
        apiKey: "sk-test-valid-key-1234567890abcdef",
        modelName: "gpt-4",
      };

      // submitOnboarding returns void on success
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

      await expect(
        client.submitOnboarding(validPayload as any),
      ).resolves.not.toThrow();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/api/onboarding");
      expect(options.method).toBe("POST");
    });
  });

  describe("ONB-005: submitOnboarding with invalid API key rejects", () => {
    it("should reject when the server returns 400", async () => {
      mockFetch.mockResolvedValueOnce(
        errorResponse("Invalid API key format", 400),
      );

      await expect(
        client.submitOnboarding({ provider: "openai", apiKey: "invalid" } as any),
      ).rejects.toThrow();
    });

    it("should reject when the API key is empty", async () => {
      mockFetch.mockResolvedValueOnce(
        errorResponse("API key is required", 400),
      );

      await expect(
        client.submitOnboarding({ provider: "openai", apiKey: "" } as any),
      ).rejects.toThrow();
    });
  });

  describe("ONB-006: submitOnboarding with empty provider rejects", () => {
    it("should reject when provider is empty and server returns 400", async () => {
      mockFetch.mockResolvedValueOnce(
        errorResponse("Provider is required", 400),
      );

      await expect(
        client.submitOnboarding({ provider: "", apiKey: "sk-test" } as any),
      ).rejects.toThrow();
    });
  });

  describe("ONB-009: getOnboardingStatus returns status", () => {
    it("should return { complete: false } when onboarding not done", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ complete: false }),
      );

      const status = await client.getOnboardingStatus();
      expect(status.complete).toBe(false);
    });

    it("should return { complete: true } when onboarding is done", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ complete: true }),
      );

      const status = await client.getOnboardingStatus();
      expect(status.complete).toBe(true);
    });
  });

  describe("STR-001: getStatus throws after timeout", () => {
    it("should surface a timeout error when the server does not respond", async () => {
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error("AbortError: The operation was aborted")), 50);
          }),
      );

      await expect(client.getStatus()).rejects.toThrow();
    });
  });

  describe("STR-002: getStatus network error surfaces as connection error", () => {
    it("should surface a network failure", async () => {
      mockFetch.mockRejectedValueOnce(
        new TypeError("Failed to fetch"),
      );

      await expect(client.getStatus()).rejects.toThrow();
    });

    it("should surface DNS resolution failure", async () => {
      mockFetch.mockRejectedValueOnce(
        new TypeError("getaddrinfo ENOTFOUND localhost"),
      );

      await expect(client.getStatus()).rejects.toThrow();
    });

    it("should surface connection refused error", async () => {
      mockFetch.mockRejectedValueOnce(
        new Error("connect ECONNREFUSED 127.0.0.1:3000"),
      );

      await expect(client.getStatus()).rejects.toThrow();
    });
  });
});
