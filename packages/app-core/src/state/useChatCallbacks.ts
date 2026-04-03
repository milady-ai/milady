/**
 * Chat callbacks — extracted from AppContext.
 *
 * Assembler hook: composes useChatLifecycle + useChatSend and owns the
 * greeting / conversation-management callbacks that depend on both.
 */

import { type MutableRefObject, useCallback, useEffect, useRef } from "react";
import {
  type AgentStatus,
  type ConversationChannelType,
  type ConversationMessage,
  type ConversationMode,
  type ImageAttachment,
  type StreamEventEnvelope,
  client,
} from "../api";
import type { AppState } from "./internal";
import {
  loadActiveConversationId,
  type LoadConversationMessagesResult,
} from "./internal";
import type { LifecycleAction, UiShellMode } from "./internal";
import type { Tab } from "../navigation";
import type { CodingAgentSession } from "../api";
import { isMiladyTtsDebugEnabled } from "../utils/milady-tts-debug";
import type { OnboardingMode, OnboardingStep } from "./types";
import type { Conversation, OnboardingOptions } from "../api";

import { useChatLifecycle } from "./useChatLifecycle";
import { useChatSend } from "./useChatSend";

// ── Helpers (file-local) ────────────────────────────────────────────

function shouldKeepConversationMessage(message: ConversationMessage): boolean {
  if (message.role !== "assistant") return true;
  if (message.text.trim().length > 0) return true;
  return Boolean(message.blocks?.length);
}

function filterRenderableConversationMessages(
  messages: ConversationMessage[],
): ConversationMessage[] {
  return messages.filter((message) => shouldKeepConversationMessage(message));
}

function hasConversationBootstrapMessage(
  messages: ConversationMessage[],
): boolean {
  return messages.some(
    (message) =>
      message.role === "assistant" && shouldKeepConversationMessage(message),
  );
}

/** Enable with `MILADY_TTS_DEBUG=1` or `localStorage.setItem("milady:debug:greeting", "1")`. */
function miladyGreetingDebugEnabled(): boolean {
  if (isMiladyTtsDebugEnabled()) return true;
  try {
    return (
      typeof localStorage !== "undefined" &&
      localStorage.getItem("milady:debug:greeting") === "1"
    );
  } catch {
    return false;
  }
}

function traceMiladyGreeting(
  phase: string,
  detail?: Record<string, unknown>,
): void {
  if (!miladyGreetingDebugEnabled()) return;
  if (detail && Object.keys(detail).length > 0) {
    console.info(`[milady][greeting] ${phase}`, detail);
  } else {
    console.info(`[milady][greeting] ${phase}`);
  }
}

import { isRoutineCodingAgentMessage } from "../chat";

const COMPANION_STALE_THREAD_MAX_AGE_MS = 30 * 60 * 1000;
const COMPANION_STALE_THREAD_VISIBLE_MESSAGE_LIMIT = 2;

function isPersistedGreetingMessage(message: ConversationMessage): boolean {
  return (
    message.role === "assistant" &&
    message.source === "agent_greeting" &&
    message.text.trim().length > 0
  );
}

function shouldStartFreshCompanionConversation(
  messages: ConversationMessage[],
  now = Date.now(),
): boolean {
  const visibleMessages = messages
    .filter((message) => shouldKeepConversationMessage(message))
    .filter((message) => !isRoutineCodingAgentMessage(message))
    .slice(-COMPANION_STALE_THREAD_VISIBLE_MESSAGE_LIMIT);

  if (visibleMessages.length === 0) {
    return false;
  }

  if (
    visibleMessages.length === 1 &&
    isPersistedGreetingMessage(visibleMessages[0])
  ) {
    return false;
  }

  return visibleMessages.every((message) => {
    if (!Number.isFinite(message.timestamp)) {
      return false;
    }
    return now - message.timestamp > COMPANION_STALE_THREAD_MAX_AGE_MS;
  });
}

// ── Deps interface ──────────────────────────────────────────────────

export interface UseChatCallbacksDeps {
  // Translation
  t: (key: string) => string;

