/**
 * Chat context — a bridge layer for AppContext's chat state.
 *
 * AppProvider owns the chat state (messages, conversations, input,
 * sending status, voice) and passes it through ChatProvider.
 * Components use useChatState() to read only chat state without
 * subscribing to all of AppContext.
 *
 * This is the hottest render path — every keystroke and streaming
 * token triggers updates. Isolating it prevents settings, plugins,
 * onboarding, and wallet views from re-rendering.
 *
 * Single source of truth — AppProvider passes its own state here.
 */

import { createContext, type ReactNode, useContext } from "react";
import type {
  CodingAgentSession,
  Conversation,
  ConversationMessage,
  ConversationMode,
  ImageAttachment,
  StreamEventEnvelope,
} from "../api";
import type { AutonomyRunHealthMap } from "../autonomy";
import type { ChatTurnUsage } from "./types";

// ── Types ───────────────────────────────────────────────────────────

export interface ChatStateValue {
  chatInput: string;
  chatSending: boolean;
  chatFirstTokenReceived: boolean;
  chatLastUsage: ChatTurnUsage | null;
  chatAvatarVisible: boolean;
  chatAgentVoiceMuted: boolean;
  chatMode: ConversationMode;
  chatAvatarSpeaking: boolean;
  conversations: Conversation[];
  activeConversationId: string | null;
  companionMessageCutoffTs: number;
  conversationMessages: ConversationMessage[];
  autonomousEvents: StreamEventEnvelope[];
  autonomousLatestEventId: string | null;
  autonomousRunHealthByRunId: AutonomyRunHealthMap;
  ptySessions: CodingAgentSession[];
  unreadConversations: Set<string>;
  chatPendingImages: ImageAttachment[];
  droppedFiles: string[];
  shareIngestNotice: string;
}

const ChatCtx = createContext<ChatStateValue | null>(null);

// ── Provider ────────────────────────────────────────────────────────

/**
 * Accepts a pre-built value from AppProvider. No internal state — single
 * source of truth remains in AppProvider.
 */
export function ChatProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: ChatStateValue;
}) {
  return <ChatCtx.Provider value={value}>{children}</ChatCtx.Provider>;
}

// ── Hook ────────────────────────────────────────────────────────────

/**
 * Read-only chat state. Components that only need chat data should
 * prefer this over useApp() to avoid re-rendering on unrelated changes.
 */
export function useChatState(): ChatStateValue {
  const ctx = useContext(ChatCtx);
  if (ctx) return ctx;
  if (typeof process !== "undefined" && process.env.NODE_ENV === "test") {
    return {
      chatInput: "",
      chatSending: false,
      chatFirstTokenReceived: false,
      chatLastUsage: null,
      chatAvatarVisible: false,
      chatAgentVoiceMuted: false,
      chatMode: "simple" as ConversationMode,
      chatAvatarSpeaking: false,
      conversations: [],
      activeConversationId: null,
      companionMessageCutoffTs: 0,
      conversationMessages: [],
      autonomousEvents: [],
      autonomousLatestEventId: null,
      autonomousRunHealthByRunId: {},
      ptySessions: [],
      unreadConversations: new Set<string>(),
      chatPendingImages: [],
      droppedFiles: [],
      shareIngestNotice: "",
    };
  }
  throw new Error(
    "useChatState must be used within ChatProvider or AppProvider",
  );
}
