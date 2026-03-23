// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { ChatProvider } from "./ChatContext";

// Import hook directly since not publicly exported
import { useChatState } from "./ChatContext";

function wrapper({ children }: { children: ReactNode }) {
  return <ChatProvider>{children}</ChatProvider>;
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

  it("setChatInput updates chatInput", () => {
    const { result } = renderHook(() => useChatState(), { wrapper });
    act(() => {
      result.current.setChatInput("hello");
    });
    expect(result.current.chatInput).toBe("hello");
  });

  it("setActiveConversationId syncs ref", () => {
    const { result } = renderHook(() => useChatState(), { wrapper });
    act(() => {
      result.current.setActiveConversationId("conv-123");
    });
    expect(result.current.activeConversationId).toBe("conv-123");
    expect(result.current.activeConversationIdRef.current).toBe("conv-123");
  });

  it("setConversationMessages syncs ref", () => {
    const { result } = renderHook(() => useChatState(), { wrapper });
    const msgs = [
      { id: "1", role: "user" as const, text: "hi", timestamp: Date.now() },
    ];
    act(() => {
      result.current.setConversationMessages(msgs);
    });
    expect(result.current.conversationMessages).toEqual(msgs);
    expect(result.current.conversationMessagesRef.current).toEqual(msgs);
  });
});
