/**
 * Navigation context — extracted from AppContext.
 *
 * Owns tab, shell mode, sub-tabs, and navigation actions.
 * Almost every component reads `tab` or `uiShellMode` — isolating
 * these prevents the entire tree from re-rendering on unrelated
 * state changes (e.g. chat keystrokes, plugin saves).
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
import { type Tab, pathForTab } from "../navigation";
import {
  deriveUiShellModeForTab,
  getTabForShellView,
} from "./shell-routing";
import type { ShellView } from "./types";
import type { UiShellMode } from "./ui-preferences";
import {
  loadLastNativeTab,
  normalizeUiShellMode,
  saveLastNativeTab,
} from "./internal";

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

const COMPANION_ENABLED = true;

export function NavigationProvider({
  children,
  activeGameViewerUrl = "",
}: {
  children: ReactNode;
  activeGameViewerUrl?: string;
}) {
  const [lastNativeTab, setLastNativeTabState] =
    useState<Tab>(loadLastNativeTab);
  const [tab, _setTabRawInner] = useState<Tab>(
    COMPANION_ENABLED ? "companion" : "chat",
  );
  const setTabRaw = useCallback((t: Tab) => {
    _setTabRawInner(t);
  }, []);

  const uiShellMode = deriveUiShellModeForTab(tab);

  // Sub-tabs
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

  // Remember last native tab for shell switching
  useEffect(() => {
    const shouldRemember =
      tab !== "companion" && tab !== "character" && tab !== "character-select";
    if (!shouldRemember) return;
    setLastNativeTabState((prev) => {
      if (prev === tab) return prev;
      saveLastNativeTab(tab);
      return tab;
    });
  }, [tab]);

  const setTab = useCallback(
    (newTab: Tab) => {
      setTabRaw(newTab);
      if (newTab === "apps") {
        setAppsSubTab(activeGameViewerUrl.trim() ? "games" : "browse");
      }
      const path = pathForTab(newTab);
      try {
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

  const switchUiShellMode = useCallback(
    (mode: UiShellMode) => {
      const nextMode = normalizeUiShellMode(mode);
      if (nextMode === uiShellMode) return;
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
      setTab(nextTab);
    },
    [lastNativeTab, setTab],
  );

  const value = useMemo<NavigationContextValue>(
    () => ({
      tab,
      uiShellMode,
      lastNativeTab,
      appsSubTab,
      agentSubTab,
      pluginsSubTab,
      databaseSubTab,
      setTab,
      setTabRaw,
      setUiShellMode,
      switchUiShellMode,
      switchShellView,
      setAppsSubTab,
      setAgentSubTab,
      setPluginsSubTab,
      setDatabaseSubTab,
    }),
    [
      tab,
      uiShellMode,
      lastNativeTab,
      appsSubTab,
      agentSubTab,
      pluginsSubTab,
      databaseSubTab,
      setTab,
      setTabRaw,
      setUiShellMode,
      switchUiShellMode,
      switchShellView,
    ],
  );

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
