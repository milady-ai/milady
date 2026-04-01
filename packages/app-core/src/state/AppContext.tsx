/**
 * Global application state via React Context.
 *
 * Children access state and actions through the useApp() hook.
 */

import { ONBOARDING_PROVIDER_CATALOG } from "@miladyai/shared/contracts/onboarding";
import { getStylePresets } from "@miladyai/shared/onboarding-presets";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type AgentStartupDiagnostics,
  type AgentStatus,
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
  type ImageAttachment,
  type McpMarketplaceResult,
  type McpRegistryServerDetail,
  type McpServerConfig,
  type McpServerStatus,
  type OnboardingOptions,
  type PluginInfo,
  type RegistryPlugin,
  type SkillInfo,
  type SkillMarketplaceResult,
  type SkillScanReportSummary,
  type StreamEventEnvelope,
  type StylePreset,
  type TriggerHealthSnapshot,
  type TriggerRunRecord,
  type TriggerSummary,
  type UpdateTriggerRequest,
} from "../api";
import {
  getBackendStartupTimeoutMs,
  inspectExistingElizaInstall,
  invokeDesktopBridgeRequest,
  invokeDesktopBridgeRequestWithTimeout,
  isElectrobunRuntime,
} from "../bridge";
import { mapServerTasksToSessions } from "../coding";
import { BrandingContext, DEFAULT_BRANDING } from "../config/branding";
import {
  type AppEmoteEventDetail,
  dispatchAppEmoteEvent,
  dispatchElizaCloudStatusUpdated,
} from "../events";
import type { UiLanguage } from "../i18n";
import {
  COMPANION_ENABLED,
  resolveInitialTabForPath,
  type Tab,
} from "../navigation";
import {
  alertDesktopMessage,
  confirmDesktopAction,
  copyTextToClipboard,
  openExternalUrl,
  resolveApiUrl,
  yieldMiladyHttpAfterNativeMessageBox,
} from "../utils";
import { isMiladyTtsDebugEnabled } from "../utils/milady-tts-debug";
import {
  computeAgentDeadlineExtensions,
  getAgentReadyTimeoutMs,
} from "./agent-startup-timing";
import { CompanionSceneConfigCtx } from "./CompanionSceneConfigContext";
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
  loadPersistedConnectionMode,
  loadPersistedOnboardingComplete,
  loadPersistedOnboardingStep,
  loadUiTheme,
  mergeStreamingText,
  normalizeAvatarIndex,
  normalizeCompanionHalfFramerateMode,
  normalizeCompanionVrmPowerMode,
  normalizeCustomActionName,
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
  saveUiShellMode,
  saveUiTheme,
  shouldApplyFinalStreamText,
  type TabCommittedDetail,
  type UiShellMode,
  type UiTheme,
} from "./internal";
import {
  detectExistingOnboardingConnection,
  resolveStartupWithoutRestoredConnection,
} from "./onboarding-bootstrap";
import { deriveUiShellModeForTab } from "./shell-routing";
import { TranslationProvider, useTranslation } from "./TranslationContext";
import type { InventoryChainFilters } from "./types";
import { useChatState } from "./useChatState";
import { useLifecycleState } from "./useLifecycleState";
import { useStartupCoordinator } from "./useStartupCoordinator";
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
import { useDataLoaders } from "./useDataLoaders";
import { useNavigationState } from "./useNavigationState";
import { useOnboardingCallbacks } from "./useOnboardingCallbacks";
import { useChatCallbacks } from "./useChatCallbacks";

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
  // retryStartup resets lifecycle state AND dispatches RETRY to the coordinator.
  // The coordinator's phase effects will re-run from restoring-session.
  // We store a ref to the coordinator's retry since it's created after this line.
  const coordinatorRetryRef = useRef<(() => void) | null>(null);
  const coordinatorOnboardingCompleteRef = useRef<(() => void) | null>(null);
  const retryStartup = useCallback(() => {
    lifecycle.retryStartup();
    coordinatorRetryRef.current?.();
  }, [lifecycle.retryStartup]);

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

  // NOTE: StartupCoordinator hook moved below (after all dependency hooks).
  // Search for "── StartupCoordinator (sole startup authority) ──" below.

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
      triggersLoaded,
      triggersLoading,
      triggersSaving,
      triggerRunsById,
      triggerHealth,
      triggerError,
    },
    loadTriggers,
    loadTriggerHealth,
    loadTriggerRuns,
    ensureTriggersLoaded,
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
    ensurePluginsLoaded,
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

  // Updates, Extension, and Workbench state are now in useDataLoaders (dataLoaders).

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
    resumeConnectionRef: onboardingResumeConnectionRefFromHook,
    completionCommittedRef: onboardingCompletionCommittedRefFromHook,
    forceLocalBootstrapRef: forceLocalBootstrapRefFromHook,
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
  // Onboarding refs now come from useOnboardingState
  const onboardingResumeConnectionRef = onboardingResumeConnectionRefFromHook;
  const onboardingCompletionCommittedRef =
    onboardingCompletionCommittedRefFromHook;
  const forceLocalBootstrapRef = forceLocalBootstrapRefFromHook;
  // exportBusyRef and importBusyRef are now managed inside useExportImportState (exportImportHook)
  // walletApiKeySavingRef is now managed inside useWalletState (walletHook)
  // elizaCloudLoginBusyRef, elizaCloudAuthNoticeSentRef, handleCloudLoginRef
  // are now managed inside useCloudState (cloudHook)

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

  // ── Navigation (extracted to useNavigationState) ──────────────────
  const navHook = useNavigationState({
    tab,
    setTabRaw,
    uiShellMode,
    activeGameViewerUrl,
    setAppsSubTab,
  });
  const {
    lastNativeTab,
    setTab,
    setUiShellMode,
    switchUiShellMode,
    switchShellView,
    navigation,
  } = navHook;

  // loadLogs is now in useLogsState (logsHook)

  // ── Data loading (extracted to useDataLoaders) ────────────────────
  const dataLoaders = useDataLoaders({
    autonomousStoreRef,
    autonomousEventsRef,
    autonomousLatestEventIdRef,
    autonomousRunHealthByRunIdRef,
    autonomousReplayInFlightRef,
    setAutonomousEvents,
    setAutonomousLatestEventId,
    setAutonomousRunHealthByRunId,
    activeConversationIdRef,
    conversationMessagesRef,
    greetingFiredRef,
    setConversations,
    setActiveConversationId,
    setConversationMessages,
    loadWalletConfig,
    agentStatus,
    characterData,
    characterDraft,
    loadCharacter,
    selectedVrmIndex,
    onboardingComplete,
    uiLanguage,
    setOwnerNameState,
  });
  const {
    fetchAutonomyReplay,
    appendAutonomousEvent,
    loadConversations,
    loadConversationMessages,
    getBscTradePreflight,
    getBscTradeQuote,
    getBscTradeTxStatus,
    getStewardStatus,
    getStewardHistory,
    getStewardPending,
    approveStewardTx,
    rejectStewardTx,
    loadWalletTradingProfile,
    executeBscTrade,
    executeBscTransfer,
    loadInventory,
    workbenchLoading,
    workbench,
    workbenchTasksAvailable,
    workbenchTriggersAvailable,
    workbenchTodosAvailable,
    loadWorkbench,
    updateStatus,
    updateLoading,
    updateChannelSaving,
    loadUpdateStatus,
    handleChannelChange,
    extensionStatus,
    extensionChecking,
    checkExtensionStatus,
  } = dataLoaders;

  // pollCloudCredits is now provided by useCloudState (cloudHook — wired below)

  // ── Lifecycle actions ──────────────────────────────────────────────

  // beginLifecycleAction / finishLifecycleAction are now provided by useLifecycleState

  // ── Chat callbacks (extracted to useChatCallbacks) ──────────────────
  const chatCallbacks = useChatCallbacks({
    t,
    uiLanguage,
    uiShellMode,
    tab,
    agentStatus,
    chatInput,
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
    setOnboardingVoiceProvider: setOnboardingVoiceProvider as (
      v: string,
    ) => void,
    setOnboardingVoiceApiKey: setOnboardingVoiceApiKey as (v: string) => void,
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
    setPlugins: setPlugins as (v: never[]) => void,
    setSkills: setSkills as (v: never[]) => void,
    setLogs: setLogs as (v: never[]) => void,
  });
  const {
    fetchGreeting,
    requestGreetingWhenRunning,
    hydrateInitialConversationState,
    handleStartDraftConversation,
    handleStart,
    handleStop,
    handleRestart,
    triggerRestart,
    retryBackendConnection,
    restartBackend,
    relaunchDesktop,
    showDesktopNotification,
    notifyHeartbeatEvent,
    handleResetAppliedFromMain,
    handleReset,
    handleNewConversation,
    sendChatText,
    handleChatSend,
    sendActionMessage,
    handleChatStop,
    handleChatRetry,
    handleChatEdit,
    handleChatClear,
    handleSelectConversation,
    handleDeleteConversation,
    handleRenameConversation,
    suggestConversationTitle,
  } = chatCallbacks;

  // ── Pairing ────────────────────────────────────────────────────────

  // ── Plugin / Skill / Store / Catalog actions are provided by usePluginsSkillsState (pluginsSkillsHook) ──
  // ── Inventory / Registry / Drop / Whitelist actions are provided by useWalletState (walletHook) ──
  // ── Character actions are provided by useCharacterState (characterHook) ──

  // ── Onboarding callbacks (extracted to useOnboardingCallbacks) ──────
  const onboardingCallbacks = useOnboardingCallbacks({
    onboarding,
    setOnboardingStep,
    setOnboardingMode,
    setOnboardingActiveGuide,
    addDeferredOnboardingTask: addDeferredOnboardingTask,
    setOnboardingDetectedProviders,
    setOnboardingRunMode,
    setOnboardingCloudProvider,
    setOnboardingProvider,
    setOnboardingApiKey,
    setOnboardingPrimaryModel,
    setOnboardingRemoteApiBase,
    setOnboardingRemoteToken,
    setOnboardingRemoteConnecting,
    setOnboardingRemoteError,
    setOnboardingRemoteConnected,
    setPostOnboardingChecklistDismissed,
    setOnboardingComplete,
    coordinatorOnboardingCompleteRef,
    initialTabSetRef,
    setTab,
    defaultLandingTab: DEFAULT_LANDING_TAB,
    loadCharacter,
    uiLanguage,
    selectedVrmIndex,
    walletConfig,
    elizaCloudConnected,
    setActionNotice,
    retryStartup,
    forceLocalBootstrapRef,
    client,
  });
  const {
    handleOnboardingNext,
    handleOnboardingBack,
    handleOnboardingJumpToStep,
    goToOnboardingStep,
    handleOnboardingRemoteConnect,
    handleOnboardingUseLocalBackend,
    handleCloudOnboardingFinish,
    applyDetectedProviders,
  } = onboardingCallbacks;

  // handleAgentExport and handleAgentImport are now in useExportImportState (exportImportHook)

  // closeCommandPalette, openEmotePicker, closeEmotePicker are now in useMiscUiState (miscUiHook)

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

  // ── StartupCoordinator (sole startup authority) ──────────────────────
  // Called after all dependency hooks so every setter/callback is available.
  const startupCoordinator = useStartupCoordinator({
    setConnected,
    setAgentStatus,
    setAgentStatusIfChanged,
    setStartupPhase,
    setStartupError,
    setAuthRequired,
    setOnboardingComplete,
    setOnboardingLoading,
    setPendingRestart,
    setPendingRestartReasons,
    setSystemWarnings,
    showRestartBanner,
    setPairingEnabled,
    setPairingExpiresAt,
    setOnboardingOptions,
    setOnboardingExistingInstallDetected,
    setOnboardingStep,
    setOnboardingRunMode,
    setOnboardingCloudProvider,
    setOnboardingProvider,
    setOnboardingVoiceProvider,
    setOnboardingApiKey,
    setOnboardingPrimaryModel,
    setOnboardingOpenRouterModel,
    setOnboardingRemoteConnected,
    setOnboardingRemoteApiBase,
    setOnboardingRemoteToken,
    setOnboardingSmallModel,
    setOnboardingLargeModel,
    applyDetectedProviders,
    hydrateInitialConversationState,
    loadWorkbench,
    loadPlugins,
    loadSkills,
    loadCharacter,
    loadWalletConfig,
    loadInventory,
    loadUpdateStatus,
    checkExtensionStatus,
    pollCloudCredits,
    fetchAutonomyReplay,
    appendAutonomousEvent,
    notifyHeartbeatEvent,
    setSelectedVrmIndex,
    setCustomVrmUrl,
    setCustomBackgroundUrl,
    setWalletAddresses,
    setPtySessions,
    setTab,
    setTabRaw,
    setConversationMessages,
    setUnreadConversations,
    setConversations,
    requestGreetingWhenRunningRef,
    onboardingResumeConnectionRef,
    onboardingCompletionCommittedRef,
    forceLocalBootstrapRef,
    initialTabSetRef,
    activeConversationIdRef,
    elizaCloudPollInterval,
    elizaCloudLoginPollTimer,
    uiLanguage,
    onboardingMode,
  });

  // Wire coordinator refs so callbacks defined before the coordinator can reach it
  coordinatorRetryRef.current = startupCoordinator.retry;
  coordinatorOnboardingCompleteRef.current =
    startupCoordinator.onboardingComplete;

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
    startupPhase,
    startupStatus,
    startupError,
    // StartupCoordinator — the sole startup authority
    startupCoordinator,
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
    triggersLoaded,
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
    ensureTriggersLoaded,
    createTrigger,
    updateTrigger,
    deleteTrigger,
    runTriggerNow,
    loadTriggerRuns,
    loadTriggerHealth,
    handlePairingSubmit,
    loadPlugins,
    ensurePluginsLoaded,
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
