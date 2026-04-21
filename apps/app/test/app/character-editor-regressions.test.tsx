// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  clientMock,
  dispatchWindowEventMock,
  useAppMock,
  audioConstructorMock,
} = vi.hoisted(() => ({
  clientMock: {
    generateCharacterField: vi.fn(),
    getConfig: vi.fn(),
    streamVoiceSpeak: vi.fn(),
    updateConfig: vi.fn(),
  },
  dispatchWindowEventMock: vi.fn(),
  useAppMock: vi.fn(),
  audioConstructorMock: vi.fn(),
}));

vi.mock("@miladyai/app-core/api/client", () => ({
  client: clientMock,
}));

vi.mock("@miladyai/app-core/events", () => ({
  APP_EMOTE_EVENT: "app:emote",
  VOICE_CONFIG_UPDATED_EVENT: "voice-config-updated",
  VRM_TELEPORT_COMPLETE_EVENT: "vrm:teleport-complete",
  dispatchWindowEvent: dispatchWindowEventMock,
}));

vi.mock("@miladyai/app-core/state/useApp", () => ({
  useApp: useAppMock,
}));

vi.mock("@miladyai/app-core/state", () => ({
  useApp: useAppMock,
  CUSTOM_ONBOARDING_STEPS: [],
  VRM_COUNT: 4,
  getVrmPreviewUrl: (index: number) => `/avatars/preview-${index}.png`,
  getVrmTitle: (index: number) => `Avatar ${index}`,
}));

vi.mock("@miladyai/app-core/hooks", () => ({
  useVoiceChat: () => ({
    mouthOpen: false,
    isSpeaking: false,
    usingAudioAnalysis: false,
    speak: vi.fn(),
    stopSpeaking: vi.fn(),
  }),
  useChatAvatarVoiceBridge: () => {},
}));

vi.mock("@miladyai/app-core/voice/types", () => ({
  PREMADE_VOICES: [
    {
      id: "voice-preset-1",
      name: "Preview Voice",
      gender: "female",
      voiceId: "voice-123",
      previewUrl: "https://cdn.example.com/preview.mp3",
    },
  ],
  EDGE_BACKUP_VOICES: [],
}));

vi.mock("@miladyai/app-core/voice/utils", () => ({
  sanitizeApiKey: (value: string | undefined) => value?.trim() ?? "",
}));

