/**
 * Lifecycle context — extracted from AppContext.
 *
 * Owns agent connection status, startup phase, onboarding completion,
 * restart state, backend connection, action notices, and system warnings.
 *
 * The derived `startupStatus` is computed here so consumers can check
 * a single field instead of combining multiple state variables.
 *
 * Phase 1: State + setters. Complex lifecycle callbacks (handleStart,
 * handleStop, handleRestart) remain in AppContext for now.
 */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AgentStatus } from "../api";
import {
  loadPersistedOnboardingComplete,
  savePersistedOnboardingComplete,
} from "./persistence";
import type {
  ActionNotice,
  AppState,
  LifecycleAction,
  StartupErrorState,
  StartupPhase,
} from "./types";

// ── Types ───────────────────────────────────────────────────────────

export interface LifecycleContextValue {
  // State
  connected: boolean;
  agentStatus: AgentStatus | null;
  onboardingComplete: boolean;
  onboardingUiRevealNonce: number;
  onboardingLoading: boolean;
  startupPhase: StartupPhase;
  startupStatus: AppState["startupStatus"];
  startupError: StartupErrorState | null;
  startupRetryNonce: number;
  authRequired: boolean;
  actionNotice: ActionNotice | null;
  lifecycleBusy: boolean;
  lifecycleAction: LifecycleAction | null;
  pendingRestart: boolean;
  pendingRestartReasons: string[];
  restartBannerDismissed: boolean;
  backendConnection: AppState["backendConnection"];
  backendDisconnectedBannerDismissed: boolean;
  systemWarnings: string[];

  // Setters
  setConnected: (v: boolean) => void;
  setAgentStatus: (v: AgentStatus | null) => void;
  setOnboardingComplete: (v: boolean) => void;
  setOnboardingUiRevealNonce: React.Dispatch<React.SetStateAction<number>>;
  setOnboardingLoading: (v: boolean) => void;
  setStartupPhase: (v: StartupPhase) => void;
  setStartupError: (v: StartupErrorState | null) => void;
  setStartupRetryNonce: React.Dispatch<React.SetStateAction<number>>;
  setAuthRequired: (v: boolean) => void;
  setActionNotice: (
    text: string,
    tone?: "info" | "success" | "error",
    ttlMs?: number,
  ) => void;
  setLifecycleBusy: (v: boolean) => void;
  setLifecycleAction: (v: LifecycleAction | null) => void;
  setPendingRestart: (v: boolean) => void;
  setPendingRestartReasons: React.Dispatch<React.SetStateAction<string[]>>;
  setRestartBannerDismissed: (v: boolean) => void;
  setBackendConnection: React.Dispatch<
    React.SetStateAction<AppState["backendConnection"]>
  >;
  setBackendDisconnectedBannerDismissed: (v: boolean) => void;
  setSystemWarnings: React.Dispatch<React.SetStateAction<string[]>>;

  // Refs
  agentStatusRef: React.RefObject<AgentStatus | null>;
}

const LifecycleCtx = createContext<LifecycleContextValue | null>(null);

// ── Provider ────────────────────────────────────────────────────────

