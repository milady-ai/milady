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

  it("renders optional before slot above the composer in the default shell", () => {
    render(
      <ChatComposerShell before={<div>Before slot</div>}>
        <div>Composer</div>
      </ChatComposerShell>,
    );

    expect(screen.getByText("Before slot")).toBeInTheDocument();
    const shell = screen.getByText("Composer").closest(".border-t");
    expect(shell?.textContent).toMatch(/Before slot/);
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

  it("renders sender identity for external user messages without a source pill", () => {
    render(
      <ChatTranscript
        messages={[
          {
            id: "user-1",
            role: "user",
            text: "hello there",
            source: "discord",
            from: "James",
            fromUserName: "james_dev",
            avatarUrl: "/avatars/james.png",
          },
        ]}
      />,
    );

    expect(screen.getByText("James")).toBeInTheDocument();
    expect(screen.getByText("@james_dev")).toBeInTheDocument();
    expect(screen.getByAltText("James avatar")).toHaveAttribute(
      "src",
      "/avatars/james.png",
    );
    expect(
      screen.queryByTestId("chat-bubble-source-label"),
    ).not.toBeInTheDocument();
  });

  it("does not group consecutive user messages from different senders", () => {
    render(
      <ChatTranscript
        messages={[
          {
            id: "user-1",
            role: "user",
            text: "first",
            source: "discord",
            from: "James",
            fromUserName: "james",
          },
          {
            id: "user-2",
            role: "user",
            text: "second",
            source: "discord",
            from: "Avery",
            fromUserName: "avery",
          },
        ]}
      />,
    );

    expect(screen.getByText("James")).toBeInTheDocument();
    expect(screen.getByText("Avery")).toBeInTheDocument();
  });

  it("renders reply references as in-chat anchors with natural sender copy", () => {
    render(
      <ChatTranscript
        messages={[
          {
            id: "user-1",
            role: "user",
            text: "original",
            source: "discord",
            from: "Avery",
          },
          {
            id: "user-2",
            role: "user",
            text: "follow-up",
            source: "discord",
            from: "James",
            replyToMessageId: "user-1",
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Reply to Avery's message" }),
    ).toHaveAttribute("href", "#chat-message-user-1");
  });

  it("converts legacy Discord reference lines into in-chat reply links", () => {
    render(
      <ChatTranscript
        messages={[
          {
            id: "11111111-1111-1111-1111-111111111111",
            role: "user",
            text: "original",
            source: "discord",
            from: "James",
          },
          {
            id: "22222222-2222-2222-2222-222222222222",
            role: "user",
            text: [
              "follow-up",
              "Referencing MessageID 11111111-1111-1111-1111-111111111111 (discord: 1491683970302218280)",
            ].join("\n"),
            source: "discord",
            from: "Avery",
            replyToSenderName: "James",
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Reply to James' message" }),
    ).toHaveAttribute(
      "href",
      "#chat-message-11111111-1111-1111-1111-111111111111",
    );
    expect(
      screen.queryByText(/Referencing MessageID/i),
    ).not.toBeInTheDocument();
  });

  it("can render inbox transcripts with human senders on the left", () => {
    render(
      <ChatTranscript
        userMessagesOnRight={false}
        messages={[
          {
            id: "user-1",
            role: "user",
            text: "hello",
            source: "discord",
            from: "James",
          },
          {
            id: "assistant-1",
            role: "assistant",
            text: "hi there",
            source: "discord",
          },
        ]}
      />,
    );

    const messages = screen.getAllByTestId("chat-message");
    expect(String(messages[0]?.className)).toContain("justify-start");
    expect(String(messages[1]?.className)).toContain("justify-end");
  });

  it("renders aggregated reactions under the original message", () => {
    render(
      <ChatTranscript
        messages={[
          {
            id: "user-1",
            role: "user",
            text: "nice, glad it clicked",
            source: "discord",
            from: "shaw",
            reactions: [
              { emoji: "❤️", count: 1, users: ["James"] },
              { emoji: "🔥", count: 2, users: ["James", "Avery"] },
            ],
          },
        ]}
      />,
    );

    const badges = screen.getAllByTestId("chat-reaction-badge");
    expect(badges).toHaveLength(2);
    expect(screen.getByText("❤️")).toBeInTheDocument();
    expect(screen.getByText("🔥")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(badges[0]).toHaveAttribute("title", "James");
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

  it("renders connector chats with an icon chip", () => {
    render(
      <ChatConversationItem
        conversation={{
          avatarUrl: "/avatars/general.png",
          id: "conv-1",
          title: "General",
          source: "discord",
          updatedAtLabel: "just now",
        }}
        isActive={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByTestId("chat-source-icon")).toHaveAttribute(
      "data-source",
      "discord",
    );
    expect(screen.getByAltText("General avatar")).toHaveAttribute(
      "src",
      "/avatars/general.png",
    );
    expect(
      screen.queryByTestId("conversation-source-chip"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Discord")).not.toBeInTheDocument();
  });

  it("does not render a source chip for internal chats", () => {
    render(
      <ChatConversationItem
        conversation={{
          id: "conv-1",
          title: "Internal",
          updatedAtLabel: "just now",
        }}
        isActive={false}
        onSelect={vi.fn()}
      />,
    );

    expect(
      screen.queryByTestId("conversation-source-chip"),
    ).not.toBeInTheDocument();
  });

  it("does not render inline rollover actions for default sidebar rows", () => {
    render(
      <ChatConversationItem
        conversation={{
          id: "conv-1",
          title: "Internal",
          updatedAtLabel: "just now",
        }}
        isActive={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("conv-rename")).not.toBeInTheDocument();
    expect(screen.queryByTestId("conv-delete")).not.toBeInTheDocument();
  });
});
