// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockClient, mockUseApp, mockUseVoiceChat } = vi.hoisted(() => ({
  mockClient: { getConfig: vi.fn() },
  mockUseApp: vi.fn(),
  mockUseVoiceChat: vi.fn(),
}));

vi.mock("@miladyai/ui", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement("button", { type: "button", ...props }, children),
}));

vi.mock("../../src/state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../src/api", () => ({
  client: mockClient,
}));

vi.mock("../../src/bridge", () => ({
  invokeDesktopBridgeRequest: vi.fn(),
  isElectrobunRuntime: () => false,
}));

vi.mock("../../src/config/branding", () => ({
  useBranding: () => ({ name: "Milady" }),
}));

vi.mock("../../src/hooks", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/hooks")
  >("../../src/hooks");
  return {
    ...actual,
    useVoiceChat: (...args: unknown[]) => mockUseVoiceChat(...args),
    useRetakeCapture: vi.fn(),
    useTimeout: () => ({ setTimeout: globalThis.setTimeout.bind(globalThis) }),
    useDocumentVisibility: () => true,
    useIntervalWhenDocumentVisible: vi.fn(),
  };
});

vi.mock("../../src/events", () => ({
  VOICE_CONFIG_UPDATED_EVENT: "eliza:voice-config-updated",
}));

import { GameView } from "../../src/components/GameView";

function createAppContext(overrides?: Record<string, unknown>) {
  return {
    activeGameApp: "test-game",
    activeGameDisplayName: "Test Game",
    activeGameViewerUrl: "https://example.com/game",
    activeGameSandbox: "",
    activeGamePostMessageAuth: null,
    activeGamePostMessagePayload: null,
    gameOverlayEnabled: false,
    chatInput: "",
    chatSending: false,
    conversationMessages: [],
    conversations: [],
    activeConversationId: "conv-1",
    handleChatSend: vi.fn(async () => {}),
    handleSelectConversation: vi.fn(async () => {}),
    handleNewConversation: vi.fn(async () => {}),
    agentStatus: { agentName: "Milady", state: "running" },
    chatAgentVoiceMuted: false,
    copyToClipboard: vi.fn(async () => {}),
    elizaCloudConnected: false,
    elizaCloudEnabled: false,
    plugins: [],
    logs: [],
    loadLogs: vi.fn(async () => {}),
    setState: vi.fn(),
    setActionNotice: vi.fn(),
    uiLanguage: "en",
    t: (k: string) => k,
    ...overrides,
  };
}

function createVoiceMock(overrides?: Record<string, unknown>) {
  return {
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
    ...overrides,
  };
}

describe("GameView TTS", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    mockUseVoiceChat.mockReset();
    mockClient.getConfig.mockReset();
    mockClient.getConfig.mockResolvedValue({});
    mockUseVoiceChat.mockReturnValue(createVoiceMock());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes voiceConfig to useVoiceChat after loading from server", async () => {
    const ttsConfig = { provider: "elevenlabs", elevenlabs: { voiceId: "v1" } };
    mockClient.getConfig.mockResolvedValue({ messages: { tts: ttsConfig } });
    mockUseApp.mockReturnValue(createAppContext());

    await act(async () => {
      TestRenderer.create(React.createElement(GameView));
    });

    const callArgs = mockUseVoiceChat.mock.calls.at(-1)?.[0];
    expect(callArgs).toMatchObject({ voiceConfig: ttsConfig });
  });

  it("auto-speaks new assistant messages when not muted", async () => {
    const queueAssistantSpeech = vi.fn();
    mockUseVoiceChat.mockReturnValue(
      createVoiceMock({ queueAssistantSpeech }),
    );
    mockUseApp.mockReturnValue(
      createAppContext({
        conversationMessages: [
          { id: "m1", role: "assistant", text: "Hello there", timestamp: 1 },
        ],
      }),
    );

    await act(async () => {
      TestRenderer.create(React.createElement(GameView));
    });

    expect(queueAssistantSpeech).toHaveBeenCalledWith(
      "m1",
      "Hello there",
      true,
    );
  });

  it("does not speak when chatAgentVoiceMuted is true", async () => {
    const queueAssistantSpeech = vi.fn();
    mockUseVoiceChat.mockReturnValue(
      createVoiceMock({ queueAssistantSpeech }),
    );
    mockUseApp.mockReturnValue(
      createAppContext({
        chatAgentVoiceMuted: true,
        conversationMessages: [
          { id: "m1", role: "assistant", text: "Hello", timestamp: 1 },
        ],
      }),
    );

    await act(async () => {
      TestRenderer.create(React.createElement(GameView));
    });

    expect(queueAssistantSpeech).not.toHaveBeenCalled();
  });

  it("does not speak when voice is listening", async () => {
    const queueAssistantSpeech = vi.fn();
    mockUseVoiceChat.mockReturnValue(
      createVoiceMock({ queueAssistantSpeech, isListening: true }),
    );
    mockUseApp.mockReturnValue(
      createAppContext({
        conversationMessages: [
          { id: "m1", role: "assistant", text: "Hello", timestamp: 1 },
        ],
      }),
    );

    await act(async () => {
      TestRenderer.create(React.createElement(GameView));
    });

    expect(queueAssistantSpeech).not.toHaveBeenCalled();
  });

  it("passes cloudConnected and lang to useVoiceChat", async () => {
    mockUseApp.mockReturnValue(
      createAppContext({ elizaCloudConnected: true, uiLanguage: "zh-CN" }),
    );

    await act(async () => {
      TestRenderer.create(React.createElement(GameView));
    });

    const callArgs = mockUseVoiceChat.mock.calls.at(-1)?.[0];
    expect(callArgs).toMatchObject({
      cloudConnected: true,
      lang: "zh-CN",
    });
  });
});
