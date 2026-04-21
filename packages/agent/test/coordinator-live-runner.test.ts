import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CoordinatorPreflightResult } from "../src/evals/coordinator-preflight.js";
import type { CoordinatorEvalChannel } from "../src/evals/coordinator-scenarios.js";

const supportedConnectors: CoordinatorEvalChannel[] = [
  "discord",
  "telegram",
  "slack",
  "whatsapp",
  "signal",
  "matrix",
  "wechat",
];

type MutableTestState = {
  conversations: Map<
    string,
    Array<{ text?: string; content?: { text?: string } }>
  >;
  hangingPrompt: string | null;
  outputRoot: string;
  preflight: CoordinatorPreflightResult;
  workdir: string;
};

const state = {} as MutableTestState;
const scenarioId = "B001";
const batchId = "batch-test";

function makePreflight(
  overrides: Partial<CoordinatorPreflightResult> = {},
): CoordinatorPreflightResult {
  return {
    ok: false,
    baseUrl: "http://127.0.0.1:31337",
    configPath: "/tmp/milady.json",
    availableChannels: ["app_chat"],
    supportedConnectors,
    channelReadiness: [
      {
        channel: "app_chat",
        connectorKeys: [],
        configured: true,
        configReady: true,
        healthStatuses: {},
        available: true,
        reason:
          "App chat is always available when the Milady API is reachable.",
      },
      ...supportedConnectors.map((channel) => ({
        channel,
        connectorKeys:
          channel === "telegram" ? ["telegram", "telegramAccount"] : [channel],
        configured: false,
        configReady: false,
        healthStatuses: {},
        available: false,
        reason: `Channel ${channel} is not configured in Milady.`,
      })),
    ],
    shareCapabilities: [],
    checks: [
      {
        id: "local-cli-codex",
        status: "pass",
        summary: "Codex CLI is installed.",
      },
      {
        id: "local-cli-claude",
        status: "fail",
        summary: "Claude Code CLI is not installed.",
      },
      {
        id: "subscription-openai-codex",
        status: "fail",
        summary: "OpenAI Codex subscription is missing or invalid.",
      },
      {
        id: "subscription-anthropic",
        status: "pass",
        summary:
          "Claude subscription is configured and valid for task-agent use.",
      },
      {
        id: "framework-codex",
        status: "pass",
        summary: "codex is installed and ready for coordinator task execution.",
      },
      {
        id: "framework-claude",
        status: "fail",
        summary: "claude is not ready for coordinator task execution.",
      },
      {
        id: "trajectory-logging",
        status: "pass",
        summary: "Trajectory logging is enabled.",
      },
      {
        id: "connectors",
        status: "warn",
        summary:
          "No external connectors are configured; live eval coverage is limited to app chat.",
      },
    ],
    ...overrides,
  };
}

vi.mock("../src/evals/coordinator-preflight.js", () => ({
  runCoordinatorPreflight: vi.fn(async () => state.preflight),
}));

class FakeCoordinatorEvalClient {
  constructor(private readonly baseUrl: string) {
    if (!this.baseUrl.startsWith("http")) {
      throw new Error(`Unexpected base URL: ${this.baseUrl}`);
    }
  }

  async requestJson<T>(
    route: string,
    init?: { method?: string; body?: unknown },
  ): Promise<T> {
    if (route === "/api/trajectories/config") {
      return { enabled: true } as T;
    }

    if (route.startsWith("/api/trajectories?")) {
      return {
        trajectories: [
          {
            id: "trajectory-1",
            source: "client_chat",
            scenarioId,
            batchId,
          },
        ],
      } as T;
    }

    if (route === "/api/trajectories/export") {
      throw new Error("Use requestBuffer for trajectory export.");
    }

    if (
      route.startsWith("/api/coding-agents/coordinator/threads?") ||
      route === "/api/coding-agents/coordinator/threads"
    ) {
      return [
        {
          id: "thread-1",
          title: "Scenario thread",
          status: "completed",
          latestWorkdir: state.workdir,
        },
      ] as T;
    }

    if (route.startsWith("/api/coding-agents/coordinator/threads/count")) {
      return { total: 1 } as T;
    }

    if (route === "/api/coding-agents/coordinator/threads/thread-1") {
      return {
        id: "thread-1",
        title: "Scenario thread",
        status: "completed",
        latestWorkdir: state.workdir,
        scenarioId,
        batchId,
        sessions: [
          {
            id: "session-row-1",
            sessionId: "session-1",
            workdir: state.workdir,
            status: "completed",
          },
        ],
        artifacts: [],
        events: [{ eventType: "status", summary: "completed" }],
        transcripts: [{ direction: "stdout", content: "task complete" }],
      } as T;
    }

    if (
      route.startsWith("/api/coding-agents/coordinator/threads/thread-1/share")
    ) {
      return {
        threadId: "thread-1",
        shareCapabilities: [],
        preferredTarget: null,
        targets: [],
      } as T;
    }

    if (route === "/api/trajectories/config" && init?.method === "PUT") {
      return { enabled: true } as T;
    }

    throw new Error(`Unexpected requestJson route: ${route}`);
  }

