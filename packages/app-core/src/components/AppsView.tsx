/**
 * Apps View — browse and launch agent games/experiences.
 *
 * Fetches apps from the registry API and shows them as cards.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { client, type RegistryAppInfo } from "../api";
import { useApp } from "../state";
import { openExternalUrl } from "../utils";
import { AppDetailPane } from "./apps/AppDetailPane";
import { AppsCatalogGrid } from "./apps/AppsCatalogGrid";
import {
  DEFAULT_VIEWER_SANDBOX,
  shouldShowAppInAppsView,
} from "./apps/helpers";

export { shouldShowAppInAppsView } from "./apps/helpers";

function AppsEmptyState() {
  return (
    <div className="flex h-full min-h-[18rem] flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-border/40 bg-card/72 px-6 py-12 text-center">
      <span className="mb-4 text-4xl opacity-40">📱</span>
      <span className="text-[13px] font-medium text-muted">
        Select an app to view details
      </span>
      <span className="mt-2 max-w-[16rem] text-[11px] leading-5 text-muted-strong">
        Browse the catalog, inspect launch details, and resume active sessions
        from one place.
      </span>
    </div>
  );
}

export function AppsView() {
  const {
    activeGameApp,
    activeGameDisplayName,
    activeGameViewerUrl,
    setState,
    setActionNotice,
  } = useApp();
  const [apps, setApps] = useState<RegistryAppInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [activeAppNames, setActiveAppNames] = useState<Set<string>>(new Set());
  const [selectedAppName, setSelectedAppName] = useState<string | null>(null);
  const [busyApp, setBusyApp] = useState<string | null>(null);
  const currentGameViewerUrl =
    typeof activeGameViewerUrl === "string" ? activeGameViewerUrl : "";
  const hasCurrentGame = currentGameViewerUrl.trim().length > 0;

  const selectedApp = useMemo(
    () => apps.find((app) => app.name === selectedAppName) ?? null,
    [apps, selectedAppName],
  );

  const selectedAppHasActiveViewer =
    !!selectedApp && hasCurrentGame && activeGameApp === selectedApp.name;
  const selectedAppIsActive =
    !!selectedApp && activeAppNames.has(selectedApp.name);

  const loadApps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, installed] = await Promise.all([
        client.listApps(),
        client.listInstalledApps().catch((err: unknown) => {
          console.warn("[AppsView] Failed to list installed apps:", err);
          return [];
        }),
      ]);
      setApps(list);
      setActiveAppNames(new Set(installed.map((app) => app.name)));
      setSelectedAppName((current) => {
        if (!current) return list[0]?.name ?? null;
        return list.some((app) => app.name === current)
          ? current
          : (list[0]?.name ?? null);
      });
    } catch (err) {
      setError(
        `Failed to load apps: ${err instanceof Error ? err.message : "network error"}`,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const clearActiveGameState = useCallback(() => {
    setState("activeGameApp", "");
    setState("activeGameDisplayName", "");
    setState("activeGameViewerUrl", "");
    setState("activeGameSandbox", DEFAULT_VIEWER_SANDBOX);
    setState("activeGamePostMessageAuth", false);
    setState("activeGamePostMessagePayload", null);
  }, [setState]);

  useEffect(() => {
    void loadApps();
  }, [loadApps]);

  const handleLaunch = useCallback(
    async (app: RegistryAppInfo) => {
      setBusyApp(app.name);
      try {
        const result = await client.launchApp(app.name);
        setActiveAppNames((previous) => {
          const next = new Set(previous);
          next.add(app.name);
          return next;
        });
        if (result.viewer?.url) {
          setState("activeGameApp", app.name);
          setState("activeGameDisplayName", app.displayName ?? app.name);
          setState("activeGameViewerUrl", result.viewer.url);
          setState(
            "activeGameSandbox",
            result.viewer.sandbox ?? DEFAULT_VIEWER_SANDBOX,
          );
          setState(
            "activeGamePostMessageAuth",
            Boolean(result.viewer.postMessageAuth),
          );
          setState(
            "activeGamePostMessagePayload",
            result.viewer.authMessage ?? null,
          );
          if (result.viewer.postMessageAuth && !result.viewer.authMessage) {
            setActionNotice(
              `${app.displayName ?? app.name} requires iframe auth, but no auth payload is configured.`,
              "error",
              4800,
            );
          }
          setState("tab", "apps");
          setState("appsSubTab", "games");
          return;
        }
        clearActiveGameState();
        const targetUrl = result.launchUrl ?? app.launchUrl;
        if (targetUrl) {
          try {
            await openExternalUrl(targetUrl);
            setActionNotice(
              `${app.displayName ?? app.name} opened in a new tab.`,
              "success",
              2600,
            );
          } catch {
            setActionNotice(
              `Popup blocked while opening ${app.displayName ?? app.name}. Allow popups and try again.`,
              "error",
              4200,
            );
          }
          return;
        }
        setActionNotice(
          `${app.displayName ?? app.name} launched, but no viewer or URL is configured.`,
          "error",
          4000,
        );
      } catch (err) {
        setActionNotice(
          `Failed to launch ${app.displayName ?? app.name}: ${err instanceof Error ? err.message : "error"}`,
          "error",
          4000,
        );
      } finally {
        setBusyApp(null);
      }
    },
    [clearActiveGameState, setActionNotice, setState],
  );

  const handleOpenCurrentGame = useCallback(() => {
    if (!hasCurrentGame) return;
    setState("tab", "apps");
    setState("appsSubTab", "games");
  }, [hasCurrentGame, setState]);

  const handleOpenCurrentGameInNewTab = useCallback(async () => {
    if (!hasCurrentGame) return;
    try {
      await openExternalUrl(currentGameViewerUrl);
      setActionNotice("Current game opened in a new tab.", "success", 2600);
    } catch {
      setActionNotice(
        "Popup blocked. Allow popups and try again.",
        "error",
        4200,
      );
    }
  }, [currentGameViewerUrl, hasCurrentGame, setActionNotice]);

  const visibleApps = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    return apps.filter((app) => {
      if (!shouldShowAppInAppsView(app)) {
        return false;
      }
      if (
        normalizedSearch &&
        !app.name.toLowerCase().includes(normalizedSearch) &&
        !(app.displayName ?? "").toLowerCase().includes(normalizedSearch) &&
        !(app.description ?? "").toLowerCase().includes(normalizedSearch)
      ) {
        return false;
      }
      if (showActiveOnly && !activeAppNames.has(app.name)) {
        return false;
      }
      return true;
    });
  }, [activeAppNames, apps, searchQuery, showActiveOnly]);

  return (
    <div className="device-layout mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-4 lg:px-6">
      <div className="phone-frame overflow-hidden rounded-[2rem] border border-border/40 bg-card/86 shadow-[0_20px_60px_rgba(0,0,0,0.16)] backdrop-blur-xl">
        <div className="phone-status-bar flex items-center justify-between border-b border-border/40 px-5 py-3 text-[12px] text-muted-strong">
          <span className="font-semibold">9:41</span>
          <span className="opacity-50">📶 🔋</span>
        </div>

        <div className="phone-content grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,23rem)] lg:p-5">
          <div
            className={`phone-grid-when-detail ${selectedApp ? "order-2 lg:order-1" : "order-1"}`}
          >
            <AppsCatalogGrid
              activeAppNames={activeAppNames}
              activeGameDisplayName={activeGameDisplayName}
              error={error}
              hasCurrentGame={hasCurrentGame}
              loading={loading}
              searchQuery={searchQuery}
              selectedAppName={selectedAppName}
              showActiveOnly={showActiveOnly}
              visibleApps={visibleApps}
              onOpenCurrentGame={handleOpenCurrentGame}
              onRefresh={() => void loadApps()}
              onSearchQueryChange={setSearchQuery}
              onSelectApp={setSelectedAppName}
              onToggleActiveOnly={() =>
                setShowActiveOnly((current) => !current)
              }
            />
          </div>

          <div className="order-1 rounded-[1.5rem] border border-border/40 bg-bg/45 p-4 shadow-inner lg:order-2">
            {selectedApp ? (
              <AppDetailPane
                app={selectedApp}
                compact
                busy={busyApp === selectedApp.name}
                hasActiveViewer={selectedAppHasActiveViewer}
                isActive={selectedAppIsActive}
                onBack={() => setSelectedAppName(null)}
                onLaunch={() => void handleLaunch(selectedApp)}
                onOpenCurrentGame={handleOpenCurrentGame}
                onOpenCurrentGameInNewTab={() =>
                  void handleOpenCurrentGameInNewTab()
                }
              />
            ) : (
              <AppsEmptyState />
            )}
          </div>
        </div>

        <div className="phone-home-indicator h-1.5 w-28 rounded-full bg-border/60 mx-auto mb-3" />
      </div>

      <div className="pad-frame overflow-hidden rounded-[2rem] border border-border/40 bg-card/86 shadow-[0_20px_60px_rgba(0,0,0,0.16)] backdrop-blur-xl">
        <div className="phone-status-bar flex items-center justify-between border-b border-border/40 px-5 py-3 text-[12px] text-muted-strong">
          <span className="font-semibold">9:41</span>
          <span className="opacity-50">📶 🔋</span>
        </div>

        <div className="phone-content p-5">
          {selectedApp ? (
            <AppDetailPane
              app={selectedApp}
              busy={busyApp === selectedApp.name}
              hasActiveViewer={selectedAppHasActiveViewer}
              isActive={selectedAppIsActive}
              onBack={() => setSelectedAppName(null)}
              onLaunch={() => void handleLaunch(selectedApp)}
              onOpenCurrentGame={handleOpenCurrentGame}
              onOpenCurrentGameInNewTab={() =>
                void handleOpenCurrentGameInNewTab()
              }
            />
          ) : (
            <AppsEmptyState />
          )}
        </div>

        <div className="phone-home-indicator h-1.5 w-28 rounded-full bg-border/60 mx-auto mb-3" />
      </div>
    </div>
  );
}
