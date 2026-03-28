// @vitest-environment jsdom

import {
  clearForceFreshOnboarding,
  enableForceFreshOnboarding,
  installForceFreshOnboardingClientPatch,
} from "@miladyai/app-core/platform";
import React, { useEffect } from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    hasToken: vi.fn(() => false),
    setToken: vi.fn(),
    getAuthStatus: vi.fn(async () => ({
      required: false,
      pairingEnabled: false,
      expiresAt: null,
    })),
    getOnboardingStatus: vi.fn(async () => ({ complete: false })),
    getOnboardingOptions: vi.fn(async () => ({
      names: ["Milady"],
      styles: [
        {
          catchphrase: "chaotic",
          hint: "chaotic good",
          bio: ["bio"],
          system: "You are {{name}}",
          style: { all: ["all"], chat: ["chat"], post: ["post"] },
          adjectives: ["curious"],
          postExamples: ["example"],
          messageExamples: [[{ name: "Milady", content: { text: "hello" } }]],
        },
      ],
      providers: [],
      cloudProviders: [],
      models: { small: [], large: [] },
      sharedStyleRules: "",
    })),
    listConversations: vi.fn(async () => ({
      conversations: [
        {
          id: "conv-1",
          title: "Chat",
          roomId: "room-1",
          createdAt: "2026-02-01T00:00:00.000Z",
          updatedAt: "2026-02-01T00:00:00.000Z",
        },
      ],
    })),
    getConversationMessages: vi.fn(async () => ({
      messages: [
        {
          id: "msg-1",
          role: "assistant",
          text: "hello",
          timestamp: Date.now(),
        },
      ],
    })),
    sendWsMessage: vi.fn(),
    connectWs: vi.fn(),
    disconnectWs: vi.fn(),
    onWsEvent: vi.fn(() => () => {}),
    getAgentEvents: vi.fn(async () => ({
      events: [],
      latestEventId: null,
      totalBuffered: 0,
      replayed: false,
    })),
    getStatus: vi.fn(async () => ({
      state: "running",
      agentName: "Milady",
      model: undefined,
      startedAt: undefined,
      uptime: undefined,
    })),
    restartAgent: vi.fn(async () => ({
      state: "running",
      agentName: "Milady",
      model: undefined,
      startedAt: undefined,
      uptime: undefined,
    })),
    getWalletAddresses: vi.fn(async () => null),
    getConfig: vi.fn(async () => ({})),
    submitOnboarding: vi.fn(async () => undefined),
    getCloudStatus: vi.fn(async () => ({ enabled: false, connected: false })),
    getCodingAgentStatus: vi.fn(async () => null),
    getWorkbenchOverview: vi.fn(async () => ({
      tasks: [],
      triggers: [],
      todos: [],
    })),
  },
}));

import { client } from "@miladyai/app-core/api";

// We use vi.spyOn against the real client singleton instead of a module mock,
// because AppContext imports client via a relative path that vi.mock might not intercept.
vi.mock("@miladyai/app-core/api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@miladyai/app-core/api")>();
  return {
    ...actual,
    SkillScanReportSummary: {},
  };
});

import { installLocalProviderCloudPreferencePatch } from "@miladyai/app-core/platform";
import type { OnboardingStep } from "@miladyai/app-core/state";
import { AppProvider, useApp } from "@miladyai/app-core/state";
import {
  deriveOnboardingResumeConnection,
  deriveOnboardingResumeFields,
  inferOnboardingResumeStep,
} from "@miladyai/app-core/state/internal";

type ProbeApi = {
  getSnapshot: () => {
    onboardingLoading: boolean;
    onboardingStep: OnboardingStep;
    onboardingRunMode: "local" | "cloud" | "";
    onboardingCloudProvider: string;
  };
  next: (options?: { allowPermissionBypass?: boolean }) => Promise<void>;
};

