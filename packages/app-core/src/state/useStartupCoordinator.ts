/**
 * useStartupCoordinator — React hook that drives the StartupCoordinator
 * state machine with side effects.
 *
 * This hook is the SOLE startup authority. It:
 * 1. Uses useReducer with the coordinator's startupReducer
 * 2. Delegates per-phase work to phase modules (startup-phase-*.ts)
 * 3. Dispatches events as async operations complete
 * 4. Syncs coordinator state to the legacy lifecycle setters
 *
 * Architecture: Each phase is handled by a dedicated function imported from
 * a phase module. One-time hydration work runs in the "hydrating" effect.
 * Persistent WS bindings and navigation listeners are set up via bindReadyPhase
 * in a "ready" effect that only cleans up on unmount (not on phase transitions).
 */

import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  type AgentStartupDiagnostics,
  type AgentStatus,
  type CodingAgentSession,
  type Conversation,
  type ConversationMessage,
  type OnboardingOptions,
  type StreamEventEnvelope,
  client,
} from "../api";
import { scanProviderCredentials } from "../bridge";
import { mapServerTasksToSessions } from "../coding";
import type { WalletAddresses } from "@miladyai/agent/contracts/wallet";
import {
  type deriveOnboardingResumeConnection,
  type StartupErrorState,
} from "./internal";
import {
  loadPersistedConnectionMode,
  loadPersistedOnboardingComplete,
} from "./persistence";
import { resolveApiUrl } from "../utils";
import { COMPANION_ENABLED, type Tab } from "../navigation";
import {
  INITIAL_STARTUP_STATE,
  connectionModeToTarget,
  createDesktopPolicy,
  createWebPolicy,
  isStartupLoading,
  isStartupTerminal,
  startupReducer,
  toLegacyStartupPhase,
  type PlatformPolicy,
  type RuntimeTarget,
  type StartupEvent,
  type StartupState,
} from "./startup-coordinator";
import { isElectrobunRuntime } from "../bridge";
import type { UiLanguage } from "../i18n";
import type { OnboardingMode, OnboardingStep } from "./types";
import {
  runRestoringSession,
  type RestoringSessionCtx,
} from "./startup-phase-restore";
import { runPollingBackend } from "./startup-phase-poll";
import { runStartingRuntime } from "./startup-phase-runtime";
import { runHydrating, bindReadyPhase } from "./startup-phase-hydrate";

// ── Deps interface ──────────────────────────────────────────────────

