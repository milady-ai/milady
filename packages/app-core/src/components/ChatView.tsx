/**
 * Chat view component.
 *
 * Layout: flex column filling parent. Header row (title + clear + toggles).
 * Scrollable messages area. Share/file notices below messages.
 * Input row at bottom with mic + textarea + send button.
 */

import {
  type ConversationChannelType,
  type ConversationMessage,
  client,
  type ImageAttachment,
  type VoiceConfig,
} from "@miladyai/app-core/api";
import { isRoutineCodingAgentMessage } from "@miladyai/app-core/chat";
import {
  ELIZA_CLOUD_STATUS_UPDATED_EVENT,
  type ElizaCloudStatusUpdatedDetail,
  VOICE_CONFIG_UPDATED_EVENT,
} from "@miladyai/app-core/events";
import {
  useChatAvatarVoiceBridge,
  useDocumentVisibility,
  useTimeout,
  useVoiceChat,
  type VoiceCaptureMode,
  type VoicePlaybackStartEvent,
} from "@miladyai/app-core/hooks";
import { getVrmPreviewUrl, useApp } from "@miladyai/app-core/state";
import { miladyTtsDebug } from "@miladyai/app-core/utils";
import { resolveCharacterVoiceConfigFromAppConfig } from "@miladyai/app-core/voice";
import { Button } from "@miladyai/ui";
import {
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AgentActivityBox } from "./AgentActivityBox";
import { ChatComposer } from "./ChatComposer";
import { ChatMessage, TypingIndicator } from "./ChatMessage";
import { useCompanionSceneStatus } from "./companion-scene-status-context";
import {
  DESKTOP_CHAT_BUBBLE_ASSISTANT_CLASSNAME,
  DESKTOP_CHAT_BUBBLE_USER_CLASSNAME,
} from "./desktop-surface-primitives";
import { MessageContent } from "./MessageContent";
import { PtyConsoleDrawer } from "./PtyConsoleDrawer";

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function mapUiLanguageToSpeechLocale(uiLanguage: string): string {
  switch (uiLanguage) {
    case "zh-CN":
      return "zh-CN";
    case "ko":
      return "ko-KR";
    case "es":
      return "es-ES";
    case "pt":
      return "pt-BR";
    case "vi":
      return "vi-VN";
    case "tl":
      return "fil-PH";
    default:
      return "en-US";
  }
}

const CHAT_INPUT_MIN_HEIGHT_PX = 46;
const CHAT_INPUT_MAX_HEIGHT_PX = 200;
const COMPANION_VISIBLE_MESSAGE_LIMIT = 2;
const COMPANION_HISTORY_HOLD_MS = 30_000;
const COMPANION_HISTORY_FADE_MS = 5_000;
const COMPANION_MESSAGE_LAYER_TOP = "calc(-100% + 1.5rem)";
const COMPANION_MESSAGE_LAYER_BOTTOM_FALLBACK = "5.25rem";
const COMPANION_COMPOSER_GAP_PX = 18;
/** Companion dock composer: padding + min-height live here (not on the glass layer). */
const COMPANION_COMPOSER_SHELL_LAYOUT_CLASSNAME =
  "relative flex items-center px-3 py-2 max-[380px]:min-h-[78px] max-[380px]:px-2.5 max-[380px]:py-1.5";
/** Frosted pill behind the game-modal composer; separate from content so padding stays obvious. */
const COMPANION_COMPOSER_GLASS_LAYER_CLASSNAME =
  "pointer-events-none absolute inset-0 rounded-[34px] border border-border/26 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_84%,transparent),color-mix(in_srgb,var(--bg)_72%,transparent))] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_20px_52px_rgba(15,23,42,0.18)] ring-1 ring-inset ring-white/8 backdrop-blur-[22px] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_58px_rgba(0,0,0,0.36)]";
const COMPANION_MESSAGE_LAYER_MASK =
  "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.28) 6%, rgba(0,0,0,0.82) 12%, black 17%, black 100%)";
const COMPANION_ASSISTANT_BUBBLE_CLASSNAME = `${DESKTOP_CHAT_BUBBLE_ASSISTANT_CLASSNAME} backdrop-blur-md`;
const COMPANION_USER_BUBBLE_CLASSNAME = `${DESKTOP_CHAT_BUBBLE_USER_CLASSNAME} backdrop-blur-md`;
const COMPANION_TYPING_BUBBLE_CLASSNAME = `${DESKTOP_CHAT_BUBBLE_ASSISTANT_CLASSNAME} backdrop-blur-md`;
const COMPANION_TYPING_DOT_CLASSNAME =
  "h-1.5 w-1.5 rounded-full bg-[color:color-mix(in_srgb,var(--muted)_82%,transparent)] animate-bounce";

type ChatViewVariant = "default" | "game-modal";

interface ChatViewProps {
  variant?: ChatViewVariant;
  /** Override click handler for agent activity box sessions. */
  onPtySessionClick?: (sessionId: string) => void;
}

interface CompanionCarryoverState {
  expiresAtMs: number;
  fadeStartsAtMs: number;
  messages: ConversationMessage[];
}

function findLatestAssistantMessage(messages: ConversationMessage[]) {
  return [...messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.text.trim());
}

type CompanionSpeechMemoryEntry = {
  messageId: string;
  text: string;
};

const companionSpeechMemoryByConversation = new Map<
  string,
  CompanionSpeechMemoryEntry
>();

function rememberCompanionSpeech(
  conversationId: string | null,
  messageId: string,
  text: string,
): void {
  if (!conversationId) return;
  companionSpeechMemoryByConversation.set(conversationId, { messageId, text });
  if (companionSpeechMemoryByConversation.size <= 100) return;
  const oldestConversationId = companionSpeechMemoryByConversation
    .keys()
    .next().value;
  if (oldestConversationId) {
    companionSpeechMemoryByConversation.delete(oldestConversationId);
  }
}

