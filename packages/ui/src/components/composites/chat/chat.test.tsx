import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  ChatComposer,
  ChatComposerShell,
  ChatConversationItem,
  ChatEmptyState,
  ChatThreadLayout,
  ChatTranscript,
  TypingIndicator,
} from ".";

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

  render(<ChatComposer {...props} />);
  return { props, voice };
}

describe("TypingIndicator", () => {
  it("renders agent name", () => {
    render(<TypingIndicator agentName="Alice" />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("renders avatar image when src provided", () => {
    render(<TypingIndicator agentName="Alice" agentAvatarSrc="/avatar.png" />);
    const img = screen.getByAltText("Alice avatar");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "/avatar.png");
  });
});

describe("ChatEmptyState", () => {
  it("renders suggestions and calls the click handler", () => {
    const onSuggestionClick = vi.fn();
    render(
      <ChatEmptyState
        agentName="Alice"
        suggestions={["Greet"]}
        onSuggestionClick={onSuggestionClick}
      />,
    );

    fireEvent.click(screen.getByText("Greet"));
    expect(onSuggestionClick).toHaveBeenCalledWith("Greet");
  });
});

describe("ChatComposer", () => {
  it("starts compose dictation on a quick click", () => {
    const { voice } = renderComposer();
    const micButton = screen
      .getAllByRole("button")
      .find(
        (button) => button.getAttribute("aria-label") === "chat.voiceInput",
      );

    if (!micButton) {
      throw new Error("Expected mic button");
    }

    fireEvent.click(micButton);
    expect(voice.startListening).toHaveBeenCalledWith("compose");
  });

  it("uses companion styling in game-modal", () => {
    renderComposer({ variant: "game-modal", chatInput: "Hey" });
    const sendButton = screen.getByTestId("chat-composer-action");
    const textarea = screen.getByTestId("chat-composer-textarea");

    expect(sendButton.className).toContain("border-border/28");
    expect(sendButton.className).toContain("bg-[linear-gradient");
    expect(String(textarea.className)).toContain("text-txt-strong");
  });
});

describe("ChatComposerShell", () => {
  it("renders the default shell chrome", () => {
    render(
      <ChatComposerShell>
        <div>Composer</div>
      </ChatComposerShell>,
    );

    expect(screen.getByText("Composer").parentElement?.className).toContain(
      "border-t",
    );
  });

  it("preserves the companion dock shell markers", () => {
    render(
      <ChatComposerShell variant="game-modal" before={<div>Before</div>}>
        <div>Composer</div>
      </ChatComposerShell>,
    );

    const shell = screen.getByText("Composer").closest("[data-no-camera-drag]");
    expect(shell).toHaveAttribute("data-no-camera-drag", "true");
    expect(screen.getByText("Before")).toBeInTheDocument();
    const glassLayer = document.querySelector("[aria-hidden='true']");
    expect(String(glassLayer?.getAttribute("class"))).toContain(
      "backdrop-blur-[22px]",
    );
  });
});

describe("ChatThreadLayout", () => {
  it("renders the provided slots", () => {
    render(
      <ChatThreadLayout
        footerStack={
          <>
            <div>Activity</div>
            <div>Aux</div>
          </>
        }
        composer={<div>Composer</div>}
      >
        <div>Messages</div>
      </ChatThreadLayout>,
    );

    expect(screen.getByText("Messages")).toBeInTheDocument();
    expect(screen.getByText("Activity")).toBeInTheDocument();
    expect(screen.getByText("Aux")).toBeInTheDocument();
    expect(screen.getByText("Composer")).toBeInTheDocument();
  });

  it("applies the companion message-layer styling and composer offset", () => {
    render(
      <ChatThreadLayout variant="game-modal" composerHeight={100}>
        <div>Messages</div>
      </ChatThreadLayout>,
    );

    const messages = screen.getByTestId("chat-messages-scroll");
    expect(String(messages.className)).toContain("pointer-events-auto");
    expect(String(messages.className)).toContain("overflow-y-auto");
    expect(String((messages as HTMLElement).style.maskImage)).toContain(
      "linear-gradient",
    );
    expect((messages as HTMLElement).style.touchAction).toBe("pan-y");
    expect((messages as HTMLElement).style.bottom).toBe("118px");
  });
});

describe("ChatTranscript", () => {
  it("renders grouped default transcript messages through ChatMessage", () => {
    render(
      <ChatTranscript
        agentName="Alice"
        messages={[
          { id: "assistant-1", role: "assistant", text: "Hello" },
          { id: "assistant-2", role: "assistant", text: "Again" },
        ]}
      />,
    );

    const messages = screen.getAllByTestId("chat-message");
    expect(messages).toHaveLength(2);
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("Again")).toBeInTheDocument();
  });

  it("renders game-modal carryover rows with the preserved markers", () => {
    render(
      <ChatTranscript
        variant="game-modal"
        carryoverMessages={[
          { id: "carry-1", role: "assistant", text: "Earlier" },
        ]}
        messages={[{ id: "live-1", role: "user", text: "Now" }]}
        carryoverOpacity={0.5}
      />,
    );

    const rows = screen.getAllByTestId("companion-message-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute("data-companion-carryover", "true");
    expect(rows[0]).toHaveStyle({ opacity: "0.5" });
    expect(screen.getByText("Earlier")).toBeInTheDocument();
    expect(screen.getByText("Now")).toBeInTheDocument();
  });
});

describe("ChatConversationItem", () => {
  it("renders desktop unread meta and fires select", () => {
    const onSelect = vi.fn();
    render(
      <ChatConversationItem
        conversation={{
          id: "conv-1",
          title: "General",
          updatedAtLabel: "just now",
        }}
        isActive={true}
        isUnread={true}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByTestId("conv-select"));
    expect(onSelect).toHaveBeenCalled();
    expect(screen.getByText("New")).toBeInTheDocument();
  });
});