export interface StartupCoordinatorDeps {
  setConnected: (v: boolean) => void;
  setAgentStatus: (v: AgentStatus | null) => void;
  setAgentStatusIfChanged: (v: AgentStatus) => void;
  setStartupPhase: (
    v: "starting-backend" | "initializing-agent" | "ready",
  ) => void;
  setStartupError: (v: StartupErrorState | null) => void;
  setAuthRequired: (v: boolean) => void;
  setOnboardingComplete: (v: boolean) => void;
  setOnboardingLoading: (v: boolean) => void;
  setPendingRestart: (v: boolean | ((prev: boolean) => boolean)) => void;
  setPendingRestartReasons: (
    v: string[] | ((prev: string[]) => string[]),
  ) => void;
  setSystemWarnings: (v: string[] | ((prev: string[]) => string[])) => void;
  showRestartBanner: () => void;
  setPairingEnabled: (v: boolean) => void;
  setPairingExpiresAt: (v: number | null) => void;
  setOnboardingOptions: (v: OnboardingOptions) => void;
  setOnboardingExistingInstallDetected: (v: boolean) => void;
  setOnboardingStep: (v: OnboardingStep) => void;
  setOnboardingRunMode: (v: "local" | "cloud" | "") => void;
  setOnboardingCloudProvider: (v: string) => void;
  setOnboardingCloudApiKey: (v: string) => void;
  setOnboardingProvider: (v: string) => void;
  setOnboardingVoiceProvider: (v: string) => void;
  setOnboardingApiKey: (v: string) => void;
  setOnboardingPrimaryModel: (v: string) => void;
  setOnboardingOpenRouterModel: (v: string) => void;
  setOnboardingRemoteConnected: (v: boolean) => void;
  setOnboardingRemoteApiBase: (v: string) => void;
  setOnboardingRemoteToken: (v: string) => void;
  setOnboardingSmallModel: (v: string) => void;
  setOnboardingLargeModel: (v: string) => void;
  applyDetectedProviders: (
    detected: Awaited<ReturnType<typeof scanProviderCredentials>>,
  ) => void;
  hydrateInitialConversationState: () => Promise<string | null>;
  loadWorkbench: () => Promise<void>;
  loadPlugins: () => Promise<void>;
  loadSkills: () => Promise<void>;
  loadCharacter: () => Promise<void>;
  loadWalletConfig: () => Promise<void>;
  loadInventory: () => Promise<void>;
  loadUpdateStatus: (force?: boolean) => Promise<void>;
  checkExtensionStatus: () => Promise<void>;
  pollCloudCredits: () => void;
  fetchAutonomyReplay: () => Promise<void>;
  appendAutonomousEvent: (event: StreamEventEnvelope) => void;
  notifyHeartbeatEvent: (event: StreamEventEnvelope) => void;
  setSelectedVrmIndex: (v: number) => void;
  setCustomVrmUrl: (v: string) => void;
  setCustomBackgroundUrl: (v: string) => void;
  setWalletAddresses: (v: WalletAddresses) => void;
  setPtySessions: (
    v:
      | CodingAgentSession[]
      | ((prev: CodingAgentSession[]) => CodingAgentSession[]),
  ) => void;
  setTab: (t: Tab) => void;
  setTabRaw: (t: Tab) => void;
  setConversationMessages: (
    v:
      | ConversationMessage[]
      | ((prev: ConversationMessage[]) => ConversationMessage[]),
  ) => void;
  setUnreadConversations: (
    v: Set<string> | ((prev: Set<string>) => Set<string>),
  ) => void;
  setConversations: (
    v: Conversation[] | ((prev: Conversation[]) => Conversation[]),
  ) => void;
  requestGreetingWhenRunningRef: React.RefObject<
    (convId: string) => Promise<void>
  >;
  onboardingResumeConnectionRef: React.MutableRefObject<ReturnType<
    typeof deriveOnboardingResumeConnection
  > | null>;
  onboardingCompletionCommittedRef: React.MutableRefObject<boolean>;
  forceLocalBootstrapRef: React.MutableRefObject<boolean>;
  initialTabSetRef: React.MutableRefObject<boolean>;
  activeConversationIdRef: React.RefObject<string | null>;
  elizaCloudPollInterval: React.MutableRefObject<number | null>;
  elizaCloudLoginPollTimer: React.MutableRefObject<number | null>;
  uiLanguage: UiLanguage;
  onboardingMode: OnboardingMode;
}

// ── Handle ──────────────────────────────────────────────────────────

export interface StartupCoordinatorHandle {
  state: StartupState;
  dispatch: (event: StartupEvent) => void;
  retry: () => void;
  pairingSuccess: () => void;
  onboardingComplete: () => void;
  policy: PlatformPolicy;
  legacyPhase: "starting-backend" | "initializing-agent" | "ready";
  loading: boolean;
  terminal: boolean;
  target: RuntimeTarget | null;
  phase: StartupState["phase"];
}

function detectPlatformPolicy(): PlatformPolicy {
  if (isElectrobunRuntime()) return createDesktopPolicy();
  return createWebPolicy();
}

// ── Hook ────────────────────────────────────────────────────────────