export function LifecycleProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [agentStatus, setAgentStatusRaw] = useState<AgentStatus | null>(null);
  const agentStatusRef = useRef<AgentStatus | null>(null);
  const [onboardingComplete, _setOnboardingCompleteRaw] = useState(
    loadPersistedOnboardingComplete,
  );
  const [onboardingUiRevealNonce, setOnboardingUiRevealNonce] = useState(0);
  const [onboardingLoading, setOnboardingLoading] = useState(true);
  const [startupPhase, setStartupPhase] =
    useState<StartupPhase>("starting-backend");
  const [startupError, setStartupError] = useState<StartupErrorState | null>(
    null,
  );
  const [startupRetryNonce, setStartupRetryNonce] = useState(0);
  const [authRequired, setAuthRequired] = useState(false);
  const [actionNoticeState, setActionNoticeState] =
    useState<ActionNotice | null>(null);
  const actionNoticeTimer = useRef<number | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleAction, setLifecycleAction] =
    useState<LifecycleAction | null>(null);
  const [pendingRestart, setPendingRestart] = useState(false);
  const [pendingRestartReasons, setPendingRestartReasons] = useState<string[]>(
    [],
  );
  const [restartBannerDismissed, setRestartBannerDismissed] = useState(false);
  const [backendConnection, setBackendConnection] = useState<
    AppState["backendConnection"]
  >({
    state: "disconnected",
    reconnectAttempt: 0,
    maxReconnectAttempts: 15,
    showDisconnectedUI: false,
  });
  const [
    backendDisconnectedBannerDismissed,
    setBackendDisconnectedBannerDismissed,
  ] = useState(false);
  const [systemWarnings, setSystemWarnings] = useState<string[]>([]);

  const setAgentStatus = useCallback((v: AgentStatus | null) => {
    agentStatusRef.current = v;
    setAgentStatusRaw(v);
  }, []);

  const setOnboardingComplete = useCallback((value: boolean) => {
    _setOnboardingCompleteRaw(value);
    savePersistedOnboardingComplete(value);
  }, []);

  const setActionNotice = useCallback(
    (
      text: string,
      tone: "info" | "success" | "error" = "info",
      ttlMs = 2800,
    ) => {
      setActionNoticeState({ tone, text });
      if (actionNoticeTimer.current != null) {
        window.clearTimeout(actionNoticeTimer.current);
      }
      actionNoticeTimer.current = window.setTimeout(() => {
        setActionNoticeState(null);
        actionNoticeTimer.current = null;
      }, ttlMs);
    },
    [],
  );

  // Clean up timer on unmount
  // biome-ignore lint/correctness/useExhaustiveDependencies: cleanup only
  useEffect(() => {
    return () => {
      if (actionNoticeTimer.current != null) {
        window.clearTimeout(actionNoticeTimer.current);
      }
    };
  }, []);

  // Derived
  const startupStatus = useMemo<AppState["startupStatus"]>(() => {
    if (startupError) return "recoverable-error";
    if (authRequired) return "auth-blocked";
    if (onboardingLoading || startupPhase !== "ready") return "loading";
    if (!onboardingComplete) return "onboarding";
    return "ready";
  }, [
    authRequired,
    onboardingComplete,
    onboardingLoading,
    startupError,
    startupPhase,
  ]);

  const value = useMemo<LifecycleContextValue>(
    () => ({
      connected,
      agentStatus,
      onboardingComplete,
      onboardingUiRevealNonce,
      onboardingLoading,
      startupPhase,
      startupStatus,
      startupError,
      startupRetryNonce,
      authRequired,
      actionNotice: actionNoticeState,
      lifecycleBusy,
      lifecycleAction,
      pendingRestart,
      pendingRestartReasons,
      restartBannerDismissed,
      backendConnection,
      backendDisconnectedBannerDismissed,
      systemWarnings,
      setConnected,
      setAgentStatus,
      setOnboardingComplete,
      setOnboardingUiRevealNonce,
      setOnboardingLoading,
      setStartupPhase,
      setStartupError,
      setStartupRetryNonce,
      setAuthRequired,
      setActionNotice,
      setLifecycleBusy,
      setLifecycleAction,
      setPendingRestart,
      setPendingRestartReasons,
      setRestartBannerDismissed,
      setBackendConnection,
      setBackendDisconnectedBannerDismissed,
      setSystemWarnings,
      agentStatusRef,
    }),
    [
      connected,
      agentStatus,
      onboardingComplete,
      onboardingUiRevealNonce,
      onboardingLoading,
      startupPhase,
      startupStatus,
      startupError,
      startupRetryNonce,
      authRequired,
      actionNoticeState,
      lifecycleBusy,
      lifecycleAction,
      pendingRestart,
      pendingRestartReasons,
      restartBannerDismissed,
      backendConnection,
      backendDisconnectedBannerDismissed,
      systemWarnings,
      setAgentStatus,
      setOnboardingComplete,
      setActionNotice,
    ],
  );

  return (
    <LifecycleCtx.Provider value={value}>
      {children}
    </LifecycleCtx.Provider>
  );
}

// ── Hook ────────────────────────────────────────────────────────────

export function useLifecycle(): LifecycleContextValue {
  const ctx = useContext(LifecycleCtx);
  if (ctx) return ctx;
  if (typeof process !== "undefined" && process.env.NODE_ENV === "test") {
    return new Proxy({} as LifecycleContextValue, {
      get(_, prop) {
        if (prop === "startupStatus") return "ready";
        if (prop === "startupPhase") return "ready";
        if (prop === "systemWarnings") return [];
        if (prop === "pendingRestartReasons") return [];
        if (prop === "agentStatusRef") return { current: null };
        return typeof prop === "string" && prop.startsWith("set")
          ? () => {}
          : null;
      },
    });
  }
  throw new Error(
    "useLifecycle must be used within LifecycleProvider or AppProvider",
  );
}
