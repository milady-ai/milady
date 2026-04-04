/**
 * Global application state via React Context.
 *
 * Children access state and actions through the useApp() hook.
 */

import { ONBOARDING_PROVIDER_CATALOG } from "@miladyai/shared/contracts/onboarding";
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
import { detectExistingOnboardingConnection } from "./onboarding-bootstrap";
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
import { useOnboardingCompat } from "./useOnboardingCompat";
import { useCharacterState } from "./useCharacterState";
import { useWalletState } from "./useWalletState";
import { usePluginsSkillsState } from "./usePluginsSkillsState";
import { useCloudState } from "./useCloudState";
import { useVincentState } from "./useVincentState";
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

const DEFAULT_LANDING_TAB: Tab = COMPANION_ENABLED ? "companion" : "chat";

function traceMiladyGreeting(
  phase: string,
  detail?: Record<string, unknown>,
): void {
  try {
    if (
      typeof localStorage !== "undefined" &&
      localStorage.getItem("milady:debug:greeting") === "1"
    ) {
      console.info(`[milady][greeting] ${phase}`, detail ?? "");
    }
  } catch {
    /* noop */
  }
}

function getNavigationPathFromWindow(): string {
  if (typeof window === "undefined") return "/";
  return window.location.protocol === "file:"
    ? window.location.hash.replace(/^#/, "") || "/"
    : window.location.pathname;
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
  const coordinatorResetRef = useRef<(() => void) | null>(null);
  const coordinatorOnboardingCompleteRef = useRef<(() => void) | null>(null);
  const retryStartup = useCallback(() => {
    lifecycle.retryStartup();
    coordinatorRetryRef.current?.();
  }, [lifecycle.retryStartup]);
  const resetToSplash = useCallback(() => {
    lifecycle.retryStartup();
    coordinatorResetRef.current?.();
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
      activePackId,
      customWorldUrl,
    },
    setCharacterData,
    setCharacterDraft,
    setCharacterSaveSuccess,
    setCharacterSaveError,
    setSelectedVrmIndex,
    setCustomVrmUrl,
    setCustomBackgroundUrl,
    setActivePackId,
    setCustomWorldUrl,
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
      serverTarget: onboardingServerTarget,
      cloudApiKey: onboardingCloudApiKey,
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
    setDetectedProviders: setOnboardingDetectedProviders,
    completionCommittedRef: onboardingCompletionCommittedRefFromHook,
    forceLocalBootstrapRef: forceLocalBootstrapRefFromHook,
  } = onboarding;

  const {
    onboardingRemoteConnecting,
    onboardingRemoteError,
    onboardingRemoteConnected,
    onboardingTelegramToken,
    onboardingDiscordToken,
    onboardingWhatsAppSessionPath,
    onboardingTwilioAccountSid,
    onboardingTwilioAuthToken,
    onboardingTwilioPhoneNumber,
    onboardingBlooioApiKey,
    onboardingBlooioPhoneNumber,
    onboardingGithubToken,
    setOnboardingName,
    setOnboardingOwnerName,
    setOnboardingStyle,
    setOnboardingServerTarget,
    setOnboardingCloudApiKey,
    setOnboardingSmallModel,
    setOnboardingLargeModel,
    setOnboardingProvider,
    setOnboardingApiKey,
    setOnboardingVoiceProvider,
    setOnboardingVoiceApiKey,
    setOnboardingExistingInstallDetected,
    setOnboardingRemoteApiBase,
    setOnboardingRemoteToken,
    setOnboardingRemoteConnecting,
    setOnboardingRemoteError,
    setOnboardingRemoteConnected,
    setOnboardingOpenRouterModel,
    setOnboardingPrimaryModel,
    setOnboardingTelegramToken,
    setOnboardingDiscordToken,
    setOnboardingWhatsAppSessionPath,
    setOnboardingTwilioAccountSid,
    setOnboardingTwilioAuthToken,
    setOnboardingTwilioPhoneNumber,
    setOnboardingBlooioApiKey,
    setOnboardingBlooioPhoneNumber,
    setOnboardingGithubToken,
    setOnboardingSubscriptionTab,
    setOnboardingElizaCloudTab,
    setOnboardingSelectedChains,
    setOnboardingRpcSelections,
    setOnboardingRpcKeys,
    setOnboardingAvatar,
    setPostOnboardingChecklistDismissed,
    setOnboardingDeferredTasks,
  } = useOnboardingCompat(onboarding);

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

  // ── Vincent state (extracted to useVincentState) ──────────────────
  const vincentHook = useVincentState({ setActionNotice, t });
  const {
    elizaCloudEnabled,
    setElizaCloudEnabled,
    elizaCloudVoiceProxyAvailable,
    setElizaCloudVoiceProxyAvailable,
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
    setOnboardingServerTarget,
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
    coordinatorResetRef,
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
    setOnboardingServerTarget,
    setOnboardingCloudApiKey,
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
        onboardingServerTarget: setOnboardingServerTarget,
        onboardingCloudApiKey: setOnboardingCloudApiKey,
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
        elizaCloudVoiceProxyAvailable: setElizaCloudVoiceProxyAvailable,
        cloudDashboardView: setCloudDashboardView,
        selectedVrmIndex: setSelectedVrmIndex,
        customVrmUrl: setCustomVrmUrl,
        customBackgroundUrl: setCustomBackgroundUrl,
        activePackId: setActivePackId,
        customWorldUrl: setCustomWorldUrl,
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
      setOnboardingServerTarget,
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
    setOnboardingServerTarget,
    setOnboardingCloudApiKey,
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
  coordinatorResetRef.current = startupCoordinator.reset;
  coordinatorOnboardingCompleteRef.current =
    startupCoordinator.onboardingComplete;

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
      customWorldUrl,
      uiTheme,
      tab,
      companionVrmPowerMode,
      companionHalfFramerateMode,
      companionAnimateWhenHidden,
    }),
    [
      selectedVrmIndex,
      customVrmUrl,
      customWorldUrl,
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
    characterData,
    characterLoading,
    characterSaving,
    characterSaveSuccess,
    characterSaveError,
    characterDraft,
    selectedVrmIndex,
    customVrmUrl,
    customBackgroundUrl,
    activePackId,
    customWorldUrl,
    elizaCloudEnabled,
    elizaCloudVoiceProxyAvailable,
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
    onboardingServerTarget,
    onboardingCloudApiKey,
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
    vincentConnected: vincentHook.vincentConnected,
    vincentLoginBusy: vincentHook.vincentLoginBusy,
    vincentLoginError: vincentHook.vincentLoginError,
    handleVincentLogin: vincentHook.handleVincentLogin,
    handleVincentDisconnect: vincentHook.handleVincentDisconnect,
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
