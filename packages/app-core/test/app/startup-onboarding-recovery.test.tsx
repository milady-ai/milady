// @vitest-environment jsdom

import React, { useEffect } from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connectionStateListeners, mockClient } = vi.hoisted(() => {
  const listeners = new Set<
    (state: {
      state: "connected" | "disconnected" | "reconnecting" | "failed";
      reconnectAttempt: number;
      maxReconnectAttempts: number;
      disconnectedAt: number | null;
    }) => void
  >();

  return {
    connectionStateListeners: listeners,
    mockClient: {
      apiAvailable: true,
      hasToken: vi.fn(() => false),
      getAuthStatus: vi.fn(async () => ({
        required: false,
        pairingEnabled: false,
        expiresAt: null,
      })),
      getOnboardingStatus: vi.fn(async () => ({ complete: true })),
      getOnboardingOptions: vi.fn(async () => ({
        names: ["Milady"],
        styles: [],
        providers: [],
        cloudProviders: [],
        models: { small: [], large: [] },
        inventoryProviders: [],
        sharedStyleRules: "",
      })),
      listConversations: vi.fn(async () => ({ conversations: [] })),
      getConversationMessages: vi.fn(async () => ({ messages: [] })),
      sendWsMessage: vi.fn(),
      connectWs: vi.fn(),
      disconnectWs: vi.fn(),
      onWsEvent: vi.fn(() => () => {}),
      onConnectionStateChange: vi.fn((listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }),
      getConnectionState: vi.fn(() => ({
        state: "connected",
        reconnectAttempt: 0,
        maxReconnectAttempts: 15,
        disconnectedAt: null,
      })),
      getAgentEvents: vi.fn(async () => ({
        events: [],
        latestEventId: null,
        totalBuffered: 0,
        replayed: true,
      })),
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
      hasCustomVrm: vi.fn(async () => false),
      hasCustomBackground: vi.fn(async () => false),
      getPlugins: vi.fn(async () => ({ plugins: [] })),
      getCharacter: vi.fn(async () => ({
        character: {
          name: "Milady",
          username: "milady",
          bio: [],
          system: "",
          adjectives: [],
          topics: [],
          style: { all: [], chat: [], post: [] },
          messageExamples: [],
          postExamples: [],
        },
      })),
      getStreamSettings: vi.fn(async () => ({
        ok: true,
        settings: { theme: undefined, avatarIndex: undefined },
      })),
      saveStreamSettings: vi.fn(async () => ({ ok: true })),
      resetConnection: vi.fn(),
    },
  };
});

vi.mock("@miladyai/app-core/api", () => ({
  client: mockClient,
  SkillScanReportSummary: {},
}));

import { AppProvider, useApp } from "@miladyai/app-core/state";

type StartupSnapshot = {
  onboardingComplete: boolean;
  onboardingLoading: boolean;
  startupPhase: ReturnType<typeof useApp>["startupPhase"];
  backendConnection: ReturnType<typeof useApp>["backendConnection"];
};

function Probe(props: { onChange: (snapshot: StartupSnapshot) => void }) {
  const app = useApp();

  useEffect(() => {
    props.onChange({
      onboardingComplete: app.onboardingComplete,
      onboardingLoading: app.onboardingLoading,
      startupPhase: app.startupPhase,
      backendConnection: app.backendConnection,
    });
  }, [
    app.onboardingComplete,
    app.onboardingLoading,
    app.startupPhase,
    app.backendConnection,
    props,
  ]);

  return null;
}

