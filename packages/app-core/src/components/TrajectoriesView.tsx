/**
 * TrajectoriesView — desktop trajectory workspace with a sidebar rail and
 * detail viewer.
 *
 * The left rail owns filters, actions, and the trajectory list. The right
 * pane shows an overview by default and drills into one trajectory when
 * selected.
 */

import {
  client,
  type TrajectoryConfig,
  type TrajectoryListResult,
  type TrajectoryRecord,
  type TrajectoryStats,
} from "@miladyai/app-core/api";
import { useApp } from "@miladyai/app-core/state";
import { confirmDesktopAction } from "@miladyai/app-core/utils";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@miladyai/ui";
import { useCallback, useEffect, useState } from "react";
import {
  DESKTOP_CONTROL_SURFACE_ACCENT_CLASSNAME,
  DESKTOP_CONTROL_SURFACE_CLASSNAME,
  DESKTOP_CONTROL_SURFACE_COMPACT_CLASSNAME,
  DESKTOP_INSET_EMPTY_PANEL_CLASSNAME,
  DESKTOP_INSET_PANEL_CLASSNAME,
  DESKTOP_PADDED_SURFACE_PANEL_CLASSNAME,
  DESKTOP_PAGE_CONTENT_CLASSNAME,
  DESKTOP_RAIL_SUMMARY_CARD_COMPACT_CLASSNAME,
  DESKTOP_SECTION_SHELL_CLASSNAME,
  DesktopEmptyStatePanel,
  DesktopPageFrame,
  DesktopRailSummaryCard,
} from "./desktop-surface-primitives";
import {
  APP_DESKTOP_SIDEBAR_RAIL_STANDARD_CLASSNAME,
  APP_DESKTOP_SPLIT_SHELL_CLASSNAME,
  APP_SIDEBAR_CARD_ACTIVE_CLASSNAME,
  APP_SIDEBAR_CARD_INACTIVE_CLASSNAME,
  APP_SIDEBAR_COMPACT_CARD_CLASSNAME,
  APP_SIDEBAR_COMPACT_ICON_ACTIVE_CLASSNAME,
  APP_SIDEBAR_COMPACT_ICON_INACTIVE_CLASSNAME,
  APP_SIDEBAR_COMPACT_META_CLASSNAME,
  APP_SIDEBAR_COMPACT_PILL_CLASSNAME,
  APP_SIDEBAR_COMPACT_TITLE_CLASSNAME,
  APP_SIDEBAR_INNER_CLASSNAME,
  APP_SIDEBAR_PILL_CLASSNAME,
  APP_SIDEBAR_SCROLL_REGION_CLASSNAME,
  APP_SIDEBAR_SEARCH_INPUT_CLASSNAME,
  APP_SIDEBAR_SECTION_HEADING_CLASSNAME,
} from "./sidebar-shell-styles";
import {
  formatTrajectoryDuration,
  formatTrajectoryTimestamp,
  formatTrajectoryTokenCount,
} from "./trajectory-format";
import { TrajectoryDetailView } from "./TrajectoryDetailView";

type StatusFilter = "" | "active" | "completed" | "error";

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  active: { bg: "rgba(59, 130, 246, 0.15)", fg: "rgb(59, 130, 246)" },
  completed: { bg: "rgba(34, 197, 94, 0.15)", fg: "rgb(34, 197, 94)" },
  error: { bg: "rgba(239, 68, 68, 0.15)", fg: "rgb(239, 68, 68)" },
};

const SOURCE_COLORS: Record<string, { bg: string; fg: string }> = {
  chat: { bg: "rgba(99, 102, 241, 0.15)", fg: "rgb(99, 102, 241)" },
  autonomy: { bg: "rgba(245, 158, 11, 0.15)", fg: "rgb(245, 158, 11)" },
  telegram: { bg: "rgba(34, 197, 94, 0.15)", fg: "rgb(34, 197, 94)" },
  discord: { bg: "rgba(88, 101, 242, 0.15)", fg: "rgb(88, 101, 242)" },
  api: { bg: "rgba(156, 163, 175, 0.15)", fg: "rgb(156, 163, 175)" },
  orchestrator: { bg: "rgba(168, 85, 247, 0.15)", fg: "rgb(168, 85, 247)" },
};

