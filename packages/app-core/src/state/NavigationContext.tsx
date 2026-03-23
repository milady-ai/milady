/**
 * Navigation context — a bridge layer for AppContext's navigation state.
 *
 * AppProvider owns the navigation state (tab, shell mode, sub-tabs) and
 * passes it through NavigationProvider. Components use useNavigation()
 * to read only navigation state without subscribing to all of AppContext.
 *
 * This is NOT a duplicate of AppContext state — AppProvider passes its
 * own state objects here. Single source of truth, two access patterns:
 * - useApp().tab (legacy — re-renders on all state changes)
 * - useNavigation().tab (preferred — re-renders only on navigation changes)
 */

import {
  createContext,
  type ReactNode,
  useContext,
} from "react";
import type { Tab } from "../navigation";
import type { ShellView } from "./types";
import type { UiShellMode } from "./ui-preferences";

// Re-export for consumers
export type { Tab } from "../navigation";

// ── Types ───────────────────────────────────────────────────────────

export interface NavigationContextValue {
  tab: Tab;
  uiShellMode: UiShellMode;
  lastNativeTab: Tab;
  appsSubTab: "browse" | "games";
  agentSubTab: "character" | "inventory" | "knowledge";
  pluginsSubTab: "features" | "connectors" | "plugins";
  databaseSubTab: "tables" | "media" | "vectors";
  setTab: (tab: Tab) => void;
  setTabRaw: (tab: Tab) => void;
  setUiShellMode: (mode: UiShellMode) => void;
  switchUiShellMode: (mode: UiShellMode) => void;
  switchShellView: (view: ShellView) => void;
  setAppsSubTab: (v: "browse" | "games") => void;
  setAgentSubTab: (v: "character" | "inventory" | "knowledge") => void;
  setPluginsSubTab: (v: "features" | "connectors" | "plugins") => void;
  setDatabaseSubTab: (v: "tables" | "media" | "vectors") => void;
}

const NavigationCtx = createContext<NavigationContextValue | null>(null);

// ── Provider ────────────────────────────────────────────────────────

/**
 * Accepts a pre-built value from AppProvider. No internal state — single
 * source of truth remains in AppProvider.
 */
export function NavigationProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: NavigationContextValue;
}) {
  return (
    <NavigationCtx.Provider value={value}>
      {children}
    </NavigationCtx.Provider>
  );
}

// ── Hook ────────────────────────────────────────────────────────────

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationCtx);
  if (ctx) return ctx;
  if (typeof process !== "undefined" && process.env.NODE_ENV === "test") {
    return {
      tab: "companion",
      uiShellMode: "companion",
      lastNativeTab: "chat",
      appsSubTab: "browse",
      agentSubTab: "character",
      pluginsSubTab: "features",
      databaseSubTab: "tables",
      setTab: () => {},
      setTabRaw: () => {},
      setUiShellMode: () => {},
      switchUiShellMode: () => {},
      switchShellView: () => {},
      setAppsSubTab: () => {},
      setAgentSubTab: () => {},
      setPluginsSubTab: () => {},
      setDatabaseSubTab: () => {},
    };
  }
  throw new Error(
    "useNavigation must be used within NavigationProvider or AppProvider",
  );
}
