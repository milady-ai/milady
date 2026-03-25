import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { req } from "../../../../test/helpers/http";
import { startApiServer } from "./server";

vi.mock("../services/mcp-marketplace", () => ({
  searchMcpMarketplace: vi.fn().mockResolvedValue({ results: [] }),
  getMcpServerDetails: vi.fn().mockResolvedValue(null),
}));

async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  } catch {
    // Ignore cleanup failures in tests.
  }
}

describe("pairing code logging", () => {
  const ENV_KEYS_TO_SAVE = [
    "ELIZA_STATE_DIR",
    "MILADY_STATE_DIR",
    "ELIZA_API_TOKEN",
    "MILADY_API_TOKEN",
    "ELIZA_PAIRING_DISABLED",
  ] as const;

  const savedEnv = new Map<string, string | undefined>();

  for (const key of ENV_KEYS_TO_SAVE) {
    savedEnv.set(key, process.env[key]);
  }

  afterEach(async () => {
    for (const key of ENV_KEYS_TO_SAVE) {
      const original = savedEnv.get(key);
      if (original === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original;
      }
    }
  });

  it("logs the full pairing code so operators can complete pairing", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "milady-pairing-"));
    process.env.ELIZA_STATE_DIR = tempDir;
    process.env.MILADY_STATE_DIR = tempDir;
    process.env.ELIZA_API_TOKEN = "pairing-log-test-token";
    process.env.MILADY_API_TOKEN = "pairing-log-test-token";
    delete process.env.ELIZA_PAIRING_DISABLED;

    await fs.writeFile(
      path.join(tempDir, "eliza.json"),
      JSON.stringify({ logging: { level: "error" } }),
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const server = await startApiServer({ port: 0 });

    try {
      const { status, data } = await req(
        server.port,
        "GET",
        "/api/auth/status",
      );
      expect(status).toBe(200);
      expect(data.pairingEnabled).toBe(true);

      const warningMessages = warnSpy.mock.calls.map(([message]) =>
        String(message),
      );
      expect(
        warningMessages.some(
          (message) =>
            !message.includes("****") &&
            /\b[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}\b/.test(message),
        ),
      ).toBe(true);
    } finally {
      warnSpy.mockRestore();
      await server.close();
      await cleanupTempDir(tempDir);
    }
  });
});
