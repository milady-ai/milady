import type http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEnvSandbox,
  createMockHeadersRequest,
} from "./../test-support/test-helpers";

import {
  createHardenedExportGuard,
  _resetForTesting,
} from "./wallet-export-guard";

// Build a minimal upstream mock matching the real resolveWalletExportRejection
// contract, so we don't pull in @elizaos/core or @miladyai/agent.
function upstreamMock(
  req: http.IncomingMessage,
  body: Record<string, unknown>,
) {
  if (!body.confirm) {
    return { status: 403 as const, reason: "Missing confirm flag" };
  }
  const token =
    process.env.ELIZA_WALLET_EXPORT_TOKEN?.trim() ||
    process.env.MILADY_WALLET_EXPORT_TOKEN?.trim();
  if (!token) {
    return {
      status: 403 as const,
      reason:
        "Wallet export is disabled. Set ELIZA_WALLET_EXPORT_TOKEN to enable secure exports.",
    };
  }
  const headerToken = (
    req.headers?.["x-eliza-export-token"] as string | undefined
  )?.trim();
  const bodyToken = (body.exportToken as string | undefined)?.trim();
  const provided = headerToken || bodyToken;
  if (!provided) {
    return {
      status: 401 as const,
      reason:
        "Missing export token. Provide X-Eliza-Export-Token header or exportToken in request body.",
    };
  }
  if (provided !== token) {
    return { status: 401 as const, reason: "Invalid export token." };
  }
  return null;
}

const resolveWalletExportRejection = createHardenedExportGuard(upstreamMock);

function mockReq(
  headers: http.IncomingHttpHeaders = {},
): Pick<http.IncomingMessage, "headers" | "socket"> {
  const base = createMockHeadersRequest(headers) as Record<string, unknown>;
  // Provide a mock socket so getClientIp() returns a value instead of null
  base.socket = { remoteAddress: "127.0.0.1" };
  return base as Pick<http.IncomingMessage, "headers" | "socket">;
}

/**
 * The hardened guard requires a two-phase nonce flow for valid exports.
 * This helper extracts a nonce from the first (requestNonce) call,
 * then fast-forwards time past the 10s delay so the second call succeeds.
 */
function extractNonce(
  rejection: { status: number; reason: string } | null,
): string {
  expect(rejection).not.toBeNull();
  const parsed = JSON.parse(rejection?.reason);
  expect(parsed.countdown).toBe(true);
  return parsed.nonce as string;
}