const TRAJECTORIES_SHELL_CLASSNAME = APP_DESKTOP_SPLIT_SHELL_CLASSNAME;
const TRAJECTORIES_PANE_CLASSNAME = `${DESKTOP_PAGE_CONTENT_CLASSNAME} min-h-0`;
const TRAJECTORY_LIST_ITEM_CLASSNAME = APP_SIDEBAR_COMPACT_CARD_CLASSNAME;
const TRAJECTORY_ACTION_BUTTON_CLASSNAME = `${DESKTOP_CONTROL_SURFACE_COMPACT_CLASSNAME} ${DESKTOP_CONTROL_SURFACE_CLASSNAME}`;
const TRAJECTORY_ACTION_ACCENT_BUTTON_CLASSNAME = `${DESKTOP_CONTROL_SURFACE_COMPACT_CLASSNAME} ${DESKTOP_CONTROL_SURFACE_ACCENT_CLASSNAME}`;
const TRAJECTORY_ALERT_CLASSNAME =
  "rounded-[18px] border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger";

function renderInlineBadge(label: string, colors?: { bg: string; fg: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full border border-transparent px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em]"
      style={
        colors
          ? {
              background: colors.bg,
              color: colors.fg,
            }
          : undefined
      }
    >
      {label}
    </span>
  );
}

function renderInlineMeta(label: string, colors?: { fg: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-muted/85">
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={colors ? { backgroundColor: colors.fg } : undefined}
      />
      <span>{label}</span>
    </span>
  );
}

interface TrajectoriesViewProps {
  selectedTrajectoryId?: string | null;
  onSelectTrajectory?: (id: string | null) => void;
}