  // UI state
  uiLanguage: string;
  uiShellMode: UiShellMode;
  tab: Tab;

  // Agent status
  agentStatus: AgentStatus | null;

  // Chat state from useChatState
  chatInput: string;
  chatMode: ConversationMode;
  conversations: Conversation[];
  activeConversationId: string | null;
  companionMessageCutoffTs: number;
  conversationMessages: ConversationMessage[];
  ptySessions: CodingAgentSession[];

  // Setters from useChatState
  setChatInput: (v: string) => void;
  setChatSending: (v: boolean) => void;
  setChatFirstTokenReceived: (v: boolean) => void;
  setChatLastUsage: (v: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    model: string | undefined;
    updatedAt: number;
  }) => void;
  setChatPendingImages: (v: ImageAttachment[]) => void;
  setConversations: (
    v: Conversation[] | ((prev: Conversation[]) => Conversation[]),
  ) => void;
  setActiveConversationId: (v: string | null) => void;
  setCompanionMessageCutoffTs: (v: number) => void;
  setConversationMessages: (
    v:
      | ConversationMessage[]
      | ((prev: ConversationMessage[]) => ConversationMessage[]),
  ) => void;
  setUnreadConversations: (
    v: Set<string> | ((prev: Set<string>) => Set<string>),
  ) => void;
  resetConversationDraftState: () => void;

  // Refs from useChatState
  activeConversationIdRef: MutableRefObject<string | null>;
  chatInputRef: MutableRefObject<string>;
  chatPendingImagesRef: MutableRefObject<ImageAttachment[]>;
  conversationMessagesRef: MutableRefObject<ConversationMessage[]>;
  conversationHydrationEpochRef: MutableRefObject<number>;
  chatAbortRef: MutableRefObject<AbortController | null>;
  chatSendBusyRef: MutableRefObject<boolean>;
  chatSendNonceRef: MutableRefObject<number>;
  greetingFiredRef: MutableRefObject<boolean>;
  greetingInFlightConversationRef: MutableRefObject<string | null>;
  companionStaleConversationRefreshRef: MutableRefObject<string | null>;

  // Lifecycle
  lifecycleAction: LifecycleAction | null;
  beginLifecycleAction: (action: LifecycleAction) => boolean;
  finishLifecycleAction: () => void;
  lifecycleBusyRef: MutableRefObject<boolean>;
  lifecycleActionRef: MutableRefObject<LifecycleAction | null>;
  setAgentStatus: (s: AgentStatus | null) => void;
  setActionNotice: (
    text: string,
    tone: "success" | "error" | "info",
    ttlMs?: number,
    once?: boolean,
    busy?: boolean,
  ) => void;

  // Pending restart
  pendingRestart: boolean;
  pendingRestartReasons: string[];
  setPendingRestart: (v: boolean) => void;
  setPendingRestartReasons: (
    v: string[] | ((prev: string[]) => string[]),
  ) => void;

  // Backend connection
  setBackendDisconnectedBannerDismissed: (v: boolean) => void;
  resetBackendConnection: () => void;

  // Loaders
  loadConversations: () => Promise<Conversation[] | null>;
  loadConversationMessages: (
    convId: string,
  ) => Promise<LoadConversationMessagesResult>;
  loadPlugins: () => Promise<unknown>;

  // Cloud state
  elizaCloudEnabled: boolean;
  elizaCloudConnected: boolean;
  pollCloudCredits: () => Promise<boolean>;
  elizaCloudPreferDisconnectedUntilLoginRef: MutableRefObject<boolean>;
  setElizaCloudEnabled: (v: boolean) => void;
  setElizaCloudConnected: (v: boolean) => void;
  setElizaCloudVoiceProxyAvailable: (v: boolean) => void;
  setElizaCloudHasPersistedKey: (v: boolean) => void;
  setElizaCloudCredits: (v: number | null) => void;
  setElizaCloudCreditsLow: (v: boolean) => void;
  setElizaCloudCreditsCritical: (v: boolean) => void;
  setElizaCloudAuthRejected: (v: boolean) => void;
  setElizaCloudCreditsError: (v: string | null) => void;
  setElizaCloudTopUpUrl: (v: string) => void;
  setElizaCloudUserId: (v: string | null) => void;
  setElizaCloudStatusReason: (v: string | null) => void;
  setElizaCloudLoginError: (v: string | null) => void;

  // Onboarding setters (used by completeResetLocalStateAfterServerWipe)
  onboardingCompletionCommittedRef: MutableRefObject<boolean>;
  onboardingResumeConnectionRef: MutableRefObject<unknown>;
  setOnboardingUiRevealNonce: (fn: (n: number) => number) => void;
  setOnboardingLoading: (v: boolean) => void;
  setOnboardingComplete: (v: boolean) => void;
  setOnboardingStep: (v: OnboardingStep) => void;
  setOnboardingMode: (v: OnboardingMode) => void;
  setOnboardingActiveGuide: (v: string | null) => void;
  setOnboardingDeferredTasks: (v: string[]) => void;
  setPostOnboardingChecklistDismissed: (v: boolean) => void;
  setOnboardingName: (v: string) => void;
  setOnboardingStyle: (v: string) => void;
  setOnboardingRunMode: (v: "local" | "cloud" | "") => void;
  setOnboardingCloudProvider: (v: string) => void;
  setOnboardingProvider: (v: string) => void;
  setOnboardingApiKey: (v: string) => void;
  setOnboardingVoiceProvider: (v: string) => void;
  setOnboardingVoiceApiKey: (v: string) => void;
  setOnboardingPrimaryModel: (v: string) => void;
  setOnboardingOpenRouterModel: (v: string) => void;
  setOnboardingRemoteConnected: (v: boolean) => void;
  setOnboardingRemoteApiBase: (v: string) => void;
  setOnboardingRemoteToken: (v: string) => void;
  setOnboardingSmallModel: (v: string) => void;
  setOnboardingLargeModel: (v: string) => void;
  setOnboardingOptions: (v: OnboardingOptions | null) => void;

  // Character / avatar
  setSelectedVrmIndex: (v: number) => void;
  setCustomVrmUrl: (v: string) => void;
  setCustomBackgroundUrl: (v: string) => void;

  // Plugins / skills / logs
  setPlugins: (v: never[]) => void;
  setSkills: (v: never[]) => void;
  setLogs: (v: never[]) => void;
}

