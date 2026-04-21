// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
  source?: string;
};

interface ChatViewContextStub {
  agentStatus: {
    agentName: string;
    state?: "starting" | "restarting" | "running" | "paused";
  } | null;
  activeConversationId: string | null;
  chatInput: string;
  chatSending: boolean;
  chatFirstTokenReceived: boolean;
  companionMessageCutoffTs: number;
  conversationMessages: ChatMessage[];
  handleChatSend: (channelType?: string) => Promise<void>;
  handleChatStop: () => void;
  handleChatRetry: (id: string) => void;
  handleChatEdit: (id: string, text: string) => Promise<boolean>;
  handleNewConversation: () => Promise<void>;
  setState: (key: string, value: unknown) => void;
  droppedFiles: string[];
  shareIngestNotice: string;
  chatMode: "simple" | "power";
  chatAgentVoiceMuted: boolean;
  elizaCloudEnabled: boolean;
  elizaCloudVoiceProxyAvailable: boolean;
  elizaCloudConnected: boolean;
  elizaCloudHasPersistedKey: boolean;
  selectedVrmIndex: number;
  uiLanguage: "en" | "zh-CN";
  t: (k: string) => string;
}

const {
  mockClient,
  mockUseApp,
  mockUseCompanionSceneStatus,
  mockUseVoiceChat,
} = vi.hoisted(() => ({
  mockClient: {
    getConfig: vi.fn(),
    updateConfig: vi.fn(),
  },
  mockUseApp: vi.fn(),
  mockUseCompanionSceneStatus: vi.fn(),
  mockUseVoiceChat: vi.fn(),
}));

vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => mockUseApp(),
  useChatComposer: () => {
    const context = mockUseApp();
    return {
      chatInput: context.chatInput ?? "",
      chatSending: context.chatSending ?? false,
      chatPendingImages: context.chatPendingImages ?? [],
      setChatInput: vi.fn(),
      setChatPendingImages: context.setChatPendingImages ?? vi.fn(),
    };
  },
  usePtySessions: () => ({ ptySessions: [] }),
  getVrmPreviewUrl: () => null,
}));