function hasCompanionSpeechBeenPlayed(
  conversationId: string | null,
  messageId: string,
  text: string,
): boolean {
  if (!conversationId) return false;
  const remembered = companionSpeechMemoryByConversation.get(conversationId);
  return remembered?.messageId === messageId && remembered.text === text;
}

export function __resetCompanionSpeechMemoryForTests(): void {
  companionSpeechMemoryByConversation.clear();
}

/**
 * Chat assistant TTS pipeline — order matters for cloud-backed voice:
 * 1. Server exposes Eliza Cloud via `GET /api/cloud/status` (`hasApiKey`, `enabled`, `connected`).
 * 2. `AppContext.pollCloudCredits` persists React state and dispatches {@link ELIZA_CLOUD_STATUS_UPDATED_EVENT}.
 * 3. This hook stores `detail.cloudVoiceProxyAvailable` in a ref for same-turn
 *    `true` before React state commits; `cloudConnected` is `context || ref===true`
 *    so an early `false` snapshot cannot block TTS after auth loads. Then reloads
 *    `messages.tts` from `getConfig`.
 * 4. `useVoiceChat` resolves cloud vs own-key mode and speaks via `/api/tts/cloud` when the browser has no xi-api-key.
 */
function useChatVoiceController(options: {
  agentVoiceMuted: boolean;
  chatFirstTokenReceived: boolean;
  chatInput: string;
  chatSending: boolean;
  elizaCloudConnected: boolean;
  elizaCloudEnabled: boolean;
  elizaCloudHasPersistedKey: boolean;
  conversationMessages: ConversationMessage[];
  activeConversationId: string | null;
  handleChatEdit: (messageId: string, text: string) => Promise<boolean>;
  handleChatSend: (channelType?: ConversationChannelType) => Promise<void>;
  isComposerLocked: boolean;
  isGameModal: boolean;
  setState: ReturnType<typeof useApp>["setState"];
  uiLanguage: string;
}) {
  const { setTimeout } = useTimeout();
  const { avatarReady: companionSceneAvatarReady } = useCompanionSceneStatus();
  const {
    agentVoiceMuted,
    chatFirstTokenReceived,
    chatInput,
    chatSending,
    elizaCloudConnected,
    elizaCloudEnabled,
    elizaCloudHasPersistedKey,
    conversationMessages,
    activeConversationId,
    handleChatEdit,
    handleChatSend,
    isComposerLocked,
    isGameModal,
    setState,
    uiLanguage,
  } = options;
  /** After the first `eliza:cloud-status-updated`, mirrors server `cloudVoiceProxyAvailable` (avoids one-frame lag vs context). */
  const cloudVoiceSnapshotRef = useRef<boolean | null>(null);
  const [, cloudVoiceSnapshotTick] = useState(0);
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig | null>(null);
  /** Bumps after each `getConfig` (or inline VOICE_CONFIG event) settles — game-modal auto-speak waits for this so TTS does not run with a stale/null voice profile and get stuck deduped. */
  const [voiceBootstrapTick, setVoiceBootstrapTick] = useState(0);
  const [voiceLatency, setVoiceLatency] = useState<{
    firstSegmentCached: boolean | null;
    speechEndToFirstTokenMs: number | null;
    speechEndToVoiceStartMs: number | null;
  } | null>(null);
  const pendingVoiceTurnRef = useRef<{
    expiresAtMs: number;
    firstSegmentCached?: boolean;
    firstTokenAtMs?: number;
    speechEndedAtMs: number;
    voiceStartedAtMs?: number;
  } | null>(null);
  const suppressedAssistantSpeechIdRef = useRef<string | null>(null);
  /** Skips duplicate companion auto-speak when only `voiceBootstrapTick` bumps (config/cloud reload) for the same assistant text. */
  const companionBootstrapAutoSpeakRef = useRef<{
    tick: number;
    messageId: string;
    text: string;
    unlockGen: number;
  } | null>(null);
  const initialCompletedAssistantOnGameModalMountRef = useRef<{
    messageId: string;
    text: string;
  } | null>(
    isGameModal && !chatSending
      ? (() => {
          const latestAssistant =
            findLatestAssistantMessage(conversationMessages);
          if (!latestAssistant) return null;
          return {
            messageId: latestAssistant.id,
            text: latestAssistant.text,
          };
        })()
      : null,
  );
  const voiceDraftBaseInputRef = useRef("");
  const prevIsGameModalRef = useRef(isGameModal);
  const gameModalJustActivatedRef = useRef(false);

  const loadVoiceConfig = useCallback(async () => {
    try {
      const cfg = await client.getConfig();
      const resolved = resolveCharacterVoiceConfigFromAppConfig({
        config: cfg,
        uiLanguage,
      });
      setVoiceConfig(resolved.voiceConfig);
      if (resolved.shouldPersist && resolved.voiceConfig) {
        void client
          .updateConfig({
            messages: {
              tts: resolved.voiceConfig,
            },
          })
          .catch(() => {});
      }
    } catch {
      /* ignore — will use browser TTS fallback */
      setVoiceConfig(null);
    } finally {
      setVoiceBootstrapTick((t) => t + 1);
    }
  }, [uiLanguage]);

  useEffect(() => {
    void loadVoiceConfig();
  }, [loadVoiceConfig]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<VoiceConfig | undefined>).detail;
      if (detail && typeof detail === "object") {
        setVoiceConfig(detail);
        setVoiceBootstrapTick((t) => t + 1);
        return;
      }
      void loadVoiceConfig();
    };

    window.addEventListener(VOICE_CONFIG_UPDATED_EVENT, handler);
    return () =>
      window.removeEventListener(VOICE_CONFIG_UPDATED_EVENT, handler);
  }, [loadVoiceConfig]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const onCloudStatus = (event: Event) => {
      const detail = (event as CustomEvent<ElizaCloudStatusUpdatedDetail>)
        .detail;
      if (detail && typeof detail === "object") {
        miladyTtsDebug("chat:cloud-status-event", {
          cloudVoiceProxyAvailable: detail.cloudVoiceProxyAvailable,
          connected: detail.connected,
          enabled: detail.enabled,
          hasPersistedApiKey: detail.hasPersistedApiKey,
        });
      }
      if (detail && typeof detail.cloudVoiceProxyAvailable === "boolean") {
        cloudVoiceSnapshotRef.current = detail.cloudVoiceProxyAvailable;
      }
      cloudVoiceSnapshotTick((n) => n + 1);
      void loadVoiceConfig();
    };
    window.addEventListener(ELIZA_CLOUD_STATUS_UPDATED_EVENT, onCloudStatus);
    return () =>
      window.removeEventListener(
        ELIZA_CLOUD_STATUS_UPDATED_EVENT,
        onCloudStatus,
      );
  }, [loadVoiceConfig]);

  const composeVoiceDraft = useCallback((transcript: string) => {
    const base = voiceDraftBaseInputRef.current.trim();
    const spoken = transcript.trim();
    if (base && spoken) {
      return `${base} ${spoken}`;
    }
    return base || spoken;
  }, []);

  const handleVoiceTranscript = useCallback(
    (text: string) => {
      if (isComposerLocked) return;
      const composedText = composeVoiceDraft(text);
      if (!composedText) return;
      const speechEndedAtMs = nowMs();
      pendingVoiceTurnRef.current = {
        expiresAtMs: speechEndedAtMs + 15000,
        speechEndedAtMs,
      };
      setVoiceLatency(null);
      setState("chatInput", composedText);
      setTimeout(() => void handleChatSend("VOICE_DM"), 50);
    },
    [composeVoiceDraft, handleChatSend, isComposerLocked, setState, setTimeout],
  );

  const handleVoiceTranscriptPreview = useCallback(
    (text: string) => {
      if (isComposerLocked) return;
      setState("chatInput", composeVoiceDraft(text));
    },
    [composeVoiceDraft, isComposerLocked, setState],
  );

  const handleVoicePlaybackStart = useCallback(
    (event: VoicePlaybackStartEvent) => {
      miladyTtsDebug("chat:playback-start", {
        provider: event.provider,
        segment: event.segment,
        cached: event.cached,
      });
      const pending = pendingVoiceTurnRef.current;
      if (!pending) return;
      if (event.startedAtMs > pending.expiresAtMs) {
        pendingVoiceTurnRef.current = null;
        return;
      }
      if (pending.voiceStartedAtMs != null) return;

      pending.voiceStartedAtMs = event.startedAtMs;
      pending.firstSegmentCached = event.cached;

      setVoiceLatency((prev) => ({
        firstSegmentCached: event.cached,
        speechEndToFirstTokenMs: prev?.speechEndToFirstTokenMs ?? null,
        speechEndToVoiceStartMs: Math.max(
          0,
          Math.round(event.startedAtMs - pending.speechEndedAtMs),
        ),
      }));
    },
    [],
  );

  const cloudVoiceAvailable = useMemo(() => {
    const fromContext =
      elizaCloudConnected || elizaCloudEnabled || elizaCloudHasPersistedKey;
    const snap = cloudVoiceSnapshotRef.current;
    // Ref snapshot can be `false` from an early status poll before the key is
    // loaded, then never updated if no further event fires — that stuck
    // `cloudConnected` false in useVoiceChat and kept browser TTS. Prefer
    // context; only use the ref to force `true` when the event arrives before
    // React state commits (same-turn lag).
    return fromContext || snap === true;
  }, [
    elizaCloudConnected,
    elizaCloudEnabled,
    elizaCloudHasPersistedKey,
    cloudVoiceSnapshotTick,
  ]);

  useEffect(() => {
    miladyTtsDebug("chat:cloud-voice-available", {
      cloudVoiceAvailable,
      elizaCloudConnected,
      elizaCloudEnabled,
      elizaCloudHasPersistedKey,
      snapshotRef: cloudVoiceSnapshotRef.current,
    });
  }, [
    cloudVoiceAvailable,
    cloudVoiceSnapshotTick,
    elizaCloudConnected,
    elizaCloudEnabled,
    elizaCloudHasPersistedKey,
  ]);

  const voice = useVoiceChat({
    cloudConnected: cloudVoiceAvailable,
    interruptOnSpeech: isGameModal,
    lang: mapUiLanguageToSpeechLocale(uiLanguage),
    onPlaybackStart: handleVoicePlaybackStart,
    onTranscript: handleVoiceTranscript,
    onTranscriptPreview: handleVoiceTranscriptPreview,
    voiceConfig,
  });
  const {
    queueAssistantSpeech,
    speak,
    startListening,
    stopListening,
    stopSpeaking,
    voiceUnlockedGeneration,
  } = voice;

  // After the user gesture unlocks audio, clear progressive TTS dedupe state so
  // auto-speak can queue the greeting again (ElevenLabs was likely skipped once).
  const prevVoiceUnlockGenRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (prevVoiceUnlockGenRef.current === null) {
      prevVoiceUnlockGenRef.current = voiceUnlockedGeneration;
      return;
    }
    if (prevVoiceUnlockGenRef.current === voiceUnlockedGeneration) return;
    prevVoiceUnlockGenRef.current = voiceUnlockedGeneration;
    stopSpeaking();
  }, [voiceUnlockedGeneration, stopSpeaking]);

  const beginVoiceCapture = useCallback(
    (mode: Exclude<VoiceCaptureMode, "idle"> = "compose") => {
      if (isComposerLocked || voice.isListening) return;
      const latestAssistant = findLatestAssistantMessage(conversationMessages);
      suppressedAssistantSpeechIdRef.current = latestAssistant?.id ?? null;
      voiceDraftBaseInputRef.current = chatInput;
      stopSpeaking();
      void startListening(mode);
    },
    [
      chatInput,
      conversationMessages,
      isComposerLocked,
      startListening,
      stopSpeaking,
      voice.isListening,
    ],
  );

  const endVoiceCapture = useCallback(
    (captureOptions?: { submit?: boolean }) => {
      if (!voice.isListening) return;
      void stopListening(captureOptions);
    },
    [stopListening, voice.isListening],
  );

  const handleSpeakMessage = useCallback(
    (messageId: string, text: string) => {
      if (!text.trim()) return;
      suppressedAssistantSpeechIdRef.current = messageId;
      rememberCompanionSpeech(activeConversationId, messageId, text);
      speak(text);
    },
    [activeConversationId, speak],
  );

  const handleEditMessage = useCallback(
    async (messageId: string, text: string) => {
      stopSpeaking();
      return handleChatEdit(messageId, text);
    },
    [handleChatEdit, stopSpeaking],
  );

  // Track when isGameModal transitions from false→true so we can suppress
  // the stale "latest assistant message" speech that would otherwise replay.
  // NOTE: Do NOT suppress on the initial mount — only on actual mode switches.
  const hasSetInitialGameModalRef = useRef(false);
  useEffect(() => {
    if (!hasSetInitialGameModalRef.current) {
      // First render — just record the initial value without suppressing.
      hasSetInitialGameModalRef.current = true;
      prevIsGameModalRef.current = isGameModal;
      return;
    }
    if (isGameModal && !prevIsGameModalRef.current) {
      gameModalJustActivatedRef.current = true;
    }
    prevIsGameModalRef.current = isGameModal;
  }, [isGameModal]);

  useEffect(() => {
    if (!isGameModal) {
      companionBootstrapAutoSpeakRef.current = null;
    }
  }, [isGameModal]);

  useEffect(() => {
    if (!isGameModal || agentVoiceMuted || voice.isListening) return;
    if (!companionSceneAvatarReady) return;
    if (voiceBootstrapTick === 0) return;
    // Skip the stale replay when the view just became active (mode switch).
    if (gameModalJustActivatedRef.current) {
      gameModalJustActivatedRef.current = false;
      return;
    }
    const latestAssistant = findLatestAssistantMessage(conversationMessages);
    if (!latestAssistant) return;
    if (suppressedAssistantSpeechIdRef.current === latestAssistant.id) return;

    const tick = voiceBootstrapTick;
    const messageId = latestAssistant.id;
    const text = latestAssistant.text;
    const ug = voiceUnlockedGeneration;
    const initialCompletedAssistant =
      initialCompletedAssistantOnGameModalMountRef.current;
    if (
      initialCompletedAssistant &&
      !chatSending &&
      initialCompletedAssistant.messageId === messageId &&
      initialCompletedAssistant.text === text
    ) {
      initialCompletedAssistantOnGameModalMountRef.current = null;
      companionBootstrapAutoSpeakRef.current = {
        tick,
        messageId,
        text,
        unlockGen: ug,
      };
      return;
    }
    if (initialCompletedAssistant) {
      initialCompletedAssistantOnGameModalMountRef.current = null;
    }
    if (hasCompanionSpeechBeenPlayed(activeConversationId, messageId, text)) {
      companionBootstrapAutoSpeakRef.current = {
        tick,
        messageId,
        text,
        unlockGen: ug,
      };
      return;
    }
    const prev = companionBootstrapAutoSpeakRef.current;
    if (
      prev &&
      prev.messageId === messageId &&
      prev.text === text &&
      prev.unlockGen === ug
    ) {
      if (tick > prev.tick) {
        // Voice config / cloud status bumped the tick only — do not re-queue the same line.
        companionBootstrapAutoSpeakRef.current = {
          tick,
          messageId,
          text,
          unlockGen: ug,
        };
        return;
      }
      if (tick === prev.tick) {
        // Same deps re-run (e.g. React Strict Mode dev double effect) — already queued.
        return;
      }
    }

    queueAssistantSpeech(messageId, text, !chatSending);
    rememberCompanionSpeech(activeConversationId, messageId, text);
    suppressedAssistantSpeechIdRef.current = null;
    companionBootstrapAutoSpeakRef.current = {
      tick,
      messageId,
      text,
      unlockGen: ug,
    };
  }, [
    agentVoiceMuted,
    activeConversationId,
    chatSending,
    companionSceneAvatarReady,
    conversationMessages,
    isGameModal,
    queueAssistantSpeech,
    voice.isListening,
    voiceBootstrapTick,
    voiceUnlockedGeneration,
  ]);

  useEffect(() => {
    if (!agentVoiceMuted) return;
    stopSpeaking();
  }, [agentVoiceMuted, stopSpeaking]);

  useEffect(() => {
    const pending = pendingVoiceTurnRef.current;
    if (!pending || !chatFirstTokenReceived) return;
    if (nowMs() > pending.expiresAtMs) {
      pendingVoiceTurnRef.current = null;
      return;
    }
    if (pending.firstTokenAtMs != null) return;

    const firstTokenAtMs = nowMs();
    pending.firstTokenAtMs = firstTokenAtMs;
    setVoiceLatency((prev) => ({
      firstSegmentCached: prev?.firstSegmentCached ?? null,
      speechEndToFirstTokenMs: Math.max(
        0,
        Math.round(firstTokenAtMs - pending.speechEndedAtMs),
      ),
      speechEndToVoiceStartMs: prev?.speechEndToVoiceStartMs ?? null,
    }));
  }, [chatFirstTokenReceived]);

  return {
    beginVoiceCapture,
    endVoiceCapture,
    handleEditMessage,
    handleSpeakMessage,
    stopSpeaking,
    voice,
    voiceLatency,
  };
}

