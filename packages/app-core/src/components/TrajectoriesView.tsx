/**
 * TrajectoriesView — desktop trajectory workspace with a sidebar rail and
 * detail viewer. The right pane shows the selected trajectory (default: latest).
 */

import {
  client,
  type TrajectoryListResult,
  type TrajectoryRecord,
} from "@miladyai/app-core/api";
import { useApp } from "@miladyai/app-core/state";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
} from "@miladyai/ui";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import {
  DESKTOP_CONTROL_SURFACE_CLASSNAME,
  DESKTOP_CONTROL_SURFACE_COMPACT_CLASSNAME,
  DESKTOP_INSET_EMPTY_PANEL_CLASSNAME,
  DESKTOP_PAGE_CONTENT_CLASSNAME,
  DesktopEmptyStatePanel,
  DesktopPageFrame,
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
  APP_SIDEBAR_COMPACT_TITLE_CLASSNAME,
  APP_SIDEBAR_INNER_CLASSNAME,
  APP_SIDEBAR_SCROLL_REGION_CLASSNAME,
  APP_SIDEBAR_SEARCH_INPUT_CLASSNAME,
  APP_SIDEBAR_SECTION_HEADING_CLASSNAME,
} from "./sidebar-shell-styles";
import { TrajectoryDetailView } from "./TrajectoryDetailView";
import {
  formatTrajectoryDuration,
  formatTrajectoryTimestamp,
  formatTrajectoryTokenCount,
} from "./trajectory-format";

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
const TRAJECTORY_ALERT_CLASSNAME =
  "rounded-[18px] border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger";

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
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const [exporting, setExporting] = useState(false);

  const loadTrajectories = useCallback(async () => {
    setLoading(true);
    setError(null);

    for (let attempt = 0; attempt <= 3; attempt++) {
      try {
        const trajResult = await client.getTrajectories({
          limit: pageSize,
          offset: page * pageSize,
          search: searchQuery || undefined,
        });
        setResult(trajResult);
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
  }, [page, searchQuery, t]);

  useEffect(() => {
    void loadTrajectories();
  }, [loadTrajectories]);

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

  const hasActiveFilters = searchQuery !== "";
  const trajectories = useMemo(() => result?.trajectories ?? [], [result]);
  const total = result?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  useLayoutEffect(() => {
    if (loading) return;
    if (trajectories.length === 0) {
      if (selectedTrajectoryId != null) onSelectTrajectory?.(null);
      return;
    }
    if (selectedTrajectoryId == null) {
      onSelectTrajectory?.(trajectories[0].id);
      return;
    }
    if (
      page === 0 &&
      !trajectories.some((tr) => tr.id === selectedTrajectoryId)
    ) {
      onSelectTrajectory?.(trajectories[0].id);
    }
  }, [loading, trajectories, selectedTrajectoryId, onSelectTrajectory, page]);

  const detailTrajectoryId =
    trajectories.length === 0
      ? null
      : (selectedTrajectoryId ?? trajectories[0]?.id ?? null);

  return (
    <DesktopPageFrame>
      <div
        className={TRAJECTORIES_SHELL_CLASSNAME}
        data-testid="trajectories-view"
      >
        <aside className={APP_DESKTOP_SIDEBAR_RAIL_STANDARD_CLASSNAME}>
          <div className={APP_SIDEBAR_INNER_CLASSNAME}>
            <div className="mt-3 flex min-w-0 items-center gap-1.5">
              <Input
                type="search"
                placeholder={t("trajectoriesview.Search")}
                className={`min-w-0 flex-1 ${APP_SIDEBAR_SEARCH_INPUT_CLASSNAME}`}
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setPage(0);
                }}
              />
              <Button
                variant="outline"
                size="sm"
                type="button"
                className={`shrink-0 ${TRAJECTORY_ACTION_BUTTON_CLASSNAME}`}
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
                    type="button"
                    className={`shrink-0 ${TRAJECTORY_ACTION_BUTTON_CLASSNAME}`}
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
            </div>

            <div className={`mt-3 ${APP_SIDEBAR_SECTION_HEADING_CLASSNAME}`}>
              {t("trajectoriesview.Entries", {
                defaultValue: "Entries",
              })}
            </div>

            <div className={`mt-2 ${APP_SIDEBAR_SCROLL_REGION_CLASSNAME}`}>
              <div className="space-y-1.5">
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

            {loading && trajectories.length === 0 ? (
              <div
                className={`${DESKTOP_INSET_EMPTY_PANEL_CLASSNAME} flex min-h-[12rem] flex-1 items-center justify-center px-4 py-8 text-center text-sm text-muted`}
              >
                {t("trajectoriesview.LoadingTrajectories")}
              </div>
            ) : !loading && trajectories.length === 0 ? (
              <DesktopEmptyStatePanel
                className="min-h-[12rem] flex-1"
                title={
                  hasActiveFilters
                    ? t("trajectoriesview.NoTrajectoriesMatchingFilters")
                    : t("trajectoriesview.NoTrajectoriesYet")
                }
              />
            ) : detailTrajectoryId ? (
              <TrajectoryDetailView trajectoryId={detailTrajectoryId} />
            ) : null}
          </div>
        </div>
      </div>
    </DesktopPageFrame>
  );
}