vi.mock("@miladyai/app-core/platform", () => ({
  isDesktopPlatform: () => false,
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

async function companionSceneStatusStub() {
  const actual = await vi.importActual<
    typeof import("../../src/components/companion-scene-status-context")
  >("../../src/components/companion-scene-status-context");
  return {
    ...actual,
    useCompanionSceneStatus: () => mockUseCompanionSceneStatus(),
  };
}

vi.mock("../../src/components/companion-scene-status-context", () =>
  companionSceneStatusStub(),
);
vi.mock("../../src/components/companion-scene-status-context.ts", () =>
  companionSceneStatusStub(),
);

vi.mock("@miladyai/app-core/api", () => ({
  client: mockClient,
}));

import { textOf } from "../../../../test/helpers/react-test";
import { CompanionSceneStatusContext } from "../../src/components/companion-scene-status-context";
import {
  __resetCompanionSpeechMemoryForTests,
  ChatView,
} from "../../src/components/pages/ChatView";

function createContext(
  overrides?: Partial<ChatViewContextStub>,
): ChatViewContextStub {
  return {
    agentStatus: { agentName: "Milady", state: "running" },
    activeConversationId: "conv-1",
    chatInput: "Hello",
    chatSending: false,
    chatFirstTokenReceived: false,
    companionMessageCutoffTs: 0,
    conversationMessages: [],
    handleChatSend: vi.fn(async () => {}),
    handleChatStop: vi.fn(),
    handleChatRetry: vi.fn(),
    handleChatEdit: vi.fn(async () => true),
    handleNewConversation: vi.fn(async () => {}),
    setState: vi.fn(),
    droppedFiles: [],
    shareIngestNotice: "",
    chatMode: "simple",
    chatAgentVoiceMuted: false,
    elizaCloudEnabled: false,
    elizaCloudVoiceProxyAvailable: false,
    elizaCloudConnected: false,
    elizaCloudHasPersistedKey: false,
    selectedVrmIndex: 0,
    uiLanguage: "en",
    chatPendingImages: [],
    setChatPendingImages: vi.fn(),
    t: (k: string) => k,
    ...overrides,
  };
}

function createGameModalElement() {
  return React.createElement(
    CompanionSceneStatusContext.Provider,
    { value: mockUseCompanionSceneStatus() },
    React.createElement(ChatView, { variant: "game-modal" }),
  );
}

describe("ChatView game-modal variant", () => {
  beforeEach(() => {
    __resetCompanionSpeechMemoryForTests();
    mockUseApp.mockReset();
    mockUseCompanionSceneStatus.mockReset();
    mockUseVoiceChat.mockReset();
    mockClient.getConfig.mockReset();
    mockClient.updateConfig.mockReset();
    Object.defineProperty(window, "dispatchEvent", {
      value: vi.fn(),
      configurable: true,
      writable: true,
    });

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
      voiceUnlockedGeneration: 0,
      assistantTtsQuality: "standard",
    });
    mockUseCompanionSceneStatus.mockReturnValue({
      avatarReady: true,
      teleportKey: "vrm-1",
    });
    mockClient.getConfig.mockResolvedValue({});
    mockClient.updateConfig.mockResolvedValue({});
  });

  afterEach(() => {
    __resetCompanionSpeechMemoryForTests();
    vi.useRealTimers();
  });

  it("hides source tags in game-modal bubbles", async () => {
    mockUseApp.mockReturnValue(
      createContext({
        conversationMessages: [
          {
            id: "assistant-1",
            role: "assistant",
            text: "Acknowledged",
            timestamp: Date.now(),
            source: "discord",
          },
        ],
      }),
    );

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        createGameModalElement(),
      );
    });

    const text = textOf(tree?.root).toLowerCase();
    expect(text).toContain("acknowledged");
    expect(text).not.toContain("via discord");
    expect(text).not.toContain("milady");
  });

  it("shows only the last two companion messages", async () => {
    mockUseApp.mockReturnValue(
      createContext({
        conversationMessages: [
          { id: "m1", role: "assistant", text: "one", timestamp: 1 },
          { id: "m2", role: "user", text: "two", timestamp: 2 },
          { id: "m3", role: "assistant", text: "three", timestamp: 3 },
          { id: "m4", role: "user", text: "four", timestamp: 4 },
          { id: "m5", role: "assistant", text: "five", timestamp: 5 },
          { id: "m6", role: "user", text: "six", timestamp: 6 },
          { id: "m7", role: "assistant", text: "seven", timestamp: 7 },
        ],
      }),
    );

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        createGameModalElement(),
      );
    });

    const text = textOf(tree?.root).toLowerCase();
    expect(text).not.toContain("one");
    expect(text).not.toContain("two");
    expect(text).toContain("six");
    expect(text).toContain("seven");
    expect(text).not.toContain("three");
    expect(text).not.toContain("four");
    expect(text).not.toContain("five");
  });

  it("keeps the companion empty state idle when chat is empty", async () => {
    mockUseApp.mockReturnValue(createContext({ conversationMessages: [] }));

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        createGameModalElement(),
      );
    });

    const text = textOf(tree?.root).toLowerCase();
    expect(text).not.toContain("hey milady");
    expect(text).not.toContain("draft welcome prompt");
    expect(text).not.toContain(
      "send me a message in the dock below to get started",
    );
    expect(text).not.toContain("give me a quick status update");
    expect(text).not.toContain("help me decide what to do next");
  });

  it("queues assistant speech in companion mode while a response is streaming", async () => {
    const queueAssistantSpeech = vi.fn();
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
      queueAssistantSpeech,
      stopSpeaking: vi.fn(),
      voiceUnlockedGeneration: 0,
      assistantTtsQuality: "standard",
    });
    mockUseApp.mockReturnValue(
      createContext({
        chatSending: true,
        conversationMessages: [
          { id: "assistant-1", role: "assistant", text: "hello", timestamp: 1 },
        ],
      }),
    );

    await act(async () => {
      TestRenderer.create(
        createGameModalElement(),
      );
    });

    expect(queueAssistantSpeech).toHaveBeenCalledWith(
      "assistant-1",
      "hello",
      false,
    );
  });

  it("uses explicit cloud voice routing instead of generic cloud inference state", async () => {
    mockUseApp.mockReturnValue(
      createContext({
        elizaCloudEnabled: false,
        elizaCloudVoiceProxyAvailable: true,
        elizaCloudConnected: true,
      }),
    );

    await act(async () => {
      TestRenderer.create(createGameModalElement());
    });

    expect(mockUseVoiceChat).toHaveBeenCalledWith(
      expect.objectContaining({
        cloudConnected: true,
      }),
    );
  });

  it("queues companion auto-speak once under StrictMode for a fresh message", async () => {
    const queueAssistantSpeech = vi.fn();
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
      queueAssistantSpeech,
      stopSpeaking: vi.fn(),
      voiceUnlockedGeneration: 0,
      assistantTtsQuality: "standard",
    });
    let currentContext = createContext({
      conversationMessages: [],
    });
    mockUseApp.mockImplementation(() => currentContext);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(
          React.StrictMode,
          null,
          createGameModalElement(),
        ),
      );
    });

    currentContext = createContext({
      conversationMessages: [
        { id: "assistant-1", role: "assistant", text: "hello", timestamp: 1 },
      ],
    });

    await act(async () => {
      tree.update(
        React.createElement(
          React.StrictMode,
          null,
          createGameModalElement(),
        ),
      );
    });

    expect(queueAssistantSpeech).toHaveBeenCalledTimes(1);
    expect(queueAssistantSpeech).toHaveBeenCalledWith(
      "assistant-1",
      "hello",
      true,
    );
  });

  it("waits for teleport completion before queueing companion speech", async () => {
    const queueAssistantSpeech = vi.fn();
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
      queueAssistantSpeech,
      stopSpeaking: vi.fn(),
      voiceUnlockedGeneration: 0,
      assistantTtsQuality: "standard",
    });
    let currentContext = createContext({
      conversationMessages: [],
    });
    mockUseApp.mockImplementation(() => currentContext);
    mockUseCompanionSceneStatus.mockReturnValue({
      avatarReady: false,
      teleportKey: "vrm-2",
    });

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        createGameModalElement(),
      );
    });

    expect(queueAssistantSpeech).not.toHaveBeenCalled();

    currentContext = createContext({
      conversationMessages: [
        { id: "assistant-1", role: "assistant", text: "hello", timestamp: 1 },
      ],
    });

    await act(async () => {
      tree.update(createGameModalElement());
    });

    expect(queueAssistantSpeech).not.toHaveBeenCalled();

    mockUseCompanionSceneStatus.mockReturnValue({
      avatarReady: true,
      teleportKey: "vrm-2",
    });

    await act(async () => {
      tree.update(createGameModalElement());
    });

    expect(queueAssistantSpeech).toHaveBeenCalledTimes(1);
    expect(queueAssistantSpeech).toHaveBeenCalledWith(
      "assistant-1",
      "hello",
      true,
    );
  });

  it("does not replay the last completed assistant line when companion mounts", async () => {
    const queueAssistantSpeech = vi.fn();
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
      queueAssistantSpeech,
      stopSpeaking: vi.fn(),
      voiceUnlockedGeneration: 0,
      assistantTtsQuality: "standard",
    });
    mockUseApp.mockReturnValue(
      createContext({
        activeConversationId: "conv-1",
        conversationMessages: [
          { id: "assistant-1", role: "assistant", text: "hello", timestamp: 1 },
        ],
      }),
    );

    await act(async () => {
      TestRenderer.create(
        createGameModalElement(),
      );
    });

    expect(queueAssistantSpeech).not.toHaveBeenCalled();
  });

  it("does not replay the same companion line after remounting the dock", async () => {
    const queueAssistantSpeech = vi.fn();
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
      queueAssistantSpeech,
      stopSpeaking: vi.fn(),
      voiceUnlockedGeneration: 0,
      assistantTtsQuality: "standard",
    });

    let currentContext = createContext({
      activeConversationId: "conv-1",
      conversationMessages: [],
    });
    mockUseApp.mockImplementation(() => currentContext);

    let firstTree: TestRenderer.ReactTestRenderer | undefined;
    let secondTree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      firstTree = TestRenderer.create(
        createGameModalElement(),
      );
    });

    currentContext = createContext({
      activeConversationId: "conv-1",
      conversationMessages: [
        { id: "assistant-1", role: "assistant", text: "hello", timestamp: 1 },
      ],
    });

    await act(async () => {
      firstTree?.update(
        createGameModalElement(),
      );
    });

    await act(async () => {
      firstTree?.unmount();
    });

    mockUseApp.mockImplementation(() =>
      createContext({
        activeConversationId: "conv-1",
        conversationMessages: [
          { id: "assistant-1", role: "assistant", text: "hello", timestamp: 1 },
        ],
      }),
    );

    await act(async () => {
      secondTree = TestRenderer.create(
        createGameModalElement(),
      );
    });

    expect(queueAssistantSpeech).toHaveBeenCalledTimes(1);

    await act(async () => {
      secondTree?.unmount();
    });
  });

  it("hides companion messages older than the cutoff timestamp", async () => {
    mockUseApp.mockReturnValue(
      createContext({
        companionMessageCutoffTs: 4,
        conversationMessages: [
          { id: "m1", role: "assistant", text: "one", timestamp: 1 },
          { id: "m2", role: "user", text: "two", timestamp: 2 },
          { id: "m3", role: "assistant", text: "three", timestamp: 3 },
          { id: "m4", role: "user", text: "four", timestamp: 4 },
          { id: "m5", role: "assistant", text: "five", timestamp: 5 },
        ],
      }),
    );

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        createGameModalElement(),
      );
    });

    const text = textOf(tree?.root).toLowerCase();
    expect(text).not.toContain("one");
    expect(text).not.toContain("two");
    expect(text).not.toContain("three");
    expect(text).toContain("four");
    expect(text).toContain("five");
  });

  it("falls back to the active thread when the cutoff hides every message", async () => {
    mockUseApp.mockReturnValue(
      createContext({
        companionMessageCutoffTs: 999,
        conversationMessages: [
          { id: "m1", role: "assistant", text: "one", timestamp: 1 },
          { id: "m2", role: "user", text: "two", timestamp: 2 },
          { id: "m3", role: "assistant", text: "three", timestamp: 3 },
        ],
      }),
    );

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        createGameModalElement(),
      );
    });

    const text = textOf(tree?.root).toLowerCase();
    expect(text).not.toContain("one");
    expect(text).toContain("two");
    expect(text).toContain("three");
  });

  it("keeps mic and send controls usable in game-modal", async () => {
    const handleChatSend = vi.fn(async () => {});
    mockUseApp.mockReturnValue(
      createContext({
        handleChatSend,
        chatInput: "test",
        conversationMessages: [
          {
            id: "user-1",
            role: "user",
            text: "test",
            timestamp: Date.now(),
          },
        ],
      }),
    );

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        createGameModalElement(),
      );
    });

    // Find mic button by aria-label
    const micButton = tree?.root.findByProps({
      "aria-label": "chat.voiceInput",
    });
    expect(micButton).toBeTruthy();

    // Find send button - in game-modal it's the one with the Send icon and no text,
    // but it has handleChatSend in onClick.
    const buttons = tree?.root.findAllByType("button" as React.ElementType);
    const sendButton = buttons.find((b) =>
      b.props.onClick?.toString().includes("handleChatSend"),
    );
    expect(sendButton).toBeTruthy();

    await act(async () => {
      sendButton?.props.onClick();
    });
    expect(handleChatSend).toHaveBeenCalled();
  });

  it("keeps the companion composer interactive while a reply is streaming", async () => {
    const handleChatSend = vi.fn(async () => {});
    const handleChatStop = vi.fn();
    mockUseApp.mockReturnValue(
      createContext({
        chatSending: true,
        chatInput: "follow up",
        handleChatSend,
        handleChatStop,
      }),
    );

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        createGameModalElement(),
      );
    });

    const textarea = tree.root.findByType("textarea");
    const actionButton = tree.root.findByProps({
      "data-testid": "chat-composer-action",
    });

    expect(textarea.props.disabled).toBe(false);

    await act(async () => {
      actionButton.props.onClick();
    });

    expect(handleChatSend).toHaveBeenCalledTimes(1);
    expect(handleChatStop).not.toHaveBeenCalled();
  });

  it("does not pass linked cloud auth into the voice hook without cloud selection", async () => {
    mockUseApp.mockReturnValue(
      createContext({
        elizaCloudConnected: true,
      }),
    );

    await act(async () => {
      TestRenderer.create(
        createGameModalElement(),
      );
    });

    expect(mockUseVoiceChat).toHaveBeenCalledWith(
      expect.objectContaining({
        cloudConnected: false,
        interruptOnSpeech: true,
      }),
    );
  });

  it("uses the selected character voice for playback when the saved config is stale", async () => {
    mockUseApp.mockReturnValue(createContext());
    mockClient.getConfig.mockResolvedValue({
      ui: {
        presetId: "momo",
        avatarIndex: 4,
      },
      messages: {
        tts: {
          provider: "elevenlabs",
          mode: "cloud",
          elevenlabs: {
            voiceId: "Xb7hH8MSUJpSbSDYk0k2",
            modelId: "eleven_flash_v2_5",
          },
        },
      },
    });

    await act(async () => {
      TestRenderer.create(
        createGameModalElement(),
      );
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockUseVoiceChat).toHaveBeenLastCalledWith(
      expect.objectContaining({
        voiceConfig: expect.objectContaining({
          provider: "elevenlabs",
          mode: "cloud",
          elevenlabs: expect.objectContaining({
            voiceId: "n7Wi4g1bhpw4Bs8HK5ph",
            modelId: "eleven_flash_v2_5",
          }),
        }),
      }),
    );
    expect(mockClient.updateConfig).toHaveBeenCalledWith({
      messages: {
        tts: expect.objectContaining({
          provider: "elevenlabs",
          mode: "cloud",
          elevenlabs: expect.objectContaining({
            voiceId: "n7Wi4g1bhpw4Bs8HK5ph",
            modelId: "eleven_flash_v2_5",
          }),
        }),
      },
    });
  });

  it("does not treat generic cloud inference state as voice cloud access by itself", async () => {
    mockUseApp.mockReturnValue(
      createContext({
        elizaCloudEnabled: true,
        elizaCloudConnected: false,
      }),
    );

    await act(async () => {
      TestRenderer.create(
        createGameModalElement(),
      );
    });

    expect(mockUseVoiceChat).toHaveBeenCalledWith(
      expect.objectContaining({
        cloudConnected: false,
        interruptOnSpeech: true,
      }),
    );
  });

  it("does not treat a persisted Eliza Cloud API key as voice cloud access by itself", async () => {
    mockUseApp.mockReturnValue(
      createContext({
        elizaCloudEnabled: false,
        elizaCloudConnected: false,
        elizaCloudHasPersistedKey: true,
      }),
    );

    await act(async () => {
      TestRenderer.create(
        createGameModalElement(),
      );
    });

    expect(mockUseVoiceChat).toHaveBeenCalledWith(
      expect.objectContaining({
        cloudConnected: false,
        interruptOnSpeech: true,
      }),
    );
  });

  it("does not override persisted agent voice mute when mounting game-modal", async () => {
    const setState = vi.fn();
    mockUseApp.mockReturnValue(
      createContext({
        chatAgentVoiceMuted: true,
        setState,
      }),
    );

    await act(async () => {
      TestRenderer.create(
        createGameModalElement(),
      );
    });

    expect(setState).not.toHaveBeenCalledWith("chatAgentVoiceMuted", false);
  });

  it("disables composer controls while agent is starting", async () => {
    mockUseApp.mockReturnValue(
      createContext({
        agentStatus: { agentName: "Milady", state: "starting" },
      }),
    );

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        createGameModalElement(),
      );
    });

    const textarea = tree?.root.findByType("textarea");
    expect(textarea.props.disabled).toBe(true);
    expect(textarea.props.placeholder).toBe("chat.agentStarting");

    // Mic button should also be disabled and have the correct aria-label
    const micButton = tree?.root.findByProps({
      "aria-label": "chat.agentStarting",
    });
    expect(micButton.props.disabled).toBe(true);
  });

  it("keeps composer unlocked for zh-CN after turn lifecycle ends even with stale starting status", async () => {
    const lifecycleScenarios: Array<{
      label: string;
      messages: ChatMessage[];
    }> = [
      {
        label: "completion",
        messages: [
          { id: "user-1", role: "user", text: "你好", timestamp: 1 },
          {
            id: "assistant-1",
            role: "assistant",
            text: "你好呀",
            timestamp: 2,
          },
        ],
      },
      {
        label: "error",
        messages: [
          { id: "user-2", role: "user", text: "再试一次", timestamp: 3 },
        ],
      },
      {
        label: "cancel",
        messages: [
          { id: "user-3", role: "user", text: "先停一下", timestamp: 4 },
          {
            id: "assistant-3",
            role: "assistant",
            text: "好的，已停止",
            timestamp: 5,
          },
        ],
      },
    ];

    for (const scenario of lifecycleScenarios) {
      mockUseApp.mockReturnValue(
        createContext({
          uiLanguage: "zh-CN",
          agentStatus: { agentName: "Milady", state: "starting" },
          chatSending: false,
          chatFirstTokenReceived: false,
          conversationMessages: scenario.messages,
        }),
      );

      let tree: TestRenderer.ReactTestRenderer;
      await act(async () => {
        tree = TestRenderer.create(
          createGameModalElement(),
        );
      });

      const textarea = tree.root.findByType("textarea");
      expect(textarea.props.disabled).toBe(
        false,
        `expected unlocked composer for ${scenario.label}`,
      );

      await act(async () => {
        tree.unmount();
      });
    }
  });

  it("renders the game-modal composer unfocused with level control sizing", async () => {
    const focus = vi.fn();

    mockUseApp.mockReturnValue(createContext({ chatInput: "" }));

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        createGameModalElement(),
        {
          createNodeMock: (element) => {
            const node = element as {
              type: unknown;
              props: Record<string, unknown>;
            };
            if (node.type === "textarea") {
              return {
                style: { height: "", overflowY: "" },
                scrollHeight: 38,
                focus,
              };
            }
            return {};
          },
        },
      );
    });

    const textarea = tree?.root.findByType("textarea");
    const actionButton = tree?.root.findByProps({
      "data-testid": "chat-composer-action",
    });
    expect(focus).not.toHaveBeenCalled();
    expect(String(textarea.props.className)).toContain("h-[46px]");
    expect(String(textarea.props.className)).toContain("py-2");
    expect(String(textarea.props.className)).toContain("focus:ring-0");
    expect(String(actionButton.props.className)).not.toContain("mb-1.5");
  });

  it("keeps only the latest two rendered companion rows", async () => {
    mockUseApp.mockReturnValue(
      createContext({
        conversationMessages: [
          { id: "assistant-1", role: "assistant", text: "one", timestamp: 1 },
          { id: "user-1", role: "user", text: "two", timestamp: 2 },
          { id: "assistant-2", role: "assistant", text: "three", timestamp: 3 },
          { id: "user-2", role: "user", text: "four", timestamp: 4 },
          { id: "assistant-3", role: "assistant", text: "five", timestamp: 5 },
        ],
      }),
    );

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        createGameModalElement(),
      );
    });

    const rows = tree?.root.findAllByProps({
      "data-testid": "companion-message-row",
    });

    expect(rows).toHaveLength(2);
    const firstRow = rows[0];
    const secondRow = rows[1];
    expect(firstRow).toBeDefined();
    expect(secondRow).toBeDefined();
    expect(textOf(firstRow).toLowerCase()).toContain("four");
    expect(textOf(secondRow).toLowerCase()).toContain("five");
  });

  it("keeps the previous exchange for 30 seconds after a new send, then fades it out", async () => {
    vi.useFakeTimers();

    let currentContext = createContext({
      companionMessageCutoffTs: 10,
      conversationMessages: [
        { id: "user-1", role: "user", text: "hello", timestamp: 10 },
        { id: "assistant-1", role: "assistant", text: "hi", timestamp: 11 },
      ],
    });
    mockUseApp.mockImplementation(() => currentContext);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        createGameModalElement(),
      );
    });

    currentContext = createContext({
      companionMessageCutoffTs: 20,
      conversationMessages: [
        { id: "user-1", role: "user", text: "hello", timestamp: 10 },
        { id: "assistant-1", role: "assistant", text: "hi", timestamp: 11 },
        { id: "user-2", role: "user", text: "new question", timestamp: 20 },
      ],
    });

    await act(async () => {
      tree.update(createGameModalElement());
    });

    let rows = tree.root.findAllByProps({
      "data-testid": "companion-message-row",
    });
    expect(rows).toHaveLength(3);
    expect(textOf(rows[0]).toLowerCase()).toContain("hello");
    expect(textOf(rows[1]).toLowerCase()).toContain("hi");
    expect(textOf(rows[2]).toLowerCase()).toContain("new question");

    await act(async () => {
      vi.advanceTimersByTime(30_250);
    });

    rows = tree.root.findAllByProps({
      "data-testid": "companion-message-row",
    });
    const carryoverRows = tree.root.findAllByProps({
      "data-companion-carryover": "true",
    });
    expect(rows).toHaveLength(3);
    expect(carryoverRows).toHaveLength(2);
    expect(carryoverRows[0]?.props.style.opacity).toBeLessThan(1);

    await act(async () => {
      vi.advanceTimersByTime(5_100);
    });

    rows = tree.root.findAllByProps({
      "data-testid": "companion-message-row",
    });
    expect(rows).toHaveLength(1);
    expect(textOf(rows[0]).toLowerCase()).toContain("new question");
  });

  it("clears companion carryover when a new conversation replaces the active thread", async () => {
    vi.useFakeTimers();

    let currentContext = createContext({
      activeConversationId: "conv-1",
      companionMessageCutoffTs: 10,
      conversationMessages: [
        { id: "user-1", role: "user", text: "hello", timestamp: 10 },
        { id: "assistant-1", role: "assistant", text: "hi", timestamp: 11 },
      ],
    });
    mockUseApp.mockImplementation(() => currentContext);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        createGameModalElement(),
      );
    });

    currentContext = createContext({
      activeConversationId: null,
      companionMessageCutoffTs: 20,
      conversationMessages: [],
    });

    await act(async () => {
      tree.update(createGameModalElement());
    });

    expect(
      tree.root.findAllByProps({ "data-testid": "companion-message-row" }),
    ).toHaveLength(0);
    expect(
      tree.root.findAllByProps({ "data-companion-carryover": "true" }),
    ).toHaveLength(0);

    currentContext = createContext({
      activeConversationId: "conv-2",
      companionMessageCutoffTs: 21,
      conversationMessages: [
        {
          id: "greeting-1",
          role: "assistant",
          text: "Hey, I'm back.",
          timestamp: 21,
          source: "agent_greeting",
        },
      ],
    });

    await act(async () => {
      tree.update(createGameModalElement());
    });

    const rows = tree.root.findAllByProps({
      "data-testid": "companion-message-row",
    });
    expect(rows).toHaveLength(1);
    expect(textOf(rows[0]).toLowerCase()).toContain("hey, i'm back.");
    expect(textOf(tree.root).toLowerCase()).not.toContain("hello");
    expect(textOf(tree.root).toLowerCase()).not.toContain("hi");
  });

  it("keeps the companion transcript scrollable while leaving the composer interactive", async () => {
    mockUseApp.mockReturnValue(
      createContext({
        conversationMessages: [
          {
            id: "assistant-1",
            role: "assistant",
            text: "Acknowledged",
            timestamp: Date.now(),
          },
        ],
      }),
    );

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        createGameModalElement(),
      );
    });

    const messages = tree?.root.findByProps({
      "data-testid": "chat-messages-scroll",
    });
    const composer = tree?.root.findByProps({
      "data-no-camera-drag": "true",
    });

    expect(messages.props["data-no-camera-drag"]).toBe(false);
    expect(messages.props["data-no-camera-zoom"]).toBe(false);
    expect(String(messages.props.className)).toContain("pointer-events-auto");
    expect(String(messages.props.className)).toContain("overflow-y-auto");
    expect(messages.props.style.maskImage).toContain("linear-gradient");
    expect(messages.props.style.touchAction).toBe("pan-y");
    expect(composer).toBeTruthy();
  });

  it("uses theme-aware surfaces for companion bubbles and composer glass", async () => {
    mockUseApp.mockReturnValue(
      createContext({
        chatInput: "Theme me",
        chatSending: true,
        chatFirstTokenReceived: false,
        conversationMessages: [
          {
            id: "assistant-1",
            role: "assistant",
            text: "Acknowledged",
            timestamp: Date.now(),
          },
          {
            id: "user-1",
            role: "user",
            text: "Okay",
            timestamp: Date.now() + 1,
          },
        ],
      }),
    );

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        createGameModalElement(),
      );
    });

    const rows = tree.root.findAllByProps({
      "data-testid": "companion-message-row",
    });
    const assistantBubble = rows[0]?.find(
      (node) =>
        node.type === "div" &&
        typeof node.props.className === "string" &&
        node.props.className.includes("border-border/32"),
    );
    const userBubble = rows[1]?.find(
      (node) =>
        node.type === "div" &&
        typeof node.props.className === "string" &&
        node.props.className.includes("border-accent/24"),
    );
    const composerDock = tree.root.findByProps({
      "data-no-camera-drag": "true",
    });
    const composerGlass = tree.root.find(
      (node) =>
        node.type === "div" &&
        node.props["aria-hidden"] === true &&
        typeof node.props.className === "string" &&
        node.props.className.includes("backdrop-blur-[22px]"),
    );

    expect(String(assistantBubble?.props.className)).toContain(
      "border-border/32",
    );
    expect(String(assistantBubble?.props.className)).toContain("text-txt");
    expect(String(userBubble?.props.className)).toContain("border-accent/24");
    expect(String(userBubble?.props.className)).toContain("text-txt-strong");
    expect(String(composerDock.props.className)).toContain("px-1");
    expect(String(composerDock.props.style.paddingBottom)).toContain(
      "safe-area-inset-bottom",
    );
    expect(String(composerGlass.props.className)).toContain("var(--card)");
    expect(String(composerGlass.props.className)).toContain("var(--bg)");
  });
});
