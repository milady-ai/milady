/**
 * Chat context — extracted from AppContext.
 *
 * Owns the chat state that changes at high frequency: messages,
 * input text, sending status, conversations, and voice state.
 * This is the hottest render path — every keystroke and streaming
 * token triggers updates here. Isolating it prevents settings,
 * plugins, onboarding, and other views from re-rendering.
 *
 * Phase 1: State + setters only. The complex callbacks (handleChatSend,
 * etc.) remain in AppContext and read from this context via refs.
 * Components can use useChatState() for read-only chat state without
 * subscribing to the full AppContext.
 */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
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
import {
  loadChatAvatarVisible,
  loadChatMode,
  loadChatVoiceMuted,
  loadCompanionMessageCutoffTs,
} from "./internal";

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
  droppedFiles: File[];
  shareIngestNotice: string | null;

  // Setters — exposed so AppContext callbacks can update chat state
  setChatInput: (v: string) => void;
  setChatSending: (v: boolean) => void;
  setChatFirstTokenReceived: (v: boolean) => void;
  setChatLastUsage: (v: ChatTurnUsage | null) => void;
  setChatAvatarVisible: (v: boolean) => void;
  setChatAgentVoiceMuted: (v: boolean) => void;
  setChatMode: (v: ConversationMode) => void;
  setChatAvatarSpeaking: (v: boolean) => void;

  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  setActiveConversationId: (v: string | null) => void;
  setCompanionMessageCutoffTs: (v: number) => void;
  setConversationMessages: React.Dispatch<
    React.SetStateAction<ConversationMessage[]>
  >;
  setAutonomousEvents: React.Dispatch<
    React.SetStateAction<StreamEventEnvelope[]>
  >;
  setAutonomousLatestEventId: (v: string | null) => void;
  setAutonomousRunHealthByRunId: React.Dispatch<
    React.SetStateAction<AutonomyRunHealthMap>
  >;
  setPtySessions: React.Dispatch<React.SetStateAction<CodingAgentSession[]>>;
  setUnreadConversations: React.Dispatch<React.SetStateAction<Set<string>>>;
  setChatPendingImages: React.Dispatch<
    React.SetStateAction<ImageAttachment[]>
  >;
  setDroppedFiles: React.Dispatch<React.SetStateAction<File[]>>;
  setShareIngestNotice: (v: string | null) => void;

  // Refs for synchronous access from callbacks
  activeConversationIdRef: React.RefObject<string | null>;
  conversationMessagesRef: React.RefObject<ConversationMessage[]>;
}

const ChatCtx = createContext<ChatStateValue | null>(null);

// ── Provider ────────────────────────────────────────────────────────

