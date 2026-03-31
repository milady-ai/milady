/**
 * Global application state via React Context.
 *
 * Children access state and actions through the useApp() hook.
 */

import { ONBOARDING_PROVIDER_CATALOG } from "@miladyai/shared/contracts/onboarding";
import {
  getDefaultStylePreset,
  getStylePresets,
  resolveStylePresetByAvatarIndex,
} from "@miladyai/shared/onboarding-presets";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type AgentStartupDiagnostics,
  type AgentStatus,
  type BscTradeExecuteRequest,
  type BscTradeExecuteResponse,
  type BscTradePreflightResponse,
  type BscTradeQuoteRequest,
  type BscTradeQuoteResponse,
  type BscTradeTxStatusResponse,
  type BscTransferExecuteRequest,
  type BscTransferExecuteResponse,
  type CatalogSkill,
  type CharacterData,
  type CodingAgentSession,
  type Conversation,
  type ConversationChannelType,
  type ConversationMessage,
  type ConversationMode,
  type CreateTriggerRequest,
  type CustomActionDef,
  client,
  type ExtensionStatus,
  type ImageAttachment,
  type McpMarketplaceResult,
  type McpRegistryServerDetail,
  type McpServerConfig,
  type McpServerStatus,
  MiladyClient,
  type OnboardingOptions,
  type PluginInfo,
  type RegistryPlugin,
  type ReleaseChannel,
  type SkillInfo,
  type SkillMarketplaceResult,
  type SkillScanReportSummary,
  type StreamEventEnvelope,
  type StylePreset,
  type TriggerHealthSnapshot,
  type TriggerRunRecord,
  type TriggerSummary,
  type UpdateStatus,
  type UpdateTriggerRequest,
  type WalletTradingProfileResponse,
  type WalletTradingProfileSourceFilter,
  type WalletTradingProfileWindow,
  type WorkbenchOverview,
} from "../api";
import {
  buildAutonomyGapReplayRequests,
  hasPendingAutonomyGaps,
  markPendingAutonomyGapsPartial,
  mergeAutonomyEvents,
} from "../autonomy";
import {
  getBackendStartupTimeoutMs,
  inspectExistingElizaInstall,
  invokeDesktopBridgeRequest,
  invokeDesktopBridgeRequestWithTimeout,
  isElectrobunRuntime,
  scanProviderCredentials,
} from "../bridge";
import {
  expandSavedCustomCommand,
  isRoutineCodingAgentMessage,
  loadSavedCustomCommands,
  normalizeSlashCommandName,
} from "../chat";
import { mapServerTasksToSessions } from "../coding";
import { getBootConfig, setBootConfig } from "../config/boot-config";
import { BrandingContext, DEFAULT_BRANDING } from "../config/branding";
import {
  type AppEmoteEventDetail,
  dispatchAppEmoteEvent,
  dispatchElizaCloudStatusUpdated,
} from "../events";
import type { UiLanguage } from "../i18n";
import {
  COMPANION_ENABLED,
  isRouteRootPath,
  pathForTab,
  resolveInitialTabForPath,
  type Tab,
  tabFromPath,
} from "../navigation";
import { getResetConnectionWizardToHostingStepPatch } from "../onboarding/connection-flow";
import {
  canRevertOnboardingTo,
  getFlaminaTopicForOnboardingStep,
  resolveOnboardingNextStep,
  resolveOnboardingPreviousStep,
} from "../onboarding/flow";
import { buildOnboardingConnectionConfig } from "../onboarding-config";
import {
  alertDesktopMessage,
  confirmDesktopAction,
  copyTextToClipboard,
  openExternalUrl,
  resolveApiUrl,
  yieldMiladyHttpAfterNativeMessageBox,
} from "../utils";
import { isMiladyTtsDebugEnabled } from "../utils/milady-tts-debug";
import { normalizeOwnerName } from "../utils/owner-name";
import { PREMADE_VOICES } from "../voice/types";
import {
  computeAgentDeadlineExtensions,
  getAgentReadyTimeoutMs,
} from "./agent-startup-timing";
import { CompanionSceneConfigCtx } from "./CompanionSceneConfigContext";
import { completeResetLocalStateAfterServerWipe as runCompleteResetLocalStateAfterServerWipe } from "./complete-reset-local-state-after-wipe";
import { handleResetAppliedFromMainCore } from "./handle-reset-applied-from-main";
import {
  AGENT_TRANSFER_MIN_PASSWORD_LENGTH,
  AppContext,
  type AppContextValue,
  type AppState,
  applyUiTheme,
  asApiLikeError,
  type CompanionHalfFramerateMode,
  type CompanionVrmPowerMode,
  clearAvatarIndex,
  clearPersistedConnectionMode,
  clearPersistedOnboardingStep,
  deriveOnboardingResumeConnection,
  deriveOnboardingResumeFields,
  formatSearchBullet,
  formatStartupErrorDetail,
  type GamePostMessageAuthPayload,
  inferOnboardingResumeStep,
  LIFECYCLE_MESSAGES,
  type LoadConversationMessagesResult,
  loadActiveConversationId,
  loadAvatarIndex,
  loadCompanionAnimateWhenHidden,
  loadCompanionHalfFramerateMode,
  loadCompanionVrmPowerMode,
  loadLastNativeTab,
  loadPersistedConnectionMode,
  loadPersistedOnboardingComplete,
  loadPersistedOnboardingStep,
  loadUiTheme,
  mergeStreamingText,
  normalizeAvatarIndex,
  normalizeCompanionHalfFramerateMode,
  normalizeCompanionVrmPowerMode,
  normalizeCustomActionName,
  type OnboardingHandoffPhase,
  normalizeUiShellMode,
  normalizeUiTheme,
  type OnboardingNextOptions,
  type OnboardingStep,
  parseAgentStatusEvent,
  parseAgentStatusFromMainMenuResetPayload,
  parseCustomActionParams,
  parseProactiveMessageEvent,
  parseSlashCommandInput,
  parseStreamEventEnvelopeEvent,
  type ShellView,
  type StartupErrorState,
  saveAvatarIndex,
  saveCompanionAnimateWhenHidden,
  saveCompanionHalfFramerateMode,
  saveCompanionVrmPowerMode,
  saveLastNativeTab,
  savePersistedConnectionMode,
  saveUiShellMode,
  saveUiTheme,
  shouldApplyFinalStreamText,
  type TabCommittedDetail,
  type UiShellMode,
  type UiTheme,
} from "./internal";
import { NavigationEventHub } from "./navigation-events";
import {
  deriveDetectedProviderPrefill,
  detectExistingOnboardingConnection,
  resolveStartupWithoutRestoredConnection,
} from "./onboarding-bootstrap";
import {
  deriveUiShellModeForTab,
  getTabForShellView,
  shouldStartAtCharacterSelectOnLaunch,
} from "./shell-routing";
import { TranslationProvider, useTranslation } from "./TranslationContext";
import type { InventoryChainFilters } from "./types";
import { useChatState } from "./useChatState";
import { useLifecycleState } from "./useLifecycleState";
import { useTriggersState } from "./useTriggersState";
import { usePairingState } from "./usePairingState";
import { useExportImportState } from "./useExportImportState";
import { useLogsState } from "./useLogsState";
import { useMiscUiState } from "./useMiscUiState";
import { useDisplayPreferences } from "./useDisplayPreferences";
import { useOnboardingState } from "./useOnboardingState";
import { useCharacterState } from "./useCharacterState";
import { useWalletState } from "./useWalletState";
import { usePluginsSkillsState } from "./usePluginsSkillsState";
import { useCloudState } from "./useCloudState";

const AGENT_STATUS_POLL_INTERVAL_MS = 500;
const ONBOARDING_GREETING_READY_TIMEOUT_MS = 15_000;

type OnboardingHandoffMode = "full" | "cloud_fast_track";

type OnboardingHandoffRetryState = {
  mode: OnboardingHandoffMode;
  onboardingSubmitted: boolean;
  skipCloudProvisioning: boolean;
  cloudApiBase?: string;
  authToken?: string;
};

export {
  type ActionNotice,
  AGENT_STATES,
  AGENT_TRANSFER_MIN_PASSWORD_LENGTH,
  type AppActions,
  AppContext,
  type AppContextValue,
  type AppState,
  applyUiTheme,
  asApiLikeError,
  type ChatTurnUsage,
  type CompanionHalfFramerateMode,
  type CompanionVrmPowerMode,
  computeStreamingDelta,
  formatSearchBullet,
  formatStartupErrorDetail,
  type GamePostMessageAuthPayload,
  getCompanionBackgroundUrl,
  getVrmBackgroundUrl,
  getVrmPreviewUrl,
  getVrmTitle,
  getVrmUrl,
  LIFECYCLE_MESSAGES,
  type LifecycleAction,
  type LoadConversationMessagesResult,
  loadAvatarIndex,
  loadChatAvatarVisible,
  loadChatMode,
  loadChatVoiceMuted,
  loadCompanionAnimateWhenHidden,
  loadCompanionHalfFramerateMode,
  loadCompanionVrmPowerMode,
  loadUiLanguage,
  loadUiShellMode,
  loadUiTheme,
  mergeStreamingText,
  type NavigationEventsApi,
  normalizeAvatarIndex,
  normalizeCompanionHalfFramerateMode,
  normalizeCompanionVrmPowerMode,
  normalizeCustomActionName,
  normalizeStreamComparisonText,
  normalizeUiShellMode,
  normalizeUiTheme,
  ONBOARDING_PERMISSION_LABELS,
  type OnboardingNextOptions,
  type OnboardingStep,
  parseAgentStartupDiagnostics,
  parseAgentStatusEvent,
  parseAgentStatusFromMainMenuResetPayload,
  parseConversationMessageEvent,
  parseCustomActionParams,
  parseProactiveMessageEvent,
  parseSlashCommandInput,
  parseStreamEventEnvelopeEvent,
  type ShellView,
  type SlashCommandInput,
  type StartupErrorReason,
  type StartupErrorState,
  type StartupPhase,
  saveAvatarIndex,
  saveChatAvatarVisible,
  saveChatMode,
  saveChatVoiceMuted,
  saveCompanionAnimateWhenHidden,
  saveCompanionHalfFramerateMode,
  saveCompanionVrmPowerMode,
  saveUiLanguage,
  saveUiShellMode,
  saveUiTheme,
  shouldApplyFinalStreamText,
  type TabCommittedDetail,
  type TranslationContextValue,
  type UiShellMode,
  type UiTheme,
  useApp,
  useTranslation,
  VRM_COUNT,
} from "./internal";
export { AGENT_READY_TIMEOUT_MS } from "./types";

import {
  ConfirmDialog,
  PromptDialog,
  useConfirm,
  usePrompt,
} from "@miladyai/ui";
import { buildWalletRpcUpdateRequest } from "../wallet-rpc";

// ELIZA_CLOUD_LOGIN_POLL_INTERVAL_MS, ELIZA_CLOUD_LOGIN_TIMEOUT_MS,
// ELIZA_CLOUD_LOGIN_MAX_CONSECUTIVE_ERRORS are now in useCloudState.ts
const DEFAULT_LANDING_TAB: Tab = COMPANION_ENABLED ? "companion" : "chat";

function getNavigationPathFromWindow(): string {
  if (typeof window === "undefined") return "/";
  return window.location.protocol === "file:"
    ? window.location.hash.replace(/^#/, "") || "/"
    : window.location.pathname;
}

function normalizeAppEmoteEvent(
  data: Record<string, unknown>,
): AppEmoteEventDetail | null {
  const emoteId = typeof data.emoteId === "string" ? data.emoteId : null;
  const path =
    typeof data.path === "string"
      ? data.path
      : typeof data.glbPath === "string"
        ? data.glbPath
        : null;
  if (!emoteId || !path) return null;
  return {
    emoteId,
    path,
    duration:
      typeof data.duration === "number" && Number.isFinite(data.duration)
        ? data.duration
        : 3,
    loop: data.loop === true,
    showOverlay: data.showOverlay !== false,
  };
}

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

function resolveSelectedOnboardingStyle(args: {
  styles: readonly StylePreset[] | undefined;
  onboardingStyle: string;
  selectedVrmIndex: number;
  uiLanguage: UiLanguage;
}): StylePreset {
  const styles = args.styles ?? [];
  return (
    styles.find((style) => style.id === args.onboardingStyle) ??
    styles.find(
      (style) =>
        typeof style.avatarIndex === "number" &&
        style.avatarIndex === args.selectedVrmIndex,
    ) ??
    styles[0] ??
    getDefaultStylePreset(args.uiLanguage)
  );
}

async function persistOnboardingStyleVoice(
  style: StylePreset | undefined,
): Promise<void> {
  const voicePresetId = style?.voicePresetId?.trim();
  if (!voicePresetId) {
    return;
  }
  const presetVoice = PREMADE_VOICES.find(
    (voice) => voice.id === voicePresetId,
  );
  if (!presetVoice) {
    return;
  }
  await client.updateConfig({
    messages: {
      tts: {
        provider: "elevenlabs",
        elevenlabs: {
          voiceId: presetVoice.voiceId,
        },
      },
    },
  });
}

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

interface QueuedChatSend {
  rawInput: string;
  channelType: ConversationChannelType;
  conversationId?: string | null;
  images?: ImageAttachment[];
  resolve: () => void;
  reject: (error: unknown) => void;
}

function isPrivateNetworkHost(host: string): boolean {
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/.test(host)) {
    return true;
  }
  return false;
}