describe("resolveWalletExportRejection", () => {
  const env = createEnvSandbox([
    "ELIZA_WALLET_EXPORT_TOKEN",
    "MILADY_WALLET_EXPORT_TOKEN",
  ]);

  beforeEach(() => {
    env.clear();
    _resetForTesting();
  });

  afterEach(() => {
    env.restore();
  });

  it("rejects when confirmation is missing", () => {
    delete process.env.ELIZA_WALLET_EXPORT_TOKEN;
    const rejection = resolveWalletExportRejection(
      mockReq() as http.IncomingMessage,
      {},
    );
    expect(rejection?.status).toBe(403);
    expect(rejection?.reason).toContain("confirm");
  });

  it("rejects when export token feature is disabled", () => {
    delete process.env.ELIZA_WALLET_EXPORT_TOKEN;
    const rejection = resolveWalletExportRejection(
      mockReq() as http.IncomingMessage,
      { confirm: true },
    );
    expect(rejection).toEqual({
      status: 403,
      reason:
        "Wallet export is disabled. Set ELIZA_WALLET_EXPORT_TOKEN to enable secure exports.",
    });
  });

  it("rejects when export token is missing", () => {
    process.env.ELIZA_WALLET_EXPORT_TOKEN = "secret-token";
    const rejection = resolveWalletExportRejection(
      mockReq() as http.IncomingMessage,
      { confirm: true },
    );
    expect(rejection).toEqual({
      status: 401,
      reason:
        "Missing export token. Provide X-Eliza-Export-Token header or exportToken in request body.",
    });
  });

  it("rejects when export token is invalid", () => {
    process.env.ELIZA_WALLET_EXPORT_TOKEN = "secret-token";
    const rejection = resolveWalletExportRejection(
      mockReq() as http.IncomingMessage,
      { confirm: true, exportToken: "wrong-token" },
    );
    expect(rejection).toEqual({ status: 401, reason: "Invalid export token." });
  });

  it("accepts a valid token from body (with nonce flow)", () => {
    process.env.ELIZA_WALLET_EXPORT_TOKEN = "secret-token";
    // Phase 1: request a nonce
    const nonceResult = resolveWalletExportRejection(
      mockReq() as http.IncomingMessage,
      {
        confirm: true,
        exportToken: "secret-token",
        requestNonce: true,
      } as never,
    );
    const nonce = extractNonce(nonceResult);
    // Fast-forward past the 10s delay
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 11_000);
    // Phase 2: submit with nonce
    const rejection = resolveWalletExportRejection(
      mockReq() as http.IncomingMessage,
      {
        confirm: true,
        exportToken: "secret-token",
        exportNonce: nonce,
      } as never,
    );
    expect(rejection).toBeNull();
    vi.restoreAllMocks();
  });

  it("accepts a valid token from header (with nonce flow)", () => {
    process.env.ELIZA_WALLET_EXPORT_TOKEN = "secret-token";
    const nonceResult = resolveWalletExportRejection(
      mockReq({
        "x-eliza-export-token": "secret-token",
      }) as http.IncomingMessage,
      { confirm: true, requestNonce: true } as never,
    );
    const nonce = extractNonce(nonceResult);
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 11_000);
    const rejection = resolveWalletExportRejection(
      mockReq({
        "x-eliza-export-token": "secret-token",
      }) as http.IncomingMessage,
      { confirm: true, exportNonce: nonce } as never,
    );
    expect(rejection).toBeNull();
    vi.restoreAllMocks();
  });

  it("prefers header token over body token (header valid, with nonce flow)", () => {
    process.env.ELIZA_WALLET_EXPORT_TOKEN = "secret-token";
    const nonceResult = resolveWalletExportRejection(
      mockReq({
        "x-eliza-export-token": "secret-token",
      }) as http.IncomingMessage,
      {
        confirm: true,
        exportToken: "wrong-token",
        requestNonce: true,
      } as never,
    );
    const nonce = extractNonce(nonceResult);
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 11_000);
    const rejection = resolveWalletExportRejection(
      mockReq({
        "x-eliza-export-token": "secret-token",
      }) as http.IncomingMessage,
      {
        confirm: true,
        exportToken: "wrong-token",
        exportNonce: nonce,
      } as never,
    );
    expect(rejection).toBeNull();
    vi.restoreAllMocks();
  });

  it("rejects when header token is invalid even if body token is correct", () => {
    process.env.ELIZA_WALLET_EXPORT_TOKEN = "secret-token";
    const rejection = resolveWalletExportRejection(
      mockReq({
        "x-eliza-export-token": "wrong-token",
      }) as http.IncomingMessage,
      { confirm: true, exportToken: "secret-token" },
    );
    expect(rejection).toEqual({ status: 401, reason: "Invalid export token." });
  });

  it("treats whitespace-only env token as disabled", () => {
    process.env.ELIZA_WALLET_EXPORT_TOKEN = "   ";
    const rejection = resolveWalletExportRejection(
      mockReq() as http.IncomingMessage,
      { confirm: true },
    );
    expect(rejection).toEqual({
      status: 403,
      reason:
        "Wallet export is disabled. Set ELIZA_WALLET_EXPORT_TOKEN to enable secure exports.",
    });
  });

  it("rejects confirm: false explicitly", () => {
    process.env.ELIZA_WALLET_EXPORT_TOKEN = "secret-token";
    const rejection = resolveWalletExportRejection(
      mockReq() as http.IncomingMessage,
      { confirm: false },
    );
    expect(rejection?.status).toBe(403);
    expect(rejection?.reason).toContain("confirm");
  });

  it("treats whitespace-only body exportToken as missing", () => {
    process.env.ELIZA_WALLET_EXPORT_TOKEN = "secret-token";
    const rejection = resolveWalletExportRejection(
      mockReq() as http.IncomingMessage,
      { confirm: true, exportToken: "   " },
    );
    expect(rejection).toEqual({
      status: 401,
      reason:
        "Missing export token. Provide X-Eliza-Export-Token header or exportToken in request body.",
    });
  });

  it("treats whitespace-only header X-Eliza-Export-Token as missing", () => {
    process.env.ELIZA_WALLET_EXPORT_TOKEN = "secret-token";
    const rejection = resolveWalletExportRejection(
      mockReq({ "x-eliza-export-token": "   " }) as http.IncomingMessage,
      { confirm: true },
    );
    expect(rejection).toEqual({
      status: 401,
      reason:
        "Missing export token. Provide X-Eliza-Export-Token header or exportToken in request body.",
    });
  });
});