// ── Hook ────────────────────────────────────────────────────────────

export function useChatCallbacks(deps: UseChatCallbacksDeps) {
  const {
    t,
    uiLanguage,
    uiShellMode,
    tab,
    agentStatus,
    chatMode,
    conversations,
    activeConversationId,
    companionMessageCutoffTs,
    conversationMessages,
    ptySessions,
    setChatInput,
    setChatSending,
    setChatFirstTokenReceived,
    setChatLastUsage,
    setChatPendingImages,
    setConversations,
    setActiveConversationId,
    setCompanionMessageCutoffTs,
    setConversationMessages,
    setUnreadConversations,
    resetConversationDraftState,
    activeConversationIdRef,
    chatInputRef,
    chatPendingImagesRef,
    conversationMessagesRef,
    conversationHydrationEpochRef,
    chatAbortRef,
    chatSendBusyRef,
    chatSendNonceRef,
    greetingFiredRef,
    greetingInFlightConversationRef,
    companionStaleConversationRefreshRef,
    lifecycleAction,
    beginLifecycleAction,
    finishLifecycleAction,
    lifecycleBusyRef,
    lifecycleActionRef,
    setAgentStatus,
    setActionNotice,
    pendingRestart,
    pendingRestartReasons,
    setPendingRestart,
    setPendingRestartReasons,
    setBackendDisconnectedBannerDismissed,
    resetBackendConnection,
    loadConversations,
    loadConversationMessages,
    loadPlugins,
    elizaCloudEnabled,
    elizaCloudConnected,
    pollCloudCredits,
    elizaCloudPreferDisconnectedUntilLoginRef,
    setElizaCloudEnabled,
    setElizaCloudConnected,
    setElizaCloudVoiceProxyAvailable,
    setElizaCloudHasPersistedKey,
    setElizaCloudCredits,
    setElizaCloudCreditsLow,
    setElizaCloudCreditsCritical,
    setElizaCloudAuthRejected,
    setElizaCloudCreditsError,
    setElizaCloudTopUpUrl,
    setElizaCloudUserId,
    setElizaCloudStatusReason,
    setElizaCloudLoginError,
    onboardingCompletionCommittedRef,
    onboardingResumeConnectionRef,
    setOnboardingUiRevealNonce,
    setOnboardingLoading,
    setOnboardingComplete,
    setOnboardingStep,
    setOnboardingMode,
    setOnboardingActiveGuide,
    setOnboardingDeferredTasks,
    setPostOnboardingChecklistDismissed,
    setOnboardingName,
    setOnboardingStyle,
    setOnboardingRunMode,
    setOnboardingCloudProvider,
    setOnboardingProvider,
    setOnboardingApiKey,
    setOnboardingVoiceProvider,
    setOnboardingVoiceApiKey,
    setOnboardingPrimaryModel,
    setOnboardingOpenRouterModel,
    setOnboardingRemoteConnected,
    setOnboardingRemoteApiBase,
    setOnboardingRemoteToken,
    setOnboardingSmallModel,
    setOnboardingLargeModel,
    setOnboardingOptions,
    setSelectedVrmIndex,
    setCustomVrmUrl,
    setCustomBackgroundUrl,
    setPlugins,
    setSkills,
    setLogs,
  } = deps;

  // ── Greeting / hydration (defined here; passed into lifecycle) ──────

  const fetchGreeting = useCallback(
    async (convId: string): Promise<boolean> => {
      if (greetingInFlightConversationRef.current === convId) {
        traceMiladyGreeting("fetchGreeting:skip_duplicate_in_flight", {
          convId,
        });
        return false;
      }
      greetingInFlightConversationRef.current = convId;
      traceMiladyGreeting("fetchGreeting:request", { convId });
      try {
        const data = await client.requestGreeting(convId, uiLanguage);
        if (data.text) {
          const stillActive = activeConversationIdRef.current === convId;
          traceMiladyGreeting("fetchGreeting:response", {
            convId,
            stillActive,
            textLength: data.text.length,
            persisted: data.persisted === true,
          });
          if (stillActive) {
            setConversationMessages((prev: ConversationMessage[]) => {
              if (
                prev.some(
                  (message) =>
                    message.role === "assistant" &&
                    message.source === "agent_greeting" &&
                    message.text === data.text,
                )
              ) {
                return prev;
              }
              return [
                ...prev,
                {
                  id: `greeting-${Date.now()}`,
                  role: "assistant",
                  text: data.text,
                  timestamp: Date.now(),
                  source: "agent_greeting",
                },
              ];
            });
            greetingFiredRef.current = true;
          }
          return stillActive;
        }
        traceMiladyGreeting("fetchGreeting:empty_or_whitespace", { convId });
        greetingFiredRef.current = false;
      } catch (err) {
        traceMiladyGreeting("fetchGreeting:request_failed", {
          convId,
          error: err instanceof Error ? err.message : String(err),
        });
        greetingFiredRef.current = false;
        /* greeting failed silently — user can still chat */
      } finally {
        if (greetingInFlightConversationRef.current === convId) {
          greetingInFlightConversationRef.current = null;
        }
      }
      return false;
    },
    [
      uiLanguage,
      activeConversationIdRef,
      greetingFiredRef,
      greetingInFlightConversationRef,
      setConversationMessages,
    ],
  );

  const requestGreetingWhenRunning = useCallback(
    async (convId: string | null): Promise<void> => {
      if (!convId || greetingFiredRef.current) {
        traceMiladyGreeting("requestGreetingWhenRunning:skip", {
          convId: convId ?? null,
          greetingFired: greetingFiredRef.current,
        });
        return;
      }
      try {
        const status = await client.getStatus();
        traceMiladyGreeting("requestGreetingWhenRunning:status", {
          convId,
          state: status.state,
        });
        if (status.state === "running" && !greetingFiredRef.current) {
          await fetchGreeting(convId);
        }
      } catch (err) {
        console.warn(
          "[milady][chat:init] failed to confirm runtime state for greeting",
          err,
        );
      }
    },
    [fetchGreeting],
  );

  const hydrateInitialConversationState = useCallback(async (): Promise<
    string | null
  > => {
    const hydrationEpoch = ++conversationHydrationEpochRef.current;
    const isCurrentHydration = () =>
      conversationHydrationEpochRef.current === hydrationEpoch;

    try {
      const { conversations: c } = await client.listConversations();
      traceMiladyGreeting("hydrate:listConversations", { count: c.length });
      if (!isCurrentHydration()) {
        return null;
      }
      setConversations(c);
      if (c.length > 0) {
        const savedConversationId = loadActiveConversationId();
        const restoredConversation =
          c.find((conversation) => conversation.id === savedConversationId) ??
          c[0];
        if (!isCurrentHydration()) {
          return null;
        }
        setActiveConversationId(restoredConversation.id);
        activeConversationIdRef.current = restoredConversation.id;
        client.sendWsMessage({
          type: "active-conversation",
          conversationId: restoredConversation.id,
        });
        try {
          const { messages } = await client.getConversationMessages(
            restoredConversation.id,
          );
          if (!isCurrentHydration()) {
            return null;
          }
          const nextMessages = filterRenderableConversationMessages(messages);
          greetingFiredRef.current =
            hasConversationBootstrapMessage(nextMessages);
          conversationMessagesRef.current = nextMessages;
          setConversationMessages(nextMessages);
          return nextMessages.length === 0 ? restoredConversation.id : null;
        } catch (err) {
          if (!isCurrentHydration()) {
            return null;
          }
          console.warn(
            "[milady][chat:init] failed to load restored conversation messages",
            err,
          );
          greetingFiredRef.current = false;
          conversationMessagesRef.current = [];
          setConversationMessages([]);
          return restoredConversation.id;
        }
      }

      if (!isCurrentHydration()) {
        return null;
      }
      traceMiladyGreeting("hydrate:no_conversations_on_server");
      greetingFiredRef.current = false;
      conversationMessagesRef.current = [];
      setConversationMessages([]);
      setActiveConversationId(null);
      activeConversationIdRef.current = null;
      return null;
    } catch (err) {
      console.warn("[milady][chat:init] failed to hydrate conversations", err);
      return null;
    }
  }, [
    activeConversationIdRef,
    conversationHydrationEpochRef,
    conversationMessagesRef,
    greetingFiredRef,
    setActiveConversationId,
    setConversationMessages,
    setConversations,
  ]);

  // ── Send sub-hook ───────────────────────────────────────────────────

  const send = useChatSend({
    t,
    uiLanguage,
    chatMode,
    conversations,
    activeConversationId,
    ptySessions,
    setChatInput,
    setChatSending,
    setChatFirstTokenReceived,
    setChatLastUsage,
    setChatPendingImages,
    setConversations,
    setActiveConversationId,
    setCompanionMessageCutoffTs,
    setConversationMessages,
    setUnreadConversations,
    setActionNotice,
    activeConversationIdRef,
    chatInputRef,
    chatPendingImagesRef,
    conversationMessagesRef,
    chatAbortRef,
    chatSendBusyRef,
    chatSendNonceRef,
    loadConversations,
    loadConversationMessages,
    elizaCloudEnabled,
    elizaCloudConnected,
    pollCloudCredits,
  });

  // ── Lifecycle sub-hook ──────────────────────────────────────────────

  const lifecycle = useChatLifecycle({
    agentStatus,
    setAgentStatus,
    lifecycleAction,
    beginLifecycleAction,
    finishLifecycleAction,
    lifecycleBusyRef,
    lifecycleActionRef,
    setActionNotice,
    pendingRestart,
    pendingRestartReasons,
    setPendingRestart,
    setPendingRestartReasons,
    setBackendDisconnectedBannerDismissed,
    resetBackendConnection,
    loadConversations,
    loadPlugins,
    hydrateInitialConversationState,
    requestGreetingWhenRunning,
    interruptActiveChatPipeline: send.interruptActiveChatPipeline,
    resetConversationDraftState,
    setActiveConversationId,
    setConversationMessages,
    setConversations,
    activeConversationIdRef,
    elizaCloudPreferDisconnectedUntilLoginRef,
    setElizaCloudEnabled,
    setElizaCloudConnected,
    setElizaCloudVoiceProxyAvailable,
    setElizaCloudHasPersistedKey,
    setElizaCloudCredits,
    setElizaCloudCreditsLow,
    setElizaCloudCreditsCritical,
    setElizaCloudAuthRejected,
    setElizaCloudCreditsError,
    setElizaCloudTopUpUrl,
    setElizaCloudUserId,
    setElizaCloudStatusReason,
    setElizaCloudLoginError,
    onboardingCompletionCommittedRef,
    onboardingResumeConnectionRef,
    setOnboardingUiRevealNonce,
    setOnboardingLoading,
    setOnboardingComplete,
    setOnboardingStep,
    setOnboardingMode,
    setOnboardingActiveGuide,
    setOnboardingDeferredTasks,
    setPostOnboardingChecklistDismissed,
    setOnboardingName,
    setOnboardingStyle,
    setOnboardingRunMode,
    setOnboardingCloudProvider,
    setOnboardingProvider,
    setOnboardingApiKey,
    setOnboardingVoiceProvider,
    setOnboardingVoiceApiKey,
    setOnboardingPrimaryModel,
    setOnboardingOpenRouterModel,
    setOnboardingRemoteConnected,
    setOnboardingRemoteApiBase,
    setOnboardingRemoteToken,
    setOnboardingSmallModel,
    setOnboardingLargeModel,
    setOnboardingOptions,
    setSelectedVrmIndex,
    setCustomVrmUrl,
    setCustomBackgroundUrl,
    setPlugins,
    setSkills,
    setLogs,
  });

  // ── Conversation management ─────────────────────────────────────────

  const handleNewConversation = useCallback(
    async (title?: string) => {
      const previousConversationId = activeConversationIdRef.current;
      const previousMessages = conversationMessagesRef.current;
      const previousCutoffTs = companionMessageCutoffTs;

      send.interruptActiveChatPipeline();
      resetConversationDraftState();

      try {
        const { conversation, greeting: inlineGreeting } =
          await client.createConversation(title, {
            bootstrapGreeting: true,
            lang: uiLanguage,
          });
        const nextCutoffTs = Date.now();
        setConversations((prev) => [conversation, ...prev]);
        setActiveConversationId(conversation.id);
        activeConversationIdRef.current = conversation.id;
        setCompanionMessageCutoffTs(nextCutoffTs);
        // Try inline greeting first; fall back to dedicated greeting endpoint
        let greetingText = inlineGreeting?.text?.trim() || "";
        if (!greetingText) {
          try {
            const resp = await client.requestGreeting(
              conversation.id,
              uiLanguage,
            );
            greetingText = resp.text?.trim() || "";
          } catch {
            // Greeting generation failed — continue without greeting
          }
        }

        if (greetingText) {
          greetingFiredRef.current = true;
          const initMessages: ConversationMessage[] = [
            {
              id: `greeting-${Date.now()}`,
              role: "assistant",
              text: greetingText,
              timestamp: Date.now(),
              source: "agent_greeting",
            },
          ];
          conversationMessagesRef.current = initMessages;
          setConversationMessages(initMessages);
        } else {
          greetingFiredRef.current = false;
          conversationMessagesRef.current = [];
          setConversationMessages([]);
          // Fallback: if inline greeting wasn't returned (e.g. old server),
          // request one via the dedicated /greeting endpoint.
          void fetchGreeting(conversation.id);
        }
        client.sendWsMessage({
          type: "active-conversation",
          conversationId: conversation.id,
        });
      } catch {
        setActiveConversationId(previousConversationId);
        activeConversationIdRef.current = previousConversationId;
        setConversationMessages(previousMessages);
        setCompanionMessageCutoffTs(previousCutoffTs);
        greetingFiredRef.current =
          hasConversationBootstrapMessage(previousMessages);
        if (previousConversationId) {
          client.sendWsMessage({
            type: "active-conversation",
            conversationId: previousConversationId,
          });
        }
      }
    },
    [
      companionMessageCutoffTs,
      fetchGreeting,
      resetConversationDraftState,
      uiLanguage,
      activeConversationIdRef,
      conversationMessagesRef,
      greetingFiredRef,
      send.interruptActiveChatPipeline,
      setActiveConversationId,
      setCompanionMessageCutoffTs,
      setConversationMessages,
      setConversations,
    ],
  );

  useEffect(() => {
    if (uiShellMode !== "companion" || tab !== "companion") {
      companionStaleConversationRefreshRef.current = null;
      return;
    }

    if (!activeConversationId) {
      return;
    }

    if (!shouldStartFreshCompanionConversation(conversationMessages)) {
      companionStaleConversationRefreshRef.current = null;
      return;
    }

    if (companionStaleConversationRefreshRef.current === activeConversationId) {
      return;
    }

    companionStaleConversationRefreshRef.current = activeConversationId;
    void handleNewConversation();
  }, [
    activeConversationId,
    conversationMessages,
    handleNewConversation,
    tab,
    uiShellMode,
    companionStaleConversationRefreshRef,
  ]);

  const handleSelectConversation = useCallback(
    async (id: string) => {
      conversationHydrationEpochRef.current += 1;
      if (
        id === activeConversationId &&
        conversationMessagesRef.current.length > 0
      )
        return;

      send.interruptActiveChatPipeline();

      // Clean up empty conversations: if the previous conversation has only
      // system/greeting messages and no user messages, delete it silently.
      const prevId = activeConversationId;
      if (prevId && prevId !== id) {
        const prevMessages = conversationMessagesRef.current;
        const hasUserMessage = prevMessages.some((m) => m.role === "user");
        if (!hasUserMessage && prevMessages.length <= 1) {
          void client.deleteConversation(prevId).catch(() => {});
          setConversations((prev) => prev.filter((c) => c.id !== prevId));
          setUnreadConversations((prev) => {
            const next = new Set(prev);
            next.delete(prevId);
            return next;
          });
        }
      }

      const previousActive = activeConversationId;
      setActiveConversationId(id);
      activeConversationIdRef.current = id;
      client.sendWsMessage({ type: "active-conversation", conversationId: id });
      setUnreadConversations((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      const loaded = await loadConversationMessages(id);
      if (loaded.ok) return;

      if (loaded.status === 404) {
        const refreshed = await loadConversations();
        const fallbackId = refreshed?.[0]?.id ?? null;
        if (fallbackId) {
          setActiveConversationId(fallbackId);
          activeConversationIdRef.current = fallbackId;
          client.sendWsMessage({
            type: "active-conversation",
            conversationId: fallbackId,
          });
          const fallbackLoaded = await loadConversationMessages(fallbackId);
          if (!fallbackLoaded.ok) {
            setActionNotice(
              `Failed to load fallback conversation: ${fallbackLoaded.message}`,
              "error",
              4200,
            );
          }
        } else {
          setActiveConversationId(null);
          activeConversationIdRef.current = null;
          setConversationMessages([]);
        }
        setActionNotice(
          "Conversation was not found. Refreshed the conversation list.",
          "info",
          3200,
        );
        return;
      }

      setActiveConversationId(previousActive);
      activeConversationIdRef.current = previousActive;
      if (previousActive) {
        client.sendWsMessage({
          type: "active-conversation",
          conversationId: previousActive,
        });
        const restored = await loadConversationMessages(previousActive);
        if (!restored.ok) {
          setActionNotice(
            `Failed to restore previous conversation: ${restored.message}`,
            "error",
            4200,
          );
        }
      } else {
        setConversationMessages([]);
      }
      setActionNotice(
        `Failed to load conversation: ${loaded.message}`,
        "error",
        4200,
      );
    },
    [
      activeConversationId,
      loadConversationMessages,
      loadConversations,
      setActionNotice,
      activeConversationIdRef,
      conversationHydrationEpochRef,
      conversationMessagesRef.current,
      send.interruptActiveChatPipeline,
      setActiveConversationId,
      setConversationMessages,
      setConversations,
      setUnreadConversations,
    ],
  );

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      const deletingActive = activeConversationId === id;
      if (deletingActive) {
        send.interruptActiveChatPipeline();
      }
      try {
        await client.deleteConversation(id);
        setConversations((prev) =>
          prev.filter((conversation) => conversation.id !== id),
        );
        setUnreadConversations((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        if (deletingActive) {
          setActiveConversationId(null);
          activeConversationIdRef.current = null;
          setConversationMessages([]);
        }
        const refreshed = await loadConversations();
        if (deletingActive) {
          const fallbackId = refreshed?.[0]?.id ?? null;
          if (fallbackId) {
            setActiveConversationId(fallbackId);
            activeConversationIdRef.current = fallbackId;
            client.sendWsMessage({
              type: "active-conversation",
              conversationId: fallbackId,
            });
            const fallbackLoaded = await loadConversationMessages(fallbackId);
            if (!fallbackLoaded.ok) {
              setActionNotice(
                `Failed to load fallback conversation: ${fallbackLoaded.message}`,
                "error",
                4200,
              );
            }
          }
        }
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 404) {
          setConversations((prev) =>
            prev.filter((conversation) => conversation.id !== id),
          );
          setUnreadConversations((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          if (deletingActive) {
            setActiveConversationId(null);
            activeConversationIdRef.current = null;
            setConversationMessages([]);
          }
          await loadConversations();
          setActionNotice(
            "Conversation was already deleted. Refreshed the conversation list.",
            "info",
            3200,
          );
          return;
        }
        setActionNotice(
          `Failed to delete conversation: ${err instanceof Error ? err.message : "network error"}`,
          "error",
          4200,
        );
      }
    },
    [
      activeConversationId,
      send.interruptActiveChatPipeline,
      loadConversationMessages,
      loadConversations,
      setActionNotice,
      activeConversationIdRef,
      setActiveConversationId,
      setConversationMessages,
      setConversations,
      setUnreadConversations,
    ],
  );

  const handleRenameConversation = useCallback(
    async (id: string, title: string) => {
      const trimmed = title.trim();
      if (!trimmed) {
        setActionNotice("Conversation title cannot be empty.", "error", 2800);
        return;
      }
      try {
        const { conversation } = await client.renameConversation(id, trimmed);
        setConversations((prev) =>
          prev.map((existing) =>
            existing.id === id ? conversation : existing,
          ),
        );
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 404) {
          await loadConversations();
          setActionNotice(
            "Conversation was not found. Refreshed the conversation list.",
            "info",
            3200,
          );
          return;
        }
        setActionNotice(
          `Failed to rename conversation: ${err instanceof Error ? err.message : "network error"}`,
          "error",
          4200,
        );
      }
    },
    [loadConversations, setActionNotice, setConversations],
  );

  const suggestConversationTitle = useCallback(
    async (id: string) => {
      try {
        const { conversation } = await client.renameConversation(id, "", {
          generate: true,
        });
        setConversations((prev) =>
          prev.map((existing) =>
            existing.id === id ? conversation : existing,
          ),
        );
        const next = conversation.title?.trim();
        return next && next.length > 0 ? next : null;
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 404) {
          await loadConversations();
          setActionNotice(
            "Conversation was not found. Refreshed the conversation list.",
            "info",
            3200,
          );
          return null;
        }
        setActionNotice(
          `Failed to suggest conversation title: ${err instanceof Error ? err.message : "network error"}`,
          "error",
          4200,
        );
        return null;
      }
    },
    [loadConversations, setActionNotice, setConversations],
  );

  return {
    // Greeting / hydration
    fetchGreeting,
    requestGreetingWhenRunning,
    hydrateInitialConversationState,
    // Conversation management
    handleNewConversation,
    handleSelectConversation,
    handleDeleteConversation,
    handleRenameConversation,
    suggestConversationTitle,
    // Lifecycle (from useChatLifecycle)
    ...lifecycle,
    // Send (from useChatSend)
    ...send,
  };
}