function normalizeRemoteApiBaseInput(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    throw new Error("Enter a backend address.");
  }
  const hasScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed);
  const hostGuess = trimmed.replace(/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//, "");
  const guessedHost = hostGuess.split("/")[0]?.replace(/:\d+$/, "") ?? "";
  const defaultProtocol = isPrivateNetworkHost(guessedHost) ? "http" : "https";
  const candidate = hasScheme ? trimmed : `${defaultProtocol}://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("Enter a valid backend address.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Remote backends must use http:// or https://.");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/+$/, "");
}

/** Verbose trace for Settings / menu “Reset agent” — filter DevTools by `[milady][reset]`. */
const RESET_LOG_PREFIX = "[milady][reset]";

function logResetDebug(
  message: string,
  detail?: Record<string, unknown>,
): void {
  if (detail !== undefined && Object.keys(detail).length > 0) {
    console.debug(`${RESET_LOG_PREFIX} ${message}`, detail);
  } else {
    console.debug(`${RESET_LOG_PREFIX} ${message}`);
  }
}

function logResetInfo(message: string, detail?: Record<string, unknown>): void {
  if (detail !== undefined && Object.keys(detail).length > 0) {
    console.info(`${RESET_LOG_PREFIX} ${message}`, detail);
  } else {
    console.info(`${RESET_LOG_PREFIX} ${message}`);
  }
}

function logResetWarn(message: string, detail?: unknown): void {
  console.warn(`${RESET_LOG_PREFIX} ${message}`, detail);
}

function buildLocalizedCharacterPayload(
  preset: StylePreset,
  name?: string | null,
): CharacterData {
  const resolvedName = name?.trim() || preset.name;
  return {
    name: resolvedName,
    bio: [...preset.bio],
    system: preset.system,
    adjectives: [...preset.adjectives],
    topics: [...preset.topics],
    style: {
      all: [...preset.style.all],
      chat: [...preset.style.chat],
      post: [...preset.style.post],
    },
    messageExamples: preset.messageExamples.map((conversation) => ({
      examples: conversation.map((message) => ({
        name: message.user,
        content: { text: message.content.text },
      })),
    })),
    postExamples: [...preset.postExamples],
  };
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

/** Publish server cloud snapshot for chat TTS (`useVoiceChat` + `loadVoiceConfig`). */
function publishElizaCloudVoiceSnapshot(
  setHasPersistedKey: (value: boolean) => void,
  snapshot: {
    apiConnected: boolean;
    enabled: boolean;
    hasPersistedApiKey: boolean;
  },
): void {
  setHasPersistedKey(snapshot.hasPersistedApiKey);
  dispatchElizaCloudStatusUpdated({
    connected: snapshot.apiConnected,
    enabled: snapshot.enabled,
    hasPersistedApiKey: snapshot.hasPersistedApiKey,
    cloudVoiceProxyAvailable:
      snapshot.hasPersistedApiKey || snapshot.enabled || snapshot.apiConnected,
  });
}

// ── Provider ───────────────────────────────────────────────────────────

export function AppProvider({
  children,
  branding: brandingOverride,
}: {
  children: ReactNode;
  branding?: Partial<import("../config/branding").BrandingConfig>;
}) {
  const onLanguageSyncError = useCallback((lang: UiLanguage) => {
    // Notification is deferred until AppProviderInner mounts; this is
    // only called on language *changes*, never on initial mount.
    console.warn("[milady] Failed to sync language to server:", lang);
  }, []);
  return (
    <TranslationProvider onLanguageSyncError={onLanguageSyncError}>
      <AppProviderInner branding={brandingOverride}>
        {children}
      </AppProviderInner>
    </TranslationProvider>
  );
}

function AppProviderInner({
  children,
  branding: brandingOverride,
}: {
  children: ReactNode;
  branding?: Partial<import("../config/branding").BrandingConfig>;
}) {
  const [lastNativeTab, setLastNativeTabState] =
    useState<Tab>(loadLastNativeTab);
  // --- Core state ---
  const [tab, _setTabRawInner] = useState<Tab>(() =>
    resolveInitialTabForPath(
      getNavigationPathFromWindow(),
      DEFAULT_LANDING_TAB,
    ),
  );
  const initialTabSetRef = useRef(false);
  const setTabRaw = useCallback((t: Tab) => {
    _setTabRawInner(t);
  }, []);
  // uiLanguage + t live in TranslationContext; consumed via useTranslation()
  const { t, uiLanguage, setUiLanguage } = useTranslation();
  // --- Display preferences (extracted to useDisplayPreferences) ---
  const displayPrefs = useDisplayPreferences();
  const {
    state: {
      uiTheme,
      companionVrmPowerMode,
      companionAnimateWhenHidden,
      companionHalfFramerateMode,
    },
    setUiTheme,
    setCompanionVrmPowerMode,
    setCompanionAnimateWhenHidden,
    setCompanionHalfFramerateMode,
  } = displayPrefs;

  // ── Lifecycle state (consolidated from 20+ useState hooks) ──
  const lifecycle = useLifecycleState();
  const {
    state: {
      connected,
      agentStatus,
      onboardingComplete,
      onboardingUiRevealNonce,
      onboardingLoading,
      startupPhase,
      startupError,
      startupRetryNonce,
      authRequired,
      actionNotice,
      lifecycleBusy,
      lifecycleAction,
      pendingRestart,
      pendingRestartReasons,
      restartBannerDismissed,
      backendConnection,
      backendDisconnectedBannerDismissed,
      systemWarnings,
    },
    setConnected,
    setAgentStatus,
    setAgentStatusIfChanged,
    setOnboardingComplete,
    incrementOnboardingRevealNonce: setOnboardingUiRevealNonce_increment,
    setOnboardingLoading,
    setStartupPhase,
    setStartupError,
    setAuthRequired,
    setActionNotice,
    beginLifecycleAction,
    finishLifecycleAction,
    setPendingRestart: setPendingRestartAction,
    dismissRestartBanner,
    showRestartBanner,
    setBackendConnection,
    dismissBackendBanner: dismissBackendDisconnectedBanner,
    resetBackendConnection,
    dismissSystemWarning,
    startupStatus,
    lifecycleBusyRef,
    lifecycleActionRef,
  } = lifecycle;

  // Compatibility wrappers — old code calls these separately; lifecycle hook combines them.
  const setPendingRestart = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const resolved =
        typeof v === "function" ? v(lifecycle.state.pendingRestart) : v;
      setPendingRestartAction(resolved);
    },
    [lifecycle.state.pendingRestart, setPendingRestartAction],
  );
  const setPendingRestartReasons = useCallback(
    (v: string[] | ((prev: string[]) => string[])) => {
      const resolved =
        typeof v === "function" ? v(lifecycle.state.pendingRestartReasons) : v;
      setPendingRestartAction(lifecycle.state.pendingRestart, resolved);
    },
    [
      lifecycle.state.pendingRestart,
      lifecycle.state.pendingRestartReasons,
      setPendingRestartAction,
    ],
  );
  const setOnboardingUiRevealNonce = useCallback(
    (_fn: (n: number) => number) => setOnboardingUiRevealNonce_increment(),
    [setOnboardingUiRevealNonce_increment],
  );
  const setBackendDisconnectedBannerDismissed = useCallback(
    (v: boolean) => {
      if (v) dismissBackendDisconnectedBanner();
      // Note: only dismissal is supported via the reducer
    },
    [dismissBackendDisconnectedBanner],
  );
  const setSystemWarnings = useCallback(
    (v: string[] | ((prev: string[]) => string[])) => {
      const resolved =
        typeof v === "function" ? v(lifecycle.state.systemWarnings) : v;
      lifecycle.setSystemWarnings(resolved);
    },
    [lifecycle.state.systemWarnings, lifecycle.setSystemWarnings],
  );
  const retryStartup = lifecycle.retryStartup;

  const uiShellMode = deriveUiShellModeForTab(tab);

  // --- Pairing ---
  // --- Pairing (extracted to usePairingState) ---
  const pairingHook = usePairingState();
  const {
    state: {
      pairingEnabled,
      pairingExpiresAt,
      pairingCodeInput,
      pairingError,
      pairingBusy,
    },
    setPairingEnabled,
    setPairingExpiresAt,
    setPairingCodeInput,
    handlePairingSubmit,
  } = pairingHook;

  // ── Chat state (consolidated from 18+ useState + 10 useEffect hooks) ──
  const chatState = useChatState();
  const {
    state: {
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
    },
    setChatInput,
    setChatSending,
    setChatFirstTokenReceived,
    setChatLastUsage,
    setChatAvatarVisible,
    setChatAgentVoiceMuted,
    setChatMode,
    setChatAvatarSpeaking,
    setConversations,
    setActiveConversationId,
    setCompanionMessageCutoffTs,
    setConversationMessages,
    setAutonomousEvents,
    setAutonomousLatestEventId,
    setAutonomousRunHealthByRunId,
    setPtySessions,
    setChatPendingImages,
    resetDraftState: resetConversationDraftState,
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
    autonomousStoreRef,
    autonomousEventsRef,
    autonomousLatestEventIdRef,
    autonomousRunHealthByRunIdRef,
    autonomousReplayInFlightRef,
  } = chatState;
  const chatSendQueueRef = useRef<QueuedChatSend[]>([]);
  const resolveQueuedChatSends = useCallback(() => {
    const queued = chatSendQueueRef.current.splice(0);
    for (const turn of queued) {
      turn.resolve();
    }
  }, []);
  const interruptActiveChatPipeline = useCallback(() => {
    resolveQueuedChatSends();
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    setChatSending(false);
    setChatFirstTokenReceived(false);
  }, [
    chatAbortRef,
    resolveQueuedChatSends,
    setChatFirstTokenReceived,
    setChatSending,
  ]);
  // Compat: old code sometimes used a separate chatAwaitingGreeting state
  const [chatAwaitingGreeting, setChatAwaitingGreeting] = useState(false);
  const [onboardingHandoffPhase, setOnboardingHandoffPhase] =
    useState<OnboardingHandoffPhase>("idle");
  const [onboardingHandoffError, setOnboardingHandoffError] = useState<
    string | null
  >(null);
  const onboardingHandoffRetryStateRef =
    useRef<OnboardingHandoffRetryState | null>(null);
  // addUnread / removeUnread wrappers for old setUnreadConversations patterns
  const setUnreadConversations = useCallback(
    (v: Set<string> | ((prev: Set<string>) => Set<string>)) => {
      if (typeof v === "function") {
        const nextVal = v(chatState.state.unreadConversations);
        // Sync back through dispatch
        for (const id of nextVal) chatState.addUnread(id);
      } else {
        // Direct set not supported through reducer — use add/remove
      }
    },
    [chatState],
  );

  // --- Triggers (extracted to useTriggersState) ---
  const triggersHook = useTriggersState();
  const {
    state: {
      triggers,
      triggersLoading,
      triggersSaving,
      triggerRunsById,
      triggerHealth,
      triggerError,
    },
    loadTriggers,
    loadTriggerHealth,
    loadTriggerRuns,
    createTrigger,
    updateTrigger,
    deleteTrigger,
    runTriggerNow,
  } = triggersHook;

  // --- Plugins / Skills / Store / Catalog (extracted to usePluginsSkillsState) ---
  const pluginsSkillsHook = usePluginsSkillsState({ setActionNotice });
  const {
    plugins,
    setPlugins,
    pluginFilter,
    setPluginFilter,
    pluginStatusFilter,
    setPluginStatusFilter,
    pluginSearch,
    setPluginSearch,
    pluginSettingsOpen,
    setPluginSettingsOpen,
    pluginAdvancedOpen,
    setPluginAdvancedOpen,
    pluginSaving,
    setPluginSaving,
    pluginSaveSuccess,
    setPluginSaveSuccess,
    loadPlugins,
    handlePluginToggle,
    handlePluginConfigSave,
    skills,
    setSkills,
    skillsSubTab,
    setSkillsSubTab,
    skillCreateFormOpen,
    setSkillCreateFormOpen,
    skillCreateName,
    setSkillCreateName,
    skillCreateDescription,
    setSkillCreateDescription,
    skillCreating,
    setSkillCreating,
    skillReviewReport,
    setSkillReviewReport,
    skillReviewId,
    setSkillReviewId,
    skillReviewLoading,
    setSkillReviewLoading,
    skillToggleAction,
    setSkillToggleAction,
    skillsMarketplaceQuery,
    setSkillsMarketplaceQuery,
    skillsMarketplaceResults,
    setSkillsMarketplaceResults,
    skillsMarketplaceError,
    setSkillsMarketplaceError,
    skillsMarketplaceLoading,
    setSkillsMarketplaceLoading,
    skillsMarketplaceAction,
    setSkillsMarketplaceAction,
    skillsMarketplaceManualGithubUrl,
    setSkillsMarketplaceManualGithubUrl,
    loadSkills,
    refreshSkills,
    handleSkillToggle,
    handleCreateSkill,
    handleOpenSkill,
    handleDeleteSkill,
    handleReviewSkill,
    handleAcknowledgeSkill,
    searchSkillsMarketplace,
    installSkillFromMarketplace,
    installSkillFromGithubUrl,
    uninstallMarketplaceSkill,
    storePlugins,
    setStorePlugins,
    storeSearch,
    setStoreSearch,
    storeFilter,
    setStoreFilter,
    storeLoading,
    setStoreLoading,
    storeInstalling,
    setStoreInstalling,
    storeUninstalling,
    setStoreUninstalling,
    storeError,
    setStoreError,
    storeDetailPlugin,
    setStoreDetailPlugin,
    storeSubTab,
    setStoreSubTab,
    catalogSkills,
    setCatalogSkills,
    catalogTotal,
    setCatalogTotal,
    catalogPage,
    setCatalogPage,
    catalogTotalPages,
    setCatalogTotalPages,
    catalogSort,
    setCatalogSort,
    catalogSearch,
    setCatalogSearch,
    catalogLoading,
    setCatalogLoading,
    catalogError,
    setCatalogError,
    catalogDetailSkill,
    setCatalogDetailSkill,
    catalogInstalling,
    setCatalogInstalling,
    catalogUninstalling,
    setCatalogUninstalling,
  } = pluginsSkillsHook;

  // --- Logs (extracted to useLogsState) ---
  const logsHook = useLogsState();
  const {
    state: {
      logs,
      logSources,
      logTags,
      logTagFilter,
      logLevelFilter,
      logSourceFilter,
    },
    setLogs,
    setLogTagFilter,
    setLogLevelFilter,
    setLogSourceFilter,
    loadLogs,
  } = logsHook;

  // Dead state — setters were never destructured. These never change.
  const twitterVerifyMessage: string | null = null;
  const twitterVerifyUrl = "";
  const twitterVerifying = false;

  // --- Character (extracted to useCharacterState) ---
  const characterHook = useCharacterState({ agentStatus, setAgentStatus });
  const {
    state: {
      characterData,
      characterLoading,
      characterSaving,
      characterSaveSuccess,
      characterSaveError,
      characterDraft,
      selectedVrmIndex,
      customVrmUrl,
      customBackgroundUrl,
    },
    setCharacterData,
    setCharacterDraft,
    setCharacterSaveSuccess,
    setCharacterSaveError,
    setSelectedVrmIndex,
    setCustomVrmUrl,
    setCustomBackgroundUrl,
    loadCharacter,
    handleSaveCharacter,
    handleCharacterFieldInput,
    handleCharacterArrayInput,
    handleCharacterStyleInput,
    handleCharacterMessageExamplesInput,
  } = characterHook;

  // elizaCloud* state, refs, and callbacks are now provided by useCloudState (cloudHook above).

  const [ownerName, setOwnerNameState] = useState<string | null>(null);
  const [ownerNameHydrated, setOwnerNameHydrated] = useState(false);
  const [pendingOwnerNamePrompt, setPendingOwnerNamePrompt] = useState(false);
  const [showOwnerNamePrompt, setShowOwnerNamePrompt] = useState(false);
  // --- Updates ---
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateChannelSaving, setUpdateChannelSaving] = useState(false);

  // --- Extension ---
  const [extensionStatus, setExtensionStatus] =
    useState<ExtensionStatus | null>(null);
  const [extensionChecking, setExtensionChecking] = useState(false);

  // --- Workbench ---
  const [workbenchLoading, setWorkbenchLoading] = useState(false);
  const [workbench, setWorkbench] = useState<WorkbenchOverview | null>(null);
  const [workbenchTasksAvailable, setWorkbenchTasksAvailable] = useState(false);
  const [workbenchTriggersAvailable, setWorkbenchTriggersAvailable] =
    useState(false);
  const [workbenchTodosAvailable, setWorkbenchTodosAvailable] = useState(false);

  // --- Agent export/import (extracted to useExportImportState) ---
  const exportImportHook = useExportImportState();
  const {
    state: {
      exportBusy,
      exportPassword,
      exportIncludeLogs,
      exportError,
      exportSuccess,
      importBusy,
      importPassword,
      importFile,
      importError,
      importSuccess,
    },
    setExportPassword,
    setExportIncludeLogs,
    setExportError,
    setExportSuccess,
    setImportPassword,
    setImportFile,
    setImportError,
    setImportSuccess,
    handleAgentExport,
    handleAgentImport,
  } = exportImportHook;

  // ── Onboarding state (consolidated from 35+ useState hooks) ──
  const onboarding = useOnboardingState(brandingOverride?.cloudOnly);
  const {
    state: {
      step: onboardingStep,
      mode: onboardingMode,
      activeGuide: onboardingActiveGuide,
      deferredTasks: onboardingDeferredTasks,
      postChecklistDismissed: postOnboardingChecklistDismissed,
      options: onboardingOptions,
      name: onboardingName,
      ownerName: onboardingOwnerName,
      style: onboardingStyle,
      avatar: onboardingAvatar,
      runMode: onboardingRunMode,
      cloudProvider: onboardingCloudProvider,
      provider: onboardingProvider,
      apiKey: onboardingApiKey,
      voiceProvider: onboardingVoiceProvider,
      voiceApiKey: onboardingVoiceApiKey,
      smallModel: onboardingSmallModel,
      largeModel: onboardingLargeModel,
      openRouterModel: onboardingOpenRouterModel,
      primaryModel: onboardingPrimaryModel,
      existingInstallDetected: onboardingExistingInstallDetected,
      detectedProviders: onboardingDetectedProviders,
      connectorTokens,
      remote: onboardingRemote,
      remoteApiBase: onboardingRemoteApiBase,
      remoteToken: onboardingRemoteToken,
      subscriptionTab: onboardingSubscriptionTab,
      elizaCloudTab: onboardingElizaCloudTab,
      selectedChains: onboardingSelectedChains,
      rpcSelections: onboardingRpcSelections,
      rpcKeys: onboardingRpcKeys,
      restarting: onboardingRestarting,
    },
    setStep: setOnboardingStep,
    setMode: setOnboardingMode,
    setActiveGuide: setOnboardingActiveGuide,
    addDeferredTask: addDeferredOnboardingTask,
    setOptions: setOnboardingOptions,
    setField: setOnboardingField,
    setConnectorToken,
    setRemoteStatus: setOnboardingRemoteStatus,
    setDetectedProviders: setOnboardingDetectedProviders,
    finishBusyRef: onboardingFinishBusyRefFromHook,
    resumeConnectionRef: onboardingResumeConnectionRefFromHook,
    completionCommittedRef: onboardingCompletionCommittedRefFromHook,
    forceLocalBootstrapRef: forceLocalBootstrapRefFromHook,
    finishSavingRef: onboardingFinishSavingRefFromHook,
  } = onboarding;

  // Compat aliases for old onboarding variable names
  const onboardingRemoteConnecting = onboardingRemote.status === "connecting";
  const onboardingRemoteError = onboardingRemote.error;
  const onboardingRemoteConnected = onboardingRemote.status === "connected";

  // Map connector tokens to old individual variable names
  const onboardingTelegramToken = connectorTokens.telegramToken;
  const onboardingDiscordToken = connectorTokens.discordToken;
  const onboardingWhatsAppSessionPath = connectorTokens.whatsAppSessionPath;
  const onboardingTwilioAccountSid = connectorTokens.twilioAccountSid;
  const onboardingTwilioAuthToken = connectorTokens.twilioAuthToken;
  const onboardingTwilioPhoneNumber = connectorTokens.twilioPhoneNumber;
  const onboardingBlooioApiKey = connectorTokens.blooioApiKey;
  const onboardingBlooioPhoneNumber = connectorTokens.blooioPhoneNumber;
  const onboardingGithubToken = connectorTokens.githubToken;

  // Compat setters for old setState map entries
  const setOnboardingName = useCallback(
    (v: string) => setOnboardingField("name", v),
    [setOnboardingField],
  );
  const setOnboardingOwnerName = useCallback(
    (v: string) => setOnboardingField("ownerName", v),
    [setOnboardingField],
  );
  const setOnboardingStyle = useCallback(
    (v: string) => setOnboardingField("style", v),
    [setOnboardingField],
  );
  const setOnboardingRunMode = useCallback(
    (v: "local" | "cloud" | "") => setOnboardingField("runMode", v),
    [setOnboardingField],
  );
  const setOnboardingCloudProvider = useCallback(
    (v: string) => setOnboardingField("cloudProvider", v),
    [setOnboardingField],
  );
  const setOnboardingSmallModel = useCallback(
    (v: string) => setOnboardingField("smallModel", v),
    [setOnboardingField],
  );
  const setOnboardingLargeModel = useCallback(
    (v: string) => setOnboardingField("largeModel", v),
    [setOnboardingField],
  );
  const setOnboardingProvider = useCallback(
    (v: string) => setOnboardingField("provider", v),
    [setOnboardingField],
  );
  const setOnboardingApiKey = useCallback(
    (v: string) => setOnboardingField("apiKey", v),
    [setOnboardingField],
  );
  const setOnboardingVoiceProvider = useCallback(
    (v: string) => setOnboardingField("voiceProvider", v),
    [setOnboardingField],
  );
  const setOnboardingVoiceApiKey = useCallback(
    (v: string) => setOnboardingField("voiceApiKey", v),
    [setOnboardingField],
  );
  const setOnboardingExistingInstallDetected = useCallback(
    (v: boolean) => setOnboardingField("existingInstallDetected", v),
    [setOnboardingField],
  );
  const setOnboardingRemoteApiBase = useCallback(
    (v: string) =>
      onboarding.dispatch({ type: "SET_REMOTE_API_BASE", value: v }),
    [onboarding.dispatch],
  );
  const setOnboardingRemoteToken = useCallback(
    (v: string) => onboarding.dispatch({ type: "SET_REMOTE_TOKEN", value: v }),
    [onboarding.dispatch],
  );
  const setOnboardingRemoteConnecting = useCallback(
    (v: boolean) => setOnboardingRemoteStatus(v ? "connecting" : "idle"),
    [setOnboardingRemoteStatus],
  );
  const setOnboardingRemoteError = useCallback(
    (v: string | null) => setOnboardingRemoteStatus(v ? "error" : "idle", v),
    [setOnboardingRemoteStatus],
  );
  const setOnboardingRemoteConnected = useCallback(
    (v: boolean) => setOnboardingRemoteStatus(v ? "connected" : "idle"),
    [setOnboardingRemoteStatus],
  );
  const setOnboardingOpenRouterModel = useCallback(
    (v: string) => setOnboardingField("openRouterModel", v),
    [setOnboardingField],
  );
  const setOnboardingPrimaryModel = useCallback(
    (v: string) => setOnboardingField("primaryModel", v),
    [setOnboardingField],
  );
  const setOnboardingTelegramToken = useCallback(
    (v: string) => setConnectorToken("telegramToken", v),
    [setConnectorToken],
  );
  const setOnboardingDiscordToken = useCallback(
    (v: string) => setConnectorToken("discordToken", v),
    [setConnectorToken],
  );
  const setOnboardingWhatsAppSessionPath = useCallback(
    (v: string) => setConnectorToken("whatsAppSessionPath", v),
    [setConnectorToken],
  );
  const setOnboardingTwilioAccountSid = useCallback(
    (v: string) => setConnectorToken("twilioAccountSid", v),
    [setConnectorToken],
  );
  const setOnboardingTwilioAuthToken = useCallback(
    (v: string) => setConnectorToken("twilioAuthToken", v),
    [setConnectorToken],
  );
  const setOnboardingTwilioPhoneNumber = useCallback(
    (v: string) => setConnectorToken("twilioPhoneNumber", v),
    [setConnectorToken],
  );
  const setOnboardingBlooioApiKey = useCallback(
    (v: string) => setConnectorToken("blooioApiKey", v),
    [setConnectorToken],
  );
  const setOnboardingBlooioPhoneNumber = useCallback(
    (v: string) => setConnectorToken("blooioPhoneNumber", v),
    [setConnectorToken],
  );
  const setOnboardingGithubToken = useCallback(
    (v: string) => setConnectorToken("githubToken", v),
    [setConnectorToken],
  );
  const setOnboardingSubscriptionTab = useCallback(
    (v: "token" | "oauth") => setOnboardingField("subscriptionTab", v),
    [setOnboardingField],
  );
  const setOnboardingElizaCloudTab = useCallback(
    (v: "login" | "apikey") => setOnboardingField("elizaCloudTab", v),
    [setOnboardingField],
  );
  const setOnboardingSelectedChains = useCallback(
    (v: Set<string>) => setOnboardingField("selectedChains", v),
    [setOnboardingField],
  );
  const setOnboardingRpcSelections = useCallback(
    (v: Record<string, string>) => setOnboardingField("rpcSelections", v),
    [setOnboardingField],
  );
  const setOnboardingRpcKeys = useCallback(
    (v: Record<string, string>) => setOnboardingField("rpcKeys", v),
    [setOnboardingField],
  );
  const setOnboardingAvatar = useCallback(
    (v: number) => setOnboardingField("avatar", v),
    [setOnboardingField],
  );
  const setOnboardingRestarting = useCallback(
    (v: boolean) => setOnboardingField("restarting", v),
    [setOnboardingField],
  );
  const setPostOnboardingChecklistDismissed = useCallback(
    (v: boolean) =>
      onboarding.dispatch({ type: "SET_POST_CHECKLIST_DISMISSED", value: v }),
    [onboarding.dispatch],
  );
  const setOnboardingDeferredTasks = useCallback(
    (v: string[]) => {
      // Direct set — used only by reset paths
      for (const task of v) addDeferredOnboardingTask(task);
    },
    [addDeferredOnboardingTask],
  );

  // startupStatus is now derived in useLifecycleState

  // --- Command palette / emote picker / MCP / game / dropped files (extracted to useMiscUiState) ---
  const miscUiHook = useMiscUiState();
  const {
    state: {
      commandPaletteOpen,
      commandQuery,
      commandActiveIndex,
      emotePickerOpen,
      mcpConfiguredServers,
      mcpServerStatuses,
      mcpMarketplaceQuery,
      mcpMarketplaceResults,
      mcpMarketplaceLoading,
      mcpAction,
      mcpAddingServer,
      mcpAddingResult,
      mcpEnvInputs,
      mcpHeaderInputs,
      droppedFiles,
      shareIngestNotice,
      activeGameApp,
      activeGameDisplayName,
      activeGameViewerUrl,
      activeGameSandbox,
      activeGamePostMessageAuth,
      activeGamePostMessagePayload,
      gameOverlayEnabled,
    },
    setCommandQuery,
    setCommandActiveIndex,
    setEmotePickerOpen,
    setMcpConfiguredServers,
    setMcpServerStatuses,
    setMcpMarketplaceQuery,
    setMcpMarketplaceResults,
    setMcpMarketplaceLoading,
    setMcpAction,
    setMcpAddingServer,
    setMcpAddingResult,
    setMcpEnvInputs,
    setMcpHeaderInputs,
    setDroppedFiles,
    setShareIngestNotice,
    setActiveGameApp,
    setActiveGameDisplayName,
    setActiveGameViewerUrl,
    setActiveGameSandbox,
    setActiveGamePostMessageAuth,
    setActiveGamePostMessagePayload,
    setGameOverlayEnabled,
    closeCommandPalette,
    openEmotePicker,
    closeEmotePicker,
  } = miscUiHook;

  // chatPendingImages now comes from useChatState

  // --- Admin ---
  const [appsSubTab, setAppsSubTab] = useState<"browse" | "games">("browse");
  const [agentSubTab, setAgentSubTab] = useState<
    "character" | "inventory" | "knowledge"
  >("character");
  const [pluginsSubTab, setPluginsSubTab] = useState<
    "features" | "connectors" | "plugins"
  >("features");
  const [databaseSubTab, setDatabaseSubTab] = useState<
    "tables" | "media" | "vectors"
  >("tables");

  // --- Config ---
  const [configRaw, setConfigRaw] = useState<Record<string, unknown>>({});
  const [configText, setConfigText] = useState("");

  // --- Refs for timers ---
  // actionNoticeTimer, shownOnceNotices, agentStatusRef, lifecycleBusyRef,
  // lifecycleActionRef, setAgentStatusIfChanged are now in useLifecycleState
  // elizaCloudPollInterval, elizaCloudDisconnectInFlightRef,
  // elizaCloudPreferDisconnectedUntilLoginRef, lastElizaCloudPollConnectedRef,
  // elizaCloudLoginPollTimer are now in useCloudState (cloudHook)
  const prevAgentStateRef = useRef<string | null>(null);
  const restartNotificationSignatureRef = useRef<string | null>(null);
  const heartbeatNotificationKeyRef = useRef<string | null>(null);
  const localizedCharacterLanguageRef = useRef<UiLanguage>(uiLanguage);
  // Onboarding refs now come from useOnboardingState
  const onboardingFinishBusyRef = onboardingFinishBusyRefFromHook;
  const onboardingResumeConnectionRef = onboardingResumeConnectionRefFromHook;
  const onboardingCompletionCommittedRef =
    onboardingCompletionCommittedRefFromHook;
  const forceLocalBootstrapRef = forceLocalBootstrapRefFromHook;
  const onboardingFinishSavingRef = onboardingFinishSavingRefFromHook;
  // exportBusyRef and importBusyRef are now managed inside useExportImportState (exportImportHook)
  // walletApiKeySavingRef is now managed inside useWalletState (walletHook)
  // elizaCloudLoginBusyRef, elizaCloudAuthNoticeSentRef, handleCloudLoginRef
  // are now managed inside useCloudState (cloudHook)
  /** Synchronous lock for update channel changes to prevent duplicate submits. */
  const updateChannelSavingRef = useRef(false);

  // --- Confirm Modal ---
  const { modalProps } = useConfirm();
  const { prompt: promptModal, modalProps: promptModalProps } = usePrompt();

  // --- Wallet / Inventory / Registry / Drop / Whitelist (extracted to useWalletState) ---
  // Placed after characterHook (characterDraft) and promptModal — both are required params.
  const walletHook = useWalletState({
    setActionNotice,
    promptModal,
    agentName: agentStatus?.agentName,
    characterName: characterDraft?.name,
  });
  const {
    state: {
      walletAddresses,
      walletConfig,
      walletBalances,
      walletNfts,
      walletLoading,
      walletNftsLoading,
      inventoryView,
      walletExportData,
      walletExportVisible,
      walletApiKeySaving,
      inventorySort,
      inventorySortDirection,
      inventoryChainFilters,
      walletError,
      registryStatus,
      registryLoading,
      registryRegistering,
      registryError,
      dropStatus,
      dropLoading,
      mintInProgress,
      mintResult,
      mintError,
      mintShiny,
      whitelistStatus,
      whitelistLoading,
    },
    setWalletAddresses,
    setInventoryView,
    setInventorySort,
    setInventorySortDirection,
    setInventoryChainFilters,
    setWalletError,
    setRegistryError,
    setMintResult,
    setMintError,
    loadWalletConfig,
    loadBalances,
    loadNfts,
    handleWalletApiKeySave,
    handleExportKeys,
    loadRegistryStatus,
    registerOnChain,
    syncRegistryProfile,
    loadDropStatus,
    mintFromDrop,
    loadWhitelistStatus,
  } = walletHook;

  // setActionNotice is now provided by useLifecycleState

  // ── Cloud state (extracted to useCloudState) ───────────────────────
  // Placed after walletHook so loadWalletConfig is available.
  const cloudHook = useCloudState({ setActionNotice, loadWalletConfig, t });
  const {
    elizaCloudEnabled,
    setElizaCloudEnabled,
    elizaCloudConnected,
    setElizaCloudConnected,
    elizaCloudHasPersistedKey,
    setElizaCloudHasPersistedKey,
    elizaCloudCredits,
    setElizaCloudCredits,
    elizaCloudCreditsLow,
    setElizaCloudCreditsLow,
    elizaCloudCreditsCritical,
    setElizaCloudCreditsCritical,
    elizaCloudAuthRejected,
    setElizaCloudAuthRejected,
    elizaCloudCreditsError,
    setElizaCloudCreditsError,
    elizaCloudTopUpUrl,
    setElizaCloudTopUpUrl,
    elizaCloudUserId,
    setElizaCloudUserId,
    elizaCloudStatusReason,
    setElizaCloudStatusReason,
    cloudDashboardView,
    setCloudDashboardView,
    elizaCloudLoginBusy,
    elizaCloudLoginError,
    setElizaCloudLoginError,
    elizaCloudDisconnecting,
    elizaCloudPollInterval,
    elizaCloudPreferDisconnectedUntilLoginRef,
    elizaCloudLoginPollTimer,
    pollCloudCredits,
    handleCloudLogin,
    handleCloudDisconnect,
    handleCloudLoginRef,
  } = cloudHook;

  // ── Clipboard ──────────────────────────────────────────────────────

  const copyToClipboard = useCallback(async (text: string) => {
    await copyTextToClipboard(text);
  }, []);

  // Language is managed by TranslationProvider (see useTranslation() above)

  useEffect(() => {
    saveUiShellMode(uiShellMode);
  }, [uiShellMode]);

  useEffect(() => {
    saveLastNativeTab(lastNativeTab);
  }, [lastNativeTab]);

  // ── Navigation ─────────────────────────────────────────────────────

  const setTab = useCallback(
    (newTab: Tab) => {
      setTabRaw(newTab);
      if (newTab === "apps") {
        setAppsSubTab(activeGameViewerUrl.trim() ? "games" : "browse");
      }
      const path = pathForTab(newTab);
      try {
        // In packaged desktop builds (file:// URLs), use hash routing to avoid
        // "Not allowed to load local resource: file:///..." errors.
        if (window.location.protocol === "file:") {
          window.location.hash = path;
        } else {
          window.history.pushState(null, "", path);
        }
      } catch (err) {
        console.warn("[milady][nav] failed to update browser location", err);
      }
    },
    [activeGameViewerUrl, setTabRaw],
  );

  const setUiShellMode = useCallback(
    (mode: UiShellMode) => {
      const nextMode = normalizeUiShellMode(mode);
      if (nextMode === "companion") {
        setTab("companion");
        return;
      }
      setTab(lastNativeTab);
    },
    [lastNativeTab, setTab],
  );

  useEffect(() => {
    const shouldRememberTab =
      tab !== "companion" && tab !== "character" && tab !== "character-select";
    if (!shouldRememberTab) {
      return;
    }
    setLastNativeTabState((prev) => (prev === tab ? prev : tab));
  }, [tab]);

  const switchUiShellMode = useCallback(
    (mode: UiShellMode) => {
      const nextMode = normalizeUiShellMode(mode);
      if (nextMode === uiShellMode) {
        return;
      }

      if (nextMode === "native") {
        setTab(lastNativeTab);
        return;
      }

      setTab("companion");
    },
    [lastNativeTab, setTab, uiShellMode],
  );

  const switchShellView = useCallback(
    (view: ShellView) => {
      const nextTab = getTabForShellView(view, lastNativeTab);
      // Gate: prompt for owner name the first time user enters desktop/native view
      if (view === "desktop" && !ownerName && !showOwnerNamePrompt) {
        if (ownerNameHydrated) {
          setShowOwnerNamePrompt(true);
        } else {
          setPendingOwnerNamePrompt(true);
        }
      }
      console.log(
        `[shell] switchShellView: ${view} → tab=${nextTab}, lastNativeTab=${lastNativeTab}`,
      );
      setTab(nextTab);
    },
    [lastNativeTab, ownerName, ownerNameHydrated, showOwnerNamePrompt, setTab],
  );

  const navigationHubRef = useRef(new NavigationEventHub());
  const pendingPostTabCommitRef = useRef<(() => void)[]>([]);
  const prevTabCommittedRef = useRef<Tab | null>(null);
  const prevUiShellCommittedRef = useRef<UiShellMode | null>(null);
  const [_tabCommitFlushNonce, setTabCommitFlushNonce] = useState(0);

  const scheduleAfterTabCommit = useCallback((fn: () => void) => {
    pendingPostTabCommitRef.current.push(fn);
    if (pendingPostTabCommitRef.current.length === 1) {
      queueMicrotask(() => {
        setTabCommitFlushNonce((n) => n + 1);
      });
    }
  }, []);

  const navigation = useMemo(
    () => ({
      subscribeTabCommitted: (
        listener: (detail: TabCommittedDetail) => void,
      ): (() => void) => navigationHubRef.current.subscribe(listener),
      scheduleAfterTabCommit,
    }),
    [scheduleAfterTabCommit],
  );

  useLayoutEffect(() => {
    const tabChanged = prevTabCommittedRef.current !== tab;
    const shellChanged = prevUiShellCommittedRef.current !== uiShellMode;
    const pending = pendingPostTabCommitRef.current;
    pendingPostTabCommitRef.current = [];

    if (tabChanged || shellChanged) {
      const previousTab = prevTabCommittedRef.current;
      prevTabCommittedRef.current = tab;
      prevUiShellCommittedRef.current = uiShellMode;
      navigationHubRef.current.emit({ tab, previousTab, uiShellMode });
    }

    for (const task of pending) {
      try {
        task();
      } catch (err) {
        console.warn(
          "[milady][navigation] scheduleAfterTabCommit task failed",
          err,
        );
      }
    }
  }, [tab, uiShellMode]);

  // loadLogs is now in useLogsState (logsHook)

  // ── Data loading ───────────────────────────────────────────────────

  const applyAutonomyEventMerge = useCallback(
    (incomingEvents: StreamEventEnvelope[], replay = false) => {
      const merged = mergeAutonomyEvents({
        store: autonomousStoreRef.current,
        incomingEvents,
        runHealthByRunId: autonomousRunHealthByRunIdRef.current,
        replay,
      });
      autonomousStoreRef.current = merged.store;
      autonomousEventsRef.current = merged.events;
      autonomousLatestEventIdRef.current = merged.latestEventId;
      autonomousRunHealthByRunIdRef.current = merged.runHealthByRunId;

      setAutonomousEvents(merged.events);
      setAutonomousLatestEventId(merged.latestEventId);
      setAutonomousRunHealthByRunId(merged.runHealthByRunId);

      return merged;
    },
    [
      autonomousEventsRef,
      autonomousLatestEventIdRef,
      autonomousRunHealthByRunIdRef,
      autonomousStoreRef,
      setAutonomousEvents,
      setAutonomousLatestEventId,
      setAutonomousRunHealthByRunId,
    ],
  );

  const fetchAutonomyReplay = useCallback(async () => {
    if (autonomousReplayInFlightRef.current) return;
    autonomousReplayInFlightRef.current = true;
    try {
      const afterEventId = autonomousStoreRef.current.watermark ?? undefined;
      const replay = await client.getAgentEvents({
        afterEventId,
        limit: 300,
      });

      if (replay.events.length > 0) {
        applyAutonomyEventMerge(replay.events);
      }

      const gapReplays = buildAutonomyGapReplayRequests(
        autonomousRunHealthByRunIdRef.current,
        autonomousStoreRef.current,
      ).slice(0, 4);

      for (const request of gapReplays) {
        const gapReplay = await client.getAgentEvents({
          runId: request.runId,
          fromSeq: request.fromSeq,
          limit: 300,
        });
        if (gapReplay.events.length > 0) {
          applyAutonomyEventMerge(gapReplay.events);
        }
      }

      if (hasPendingAutonomyGaps(autonomousRunHealthByRunIdRef.current)) {
        const partial = markPendingAutonomyGapsPartial(
          autonomousRunHealthByRunIdRef.current,
          Date.now(),
        );
        autonomousRunHealthByRunIdRef.current = partial;
        setAutonomousRunHealthByRunId(partial);
      }
    } catch (err) {
      if (hasPendingAutonomyGaps(autonomousRunHealthByRunIdRef.current)) {
        const partial = markPendingAutonomyGapsPartial(
          autonomousRunHealthByRunIdRef.current,
          Date.now(),
        );
        autonomousRunHealthByRunIdRef.current = partial;
        setAutonomousRunHealthByRunId(partial);
      }
      console.warn("[milady] Failed to fetch autonomous event replay", err);
    } finally {
      autonomousReplayInFlightRef.current = false;
    }
  }, [
    applyAutonomyEventMerge,
    autonomousReplayInFlightRef,
    autonomousRunHealthByRunIdRef,
    autonomousStoreRef.current,
    setAutonomousRunHealthByRunId,
  ]);

  const appendAutonomousEvent = useCallback(
    (event: StreamEventEnvelope) => {
      const merged = applyAutonomyEventMerge([event]);
      if (merged.runsWithNewGaps.length > 0) {
        void fetchAutonomyReplay();
      }
    },
    [applyAutonomyEventMerge, fetchAutonomyReplay],
  );

  const loadConversations = useCallback(async (): Promise<
    Conversation[] | null
  > => {
    try {
      const { conversations: c } = await client.listConversations();
      setConversations(c);
      return c;
    } catch {
      return null;
    }
  }, [setConversations]);

  const loadConversationMessages = useCallback(
    async (convId: string): Promise<LoadConversationMessagesResult> => {
      try {
        const { messages } = await client.getConversationMessages(convId);
        const nextMessages = filterRenderableConversationMessages(messages);
        greetingFiredRef.current =
          hasConversationBootstrapMessage(nextMessages);
        conversationMessagesRef.current = nextMessages;
        setConversationMessages(nextMessages);
        return { ok: true };
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 404) {
          const refreshed = await client.listConversations().catch(() => null);
          if (refreshed) {
            setConversations(refreshed.conversations);
            if (activeConversationIdRef.current === convId) {
              const fallbackId = refreshed.conversations[0]?.id ?? null;
              setActiveConversationId(fallbackId);
              activeConversationIdRef.current = fallbackId;
            }
          } else if (activeConversationIdRef.current === convId) {
            setActiveConversationId(null);
            activeConversationIdRef.current = null;
          }
        }
        greetingFiredRef.current = false;
        conversationMessagesRef.current = [];
        setConversationMessages([]);
        return {
          ok: false,
          status,
          message:
            err instanceof Error
              ? err.message
              : "Failed to load conversation messages",
        };
      }
    },
    [
      activeConversationIdRef,
      conversationMessagesRef,
      greetingFiredRef,
      setActiveConversationId,
      setConversationMessages,
      setConversations,
    ],
  );

  // loadWalletConfig, loadBalances, loadNfts are provided by useWalletState (walletHook)

  const getBscTradePreflight = useCallback(
    async (tokenAddress?: string): Promise<BscTradePreflightResponse> =>
      client.getBscTradePreflight(tokenAddress),
    [],
  );

  const getBscTradeQuote = useCallback(
    async (request: BscTradeQuoteRequest): Promise<BscTradeQuoteResponse> =>
      client.getBscTradeQuote(request),
    [],
  );

  const getBscTradeTxStatus = useCallback(
    async (hash: string): Promise<BscTradeTxStatusResponse> =>
      client.getBscTradeTxStatus(hash),
    [],
  );

  const getStewardStatus = useCallback(
    async () => client.getStewardStatus(),
    [],
  );

  const getStewardHistory = useCallback(
    async (opts?: { status?: string; limit?: number; offset?: number }) =>
      client.getStewardHistory(opts),
    [],
  );

  const getStewardPending = useCallback(
    async () => client.getStewardPending(),
    [],
  );

  const approveStewardTx = useCallback(
    async (txId: string) => client.approveStewardTx(txId),
    [],
  );

  const rejectStewardTx = useCallback(
    async (txId: string, reason?: string) =>
      client.rejectStewardTx(txId, reason),
    [],
  );

  const loadWalletTradingProfile = useCallback(
    async (
      window: WalletTradingProfileWindow = "30d",
      source: WalletTradingProfileSourceFilter = "all",
    ): Promise<WalletTradingProfileResponse> =>
      client.getWalletTradingProfile(window, source),
    [],
  );

  const executeBscTrade = useCallback(
    async (request: BscTradeExecuteRequest): Promise<BscTradeExecuteResponse> =>
      client.executeBscTrade(request),
    [],
  );

  const executeBscTransfer = useCallback(
    async (
      request: BscTransferExecuteRequest,
    ): Promise<BscTransferExecuteResponse> =>
      client.executeBscTransfer(request),
    [],
  );

  const loadInventory = useCallback(async () => {
    await loadWalletConfig();
  }, [loadWalletConfig]);

  // loadCharacter is provided by useCharacterState (characterHook)

  // Hydrate ownerName from config on startup
  useEffect(() => {
    let cancelled = false;
    void client
      .getConfig()
      .then((cfg) => {
        if (cancelled) {
          return;
        }

        const name = (cfg as Record<string, unknown>).ui as
          | Record<string, unknown>
          | undefined;
        const persisted = normalizeOwnerName(name?.ownerName as string);
        if (persisted) {
          setOwnerNameState(persisted);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setOwnerNameHydrated(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ownerNameHydrated) {
      return;
    }

    if (ownerName || showOwnerNamePrompt) {
      if (pendingOwnerNamePrompt) {
        setPendingOwnerNamePrompt(false);
      }
      return;
    }

    if (pendingOwnerNamePrompt && uiShellMode === "native") {
      setShowOwnerNamePrompt(true);
      setPendingOwnerNamePrompt(false);
    }
  }, [
    ownerName,
    ownerNameHydrated,
    pendingOwnerNamePrompt,
    showOwnerNamePrompt,
    uiShellMode,
  ]);

  const handleOwnerNameSubmit = useCallback((name: string) => {
    const normalized = normalizeOwnerName(name);
    if (!normalized) {
      return;
    }

    setOwnerNameState(normalized);
    setShowOwnerNamePrompt(false);
    setPendingOwnerNamePrompt(false);
    void client.updateConfig({ ui: { ownerName: normalized } }).catch(() => {});
  }, []);

  useEffect(() => {
    const previousLanguage = localizedCharacterLanguageRef.current;
    localizedCharacterLanguageRef.current = uiLanguage;

    if (previousLanguage === uiLanguage) {
      return;
    }
    if (!onboardingComplete || selectedVrmIndex <= 0) {
      return;
    }

    const preset = resolveStylePresetByAvatarIndex(
      selectedVrmIndex,
      uiLanguage,
    );
    if (!preset) {
      return;
    }

    const resolvedName =
      characterData?.name?.trim() ||
      characterDraft?.name?.trim() ||
      agentStatus?.agentName?.trim() ||
      preset.name;

    void (async () => {
      try {
        await client.updateCharacter(
          buildLocalizedCharacterPayload(preset, resolvedName),
        );
        await loadCharacter();
      } catch (err) {
        console.warn(
          "[milady] Failed to sync localized character preset after language change",
          err,
        );
      }
    })();
  }, [
    agentStatus?.agentName,
    characterData?.name,
    characterDraft?.name,
    loadCharacter,
    onboardingComplete,
    selectedVrmIndex,
    uiLanguage,
  ]);

  const loadWorkbench = useCallback(async () => {
    setWorkbenchLoading(true);
    try {
      const result = await client.getWorkbenchOverview();
      setWorkbench(result);
      setWorkbenchTasksAvailable(result.tasksAvailable ?? false);
      setWorkbenchTriggersAvailable(result.triggersAvailable ?? false);
      setWorkbenchTodosAvailable(result.todosAvailable ?? false);
    } catch {
      setWorkbench(null);
      setWorkbenchTasksAvailable(false);
      setWorkbenchTriggersAvailable(false);
      setWorkbenchTodosAvailable(false);
    } finally {
      setWorkbenchLoading(false);
    }
  }, []);

  const loadUpdateStatus = useCallback(async (force = false) => {
    setUpdateLoading(true);
    try {
      const status = await client.getUpdateStatus(force);
      setUpdateStatus(status);
    } catch {
      /* ignore */
    }
    setUpdateLoading(false);
  }, []);

  const checkExtensionStatus = useCallback(async () => {
    setExtensionChecking(true);
    try {
      const ext = await client.getExtensionStatus();
      setExtensionStatus(ext);
    } catch {
      setExtensionStatus({
        relayReachable: false,
        relayPort: 18792,
        extensionPath: null,
      });
    }
    setExtensionChecking(false);
  }, []);

  // pollCloudCredits is now provided by useCloudState (cloudHook — wired below)

  // ── Lifecycle actions ──────────────────────────────────────────────

  // beginLifecycleAction / finishLifecycleAction are now provided by useLifecycleState

  // ── Chat ───────────────────────────────────────────────────────────

  /** Request an agent greeting for a conversation and add it to messages. */
  const fetchGreeting = useCallback(
    async (convId: string): Promise<boolean> => {
      if (greetingInFlightConversationRef.current === convId) {
        traceMiladyGreeting("fetchGreeting:skip_duplicate_in_flight", {
          convId,
        });
        return false;
      }
      greetingInFlightConversationRef.current = convId;
      setChatAwaitingGreeting(true);
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
        setChatAwaitingGreeting(false);
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

  const waitForOnboardingGreetingBootstrap = useCallback(async () => {
    const deadlineAt = Date.now() + ONBOARDING_GREETING_READY_TIMEOUT_MS;

    while (Date.now() < deadlineAt) {
      try {
        const status = await client.getStatus();
        setAgentStatus(status);
        setConnected(true);

        if (status.pendingRestart) {
          setPendingRestart(true);
          setPendingRestartReasons(status.pendingRestartReasons ?? []);
        }

        if (status.state === "running" || status.state === "error") {
          return;
        }
      } catch {
        setConnected(false);
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, AGENT_STATUS_POLL_INTERVAL_MS);
      });
    }
  }, [
    setAgentStatus,
    setConnected,
    setPendingRestart,
    setPendingRestartReasons,
  ]);

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

  // resetConversationDraftState now comes from useChatState (aliased above)

  const handleStartDraftConversation = useCallback(async () => {
    interruptActiveChatPipeline();
    resetConversationDraftState();
  }, [interruptActiveChatPipeline, resetConversationDraftState]);

  const handleStart = useCallback(async () => {
    if (!beginLifecycleAction("start")) return;
    setActionNotice(
      LIFECYCLE_MESSAGES.start.progress,
      "info",
      300_000,
      false,
      true,
    );
    try {
      const s = await client.startAgent();
      setAgentStatus(s);
      setActionNotice(LIFECYCLE_MESSAGES.start.success, "success", 2400);
    } catch (err) {
      setActionNotice(
        `Failed to ${LIFECYCLE_MESSAGES.start.verb} agent: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
        "error",
        4200,
      );
    } finally {
      finishLifecycleAction();
    }
  }, [
    beginLifecycleAction,
    finishLifecycleAction,
    setActionNotice,
    setAgentStatus,
  ]);

  const handleStop = useCallback(async () => {
    if (!beginLifecycleAction("stop")) return;
    setActionNotice(
      LIFECYCLE_MESSAGES.stop.progress,
      "info",
      120_000,
      false,
      true,
    );
    try {
      const s = await client.stopAgent();
      setAgentStatus(s);
      setActionNotice(LIFECYCLE_MESSAGES.stop.success, "success", 2400);
    } catch (err) {
      setActionNotice(
        `Failed to ${LIFECYCLE_MESSAGES.stop.verb} agent: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
        "error",
        4200,
      );
    } finally {
      finishLifecycleAction();
    }
  }, [
    beginLifecycleAction,
    finishLifecycleAction,
    setActionNotice,
    setAgentStatus,
  ]);

  const handleRestart = useCallback(async () => {
    if (!beginLifecycleAction("restart")) return;
    setActionNotice(
      LIFECYCLE_MESSAGES.restart.progress,
      "info",
      300_000,
      false,
      true,
    );
    try {
      setAgentStatus({
        ...(agentStatus ?? {
          agentName: "Milady",
          model: undefined,
          uptime: undefined,
          startedAt: undefined,
        }),
        state: "restarting",
      });
      // Server restart clears in-memory conversations — reset client state
      setActiveConversationId(null);
      setConversationMessages([]);
      setConversations([]);
      const s = await client.restartAgent();
      setAgentStatus(s);
      const greetConvId = await hydrateInitialConversationState();
      await requestGreetingWhenRunning(greetConvId);
      setPendingRestart(false);
      setPendingRestartReasons([]);
      void loadPlugins();
      setActionNotice(LIFECYCLE_MESSAGES.restart.success, "success", 2400);
    } catch (err) {
      setActionNotice(
        `Failed to ${LIFECYCLE_MESSAGES.restart.verb} agent: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
        "error",
        4200,
      );
      setTimeout(async () => {
        try {
          setAgentStatus(await client.getStatus());
        } catch {
          /* ignore */
        }
      }, 3000);
    } finally {
      finishLifecycleAction();
    }
  }, [
    agentStatus,
    beginLifecycleAction,
    finishLifecycleAction,
    setActionNotice,
    hydrateInitialConversationState,
    loadPlugins,
    requestGreetingWhenRunning, // Server restart clears in-memory conversations — reset client state
    setActiveConversationId,
    setAgentStatus,
    setConversationMessages,
    setConversations,
    setPendingRestart,
    setPendingRestartReasons,
  ]);

  // dismissRestartBanner, showRestartBanner are now provided by useLifecycleState
  // dismissBackendDisconnectedBanner, dismissSystemWarning are now provided by useLifecycleState

  const triggerRestart = useCallback(async () => {
    await handleRestart();
  }, [handleRestart]);

  const retryBackendConnection = useCallback(() => {
    setBackendDisconnectedBannerDismissed(false);
    client.resetConnection();
  }, [setBackendDisconnectedBannerDismissed]);

  const restartBackend = useCallback(async () => {
    const restarted = await invokeDesktopBridgeRequest({
      rpcMethod: "agentRestart",
      ipcChannel: "agent:restart",
    });
    if (restarted === null) {
      await client.restart();
    }
    resetBackendConnection();
  }, [resetBackendConnection]);

  const relaunchDesktop = useCallback(async () => {
    const relaunched = await invokeDesktopBridgeRequest<void>({
      rpcMethod: "desktopRelaunch",
      ipcChannel: "desktop:relaunch",
    });
    if (relaunched === null) {
      await handleRestart();
    }
  }, [handleRestart]);

  const showDesktopNotification = useCallback(
    async (options: {
      title: string;
      body?: string;
      urgency?: "normal" | "critical" | "low";
      silent?: boolean;
    }) => {
      try {
        await invokeDesktopBridgeRequest<{ id: string }>({
          rpcMethod: "desktopShowNotification",
          ipcChannel: "desktop:showNotification",
          params: options,
        });
      } catch {
        /* ignore desktop notification failures */
      }
    },
    [],
  );

  const notifyHeartbeatEvent = useCallback(
    (event: StreamEventEnvelope) => {
      // biome-ignore lint/suspicious/noExplicitAny: heartbeat payloads are loosely typed
      const payload = event.payload as any;
      const status =
        typeof payload.status === "string"
          ? payload.status.trim().toLowerCase()
          : "ok";
      const silent = payload.silent === true;
      const isFailure = status === "error" || status === "failed";
      const isSkipped = status === "skipped";
      if (!isFailure && !isSkipped && silent) {
        return;
      }

      const eventTs =
        typeof payload.ts === "number"
          ? payload.ts
          : typeof event.ts === "number"
            ? event.ts
            : Date.now();
      const target =
        [
          typeof payload.channel === "string" ? payload.channel.trim() : "",
          typeof payload.to === "string" ? payload.to.trim() : "",
        ]
          .filter(Boolean)
          .join(" · ") || "background trigger";
      const notificationKey = `${eventTs}:${status}:${target}`;
      if (heartbeatNotificationKeyRef.current === notificationKey) {
        return;
      }
      heartbeatNotificationKeyRef.current = notificationKey;

      const preview =
        typeof payload.preview === "string" ? payload.preview.trim() : "";
      const reason =
        typeof payload.reason === "string" ? payload.reason.trim() : "";
      const duration =
        typeof payload.durationMs === "number"
          ? `Duration: ${Math.round(payload.durationMs)}ms`
          : "";

      const body = [target, preview, reason !== preview ? reason : "", duration]
        .filter(Boolean)
        .join("\n");

      void showDesktopNotification({
        title: isFailure
          ? "Heartbeat failed"
          : isSkipped
            ? "Heartbeat skipped"
            : "Heartbeat ran",
        body,
        urgency: isFailure ? "critical" : isSkipped ? "normal" : "low",
        silent: false,
      });
    },
    [showDesktopNotification],
  );

  useEffect(() => {
    if (!pendingRestart) {
      restartNotificationSignatureRef.current = null;
      return;
    }

    const signature =
      pendingRestartReasons.length > 0
        ? pendingRestartReasons.join("\n")
        : "restart-required";
    if (restartNotificationSignatureRef.current === signature) {
      return;
    }
    restartNotificationSignatureRef.current = signature;

    const summary =
      pendingRestartReasons.length === 1
        ? pendingRestartReasons[0]
        : pendingRestartReasons.length > 1
          ? `${pendingRestartReasons.length} changes are waiting for restart.`
          : "Restart required to apply changes.";

    void showDesktopNotification({
      title: "Restart required",
      body: `${summary}\nUse Restart Now from the banner or Milady > Restart Agent. Use Milady > Relaunch Milady when the desktop shell itself needs a full relaunch.`,
      urgency: "normal",
      silent: false,
    });
  }, [pendingRestart, pendingRestartReasons, showDesktopNotification]);

  // retryStartup provided by useLifecycleState (dispatches RETRY_STARTUP)

  /**
   * Wipes server-side agent config (`POST /api/agent/reset`) and local UI state.
   *
   * **WHY restart after reset:** the compat route only rewrites `eliza.json` on disk.
   * The embedded desktop child keeps in-memory runtime + PGLite until we stop it,
   * delete `~/.milady/workspace/.eliza/.elizadb`, and spawn a fresh process (RPC
   * `agentRestartClearLocalDb` when `desktopRuntimeMode=local`).
   * With `MILADY_DESKTOP_API_BASE` (external dev API on :31337), embedded restart is a
   * no-op — we must call `restartAndWait()` so the **real** API process reloads.
   * Wallet keys from env are not touched. Local **GGUF** model files
   * (`MODELS_DIR`, typically ~/.eliza/models) are not deleted — only the agent DB dir `.elizadb` is removed when embedded restart runs.
   *
   * **WHY clear `clearPersistedConnectionMode` + `setBaseUrl(null)` / `setToken(null)`**
   * after the API call: the server no longer matches cloud/remote session data; leaving
   * persisted mode or client base pointed at Eliza Cloud made the next screen look
   * “stuck” or skipped onboarding.
   *
   * **WHY Eliza Cloud state cleared:** avoid showing “connected” after config wipe.
   */
  const completeResetLocalStateAfterServerWipe = useCallback(
    async (postResetAgentStatus: AgentStatus | null): Promise<void> => {
      await runCompleteResetLocalStateAfterServerWipe(postResetAgentStatus, {
        setAgentStatus,
        resetClientConnection: () => client.resetConnection(),
        clearPersistedConnectionMode,
        clearPersistedAvatarIndex: clearAvatarIndex,
        setClientBaseUrl: (url) => client.setBaseUrl(url),
        setClientToken: (token) => client.setToken(token),
        clearElizaCloudSessionUi: () => {
          elizaCloudPreferDisconnectedUntilLoginRef.current = false;
          setElizaCloudEnabled(false);
          setElizaCloudConnected(false);
          publishElizaCloudVoiceSnapshot(setElizaCloudHasPersistedKey, {
            apiConnected: false,
            enabled: false,
            hasPersistedApiKey: false,
          });
          setElizaCloudCredits(null);
          setElizaCloudCreditsLow(false);
          setElizaCloudCreditsCritical(false);
          setElizaCloudAuthRejected(false);
          setElizaCloudCreditsError(null);
          setElizaCloudTopUpUrl("/cloud/billing");
          setElizaCloudUserId(null);
          setElizaCloudStatusReason(null);
          setElizaCloudLoginError(null);
        },
        markOnboardingReset: () => {
          onboardingCompletionCommittedRef.current = false;
          setOnboardingUiRevealNonce((n) => n + 1);
          setOnboardingLoading(false);
          setOnboardingComplete(false);
          onboardingResumeConnectionRef.current = null;
          setOnboardingStep("cloud_login");
          setOnboardingMode("basic");
          setOnboardingActiveGuide(null);
          setOnboardingDeferredTasks([]);
          setPostOnboardingChecklistDismissed(false);
          setOnboardingName("Chen");
          setOnboardingStyle("chen");
          setOnboardingRunMode("");
          setOnboardingCloudProvider("");
          setOnboardingProvider("");
          setOnboardingApiKey("");
          setOnboardingVoiceProvider("");
          setOnboardingVoiceApiKey("");
          setOnboardingPrimaryModel("");
          setOnboardingOpenRouterModel("");
          setOnboardingRemoteConnected(false);
          setOnboardingRemoteApiBase("");
          setOnboardingRemoteToken("");
          setOnboardingSmallModel("");
          setOnboardingLargeModel("");
        },
        resetAvatarSelection: () => {
          setSelectedVrmIndex(1);
          setCustomVrmUrl("");
          setCustomBackgroundUrl("");
        },
        clearConversationLists: () => {
          setConversationMessages([]);
          setActiveConversationId(null);
          activeConversationIdRef.current = null;
          setConversations([]);
          setPlugins([]);
          setSkills([]);
          setLogs([]);
        },
        fetchOnboardingOptions: () => client.getOnboardingOptions(),
        setOnboardingOptions,
        logResetDebug,
        logResetWarn,
      });
    },
    [
      setAgentStatus,
      setOnboardingComplete,
      setOnboardingLoading,
      setOnboardingOptions,
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
      setOnboardingPrimaryModel,
      setOnboardingOpenRouterModel,
      setOnboardingRemoteConnected,
      setOnboardingRemoteApiBase,
      setOnboardingRemoteToken,
      setOnboardingSmallModel,
      setOnboardingLargeModel,
      setOnboardingUiRevealNonce,
      setConversationMessages,
      setActiveConversationId,
      setConversations,
      activeConversationIdRef,
      onboardingCompletionCommittedRef,
      onboardingResumeConnectionRef,
      setSelectedVrmIndex,
    ],
  );

  const handleResetAppliedFromMain = useCallback(
    async (payload: unknown) => {
      await handleResetAppliedFromMainCore(payload, {
        performanceNow: () => performance.now(),
        isLifecycleBusy: () => lifecycleBusyRef.current,
        getActiveLifecycleAction: () =>
          lifecycleActionRef.current ?? lifecycleAction ?? "reset",
        beginLifecycleAction,
        finishLifecycleAction,
        setActionNotice,
        parseTrayResetPayload: parseAgentStatusFromMainMenuResetPayload,
        completeResetLocalState: completeResetLocalStateAfterServerWipe,
        alertDesktopMessage,
        logResetInfo,
        logResetWarn,
      });
    },
    [
      lifecycleAction,
      beginLifecycleAction,
      finishLifecycleAction,
      setActionNotice,
      completeResetLocalStateAfterServerWipe,
      lifecycleActionRef.current,
      lifecycleBusyRef.current,
    ],
  );

  const handleReset = useCallback(async () => {
    logResetInfo("handleReset: invoked");
    if (lifecycleBusyRef.current) {
      const activeAction =
        lifecycleActionRef.current ?? lifecycleAction ?? "reset";
      logResetInfo("handleReset: skipped — lifecycle busy", {
        activeAction,
      });
      setActionNotice(
        `Agent action already in progress (${LIFECYCLE_MESSAGES[activeAction].inProgress}). Please wait.`,
        "info",
        2800,
      );
      return;
    }
    logResetInfo("handleReset: showing confirm dialog");
    const confirmed = await confirmDesktopAction({
      title: "Reset Agent",
      message:
        "This will reset the agent: config, cloud keys, and local agent database (conversations / memory).",
      detail:
        "Downloaded GGUF embedding models are kept. You will return to the onboarding wizard.",
      confirmLabel: "Reset",
      cancelLabel: "Cancel",
      type: "warning",
    });
    if (!confirmed) {
      logResetInfo("handleReset: cancelled by user");
      return;
    }
    // Native message boxes (Electrobun/macOS) can return without letting the webview
    // process network/RPC on the same turn — `fetch` and bridge requests then appear
    // to "never run" until something else wakes the loop. Yield once before reset work.
    logResetInfo(
      "handleReset: confirmed — scheduling reset on next event-loop turn (native dialog)",
    );
    await new Promise<void>((resolve) => {
      window.setTimeout(() => resolve(), 0);
    });

    if (!beginLifecycleAction("reset")) {
      logResetInfo(
        "handleReset: aborted — could not begin lifecycle (race with another action)",
      );
      setActionNotice(
        "Another agent operation is still running. Wait for it to finish, then try Reset again.",
        "info",
        4200,
      );
      return;
    }
    setActionNotice(
      LIFECYCLE_MESSAGES.reset.progress,
      "info",
      120_000,
      false,
      true,
    );
    const resetStartedAt = performance.now();
    logResetInfo(
      "handleReset: starting (POST /api/agent/reset + restart path)",
      {
        electrobun: isElectrobunRuntime(),
        apiBase:
          client.getBaseUrl() || "(empty — will resolve after reconnect)",
      },
    );
    logResetInfo(
      "handleReset: tip — reset logs also appear in this window (filter [milady][reset]); API terminal only shows server-side routes",
    );
    try {
      logResetDebug("handleReset: calling client.resetAgent()");
      await client.resetAgent();
      logResetDebug("handleReset: client.resetAgent() completed");

      let postResetAgentStatus: AgentStatus | null = null;
      logResetDebug(
        "handleReset: invoking desktop bridge agentRestartClearLocalDb",
      );
      const BRIDGE_RESTART_MS = 150_000;
      try {
        postResetAgentStatus = await Promise.race([
          invokeDesktopBridgeRequest<AgentStatus>({
            rpcMethod: "agentRestartClearLocalDb",
            ipcChannel: "agent:restartClearLocalDb",
          }),
          new Promise<AgentStatus | null>((_, reject) => {
            window.setTimeout(() => {
              reject(
                Object.assign(
                  new Error(
                    `agentRestartClearLocalDb exceeded ${BRIDGE_RESTART_MS / 1000}s`,
                  ),
                  { name: "ResetBridgeTimeout" },
                ),
              );
            }, BRIDGE_RESTART_MS);
          }),
        ]);
        logResetDebug("handleReset: bridge agentRestartClearLocalDb settled", {
          hasResult: postResetAgentStatus != null,
          state: postResetAgentStatus?.state ?? null,
          port: postResetAgentStatus?.port ?? null,
        });
        if (postResetAgentStatus == null && isElectrobunRuntime()) {
          logResetWarn(
            "handleReset: agentRestartClearLocalDb RPC returned null — bridge request missing; will rely on HTTP restart path",
          );
        }
      } catch (bridgeErr) {
        postResetAgentStatus = null;
        if (
          bridgeErr instanceof Error &&
          bridgeErr.name === "ResetBridgeTimeout"
        ) {
          logResetWarn(
            "handleReset: agentRestartClearLocalDb timed out — falling back to HTTP restart",
            bridgeErr,
          );
        } else {
          logResetWarn(
            "handleReset: bridge agentRestartClearLocalDb threw (will try HTTP restart)",
            bridgeErr,
          );
        }
      }

      const embeddedRestartedOk =
        postResetAgentStatus != null &&
        (postResetAgentStatus.state === "running" ||
          postResetAgentStatus.state === "starting");

      logResetDebug("handleReset: embedded restart decision", {
        embeddedRestartedOk,
        bridgeState: postResetAgentStatus?.state ?? null,
      });

      if (!embeddedRestartedOk) {
        logResetInfo(
          "handleReset: calling client.restartAndWait(120s) — external API or bridge no-op",
        );
        try {
          postResetAgentStatus = await client.restartAndWait(120_000);
          logResetDebug("handleReset: restartAndWait completed", {
            state: postResetAgentStatus.state,
            port: postResetAgentStatus.port,
          });
        } catch (httpErr) {
          postResetAgentStatus = null;
          logResetWarn(
            "handleReset: client.restartAndWait failed — UI may be stale until manual restart",
            httpErr,
          );
        }
      }

      await completeResetLocalStateAfterServerWipe(postResetAgentStatus);
      const elapsedMs = Math.round(performance.now() - resetStartedAt);
      logResetInfo(
        "handleReset: success — local UI reset; see server logs for API",
        {
          elapsedMs,
          finalAgentState: postResetAgentStatus?.state ?? null,
        },
      );
      setActionNotice(LIFECYCLE_MESSAGES.reset.success, "success", 3200);
    } catch (err) {
      logResetWarn("handleReset: failed before local UI could reset", err);
      setActionNotice(
        `Failed to ${LIFECYCLE_MESSAGES.reset.verb} agent: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
        "error",
        4200,
      );
      await alertDesktopMessage({
        title: "Reset Failed",
        message: "Reset failed. Check the console for details.",
        type: "error",
      });
    } finally {
      finishLifecycleAction();
    }
  }, [
    lifecycleAction,
    beginLifecycleAction,
    finishLifecycleAction,
    setActionNotice,
    completeResetLocalStateAfterServerWipe,
    lifecycleActionRef.current,
    lifecycleBusyRef.current,
  ]);

  const handleNewConversation = useCallback(
    async (title?: string) => {
      const previousConversationId = activeConversationIdRef.current;
      const previousMessages = conversationMessagesRef.current;
      const previousCutoffTs = companionMessageCutoffTs;

      interruptActiveChatPipeline();
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
          setChatAwaitingGreeting(false);
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
      interruptActiveChatPipeline,
      setActiveConversationId,
      setCompanionMessageCutoffTs,
      setConversationMessages,
      setConversations,
    ],
  );

  /**
   * After agent is up: load conversations; if the server has none, create a
   * default thread (same as sidebar "new chat") so greeting/bootstrap can run.
   */
  const bootstrapConversationAfterAgentReady = useCallback(
    async (
      context: string,
      options?: {
        forceFreshConversation?: boolean;
        skipAgentRunningWait?: boolean;
      },
    ) => {
      traceMiladyGreeting(`${context}:begin`, {
        forceFreshConversation: options?.forceFreshConversation === true,
        skipAgentRunningWait: options?.skipAgentRunningWait === true,
      });
      if (options?.skipAgentRunningWait !== true) {
        await waitForOnboardingGreetingBootstrap();
      }
      if (options?.forceFreshConversation === true) {
        try {
          const { conversations: existingConversations } =
            await client.listConversations();
          setConversations(existingConversations);
        } catch (err) {
          console.warn(
            "[milady][chat:init] failed to load existing conversations before onboarding handoff",
            err,
          );
          setConversations([]);
        }
        greetingFiredRef.current = false;
        conversationMessagesRef.current = [];
        setConversationMessages([]);
        setActiveConversationId(null);
        activeConversationIdRef.current = null;
        traceMiladyGreeting(`${context}:force_fresh_conversation`);
        await handleNewConversation();
        if (!activeConversationIdRef.current) {
          throw new Error("Failed to create your first conversation.");
        }
        return;
      }
      const greetConvId = await hydrateInitialConversationState();
      traceMiladyGreeting(`${context}:hydrate`, {
        greetConvId,
        activeConversationId: activeConversationIdRef.current,
        messageCount: conversationMessagesRef.current.length,
        greetingFired: greetingFiredRef.current,
      });

      if (!greetConvId && !activeConversationIdRef.current) {
        traceMiladyGreeting(`${context}:create_default_conversation`);
        await handleNewConversation();
        traceMiladyGreeting(`${context}:after_create`, {
          activeConversationId: activeConversationIdRef.current,
          messageCount: conversationMessagesRef.current.length,
          greetingFired: greetingFiredRef.current,
        });
        return;
      }

      if (greetConvId) {
        traceMiladyGreeting(`${context}:request_greeting`, { greetConvId });
        await requestGreetingWhenRunning(greetConvId);
        traceMiladyGreeting(`${context}:after_request_greeting`, {
          messageCount: conversationMessagesRef.current.length,
          greetingFired: greetingFiredRef.current,
        });
      } else {
        traceMiladyGreeting(`${context}:skip_request_greeting`, {
          activeConversationId: activeConversationIdRef.current,
          messageCount: conversationMessagesRef.current.length,
        });
      }
    },
    [
      activeConversationIdRef,
      conversationMessagesRef,
      greetingFiredRef,
      handleNewConversation,
      hydrateInitialConversationState,
      requestGreetingWhenRunning,
      setActiveConversationId,
      setConversationMessages,
      setConversations,
      waitForOnboardingGreetingBootstrap,
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

  const appendLocalCommandTurn = useCallback(
    (userText: string, assistantText: string) => {
      const now = Date.now();
      const nonce = Math.random().toString(36).slice(2, 8);
      setConversationMessages((prev: ConversationMessage[]) => [
        ...prev,
        {
          id: `local-user-${now}-${nonce}`,
          role: "user",
          text: userText,
          timestamp: now,
        },
        {
          id: `local-assistant-${now}-${nonce}`,
          role: "assistant",
          text: assistantText,
          timestamp: now,
          source: "local_command",
        },
      ]);
    },
    [setConversationMessages],
  );

  const tryHandlePrefixedChatCommand = useCallback(
    async (
      rawText: string,
    ): Promise<{ handled: boolean; rewrittenText?: string }> => {
      const slash = parseSlashCommandInput(rawText);
      if (slash) {
        const savedCommand = loadSavedCustomCommands().find(
          (command) => normalizeSlashCommandName(command.name) === slash.name,
        );
        if (savedCommand) {
          const rewrittenText = expandSavedCustomCommand(
            savedCommand.text,
            slash.argsRaw,
          );
          if (!rewrittenText.trim()) {
            appendLocalCommandTurn(
              rawText,
              `Saved command "/${slash.name}" is empty.`,
            );
            return { handled: true };
          }
          return { handled: false, rewrittenText };
        }

        if (slash.name === "commands") {
          const customActions = (await client.listCustomActions()).filter(
            (action) => action.enabled,
          );
          const customCommandNames = customActions
            .map((action) => `/${action.name.toLowerCase()}`)
            .sort();
          const savedCommandNames = loadSavedCustomCommands()
            .map((command) => `/${normalizeSlashCommandName(command.name)}`)
            .sort();
          const lines = [
            formatSearchBullet("Saved / commands", savedCommandNames),
            formatSearchBullet("Custom action / commands", customCommandNames),
            "Use #remember ... to save memory notes. Use #memory or #knowledge to target retrieval.",
            "Use $query for a quick, non-persistent context answer.",
          ];
          appendLocalCommandTurn(rawText, lines.join("\n\n"));
          return { handled: true };
        }

        let customActions: CustomActionDef[] = [];
        try {
          customActions = (await client.listCustomActions()).filter(
            (action) => action.enabled,
          );
        } catch {
          // If custom actions can't be loaded, fall back to normal slash routing.
          return { handled: false };
        }

        const customAction = customActions.find(
          (action) =>
            `/${normalizeCustomActionName(action.name).toLowerCase()}` ===
            slash.name,
        );
        if (customAction) {
          const { params, missingRequired } = parseCustomActionParams(
            customAction,
            slash.argsRaw,
          );
          if (missingRequired.length > 0) {
            appendLocalCommandTurn(
              rawText,
              `Missing required parameter(s): ${missingRequired.join(", ")}`,
            );
            return { handled: true };
          }

          const result = await client.testCustomAction(customAction.id, params);
          if (!result.ok) {
            appendLocalCommandTurn(
              rawText,
              `Custom action "${customAction.name}" failed: ${
                result.error ?? "unknown error"
              }`,
            );
            return { handled: true };
          }

          appendLocalCommandTurn(
            rawText,
            result.output?.trim() || `(no output from ${customAction.name})`,
          );
          return { handled: true };
        }
      }

      if (rawText.startsWith("#")) {
        const commandBody = rawText.slice(1).trim();
        if (!commandBody) {
          appendLocalCommandTurn(
            rawText,
            "Usage: #remember <text>, #memory <query>, #knowledge <query>, or #<query>.",
          );
          return { handled: true };
        }

        const lower = commandBody.toLowerCase();
        if (
          lower.startsWith("remember ") ||
          lower.startsWith("remmeber ") ||
          lower.startsWith("save ")
        ) {
          const memoryText = commandBody
            .replace(/^(remember|remmeber|save)\s+/i, "")
            .trim();
          if (!memoryText) {
            appendLocalCommandTurn(rawText, "Nothing to remember.");
            return { handled: true };
          }
          await client.rememberMemory(memoryText);
          appendLocalCommandTurn(rawText, `Saved memory note: "${memoryText}"`);
          return { handled: true };
        }

        let scope: "memory" | "knowledge" | "all" = "all";
        let query = commandBody;
        if (lower.startsWith("memory ")) {
          scope = "memory";
          query = commandBody.slice("memory ".length).trim();
        } else if (lower.startsWith("knowledge ")) {
          scope = "knowledge";
          query = commandBody.slice("knowledge ".length).trim();
        } else if (lower.startsWith("all ")) {
          scope = "all";
          query = commandBody.slice("all ".length).trim();
        }

        if (!query) {
          appendLocalCommandTurn(rawText, "Search query cannot be empty.");
          return { handled: true };
        }

        const [memoryResult, knowledgeResult] = await Promise.all([
          scope === "knowledge"
            ? Promise.resolve(null)
            : client.searchMemory(query, { limit: 6 }),
          scope === "memory"
            ? Promise.resolve(null)
            : client.searchKnowledge(query, { threshold: 0.2, limit: 6 }),
        ]);

        const memoryLines =
          memoryResult?.results.map(
            (item, index) =>
              `${index + 1}. ${item.text.replace(/\s+/g, " ").trim()}`,
          ) ?? [];
        const knowledgeLines =
          knowledgeResult?.results.map(
            (item, index) =>
              `${index + 1}. ${item.text.replace(/\s+/g, " ").trim()} (sim ${item.similarity.toFixed(2)})`,
          ) ?? [];

        appendLocalCommandTurn(
          rawText,
          [
            scope === "memory"
              ? "Memory search"
              : scope === "knowledge"
                ? "Knowledge search"
                : "Memory + knowledge search",
            "",
            scope === "knowledge"
              ? ""
              : formatSearchBullet("Memories", memoryLines),
            scope === "memory"
              ? ""
              : formatSearchBullet("Knowledge", knowledgeLines),
          ]
            .filter(Boolean)
            .join("\n\n"),
        );
        return { handled: true };
      }

      if (rawText.startsWith("$")) {
        const queryRaw = rawText.slice(1).trim();
        if (queryRaw) {
          appendLocalCommandTurn(
            rawText,
            "Use bare `$` only. `$ <text>` is not supported.",
          );
          return { handled: true };
        }
        const query =
          "What is most relevant from memory and knowledge right now?";

        const quick = await client.quickContext(query, { limit: 6 });
        const memoryLines = quick.memories.map(
          (item, index) =>
            `${index + 1}. ${item.text.replace(/\s+/g, " ").trim()}`,
        );
        const knowledgeLines = quick.knowledge.map(
          (item, index) =>
            `${index + 1}. ${item.text.replace(/\s+/g, " ").trim()} (sim ${item.similarity.toFixed(2)})`,
        );
        appendLocalCommandTurn(
          rawText,
          [
            quick.answer,
            "",
            formatSearchBullet("Memories used", memoryLines),
            formatSearchBullet("Knowledge used", knowledgeLines),
          ].join("\n"),
        );
        return { handled: true };
      }

      return { handled: false };
    },
    [appendLocalCommandTurn],
  );

  const runQueuedChatSend = useCallback(
    async (turn: Omit<QueuedChatSend, "resolve" | "reject">) => {
      const hasAttachedImages = Boolean(turn.images?.length);
      const rawText = turn.rawInput.trim();
      if (!rawText && !hasAttachedImages) return;

      const channelType = turn.channelType;
      const conversationMode: ConversationMode =
        channelType === "VOICE_DM" || channelType === "VOICE_GROUP"
          ? "simple"
          : chatMode;
      const imagesToSend = turn.images;
      let controller: AbortController | null = null;

      let text = hasAttachedImages
        ? rawText || "Please review the attached image."
        : rawText;
      if (rawText) {
        let commandResult: { handled: boolean; rewrittenText?: string };
        try {
          commandResult = await tryHandlePrefixedChatCommand(rawText);
        } catch (err) {
          appendLocalCommandTurn(
            rawText,
            `Command failed: ${err instanceof Error ? err.message : "unknown error"}`,
          );
          return;
        }
        if (commandResult.handled) {
          return;
        }
        if (
          typeof commandResult.rewrittenText === "string" &&
          commandResult.rewrittenText.trim()
        ) {
          text = commandResult.rewrittenText.trim();
        }
      }

      let convId: string =
        turn.conversationId ?? activeConversationIdRef.current ?? "";
      if (!convId) {
        try {
          const { conversation } = await client.createConversation(undefined, {
            lang: uiLanguage,
          });
          const nextCutoffTs = Date.now();
          setConversations((prev) => [conversation, ...prev]);
          setActiveConversationId(conversation.id);
          activeConversationIdRef.current = conversation.id;
          setCompanionMessageCutoffTs(nextCutoffTs);
          convId = conversation.id;
        } catch {
          return;
        }
      }

      client.sendWsMessage({
        type: "active-conversation",
        conversationId: convId,
      });

      const activeConv = conversations.find((c) => c.id === convId);
      if (
        activeConv &&
        (!activeConv.title ||
          activeConv.title === "New Chat" ||
          activeConv.title === "companion.newChat" ||
          activeConv.title === "conversations.newChatTitle")
      ) {
        const fallbackTitle =
          text.length > 15 ? `${text.slice(0, 15)}...` : text;
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId ? { ...c, title: fallbackTitle } : c,
          ),
        );
      }

      const now = Date.now();
      const userMsgId = `temp-${now}`;
      const assistantMsgId = `temp-resp-${now}`;

      setCompanionMessageCutoffTs(now);
      setConversationMessages((prev: ConversationMessage[]) => [
        ...prev,
        { id: userMsgId, role: "user", text, timestamp: now },
        { id: assistantMsgId, role: "assistant", text: "", timestamp: now },
      ]);
      setChatFirstTokenReceived(false);

      controller = new AbortController();
      chatAbortRef.current = controller;
      let streamedAssistantText = "";

      try {
        const data = await client.sendConversationMessageStream(
          convId,
          text,
          (token, accumulatedText) => {
            const nextText =
              typeof accumulatedText === "string"
                ? accumulatedText
                : mergeStreamingText(streamedAssistantText, token);
            if (nextText === streamedAssistantText) return;
            streamedAssistantText = nextText;
            setChatFirstTokenReceived(true);
            setConversationMessages((prev) =>
              prev.map((message) =>
                message.id !== assistantMsgId
                  ? message
                  : message.text === nextText
                    ? message
                    : { ...message, text: nextText },
              ),
            );
          },
          channelType,
          controller.signal,
          imagesToSend,
          conversationMode,
        );

        if (!data.text.trim()) {
          setConversationMessages((prev) =>
            prev.filter((message) => message.id !== assistantMsgId),
          );
        } else if (
          shouldApplyFinalStreamText(streamedAssistantText, data.text)
        ) {
          setConversationMessages((prev) => {
            let changed = false;
            const next = prev.map((message) => {
              if (message.id !== assistantMsgId) return message;
              if (message.text === data.text) return message;
              changed = true;
              return { ...message, text: data.text };
            });
            return changed ? next : prev;
          });
        }
        if (data.usage) {
          setChatLastUsage({
            promptTokens: data.usage.promptTokens,
            completionTokens: data.usage.completionTokens,
            totalTokens: data.usage.totalTokens,
            model: data.usage.model,
            updatedAt: Date.now(),
          });
        }

        if (!data.completed && streamedAssistantText.trim()) {
          setConversationMessages((prev) =>
            prev.map((message) =>
              message.id === assistantMsgId
                ? { ...message, interrupted: true }
                : message,
            ),
          );
        }

        // Action callbacks can persist additional assistant turns that are not
        // mirrored by the optimistic streaming placeholder in local state.
        if (activeConversationIdRef.current === convId) {
          await loadConversationMessages(convId);
        }

        const userMessageCount = conversationMessagesRef.current.filter(
          (message) =>
            message.role === "user" && !message.id.startsWith("temp-"),
        ).length;

        if (userMessageCount === 1) {
          void client
            .renameConversation(convId, "", { generate: true })
            .then(() => {
              void loadConversations();
            });
        } else {
          void loadConversations();
        }

        if (elizaCloudEnabled || elizaCloudConnected) {
          void pollCloudCredits();
        }
      } catch (err) {
        const abortError = err as Error;
        if (abortError.name === "AbortError") {
          setConversationMessages((prev) =>
            prev.filter(
              (message) =>
                !(message.id === assistantMsgId && !message.text.trim()),
            ),
          );
          return;
        }

        const status = (err as { status?: number }).status;
        if (status === 404) {
          try {
            const { conversation } = await client.createConversation();
            const nextCutoffTs = Date.now();
            setConversations((prev) => [conversation, ...prev]);
            setActiveConversationId(conversation.id);
            activeConversationIdRef.current = conversation.id;
            setCompanionMessageCutoffTs(nextCutoffTs);
            client.sendWsMessage({
              type: "active-conversation",
              conversationId: conversation.id,
            });

            const retryData = await client.sendConversationMessage(
              conversation.id,
              text,
              channelType,
              imagesToSend,
              conversationMode,
            );
            setConversationMessages(
              filterRenderableConversationMessages([
                {
                  id: `temp-${Date.now()}`,
                  role: "user",
                  text,
                  timestamp: Date.now(),
                },
                {
                  id: `temp-resp-${Date.now()}`,
                  role: "assistant",
                  text: retryData.text,
                  timestamp: Date.now(),
                },
              ]),
            );
          } catch {
            setConversationMessages((prev) =>
              prev.filter(
                (message) =>
                  !(message.id === assistantMsgId && !message.text.trim()),
              ),
            );
          }
        } else {
          await loadConversationMessages(convId);
        }
      } finally {
        if (chatAbortRef.current === controller) {
          chatAbortRef.current = null;
        }
      }
    },
    [
      appendLocalCommandTurn,
      chatMode,
      loadConversationMessages,
      loadConversations,
      tryHandlePrefixedChatCommand,
      activeConversationIdRef,
      chatAbortRef,
      conversationMessagesRef.current.filter,
      conversations.find,
      setActiveConversationId,
      setChatFirstTokenReceived,
      setChatLastUsage,
      setCompanionMessageCutoffTs,
      setConversationMessages,
      setConversations,
      uiLanguage,
      elizaCloudEnabled,
      elizaCloudConnected,
      pollCloudCredits,
    ],
  );

  const flushQueuedChatSends = useCallback(async () => {
    if (chatSendBusyRef.current) return;
    chatSendBusyRef.current = true;
    setChatSending(true);

    try {
      while (chatSendQueueRef.current.length > 0) {
        const nextTurn = chatSendQueueRef.current.shift();
        if (!nextTurn) break;
        try {
          await runQueuedChatSend(nextTurn);
          nextTurn.resolve();
        } catch (err) {
          nextTurn.reject(err);
        }
      }
    } finally {
      chatSendBusyRef.current = false;
      setChatSending(false);
      setChatFirstTokenReceived(false);
    }
  }, [
    chatSendBusyRef,
    runQueuedChatSend,
    setChatFirstTokenReceived,
    setChatSending,
  ]);

  const sendChatText = useCallback(
    async (
      rawInput: string,
      options?: {
        channelType?: ConversationChannelType;
        conversationId?: string | null;
        images?: ImageAttachment[];
      },
    ) => {
      const hasAttachedImages = Boolean(options?.images?.length);
      if (!rawInput.trim() && !hasAttachedImages) {
        return;
      }

      await new Promise<void>((resolve, reject) => {
        chatSendQueueRef.current.push({
          rawInput,
          channelType: options?.channelType ?? "DM",
          conversationId: options?.conversationId,
          images: options?.images,
          resolve,
          reject,
        });
        setChatSending(true);
        void flushQueuedChatSends();
      });
    },
    [flushQueuedChatSends, setChatSending],
  );

  const handleChatSend = useCallback(
    async (channelType: ConversationChannelType = "DM") => {
      const claimedInput = chatInputRef.current;
      const imagesToSend = chatPendingImagesRef.current.length
        ? [...chatPendingImagesRef.current]
        : undefined;

      if (!claimedInput.trim() && !imagesToSend?.length) {
        return;
      }

      chatInputRef.current = "";
      chatPendingImagesRef.current = [];
      setChatInput("");
      setChatPendingImages([]);

      await sendChatText(claimedInput, {
        channelType,
        conversationId: activeConversationIdRef.current,
        images: imagesToSend,
      });
    },
    [
      activeConversationIdRef,
      chatInputRef,
      chatPendingImagesRef,
      sendChatText,
      setChatInput,
      setChatPendingImages,
    ],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: conversations omitted to limit rerenders
  const sendActionMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (chatSendBusyRef.current) return;
      chatSendBusyRef.current = true;
      const sendNonce = ++chatSendNonceRef.current;
      const conversationMode: ConversationMode = chatMode;
      let controller: AbortController | null = null;

      try {
        let convId: string = activeConversationId ?? "";
        if (!convId) {
          try {
            const actionTitle =
              trimmed.length > 50 ? `${trimmed.slice(0, 47)}...` : trimmed;
            const { conversation } = await client.createConversation(
              actionTitle || t("companion.newChat"),
            );
            const nextCutoffTs = Date.now();
            setConversations((prev) => [conversation, ...prev]);
            setActiveConversationId(conversation.id);
            activeConversationIdRef.current = conversation.id;
            setCompanionMessageCutoffTs(nextCutoffTs);
            convId = conversation.id;
          } catch {
            return;
          }
        }

        client.sendWsMessage({
          type: "active-conversation",
          conversationId: convId,
        });

        // Eagerly rename "New Chat" using a snippet of the first message
        const activeConv = conversations.find((c) => c.id === convId);
        if (
          activeConv &&
          (!activeConv.title ||
            activeConv.title === "New Chat" ||
            activeConv.title === "companion.newChat" ||
            activeConv.title === "conversations.newChatTitle")
        ) {
          const fallbackTitle =
            trimmed.length > 15 ? `${trimmed.slice(0, 15)}...` : trimmed;
          setConversations((prev) =>
            prev.map((c) =>
              c.id === convId ? { ...c, title: fallbackTitle } : c,
            ),
          );
        }

        const now = Date.now();
        const userMsgId = `temp-action-${now}`;
        const assistantMsgId = `temp-action-resp-${now}`;

        setCompanionMessageCutoffTs(now);
        setConversationMessages((prev: ConversationMessage[]) => [
          ...prev,
          { id: userMsgId, role: "user", text: trimmed, timestamp: now },
          { id: assistantMsgId, role: "assistant", text: "", timestamp: now },
        ]);
        setChatSending(true);
        setChatFirstTokenReceived(false);

        controller = new AbortController();
        chatAbortRef.current = controller;
        let streamedAssistantText = "";

        try {
          const data = await client.sendConversationMessageStream(
            convId,
            trimmed,
            (token, accumulatedText) => {
              const nextText =
                typeof accumulatedText === "string"
                  ? accumulatedText
                  : mergeStreamingText(streamedAssistantText, token);
              if (nextText === streamedAssistantText) return;
              streamedAssistantText = nextText;
              setChatFirstTokenReceived(true);
              setConversationMessages((prev) =>
                prev.map((message) =>
                  message.id !== assistantMsgId
                    ? message
                    : message.text === nextText
                      ? message
                      : { ...message, text: nextText },
                ),
              );
            },
            "DM",
            controller.signal,
            undefined,
            conversationMode,
          );

          if (!data.text.trim()) {
            setConversationMessages((prev) =>
              prev.filter((message) => message.id !== assistantMsgId),
            );
          } else if (
            shouldApplyFinalStreamText(streamedAssistantText, data.text)
          ) {
            setConversationMessages((prev) => {
              let changed = false;
              const next = prev.map((message) => {
                if (message.id !== assistantMsgId) return message;
                if (message.text === data.text) return message;
                changed = true;
                return { ...message, text: data.text };
              });
              return changed ? next : prev;
            });
          }

          if (!data.completed && streamedAssistantText.trim()) {
            setConversationMessages((prev) =>
              prev.map((message) =>
                message.id === assistantMsgId
                  ? { ...message, interrupted: true }
                  : message,
              ),
            );
          }

          // Keep the visible thread authoritative when the server stores
          // additional action-generated messages during a successful send.
          if (activeConversationIdRef.current === convId) {
            await loadConversationMessages(convId);
          }

          void loadConversations();
          if (elizaCloudEnabled || elizaCloudConnected) {
            void pollCloudCredits();
          }
        } catch (err) {
          const abortError = err as Error;
          if (abortError.name === "AbortError") {
            setConversationMessages((prev) =>
              prev.filter(
                (message) =>
                  !(message.id === assistantMsgId && !message.text.trim()),
              ),
            );
            return;
          }
          await loadConversationMessages(convId);
        } finally {
          if (chatAbortRef.current === controller) {
            chatAbortRef.current = null;
          }
          if (chatSendNonceRef.current === sendNonce) {
            chatSendBusyRef.current = false;
            setChatSending(false);
            setChatFirstTokenReceived(false);
            if (chatSendQueueRef.current.length > 0) {
              void flushQueuedChatSends();
            }
          }
        }
      } finally {
        if (controller == null && chatSendNonceRef.current === sendNonce) {
          chatSendBusyRef.current = false;
          if (chatSendQueueRef.current.length > 0) {
            void flushQueuedChatSends();
          }
        }
      }
    },
    [
      chatMode,
      activeConversationId,
      chatSendQueueRef,
      elizaCloudEnabled,
      elizaCloudConnected,
      flushQueuedChatSends,
      loadConversationMessages,
      loadConversations,
      pollCloudCredits,
      uiLanguage,
    ],
  );

  const handleChatStop = useCallback(() => {
    interruptActiveChatPipeline();

    // Also stop any active PTY sessions — the user wants everything to halt
    for (const session of ptySessions) {
      client.stopCodingAgent(session.sessionId).catch(() => {});
    }
  }, [interruptActiveChatPipeline, ptySessions]);

  const handleChatRetry = useCallback(
    (assistantMsgId: string) => {
      let retryText: string | null = null;
      setConversationMessages((prev) => {
        // Find the interrupted assistant message
        const assistantIdx = prev.findIndex(
          (m) => m.id === assistantMsgId && m.role === "assistant",
        );
        if (assistantIdx < 0) return prev;

        // Find the preceding user message
        let userMsg: ConversationMessage | null = null;
        for (let i = assistantIdx - 1; i >= 0; i--) {
          if (prev[i].role === "user") {
            userMsg = prev[i];
            break;
          }
        }
        if (!userMsg) return prev;

        // Remove the interrupted assistant message
        const next = prev.filter((m) => m.id !== assistantMsgId);

        retryText = userMsg.text;

        return next;
      });
      if (retryText) {
        void sendChatText(retryText);
      }
    },
    [sendChatText, setConversationMessages],
  );

  const handleChatEdit = useCallback(
    async (messageId: string, text: string): Promise<boolean> => {
      const convId = activeConversationIdRef.current;
      const nextText = text.trim();
      if (!convId || !nextText) {
        return false;
      }

      let currentMessages = conversationMessagesRef.current;
      let messageIndex = currentMessages.findIndex(
        (message) => message.id === messageId && message.role === "user",
      );
      if (messageIndex < 0) {
        const loaded = await loadConversationMessages(convId);
        if (!loaded.ok) {
          return false;
        }
        currentMessages = conversationMessagesRef.current;
        messageIndex = currentMessages.findIndex(
          (message) => message.id === messageId && message.role === "user",
        );
      }
      if (messageIndex < 0) {
        return false;
      }

      const targetMessage = currentMessages[messageIndex];
      if (
        targetMessage.source === "local_command" ||
        targetMessage.id.startsWith("temp-")
      ) {
        return false;
      }

      interruptActiveChatPipeline();
      setChatInput("");

      const preservedMessages = currentMessages.slice(0, messageIndex);
      conversationMessagesRef.current = preservedMessages;
      setConversationMessages(preservedMessages);

      try {
        await client.truncateConversationMessages(convId, messageId, {
          inclusive: true,
        });
        await sendChatText(nextText, { conversationId: convId });
        return true;
      } catch (err) {
        await loadConversationMessages(convId);
        setActionNotice(
          `Failed to edit message: ${err instanceof Error ? err.message : "network error"}`,
          "error",
          4200,
        );
        return false;
      }
    },
    [
      loadConversationMessages,
      sendChatText,
      setActionNotice,
      activeConversationIdRef.current,
      conversationMessagesRef,
      interruptActiveChatPipeline,
      setChatInput,
      setConversationMessages,
    ],
  );

  const handleChatClear = useCallback(async () => {
    const convId = activeConversationId;
    if (!convId) {
      setActionNotice("No active conversation to clear.", "info", 2200);
      return;
    }
    interruptActiveChatPipeline();
    try {
      await client.deleteConversation(convId);
      setActiveConversationId(null);
      activeConversationIdRef.current = null;
      setConversationMessages([]);
      setUnreadConversations((prev) => {
        const next = new Set(prev);
        next.delete(convId);
        return next;
      });
      await loadConversations();
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 404) {
        setActiveConversationId(null);
        activeConversationIdRef.current = null;
        setConversationMessages([]);
        setUnreadConversations((prev) => {
          const next = new Set(prev);
          next.delete(convId);
          return next;
        });
        await loadConversations();
        setActionNotice("Conversation was already cleared.", "info", 2600);
        return;
      }
      setActionNotice(
        `Failed to clear conversation: ${err instanceof Error ? err.message : "network error"}`,
        "error",
        4200,
      );
    }
  }, [
    activeConversationId,
    interruptActiveChatPipeline,
    loadConversations,
    setActionNotice,
    activeConversationIdRef,
    setActiveConversationId,
    setConversationMessages,
    setUnreadConversations,
  ]);

  const handleSelectConversation = useCallback(
    async (id: string) => {
      conversationHydrationEpochRef.current += 1;
      if (
        id === activeConversationId &&
        conversationMessagesRef.current.length > 0
      )
        return;

      interruptActiveChatPipeline();

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
      interruptActiveChatPipeline,
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
        interruptActiveChatPipeline();
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
      interruptActiveChatPipeline,
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

  // ── Pairing ────────────────────────────────────────────────────────

  // ── Plugin / Skill / Store / Catalog actions are provided by usePluginsSkillsState (pluginsSkillsHook) ──
  // ── Inventory / Registry / Drop / Whitelist actions are provided by useWalletState (walletHook) ──
  // ── Character actions are provided by useCharacterState (characterHook) ──

  // ── Onboarding ─────────────────────────────────────────────────────

  const completeOnboardingChatHandoff = useCallback(() => {
    clearPersistedOnboardingStep();
    onboardingResumeConnectionRef.current = null;
    onboardingCompletionCommittedRef.current = true;
    setOnboardingMode("basic");
    setOnboardingActiveGuide(null);
    setPostOnboardingChecklistDismissed(false);
    setOnboardingDetectedProviders(
      onboardingDetectedProviders.map((provider) => {
        const { apiKey: _, ...rest } = provider;
        return rest;
      }) as AppState["onboardingDetectedProviders"],
    );
    setOnboardingComplete(true);
    initialTabSetRef.current = true;
    setTab(DEFAULT_LANDING_TAB);
    setOnboardingHandoffPhase("idle");
    setOnboardingHandoffError(null);
    onboardingHandoffRetryStateRef.current = null;
    void loadCharacter();
  }, [
    onboardingCompletionCommittedRef,
    onboardingDetectedProviders,
    onboardingResumeConnectionRef,
    setOnboardingActiveGuide,
    setOnboardingComplete,
    setOnboardingDetectedProviders,
    setOnboardingMode,
    setPostOnboardingChecklistDismissed,
    setTab,
    loadCharacter,
  ]);

  const prepareOnboardingChatHandoffAttempt = useCallback(
    (attempt: OnboardingHandoffRetryState) => {
      onboardingHandoffRetryStateRef.current = attempt;
      setOnboardingHandoffError(null);
      setOnboardingHandoffPhase("fading");
      setTab(DEFAULT_LANDING_TAB);
      interruptActiveChatPipeline();
      resetConversationDraftState();
      setActiveConversationId(null);
      setConversations([]);
      setChatAwaitingGreeting(true);
      setAgentStatus({
        ...(agentStatus ?? {
          agentName: onboardingName || "Milady",
          model: undefined,
          startedAt: undefined,
          uptime: undefined,
        }),
        state: "starting",
      });
    },
    [
      agentStatus,
      onboardingName,
      interruptActiveChatPipeline,
      resetConversationDraftState,
      setActiveConversationId,
      setAgentStatus,
      setConversations,
      setTab,
    ],
  );

  const failOnboardingChatHandoff = useCallback((err: unknown) => {
    console.error("[onboarding] Failed to hand off into chat", err);
    setChatAwaitingGreeting(false);
    setOnboardingHandoffError(
      err instanceof Error ? err.message : "network error",
    );
    setOnboardingHandoffPhase("error");
  }, []);

  const runOnboardingChatHandoff = useCallback(
    async (
      mode: OnboardingHandoffMode,
      retryState?: OnboardingHandoffRetryState | null,
    ) => {
      if (onboardingFinishBusyRef.current || onboardingRestarting) return;
      if (!onboardingOptions) return;
      if (onboardingFinishSavingRef.current || onboardingRestarting) return;

      const attempt: OnboardingHandoffRetryState = retryState
        ? { ...retryState }
        : {
            mode,
            onboardingSubmitted: false,
            skipCloudProvisioning: false,
          };

      prepareOnboardingChatHandoffAttempt(attempt);
      onboardingFinishBusyRef.current = true;
      setOnboardingRestarting(true);
      onboardingFinishSavingRef.current = true;

      try {
        if (mode === "cloud_fast_track") {
          const style = resolveSelectedOnboardingStyle({
            styles: onboardingOptions.styles,
            onboardingStyle,
            selectedVrmIndex,
            uiLanguage,
          });
          const defaultName =
            style.name ?? getDefaultStylePreset(uiLanguage).name;

          if (!attempt.onboardingSubmitted) {
            setOnboardingHandoffPhase("saving");
            await client.submitOnboarding({
              name: onboardingName || defaultName,
              bio: style?.bio ?? ["An autonomous AI agent."],
              systemPrompt:
                style?.system?.replace(
                  /\{\{name\}\}/g,
                  onboardingName || defaultName,
                ) ??
                `You are ${onboardingName || defaultName}, an autonomous AI agent powered by elizaOS.`,
              style: style?.style,
              adjectives: style?.adjectives,
              postExamples: style?.postExamples,
              messageExamples: style?.messageExamples,
              topics: style?.topics,
              avatarIndex: style?.avatarIndex ?? 1,
              language: uiLanguage,
              presetId: style?.id ?? "chen",
              runMode: "cloud",
              cloudProvider: "elizacloud",
              smallModel: "moonshotai/kimi-k2-turbo",
              largeModel: "moonshotai/kimi-k2-0905",
            } as unknown as Parameters<typeof client.submitOnboarding>[0]);
            attempt.onboardingSubmitted = true;
            onboardingHandoffRetryStateRef.current = attempt;
            try {
              await persistOnboardingStyleVoice(style);
            } catch (err) {
              console.warn(
                "[onboarding] Failed to persist cloud voice preset",
                err,
              );
            }
          }

          setOnboardingHandoffPhase("restarting");
          setAgentStatus(await client.restartAgent());
          setOnboardingHandoffPhase("bootstrapping");
          await bootstrapConversationAfterAgentReady(
            "onboarding:cloud_fast_track",
            { forceFreshConversation: true },
          );
          completeOnboardingChatHandoff();
          return;
        }

        const style = resolveSelectedOnboardingStyle({
          styles: onboardingOptions.styles,
          onboardingStyle,
          selectedVrmIndex,
          uiLanguage,
        });
        const systemPrompt = style?.system
          ? style.system.replace(/\{\{name\}\}/g, onboardingName)
          : `You are ${onboardingName}, an autonomous AI agent powered by elizaOS. ${onboardingOptions.sharedStyleRules}`;

        let connection =
          buildOnboardingConnectionConfig({
            onboardingRunMode,
            onboardingCloudProvider,
            onboardingProvider,
            onboardingApiKey,
            onboardingVoiceProvider,
            onboardingVoiceApiKey,
            onboardingPrimaryModel,
            onboardingOpenRouterModel,
            onboardingRemoteConnected,
            onboardingRemoteApiBase,
            onboardingRemoteToken,
            onboardingSmallModel,
            onboardingLargeModel,
          }) ?? onboardingResumeConnectionRef.current;

        if (!connection) {
          try {
            const freshConfig = await client.getConfig();
            connection = deriveOnboardingResumeConnection(freshConfig);
            if (connection) {
              onboardingResumeConnectionRef.current = connection;
            }
          } catch {
            /* config fetch failed — fall through to the error below */
          }
        }

        if (!connection) {
          throw new Error(
            "Your connection settings could not be restored after restart.",
          );
        }

        const rpcSel = onboardingRpcSelections as Record<string, string>;
        const rpcK = onboardingRpcKeys as Record<string, string>;
        const nextWalletConfig = buildWalletRpcUpdateRequest({
          walletConfig,
          rpcFieldValues: rpcK,
          selectedProviders: {
            evm: rpcSel.evm,
            bsc: rpcSel.bsc,
            solana: rpcSel.solana,
          },
        });

        const isSandboxMode =
          onboardingRunMode === "cloud" &&
          onboardingCloudProvider === "elizacloud";
        const isLocalMode = onboardingRunMode === "local" || !onboardingRunMode;

        if (isSandboxMode) {
          if (!attempt.skipCloudProvisioning) {
            setOnboardingHandoffPhase("provisioning");
            const cloudApiBase =
              getBootConfig().cloudApiBase ?? "https://www.elizacloud.ai";
            const authToken = ((window as unknown as Record<string, unknown>)
              .__ELIZA_CLOUD_AUTH_TOKEN__ ?? "") as string;

            if (!authToken) {
              throw new Error(
                "Eliza Cloud authentication required. Please log in first.",
              );
            }

            await client.provisionCloudSandbox({
              cloudApiBase,
              authToken,
              name: onboardingName,
              bio: style?.bio ?? ["An autonomous AI agent."],
              onProgress: (status, detail) => {
                console.log(`[Sandbox] ${status}: ${detail ?? ""}`);
              },
            });

            client.setBaseUrl(cloudApiBase);
            client.setToken(authToken);
            savePersistedConnectionMode({
              runMode: "cloud",
              cloudApiBase,
              cloudAuthToken: authToken,
            });
            attempt.skipCloudProvisioning = true;
            attempt.cloudApiBase = cloudApiBase;
            attempt.authToken = authToken;
            onboardingHandoffRetryStateRef.current = attempt;
          } else {
            if (attempt.cloudApiBase) {
              client.setBaseUrl(attempt.cloudApiBase);
            }
            if (attempt.authToken) {
              client.setToken(attempt.authToken);
            }
            savePersistedConnectionMode({
              runMode: "cloud",
              cloudApiBase: attempt.cloudApiBase,
              cloudAuthToken: attempt.authToken,
            });
          }
        } else if (isLocalMode) {
          setOnboardingHandoffPhase("starting-backend");
          try {
            await invokeDesktopBridgeRequest({
              rpcMethod: "agentStart",
              ipcChannel: "agent:start",
            });
          } catch {
            try {
              const agentPluginId = "@miladyai/capacitor-agent";
              const { Agent } = await import(/* @vite-ignore */ agentPluginId);
              await Agent.start();
            } catch {
              /* dev mode where agent is already running */
            }
          }

          const localDeadline = Date.now() + 120_000;
          let pollMs = 1000;
          while (Date.now() < localDeadline) {
            try {
              await client.getAuthStatus();
              break;
            } catch {
              await new Promise((r) => setTimeout(r, pollMs));
              pollMs = Math.min(pollMs * 1.5, 5000);
            }
          }

          savePersistedConnectionMode({ runMode: "local" });
        } else if (
          onboardingRunMode === "cloud" &&
          onboardingCloudProvider === "remote"
        ) {
          savePersistedConnectionMode({
            runMode: "remote",
            remoteApiBase: onboardingRemoteApiBase,
            remoteAccessToken: onboardingRemoteToken || undefined,
          });
        }

        if (!attempt.onboardingSubmitted) {
          const sandboxMode = isSandboxMode ? "standard" : "off";
          setOnboardingHandoffPhase("saving");
          await client.submitOnboarding({
            name: onboardingName,
            sandboxMode: sandboxMode as "off",
            bio: style?.bio ?? ["An autonomous AI agent."],
            systemPrompt,
            style: style?.style,
            adjectives: style?.adjectives,
            topics: style?.topics,
            postExamples: style?.postExamples,
            messageExamples: style?.messageExamples,
            avatarIndex: style?.avatarIndex ?? selectedVrmIndex,
            language: uiLanguage,
            presetId: (style?.id ?? onboardingStyle) || "chen",
            connection,
            walletConfig: nextWalletConfig,
          } as Parameters<typeof client.submitOnboarding>[0]);
          attempt.onboardingSubmitted = true;
          onboardingHandoffRetryStateRef.current = attempt;
          try {
            await persistOnboardingStyleVoice(style);
          } catch (err) {
            console.warn(
              "[onboarding] Failed to persist selected voice preset",
              err,
            );
          }

          await new Promise((r) => setTimeout(r, 1000));
        }

        setOnboardingHandoffPhase("restarting");
        setAgentStatus(await client.restartAgent());
        setOnboardingHandoffPhase("bootstrapping");
        await bootstrapConversationAfterAgentReady("onboarding:full_finish", {
          forceFreshConversation: true,
        });
        completeOnboardingChatHandoff();
      } catch (err) {
        failOnboardingChatHandoff(err);
      } finally {
        onboardingFinishSavingRef.current = false;
        onboardingFinishBusyRef.current = false;
        setOnboardingRestarting(false);
      }
    },
    [
      agentStatus,
      onboardingRestarting,
      onboardingOptions,
      onboardingStyle,
      onboardingName,
      onboardingRunMode,
      onboardingCloudProvider,
      onboardingSmallModel,
      onboardingLargeModel,
      onboardingProvider,
      onboardingApiKey,
      onboardingRemoteApiBase,
      onboardingRemoteConnected,
      onboardingRemoteToken,
      onboardingOpenRouterModel,
      onboardingPrimaryModel,
      onboardingVoiceProvider,
      onboardingVoiceApiKey,
      selectedVrmIndex,
      uiLanguage,
      onboardingRpcSelections,
      onboardingRpcKeys,
      walletConfig,
      onboardingResumeConnectionRef,
      onboardingFinishBusyRef,
      onboardingFinishSavingRef,
      setOnboardingRestarting,
      prepareOnboardingChatHandoffAttempt,
      bootstrapConversationAfterAgentReady,
      completeOnboardingChatHandoff,
      failOnboardingChatHandoff,
    ],
  );

  const retryOnboardingHandoff = useCallback(async () => {
    const retryState = onboardingHandoffRetryStateRef.current;
    if (!retryState || onboardingRestarting) {
      return;
    }
    await runOnboardingChatHandoff(retryState.mode, retryState);
  }, [onboardingRestarting, runOnboardingChatHandoff]);

  const cancelOnboardingHandoff = useCallback(() => {
    onboardingHandoffRetryStateRef.current = null;
    setChatAwaitingGreeting(false);
    setOnboardingHandoffError(null);
    setOnboardingHandoffPhase("idle");
    if (
      agentStatus?.state === "starting" ||
      agentStatus?.state === "restarting"
    ) {
      void client
        .getStatus()
        .then((status) => setAgentStatus(status))
        .catch(() => {
          /* ignore */
        });
    }
  }, [agentStatus, setAgentStatus]);

  const handleOnboardingFinish = useCallback(async () => {
    await runOnboardingChatHandoff(
      elizaCloudConnected ? "cloud_fast_track" : "full",
    );
  }, [elizaCloudConnected, runOnboardingChatHandoff]);

  // ── Onboarding motion (flow graph: packages/app-core/src/onboarding/flow.ts) ──
  // WHY split from flow.ts: advance/revert need handleCloudLoginRef, finish,
  // provider auto-fill, and dozens of state fields—keeping them here avoids a
  // giant deps struct and stale-closure traps. WHY goToOnboardingStep: Welcome
  // "Get Started" must not use raw setState(onboardingStep) alone or advanced
  // mode's Flamina guide desyncs from the visible step.

  const goToOnboardingStep = useCallback(
    (step: OnboardingStep) => {
      setOnboardingStep(step);
      setOnboardingActiveGuide(
        onboardingMode === "advanced"
          ? getFlaminaTopicForOnboardingStep(step)
          : null,
      );
    },
    [onboardingMode, setOnboardingStep, setOnboardingActiveGuide],
  );

  const applyResetConnectionWizardToHostingStep = useCallback(() => {
    const patch = getResetConnectionWizardToHostingStepPatch();
    if (patch.onboardingRunMode !== undefined) {
      setOnboardingRunMode(patch.onboardingRunMode);
    }
    if (patch.onboardingCloudProvider !== undefined) {
      setOnboardingCloudProvider(patch.onboardingCloudProvider);
    }
    if (patch.onboardingProvider !== undefined) {
      setOnboardingProvider(patch.onboardingProvider);
    }
    if (patch.onboardingApiKey !== undefined) {
      setOnboardingApiKey(patch.onboardingApiKey);
    }
    if (patch.onboardingPrimaryModel !== undefined) {
      setOnboardingPrimaryModel(patch.onboardingPrimaryModel);
    }
    if (patch.onboardingRemoteError !== undefined) {
      setOnboardingRemoteError(patch.onboardingRemoteError);
    }
    if (patch.onboardingRemoteConnecting !== undefined) {
      setOnboardingRemoteConnecting(patch.onboardingRemoteConnecting);
    }
  }, [
    setOnboardingApiKey,
    setOnboardingCloudProvider,
    setOnboardingPrimaryModel,
    setOnboardingProvider,
    setOnboardingRemoteConnecting,
    setOnboardingRemoteError,
    setOnboardingRunMode,
  ]);

  const advanceOnboarding = useCallback(
    async (options?: OnboardingNextOptions) => {
      if (
        onboardingStep === "providers" &&
        onboardingRunMode === "local" &&
        !onboardingProvider
      ) {
        const detectedProvider = onboardingDetectedProviders[0];
        const fallbackProvider =
          detectedProvider?.id ??
          onboardingOptions?.providers?.find(
            (provider) => provider.id !== "elizacloud",
          )?.id ??
          "";
        if (fallbackProvider) {
          setOnboardingProvider(fallbackProvider);
          if (
            detectedProvider?.id === fallbackProvider &&
            detectedProvider.apiKey
          ) {
            setOnboardingApiKey(detectedProvider.apiKey);
          }
        }
      }

      if (onboardingStep === "launch") {
        await handleOnboardingFinish();
        return;
      }

      if (onboardingStep === "permissions") {
        if (options?.allowPermissionBypass) {
          if (options.skipTask) addDeferredOnboardingTask(options.skipTask);
          // Don't finish yet — advance to the next step
        }
      }

      let nextStep = resolveOnboardingNextStep(onboardingStep);

      // Skip voice provider selection if they set up Eliza Cloud
      if (
        nextStep === "voice" &&
        onboardingRunMode === "cloud" &&
        onboardingCloudProvider === "elizacloud"
      ) {
        nextStep = resolveOnboardingNextStep(nextStep);
      }

      if (nextStep) {
        if (nextStep === "hosting") {
          applyResetConnectionWizardToHostingStep();
        }
        setOnboardingStep(nextStep);
        setOnboardingActiveGuide(
          onboardingMode === "advanced"
            ? getFlaminaTopicForOnboardingStep(nextStep)
            : null,
        );
      }
    },
    [
      addDeferredOnboardingTask,
      applyResetConnectionWizardToHostingStep,
      handleOnboardingFinish,
      onboardingDetectedProviders,
      onboardingMode,
      onboardingOptions?.providers,
      onboardingProvider,
      onboardingRunMode,
      onboardingStep,
      setOnboardingStep,
      setOnboardingActiveGuide,
      setOnboardingApiKey,
      setOnboardingProvider,
      onboardingCloudProvider,
    ],
  );

  const handleOnboardingNext = useCallback(
    async (options?: OnboardingNextOptions) => advanceOnboarding(options),
    [advanceOnboarding],
  );

  const revertOnboarding = useCallback(() => {
    let previousStep = resolveOnboardingPreviousStep(onboardingStep);

    // Skip voice provider selection if they set up Eliza Cloud
    if (
      previousStep === "voice" &&
      onboardingRunMode === "cloud" &&
      onboardingCloudProvider === "elizacloud"
    ) {
      previousStep = resolveOnboardingPreviousStep(previousStep);
    }

    if (!previousStep) return;
    if (previousStep === "hosting") {
      applyResetConnectionWizardToHostingStep();
    }
    setOnboardingStep(previousStep);
    setOnboardingActiveGuide(
      onboardingMode === "advanced"
        ? getFlaminaTopicForOnboardingStep(previousStep)
        : null,
    );
  }, [
    applyResetConnectionWizardToHostingStep,
    onboardingMode,
    onboardingStep,
    setOnboardingActiveGuide,
    onboardingRunMode,
    onboardingCloudProvider,
  ]);

  const handleOnboardingBack = revertOnboarding;

  const handleOnboardingJumpToStep = useCallback(
    (target: OnboardingStep) => {
      if (!canRevertOnboardingTo({ current: onboardingStep, target })) return;
      if (target === "hosting") {
        applyResetConnectionWizardToHostingStep();
      }
      setOnboardingStep(target);
      setOnboardingActiveGuide(
        onboardingMode === "advanced"
          ? getFlaminaTopicForOnboardingStep(target)
          : null,
      );
    },
    [
      applyResetConnectionWizardToHostingStep,
      onboardingMode,
      onboardingStep,
      setOnboardingStep,
      setOnboardingActiveGuide,
    ],
  );

  const handleOnboardingUseLocalBackend = useCallback(() => {
    forceLocalBootstrapRef.current = true;
    client.setBaseUrl(null);
    client.setToken(null);
    setOnboardingRemoteConnecting(false);
    setOnboardingRemoteError(null);
    setOnboardingRemoteConnected(false);
    setOnboardingRemoteApiBase("");
    setOnboardingRemoteToken("");
    setOnboardingCloudProvider("");
    setOnboardingRunMode("");
    setActionNotice(
      "Checking this device for an existing Eliza setup...",
      "info",
      3200,
    );
    retryStartup();
  }, [
    retryStartup,
    setActionNotice,
    forceLocalBootstrapRef,
    setOnboardingCloudProvider,
    setOnboardingRemoteApiBase,
    setOnboardingRemoteConnected,
    setOnboardingRemoteConnecting,
    setOnboardingRemoteError,
    setOnboardingRemoteToken,
    setOnboardingRunMode,
  ]);

  const handleOnboardingRemoteConnect = useCallback(async () => {
    if (onboardingRemoteConnecting) return;
    let normalizedBase = "";
    try {
      normalizedBase = normalizeRemoteApiBaseInput(onboardingRemoteApiBase);
    } catch (err) {
      setOnboardingRemoteError(
        err instanceof Error ? err.message : "Enter a valid backend address.",
      );
      return;
    }

    const accessKey = onboardingRemoteToken.trim();
    const probe = new MiladyClient(normalizedBase, accessKey || undefined);
    setOnboardingRemoteConnecting(true);
    setOnboardingRemoteError(null);
    try {
      const auth = await probe.getAuthStatus();
      if (auth.required && !accessKey) {
        throw new Error("This backend requires an access key.");
      }
      await probe.getOnboardingStatus();
      client.setBaseUrl(normalizedBase);
      client.setToken(accessKey || null);
      setOnboardingRunMode("cloud");
      setOnboardingCloudProvider("remote");
      setOnboardingRemoteApiBase(normalizedBase);
      setOnboardingRemoteToken(accessKey);
      setOnboardingRemoteConnected(true);
      setActionNotice("Connected to remote Milady backend.", "success", 4200);
      retryStartup();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to reach remote backend.";
      const normalizedMessage =
        /401|unauthorized|forbidden/i.test(message) && accessKey
          ? "Access key rejected. Check the address and try again."
          : message;
      setOnboardingRemoteError(normalizedMessage);
    } finally {
      setOnboardingRemoteConnecting(false);
    }
  }, [
    onboardingRemoteApiBase,
    onboardingRemoteConnecting,
    onboardingRemoteToken,
    retryStartup,
    setActionNotice,
    setOnboardingCloudProvider,
    setOnboardingRemoteApiBase,
    setOnboardingRemoteConnected,
    setOnboardingRemoteConnecting,
    setOnboardingRemoteError,
    setOnboardingRemoteToken,
    setOnboardingRunMode,
  ]);

  // handleCloudOnboardingFinish — one-liner kept here because runOnboardingChatHandoff
  // is defined above (line ~4546) and cloud hook is instantiated earlier.
  const handleCloudOnboardingFinish = useCallback(async () => {
    await runOnboardingChatHandoff("cloud_fast_track");
  }, [runOnboardingChatHandoff]);

  // ── Updates ────────────────────────────────────────────────────────

  const handleChannelChange = useCallback(
    async (channel: ReleaseChannel) => {
      if (updateChannelSavingRef.current || updateChannelSaving) return;
      if (updateStatus?.channel === channel) return;
      updateChannelSavingRef.current = true;
      setUpdateChannelSaving(true);
      try {
        await client.setUpdateChannel(channel);
        await loadUpdateStatus(true);
      } catch {
        /* ignore */
      } finally {
        updateChannelSavingRef.current = false;
        setUpdateChannelSaving(false);
      }
    },
    [updateChannelSaving, updateStatus, loadUpdateStatus],
  );

  // handleAgentExport and handleAgentImport are now in useExportImportState (exportImportHook)

  // closeCommandPalette, openEmotePicker, closeEmotePicker are now in useMiscUiState (miscUiHook)

  const applyDetectedProviders = useCallback(
    (detected: Awaited<ReturnType<typeof scanProviderCredentials>>) => {
      setOnboardingDetectedProviders(detected);

      const prefill = deriveDetectedProviderPrefill(detected);
      if (!prefill) {
        return;
      }

      // Keep users on provider choice first: detection should inform and
      // annotate options, not auto-route into a specific provider detail view.
      // We only nudge run mode so the provider grid is available.
      setOnboardingRunMode(prefill.runMode);
    },
    [setOnboardingDetectedProviders, setOnboardingRunMode],
  );

  // ── Generic state setter ───────────────────────────────────────────

  const setState = useCallback(
    <K extends keyof AppState>(key: K, value: AppState[K]) => {
      const setterMap: Partial<{
        [S in keyof AppState]: (v: AppState[S]) => void;
      }> = {
        tab: setTabRaw,
        onboardingStep: setOnboardingStep,
        chatInput: setChatInput,
        chatAvatarVisible: setChatAvatarVisible,
        chatAgentVoiceMuted: setChatAgentVoiceMuted,
        chatLastUsage: setChatLastUsage,
        chatMode: setChatMode,
        chatAvatarSpeaking: setChatAvatarSpeaking,
        companionMessageCutoffTs: setCompanionMessageCutoffTs,
        uiShellMode: setUiShellMode,
        uiLanguage: setUiLanguage as (v: AppState["uiLanguage"]) => void,
        autonomousRunHealthByRunId: setAutonomousRunHealthByRunId,
        startupError: setStartupError,
        pairingCodeInput: setPairingCodeInput,
        pluginFilter: setPluginFilter,
        pluginStatusFilter: setPluginStatusFilter,
        pluginSearch: setPluginSearch,
        pluginSettingsOpen: setPluginSettingsOpen,
        pluginAdvancedOpen: setPluginAdvancedOpen,
        skillsSubTab: setSkillsSubTab,
        skillCreateFormOpen: setSkillCreateFormOpen,
        skillCreateName: setSkillCreateName,
        skillCreateDescription: setSkillCreateDescription,
        skillsMarketplaceQuery: setSkillsMarketplaceQuery,
        skillsMarketplaceManualGithubUrl: setSkillsMarketplaceManualGithubUrl,
        logTagFilter: setLogTagFilter,
        logLevelFilter: setLogLevelFilter,
        logSourceFilter: setLogSourceFilter,
        inventoryView: setInventoryView,
        inventorySort: setInventorySort,
        inventorySortDirection: setInventorySortDirection,
        inventoryChainFilters: setInventoryChainFilters,
        exportPassword: setExportPassword,
        exportIncludeLogs: setExportIncludeLogs,
        exportError: setExportError,
        exportSuccess: setExportSuccess,
        importPassword: setImportPassword,
        importFile: setImportFile,
        importError: setImportError,
        importSuccess: setImportSuccess,
        onboardingName: setOnboardingName,
        onboardingOwnerName: setOnboardingOwnerName,
        onboardingStyle: setOnboardingStyle,
        onboardingRunMode: setOnboardingRunMode,
        onboardingCloudProvider: setOnboardingCloudProvider,
        onboardingSmallModel: setOnboardingSmallModel,
        onboardingLargeModel: setOnboardingLargeModel,
        onboardingProvider: setOnboardingProvider,
        onboardingApiKey: setOnboardingApiKey,
        onboardingVoiceProvider: setOnboardingVoiceProvider,
        onboardingVoiceApiKey: setOnboardingVoiceApiKey,
        onboardingExistingInstallDetected: setOnboardingExistingInstallDetected,
        onboardingDetectedProviders: setOnboardingDetectedProviders,
        onboardingRemoteApiBase: setOnboardingRemoteApiBase,
        onboardingRemoteToken: setOnboardingRemoteToken,
        onboardingRemoteConnecting: setOnboardingRemoteConnecting,
        onboardingRemoteError: setOnboardingRemoteError,
        onboardingRemoteConnected: setOnboardingRemoteConnected,
        onboardingSelectedChains: setOnboardingSelectedChains,
        onboardingRpcSelections: setOnboardingRpcSelections,
        onboardingOpenRouterModel: setOnboardingOpenRouterModel,
        onboardingPrimaryModel: setOnboardingPrimaryModel,
        onboardingTelegramToken: setOnboardingTelegramToken,
        onboardingDiscordToken: setOnboardingDiscordToken,
        onboardingWhatsAppSessionPath: setOnboardingWhatsAppSessionPath,
        onboardingTwilioAccountSid: setOnboardingTwilioAccountSid,
        onboardingTwilioAuthToken: setOnboardingTwilioAuthToken,
        onboardingTwilioPhoneNumber: setOnboardingTwilioPhoneNumber,
        onboardingBlooioApiKey: setOnboardingBlooioApiKey,
        onboardingBlooioPhoneNumber: setOnboardingBlooioPhoneNumber,
        onboardingGithubToken: setOnboardingGithubToken,
        onboardingSubscriptionTab: setOnboardingSubscriptionTab,
        onboardingElizaCloudTab: setOnboardingElizaCloudTab,
        onboardingRpcKeys: setOnboardingRpcKeys,
        onboardingAvatar: setOnboardingAvatar,
        onboardingRestarting: setOnboardingRestarting,
        elizaCloudEnabled: setElizaCloudEnabled,
        cloudDashboardView: setCloudDashboardView,
        selectedVrmIndex: setSelectedVrmIndex,
        customVrmUrl: setCustomVrmUrl,
        customBackgroundUrl: setCustomBackgroundUrl,
        commandQuery: setCommandQuery,
        commandActiveIndex: setCommandActiveIndex,
        emotePickerOpen: setEmotePickerOpen,
        storeSearch: setStoreSearch,
        storeFilter: setStoreFilter,
        storeSubTab: setStoreSubTab,
        catalogSearch: setCatalogSearch,
        catalogSort: setCatalogSort,
        catalogPage: setCatalogPage,
        skillReviewId: setSkillReviewId,
        skillReviewReport: setSkillReviewReport,
        activeGameApp: setActiveGameApp,
        activeGameDisplayName: setActiveGameDisplayName,
        activeGameViewerUrl: setActiveGameViewerUrl,
        activeGameSandbox: setActiveGameSandbox,
        activeGamePostMessageAuth: setActiveGamePostMessageAuth,
        activeGamePostMessagePayload: setActiveGamePostMessagePayload,
        gameOverlayEnabled: setGameOverlayEnabled,
        storePlugins: setStorePlugins,
        storeLoading: setStoreLoading,
        storeInstalling: setStoreInstalling,
        storeUninstalling: setStoreUninstalling,
        storeError: setStoreError,
        storeDetailPlugin: setStoreDetailPlugin,
        catalogSkills: setCatalogSkills,
        catalogTotal: setCatalogTotal,
        catalogTotalPages: setCatalogTotalPages,
        catalogLoading: setCatalogLoading,
        catalogError: setCatalogError,
        catalogDetailSkill: setCatalogDetailSkill,
        catalogInstalling: setCatalogInstalling,
        catalogUninstalling: setCatalogUninstalling,
        mcpConfiguredServers: setMcpConfiguredServers,
        mcpServerStatuses: setMcpServerStatuses,
        mcpMarketplaceQuery: setMcpMarketplaceQuery,
        mcpMarketplaceResults: setMcpMarketplaceResults,
        mcpMarketplaceLoading: setMcpMarketplaceLoading,
        mcpAction: setMcpAction,
        mcpAddingServer: setMcpAddingServer,
        mcpAddingResult: setMcpAddingResult,
        mcpEnvInputs: setMcpEnvInputs,
        mcpHeaderInputs: setMcpHeaderInputs,
        droppedFiles: setDroppedFiles,
        shareIngestNotice: setShareIngestNotice,
        appsSubTab: setAppsSubTab,
        agentSubTab: setAgentSubTab,
        pluginsSubTab: setPluginsSubTab,
        databaseSubTab: setDatabaseSubTab,
        configRaw: setConfigRaw,
        configText: setConfigText,
      };
      const setter = setterMap[key];
      if (setter) setter(value);
    },
    [
      setOnboardingStep,
      setSelectedVrmIndex,
      setUiLanguage,
      setUiShellMode,
      setAutonomousRunHealthByRunId,
      setChatAgentVoiceMuted,
      setChatAvatarSpeaking,
      setChatAvatarVisible,
      setChatInput,
      setChatLastUsage,
      setChatMode,
      setCompanionMessageCutoffTs,
      setOnboardingApiKey,
      setOnboardingAvatar,
      setOnboardingBlooioApiKey,
      setOnboardingBlooioPhoneNumber,
      setOnboardingCloudProvider,
      setOnboardingDetectedProviders,
      setOnboardingDiscordToken,
      setOnboardingElizaCloudTab,
      setOnboardingExistingInstallDetected,
      setOnboardingGithubToken,
      setOnboardingLargeModel,
      setOnboardingName,
      setOnboardingOpenRouterModel,
      setOnboardingOwnerName,
      setOnboardingPrimaryModel,
      setOnboardingProvider,
      setOnboardingRemoteApiBase,
      setOnboardingRemoteConnected,
      setOnboardingRemoteConnecting,
      setOnboardingRemoteError,
      setOnboardingRemoteToken,
      setOnboardingRestarting,
      setOnboardingRpcKeys,
      setOnboardingRpcSelections,
      setOnboardingRunMode,
      setOnboardingSelectedChains,
      setOnboardingSmallModel,
      setOnboardingStyle,
      setOnboardingSubscriptionTab,
      setOnboardingTelegramToken,
      setOnboardingTwilioAccountSid,
      setOnboardingTwilioAuthToken,
      setOnboardingTwilioPhoneNumber,
      setOnboardingWhatsAppSessionPath,
      setStartupError,
      setTabRaw,
    ],
  );

  const requestGreetingWhenRunningRef = useRef(requestGreetingWhenRunning);
  useEffect(() => {
    requestGreetingWhenRunningRef.current = requestGreetingWhenRunning;
  }, [requestGreetingWhenRunning]);

  useEffect(() => {
    const publishConnectionState = (state: {
      state: "connected" | "disconnected" | "reconnecting" | "failed";
      reconnectAttempt: number;
      maxReconnectAttempts: number;
    }) => {
      setBackendConnection({
        state: state.state,
        reconnectAttempt: state.reconnectAttempt,
        maxReconnectAttempts: state.maxReconnectAttempts,
        showDisconnectedUI: state.state === "failed",
      });
    };

    if (typeof client.getConnectionState === "function") {
      publishConnectionState(client.getConnectionState());
    }

    if (typeof client.onConnectionStateChange !== "function") {
      return;
    }

    return client.onConnectionStateChange((state) => {
      publishConnectionState(state);
    });
  }, [setBackendConnection]);

  // ── Initialization ─────────────────────────────────────────────────

  // biome-ignore lint/correctness/useExhaustiveDependencies: t is stable but defined later
  useEffect(() => {
    const startupRunId = startupRetryNonce;
    let unbindStatus: (() => void) | null = null;
    let unbindAgentEvents: (() => void) | null = null;
    let unbindHeartbeatEvents: (() => void) | null = null;
    let unbindEmotes: (() => void) | null = null;
    let unbindProactiveMessages: (() => void) | null = null;
    let handleVisibilityRef: (() => void) | null = null;
    let unbindWsReconnect: (() => void) | null = null;
    let unbindSystemWarnings: (() => void) | null = null;
    let unbindRestartRequired: (() => void) | null = null;
    let unbindConversationUpdated: (() => void) | null = null;
    let unbindPtySessionEvent: (() => void) | null = null;
    let ptyPollInterval: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    const describeBackendFailure = (
      err: unknown,
      timedOut: boolean,
    ): StartupErrorState => {
      const apiErr = asApiLikeError(err);
      if (apiErr?.kind === "http" && apiErr.status === 404) {
        return {
          reason: "backend-unreachable",
          phase: "starting-backend",
          message:
            "Backend API routes are unavailable on this origin (received 404).",
          detail: formatStartupErrorDetail(err),
          status: apiErr.status,
          path: apiErr.path,
        };
      }
      if (timedOut || apiErr?.kind === "timeout") {
        return {
          reason: "backend-timeout",
          phase: "starting-backend",
          message: `Backend did not become reachable within ${Math.round(
            getBackendStartupTimeoutMs() / 1000,
          )}s.`,
          detail: formatStartupErrorDetail(err),
          status: apiErr?.status,
          path: apiErr?.path,
        };
      }
      return {
        reason: "backend-unreachable",
        phase: "starting-backend",
        message: "Failed to reach backend during startup.",
        detail: formatStartupErrorDetail(err),
        status: apiErr?.status,
        path: apiErr?.path,
      };
    };
    const describeAgentFailure = (
      err: unknown,
      timedOut: boolean,
      diagnostics?: AgentStartupDiagnostics,
    ): StartupErrorState => {
      const detail =
        diagnostics?.lastError ||
        formatStartupErrorDetail(err) ||
        "Agent runtime did not report a reason.";
      const isAssetMissing =
        /required companion assets could not be loaded|bundled avatar .* could not be loaded/i.test(
          detail,
        );
      if (!timedOut && isAssetMissing) {
        return {
          reason: "asset-missing",
          phase: "initializing-agent",
          message: "Required companion assets could not be loaded.",
          detail,
        };
      }
      if (timedOut) {
        const hint =
          "First-time startup often downloads a local embedding model (GGUF, hundreds of MB). That can take many minutes on a slow network.\n\n" +
          'If logs still show a download in progress, wait for it to finish, then tap Retry. On desktop, the app keeps extending the wait while the agent stays in "starting" (up to 15 minutes total).';
        const emb =
          diagnostics?.embeddingDetail ??
          (diagnostics?.embeddingPhase === "downloading"
            ? "Embedding model download in progress."
            : undefined);
        const detailBlocks = [detail, emb, hint].filter(
          (b): b is string => typeof b === "string" && b.trim().length > 0,
        );
        return {
          reason: "agent-timeout",
          phase: "initializing-agent",
          message:
            "The agent did not become ready in time. This is common while a large embedding model (GGUF) is still downloading on first run.",
          detail: detailBlocks.join("\n\n"),
        };
      }
      return {
        reason: "agent-error",
        phase: "initializing-agent",
        message: "Agent runtime reported a startup error.",
        detail,
      };
    };
    const STARTUP_WARN_PREFIX = "[milady][startup:init]";
    const logStartupWarning = (scope: string, err: unknown) => {
      console.warn(`${STARTUP_WARN_PREFIX} ${scope}`, err);
    };

    const initApp = async () => {
      if (process.env.NODE_ENV !== "production" && startupRunId > 0) {
        console.debug(`[milady] Retrying startup run #${startupRunId}`);
      }
      const BASE_DELAY_MS = 250;
      const MAX_DELAY_MS = 1000;
      const sleep = (ms: number) =>
        new Promise<void>((resolve) => setTimeout(resolve, ms));
      let onboardingNeedsOptions = false;
      const persistedOnboardingCompleteAtStartup =
        loadPersistedOnboardingComplete();
      let requiresAuth = false;
      let latestAuth: {
        required: boolean;
        pairingEnabled: boolean;
        expiresAt: number | null;
      } = {
        required: false,
        pairingEnabled: false,
        expiresAt: null,
      };
      const hadPersistedOnboardingCompletion =
        loadPersistedOnboardingComplete();
      setStartupError(null);
      setStartupPhase("starting-backend");
      setAuthRequired(false);
      setConnected(false);
      setOnboardingExistingInstallDetected(false);

      const forceLocalBootstrap = forceLocalBootstrapRef.current;
      forceLocalBootstrapRef.current = false;
      const persistedConnection = loadPersistedConnectionMode();
      const desktopExistingInstall =
        !persistedConnection && isElectrobunRuntime()
          ? await inspectExistingElizaInstall().catch(() => null)
          : null;
      const shouldPreferLocalBootstrap =
        forceLocalBootstrap ||
        isElectrobunRuntime() ||
        Boolean(desktopExistingInstall?.detected);
      const probedConnection = persistedConnection
        ? null
        : await detectExistingOnboardingConnection({
            client,
            timeoutMs: shouldPreferLocalBootstrap
              ? Math.min(getBackendStartupTimeoutMs(), 30_000)
              : Math.min(getBackendStartupTimeoutMs(), 3_500),
          });
      if (cancelled) {
        return;
      }
      const restoredConnection =
        persistedConnection ??
        probedConnection?.connection ??
        (shouldPreferLocalBootstrap ? { runMode: "local" } : null);
      const shouldPreserveCompletedOnboarding =
        persistedOnboardingCompleteAtStartup &&
        !onboardingCompletionCommittedRef.current;

      setOnboardingExistingInstallDetected(
        Boolean(
          persistedOnboardingCompleteAtStartup ||
            desktopExistingInstall?.detected ||
            probedConnection?.detectedExistingInstall,
        ),
      );

      if (!restoredConnection) {
        const startupWithoutConnection =
          resolveStartupWithoutRestoredConnection({
            hadPersistedOnboardingCompletion,
          });
        if (startupWithoutConnection.kind === "startup-error") {
          setOnboardingComplete(true);
          setStartupError(startupWithoutConnection.error);
          setOnboardingLoading(false);
          return;
        }
        // No reusable backend/config was found yet. Show static onboarding
        // immediately so first-run users are not blocked on server startup.
        setOnboardingOptions({
          names: [],
          styles: getStylePresets(uiLanguage),
          providers: [
            ...ONBOARDING_PROVIDER_CATALOG,
          ] as OnboardingOptions["providers"],
          cloudProviders: [],
          models: { small: [], large: [] },
          inventoryProviders: [],
          sharedStyleRules: "",
        });
        try {
          const detected = await scanProviderCredentials();
          if (!cancelled) {
            applyDetectedProviders(detected);
          }
        } catch {
          // Non-fatal — credential scan is best-effort
        }
        setStartupPhase("ready");
        setOnboardingComplete(false);
        setOnboardingLoading(false);
        return;
      }

      if (restoredConnection) {
        if (
          restoredConnection.runMode === "cloud" &&
          restoredConnection.cloudApiBase
        ) {
          client.setBaseUrl(restoredConnection.cloudApiBase);
          if (restoredConnection.cloudAuthToken) {
            client.setToken(restoredConnection.cloudAuthToken);
          }
        } else if (
          restoredConnection.runMode === "remote" &&
          restoredConnection.remoteApiBase
        ) {
          client.setBaseUrl(restoredConnection.remoteApiBase);
          if (restoredConnection.remoteAccessToken) {
            client.setToken(restoredConnection.remoteAccessToken);
          }
        } else if (restoredConnection.runMode === "local") {
          // Always nudge the local desktop/native startup path. The embedded
          // agent start call is idempotent, and packaged shells can inject the
          // API base before the local process is actually accepting requests.
          try {
            await invokeDesktopBridgeRequest({
              rpcMethod: "agentStart",
              ipcChannel: "agent:start",
            });
          } catch {
            // Not on desktop or agent already running
          }
        }
      }

      const backendStartedAt = Date.now();
      let lastBackendError: unknown = null;

      // Keep the splash screen up until the backend is reachable.
      let backendAttempts = 0;
      while (!cancelled) {
        if (Date.now() - backendStartedAt >= getBackendStartupTimeoutMs()) {
          setStartupError(describeBackendFailure(lastBackendError, true));
          setOnboardingLoading(false);
          return;
        }
        try {
          const auth = await client.getAuthStatus();
          latestAuth = auth;
          if (auth.required && !client.hasToken()) {
            setAuthRequired(true);
            setPairingEnabled(auth.pairingEnabled);
            setPairingExpiresAt(auth.expiresAt);
            requiresAuth = true;
            break;
          }
          const { complete } = await client.getOnboardingStatus();
          const sessionOnboardingComplete =
            complete ||
            onboardingCompletionCommittedRef.current ||
            shouldPreserveCompletedOnboarding;
          if (complete) {
            clearPersistedOnboardingStep();
            onboardingResumeConnectionRef.current = null;
          }
          if (
            sessionOnboardingComplete &&
            !persistedConnection &&
            restoredConnection
          ) {
            savePersistedConnectionMode(restoredConnection);
          }
          if (!complete && shouldPreserveCompletedOnboarding) {
            console.warn(
              "[milady][startup:init] Preserving completed onboarding despite incomplete backend onboarding status.",
            );
          }
          setOnboardingComplete(sessionOnboardingComplete);
          onboardingNeedsOptions = !sessionOnboardingComplete;
          break;
        } catch (err) {
          const apiErr = asApiLikeError(err);
          if (apiErr?.status === 401 && client.hasToken()) {
            client.setToken(null);
            setAuthRequired(true);
            setPairingEnabled(latestAuth.pairingEnabled);
            setPairingExpiresAt(latestAuth.expiresAt);
            requiresAuth = true;
            break;
          }
          if (apiErr?.status === 404) {
            setStartupError(describeBackendFailure(err, false));
            setOnboardingLoading(false);
            return;
          }
          lastBackendError = err;
          backendAttempts += 1;
          const delay = Math.min(
            BASE_DELAY_MS * 2 ** Math.min(backendAttempts, 2),
            MAX_DELAY_MS,
          );
          await sleep(delay);
        }
      }
      if (cancelled) {
        return;
      }

      if (requiresAuth) {
        setStartupPhase("ready");
        setOnboardingLoading(false);
        return;
      }

      // On fresh installs, unblock to onboarding as soon as options are available.
      if (onboardingNeedsOptions) {
        const optionsStartedAt = Date.now();
        let optionsError: unknown = null;
        while (!cancelled) {
          if (Date.now() - optionsStartedAt >= getBackendStartupTimeoutMs()) {
            setStartupError(describeBackendFailure(optionsError, true));
            setOnboardingLoading(false);
            return;
          }
          try {
            const [options, config] = await Promise.all([
              client.getOnboardingOptions(),
              client.getConfig().catch(() => null),
            ]);
            if (onboardingCompletionCommittedRef.current) {
              setStartupPhase("ready");
              setOnboardingLoading(false);
              return;
            }
            const resumeConnection = deriveOnboardingResumeConnection(config);
            const resumeFields = deriveOnboardingResumeFields(resumeConnection);
            onboardingResumeConnectionRef.current = resumeConnection;

            setOnboardingOptions({
              ...options,
              styles:
                options.styles.length > 0
                  ? options.styles
                  : getStylePresets(uiLanguage),
            });

            // Auto-detect AI provider credentials from local CLI installs.
            // Only auto-fill if no existing connection config was found.
            if (!resumeConnection) {
              try {
                const detected = await scanProviderCredentials();
                if (detected.length > 0) {
                  applyDetectedProviders(detected);
                }
              } catch {
                // Non-fatal — credential scan is best-effort
              }
            }

            if (resumeFields.onboardingRunMode !== undefined) {
              setOnboardingRunMode(resumeFields.onboardingRunMode);
            }
            if (resumeFields.onboardingCloudProvider !== undefined) {
              setOnboardingCloudProvider(resumeFields.onboardingCloudProvider);
            }
            if (resumeFields.onboardingProvider !== undefined) {
              setOnboardingProvider(resumeFields.onboardingProvider);
            }
            if (resumeFields.onboardingVoiceProvider !== undefined) {
              setOnboardingVoiceProvider(resumeFields.onboardingVoiceProvider);
            }
            if (resumeFields.onboardingApiKey !== undefined) {
              setOnboardingApiKey(resumeFields.onboardingApiKey);
            }
            if (resumeFields.onboardingPrimaryModel !== undefined) {
              setOnboardingPrimaryModel(resumeFields.onboardingPrimaryModel);
            }
            if (resumeFields.onboardingOpenRouterModel !== undefined) {
              setOnboardingOpenRouterModel(
                resumeFields.onboardingOpenRouterModel,
              );
            }
            if (resumeFields.onboardingRemoteConnected !== undefined) {
              setOnboardingRemoteConnected(
                resumeFields.onboardingRemoteConnected,
              );
            }
            if (resumeFields.onboardingRemoteApiBase !== undefined) {
              setOnboardingRemoteApiBase(resumeFields.onboardingRemoteApiBase);
            }
            if (resumeFields.onboardingRemoteToken !== undefined) {
              setOnboardingRemoteToken(resumeFields.onboardingRemoteToken);
            }
            if (resumeFields.onboardingSmallModel !== undefined) {
              setOnboardingSmallModel(resumeFields.onboardingSmallModel);
            }
            if (resumeFields.onboardingLargeModel !== undefined) {
              setOnboardingLargeModel(resumeFields.onboardingLargeModel);
            }
            setOnboardingStep(
              inferOnboardingResumeStep({
                persistedStep: loadPersistedOnboardingStep(),
                config,
              }),
            );
            setStartupPhase("ready");
            setOnboardingLoading(false);
            return;
          } catch (err) {
            const apiErr = asApiLikeError(err);
            if (apiErr?.status === 401 && client.hasToken()) {
              client.setToken(null);
              setAuthRequired(true);
              setPairingEnabled(latestAuth.pairingEnabled);
              setPairingExpiresAt(latestAuth.expiresAt);
              setStartupPhase("ready");
              setOnboardingLoading(false);
              return;
            }
            if (apiErr?.status === 404) {
              setStartupError(describeBackendFailure(err, false));
              setOnboardingLoading(false);
              return;
            }
            optionsError = err;
            await sleep(500);
          }
        }
        return;
      }

      setStartupPhase("initializing-agent");

      // Existing installs: keep loading until the runtime reports ready.
      let agentReady = false;
      const agentWaitStartedAt = Date.now();
      let agentDeadlineAt = agentWaitStartedAt + getAgentReadyTimeoutMs();
      let lastAgentError: unknown = null;
      let lastAgentDiagnostics: AgentStartupDiagnostics | undefined;
      while (!cancelled) {
        if (Date.now() >= agentDeadlineAt) {
          setStartupError(
            describeAgentFailure(lastAgentError, true, lastAgentDiagnostics),
          );
          setOnboardingLoading(false);
          return;
        }
        try {
          let status = await client.getStatus();
          setAgentStatus(status);
          setConnected(true);
          lastAgentDiagnostics = status.startup;

          agentDeadlineAt = computeAgentDeadlineExtensions({
            agentWaitStartedAt,
            agentDeadlineAt,
            state: status.state,
          });

          // Hydrate deferred restart state
          if (status.pendingRestart) {
            setPendingRestart(true);
            setPendingRestartReasons(status.pendingRestartReasons ?? []);
          }

          if (status.state === "not_started" || status.state === "stopped") {
            try {
              status = await client.startAgent();
              setAgentStatus(status);
              lastAgentDiagnostics = status.startup;
            } catch (err) {
              lastAgentError = err;
            }
          }

          if (status.state === "running") {
            agentReady = true;
            break;
          }

          if (status.state === "error") {
            setStartupError(
              describeAgentFailure(lastAgentError, false, status.startup),
            );
            setOnboardingLoading(false);
            return;
          }
        } catch (err) {
          const apiErr = asApiLikeError(err);
          if (apiErr?.status === 401 && client.hasToken()) {
            client.setToken(null);
            setAuthRequired(true);
            setPairingEnabled(latestAuth.pairingEnabled);
            setPairingExpiresAt(latestAuth.expiresAt);
            setOnboardingLoading(false);
            return;
          }
          lastAgentError = err;
          setConnected(false);
        }
        await sleep(500);
      }
      if (cancelled) return;

      if (!agentReady) {
        setStartupError(
          describeAgentFailure(lastAgentError, true, lastAgentDiagnostics),
        );
        setOnboardingLoading(false);
        return;
      }

      setStartupError(null);
      const greetConvId = await hydrateInitialConversationState();
      setStartupPhase("ready");
      setOnboardingLoading(false);
      if (greetConvId) {
        void requestGreetingWhenRunningRef.current(greetConvId);
      }

      void loadWorkbench();
      void loadPlugins(); // Hydrate plugin state early so Nav sees streaming-base toggle
      void loadCharacter(); // Hydrate character data for chat UI agent name + responses

      // Hydrate coding agent sessions (also re-called on WS reconnect / server restart)
      const hydratePtySessions = () => {
        client
          .getCodingAgentStatus()
          .then((status) => {
            if (status?.tasks) {
              setPtySessions(mapServerTasksToSessions(status.tasks));
            }
          })
          .catch(() => {}); // non-critical
      };
      hydratePtySessions();
      let ptyHydratedViaWs = false;

      // Fallback 5s poll for PTY sessions in case WS events don't flow
      ptyPollInterval = setInterval(() => {
        hydratePtySessions();
      }, 5_000);

      // Connect WebSocket
      client.connectWs();

      unbindEmotes = client.onWsEvent(
        "emote",
        (data: Record<string, unknown>) => {
          const emote = normalizeAppEmoteEvent(data);
          if (emote) {
            dispatchAppEmoteEvent(emote);
          }
        },
      );

      // Re-hydrate PTY sessions on WS reconnect — events sent during
      // the disconnect gap are lost, so we reconcile from the server.
      unbindWsReconnect = client.onWsEvent("ws-reconnected", () => {
        hydratePtySessions();
      });

      // Surface system-level warnings (connector failures, wiring exhaustion, etc.)
      unbindSystemWarnings = client.onWsEvent(
        "system-warning",
        (data: Record<string, unknown>) => {
          const message = typeof data.message === "string" ? data.message : "";
          if (message) {
            setSystemWarnings((prev) => {
              if (prev.includes(message)) return prev;
              const next = [...prev, message];
              if (next.length > 50) next.splice(0, next.length - 50);
              return next;
            });
          }
        },
      );

      // Re-hydrate when the tab becomes visible — browsers may throttle
      // or drop WS messages for background tabs.
      handleVisibilityRef = () => {
        if (document.visibilityState === "visible") {
          hydratePtySessions();
        }
      };
      document.addEventListener("visibilitychange", handleVisibilityRef);

      unbindStatus = client.onWsEvent(
        "status",
        (data: Record<string, unknown>) => {
          const nextStatus = parseAgentStatusEvent(data);
          if (nextStatus) {
            setAgentStatusIfChanged(nextStatus);
            // Auto-refresh plugins and cloud status when agent reports a restart
            if (data.restarted) {
              setPendingRestart(false);
              setPendingRestartReasons([]);
              void loadPlugins();
              void pollCloudCredits();
              hydratePtySessions();
              ptyHydratedViaWs = true;
            }
          }
          // Re-hydrate PTY sessions on first WS status event to close
          // the race between initial REST fetch and WS connection.
          if (!ptyHydratedViaWs) {
            ptyHydratedViaWs = true;
            hydratePtySessions();
          }
          // Sync pending restart state from periodic broadcasts
          // Guard with value comparison to avoid no-op re-renders
          if (typeof data.pendingRestart === "boolean") {
            setPendingRestart((prev) =>
              prev === data.pendingRestart
                ? prev
                : (data.pendingRestart as boolean),
            );
          }
          if (Array.isArray(data.pendingRestartReasons)) {
            const nextReasons = data.pendingRestartReasons.filter(
              (el): el is string => typeof el === "string",
            );
            setPendingRestartReasons((prev) => {
              if (
                prev.length === nextReasons.length &&
                prev.every((r, i) => r === nextReasons[i])
              ) {
                return prev; // identical — skip re-render
              }
              return nextReasons;
            });
          }
        },
      );
      unbindRestartRequired = client.onWsEvent(
        "restart-required",
        (data: Record<string, unknown>) => {
          if (Array.isArray(data.reasons)) {
            setPendingRestartReasons(
              data.reasons.filter((el): el is string => typeof el === "string"),
            );
            setPendingRestart(true);
            showRestartBanner();
          }
        },
      );
      unbindAgentEvents = client.onWsEvent(
        "agent_event",
        (data: Record<string, unknown>) => {
          const event = parseStreamEventEnvelopeEvent(data);
          if (event) {
            appendAutonomousEvent(event);
          }
        },
      );
      unbindHeartbeatEvents = client.onWsEvent(
        "heartbeat_event",
        (data: Record<string, unknown>) => {
          const event = parseStreamEventEnvelopeEvent(data);
          if (event) {
            appendAutonomousEvent(event);
            notifyHeartbeatEvent(event);
          }
        },
      );

      await fetchAutonomyReplay();

      // Handle proactive messages from autonomy
      unbindProactiveMessages = client.onWsEvent(
        "proactive-message",
        (data: Record<string, unknown>) => {
          const parsed = parseProactiveMessageEvent(data);
          if (!parsed) return;
          const { conversationId: convId, message: msg } = parsed;

          if (convId === activeConversationIdRef.current) {
            // Active conversation — append in real-time (deduplicate by id)
            setConversationMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
          } else {
            // Non-active — mark unread
            setUnreadConversations((prev) => new Set([...prev, convId]));
          }

          // Synthesize agent_event for non-client_chat sources (e.g. discord)
          // so they appear in the StreamView activity feed
          if (
            msg.source &&
            msg.source !== "client_chat" &&
            msg.role === "user"
          ) {
            appendAutonomousEvent({
              type: "agent_event",
              version: 1,
              eventId: `synth-${msg.id}`,
              ts: msg.timestamp,
              stream: "message",
              payload: {
                text: msg.text,
                from: msg.from,
                source: msg.source,
                direction: "inbound",
                channel: msg.source,
              },
            });
          }

          // Bump conversation to top of list
          setConversations((prev) => {
            const updated = prev.map((c) =>
              c.id === convId
                ? { ...c, updatedAt: new Date().toISOString() }
                : c,
            );
            return updated.sort(
              (a, b) =>
                new Date(b.updatedAt).getTime() -
                new Date(a.updatedAt).getTime(),
            );
          });
        },
      );

      // Handle conversation updates (e.g. title changes)
      unbindConversationUpdated = client.onWsEvent(
        "conversation-updated",
        (data: Record<string, unknown>) => {
          const conv = data.conversation as Conversation;
          if (conv?.id) {
            setConversations((prev) => {
              const updated = prev.map((c) => (c.id === conv.id ? conv : c));
              return updated.sort(
                (a, b) =>
                  new Date(b.updatedAt).getTime() -
                  new Date(a.updatedAt).getTime(),
              );
            });
          }
        },
      );

      // Handle PTY session events from SwarmCoordinator
      unbindPtySessionEvent = client.onWsEvent("pty-session-event", (data: Record<string, unknown>) => {
        const eventType = (data.eventType ?? data.type) as string;
        const sessionId = data.sessionId as string;
        if (!sessionId) return;

        if (eventType === "task_registered") {
          const d = data.data as Record<string, unknown> | undefined;
          setPtySessions((prev) => [
            ...prev.filter((s) => s.sessionId !== sessionId),
            {
              sessionId,
              agentType: (d?.agentType as string) ?? "claude",
              label: (d?.label as string) ?? sessionId,
              originalTask: (d?.originalTask as string) ?? "",
              workdir: (d?.workdir as string) ?? "",
              status: "active",
              decisionCount: 0,
              autoResolvedCount: 0,
              lastActivity: "Starting",
            },
          ]);
        } else if (eventType === "task_complete" || eventType === "stopped") {
          setPtySessions((prev) =>
            prev.filter((s) => s.sessionId !== sessionId),
          );
        } else {
          // Status update — apply to known session, or full re-hydrate if unknown
          const applyUpdate = (
            prev: CodingAgentSession[],
          ): CodingAgentSession[] => {
            const known = prev.some((s) => s.sessionId === sessionId);
            if (!known) return prev; // will trigger hydration below

            if (eventType === "blocked" || eventType === "escalation") {
              const activity =
                eventType === "escalation"
                  ? "Escalated — needs attention"
                  : "Waiting for input";
              return prev.map((s) =>
                s.sessionId === sessionId
                  ? { ...s, status: "blocked" as const, lastActivity: activity }
                  : s,
              );
            }
            if (eventType === "tool_running") {
              const d = data.data as Record<string, unknown> | undefined;
              const toolDesc =
                (d?.description as string) ??
                (d?.toolName as string) ??
                "external tool";
              return prev.map((s) =>
                s.sessionId === sessionId
                  ? {
                      ...s,
                      status: "tool_running" as const,
                      toolDescription: toolDesc,
                      lastActivity: `Running ${toolDesc}`.slice(0, 60),
                    }
                  : s,
              );
            }
            if (eventType === "blocked_auto_resolved") {
              const d = data.data as Record<string, unknown> | undefined;
              const prompt =
                (d?.prompt as string) ?? (d?.reasoning as string) ?? "";
              const excerpt = prompt
                ? `Approved: ${prompt}`.slice(0, 60)
                : "Approved";
              return prev.map((s) =>
                s.sessionId === sessionId
                  ? {
                      ...s,
                      status: "active" as const,
                      toolDescription: undefined,
                      lastActivity: excerpt,
                    }
                  : s,
              );
            }
            // coordination_decision — emitted by swarm decision loop.
            // d.action values: "approve" | "respond" | "escalate" | "continue"
            if (eventType === "coordination_decision") {
              const d = data.data as Record<string, unknown> | undefined;
              const reasoning =
                (d?.reasoning as string) ?? (d?.action as string) ?? "";
              const wasEscalation = (d?.action as string) === "escalate";
              const excerpt = wasEscalation
                ? `Escalated: ${reasoning}`.slice(0, 60)
                : reasoning
                  ? `Responded: ${reasoning}`.slice(0, 60)
                  : "Responded";
              return prev.map((s) =>
                s.sessionId === sessionId
                  ? {
                      ...s,
                      status: "active" as const,
                      toolDescription: undefined,
                      lastActivity: excerpt,
                    }
                  : s,
              );
            }
            if (eventType === "ready") {
              return prev.map((s) =>
                s.sessionId === sessionId
                  ? {
                      ...s,
                      status: "active" as const,
                      toolDescription: undefined,
                      lastActivity: "Running",
                    }
                  : s,
              );
            }
            if (eventType === "error") {
              const d = data.data as Record<string, unknown> | undefined;
              const errMsg = (d?.message as string) ?? "Unknown error";
              return prev.map((s) =>
                s.sessionId === sessionId
                  ? {
                      ...s,
                      status: "error" as const,
                      lastActivity: `Error: ${errMsg}`.slice(0, 60),
                    }
                  : s,
              );
            }
            return prev;
          };

          let needsHydrate = false;
          setPtySessions((prev) => {
            const next = applyUpdate(prev);
            if (next === prev && !prev.some((s) => s.sessionId === sessionId)) {
              // Unknown session — flag for re-hydration outside the updater
              needsHydrate = true;
              return prev;
            }
            return next;
          });
          if (needsHydrate) {
            // Re-hydrate from server to pick up missed registrations
            hydratePtySessions();
          }
        }
      });

      // Load wallet addresses for header
      try {
        setWalletAddresses(await client.getWalletAddresses());
      } catch (err) {
        logStartupWarning("failed to load wallet addresses", err);
      }

      // Restore avatar selection from stream settings (same source used when saving).
      // This prevents detached/settings windows from snapping back to stale
      // config.ui.avatarIndex values and overwriting local avatar preference.
      let resolvedIndex = loadAvatarIndex();
      try {
        const stream = await client.getStreamSettings();
        const serverAvatarIndex = stream.settings?.avatarIndex;
        if (
          typeof serverAvatarIndex === "number" &&
          Number.isFinite(serverAvatarIndex)
        ) {
          resolvedIndex = normalizeAvatarIndex(serverAvatarIndex);
          setSelectedVrmIndex(resolvedIndex);
        }
      } catch (err) {
        logStartupWarning(
          "failed to load stream settings for avatar selection",
          err,
        );
      }
      // If custom avatar selected, verify the file still exists on the server
      if (resolvedIndex === 0) {
        const hasVrm = await client.hasCustomVrm();
        if (hasVrm) {
          setCustomVrmUrl(resolveApiUrl(`/api/avatar/vrm?t=${Date.now()}`));
        } else {
          setSelectedVrmIndex(1);
        }
        // Restore custom background if one was uploaded
        const hasBg = await client.hasCustomBackground();
        if (hasBg) {
          setCustomBackgroundUrl(
            resolveApiUrl(`/api/avatar/background?t=${Date.now()}`),
          );
        }
      }

      // Cloud polling — run the initial poll to discover a pre-existing
      // connection. The recurring interval is started automatically by
      // pollCloudCredits whenever it detects a connected state.
      void pollCloudCredits();

      // Load tab from URL — use hash in file:// mode (packaged desktop builds)
      const navPath = getNavigationPathFromWindow();
      const urlTab = tabFromPath(navPath);
      const isRootNavPath = isRouteRootPath(navPath);

      // If the user navigates directly to /character while onboarding is incomplete,
      // override the persisted step to show them the connection step.
      if (onboardingNeedsOptions && navPath === "/character") {
        setOnboardingStep("hosting");
      }

      const shouldStartAtCharacterSelect =
        onboardingCompletionCommittedRef.current ||
        shouldStartAtCharacterSelectOnLaunch({
          onboardingNeedsOptions,
          onboardingMode,
          navPath,
          urlTab,
        });
      // Only set the initial tab ONCE ever — use a ref so async retries
      // inside the same effect closure don't override the user's navigation.
      if (!initialTabSetRef.current) {
        initialTabSetRef.current = true;
        if (shouldStartAtCharacterSelect) {
          onboardingCompletionCommittedRef.current = false;
          setTab("character-select");
          void loadCharacter();
        } else if (!onboardingNeedsOptions && isRootNavPath) {
          setTab(DEFAULT_LANDING_TAB);
        }
      }
      if (urlTab && urlTab !== "chat" && urlTab !== "companion") {
        setTabRaw(urlTab);
        if (urlTab === "plugins" || urlTab === "connectors") {
          void loadPlugins();
          if (urlTab === "plugins") {
            void loadSkills();
          }
        }
        if (urlTab === "settings") {
          void checkExtensionStatus();
          void loadWalletConfig();
          void loadCharacter();
          void loadUpdateStatus();
          void loadPlugins();
        }
        if (urlTab === "character" || urlTab === "character-select") {
          void loadCharacter();
        }
        if (urlTab === "wallets") {
          void loadInventory();
        }
      }
    };

    void initApp();

    // Navigation listener — use hashchange in file:// mode (packaged desktop builds)
    const isFileProtocol = window.location.protocol === "file:";
    const handleNavChange = () => {
      const navPath = getNavigationPathFromWindow();
      const navTab = tabFromPath(navPath);
      if (navTab) setTabRaw(navTab);
    };
    const navEvent = isFileProtocol ? "hashchange" : "popstate";
    window.addEventListener(navEvent, handleNavChange);

    return () => {
      cancelled = true;
      window.removeEventListener(navEvent, handleNavChange);
      if (elizaCloudPollInterval.current) {
        clearInterval(elizaCloudPollInterval.current);
        elizaCloudPollInterval.current = null;
      }
      if (elizaCloudLoginPollTimer.current) {
        clearInterval(elizaCloudLoginPollTimer.current);
        elizaCloudLoginPollTimer.current = null;
      }
      unbindStatus?.();
      unbindAgentEvents?.();
      unbindHeartbeatEvents?.();
      unbindEmotes?.();
      unbindProactiveMessages?.();
      unbindWsReconnect?.();
      unbindSystemWarnings?.();
      unbindRestartRequired?.();
      unbindConversationUpdated?.();
      unbindPtySessionEvent?.();
      if (ptyPollInterval) {
        clearInterval(ptyPollInterval);
        ptyPollInterval = null;
      }
      if (handleVisibilityRef)
        document.removeEventListener("visibilitychange", handleVisibilityRef);
      client.disconnectWs();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    applyDetectedProviders,
    appendAutonomousEvent,
    checkExtensionStatus,
    fetchAutonomyReplay,
    hydrateInitialConversationState,
    loadCharacter,
    loadInventory,
    loadPlugins,
    loadSkills,
    loadUpdateStatus,
    loadWalletConfig,
    loadWorkbench, // Cloud polling
    pollCloudCredits,
    setSelectedVrmIndex,
    startupRetryNonce,
    uiLanguage,
  ]);

  const requestGreetingWhenRunningRef2 = useRef(requestGreetingWhenRunning);
  useEffect(() => {
    requestGreetingWhenRunningRef2.current = requestGreetingWhenRunning;
  }, [requestGreetingWhenRunning]);

  // When agent transitions to "running", send a greeting if conversation is empty
  useEffect(() => {
    const current = agentStatus?.state ?? null;
    const prev = prevAgentStateRef.current;
    prevAgentStateRef.current = current;

    if (current === "running" && prev !== "running") {
      void loadWorkbench();

      // Agent just started — greet if conversation is empty.
      // The greetingFiredRef guard prevents double-greeting when both the
      // init mount effect and this state-transition effect race to fire.
      if (
        activeConversationId &&
        conversationMessages.length === 0 &&
        !chatSending &&
        !greetingFiredRef.current &&
        greetingInFlightConversationRef.current !== activeConversationId
      ) {
        void fetchGreeting(activeConversationId);
      }
    }
  }, [
    agentStatus?.state,
    loadWorkbench,
    activeConversationId,
    conversationMessages.length,
    chatSending,
    fetchGreeting,
  ]);

  // Empty thread + running agent: ensure a first assistant message is requested
  // (covers races where startup/transition greeting paths miss the active conv id).
  useEffect(() => {
    if (
      !activeConversationId ||
      conversationMessages.length > 0 ||
      agentStatus?.state !== "running" ||
      chatSending
    ) {
      return;
    }
    if (greetingFiredRef.current) return;
    if (greetingInFlightConversationRef.current === activeConversationId) {
      return;
    }

    const timerId = window.setTimeout(() => {
      if (activeConversationIdRef.current !== activeConversationId) return;
      if (conversationMessagesRef.current.length > 0) return;
      if (greetingFiredRef.current) return;
      if (greetingInFlightConversationRef.current === activeConversationId) {
        return;
      }
      traceMiladyGreeting("effect:empty_thread_auto_greet", {
        activeConversationId,
      });
      void fetchGreeting(activeConversationId);
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [
    activeConversationId,
    agentStatus?.state,
    chatSending,
    conversationMessages.length,
    fetchGreeting,
  ]);

  // ── Context value ──────────────────────────────────────────────────

  // t is provided by TranslationContext (useTranslation() above)

  // Cloud auth-rejected effect is now inside useCloudState.

  const companionSceneConfig = useMemo(
    () => ({
      selectedVrmIndex,
      customVrmUrl,
      uiTheme,
      tab,
      companionVrmPowerMode,
      companionHalfFramerateMode,
      companionAnimateWhenHidden,
    }),
    [
      selectedVrmIndex,
      customVrmUrl,
      uiTheme,
      tab,
      companionVrmPowerMode,
      companionHalfFramerateMode,
      companionAnimateWhenHidden,
    ],
  );

  const value: AppContextValue = {
    // Translations
    t,
    // State
    tab,
    uiShellMode,
    uiLanguage,
    uiTheme,
    companionVrmPowerMode,
    companionAnimateWhenHidden,
    companionHalfFramerateMode,
    connected,
    agentStatus,
    onboardingComplete,
    onboardingUiRevealNonce,
    onboardingLoading,
    onboardingHandoffPhase,
    onboardingHandoffError,
    startupPhase,
    startupStatus,
    startupError,
    authRequired,
    actionNotice,
    lifecycleBusy,
    lifecycleAction,
    pendingRestart,
    pendingRestartReasons,
    restartBannerDismissed,
    backendConnection,
    backendDisconnectedBannerDismissed,
    pairingEnabled,
    pairingExpiresAt,
    pairingCodeInput,
    pairingError,
    pairingBusy,
    chatInput,
    chatSending,
    chatFirstTokenReceived,
    chatAwaitingGreeting,
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
    triggers,
    triggersLoading,
    triggersSaving,
    triggerRunsById,
    triggerHealth,
    triggerError,
    plugins,
    pluginFilter,
    pluginStatusFilter,
    pluginSearch,
    pluginSettingsOpen,
    pluginAdvancedOpen,
    pluginSaving,
    pluginSaveSuccess,
    skills,
    skillsSubTab,
    skillCreateFormOpen,
    skillCreateName,
    skillCreateDescription,
    skillCreating,
    skillReviewReport,
    skillReviewId,
    skillReviewLoading,
    skillToggleAction,
    skillsMarketplaceQuery,
    skillsMarketplaceResults,
    skillsMarketplaceError,
    skillsMarketplaceLoading,
    skillsMarketplaceAction,
    skillsMarketplaceManualGithubUrl,
    logs,
    logSources,
    logTags,
    logTagFilter,
    logLevelFilter,
    logSourceFilter,
    walletAddresses,
    walletConfig,
    walletBalances,
    walletNfts,
    walletLoading,
    walletNftsLoading,
    inventoryView,
    walletExportData,
    walletExportVisible,
    walletApiKeySaving,
    inventorySort,
    inventorySortDirection,
    inventoryChainFilters,
    walletError,
    registryStatus,
    registryLoading,
    registryRegistering,
    registryError,
    dropStatus,
    dropLoading,
    mintInProgress,
    mintResult,
    mintError,
    mintShiny,
    whitelistStatus,
    whitelistLoading,
    twitterVerifyMessage,
    twitterVerifyUrl,
    twitterVerifying,
    characterData,
    characterLoading,
    characterSaving,
    characterSaveSuccess,
    characterSaveError,
    characterDraft,
    selectedVrmIndex,
    customVrmUrl,
    customBackgroundUrl,
    elizaCloudEnabled,
    elizaCloudConnected,
    elizaCloudHasPersistedKey,
    elizaCloudCredits,
    elizaCloudCreditsLow,
    elizaCloudCreditsCritical,
    elizaCloudAuthRejected,
    elizaCloudCreditsError,
    elizaCloudTopUpUrl,
    elizaCloudUserId,
    elizaCloudStatusReason,
    ownerName,
    showOwnerNamePrompt,
    handleOwnerNameSubmit,
    cloudDashboardView,
    elizaCloudLoginBusy,
    elizaCloudLoginError,
    elizaCloudDisconnecting,
    updateStatus,
    updateLoading,
    updateChannelSaving,
    extensionStatus,
    extensionChecking,
    storePlugins,
    storeSearch,
    storeFilter,
    storeLoading,
    storeInstalling,
    storeUninstalling,
    storeError,
    storeDetailPlugin,
    storeSubTab,
    catalogSkills,
    catalogTotal,
    catalogPage,
    catalogTotalPages,
    catalogSort,
    catalogSearch,
    catalogLoading,
    catalogError,
    catalogDetailSkill,
    catalogInstalling,
    catalogUninstalling,
    workbenchLoading,
    workbench,
    workbenchTasksAvailable,
    workbenchTriggersAvailable,
    workbenchTodosAvailable,
    exportBusy,
    exportPassword,
    exportIncludeLogs,
    exportError,
    exportSuccess,
    importBusy,
    importPassword,
    importFile,
    importError,
    importSuccess,
    onboardingStep,
    onboardingMode,
    onboardingActiveGuide,
    onboardingDeferredTasks,
    postOnboardingChecklistDismissed,
    onboardingOptions,
    onboardingName,
    onboardingOwnerName,
    onboardingStyle,
    onboardingRunMode,
    onboardingCloudProvider,
    onboardingSmallModel,
    onboardingLargeModel,
    onboardingProvider,
    onboardingApiKey,
    onboardingVoiceProvider,
    onboardingVoiceApiKey,
    onboardingExistingInstallDetected,
    onboardingDetectedProviders,
    onboardingRemoteApiBase,
    onboardingRemoteToken,
    onboardingRemoteConnecting,
    onboardingRemoteError,
    onboardingRemoteConnected,
    onboardingOpenRouterModel,
    onboardingPrimaryModel,
    onboardingTelegramToken,
    onboardingDiscordToken,
    onboardingWhatsAppSessionPath,
    onboardingTwilioAccountSid,
    onboardingTwilioAuthToken,
    onboardingTwilioPhoneNumber,
    onboardingBlooioApiKey,
    onboardingBlooioPhoneNumber,
    onboardingGithubToken,
    onboardingSubscriptionTab,
    onboardingElizaCloudTab,
    onboardingSelectedChains,
    onboardingRpcSelections,
    onboardingRpcKeys,
    onboardingAvatar,
    onboardingRestarting,
    commandPaletteOpen,
    commandQuery,
    commandActiveIndex,
    closeCommandPalette,
    emotePickerOpen,
    mcpConfiguredServers,
    mcpServerStatuses,
    mcpMarketplaceQuery,
    mcpMarketplaceResults,
    mcpMarketplaceLoading,
    mcpAction,
    mcpAddingServer,
    mcpAddingResult,
    mcpEnvInputs,
    mcpHeaderInputs,
    droppedFiles,
    shareIngestNotice,
    chatPendingImages,
    activeGameApp,
    activeGameDisplayName,
    activeGameViewerUrl,
    activeGameSandbox,
    activeGamePostMessageAuth,
    gameOverlayEnabled,
    appsSubTab,
    agentSubTab,
    pluginsSubTab,
    databaseSubTab,
    configRaw,
    configText,
    activeGamePostMessagePayload,

    // Actions
    setTab,
    setUiShellMode,
    switchUiShellMode,
    switchShellView,
    navigation,
    setUiLanguage,
    setUiTheme,
    setCompanionVrmPowerMode,
    setCompanionAnimateWhenHidden,
    setCompanionHalfFramerateMode,
    handleStart,
    handleStop,

    handleRestart,
    handleReset,
    handleResetAppliedFromMain,
    retryStartup,
    dismissRestartBanner,
    showRestartBanner,
    triggerRestart,
    relaunchDesktop,
    dismissBackendDisconnectedBanner,
    retryBackendConnection,
    restartBackend,
    systemWarnings,
    dismissSystemWarning,
    handleChatSend,
    handleChatStop,
    handleChatRetry,
    handleChatEdit,
    handleChatClear,
    handleStartDraftConversation,
    handleNewConversation,
    setChatPendingImages,
    handleSelectConversation,
    handleDeleteConversation,
    handleRenameConversation,
    suggestConversationTitle,
    sendActionMessage,
    sendChatText,
    loadTriggers,
    createTrigger,
    updateTrigger,
    deleteTrigger,
    runTriggerNow,
    loadTriggerRuns,
    loadTriggerHealth,
    handlePairingSubmit,
    loadPlugins,
    handlePluginToggle,
    handlePluginConfigSave,
    loadSkills,
    refreshSkills,
    handleSkillToggle,
    handleCreateSkill,
    handleOpenSkill,
    handleDeleteSkill,
    handleReviewSkill,
    handleAcknowledgeSkill,
    searchSkillsMarketplace,
    installSkillFromMarketplace,
    uninstallMarketplaceSkill,
    installSkillFromGithubUrl,
    loadLogs,
    loadInventory,
    loadBalances,
    loadNfts,
    executeBscTrade,
    executeBscTransfer,
    getBscTradePreflight,
    getBscTradeQuote,
    getBscTradeTxStatus,
    getStewardStatus,
    getStewardHistory,
    getStewardPending,
    approveStewardTx,
    rejectStewardTx,
    loadWalletTradingProfile,
    handleWalletApiKeySave,
    handleExportKeys,
    loadRegistryStatus,
    registerOnChain,
    syncRegistryProfile,
    loadDropStatus,
    mintFromDrop,
    loadWhitelistStatus,
    loadCharacter,
    handleSaveCharacter,
    handleCharacterFieldInput,
    handleCharacterArrayInput,
    handleCharacterStyleInput,
    handleCharacterMessageExamplesInput,
    handleOnboardingNext,
    handleOnboardingBack,
    retryOnboardingHandoff,
    cancelOnboardingHandoff,
    handleOnboardingJumpToStep,
    goToOnboardingStep,
    handleOnboardingRemoteConnect,
    handleOnboardingUseLocalBackend,
    handleCloudLogin,
    handleCloudDisconnect,
    handleCloudOnboardingFinish,
    loadUpdateStatus,
    handleChannelChange,
    checkExtensionStatus,
    openEmotePicker,
    closeEmotePicker,
    loadWorkbench,
    handleAgentExport,
    handleAgentImport,
    setActionNotice,
    setState,
    copyToClipboard,
  };

  const mergedBranding = useMemo(
    () => ({ ...DEFAULT_BRANDING, ...brandingOverride }),
    [brandingOverride],
  );

  return (
    <BrandingContext.Provider value={mergedBranding}>
      <CompanionSceneConfigCtx.Provider value={companionSceneConfig}>
        <AppContext.Provider value={value}>
          {children}
          <ConfirmDialog {...modalProps} />
          <PromptDialog {...promptModalProps} />
        </AppContext.Provider>
      </CompanionSceneConfigCtx.Provider>
    </BrandingContext.Provider>
  );
}
