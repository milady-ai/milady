// @vitest-environment jsdom

import { ChatComposer } from "@miladyai/app-core/components/ChatComposer";
import React, { createRef } from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

function createVoiceState(
  overrides?: Partial<React.ComponentProps<typeof ChatComposer>["voice"]>,
) {
  return {
    supported: true,
    isListening: false,
    captureMode: "idle" as const,
    interimTranscript: "",
    isSpeaking: false,
    toggleListening: vi.fn(),
    startListening: vi.fn(),
    stopListening: vi.fn(),
    ...overrides,
  };
}

function renderComposer(
  overrides?: Partial<React.ComponentProps<typeof ChatComposer>>,
) {
  const voice = createVoiceState(overrides?.voice);
  const { voice: _voiceOverride, ...restOverrides } = overrides ?? {};
  const props: React.ComponentProps<typeof ChatComposer> = {
    variant: "default",
    textareaRef: createRef<HTMLTextAreaElement>(),
    chatInput: "",
    chatPendingImagesCount: 0,
    isComposerLocked: false,
    isAgentStarting: false,
    chatSending: false,
    agentVoiceEnabled: true,
    t: (key) => key,
    onAttachImage: vi.fn(),
    onChatInputChange: vi.fn(),
    onKeyDown: vi.fn(),
    onSend: vi.fn(),
    onStop: vi.fn(),
    onStopSpeaking: vi.fn(),
    onToggleAgentVoice: vi.fn(),
    ...restOverrides,
    voice,
  };

  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(React.createElement(ChatComposer, props));
  });
  const buttons = renderer.root.findAllByType("button" as React.ElementType);
  const micButton = buttons.find(
    (button) =>
      typeof button.props.onPointerDown === "function" &&
      typeof button.props.onPointerUp === "function",
  );
  const speakerButton = buttons.find(
    (button) => button.props["aria-label"] === "aria.agentVoiceOn",
  );

  if (!micButton) {
    throw new Error("Expected mic button to be present");
  }

  return { renderer, props, voice, micButton, speakerButton };
}

function findTextarea(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findByProps({
    "data-testid": "chat-composer-textarea",
  });
}

describe("ChatComposer mic controls", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts compose dictation on a quick click", async () => {
    const { voice, micButton } = renderComposer();

    await act(async () => {
      micButton.props.onClick();
    });

    expect(voice.startListening).toHaveBeenCalledWith("compose");
  });

  it("starts push-to-talk on hold and sends on release", async () => {
    vi.useFakeTimers();
    const { voice, micButton } = renderComposer();

    await act(async () => {
      micButton.props.onPointerDown({});
      vi.advanceTimersByTime(200);
    });

    expect(voice.startListening).toHaveBeenCalledWith("push-to-talk");

    await act(async () => {
      micButton.props.onPointerUp();
      vi.runAllTimers();
    });

    expect(voice.stopListening).toHaveBeenCalledWith({ submit: true });
  });

  it("toggles agent voice from the speaker button", async () => {
    const { props, speakerButton } = renderComposer();
    if (!speakerButton) {
      throw new Error("Expected speaker button to be present");
    }

    await act(async () => {
      speakerButton.props.onClick();
    });

    expect(props.onToggleAgentVoice).toHaveBeenCalledOnce();
  });

  it("can hide the agent voice toggle for desktop chat", () => {
    const { speakerButton } = renderComposer({
      showAgentVoiceToggle: false,
    });

    expect(speakerButton).toBeUndefined();
  });

  it("shows Listening... in an empty default chat input while listening", () => {
    const { renderer } = renderComposer({
      chatInput: "",
      voice: {
        isListening: true,
        captureMode: "compose",
      },
    });
    const textarea = findTextarea(renderer);

    expect(textarea.props.placeholder).toBe("Listening...");
  });
});