function useGameModalMessages(options: {
  activeConversationId: string | null;
  companionMessageCutoffTs: number;
  isGameModal: boolean;
  visibleMsgs: ConversationMessage[];
}) {
  const {
    activeConversationId,
    companionMessageCutoffTs,
    isGameModal,
    visibleMsgs,
  } = options;
  const previousCompanionCutoffTsRef = useRef(companionMessageCutoffTs);
  const previousGameModalVisibleMsgsRef = useRef<ConversationMessage[]>([]);
  const previousActiveConversationIdRef = useRef(activeConversationId);
  const [companionNowMs, setCompanionNowMs] = useState(() => Date.now());
  const [companionCarryover, setCompanionCarryover] =
    useState<CompanionCarryoverState | null>(null);
  const docVisible = useDocumentVisibility();

  const gameModalRecentMsgs = useMemo(
    () =>
      visibleMsgs.filter(
        (message) => message.timestamp >= companionMessageCutoffTs,
      ),
    [companionMessageCutoffTs, visibleMsgs],
  );
  const gameModalContextMsgs = useMemo(() => {
    if (gameModalRecentMsgs.length > 0) {
      return gameModalRecentMsgs;
    }
    return visibleMsgs.slice(-COMPANION_VISIBLE_MESSAGE_LIMIT);
  }, [gameModalRecentMsgs, visibleMsgs]);
  const gameModalVisibleMsgs = useMemo(
    () => gameModalContextMsgs.slice(-COMPANION_VISIBLE_MESSAGE_LIMIT),
    [gameModalContextMsgs],
  );
  const gameModalCarryoverOpacity = useMemo(() => {
    if (!companionCarryover) return 0;
    if (companionNowMs < companionCarryover.fadeStartsAtMs) return 1;
    const remainingMs = companionCarryover.expiresAtMs - companionNowMs;
    if (remainingMs <= 0) return 0;
    return Math.max(0, remainingMs / COMPANION_HISTORY_FADE_MS);
  }, [companionCarryover, companionNowMs]);

  useEffect(() => {
    if (!isGameModal) {
      previousActiveConversationIdRef.current = activeConversationId;
      return;
    }

    if (previousActiveConversationIdRef.current === activeConversationId) {
      return;
    }

    previousActiveConversationIdRef.current = activeConversationId;
    previousGameModalVisibleMsgsRef.current = [];
    previousCompanionCutoffTsRef.current = companionMessageCutoffTs;
    setCompanionCarryover(null);
    // NOTE: intentionally no stopSpeaking() here — the auto-speak effect's
    // queueAssistantSpeech already cancels old speech before queuing new.
    // Calling stopSpeaking() races with greeting speech and kills it.
  }, [activeConversationId, companionMessageCutoffTs, isGameModal]);

  useEffect(() => {
    if (!isGameModal) {
      previousCompanionCutoffTsRef.current = companionMessageCutoffTs;
      return;
    }

    const previousCutoffTs = previousCompanionCutoffTsRef.current;
    if (companionMessageCutoffTs > previousCutoffTs) {
      const carryoverMessages = previousGameModalVisibleMsgsRef.current.filter(
        (message) => message.timestamp < companionMessageCutoffTs,
      );
      if (carryoverMessages.length > 0) {
        const startedAtMs = Date.now();
        setCompanionCarryover({
          expiresAtMs:
            startedAtMs + COMPANION_HISTORY_HOLD_MS + COMPANION_HISTORY_FADE_MS,
          fadeStartsAtMs: startedAtMs + COMPANION_HISTORY_HOLD_MS,
          messages: carryoverMessages,
        });
      } else {
        setCompanionCarryover(null);
      }
    }
    previousCompanionCutoffTsRef.current = companionMessageCutoffTs;
  }, [companionMessageCutoffTs, isGameModal]);

  useEffect(() => {
    previousGameModalVisibleMsgsRef.current = gameModalVisibleMsgs;
  }, [gameModalVisibleMsgs]);

  useEffect(() => {
    if (!companionCarryover) return;

    const tick = () => setCompanionNowMs(Date.now());
    tick();

    if (!docVisible) return () => {};

    const intervalId = window.setInterval(tick, 250);
    return () => window.clearInterval(intervalId);
  }, [companionCarryover, docVisible]);

  useEffect(() => {
    if (!companionCarryover) return;
    if (companionNowMs >= companionCarryover.expiresAtMs) {
      setCompanionCarryover(null);
    }
  }, [companionCarryover, companionNowMs]);

  return {
    companionCarryover,
    gameModalCarryoverOpacity,
    gameModalVisibleMsgs,
  };
}