async function flushState(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

async function waitFor(assertion: () => void): Promise<void> {
  for (let idx = 0; idx < 40; idx += 1) {
    try {
      assertion();
      return;
    } catch (err) {
      if (idx === 39) throw err;
      await flushState();
    }
  }
}

describe("startup onboarding recovery", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/chat");
    Object.assign(window, {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
    });
    Object.assign(document.documentElement, { setAttribute: vi.fn() });
    localStorage.clear();
    sessionStorage.clear();
    connectionStateListeners.clear();

    for (const fn of Object.values(mockClient)) {
      if (typeof fn === "function" && "mockReset" in fn) {
        (fn as { mockReset: () => void }).mockReset();
      }
    }

    mockClient.hasToken.mockReturnValue(false);
    mockClient.apiAvailable = true;
    mockClient.getAuthStatus.mockResolvedValue({
      required: false,
      pairingEnabled: false,
      expiresAt: null,
    });
    mockClient.getOnboardingStatus.mockResolvedValue({ complete: true });
    mockClient.getOnboardingOptions.mockResolvedValue({
      names: ["Milady"],
      styles: [],
      providers: [],
      cloudProviders: [],
      models: { small: [], large: [] },
      inventoryProviders: [],
      sharedStyleRules: "",
    });
    mockClient.listConversations.mockResolvedValue({ conversations: [] });
    mockClient.getConversationMessages.mockResolvedValue({ messages: [] });
    mockClient.sendWsMessage.mockImplementation(() => {});
    mockClient.connectWs.mockImplementation(() => {});
    mockClient.disconnectWs.mockImplementation(() => {});
    mockClient.onWsEvent.mockReturnValue(() => {});
    mockClient.onConnectionStateChange.mockImplementation((listener) => {
      connectionStateListeners.add(listener);
      return () => {
        connectionStateListeners.delete(listener);
      };
    });
    mockClient.getConnectionState.mockReturnValue({
      state: "connected",
      reconnectAttempt: 0,
      maxReconnectAttempts: 15,
      disconnectedAt: null,
    });
    mockClient.getAgentEvents.mockResolvedValue({
      events: [],
      latestEventId: null,
      totalBuffered: 0,
      replayed: true,
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
    mockClient.hasCustomVrm.mockResolvedValue(false);
    mockClient.hasCustomBackground.mockResolvedValue(false);
    mockClient.getPlugins.mockResolvedValue({ plugins: [] });
    mockClient.getCharacter.mockResolvedValue({
      character: {
        name: "Milady",
        username: "milady",
        bio: [],
        system: "",
        adjectives: [],
        topics: [],
        style: { all: [], chat: [], post: [] },
        messageExamples: [],
        postExamples: [],
      },
    });
    mockClient.getStreamSettings.mockResolvedValue({
      ok: true,
      settings: { theme: undefined, avatarIndex: undefined },
    });
    mockClient.saveStreamSettings.mockResolvedValue({ ok: true });
    mockClient.resetConnection.mockImplementation(() => {});
  });

  it("preserves completed onboarding and saves a recovered local connection", async () => {
    localStorage.setItem("eliza:onboarding-complete", "1");
    mockClient.getOnboardingStatus.mockResolvedValue({ complete: false });
    mockClient.getConfig.mockResolvedValue({
      agents: {
        defaults: {
          workspace: "/tmp/milady-agent",
        },
      },
    });

    let latest: StartupSnapshot | null = null;
    let tree: TestRenderer.ReactTestRenderer | null = null;

    try {
      await act(async () => {
        tree = TestRenderer.create(
          React.createElement(
            AppProvider,
            null,
            React.createElement(Probe, {
              onChange: (snapshot) => {
                latest = snapshot;
              },
            }),
          ),
        );
      });

      await waitFor(() => {
        expect(latest).not.toBeNull();
        expect(latest?.onboardingLoading).toBe(false);
        expect(latest?.startupPhase).toBe("ready");
      });

      expect(latest?.onboardingComplete).toBe(true);
      expect(mockClient.getOnboardingOptions).not.toHaveBeenCalled();
      expect(mockClient.getStatus).toHaveBeenCalled();
      expect(mockClient.connectWs).toHaveBeenCalled();
      expect(localStorage.getItem("eliza:onboarding-complete")).toBe("1");
      expect(localStorage.getItem("eliza:connection-mode")).toBe(
        JSON.stringify({ runMode: "local" }),
      );
    } finally {
      await act(async () => {
        tree?.unmount();
      });
    }
  });

  it("tracks backend connection state changes from the client", async () => {
    localStorage.setItem(
      "eliza:connection-mode",
      JSON.stringify({ runMode: "local" }),
    );

    let latest: StartupSnapshot | null = null;
    let tree: TestRenderer.ReactTestRenderer | null = null;

    try {
      await act(async () => {
        tree = TestRenderer.create(
          React.createElement(
            AppProvider,
            null,
            React.createElement(Probe, {
              onChange: (snapshot) => {
                latest = snapshot;
              },
            }),
          ),
        );
      });

      await waitFor(() => {
        expect(latest?.backendConnection.state).toBe("connected");
      });

      await act(async () => {
        for (const listener of connectionStateListeners) {
          listener({
            state: "failed",
            reconnectAttempt: 15,
            maxReconnectAttempts: 15,
            disconnectedAt: Date.now(),
          });
        }
      });

      expect(latest?.backendConnection).toMatchObject({
        state: "failed",
        reconnectAttempt: 15,
        maxReconnectAttempts: 15,
        showDisconnectedUI: true,
      });
    } finally {
      await act(async () => {
        tree?.unmount();
      });
    }
  });
});