export function ChatProvider({ children }: { children: ReactNode }) {
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatFirstTokenReceived, setChatFirstTokenReceived] = useState(false);
  const [chatLastUsage, setChatLastUsage] = useState<ChatTurnUsage | null>(
    null,
  );
  const [chatAvatarVisible, setChatAvatarVisible] = useState(
    loadChatAvatarVisible,
  );
  const [chatAgentVoiceMuted, setChatAgentVoiceMuted] =
    useState(loadChatVoiceMuted);
  const [chatMode, setChatMode] = useState<ConversationMode>(loadChatMode);
  const [chatAvatarSpeaking, setChatAvatarSpeaking] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [companionMessageCutoffTs, setCompanionMessageCutoffTs] = useState(
    loadCompanionMessageCutoffTs,
  );
  const [conversationMessages, setConversationMessages] = useState<
    ConversationMessage[]
  >([]);
  const [autonomousEvents, setAutonomousEvents] = useState<
    StreamEventEnvelope[]
  >([]);
  const [autonomousLatestEventId, setAutonomousLatestEventId] = useState<
    string | null
  >(null);
  const [autonomousRunHealthByRunId, setAutonomousRunHealthByRunId] =
    useState<AutonomyRunHealthMap>({});
  const [ptySessions, setPtySessions] = useState<CodingAgentSession[]>([]);
  const [unreadConversations, setUnreadConversations] = useState<Set<string>>(
    new Set(),
  );
  const [chatPendingImages, setChatPendingImages] = useState<
    ImageAttachment[]
  >([]);
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
  const [shareIngestNotice, setShareIngestNotice] = useState<string | null>(
    null,
  );

  const activeConversationIdRef = useRef<string | null>(null);
  const conversationMessagesRef = useRef<ConversationMessage[]>([]);

  // Keep refs in sync
  const setActiveConversationIdWrapped = useCallback(
    (v: string | null) => {
      activeConversationIdRef.current = v;
      setActiveConversationId(v);
    },
    [],
  );

  const setConversationMessagesWrapped: React.Dispatch<
    React.SetStateAction<ConversationMessage[]>
  > = useCallback(
    (v: React.SetStateAction<ConversationMessage[]>) => {
      setConversationMessages((prev) => {
        const next = typeof v === "function" ? v(prev) : v;
        conversationMessagesRef.current = next;
        return next;
      });
    },
    [],
  );

  const value = useMemo<ChatStateValue>(
    () => ({
      chatInput,
      chatSending,
      chatFirstTokenReceived,
      chatLastUsage,
      chatAvatarVisible,
      chatAgentVoiceMuted,
      chatMode,
      chatAvatarSpeaking,

      conversations,
      activeConversationId,
      companionMessageCutoffTs,
      conversationMessages,
      autonomousEvents,
      autonomousLatestEventId,
      autonomousRunHealthByRunId,
      ptySessions,
      unreadConversations,
      chatPendingImages,
      droppedFiles,
      shareIngestNotice,
      setChatInput,
      setChatSending,
      setChatFirstTokenReceived,
      setChatLastUsage,
      setChatAvatarVisible,
      setChatAgentVoiceMuted,
      setChatMode,
      setChatAvatarSpeaking,

      setConversations,
      setActiveConversationId: setActiveConversationIdWrapped,
      setCompanionMessageCutoffTs,
      setConversationMessages: setConversationMessagesWrapped,
      setAutonomousEvents,
      setAutonomousLatestEventId,
      setAutonomousRunHealthByRunId,
      setPtySessions,
      setUnreadConversations,
      setChatPendingImages,
      setDroppedFiles,
      setShareIngestNotice,
      activeConversationIdRef,
      conversationMessagesRef,
    }),
    [
      chatInput,
      chatSending,
      chatFirstTokenReceived,
      chatLastUsage,
      chatAvatarVisible,
      chatAgentVoiceMuted,
      chatMode,
      chatAvatarSpeaking,

      conversations,
      activeConversationId,
      companionMessageCutoffTs,
      conversationMessages,
      autonomousEvents,
      autonomousLatestEventId,
      autonomousRunHealthByRunId,
      ptySessions,
      unreadConversations,
      chatPendingImages,
      droppedFiles,
      shareIngestNotice,
      setActiveConversationIdWrapped,
      setConversationMessagesWrapped,
    ],
  );

  return <ChatCtx.Provider value={value}>{children}</ChatCtx.Provider>;
}

// ── Hook ────────────────────────────────────────────────────────────

/**
 * Use this hook for read-only chat state or chat setters.
 * Components that only need chat data should prefer this over useApp().
 */
export function useChatState(): ChatStateValue {
  const ctx = useContext(ChatCtx);
  if (ctx) return ctx;
  if (typeof process !== "undefined" && process.env.NODE_ENV === "test") {
    return new Proxy({} as ChatStateValue, {
      get(_, prop) {
        if (prop === "conversations") return [];
        if (prop === "conversationMessages") return [];
        if (prop === "autonomousEvents") return [];
        if (prop === "ptySessions") return [];
        if (prop === "unreadConversations") return new Set();
        if (prop === "chatPendingImages") return [];
        if (prop === "droppedFiles") return [];
        if (prop === "chatInput") return "";
        if (prop === "activeConversationId") return null;
        if (prop === "activeConversationIdRef") return { current: null };
        if (prop === "conversationMessagesRef") return { current: [] };
        return typeof prop === "string" && prop.startsWith("set")
          ? () => {}
          : null;
      },
    });
  }
  throw new Error(
    "useChatState must be used within ChatProvider or AppProvider",
  );
}
