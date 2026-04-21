/** @vitest-environment jsdom */
import React, { useEffect } from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockClient, mockUseVoiceChat } = vi.hoisted(() => ({
  mockClient: {
    hasToken: vi.fn(() => false),
    getAuthStatus: vi.fn(async () => ({
      required: false,
      pairingEnabled: false,
      expiresAt: null,
    })),
    getOnboardingStatus: vi.fn(async () => ({ complete: true })),
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
    createConversation: vi.fn(async () => ({
      conversation: {
        id: "conv-created",
        title: "Chat",
        roomId: "room-created",
        createdAt: "2026-02-01T00:00:00.000Z",
        updatedAt: "2026-02-01T00:00:00.000Z",
      },
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
    sendConversationMessage: vi.fn(async () => ({
      text: "ok",
      agentName: "Milady",
    })),
    truncateConversationMessages: vi.fn(async () => ({
      ok: true,
      deletedCount: 0,
    })),
    sendConversationMessageStream: vi.fn(async () => ({
      text: "ok",
      agentName: "Milady",
    })),
    requestGreeting: vi.fn(async () => ({
      text: "hello",
      agentName: "Milady",
      generated: true,
      persisted: false,
    })),
    listCustomActions: vi.fn(async () => []),
    testCustomAction: vi.fn(async () => ({
      ok: true,
      output: "ok",
      durationMs: 10,
    })),
    rememberMemory: vi.fn(async () => ({
      ok: true,
      id: "mem-1",
      text: "saved",
      createdAt: Date.now(),
    })),
    searchMemory: vi.fn(async () => ({
      query: "q",
      results: [],
      count: 0,
      limit: 6,
    })),
    searchKnowledge: vi.fn(async () => ({
      query: "q",
      threshold: 0.2,
      results: [],
      count: 0,
    })),
    quickContext: vi.fn(async () => ({
      query: "q",
      answer: "quick answer",
      memories: [],
      knowledge: [],
    })),
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
    renameConversation: vi.fn(async (_id: string, _title: string) => ({
      conversation: {
        id: "conv-1",
        title: "Chat",
        roomId: "room-1",
        createdAt: "2026-02-01T00:00:00.000Z",
        updatedAt: "2026-02-01T00:00:00.000Z",
      },
    })),
    deleteConversation: vi.fn(async () => ({ ok: true })),
  },
  mockUseVoiceChat: vi.fn(),
}));

vi.mock("@miladyai/app-core/api", () => ({
  client: mockClient,
  SkillScanReportSummary: {},
}));

vi.mock("@miladyai/app-core/hooks", async () => {
  const actual = await vi.importActual<
    typeof import("@miladyai/app-core/hooks")
  >("@miladyai/app-core/hooks");
  return {
    ...actual,
    useVoiceChat: (...args: unknown[]) => mockUseVoiceChat(...args),
  };
});

vi.mock("../../src/components/chat/MessageContent", () => ({
  MessageContent: ({ message }: { message: { text: string } }) =>
    React.createElement("span", null, message.text),
}));

import { client } from "@miladyai/app-core/api";
import { AppProvider, useApp } from "@miladyai/app-core/state";
import { ChatView } from "../../src/components/pages/ChatView";
import { createDeferred } from "../../../../test/helpers/test-utils";

type ProbeApi = {
  handleSelectConversation: (id: string) => Promise<void>;
  snapshot: () => {
    chatSending: boolean;
    conversationMessages: Array<{
      id: string;
      role: "user" | "assistant";
      text: string;
    }>;
  };
};

function Probe(props: { onReady: (api: ProbeApi) => void }) {
  const { onReady } = props;
  const app = useApp();

  useEffect(() => {
    onReady({
      handleSelectConversation: app.handleSelectConversation,
      snapshot: () => ({
        chatSending: app.chatSending,
        conversationMessages: app.conversationMessages.map((message) => ({
          id: message.id,
          role: message.role,
          text: message.text,
        })),
      }),
    });
  }, [app, onReady]);

  return null;
}

function resetMockClient(): void {
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
  mockClient.getOnboardingStatus.mockResolvedValue({ complete: true });
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
  mockClient.createConversation.mockResolvedValue({
    conversation: {
      id: "conv-created",
      title: "Chat",
      roomId: "room-created",
      createdAt: "2026-02-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
    },
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
  mockClient.sendConversationMessage.mockResolvedValue({
    text: "ok",
    agentName: "Milady",
  });
  mockClient.truncateConversationMessages.mockResolvedValue({
    ok: true,
    deletedCount: 0,
  });
  mockClient.sendConversationMessageStream.mockResolvedValue({
    text: "ok",
    agentName: "Milady",
  });
  mockClient.requestGreeting.mockResolvedValue({
    text: "hello",
    agentName: "Milady",
    generated: true,
    persisted: false,
  });
  mockClient.listCustomActions.mockResolvedValue([]);
  mockClient.testCustomAction.mockResolvedValue({
    ok: true,
    output: "ok",
    durationMs: 10,
  });
  mockClient.rememberMemory.mockResolvedValue({
    ok: true,
    id: "mem-1",
    text: "saved",
    createdAt: Date.now(),
  });
  mockClient.searchMemory.mockResolvedValue({
    query: "q",
    results: [],
    count: 0,
    limit: 6,
  });
  mockClient.searchKnowledge.mockResolvedValue({
    query: "q",
    threshold: 0.2,
    results: [],
    count: 0,
  });
  mockClient.quickContext.mockResolvedValue({
    query: "q",
    answer: "quick answer",
    memories: [],
    knowledge: [],
  });
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
  mockClient.renameConversation.mockResolvedValue({
    conversation: {
      id: "conv-1",
      title: "Chat",
      roomId: "room-1",
      createdAt: "2026-02-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
    },
  });
  mockClient.deleteConversation.mockResolvedValue({ ok: true });
}

describe("Companion chat queue e2e", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, "", "/companion");
    Object.assign(window, {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
    });
    Object.assign(document.documentElement, { setAttribute: vi.fn() });

    resetMockClient();
    mockUseVoiceChat.mockReset();
    mockUseVoiceChat.mockReturnValue({
      supported: true,
      isListening: false,
      captureMode: "idle",
      interimTranscript: "",
      toggleListening: vi.fn(),
      startListening: vi.fn(),
      stopListening: vi.fn(),
      mouthOpen: 0,
      isSpeaking: false,
      usingAudioAnalysis: false,
      speak: vi.fn(),
      queueAssistantSpeech: vi.fn(),
      stopSpeaking: vi.fn(),
    });
  });

  it("lets companion mode queue a second message while the first reply is still streaming", async () => {
    const firstReply = createDeferred<{ text: string; agentName: string }>();
    const secondReply = createDeferred<{ text: string; agentName: string }>();
    const sentTexts: string[] = [];

    // Track accumulated messages so loadConversationMessages (called after
    // each successful send) returns the correct server-side state.
    const serverMessages: Array<{
      id: string;
      role: string;
      text: string;
      timestamp: number;
    }> = [
      {
        id: "msg-1",
        role: "assistant",
        text: "hello",
        timestamp: Date.now(),
      },
    ];

    vi.mocked(client.getConversationMessages).mockImplementation(async () => ({
      messages: [...serverMessages],
    }));

    vi.mocked(client.sendConversationMessageStream).mockImplementation(
      async (_conversationId: string, text: string) => {
        sentTexts.push(text);
        const reply =
          sentTexts.length === 1 ? firstReply.promise : secondReply.promise;
        const data = await reply;
        // Simulate server persisting the user + assistant turn
        const now = Date.now();
        serverMessages.push(
          { id: `srv-user-${now}`, role: "user", text, timestamp: now },
          {
            id: `srv-asst-${now}`,
            role: "assistant",
            text: data.text,
            timestamp: now,
          },
        );
        return data;
      },
    );

    let api: ProbeApi | null = null;
    let tree!: TestRenderer.ReactTestRenderer;

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
          React.createElement(ChatView, { variant: "game-modal" }),
        ),
      );
    });

    expect(api).not.toBeNull();

    await act(async () => {
      await api?.handleSelectConversation("conv-1");
    });

    const textarea = () => tree.root.findByType("textarea");
    const actionButton = () =>
      tree.root.findByProps({ "data-testid": "chat-composer-action" });

    await act(async () => {
      textarea().props.onChange({ target: { value: "first message" } });
    });

    await act(async () => {
      actionButton().props.onClick();
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(client.sendConversationMessageStream).toHaveBeenCalledTimes(1);
      expect(sentTexts).toEqual(["first message"]);
      expect(api?.snapshot().chatSending).toBe(true);
      expect(textarea().props.value).toBe("");
    });

    await act(async () => {
      textarea().props.onChange({ target: { value: "second message" } });
    });

    expect(textarea().props.disabled).toBe(false);

    await act(async () => {
      actionButton().props.onClick();
      await Promise.resolve();
    });

    expect(client.sendConversationMessageStream).toHaveBeenCalledTimes(1);
    expect(textarea().props.value).toBe("");

    await act(async () => {
      firstReply.resolve({ text: "first reply", agentName: "Milady" });
      await firstReply.promise;
    });

    await vi.waitFor(() => {
      expect(client.sendConversationMessageStream).toHaveBeenCalledTimes(2);
      expect(sentTexts).toEqual(["first message", "second message"]);
    });

    await act(async () => {
      secondReply.resolve({ text: "second reply", agentName: "Milady" });
      await secondReply.promise;
    });

    await vi.waitFor(() => {
      expect(api?.snapshot()).toEqual(
        expect.objectContaining({
          chatSending: false,
          conversationMessages: expect.arrayContaining([
            expect.objectContaining({ role: "user", text: "first message" }),
            expect.objectContaining({
              role: "assistant",
              text: "first reply",
            }),
            expect.objectContaining({ role: "user", text: "second message" }),
            expect.objectContaining({
              role: "assistant",
              text: "second reply",
            }),
          ]),
        }),
      );
    });

    await act(async () => {
      tree.unmount();
    });
  });
});