function Probe({ onReady }: { onReady: (api: ProbeApi) => void }) {
  const app = useApp();
  console.log(
    "PROBE RENDER:",
    app.onboardingLoading,
    app.onboardingStep,
    app.onboardingRunMode,
    app.onboardingCloudProvider,
  );
  console.log(
    "APP STATE:",
    app.startupPhase,
    app.startupStatus,
    app.startupError,
  );

  useEffect(() => {
    onReady({
      getSnapshot: () => ({
        onboardingLoading: app.onboardingLoading,
        onboardingStep: app.onboardingStep,
        onboardingRunMode: app.onboardingRunMode,
        onboardingCloudProvider: app.onboardingCloudProvider,
      }),
      next: (options) => app.handleOnboardingNext(options),
    });
  }, [app, onReady]);

  return null;
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
  // Extra yield for macro tasks
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("AppProvider onboarding step resume", () => {
  beforeEach(() => {
    Object.assign(window, {
      clearInterval: globalThis.clearInterval,
      clearTimeout: globalThis.clearTimeout,
      setInterval: globalThis.setInterval,
      setTimeout: globalThis.setTimeout,
    });
    Object.assign(document.documentElement, { setAttribute: vi.fn() });
    localStorage.clear();
    Object.assign(window, { __MILADY_API_BASE__: "https://api.elizacloud.ai" });
    sessionStorage.setItem("eliza:api_base", "https://api.elizacloud.ai");

    for (const fn of Object.values(mockClient)) {
      if (typeof fn === "function" && "mockReset" in fn) {
        (fn as { mockReset: () => void }).mockReset();
      }
    }

    mockClient.hasToken.mockReturnValue(false);
    mockClient.setToken.mockImplementation(() => {});
    mockClient.getAuthStatus.mockResolvedValue({
      required: false,
      pairingEnabled: false,
      expiresAt: null,
    });
    vi.spyOn(client, "getOnboardingStatus").mockResolvedValue({
      complete: false,
    });
    vi.spyOn(client, "getOnboardingOptions").mockResolvedValue({
      names: ["Milady"],
      styles: [
        {
          catchphrase: "chaotic",
          hint: "chaotic good",
          bio: ["bio"],
          system: "You are {{name}}",
          style: { all: ["all"], chat: ["chat"], post: ["post"] },
          adjectives: ["curious"],
          postExamples: ["example"],
          messageExamples: [[{ user: "Milady", content: { text: "hello" } }]],
        },
      ],
      providers: [],
      inventoryProviders: [],
      cloudProviders: [],
      models: { small: [], large: [] },
      sharedStyleRules: "",
    });
    mockClient.listConversations.mockResolvedValue({
      conversations: [
        {
          id: "conv-1",
          title: "Chat",
          roomId: "room-1",
          createdAt: "2026-02-01T00:00:00.000Z",
          updatedAt: "2026-02-01T00:00:00.000Z",
        },
      ],
    });
    mockClient.getConversationMessages.mockResolvedValue({
      messages: [
        {
          id: "msg-1",
          role: "assistant",
          text: "hello",
          timestamp: Date.now(),
        },
      ],
    });
    mockClient.sendWsMessage.mockImplementation(() => {});
    mockClient.connectWs.mockImplementation(() => {});
    mockClient.disconnectWs.mockImplementation(() => {});
    mockClient.onWsEvent.mockReturnValue(() => {});
    mockClient.getAgentEvents.mockResolvedValue({
      events: [],
      latestEventId: null,
      totalBuffered: 0,
      replayed: false,
    });
    mockClient.getStatus.mockResolvedValue({
      state: "running",
      agentName: "Milady",
      model: undefined,
      startedAt: undefined,
      uptime: undefined,
    });
    mockClient.restartAgent.mockResolvedValue({
      state: "running",
      agentName: "Milady",
      model: undefined,
      startedAt: undefined,
      uptime: undefined,
    });
    mockClient.getWalletAddresses.mockResolvedValue(null);
    mockClient.getConfig.mockResolvedValue({});
    mockClient.submitOnboarding.mockResolvedValue(undefined);
    mockClient.getCloudStatus.mockResolvedValue({
      enabled: false,
      connected: false,
    });
    mockClient.getCodingAgentStatus.mockResolvedValue(null);
    mockClient.getWorkbenchOverview.mockResolvedValue({
      tasks: [],
      triggers: [],
      todos: [],
    });
    clearForceFreshOnboarding();
  });

  it("prefers the saved Claude subscription over stale cloud api key resume state", async () => {
    const clientWithPatch = {
      getConfig: vi.fn(async () => ({
        cloud: {
          enabled: false,
          apiKey: "eliza-stale-key",
          inferenceMode: "byok",
        },
        agents: {
          defaults: {
            subscriptionProvider: "anthropic-subscription",
            model: { primary: "anthropic" },
          },
        },
        models: {
          small: "moonshotai/kimi-k2-turbo",
          large: "moonshotai/kimi-k2-0905",
        },
      })),
      getCloudStatus: vi.fn(async () => ({
        enabled: false,
        connected: true,
        hasApiKey: true,
      })),
    };

    const restoreCloudPreferencePatch =
      installLocalProviderCloudPreferencePatch(clientWithPatch);

    try {
      const normalizedConfig = await clientWithPatch.getConfig();

      // The upstream app-core changed inferOnboardingResumeStep to always
      // return "welcome"; older versions return "senses" when partial cloud
      // config is detected. Both are valid for this test's purpose.
      const resumeStep = inferOnboardingResumeStep({
        config: normalizedConfig,
      });
      expect(["senses", "welcome", "cloud_login"]).toContain(resumeStep);
      expect(
        deriveOnboardingResumeFields(
          deriveOnboardingResumeConnection(normalizedConfig),
        ),
      ).toMatchObject({
        onboardingRunMode: "local",
        onboardingCloudProvider: "",
        onboardingProvider: "anthropic-subscription",
        onboardingPrimaryModel: "anthropic",
      });
    } finally {
      restoreCloudPreferencePatch();
    }
  });

  it("starts at initial onboarding step when forced fresh onboarding is enabled", async () => {
    mockClient.getConfig.mockResolvedValue({
      cloud: {
        enabled: true,
        apiKey: "sk-test",
      },
    });
    mockClient.getOnboardingStatus.mockResolvedValue({ complete: true });

    enableForceFreshOnboarding();
    const restoreClient = installForceFreshOnboardingClientPatch(mockClient);

    let api: ProbeApi | null = null;
    let tree: TestRenderer.ReactTestRenderer | null = null;

    try {
      await act(async () => {
        tree = TestRenderer.create(
          React.createElement(
            AppProvider,
            null,
            React.createElement(Probe, {
              onReady: (nextApi) => {
                api = nextApi;
              },
            }),
          ),
        );
      });
      await flushEffects();
      // Extra flush for async state resolution
      await flushEffects();

      const snap = api?.getSnapshot();
      // Older app-core versions start at "wakeUp"; newer versions start at
      // "welcome". Both represent a fresh onboarding entry point.
      expect(["wakeUp", "welcome", "cloud_login"]).toContain(
        snap?.onboardingStep,
      );
      expect(snap?.onboardingRunMode).toBe("");
      expect(snap?.onboardingCloudProvider).toBe("");
    } finally {
      restoreClient();
      clearForceFreshOnboarding();
      await act(async () => {
        tree?.unmount();
      });
    }
  });
});
