// @vitest-environment jsdom
import React, { useEffect } from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    hasToken: vi.fn(() => false),
    getAuthStatus: vi.fn(async () => ({
      required: false,
      pairingEnabled: false,
      expiresAt: null,
    })),
    getOnboardingStatus: vi.fn(async () => ({ complete: false })),
    getOnboardingOptions: vi.fn(async () => ({
      names: ["Milady"],
      styles: [],
      providers: [],
      cloudProviders: [],
      models: { small: [], large: [] },
      sharedStyleRules: "",
    })),
    listConversations: vi.fn(async () => ({ conversations: [] })),
    getConversationMessages: vi.fn(async () => ({ messages: [] })),
    sendWsMessage: vi.fn(),
    connectWs: vi.fn(),
    disconnectWs: vi.fn(),
    onWsEvent: vi.fn(() => () => {}),
    getAgentEvents: vi.fn(async () => ({ events: [], latestEventId: null })),
    getStatus: vi.fn(async () => ({
      state: "running",
      agentName: "Milady",
      model: undefined,
      startedAt: undefined,
      uptime: undefined,
    })),
    getWalletAddresses: vi.fn(async () => null),
    getConfig: vi.fn(async () => ({})),
    getCloudStatus: vi.fn(async () => ({ enabled: false, connected: false })),
    getCodingAgentStatus: vi.fn(async () => null),
    getWorkbenchOverview: vi.fn(async () => ({
      tasks: [],
      triggers: [],
      todos: [],
    })),
    getBaseUrl: vi.fn(() => "http://localhost:2138"),
    setBaseUrl: vi.fn(),
    setToken: vi.fn(),
    resetConnection: vi.fn(),
    saveStreamSettings: vi.fn(async () => ({ ok: true })),
  },
}));

vi.mock("@miladyai/app-core/api", () => ({
  client: mockClient,
  SkillScanReportSummary: {},
}));

import type { AppState } from "@miladyai/app-core/state";
import { AppProvider, useApp } from "@miladyai/app-core/state";

type ProbeApi = {
  handleOnboardingNext: () => Promise<void>;
  hasOnboardingOptions: () => boolean;
  setState: (key: string, value: unknown) => void;
  splashContinue: () => void;
  snapshot: () => {
    onboardingStep: string;
    onboardingServerTarget: "" | "local" | "remote" | "elizacloud";
    onboardingProvider: string;
    onboardingPrimaryModel: string;
  };
};

function Probe(props: { onReady: (api: ProbeApi) => void }) {
  const { onReady } = props;
  const app = useApp();

  useEffect(() => {
    onReady({
      handleOnboardingNext: app.handleOnboardingNext,
      hasOnboardingOptions: () => Boolean(app.onboardingOptions),
      setState: (key, value) =>
        app.setState(key as keyof AppState, value as AppState[keyof AppState]),
      splashContinue: () =>
        app.startupCoordinator.dispatch({ type: "SPLASH_CONTINUE" }),
      snapshot: () => ({
        onboardingStep: app.onboardingStep,
        onboardingServerTarget: app.onboardingServerTarget,
        onboardingProvider: app.onboardingProvider,
        onboardingPrimaryModel: app.onboardingPrimaryModel,
      }),
    });
  }, [app, onReady]);

  return null;
}

async function waitForOnboardingOptions(getApi: () => ProbeApi) {
  for (let i = 0; i < 20; i += 1) {
    if (getApi().hasOnboardingOptions()) return;
    await act(async () => {
      await Promise.resolve();
    });
  }
  throw new Error("Onboarding options did not load");
}

describe("onboarding hosting reset", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState(null, "", "/chat");
    Object.assign(window, {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
      __MILADY_API_BASE__: "http://localhost:2138",
    });
    Object.assign(document.documentElement, { setAttribute: vi.fn() });

    for (const fn of Object.values(mockClient)) {
      if (typeof fn === "function" && "mockReset" in fn) {
        (fn as { mockReset: () => void }).mockReset();
      }
    }

    mockClient.hasToken.mockReturnValue(false);
    mockClient.getAuthStatus.mockResolvedValue({
      required: false,
      pairingEnabled: false,
      expiresAt: null,
    });
    mockClient.getOnboardingStatus.mockResolvedValue({ complete: false });
    mockClient.getOnboardingOptions.mockResolvedValue({
      names: ["Milady"],
      styles: [],
      providers: [],
      cloudProviders: [],
      models: { small: [], large: [] },
      sharedStyleRules: "",
    });
    mockClient.listConversations.mockResolvedValue({ conversations: [] });
    mockClient.getConversationMessages.mockResolvedValue({ messages: [] });
    mockClient.sendWsMessage.mockImplementation(() => {});
    mockClient.connectWs.mockImplementation(() => {});
    mockClient.disconnectWs.mockImplementation(() => {});
    mockClient.onWsEvent.mockReturnValue(() => {});
    mockClient.getAgentEvents.mockResolvedValue({
      events: [],
      latestEventId: null,
    });
    mockClient.getStatus.mockResolvedValue({
      state: "running",
      agentName: "Milady",
      model: undefined,
      startedAt: undefined,
      uptime: undefined,
    });
    mockClient.getWalletAddresses.mockResolvedValue(null);
    mockClient.getConfig.mockResolvedValue({});
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
    mockClient.getBaseUrl.mockReturnValue("http://localhost:2138");
    mockClient.saveStreamSettings.mockResolvedValue({ ok: true });
  });

  it("clears stale connection state when identity advances into hosting", async () => {
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

      const getApi = () => {
        if (!api) {
          throw new Error("Probe API unavailable");
        }
        return api;
      };

      // Advance past the startup splash so the coordinator enters the
      // session-restore / onboarding flow.
      await act(async () => {
        getApi().splashContinue();
      });

      await waitForOnboardingOptions(getApi);

      await act(async () => {
        const probe = getApi();
        probe.setState("onboardingStep", "identity");
        probe.setState("onboardingServerTarget", "elizacloud");
        probe.setState("onboardingProvider", "openai");
        probe.setState("onboardingPrimaryModel", "gpt-5");
      });

      await act(async () => {
        await getApi().handleOnboardingNext();
      });

      expect(getApi().snapshot()).toMatchObject({
        onboardingStep: "hosting",
        onboardingServerTarget: "",
        onboardingProvider: "",
        onboardingPrimaryModel: "",
      });
    } finally {
      await act(async () => {
        tree?.unmount();
      });
    }
  });
});