export function TrajectoriesView({
  selectedTrajectoryId = null,
  onSelectTrajectory,
}: TrajectoriesViewProps) {
  const { t } = useApp();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<TrajectoryListResult | null>(null);
  const [stats, setStats] = useState<TrajectoryStats | null>(null);
  const [config, setConfig] = useState<TrajectoryConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const [exporting, setExporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [updatingLogging, setUpdatingLogging] = useState(false);

  const loadTrajectories = useCallback(async () => {
    setLoading(true);
    setError(null);

    for (let attempt = 0; attempt <= 3; attempt++) {
      try {
        const [trajResult, statsResult, configResult] = await Promise.all([
          client.getTrajectories({
            limit: pageSize,
            offset: page * pageSize,
            status: statusFilter || undefined,
            source: sourceFilter || undefined,
            search: searchQuery || undefined,
          }),
          client.getTrajectoryStats(),
          client.getTrajectoryConfig(),
        ]);
        setResult(trajResult);
        setStats(statsResult);
        setConfig(configResult);
        setLoading(false);
        return;
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 503 && attempt < 3) {
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * (attempt + 1)),
          );
          continue;
        }
        setError(
          err instanceof Error
            ? err.message
            : t("trajectoriesview.FailedToLoad"),
        );
        setLoading(false);
        return;
      }
    }
  }, [page, searchQuery, sourceFilter, statusFilter, t]);

  useEffect(() => {
    void loadTrajectories();
  }, [loadTrajectories]);

  const handleToggleLogging = async () => {
    if (!config) return;
    setUpdatingLogging(true);
    try {
      const updated = await client.updateTrajectoryConfig({
        enabled: !config.enabled,
      });
      setConfig(updated);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("trajectoriesview.FailedToUpdateConfig"),
      );
    } finally {
      setUpdatingLogging(false);
    }
  };

  const handleExport = async (
    format: "json" | "csv" | "zip",
    includePrompts: boolean,
  ) => {
    setExporting(true);
    try {
      const blob = await client.exportTrajectories({ format, includePrompts });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `trajectories-${new Date().toISOString().split("T")[0]}.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("trajectoriesview.FailedToExport"),
      );
    } finally {
      setExporting(false);
    }
  };

  const handleClearAll = async () => {
    const confirmed = await confirmDesktopAction({
      title: t("trajectoriesview.DeleteAllTitle"),
      message: t("trajectoriesview.DeleteAllMessage"),
      detail: t("trajectoriesview.DeleteAllDetail"),
      confirmLabel: t("common.deleteAll"),
      cancelLabel: t("common.cancel"),
      type: "warning",
    });
    if (!confirmed) return;

    setClearing(true);
    try {
      await client.clearAllTrajectories();
      onSelectTrajectory?.(null);
      void loadTrajectories();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("trajectoriesview.FailedToClear"),
      );
    } finally {
      setClearing(false);
    }
  };

  const handleClearFilters = () => {
    setStatusFilter("");
    setSourceFilter("");
    setSearchQuery("");
    setPage(0);
  };

  const hasActiveFilters =
    statusFilter !== "" || sourceFilter !== "" || searchQuery !== "";
  const trajectories = result?.trajectories ?? [];
  const total = result?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);
  const sources = stats?.bySource ? Object.keys(stats.bySource) : [];
  const visibleCount = trajectories.length;
  const isOverviewSelected = selectedTrajectoryId == null;
  const loggingEnabled = config?.enabled ?? false;

  return (
    <DesktopPageFrame>
      <div
        className={TRAJECTORIES_SHELL_CLASSNAME}
        data-testid="trajectories-view"
      >
        <aside className={APP_DESKTOP_SIDEBAR_RAIL_STANDARD_CLASSNAME}>
          <div className={APP_SIDEBAR_INNER_CLASSNAME}>
            <DesktopRailSummaryCard
              className={`mt-3 ${DESKTOP_RAIL_SUMMARY_CARD_COMPACT_CLASSNAME}`}
            >
              <div className="flex items-start justify-between gap-2.5">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        loggingEnabled
                          ? "bg-ok shadow-[0_0_12px_rgba(34,197,94,0.32)]"
                          : "bg-warning"
                      }`}
                    />
                    <span className="text-[12px] font-semibold text-txt">
                      {loggingEnabled
                        ? t("trajectoriesview.LoggingEnabled", {
                            defaultValue: "Logging enabled",
                          })
                        : t("trajectoriesview.LoggingDisabled", {
                            defaultValue: "Logging disabled",
                          })}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] leading-5 text-muted">
                    Browse recent runs and open one in the viewer.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={handleToggleLogging}
                  disabled={!config || updatingLogging}
                  className={
                    loggingEnabled
                      ? TRAJECTORY_ACTION_ACCENT_BUTTON_CLASSNAME
                      : TRAJECTORY_ACTION_BUTTON_CLASSNAME
                  }
                >
                  {updatingLogging
                    ? t("common.loading", { defaultValue: "Loading..." })
                    : loggingEnabled
                      ? t("common.on")
                      : t("common.off")}
                </Button>
              </div>

              <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                <div className={APP_SIDEBAR_COMPACT_PILL_CLASSNAME}>
                  {`${stats?.totalTrajectories.toLocaleString() ?? "0"} total`}
                </div>
                <div className={APP_SIDEBAR_COMPACT_PILL_CLASSNAME}>
                  {`${stats?.totalLlmCalls.toLocaleString() ?? "0"} calls`}
                </div>
                <div className={APP_SIDEBAR_COMPACT_PILL_CLASSNAME}>
                  {formatTrajectoryTokenCount(
                    (stats?.totalPromptTokens ?? 0) +
                      (stats?.totalCompletionTokens ?? 0),
                    { emptyLabel: "0" },
                  )}{" "}
                  tokens
                </div>
                <div className={APP_SIDEBAR_COMPACT_PILL_CLASSNAME}>
                  {formatTrajectoryDuration(stats?.averageDurationMs ?? 0)} avg
                </div>
              </div>
            </DesktopRailSummaryCard>

            <div className="mt-3 space-y-1.5">
              <Input
                type="search"
                placeholder={t("trajectoriesview.Search")}
                className={APP_SIDEBAR_SEARCH_INPUT_CLASSNAME}
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setPage(0);
                }}
              />

              <div
                className={
                  sources.length > 0
                    ? "grid grid-cols-2 gap-1.5"
                    : "grid gap-1.5"
                }
              >
                <Select
                  value={statusFilter === "" ? "all" : statusFilter}
                  onValueChange={(value) => {
                    setStatusFilter(
                      value === "all" ? "" : (value as StatusFilter),
                    );
                    setPage(0);
                  }}
                >
                  <SelectTrigger className={APP_SIDEBAR_SEARCH_INPUT_CLASSNAME}>
                    <SelectValue
                      placeholder={t("trajectoriesview.AllStatuses")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t("trajectoriesview.AllStatuses")}
                    </SelectItem>
                    <SelectItem value="active">
                      {t("appsview.Active")}
                    </SelectItem>
                    <SelectItem value="completed">
                      {t("trajectoriesview.Completed")}
                    </SelectItem>
                    <SelectItem value="error">{t("logsview.Error")}</SelectItem>
                  </SelectContent>
                </Select>

                {sources.length > 0 ? (
                  <Select
                    value={sourceFilter === "" ? "all" : sourceFilter}
                    onValueChange={(value) => {
                      setSourceFilter(value === "all" ? "" : value);
                      setPage(0);
                    }}
                  >
                    <SelectTrigger
                      className={APP_SIDEBAR_SEARCH_INPUT_CLASSNAME}
                    >
                      <SelectValue placeholder={t("logsview.AllSources")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        {t("logsview.AllSources")}
                      </SelectItem>
                      {sources.map((source) => (
                        <SelectItem key={source} value={source}>
                          {source}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-1.5">
              <Button
                variant="outline"
                size="sm"
                type="button"
                className={TRAJECTORY_ACTION_BUTTON_CLASSNAME}
                onClick={() => void loadTrajectories()}
                disabled={loading}
              >
                {loading
                  ? t("common.loading", { defaultValue: "Loading..." })
                  : t("common.refresh")}
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={TRAJECTORY_ACTION_BUTTON_CLASSNAME}
                    disabled={exporting || trajectories.length === 0}
                  >
                    {exporting ? t("common.exporting") : t("common.export")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => handleExport("json", true)}>
                    {t("trajectoriesview.JSONWithPrompts")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("json", false)}>
                    {t("trajectoriesview.JSONRedacted")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("csv", false)}>
                    {t("trajectoriesview.CSVSummaryOnly")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("zip", true)}>
                    {t("trajectoriesview.ZIPFolders")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {hasActiveFilters ? (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  className={TRAJECTORY_ACTION_BUTTON_CLASSNAME}
                  onClick={handleClearFilters}
                >
                  {t("logsview.ClearFilters")}
                </Button>
              ) : (
                <div />
              )}

              <Button
                variant="outline"
                size="sm"
                type="button"
                className={`${DESKTOP_CONTROL_SURFACE_COMPACT_CLASSNAME} rounded-full border-danger/32 text-danger hover:border-danger/46 hover:bg-danger/10`}
                onClick={handleClearAll}
                disabled={clearing || stats?.totalTrajectories === 0}
              >
                {clearing ? t("common.clearing") : t("common.clearAll")}
              </Button>
            </div>

            <div className={`mt-3 ${APP_SIDEBAR_SECTION_HEADING_CLASSNAME}`}>
              Entries
            </div>

            <div className={`mt-2 ${APP_SIDEBAR_SCROLL_REGION_CLASSNAME}`}>
              <div className="space-y-1.5">
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => onSelectTrajectory?.(null)}
                  className={`${TRAJECTORY_LIST_ITEM_CLASSNAME} ${
                    isOverviewSelected
                      ? APP_SIDEBAR_CARD_ACTIVE_CLASSNAME
                      : APP_SIDEBAR_CARD_INACTIVE_CLASSNAME
                  }`}
                  aria-current={isOverviewSelected ? "page" : undefined}
                >
                  <span
                    className={
                      isOverviewSelected
                        ? APP_SIDEBAR_COMPACT_ICON_ACTIVE_CLASSNAME
                        : APP_SIDEBAR_COMPACT_ICON_INACTIVE_CLASSNAME
                    }
                  >
                    Σ
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className={APP_SIDEBAR_COMPACT_TITLE_CLASSNAME}>
                      Overview
                    </span>
                    <span className={APP_SIDEBAR_COMPACT_META_CLASSNAME}>
                      Health, totals, and logging state.
                    </span>
                  </span>
                </Button>

                {loading && trajectories.length === 0 ? (
                  <div
                    className={`${DESKTOP_INSET_EMPTY_PANEL_CLASSNAME} px-4 py-6 text-center text-sm text-muted`}
                  >
                    {t("trajectoriesview.LoadingTrajectories")}
                  </div>
                ) : trajectories.length === 0 ? (
                  <div
                    className={`${DESKTOP_INSET_EMPTY_PANEL_CLASSNAME} px-4 py-6 text-center text-sm text-muted`}
                  >
                    {hasActiveFilters
                      ? t("trajectoriesview.NoTrajectoriesMatchingFilters")
                      : t("trajectoriesview.NoTrajectoriesYet")}
                  </div>
                ) : (
                  trajectories.map((trajectory: TrajectoryRecord) => {
                    const selected = selectedTrajectoryId === trajectory.id;
                    const statusColor =
                      STATUS_COLORS[trajectory.status] ??
                      STATUS_COLORS.completed;
                    const sourceColor =
                      SOURCE_COLORS[trajectory.source] ?? SOURCE_COLORS.api;

                    return (
                      <Button
                        key={trajectory.id}
                        variant="ghost"
                        type="button"
                        onClick={() => onSelectTrajectory?.(trajectory.id)}
                        className={`${TRAJECTORY_LIST_ITEM_CLASSNAME} ${
                          selected
                            ? APP_SIDEBAR_CARD_ACTIVE_CLASSNAME
                            : APP_SIDEBAR_CARD_INACTIVE_CLASSNAME
                        }`}
                        aria-current={selected ? "page" : undefined}
                      >
                        <span
                          className={
                            selected
                              ? APP_SIDEBAR_COMPACT_ICON_ACTIVE_CLASSNAME
                              : APP_SIDEBAR_COMPACT_ICON_INACTIVE_CLASSNAME
                          }
                        >
                          {trajectory.llmCallCount}
                        </span>
                        <span className="min-w-0 flex-1 text-left">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={APP_SIDEBAR_COMPACT_TITLE_CLASSNAME}
                            >
                              {formatTrajectoryTimestamp(
                                trajectory.createdAt,
                                "smart",
                              )}
                            </span>
                          </span>
                          <span className={APP_SIDEBAR_COMPACT_META_CLASSNAME}>
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              {renderInlineMeta(trajectory.source, sourceColor)}
                              {renderInlineMeta(trajectory.status, statusColor)}
                              <span>
                                {formatTrajectoryTokenCount(
                                  trajectory.totalPromptTokens +
                                    trajectory.totalCompletionTokens,
                                  { emptyLabel: "0" },
                                )}{" "}
                                tokens
                              </span>
                              <span>
                                {formatTrajectoryDuration(
                                  trajectory.durationMs,
                                )}
                              </span>
                            </span>
                          </span>
                        </span>
                      </Button>
                    );
                  })
                )}
              </div>
            </div>

            {totalPages > 1 && (
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/20 pt-3 text-xs text-muted">
                <span className="min-w-0">
                  {t("trajectoriesview.ShowingRange", {
                    start: page * pageSize + 1,
                    end: Math.min((page + 1) * pageSize, total),
                    total,
                  })}
                </span>
                <div className="flex gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    className="h-8 rounded-full px-3 text-[11px]"
                    onClick={() =>
                      setPage((current) => Math.max(0, current - 1))
                    }
                    disabled={page === 0}
                  >
                    {t("databaseview.Prev")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    className="h-8 rounded-full px-3 text-[11px]"
                    onClick={() => setPage((current) => current + 1)}
                    disabled={page >= totalPages - 1}
                  >
                    {t("onboarding.next")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </aside>

        <div className={TRAJECTORIES_PANE_CLASSNAME}>
          <div className="flex min-h-0 flex-1 flex-col gap-4 p-3 lg:p-4">
            {error ? (
              <div className={TRAJECTORY_ALERT_CLASSNAME}>{error}</div>
            ) : null}

            {isOverviewSelected ? (
              <>
                <section className={DESKTOP_PADDED_SURFACE_PANEL_CLASSNAME}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted/70">
                    Trajectories
                  </div>
                  <div className="mt-2 text-[2rem] font-semibold leading-tight text-txt">
                    Trajectory Overview
                  </div>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
                    Capture, inspect, and export model runs from one workspace.
                    Use the left rail to filter history, then open a run to see
                    prompt, response, and token detail without leaving the page.
                  </p>
                </section>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                  <section
                    className={`${DESKTOP_SECTION_SHELL_CLASSNAME} p-5 sm:p-6`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted/70">
                          Health
                        </div>
                        <div className="mt-2 text-lg font-semibold text-txt">
                          Capture Status
                        </div>
                      </div>
                      <span className={APP_SIDEBAR_PILL_CLASSNAME}>
                        {loggingEnabled ? "Ready" : "Disabled"}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div
                        className={`${DESKTOP_INSET_PANEL_CLASSNAME} px-4 py-4`}
                      >
                        <div className="text-[11px] uppercase tracking-[0.14em] text-muted/70">
                          Total Runs
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-txt">
                          {stats?.totalTrajectories.toLocaleString() ?? "0"}
                        </div>
                      </div>
                      <div
                        className={`${DESKTOP_INSET_PANEL_CLASSNAME} px-4 py-4`}
                      >
                        <div className="text-[11px] uppercase tracking-[0.14em] text-muted/70">
                          LLM Calls
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-txt">
                          {stats?.totalLlmCalls.toLocaleString() ?? "0"}
                        </div>
                      </div>
                      <div
                        className={`${DESKTOP_INSET_PANEL_CLASSNAME} px-4 py-4`}
                      >
                        <div className="text-[11px] uppercase tracking-[0.14em] text-muted/70">
                          Tokens
                        </div>
                        <div className="mt-2 text-xl font-semibold text-txt">
                          {formatTrajectoryTokenCount(
                            (stats?.totalPromptTokens ?? 0) +
                              (stats?.totalCompletionTokens ?? 0),
                            { emptyLabel: "0" },
                          )}
                        </div>
                      </div>
                      <div
                        className={`${DESKTOP_INSET_PANEL_CLASSNAME} px-4 py-4`}
                      >
                        <div className="text-[11px] uppercase tracking-[0.14em] text-muted/70">
                          Average Duration
                        </div>
                        <div className="mt-2 text-xl font-semibold text-txt">
                          {formatTrajectoryDuration(
                            stats?.averageDurationMs ?? 0,
                          )}
                        </div>
                      </div>
                    </div>
                  </section>

                  <section
                    className={`${DESKTOP_SECTION_SHELL_CLASSNAME} p-5 sm:p-6`}
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted/70">
                      Next Step
                    </div>
                    <div className="mt-2 text-lg font-semibold text-txt">
                      Choose a trajectory
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted">
                      Select any item in the left rail to inspect system prompt,
                      input, output, latency, token cost, and orchestrator
                      context on the right.
                    </p>

                    {trajectories.length === 0 ? (
                      <DesktopEmptyStatePanel
                        className="mt-5 min-h-[16rem]"
                        description={
                          hasActiveFilters
                            ? t(
                                "trajectoriesview.NoTrajectoriesMatchingFilters",
                              )
                            : t("trajectoriesview.NoTrajectoriesYet")
                        }
                        title="No trajectory selected"
                      />
                    ) : (
                      <div
                        className={`${DESKTOP_INSET_PANEL_CLASSNAME} mt-5 px-4 py-4`}
                      >
                        <div className="text-[11px] uppercase tracking-[0.14em] text-muted/70">
                          Latest visible run
                        </div>
                        <div className="mt-2 text-base font-semibold text-txt">
                          {formatTrajectoryTimestamp(
                            trajectories[0]?.createdAt ?? Date.now(),
                            "detailed",
                          )}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {trajectories[0]
                            ? renderInlineBadge(
                                trajectories[0].source,
                                SOURCE_COLORS[trajectories[0].source] ??
                                  SOURCE_COLORS.api,
                              )
                            : null}
                          {trajectories[0]
                            ? renderInlineBadge(
                                trajectories[0].status,
                                STATUS_COLORS[trajectories[0].status] ??
                                  STATUS_COLORS.completed,
                              )
                            : null}
                        </div>
                      </div>
                    )}
                  </section>
                </div>
              </>
            ) : (
              <TrajectoryDetailView trajectoryId={selectedTrajectoryId} />
            )}
          </div>
        </div>
      </div>
    </DesktopPageFrame>
  );
}
