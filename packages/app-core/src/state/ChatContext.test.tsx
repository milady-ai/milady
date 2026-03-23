// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { ChatProvider, useChatState, type ChatStateValue } from "./ChatContext";

const defaultValue: ChatStateValue = {
  chatInput: "",
  chatSending: false,
  chatFirstTokenReceived: false,
  chatLastUsage: null,
  chatAvatarVisible: false,
  chatAgentVoiceMuted: false,
  chatMode: "simple",
  chatAvatarSpeaking: false,
  conversations: [],
  activeConversationId: null,
  companionMessageCutoffTs: 0,
  conversationMessages: [],
  autonomousEvents: [],
  autonomousLatestEventId: null,
  autonomousRunHealthByRunId: {},
  ptySessions: [],
  unreadConversations: new Set(),
  chatPendingImages: [],
  droppedFiles: [] as string[],
  shareIngestNotice: "",
};

function wrapper({ children }: { children: ReactNode }) {
  return <ChatProvider value={defaultValue}>{children}</ChatProvider>;
}

describe("ChatProvider", () => {
  it("provides empty initial state", () => {
    const { result } = renderHook(() => useChatState(), { wrapper });
    expect(result.current.chatInput).toBe("");
    expect(result.current.chatSending).toBe(false);
    expect(result.current.conversations).toEqual([]);
    expect(result.current.conversationMessages).toEqual([]);
    expect(result.current.activeConversationId).toBeNull();
  });

  it("passes through custom values", () => {
    const custom: ChatStateValue = {
      ...defaultValue,
      chatInput: "hello",
      chatSending: true,
      activeConversationId: "conv-123",
    };
    const customWrapper = ({ children }: { children: ReactNode }) => (
      <ChatProvider value={custom}>{children}</ChatProvider>
    );
    const { result } = renderHook(() => useChatState(), {
      wrapper: customWrapper,
    });
    expect(result.current.chatInput).toBe("hello");
    expect(result.current.chatSending).toBe(true);
    expect(result.current.activeConversationId).toBe("conv-123");
  });

  it("exposes conversation messages", () => {
    const msgs = [
      { id: "1", role: "user" as const, text: "hi", timestamp: Date.now() },
    ];
    const custom: ChatStateValue = {
      ...defaultValue,
      conversationMessages: msgs,
    };
    const customWrapper = ({ children }: { children: ReactNode }) => (
      <ChatProvider value={custom}>{children}</ChatProvider>
    );
    const { result } = renderHook(() => useChatState(), {
      wrapper: customWrapper,
    });
    expect(result.current.conversationMessages).toEqual(msgs);
  });
});
