/**
 * Lifecycle context — a bridge layer for AppContext's lifecycle state.
 *
 * AppProvider owns the lifecycle state (agent status, startup phase,
 * connection, restart, action notices, system warnings) and passes it
 * through LifecycleProvider. Components use useLifecycle() to read
 * only lifecycle state without subscribing to all of AppContext.
 *
 * Single source of truth — AppProvider passes its own state objects
 * here. No duplicate state.
 */

import { createContext, type ReactNode, useContext } from "react";
import type { AgentStatus } from "../api";
import type {
  ActionNotice,
  AppState,
  LifecycleAction,
  StartupErrorState,
  StartupPhase,
} from "./types";

// ── Types ───────────────────────────────────────────────────────────

export interface LifecycleContextValue {
  connected: boolean;
  agentStatus: AgentStatus | null;
  onboardingComplete: boolean;
  onboardingLoading: boolean;
  startupPhase: StartupPhase;
  startupStatus: AppState["startupStatus"];
  startupError: StartupErrorState | null;
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
}

const LifecycleCtx = createContext<LifecycleContextValue | null>(null);

// ── Provider ────────────────────────────────────────────────────────

/**
 * Accepts a pre-built value from AppProvider. No internal state — single
 * source of truth remains in AppProvider.
 */
export function LifecycleProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: LifecycleContextValue;
}) {
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
    return {
      connected: false,
      agentStatus: null,
      onboardingComplete: false,
      onboardingLoading: false,
      startupPhase: "ready" as StartupPhase,
      startupStatus: "ready" as AppState["startupStatus"],
      startupError: null,
      authRequired: false,
      actionNotice: null,
      lifecycleBusy: false,
      lifecycleAction: null,
      pendingRestart: false,
      pendingRestartReasons: [],
      restartBannerDismissed: false,
      backendConnection: {
        state: "disconnected" as const,
        reconnectAttempt: 0,
        maxReconnectAttempts: 15,
        showDisconnectedUI: false,
      },
      backendDisconnectedBannerDismissed: false,
      systemWarnings: [],
    };
  }
  throw new Error(
    "useLifecycle must be used within LifecycleProvider or AppProvider",
  );
}