export function ChatView({
  variant = "default",
  onPtySessionClick,
}: ChatViewProps) {
  const isGameModal = variant === "game-modal";
  const showComposerVoiceToggle = false;
  const {
    agentStatus,
    activeConversationId,
    characterData,
    chatInput,
    chatSending,
    chatFirstTokenReceived,
    chatAwaitingGreeting,
    companionMessageCutoffTs,
    conversationMessages,
    handleChatSend,
    handleChatStop,
    handleChatEdit,
    elizaCloudEnabled,
    elizaCloudConnected,
    elizaCloudHasPersistedKey,
    setState,
    droppedFiles,
    shareIngestNotice,
    chatAgentVoiceMuted: agentVoiceMuted,
    selectedVrmIndex,
    chatPendingImages,
    setChatPendingImages,
    uiLanguage,
    ptySessions,
    sendChatText,
    t,
  } = useApp();

  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const [composerHeight, setComposerHeight] = useState(0);
  const [imageDragOver, setImageDragOver] = useState(false);
  const [ptyDrawerSessionId, setPtyDrawerSessionId] = useState<string | null>(
    null,
  );

  // ── Coding agent preflight ──────────────────────────────────────
  const [codingAgentsAvailable, setCodingAgentsAvailable] = useState(false);
  useEffect(() => {
    fetch("/api/coding-agents/preflight")
      .then((r) => r.json())
      .then((data: { installed?: unknown[]; available?: boolean }) => {
        setCodingAgentsAvailable(
          (Array.isArray(data.installed) && data.installed.length > 0) ||
            data.available === true,
        );
      })
      .catch(() => {
        /* preflight unavailable — hide code button */
      });
  }, []);

  const handleCreateTask = useCallback(
    (description: string, agentType: string) => {
      void sendChatText(description, {
        metadata: { intent: "create_task", agentType },
      });
    },
    [sendChatText],
  );

  // ── Derived composer state ──────────────────────────────────────
  const isAgentStarting =
    agentStatus?.state === "starting" || agentStatus?.state === "restarting";
  const hasCompletedLifecycleActivity =
    !chatSending &&
    conversationMessages.some(
      (message) =>
        message.role === "user" ||
        (message.role === "assistant" && message.text.trim().length > 0),
    );
  const isComposerLocked = isAgentStarting && !hasCompletedLifecycleActivity;
  const cloudVoiceAvailable = elizaCloudConnected || elizaCloudEnabled;
  const {
    beginVoiceCapture,
    endVoiceCapture,
    handleEditMessage,
    handleSpeakMessage,
    stopSpeaking,
    voice,
    voiceLatency,
  } = useChatVoiceController({
    agentVoiceMuted,
    chatFirstTokenReceived,
    chatInput,
    chatSending,
    elizaCloudConnected,
    elizaCloudEnabled,
    elizaCloudHasPersistedKey,
    conversationMessages,
    activeConversationId,
    handleChatEdit,
    handleChatSend,
    isComposerLocked,
    isGameModal,
    setState,
    uiLanguage,
  });
  // Stop any in-flight voice playback when the user switches conversations.
  // useLayoutEffect (not useEffect): must run *before* useChatVoiceController's
  // passive auto-speak effect. Otherwise we queue the new thread's greeting
  // first, then stopSpeaking() clears that queue — no TTS after new chat/reset.
  const prevConversationIdRef = useRef(activeConversationId);
  useLayoutEffect(() => {
    if (prevConversationIdRef.current === activeConversationId) return;
    prevConversationIdRef.current = activeConversationId;
    stopSpeaking();
  }, [activeConversationId, stopSpeaking]);

  const handleChatAvatarSpeakingChange = useCallback(
    (isSpeaking: boolean) => {
      setState("chatAvatarSpeaking", isSpeaking);
    },
    [setState],
  );

  const agentName = characterData?.name || agentStatus?.agentName || "Agent";
  const msgs = conversationMessages;
  const visibleMsgs = useMemo(
    () =>
      msgs.filter(
        (msg) =>
          !(
            chatSending &&
            !chatFirstTokenReceived &&
            msg.role === "assistant" &&
            !msg.text.trim()
          ) && !isRoutineCodingAgentMessage(msg),
      ),
    [chatFirstTokenReceived, chatSending, msgs],
  );
  const {
    companionCarryover,
    gameModalCarryoverOpacity,
    gameModalVisibleMsgs,
  } = useGameModalMessages({
    activeConversationId,
    companionMessageCutoffTs,
    isGameModal,
    visibleMsgs,
  });
  const agentAvatarSrc =
    selectedVrmIndex > 0 ? getVrmPreviewUrl(selectedVrmIndex) : null;

  useChatAvatarVoiceBridge({
    mouthOpen: voice.mouthOpen,
    isSpeaking: voice.isSpeaking,
    usingAudioAnalysis: voice.usingAudioAnalysis,
    onSpeakingChange: handleChatAvatarSpeakingChange,
  });

  // Auto-scroll on new messages. Use instant scroll when already near the
  // bottom (or when the user is actively sending) to prevent the visible
  // "scroll from top" effect that occurs when many background messages
  // (e.g. coding-agent updates) arrive in rapid succession during smooth
  // scrolling. Only smooth-scroll when the user has scrolled up and a new
  // message nudges them back down.
  useEffect(() => {
    const displayedCompanionMessageCount =
      (companionCarryover?.messages.length ?? 0) + gameModalVisibleMsgs.length;
    if (
      !chatSending &&
      visibleMsgs.length === 0 &&
      (!isGameModal || displayedCompanionMessageCount === 0)
    ) {
      return;
    }
    const el = messagesRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < 150;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: nearBottom ? "instant" : "smooth",
    });
  }, [
    chatSending,
    companionCarryover,
    gameModalVisibleMsgs,
    isGameModal,
    visibleMsgs,
  ]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;

    // Force a compact baseline when empty so the composer never boots oversized.
    if (!chatInput) {
      ta.style.height = `${CHAT_INPUT_MIN_HEIGHT_PX}px`;
      ta.style.overflowY = "hidden";
      return;
    }

    ta.style.height = "auto";
    ta.style.overflowY = "hidden";
    const h = Math.min(ta.scrollHeight, CHAT_INPUT_MAX_HEIGHT_PX);
    ta.style.height = `${h}px`;
    ta.style.overflowY =
      ta.scrollHeight > CHAT_INPUT_MAX_HEIGHT_PX ? "auto" : "hidden";
  }, [chatInput]);

  // Track composer height so the message layer bottom adjusts dynamically
  useEffect(() => {
    const el = composerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setComposerHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isComposerLocked) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleChatSend();
    }
  };

  const addImageFiles = useCallback(
    (files: FileList | File[]) => {
      const imageFiles = Array.from(files).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (!imageFiles.length) return;

      const readers = imageFiles.map(
        (file) =>
          new Promise<ImageAttachment>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              // result is "data:<mime>;base64,<data>" — strip the prefix
              const commaIdx = result.indexOf(",");
              const data = commaIdx >= 0 ? result.slice(commaIdx + 1) : result;
              resolve({ data, mimeType: file.type, name: file.name });
            };
            reader.readAsDataURL(file);
          }),
      );

      void Promise.all(readers).then((attachments) => {
        setChatPendingImages((prev) => {
          const combined = [...prev, ...attachments];
          // Mirror the server-side MAX_CHAT_IMAGES=4 limit so the user gets
          // immediate feedback rather than a 400 after upload.
          return combined.slice(0, 4);
        });
      });
    },
    [setChatPendingImages],
  );

  const handleImageDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setImageDragOver(false);
      if (e.dataTransfer.files.length) {
        addImageFiles(e.dataTransfer.files);
      }
    },
    [addImageFiles],
  );

  const handleFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        addImageFiles(e.target.files);
      }
      e.target.value = "";
    },
    [addImageFiles],
  );

  const removeImage = useCallback(
    (index: number) => {
      setChatPendingImages((prev) => prev.filter((_, i) => i !== index));
    },
    [setChatPendingImages],
  );

  return (
    <section
      aria-label={t("aria.chatWorkspace")}
      className={`flex flex-col flex-1 min-h-0 relative ${
        isGameModal ? "overflow-visible pointer-events-none" : "bg-transparent"
      }${imageDragOver ? " ring-2 ring-accent ring-inset" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setImageDragOver(true);
      }}
      onDragLeave={() => setImageDragOver(false)}
      onDrop={handleImageDrop}
    >
      <div
        ref={messagesRef}
        data-testid="chat-messages-scroll"
        data-no-window-drag={false}
        data-no-camera-drag={false}
        data-no-camera-zoom={false}
        className={
          isGameModal
            ? "chat-native-scrollbar absolute inset-x-0 overflow-x-hidden overflow-y-auto pointer-events-none opacity-0"
            : "chat-native-scrollbar relative flex flex-1 flex-col overflow-x-hidden overflow-y-auto px-3 py-3 sm:px-4 sm:py-4 xl:px-5"
        }
        style={
          isGameModal
            ? {
                zIndex: 1,
                top: COMPANION_MESSAGE_LAYER_TOP,
                bottom:
                  composerHeight > 0
                    ? `${composerHeight + COMPANION_COMPOSER_GAP_PX}px`
                    : COMPANION_MESSAGE_LAYER_BOTTOM_FALLBACK,
                overscrollBehavior: "contain",
                touchAction: "pan-y",
                userSelect: "text",
                WebkitUserSelect: "text",
                maskImage: COMPANION_MESSAGE_LAYER_MASK,
                WebkitMaskImage: COMPANION_MESSAGE_LAYER_MASK,
              }
            : {
                zIndex: 1,
              }
        }
      >
        {visibleMsgs.length === 0 && !chatSending ? (
          chatAwaitingGreeting ? (
            isGameModal ? (
              <div className="flex min-h-full items-end px-1 py-4">
                <TypingIndicator
                  agentName={agentName}
                  agentAvatarSrc={agentAvatarSrc}
                />
              </div>
            ) : (
              <TypingIndicator
                agentName={agentName}
                agentAvatarSrc={agentAvatarSrc}
              />
            )
          ) : null
        ) : isGameModal ? (
          <div className="flex min-h-full w-full flex-col justify-end gap-4 px-1 py-4">
            {companionCarryover?.messages.map((msg) => {
              const isUser = msg.role === "user";
              return (
                <div
                  key={`carryover-${msg.id}`}
                  data-testid="companion-message-row"
                  data-companion-carryover="true"
                  className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}
                  style={{ opacity: gameModalCarryoverOpacity }}
                >
                  <div
                    className={`max-w-[min(85%,24rem)] rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
                      isUser
                        ? `${COMPANION_USER_BUBBLE_CLASSNAME} rounded-br-sm`
                        : `${COMPANION_ASSISTANT_BUBBLE_CLASSNAME} rounded-bl-sm`
                    }`}
                  >
                    <div
                      className="break-words"
                      style={{ fontFamily: "var(--font-chat)" }}
                    >
                      <MessageContent message={msg} />
                    </div>
                  </div>
                </div>
              );
            })}
            {gameModalVisibleMsgs.map((msg) => {
              const isUser = msg.role === "user";
              return (
                <div
                  key={msg.id}
                  data-testid="companion-message-row"
                  className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[min(85%,24rem)] rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
                      isUser
                        ? `${COMPANION_USER_BUBBLE_CLASSNAME} rounded-br-sm`
                        : `${COMPANION_ASSISTANT_BUBBLE_CLASSNAME} rounded-bl-sm`
                    }`}
                  >
                    <div
                      className="break-words"
                      style={{ fontFamily: "var(--font-chat)" }}
                    >
                      <MessageContent message={msg} />
                    </div>
                  </div>
                </div>
              );
            })}
            {chatSending && !chatFirstTokenReceived && (
              <div className="flex w-full justify-start">
                <div
                  className={`max-w-[min(85%,24rem)] rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1 ${COMPANION_TYPING_BUBBLE_CLASSNAME}`}
                >
                  <span
                    className={COMPANION_TYPING_DOT_CLASSNAME}
                    style={{ animationDelay: "0ms" }}
                  />
                  <span
                    className={COMPANION_TYPING_DOT_CLASSNAME}
                    style={{ animationDelay: "150ms" }}
                  />
                  <span
                    className={COMPANION_TYPING_DOT_CLASSNAME}
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full space-y-1.5">
            {visibleMsgs.map((msg, i) => {
              const prev = i > 0 ? visibleMsgs[i - 1] : null;
              const isGrouped = prev?.role === msg.role;

              return (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  isGrouped={isGrouped}
                  agentName={agentName}
                  agentAvatarSrc={agentAvatarSrc}
                  onSpeak={handleSpeakMessage}
                  onEdit={handleEditMessage}
                />
              );
            })}

            {chatSending && !chatFirstTokenReceived && (
              <TypingIndicator
                agentName={agentName}
                agentAvatarSrc={agentAvatarSrc}
              />
            )}
          </div>
        )}
      </div>

      {/* Agent activity box — sticky status per active coding-agent task */}
      {isGameModal ? (
        <div className="pointer-events-auto">
          <AgentActivityBox
            sessions={ptySessions}
            onSessionClick={(id) =>
              setPtyDrawerSessionId((prev) => (prev === id ? null : id))
            }
          />
        </div>
      ) : (
        <AgentActivityBox
          sessions={ptySessions}
          onSessionClick={(id) =>
            setPtyDrawerSessionId((prev) => (prev === id ? null : id))
          }
        />
      )}
      {ptyDrawerSessionId && ptySessions.length > 0 && (
        <PtyConsoleDrawer
          activeSessionId={ptyDrawerSessionId}
          sessions={ptySessions}
          onClose={() => setPtyDrawerSessionId(null)}
        />
      )}
      {shareIngestNotice && (
        <div
          className={`text-xs text-ok py-1 relative${isGameModal ? " pointer-events-auto" : ""}`}
          style={{ zIndex: 1 }}
        >
          {shareIngestNotice}
        </div>
      )}
      {droppedFiles.length > 0 && (
        <div
          className={`text-xs text-muted py-0.5 flex gap-2 relative${isGameModal ? " pointer-events-auto" : ""}`}
          style={{ zIndex: 1 }}
        >
          {droppedFiles.map((f) => (
            <span key={f}>{f}</span>
          ))}
        </div>
      )}
      {chatPendingImages.length > 0 && (
        <div
          className={`flex gap-2 flex-wrap py-1 relative${isGameModal ? " pointer-events-auto" : ""}`}
          data-no-camera-drag={isGameModal || undefined}
          style={{ zIndex: 1 }}
        >
          {chatPendingImages.map((img, imgIdx) => (
            <div
              key={`${img.name}-${img.data}`}
              className="relative group w-16 h-16 shrink-0"
            >
              <img
                src={`data:${img.mimeType};base64,${img.data}`}
                alt={img.name}
                className="w-16 h-16 object-cover border border-border rounded"
              />
              <Button
                variant="destructive"
                size="icon"
                title={t("chatview.RemoveImage")}
                aria-label={`Remove image ${img.name}`}
                onClick={() => removeImage(imgIdx)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-danger text-white text-[10px] flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer"
              >
                ×
              </Button>
            </div>
          ))}
        </div>
      )}

      {voiceLatency && (
        <div
          className={`pb-1 text-[10px] text-muted relative${isGameModal ? " pointer-events-auto" : ""}`}
          style={{ zIndex: 1 }}
        >
          {t("chatview.SilenceEndFirstTo")}{" "}
          {voiceLatency.speechEndToFirstTokenMs ?? "—"}
          {t("chatview.msEndVoiceStart")}{" "}
          {voiceLatency.speechEndToVoiceStartMs ?? "—"}
          {t("chatview.msFirst")}{" "}
          {voiceLatency.firstSegmentCached == null
            ? "—"
            : voiceLatency.firstSegmentCached
              ? "cached"
              : "uncached"}
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />
      {isGameModal ? (
        /* ── Game-modal composer ──────────────────────────────────────── */
        <div
          ref={composerRef}
          className="mt-auto pointer-events-auto px-1 max-[380px]:px-0.5"
          data-no-camera-drag="true"
          style={{
            zIndex: 1,
            paddingBottom:
              "calc(max(env(safe-area-inset-bottom, 0px), 0px) + 0.25rem)",
          }}
        >
          {/* Agent activity box — above composer in companion dock */}
          <AgentActivityBox
            sessions={ptySessions}
            onSessionClick={
              onPtySessionClick ??
              ((id) =>
                setPtyDrawerSessionId((prev) => (prev === id ? null : id)))
            }
          />
          <div className={COMPANION_COMPOSER_SHELL_LAYOUT_CLASSNAME}>
            <div
              aria-hidden
              className={COMPANION_COMPOSER_GLASS_LAYER_CLASSNAME}
            />
            <div className="relative z-[1] flex w-full items-center">
              <ChatComposer
                variant="game-modal"
                textareaRef={textareaRef}
                chatInput={chatInput}
                chatPendingImagesCount={chatPendingImages.length}
                isComposerLocked={isComposerLocked}
                isAgentStarting={isAgentStarting}
                chatSending={chatSending}
                voice={{
                  supported: voice.supported,
                  isListening: voice.isListening,
                  captureMode: voice.captureMode,
                  interimTranscript: voice.interimTranscript,
                  isSpeaking: voice.isSpeaking,
                  assistantTtsQuality: voice.assistantTtsQuality,
                  toggleListening: voice.toggleListening,
                  startListening: beginVoiceCapture,
                  stopListening: endVoiceCapture,
                }}
                agentVoiceEnabled={!agentVoiceMuted}
                showAgentVoiceToggle={showComposerVoiceToggle}
                t={t}
                onAttachImage={() => fileInputRef.current?.click()}
                onChatInputChange={(value) => setState("chatInput", value)}
                onKeyDown={handleKeyDown}
                onSend={() => void handleChatSend()}
                onStop={handleChatStop}
                onStopSpeaking={stopSpeaking}
                onToggleAgentVoice={() =>
                  setState("chatAgentVoiceMuted", !agentVoiceMuted)
                }
                codingAgentsAvailable={codingAgentsAvailable}
                onCreateTask={handleCreateTask}
              />
            </div>
          </div>
        </div>
      ) : (
        /* ── Default composer ─────────────────────────────────────────── */
        <div
          className="relative border-t border-border/20 bg-transparent px-3 pb-3 pt-3 sm:px-4 sm:pb-4 xl:px-5"
          style={{
            zIndex: 1,
            paddingBottom: "calc(var(--safe-area-bottom, 0px) + 0.75rem)",
          }}
        >
          <ChatComposer
            variant="default"
            textareaRef={textareaRef}
            chatInput={chatInput}
            chatPendingImagesCount={chatPendingImages.length}
            isComposerLocked={isComposerLocked}
            isAgentStarting={isAgentStarting}
            chatSending={chatSending}
            voice={{
              supported: voice.supported,
              isListening: voice.isListening,
              captureMode: voice.captureMode,
              interimTranscript: voice.interimTranscript,
              isSpeaking: voice.isSpeaking,
              assistantTtsQuality: voice.assistantTtsQuality,
              toggleListening: voice.toggleListening,
              startListening: beginVoiceCapture,
              stopListening: endVoiceCapture,
            }}
            agentVoiceEnabled={!agentVoiceMuted}
            showAgentVoiceToggle={showComposerVoiceToggle}
            t={t}
            onAttachImage={() => fileInputRef.current?.click()}
            onChatInputChange={(value) => setState("chatInput", value)}
            onKeyDown={handleKeyDown}
            onSend={() => void handleChatSend()}
            onStop={handleChatStop}
            onStopSpeaking={stopSpeaking}
            onToggleAgentVoice={() =>
              setState("chatAgentVoiceMuted", !agentVoiceMuted)
            }
            codingAgentsAvailable={codingAgentsAvailable}
            onCreateTask={handleCreateTask}
          />
        </div>
      )}
    </section>
  );
}
