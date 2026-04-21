import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MutableTestState = {
  configPath: string;
  responses: Record<string, unknown>;
  installedCommands: Set<string>;
};

const state = {} as MutableTestState;
const originalEnv = { ...process.env };

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn((_command: string, args: string[]) => {
    const candidate = args[0];
    if (candidate && state.installedCommands.has(candidate)) {
      return "";
    }
    throw new Error(`missing command: ${candidate ?? "unknown"}`);
  }),
}));

class FakeCoordinatorEvalClient {
  constructor(private readonly baseUrl: string) {
    if (!this.baseUrl.startsWith("http")) {
      throw new Error(`Unexpected base URL: ${this.baseUrl}`);
    }
  }

  async requestJson<T>(route: string): Promise<T> {
    if (!(route in state.responses)) {
      throw new Error(`Unexpected requestJson route: ${route}`);
    }
    return state.responses[route] as T;
  }
}

vi.mock("../src/evals/coordinator-eval-client.js", () => ({
  CoordinatorEvalClient: FakeCoordinatorEvalClient,
  resolveCoordinatorEvalBaseUrl: (baseUrl?: string) =>
    baseUrl ?? "http://127.0.0.1:31337",
}));

const { runCoordinatorPreflight } = await import(
  "../src/evals/coordinator-preflight.js"
);

describe("coordinator preflight", () => {
  beforeEach(async () => {
    const tmpDir = await mkdtemp(
      path.join(os.tmpdir(), "coordinator-preflight-"),
    );
    state.configPath = path.join(tmpDir, "milady.json");
    state.installedCommands = new Set(["codex"]);
    state.responses = {
      "/api/coding-agents/coordinator/status": {
        frameworks: [
          {
            id: "codex",
            installed: true,
            authReady: true,
            subscriptionReady: false,
          },
          {
            id: "claude",
            installed: false,
            authReady: false,
            subscriptionReady: false,
          },
        ],
      },
      "/api/subscription/status": {
        providers: [
          { provider: "openai-codex", configured: true, valid: true },
          {
            provider: "anthropic-subscription",
            configured: false,
            valid: false,
          },
        ],
      },
      "/api/trajectories/config": { enabled: true },
      "/api/connectors": {
        connectors: {
          discord: { botToken: "discord-token" },
          telegramAccount: {
            phone: "+15555550123",
            appId: "12345",
            appHash: "hash-123",
            deviceModel: "Desktop",
            systemVersion: "1.0",
          },
        },
      },
      "/api/health": {
        connectors: {
          discord: "ok",
          telegramAccount: "missing",
        },
      },
    };
    await writeFile(
      state.configPath,
      JSON.stringify(
        {
          connectors: {
            discord: { botToken: "discord-token" },
            telegramAccount: {
              phone: "+15555550123",
              appId: "12345",
              appHash: "hash-123",
              deviceModel: "Desktop",
              systemVersion: "1.0",
            },
          },
        },
        null,
        2,
      ),
    );
    process.env = {
      ...originalEnv,
      MILADY_CONFIG_PATH: state.configPath,
    };
  });

  afterEach(async () => {
    const tmpDir = path.dirname(state.configPath);
    process.env = { ...originalEnv };
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("marks only runtime-live connectors as available channels", async () => {
    const result = await runCoordinatorPreflight({
      baseUrl: "http://127.0.0.1:31337",
    });

    expect(result.availableChannels).toEqual(["app_chat", "discord"]);
    expect(result.channelReadiness).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channel: "discord",
          configured: true,
          configReady: true,
          available: true,
          healthStatuses: { discord: "ok" },
        }),
        expect.objectContaining({
          channel: "telegram",
          connectorKeys: ["telegram", "telegramAccount"],
          configured: true,
          configReady: true,
          available: false,
          healthStatuses: { telegramAccount: "missing" },
        }),
        expect.objectContaining({
          channel: "slack",
          configured: false,
          configReady: false,
          available: false,
        }),
      ]),
    );
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "channel-discord", status: "pass" }),
        expect.objectContaining({ id: "channel-telegram", status: "fail" }),
        expect.objectContaining({ id: "channel-slack", status: "warn" }),
      ]),
    );
  });

  it("rejects incomplete connector config even when runtime health reports ok", async () => {
    state.responses["/api/connectors"] = {
      connectors: {
        discord: { enabled: true },
      },
    };
    state.responses["/api/health"] = {
      connectors: {
        discord: "ok",
      },
    };
    await writeFile(
      state.configPath,
      JSON.stringify(
        {
          connectors: {
            discord: { enabled: true },
          },
        },
        null,
        2,
      ),
    );

    const result = await runCoordinatorPreflight({
      baseUrl: "http://127.0.0.1:31337",
    });

    const discordReadiness = result.channelReadiness.find(
      (item) => item.channel === "discord",
    );
    expect(discordReadiness).toMatchObject({
      configured: true,
      configReady: false,
      available: false,
    });
    expect(result.availableChannels).toEqual(["app_chat"]);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "channel-discord", status: "fail" }),
      ]),
    );
  });
});