vi.mock("@miladyai/ui", () => {
  const React = require("react") as typeof import("react");

  const DummyComponent = ({ children }: React.PropsWithChildren) =>
    React.createElement("div", null, children);

  return {
    ConfirmDialog: DummyComponent,
    ErrorBoundary: DummyComponent,
    PromptDialog: DummyComponent,
    SaveFooter: DummyComponent,
    Skeleton: DummyComponent,
    SkeletonCard: DummyComponent,
    SkeletonChat: DummyComponent,
    SkeletonLine: DummyComponent,
    SkeletonMessage: DummyComponent,
    SkeletonSidebar: DummyComponent,
    SkeletonText: DummyComponent,
    StatCard: DummyComponent,
    StatusBadge: DummyComponent,
    StatusDot: DummyComponent,
    Switch: DummyComponent,
    statusToneForBoolean: () => "neutral",
    useConfirm: () => () => {},
    usePrompt: () => () => {},
    Button: ({
      children,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      React.createElement("button", props, children),
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
      React.createElement("input", props),
    Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) =>
      React.createElement("textarea", props),
    ThemedSelect: ({
      groups,
      onChange,
      value,
      ...props
    }: {
      groups: Array<{ items: Array<{ id: string; text: string }> }>;
      onChange: (value: string) => void;
      value: string | null;
    }) =>
      React.createElement(
        "select",
        {
          ...props,
          onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
            onChange(event.target.value),
          value: value ?? "",
        },
        groups.flatMap((group) =>
          group.items.map((item) =>
            React.createElement(
              "option",
              { key: item.id, value: item.id },
              item.text,
            ),
          ),
        ),
      ),
  };
});

vi.mock("@miladyai/app-core/components/character/CharacterRoster", () => {
  const ReactMock = require("react");
  return {
    CharacterRoster: () =>
      ReactMock.createElement("div", { "data-testid": "character-roster" }),
    resolveRosterEntries: () => [
      {
        id: "chen",
        name: "Chen",
        avatarIndex: 1,
        catchphrase: "chaotic",
        preset: {
          bio: ["bio"],
          system: "You are {{name}}",
          adjectives: ["curious"],
          style: { all: [], chat: [], post: [] },
          messageExamples: [],
          postExamples: [],
        },
      },
    ],
  };
});

import { CharacterEditor } from "@miladyai/app-core/components/character/CharacterEditor";

function createAppState() {
  return {
    tab: "character",
    setTab: vi.fn(),
    characterData: { name: "Chen" },
    characterDraft: {
      name: "Chen",
      bio: "bio",
      system: "system",
      style: { all: [], chat: [], post: [] },
      messageExamples: [],
      postExamples: [],
      adjectives: [],
    },
    characterLoading: false,
    characterSaving: false,
    characterSaveSuccess: null,
    characterSaveError: null,
    handleCharacterFieldInput: vi.fn(),
    handleCharacterArrayInput: vi.fn(),
    handleCharacterStyleInput: vi.fn(),
    handleSaveCharacter: vi.fn(),
    loadCharacter: vi.fn(async () => {}),
    setState: vi.fn(),
    onboardingOptions: {
      styles: [
        {
          catchphrase: "chaotic",
          bio: ["bio"],
          system: "You are {{name}}",
          adjectives: ["curious"],
          style: { all: [], chat: [], post: [] },
          messageExamples: [],
          postExamples: [],
        },
      ],
    },
    selectedVrmIndex: 0,
    t: vi.fn(
      (value: string, options?: { defaultValue?: string }) =>
        options?.defaultValue ?? value,
    ),
    registryStatus: null,
    registryLoading: false,
    registryRegistering: false,
    registryError: null,
    dropStatus: null,
    loadRegistryStatus: vi.fn(async () => {}),
    registerOnChain: vi.fn(async () => {}),
    syncRegistryProfile: vi.fn(async () => {}),
    loadDropStatus: vi.fn(async () => {}),
    walletConfig: null,
  };
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe("CharacterEditor regressions", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    clientMock.generateCharacterField.mockReset();
    clientMock.getConfig.mockReset();
    clientMock.streamVoiceSpeak.mockReset();
    clientMock.updateConfig.mockReset();
    dispatchWindowEventMock.mockReset();
    useAppMock.mockReset();
    audioConstructorMock.mockReset();

    useAppMock.mockReturnValue(createAppState());
    clientMock.getConfig.mockResolvedValue({
      messages: {
        tts: {
          elevenlabs: {
            voiceId: "voice-123",
          },
        },
      },
    });
    clientMock.streamVoiceSpeak.mockResolvedValue(undefined);
    clientMock.updateConfig.mockResolvedValue(undefined);

    Object.defineProperty(globalThis, "Audio", {
      configurable: true,
      value: audioConstructorMock,
    });
  });

  it("surfaces generation errors instead of failing silently", async () => {
    clientMock.generateCharacterField.mockRejectedValue(
      new Error("Generation exploded"),
    );

    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(CharacterEditor, { sceneOverlay: true }),
      );
    });

    await flushEffects();
    expect(tree).not.toBeNull();
    if (!tree) {
      throw new Error("expected CharacterEditor to render");
    }
    const root = (tree as TestRenderer.ReactTestRenderer).root;

    const customizeBtn = root.find(
      (node: TestRenderer.ReactTestInstance) =>
        node.type === "button" &&
        Array.isArray(node.children) &&
        node.children.includes("Customize"),
    );
    await act(async () => {
      customizeBtn.props.onClick();
    });
    await flushEffects();

    const identityBtn = root.find(
      (node: TestRenderer.ReactTestInstance) =>
        node.type === "button" && node.children.includes("Character"),
    );
    await act(async () => {
      identityBtn.props.onClick();
    });
    await flushEffects();

    const regenerateButtons = root.findAll(
      (node: TestRenderer.ReactTestInstance) =>
        node.type === "button" &&
        Array.isArray(node.children) &&
        node.children.includes("regenerate"),
    );
    const regenerateButton = regenerateButtons[0];
    expect(regenerateButton).toBeDefined();
    if (!regenerateButton) {
      throw new Error("expected a regenerate button");
    }

    await act(async () => {
      await regenerateButton.props.onClick();
    });
    await flushEffects();

    expect(clientMock.generateCharacterField).toHaveBeenCalled();
    expect(JSON.stringify(tree.toJSON())).toContain("Generation exploded");
  });

  it("logs voice config load failures instead of swallowing them", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    clientMock.getConfig.mockRejectedValueOnce(new Error("config unavailable"));

    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CharacterEditor));
    });

    await flushEffects();

    expect(tree).not.toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      "[CharacterEditor] Failed to load voice config:",
      expect.objectContaining({ message: "config unavailable" }),
    );
  });

  it("logs malformed style JSON instead of failing silently", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    clientMock.generateCharacterField.mockResolvedValue({
      generated: "{not json",
    });

    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(CharacterEditor, { sceneOverlay: true }),
      );
    });

    await flushEffects();
    expect(tree).not.toBeNull();
    if (!tree) {
      throw new Error("expected CharacterEditor to render");
    }

    const root = tree.root;
    const customizeBtn = root.find(
      (node: TestRenderer.ReactTestInstance) =>
        node.type === "button" &&
        Array.isArray(node.children) &&
        node.children.includes("Customize"),
    );
    await act(async () => {
      customizeBtn.props.onClick();
    });
    await flushEffects();

    const styleTab = root.find(
      (node: TestRenderer.ReactTestInstance) =>
        node.type === "button" &&
        Array.isArray(node.children) &&
        node.children.includes("Styles"),
    );
    await act(async () => {
      styleTab.props.onClick();
    });
    await flushEffects();

    const regenerateButtons = root.findAll(
      (node: TestRenderer.ReactTestInstance) =>
        node.type === "button" &&
        Array.isArray(node.children) &&
        (node.children.includes("Regenerate") ||
          node.children.includes("charactereditor.Regenerate")),
    );
    const styleRegenerateButton = regenerateButtons.at(-1);
    expect(styleRegenerateButton).toBeDefined();
    if (!styleRegenerateButton) {
      throw new Error("expected a style regenerate button");
    }

    await act(async () => {
      await styleRegenerateButton.props.onClick();
    });
    await flushEffects();

    expect(warnSpy).toHaveBeenCalledWith(
      "[CharacterEditor] Failed to parse AI-generated style JSON:",
      expect.any(Error),
    );
  });

  it("uses cached preview audio instead of triggering TTS generation", async () => {
    let createdAudio: {
      currentTime: number;
      onended: (() => void) | undefined;
      onerror: (() => void) | undefined;
      pause: ReturnType<typeof vi.fn>;
      play: ReturnType<typeof vi.fn>;
    } | null = null;

    Object.defineProperty(globalThis, "Audio", {
      configurable: true,
      value: class MockAudio {
        currentTime = 0;
        onended: (() => void) | undefined;
        onerror: (() => void) | undefined;
        pause = vi.fn();
        play = vi.fn(() => Promise.resolve());

        constructor(url: string) {
          audioConstructorMock(url);
          createdAudio = this;
        }
      },
    });

    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(CharacterEditor, { sceneOverlay: true }),
      );
    });

    await flushEffects();
    expect(tree).not.toBeNull();
    if (!tree) {
      throw new Error("expected CharacterEditor to render");
    }
    const testRoot = (tree as TestRenderer.ReactTestRenderer).root;

    const customizeBtn = testRoot.find(
      (node) =>
        node.type === "button" &&
        Array.isArray(node.children) &&
        node.children.includes("Customize"),
    );
    await act(async () => {
      customizeBtn.props.onClick();
    });
    await flushEffects();

    // Character auto-selection speaks the catchphrase on mount; this test only
    // verifies the dedicated preview button path.
    clientMock.streamVoiceSpeak.mockClear();

    const playBtn = testRoot.find(
      (node: TestRenderer.ReactTestInstance) =>
        node.type === "button" && node.props["aria-label"] === "Preview voice",
    );

    await act(async () => {
      playBtn.props.onClick();
    });
    await flushEffects();

    expect(audioConstructorMock).toHaveBeenCalledWith(
      "https://cdn.example.com/preview.mp3",
    );
    expect(createdAudio).not.toBeNull();
    if (!createdAudio) {
      throw new Error("expected preview audio to be created");
    }

    expect(createdAudio.play).toHaveBeenCalled();
    expect(clientMock.streamVoiceSpeak).not.toHaveBeenCalled();
    expect(
      tree.root.findAll(
        (node) =>
          node.type === "button" &&
          node.props["aria-label"] === "Stop voice preview",
      ),
    ).toHaveLength(1);

    await act(async () => {
      createdAudio.onended?.();
    });
    await flushEffects();

    expect(
      tree.root.findAll(
        (node) =>
          node.type === "button" &&
          node.props["aria-label"] === "Preview voice",
      ),
    ).toHaveLength(1);
  });
});
