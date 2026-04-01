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
  PageLayout,
  PagePanel,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarPanel,
  SidebarScrollRegion,
  TrajectorySidebarItem,
} from "@miladyai/ui";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
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

interface TrajectoriesViewProps {
  contentHeader?: ReactNode;
  selectedTrajectoryId?: string | null;
  onSelectTrajectory?: (id: string | null) => void;
}

export function TrajectoriesView({
  contentHeader,
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

  const trajectoriesSidebar = (
    <Sidebar
      testId="trajectories-sidebar"
      aria-label={t("trajectoriesview.Entries", {
        defaultValue: "Entries",
      })}
    >
      <SidebarHeader
        search={{
          value: searchQuery,
          onChange: (event) => {
            setSearchQuery(event.target.value);
            setPage(0);
          },
          onClear: () => {
            setSearchQuery("");
            setPage(0);
          },
          placeholder: t("trajectoriesview.Search"),
          "aria-label": t("trajectoriesview.Search"),
        }}
      />
      <SidebarScrollRegion>
        <SidebarPanel>
          <SidebarContent.Toolbar className="mb-3 justify-end">
            <SidebarContent.ToolbarActions>
              <Button
                variant="outline"
                size="sm"
                type="button"
                className="h-9 rounded-full px-4 text-[11px] font-bold tracking-[0.12em]"
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
                    className="h-9 rounded-full px-4 text-[11px] font-bold tracking-[0.12em]"
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
            </SidebarContent.ToolbarActions>
          </SidebarContent.Toolbar>

          <SidebarContent.SectionHeader
            meta={
              total > 0
                ? `${total} ${t("trajectoriesview.Entries", {
                    defaultValue: "Entries",
                  }).toLowerCase()}`
                : undefined
            }
          >
            <SidebarContent.SectionLabel>
              {t("trajectoriesview.Entries", {
                defaultValue: "Entries",
              })}
            </SidebarContent.SectionLabel>
          </SidebarContent.SectionHeader>

          {loading && trajectories.length === 0 ? (
            <SidebarContent.EmptyState>
              {t("trajectoriesview.LoadingTrajectories")}
            </SidebarContent.EmptyState>
          ) : trajectories.length === 0 ? (
            <SidebarContent.EmptyState>
              {hasActiveFilters
                ? t("trajectoriesview.NoTrajectoriesMatchingFilters")
                : t("trajectoriesview.NoTrajectoriesYet")}
            </SidebarContent.EmptyState>
          ) : (
            <div className="space-y-1.5">
              {trajectories.map((trajectory: TrajectoryRecord) => {
                const selected = selectedTrajectoryId === trajectory.id;
                const statusColor =
                  STATUS_COLORS[trajectory.status] ?? STATUS_COLORS.completed;
                const sourceColor =
                  SOURCE_COLORS[trajectory.source] ?? SOURCE_COLORS.api;

                return (
                  <TrajectorySidebarItem
                    key={trajectory.id}
                    active={selected}
                    onSelect={() => onSelectTrajectory?.(trajectory.id)}
                    callCount={trajectory.llmCallCount}
                    title={formatTrajectoryTimestamp(
                      trajectory.createdAt,
                      "smart",
                    )}
                    sourceLabel={trajectory.source}
                    sourceColor={sourceColor.fg}
                    statusLabel={trajectory.status}
                    statusColor={statusColor.fg}
                    tokenLabel={`${formatTrajectoryTokenCount(
                      trajectory.totalPromptTokens +
                        trajectory.totalCompletionTokens,
                      { emptyLabel: "0" },
                    )} tokens`}
                    durationLabel={formatTrajectoryDuration(
                      trajectory.durationMs,
                    )}
                  />
                );
              })}
            </div>
          )}

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
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
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
        </SidebarPanel>
      </SidebarScrollRegion>
    </Sidebar>
  );

  return (
    <PageLayout
      sidebar={trajectoriesSidebar}
      contentHeader={contentHeader}
      contentInnerClassName="mx-auto w-full max-w-[76rem]"
      data-testid="trajectories-view"
    >
      <PagePanel variant="section">
        <PagePanel.Header
          eyebrow={t("nav.advanced")}
          heading={t("advancedpageview.Trajectories", {
            defaultValue: "Trajectories",
          })}
          description={t("advancedpageview.TrajectoriesDescription", {
            defaultValue: "LLM call history and analysis",
          })}
          className="border-border/35"
          actions={
            <PagePanel.Meta className="border-border/45 px-2.5 py-1 font-bold tracking-[0.16em] text-muted">
              {total > 0
                ? t("trajectoriesview.ShowingRange", {
                    start: page * pageSize + 1,
                    end: Math.min((page + 1) * pageSize, total),
                    total,
                  })
                : t("trajectoriesview.ZeroEntries", {
                    defaultValue: "0 entries",
                  })}
            </PagePanel.Meta>
          }
        />
        <div className="bg-bg/18 px-4 py-4 sm:px-5">
          {error ? (
            <PagePanel.Notice tone="danger" className="mb-4">
              {error}
            </PagePanel.Notice>
          ) : null}

          {loading && trajectories.length === 0 ? (
            <PagePanel.Loading
              variant="surface"
              heading={t("trajectoriesview.LoadingTrajectories")}
            />
          ) : !loading && trajectories.length === 0 ? (
            <PagePanel.Empty
              variant="surface"
              className="min-h-[14rem] rounded-[1.6rem]"
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
      </PagePanel>
    </PageLayout>
  );
}
