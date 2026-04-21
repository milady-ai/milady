import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRefreshAnthropicToken = vi.hoisted(() => vi.fn());
const mockLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("../anthropic.js", () => ({
  refreshAnthropicToken: mockRefreshAnthropicToken,
}));

vi.mock("@elizaos/core", () => ({
  logger: mockLogger,
}));

let tmpHome: string;
const originalEnv = { ...process.env };

function writeExpiredClaudeBlob(): void {
  const claudeDir = path.join(tmpHome, ".claude");
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(
    path.join(claudeDir, ".credentials.json"),
    JSON.stringify({
      claudeAiOauth: {
        accessToken: "expired-access-token",
        refreshToken: "revoked-refresh-token",
        expiresAt: Date.now() - 60_000,
      },
    }),
    "utf-8",
  );
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "milady-claude-refresh-"));
  vi.spyOn(os, "homedir").mockReturnValue(tmpHome);
  process.env = { ...originalEnv };
  delete process.env.ELIZA_HOME;
  delete process.env.MILADY_STATE_DIR;
  delete process.env.MILADY_CONFIG_PATH;
  writeExpiredClaudeBlob();
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmpHome, { recursive: true, force: true });
  process.env = { ...originalEnv };
});

describe("applySubscriptionCredentials", () => {
  it("caches invalid_grant Claude Code refresh failures and downgrades them to info", async () => {
    mockRefreshAnthropicToken.mockRejectedValue(
      new Error(
        'Anthropic token refresh failed: {"error":"invalid_grant","error_description":"Refresh token not found or invalid"}',
      ),
    );

    const { applySubscriptionCredentials } = await import("../credentials.js");

    await applySubscriptionCredentials();
    await applySubscriptionCredentials();

    expect(mockRefreshAnthropicToken).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining(
        "Claude Code OAuth refresh token from credentials file is invalid or revoked",
      ),
    );
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });
});
