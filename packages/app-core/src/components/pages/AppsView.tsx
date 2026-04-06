/**
 * Apps View — browse and launch agent games/experiences.
 *
 * Fetches apps from the registry API and shows them as cards.
 */

import { PagePanel } from "@miladyai/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type AppRunSummary, client, type RegistryAppInfo } from "../../api";
import { useApp } from "../../state";
import { openExternalUrl } from "../../utils";
import { AppDetailPane } from "../apps/AppDetailPane";
import { AppsCatalogGrid } from "../apps/AppsCatalogGrid";
import {
  filterAppsForCatalog,
  getDefaultAppsCatalogSelection,
  shouldShowAppInAppsView,
} from "../apps/helpers";
import {
  getRunAttentionReasons,
  RunningAppsPanel,
} from "../apps/RunningAppsPanel";
import { LifeOpsWorkspaceView } from "./LifeOpsWorkspaceView";

export { shouldShowAppInAppsView } from "../apps/helpers";

function AppsEmptyState() {
  const { t } = useApp();

  return (
    <PagePanel.Empty
      description={t("appsview.EmptyStateDescription")}
      title={t("appsview.EmptyStateTitle")}
    />
  );
}

export function AppsView() {
  const {
    appRuns,
    activeGameRunId,
    activeGameDisplayName,
    activeGameViewerUrl,
    appsSubTab,
    setState,
    setActionNotice,
    t,
  } = useApp();
  const [apps, setApps] = useState<RegistryAppInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [selectedAppName, setSelectedAppName] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [busyApp, setBusyApp] = useState<string | null>(null);
  const [busyRunId, setBusyRunId] = useState<string | null>(null);
  const activeAppNames = useMemo(
    () => new Set(appRuns.map((run) => run.appName)),
    [appRuns],
  );
  const activeGameRun = useMemo(
    () => appRuns.find((run) => run.runId === activeGameRunId) ?? null,
    [activeGameRunId, appRuns],
  );
  const currentGameViewerUrl =
    typeof activeGameViewerUrl === "string" ? activeGameViewerUrl.trim() : "";
  const hasCurrentGame =
    currentGameViewerUrl.length > 0 &&
    activeGameRun?.viewerAttachment === "attached";

  const selectedApp = useMemo(
    () => apps.find((app) => app.name === selectedAppName) ?? null,
    [apps, selectedAppName],
  );

  const selectedAppHasActiveViewer =
    !!selectedApp &&
    hasCurrentGame &&
    activeGameRun?.appName === selectedApp.name;
  const selectedAppIsActive =
    !!selectedApp && activeAppNames.has(selectedApp.name);
  const sortedRuns = useMemo(
    () => [...appRuns].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [appRuns],
  );
  const attentionRuns = useMemo(
    () => sortedRuns.filter((run) => getRunAttentionReasons(run).length > 0),
    [sortedRuns],
  );
  const topAttentionReason = useMemo(() => {
    const firstAttentionRun = attentionRuns[0];
    if (!firstAttentionRun) return null;
    return getRunAttentionReasons(firstAttentionRun)[0] ?? null;
  }, [attentionRuns]);

  const mergeRun = useCallback(
    (run: AppRunSummary) => {
      const nextRuns = [
        run,
        ...appRuns.filter((item) => item.runId !== run.runId),
      ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      setState("appRuns", nextRuns);
      return nextRuns;
    },
    [appRuns, setState],
  );

  const removeRun = useCallback(
    (runId: string) => {
      const nextRuns = appRuns.filter((run) => run.runId !== runId);
      setState("appRuns", nextRuns);
      return nextRuns;
    },
    [appRuns, setState],
  );

  const refreshRuns = useCallback(async () => {
    const runs = await client.listAppRuns();
    setState("appRuns", runs);
    return runs;
  }, [setState]);

  const loadApps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list] = await Promise.all([
        client.listApps(),
        refreshRuns().catch((err: unknown) => {
          console.warn("[AppsView] Failed to list app runs:", err);
          return [];
        }),
      ]);
      setApps(list);
      setSelectedAppName((current) => {
        if (!current) return getDefaultAppsCatalogSelection(list);
        return list.some(
          (app) => app.name === current && shouldShowAppInAppsView(app),
        )
          ? current
          : getDefaultAppsCatalogSelection(list);
      });
    } catch (err) {
      setError(
        t("appsview.LoadError", {
          message:
            err instanceof Error ? err.message : t("appsview.NetworkError"),
        }),
      );
    } finally {
      setLoading(false);
    }
  }, [refreshRuns, t]);

  useEffect(() => {
    void loadApps();
  }, [loadApps]);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        await refreshRuns();
      } catch (err) {
        if (!cancelled) {
          console.warn("[AppsView] Failed to refresh app runs:", err);
        }
      }
    };

    const timer = setInterval(() => {
      void refresh();
    }, 5_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [refreshRuns]);

  useEffect(() => {
    if (appsSubTab !== "running") return;
    if (sortedRuns.length === 0) {
      if (selectedRunId !== null) setSelectedRunId(null);
      return;
    }
    if (
      selectedRunId &&
      sortedRuns.some((run) => run.runId === selectedRunId)
    ) {
      return;
    }
    const preferredRunId =
      activeGameRunId && sortedRuns.some((run) => run.runId === activeGameRunId)
        ? activeGameRunId
        : (attentionRuns[0]?.runId ?? sortedRuns[0].runId);
    setSelectedRunId(preferredRunId);
  }, [activeGameRunId, appsSubTab, attentionRuns, selectedRunId, sortedRuns]);

  const handleLaunch = useCallback(
    async (app: RegistryAppInfo) => {
      setBusyApp(app.name);
      try {
        const result = await client.launchApp(app.name);
        const primaryLaunchDiagnostic =
          result.diagnostics?.find(
            (diagnostic) => diagnostic.severity === "error",
          ) ?? result.diagnostics?.[0];
        const launchedRun = result.run ? mergeRun(result.run) : null;
        const primaryRun =
          launchedRun?.find((run) => run.appName === app.name) ?? result.run;

        if (primaryRun?.viewer?.url) {
          setState("activeGameRunId", primaryRun.runId);
          if (
            primaryRun.viewer.postMessageAuth &&
            !primaryRun.viewer.authMessage
          ) {
            setActionNotice(
              t("appsview.IframeAuthMissing", {
                name: app.displayName ?? app.name,
              }),
              "error",
              4800,
            );
          }
          if (primaryLaunchDiagnostic) {
            setActionNotice(
              primaryLaunchDiagnostic.message,
              primaryLaunchDiagnostic.severity === "error" ? "error" : "info",
              6500,
            );
          }
          setState("tab", "apps");
          setState("appsSubTab", "games");
          return;
        }

        if (primaryRun) {
          setSelectedRunId(primaryRun.runId);
          setState("appsSubTab", "running");
        }

        if (primaryLaunchDiagnostic) {
          setActionNotice(
            primaryLaunchDiagnostic.message,
            primaryLaunchDiagnostic.severity === "error" ? "error" : "info",
            6500,
          );
        }
        const targetUrl = result.launchUrl ?? app.launchUrl;
        if (targetUrl) {
          try {
            await openExternalUrl(targetUrl);
            setActionNotice(
              t("appsview.OpenedInNewTab", {
                name: app.displayName ?? app.name,
              }),
              "success",
              2600,
            );
          } catch {
            setActionNotice(
              t("appsview.PopupBlockedOpen", {
                name: app.displayName ?? app.name,
              }),
              "error",
              4200,
            );
          }
          return;
        }
        setActionNotice(
          t("appsview.LaunchedNoViewer", {
            name: app.displayName ?? app.name,
          }),
          "error",
          4000,
        );
      } catch (err) {
        setActionNotice(
          t("appsview.LaunchFailed", {
            name: app.displayName ?? app.name,
            message: err instanceof Error ? err.message : t("common.error"),
          }),
          "error",
          4000,
        );
      } finally {
        setBusyApp(null);
      }
    },
    [mergeRun, setActionNotice, setState, t],
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
      setActionNotice(t("appsview.CurrentGameOpened"), "success", 2600);
    } catch {
      setActionNotice(t("appsview.PopupBlocked"), "error", 4200);
    }
  }, [currentGameViewerUrl, hasCurrentGame, setActionNotice, t]);

  const handleOpenRun = useCallback(
    async (run: AppRunSummary) => {
      if (!run.viewer?.url) {
        if (run.launchUrl) {
          try {
            await openExternalUrl(run.launchUrl);
            setActionNotice(
              t("appsview.OpenedInNewTab", {
                name: run.displayName,
              }),
              "success",
              2600,
            );
          } catch {
            setActionNotice(
              t("appsview.PopupBlockedOpen", {
                name: run.displayName,
              }),
              "error",
              4200,
            );
          }
          return;
        }

        setActionNotice(
          t("appsview.LaunchedNoViewer", {
            name: run.displayName,
          }),
          "info",
          3200,
        );
        return;
      }

      setBusyRunId(run.runId);
      try {
        const result =
          run.viewerAttachment === "attached"
            ? {
                success: true,
                message: `${run.displayName} attached.`,
                run,
              }
            : await client.attachAppRun(run.runId);
        const nextRun =
          result.run ??
          ({
            ...run,
            viewerAttachment: "attached",
          } satisfies AppRunSummary);
        mergeRun(nextRun);
        setState("activeGameRunId", nextRun.runId);
        setState("tab", "apps");
        setState("appsSubTab", "games");
        if (nextRun.viewer?.postMessageAuth && !nextRun.viewer.authMessage) {
          setActionNotice(
            t("appsview.IframeAuthMissing", {
              name: nextRun.displayName,
            }),
            "error",
            4800,
          );
        } else if (result.message) {
          setActionNotice(result.message, "success", 2200);
        }
      } catch (err) {
        setActionNotice(
          t("appsview.LaunchFailed", {
            name: run.displayName,
            message: err instanceof Error ? err.message : t("common.error"),
          }),
          "error",
          4000,
        );
      } finally {
        setBusyRunId(null);
      }
    },
    [mergeRun, setActionNotice, setState, t],
  );

  const handleDetachRun = useCallback(
    async (run: AppRunSummary) => {
      setBusyRunId(run.runId);
      try {
        const result = await client.detachAppRun(run.runId);
        const nextRun =
          result.run ??
          ({
            ...run,
            viewerAttachment: run.viewer ? "detached" : "unavailable",
          } satisfies AppRunSummary);
        mergeRun(nextRun);
        if (activeGameRunId === run.runId) {
          setState("activeGameRunId", "");
          setState("appsSubTab", "running");
        }
        setActionNotice(result.message, "success", 2200);
      } catch (err) {
        setActionNotice(
          t("appsview.LaunchFailed", {
            name: run.displayName,
            message: err instanceof Error ? err.message : t("common.error"),
          }),
          "error",
          4000,
        );
      } finally {
        setBusyRunId(null);
      }
    },
    [activeGameRunId, mergeRun, setActionNotice, setState, t],
  );

  const handleStopRun = useCallback(
    async (run: AppRunSummary) => {
      setBusyRunId(run.runId);
      try {
        const result = await client.stopAppRun(run.runId);
        const nextRuns = removeRun(run.runId);
        if (activeGameRunId === run.runId) {
          setState("activeGameRunId", "");
          setState("appsSubTab", nextRuns.length > 0 ? "running" : "browse");
        }
        setActionNotice(
          result.message,
          result.success ? "success" : "info",
          result.needsRestart ? 5000 : 3200,
        );
      } catch (err) {
        setActionNotice(
          t("appsview.LaunchFailed", {
            name: run.displayName,
            message: err instanceof Error ? err.message : t("common.error"),
          }),
          "error",
          4000,
        );
      } finally {
        setBusyRunId(null);
      }
    },
    [activeGameRunId, removeRun, setActionNotice, setState, t],
  );

  const visibleApps = useMemo(() => {
    return filterAppsForCatalog(apps, {
      activeAppNames,
      searchQuery,
      showActiveOnly,
    });
  }, [activeAppNames, apps, searchQuery, showActiveOnly]);

  return (
    <div className="device-layout mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-4 lg:px-6">
      <section className="overflow-hidden rounded-[2rem] border border-border/40 bg-card/88 shadow-[0_20px_60px_rgba(0,0,0,0.16)] backdrop-blur-xl">
        <div className="relative overflow-hidden border-b border-border/40 px-5 py-5">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,205,96,0.18),transparent_45%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent)]" />
          <div className="relative grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
                Agent App Library
              </div>
              <h1 className="mt-3 max-w-3xl text-[1.8rem] font-semibold tracking-[-0.02em] text-txt">
                Watch your agent live and steer it in real time.
              </h1>
              <p className="mt-3 max-w-2xl text-[13px] leading-6 text-muted-strong">
                Launch an app, lock onto the running agent immediately, and keep
                commands, pause, and telemetry docked beside the world instead
                of buried in another tool.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                    appsSubTab === "browse"
                      ? "border-accent/35 bg-accent/10 text-accent"
                      : "border-border/35 bg-card/72 text-muted-strong hover:border-accent/20 hover:text-txt"
                  }`}
                  onClick={() => setState("appsSubTab", "browse")}
                >
                  Browse
                </button>
                <button
                  type="button"
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                    appsSubTab === "running"
                      ? "border-accent/35 bg-accent/10 text-accent"
                      : "border-border/35 bg-card/72 text-muted-strong hover:border-accent/20 hover:text-txt"
                  }`}
                  onClick={() => setState("appsSubTab", "running")}
                >
                  Running ({sortedRuns.length})
                </button>
                {hasCurrentGame ? (
                  <button
                    type="button"
                    className="rounded-full border border-ok/35 bg-ok/10 px-3 py-1.5 text-[11px] font-medium text-ok transition-colors hover:bg-ok/15"
                    onClick={handleOpenCurrentGame}
                  >
                    Live viewer
                  </button>
                ) : null}
              </div>
            </div>

            <div
              className="rounded-[1.5rem] border border-border/35 bg-bg/65 px-4 py-4 shadow-sm"
              data-testid="apps-session-status-card"
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                {hasCurrentGame ? "Current live session" : "Session status"}
              </div>
              <div className="mt-2 text-sm font-semibold text-txt">
                {hasCurrentGame
                  ? activeGameDisplayName || "Active app session"
                  : sortedRuns.length > 0
                    ? `${sortedRuns.length} run${sortedRuns.length === 1 ? "" : "s"} active`
                    : "No app session running"}
              </div>
              <p className="mt-2 text-[12px] leading-6 text-muted-strong">
                {hasCurrentGame
                  ? "Jump back into the running app or keep browsing for another world to connect."
                  : sortedRuns.length > 0
                    ? "Detach, reattach, or stop background runs without losing the rest of your catalog context."
                    : "Pick an app to inspect launch details and start a live agent session."}
              </p>
              {attentionRuns.length > 0 ? (
                <div className="mt-3 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-[11px] leading-5 text-warn">
                  <div className="font-semibold uppercase tracking-[0.12em]">
                    Recovery queue
                  </div>
                  <div className="mt-1">
                    {attentionRuns.length} run
                    {attentionRuns.length === 1 ? "" : "s"} need attention
                    {topAttentionReason ? `: ${topAttentionReason}` : "."}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {appsSubTab === "browse" ? (
          <div className="p-4 lg:p-5">
            <PagePanel variant="inset" className="p-4 lg:p-5">
              <LifeOpsWorkspaceView />
            </PagePanel>
          </div>
        ) : null}

        {appsSubTab === "running" ? (
          <div className="p-4 lg:p-5">
            <PagePanel variant="inset" className="p-4 lg:p-5">
              <RunningAppsPanel
                runs={sortedRuns}
                selectedRunId={selectedRunId}
                busyRunId={busyRunId}
                onSelectRun={setSelectedRunId}
                onOpenRun={(run) => void handleOpenRun(run)}
                onDetachRun={(run) => void handleDetachRun(run)}
                onStopRun={(run) => void handleStopRun(run)}
              />
            </PagePanel>
          </div>
        ) : (
          <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)] lg:p-5">
            <PagePanel variant="inset" className="p-4 lg:p-5">
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
            </PagePanel>

            <PagePanel
              variant="inset"
              className="p-4 lg:p-5"
              data-testid="apps-detail-panel"
            >
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
            </PagePanel>
          </div>
        )}
      </section>
    </div>
  );
}
