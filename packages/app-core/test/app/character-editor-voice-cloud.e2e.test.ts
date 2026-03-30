// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { clientMock, dispatchWindowEventMock, useAppMock, fetchMock } =
  vi.hoisted(() => ({
    clientMock: {
      getConfig: vi.fn(),
      updateConfig: vi.fn(),
    },
    dispatchWindowEventMock: vi.fn(),
    useAppMock: vi.fn(),
    fetchMock: vi.fn(),
  }));

class MockAnalyserNode {
  fftSize = 0;
  smoothingTimeConstant = 0;

  connect() {}
  disconnect() {}
  getFloatTimeDomainData(data: Float32Array) {
    data.fill(0);
  }
}

class MockAudioBufferSourceNode {
  buffer: { duration: number } | null = null;
  onended: (() => void) | null = null;

  connect() {}
  disconnect() {}
  stop() {}
  start() {
    queueMicrotask(() => {
      this.onended?.();
    });
  }
}

class MockAudioContext {
  state: AudioContextState = "running";
  destination = {};

  async resume() {}
  async close() {}
  async decodeAudioData() {
    return { duration: 0.05 } as AudioBuffer;
  }
  createAnalyser() {
    return new MockAnalyserNode() as unknown as AnalyserNode;
  }
  createBufferSource() {
    return new MockAudioBufferSourceNode() as unknown as AudioBufferSourceNode;
  }
}

vi.mock("../../src/api/client", () => ({
  client: clientMock,
}));

vi.mock("../../src/events/index", () => ({
  APP_EMOTE_EVENT: "app:emote",
  VOICE_CONFIG_UPDATED_EVENT: "voice-config-updated",
  dispatchWindowEvent: dispatchWindowEventMock,
}));

vi.mock("../../src/state/useApp", () => ({
  useApp: useAppMock,
}));

vi.mock("../../src/components/CharacterRoster", () => ({
  CharacterRoster: ({
    entries,
    onSelect,
  }: {
    entries: Array<{ id: string; name: string }>;
    onSelect: (entry: { id: string; name: string }) => void;
  }) =>
    React.createElement(
      "div",
      { "data-testid": "roster" },
      entries.map((entry) =>
        React.createElement(
          "button",
          {
            key: entry.id,
            type: "button",
            "data-testid": `roster-${entry.id}`,
            onClick: () => onSelect(entry),
          },
          entry.name,
        ),
      ),
    ),
  resolveRosterEntries: () => [
    {
      id: "chen",
      name: "Chen",
      avatarIndex: 1,
      catchphrase: "Hello from Chen.",
      greetingAnimation: "animations/greetings/greeting1.fbx.gz",
      voicePresetId: "sarah",
      preset: {
        bio: ["bio"],
        system: "You are {{name}}",
        adjectives: ["curious"],
        style: { all: [], chat: [], post: [] },
        messageExamples: [],
        postExamples: [],
      },
    },
    {
      id: "jin",
      name: "Jin",
      avatarIndex: 2,
      catchphrase: "What are we shipping?",
      greetingAnimation: "animations/greetings/greeting2.fbx.gz",
      voicePresetId: "jin",
      preset: {
        bio: ["bio"],
        system: "You are {{name}}",
        adjectives: ["direct"],
        style: { all: [], chat: [], post: [] },
        messageExamples: [],
        postExamples: [],
      },
    },
  ],
}));

vi.mock("../../src/hooks", async () => {
  const actual =
    await vi.importActual<typeof import("../../src/hooks")>("../../src/hooks");
  return {
    ...actual,
    useChatAvatarVoiceBridge: () => {},
  };
});

vi.mock("@miladyai/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@miladyai/ui")>();
  const passthrough = ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement("div", props, children);
  return {
    ...actual,
    Button: ({
      children,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      React.createElement("button", { type: "button", ...props }, children),
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
      React.createElement("input", props),
    Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) =>
      React.createElement("textarea", props),
    ThemedSelect: passthrough,
  };
});

import { CharacterEditor } from "../../src/components/CharacterEditor";

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
          id: "chen",
          name: "Chen",
          catchphrase: "Hello from Chen.",
          avatarIndex: 1,
          bio: ["bio"],
          system: "You are {{name}}",
          adjectives: ["curious"],
          style: { all: [], chat: [], post: [] },
          messageExamples: [],
          postExamples: [],
        },
      ],
    },
    selectedVrmIndex: 1,
    customVrmUrl: null,
    t: (value: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? value,
    uiLanguage: "en",
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
    elizaCloudConnected: false,
    elizaCloudEnabled: true,
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

describe("CharacterEditor voice cloud fallback (e2e)", () => {
  let tree: TestRenderer.ReactTestRenderer | null = null;

  beforeEach(() => {
    vi.useFakeTimers();

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

    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/mpeg" }),
      arrayBuffer: async () => new ArrayBuffer(16),
      text: async () => "",
    } satisfies Partial<Response>);

    clientMock.getConfig.mockReset();
    clientMock.updateConfig.mockReset();
    dispatchWindowEventMock.mockReset();
    useAppMock.mockReset();

    clientMock.getConfig.mockResolvedValue({
      messages: {
        tts: {
          elevenlabs: {
            apiKey: "sk-t...1234",
            voiceId: "voice-123",
          },
        },
      },
    });
    clientMock.updateConfig.mockResolvedValue(undefined);
    useAppMock.mockReturnValue(createAppState());

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("AudioContext", MockAudioContext);
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: null,
    });
  });

  afterEach(() => {
    if (tree) {
      act(() => {
        tree?.unmount();
      });
      tree = null;
    }
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("speaks the character greeting through the Eliza Cloud proxy when only a masked key is present", async () => {
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CharacterEditor));
    });

    await flushEffects();

    await act(async () => {
      window.dispatchEvent(new Event("eliza:vrm-teleport-complete"));
      vi.advanceTimersByTime(401);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/tts/cloud");
    expect(JSON.parse(String(init.body))).toMatchObject({
      text: "Hello from Chen.",
      voiceId: "EXAVITQu4vr4xnSDxMaL",
      modelId: "eleven_flash_v2_5",
    });

    await act(async () => {
      await Promise.resolve();
    });
  });

  it("switches the active voice config when a different character is selected", async () => {
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CharacterEditor));
    });

    await flushEffects();

    const jinButton = tree?.root.findByProps({
      "data-testid": "roster-jin",
    });

    await act(async () => {
      jinButton?.props.onClick();
      await Promise.resolve();
    });

    expect(dispatchWindowEventMock).toHaveBeenLastCalledWith(
      "voice-config-updated",
      expect.objectContaining({
        provider: "elevenlabs",
        elevenlabs: expect.objectContaining({
          voiceId: "6IwYbsNENZgAB1dtBZDp",
        }),
      }),
    );
    expect(clientMock.updateConfig).toHaveBeenLastCalledWith({
      messages: {
        tts: expect.objectContaining({
          provider: "elevenlabs",
          elevenlabs: expect.objectContaining({
            voiceId: "6IwYbsNENZgAB1dtBZDp",
          }),
        }),
      },
    });
  });
});