export function useStartupCoordinator(
  deps?: StartupCoordinatorDeps,
): StartupCoordinatorHandle {
  const [state, dispatch] = useReducer(startupReducer, INITIAL_STARTUP_STATE);
  const policy = useRef(detectPlatformPolicy()).current;
  const effectRunRef = useRef(0);

  // Deps ref — effects always access latest deps without re-triggering
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const depsReady = deps != null;

  // Session context carried between restoring-session and polling-backend
  const _ctx = useRef<RestoringSessionCtx | null>(null);

  // Track whether the ready-phase WS bindings have been set up
  const wsBindingsActiveRef = useRef(false);

  // ── Phase: splash — auto-skip for returning users, mark loaded for new users
  useEffect(() => {
    if (state.phase !== "splash") return;
    if (!depsReady) return;

    if (loadPersistedOnboardingComplete()) {
      dispatch({ type: "SPLASH_CONTINUE" });
      return;
    }
    dispatch({ type: "SPLASH_LOADED" });
  }, [state.phase, depsReady]);

  // ── Phase: restoring-session ────────────────────────────────────
  useEffect(() => {
    if (state.phase !== "restoring-session" || !depsReady) return;
    const d = depsRef.current!;
    effectRunRef.current += 1;
    const cancelled = { current: false };

    runRestoringSession(d, dispatch, _ctx, cancelled).catch((err) => {
      console.error("[milady][startup:restore] Unexpected error:", err);
    });

    return () => {
      cancelled.current = true;
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: deps via ref
  }, [state.phase, depsReady]);

  // ── Phase: resolving-target (auto-advance) ──────────────────────
  useEffect(() => {
    if (state.phase !== "resolving-target") return;
    dispatch({ type: "BACKEND_POLL_RETRY" });
  }, [state.phase]);

  // ── Phase: polling-backend ──────────────────────────────────────
  useEffect(() => {
    if (state.phase !== "polling-backend" || !depsReady) return;
    effectRunRef.current += 1;
    const runId = effectRunRef.current;
    const cancelled = { current: false };
    const tidRef = { current: null as ReturnType<typeof setTimeout> | null };

    runPollingBackend(
      depsRef.current!,
      dispatch,
      policy,
      _ctx.current,
      runId,
      effectRunRef,
      cancelled,
      tidRef,
    ).catch((err) => {
      console.error("[milady][startup:poll] Unexpected error:", err);
    });

    return () => {
      cancelled.current = true;
      if (tidRef.current) clearTimeout(tidRef.current);
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: deps via ref
  }, [state.phase, policy.backendTimeoutMs, depsReady]);

  // ── Phase: starting-runtime ─────────────────────────────────────
  useEffect(() => {
    if (state.phase !== "starting-runtime" || !depsReady) return;
    effectRunRef.current += 1;
    const runId = effectRunRef.current;
    const cancelled = { current: false };
    const tidRef = { current: null as ReturnType<typeof setTimeout> | null };

    runStartingRuntime(
      depsRef.current!,
      dispatch,
      runId,
      effectRunRef,
      cancelled,
      tidRef,
    ).catch((err) => {
      console.error("[milady][startup:runtime] Unexpected error:", err);
    });

    return () => {
      cancelled.current = true;
      if (tidRef.current) clearTimeout(tidRef.current);
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: deps via ref
  }, [state.phase, depsReady]);

  // ── Phase: hydrating — one-time data load, then HYDRATION_COMPLETE ─
  useEffect(() => {
    if (state.phase !== "hydrating" || !depsReady) return;
    const cancelled = { current: false };

    runHydrating(depsRef.current!, dispatch, cancelled).catch((err) => {
      console.error("[milady][startup:hydrate] Unexpected error:", err);
    });

    return () => {
      cancelled.current = true;
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: deps via ref
  }, [state.phase, depsReady]);

  // ── Ready phase — persistent WS bindings + nav listener ─────────
  // This effect runs once when the coordinator reaches "ready" and stays
  // active until the component unmounts. It does NOT depend on state.phase
  // after the guard, so phase transitions won't clean up WS bindings.
  const readyPhaseReached = state.phase === "ready";

  useEffect(() => {
    if (!readyPhaseReached || !depsReady) return;
    if (wsBindingsActiveRef.current) return; // Already bound
    wsBindingsActiveRef.current = true;

    const cleanup = bindReadyPhase(
      depsRef as React.MutableRefObject<StartupCoordinatorDeps | undefined>,
    );

    return () => {
      wsBindingsActiveRef.current = false;
      cleanup();
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: runs once on ready, deps via ref
  }, [readyPhaseReached, depsReady]);

  // ── Public interface ─────────────────────────────────────────────

  const retry = useCallback(() => dispatch({ type: "RETRY" }), []);
  const pairingSuccess = useCallback(
    () => dispatch({ type: "PAIRING_SUCCESS" }),
    [],
  );
  const onboardingCompleteFn = useCallback(
    () => dispatch({ type: "ONBOARDING_COMPLETE" }),
    [],
  );

  let target: RuntimeTarget | null = null;
  if (state.phase === "resolving-target") target = state.target;
  else if (state.phase === "polling-backend") target = state.target;

  return {
    state,
    dispatch,
    retry,
    pairingSuccess,
    onboardingComplete: onboardingCompleteFn,
    policy,
    legacyPhase: toLegacyStartupPhase(state),
    loading: isStartupLoading(state),
    terminal: isStartupTerminal(state),
    target,
    phase: state.phase,
  };
}