  async requestBuffer(route: string): Promise<Buffer> {
    if (route !== "/api/trajectories/export") {
      throw new Error(`Unexpected requestBuffer route: ${route}`);
    }
    return Buffer.from("zip-bytes");
  }

  async createConversation(): Promise<{ id: string }> {
    state.conversations.set("conversation-1", []);
    return { id: "conversation-1" };
  }

  async postConversationMessage(params: {
    conversationId: string;
    text: string;
    timeoutMs?: number;
  }): Promise<{ text: string }> {
    if (state.hangingPrompt && params.text === state.hangingPrompt) {
      return await new Promise<{ text: string }>((_resolve, reject) => {
        setTimeout(
          () =>
            reject(
              new Error(`Request timed out after ${params.timeoutMs ?? 0}ms`),
            ),
          params.timeoutMs ?? 1_000,
        );
      });
    }
    const messages = state.conversations.get(params.conversationId) ?? [];
    messages.push({ text: params.text });
    messages.push({
      text: `Handled: ${params.text}\nPreview: ${path.join(state.workdir, "index.html")}`,
    });
    state.conversations.set(params.conversationId, messages);
    return {
      text: `Handled: ${params.text}\nPreview: ${path.join(state.workdir, "index.html")}`,
    };
  }

  async listConversationMessages(
    conversationId: string,
  ): Promise<Array<{ text?: string; content?: { text?: string } }>> {
    return state.conversations.get(conversationId) ?? [];
  }

  async writeJson(filePath: string, value: unknown): Promise<void> {
    await writeFile(filePath, JSON.stringify(value, null, 2));
  }
}

vi.mock("../src/evals/coordinator-eval-client.js", () => ({
  CoordinatorEvalClient: FakeCoordinatorEvalClient,
  resolveCoordinatorEvalBaseUrl: (baseUrl?: string) =>
    baseUrl ?? "http://127.0.0.1:31337",
}));

const { runCoordinatorLiveScenarios } = await import(
  "../src/evals/coordinator-live-runner.js"
);

describe("coordinator live runner", () => {
  beforeEach(async () => {
    state.outputRoot = await mkdtemp(
      path.join(os.tmpdir(), "coordinator-live-runner-"),
    );
    state.workdir = await mkdtemp(
      path.join(os.tmpdir(), "coordinator-workdir-"),
    );
    await writeFile(path.join(state.workdir, "index.html"), "<h1>hello</h1>\n");
    state.conversations = new Map();
    state.hangingPrompt = null;
    state.preflight = makePreflight();
  });

  afterEach(async () => {
    await rm(state.outputRoot, { recursive: true, force: true });
    await rm(state.workdir, { recursive: true, force: true });
  });

  it("runs app-chat scenarios when alternate framework checks fail", async () => {
    const result = await runCoordinatorLiveScenarios({
      baseUrl: "http://127.0.0.1:31337",
      batchId,
      outputRoot: state.outputRoot,
      scenarioIds: [scenarioId],
      channels: ["app_chat"],
    });

    expect(result.runs).toHaveLength(1);
    expect(result.runs[0]?.passed).toBe(true);
    expect(result.preflightHardBlockers).toHaveLength(0);
    expect(result.preflightFailures.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "local-cli-claude",
        "subscription-openai-codex",
        "framework-claude",
      ]),
    );
  }, 15_000);

  it("records skipped channels when defaulting to all supported channels", async () => {
    const result = await runCoordinatorLiveScenarios({
      baseUrl: "http://127.0.0.1:31337",
      batchId,
      outputRoot: state.outputRoot,
      scenarioIds: [scenarioId],
    });

    expect(result.requestedChannels).toEqual([
      "app_chat",
      ...supportedConnectors,
    ]);
    expect(result.usableChannels).toEqual(["app_chat"]);
    expect(result.skippedChannels.map((item) => item.channel)).toEqual(
      supportedConnectors,
    );
  }, 15_000);

  it("fails when no runnable framework is available for task scenarios", async () => {
    state.preflight = makePreflight({
      checks: state.preflight.checks.map((check) =>
        check.id.startsWith("framework-")
          ? { ...check, status: "fail" as const }
          : check,
      ),
    });

    await expect(
      runCoordinatorLiveScenarios({
        baseUrl: "http://127.0.0.1:31337",
        batchId,
        outputRoot: state.outputRoot,
        scenarioIds: [scenarioId],
        channels: ["app_chat"],
      }),
    ).rejects.toThrow(/task-frameworks/);
  });

  it("fails fast when a conversation turn hangs past the eval timeout budget", async () => {
    state.hangingPrompt =
      "Can you make a little web page for me that shows my birthday, March 14, 1991, and my astrological sign?";

    await expect(
      runCoordinatorLiveScenarios({
        baseUrl: "http://127.0.0.1:31337",
        batchId,
        outputRoot: state.outputRoot,
        scenarioIds: [scenarioId],
        channels: ["app_chat"],
        scenarioTimeoutMs: 2_000,
      }),
    ).rejects.toThrow(/timed out/i);
  });
});
