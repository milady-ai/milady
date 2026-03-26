/**
 * Logs view component — logs viewer with filtering.
 */

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@miladyai/ui";
import { useEffect, useMemo, useState } from "react";
import type { LogEntry } from "../api";
import { useApp } from "../state";
import {
  DESKTOP_CONTROL_SURFACE_CLASSNAME,
  DESKTOP_INSET_PANEL_CLASSNAME,
  DESKTOP_SURFACE_PANEL_CLASSNAME,
  DesktopEmptyStatePanel,
} from "./desktop-surface-primitives";
import { formatTime } from "./format";
import { SETTINGS_FILTER_CONTROL_CLASSNAME } from "./settings-control-primitives";

const TAG_TONE_CLASSNAMES: Record<string, string> = {
  agent: "border-accent/25 bg-accent/10 text-accent-fg",
  server: "border-ok/25 bg-ok/10 text-ok",
  system: "border-border/40 bg-bg-hover text-muted-strong",
  cloud: "border-accent/20 bg-accent/8 text-accent",
  plugins: "border-accent/25 bg-accent/10 text-accent-fg",
  autonomy: "border-warning/30 bg-warning/10 text-warning",
  websocket: "border-ok/20 bg-ok/8 text-ok",
};

const LOGS_PANEL_CLASSNAME = DESKTOP_SURFACE_PANEL_CLASSNAME;
const LOGS_LEVEL_CLASSNAMES: Record<string, string> = {
  error: "text-danger",
  warn: "text-warning",
  info: "text-muted-strong",
  debug: "text-muted",
};

export function LogsView() {
  const [searchQuery, setSearchQuery] = useState("");

  const {
    logs,
    logSources,
    logTags,
    logTagFilter,
    logLevelFilter,
    logSourceFilter,
    loadLogs,
    setState,
    t,
  } = useApp();

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const handleClearFilters = () => {
    setState("logTagFilter", "");
    setState("logLevelFilter", "");
    setState("logSourceFilter", "");
    setSearchQuery("");
    void loadLogs();
  };

  const hasActiveFilters =
    logTagFilter !== "" ||
    logLevelFilter !== "" ||
    logSourceFilter !== "" ||
    searchQuery.trim() !== "";

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filteredLogs = useMemo(() => {
    if (!normalizedSearch) return logs;
    return logs.filter((entry) => {
      const haystack = [
        entry.message ?? "",
        entry.source ?? "",
        entry.level ?? "",
        ...(entry.tags ?? []),
      ];
      return haystack.some((part) =>
        part.toLowerCase().includes(normalizedSearch),
      );
    });
  }, [logs, normalizedSearch]);

  const activeFilterCount = [
    logTagFilter !== "",
    logLevelFilter !== "",
    logSourceFilter !== "",
    normalizedSearch !== "",
  ].filter(Boolean).length;

  return (
    <div className="flex h-full flex-col gap-3" data-testid="logs-view">
      {/* Filters row — filters left, refresh right */}
      <section className={`${LOGS_PANEL_CLASSNAME} space-y-3 p-3 sm:p-4`}>
        <div className="space-y-1">
          <div className="text-sm font-semibold text-txt">Filter logs</div>
          <p className="max-w-3xl text-xs leading-5 text-muted">
            Narrow the runtime stream by text, severity, source, or tag so the
            current incident stands out without losing the surrounding context.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="text"
            className={`min-w-[15rem] flex-1 ${SETTINGS_FILTER_CONTROL_CLASSNAME}`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("logsview.SearchLogs")}
            aria-label={t("aria.searchLogs")}
          />

          <Select
            value={logLevelFilter === "" ? "all" : logLevelFilter}
            onValueChange={(val) => {
              setState("logLevelFilter", val === "all" ? "" : val);
              void loadLogs();
            }}
          >
            <SelectTrigger
              className={`w-40 ${SETTINGS_FILTER_CONTROL_CLASSNAME}`}
            >
              <SelectValue placeholder={t("logsview.AllLevels")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("logsview.AllLevels")}</SelectItem>
              <SelectItem value="debug">{t("logsview.Debug")}</SelectItem>
              <SelectItem value="info">{t("logsview.Info")}</SelectItem>
              <SelectItem value="warn">{t("logsview.Warn")}</SelectItem>
              <SelectItem value="error">{t("logsview.Error")}</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={logSourceFilter === "" ? "all" : logSourceFilter}
            onValueChange={(val) => {
              setState("logSourceFilter", val === "all" ? "" : val);
              void loadLogs();
            }}
          >
            <SelectTrigger
              className={`w-40 ${SETTINGS_FILTER_CONTROL_CLASSNAME}`}
            >
              <SelectValue placeholder={t("logsview.AllSources")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("logsview.AllSources")}</SelectItem>
              {logSources.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {logTags.length > 0 && (
            <Select
              value={logTagFilter === "" ? "all" : logTagFilter}
              onValueChange={(val) => {
                setState("logTagFilter", val === "all" ? "" : val);
                void loadLogs();
              }}
            >
              <SelectTrigger
                className={`w-40 ${SETTINGS_FILTER_CONTROL_CLASSNAME}`}
              >
                <SelectValue placeholder={t("logsview.AllTags")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("logsview.AllTags")}</SelectItem>
                {logTags.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              className={`min-h-10 rounded-[18px] px-3 text-xs font-medium ${DESKTOP_CONTROL_SURFACE_CLASSNAME}`}
              onClick={handleClearFilters}
            >
              {t("logsview.ClearFilters")}
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            className={`ml-auto min-h-10 rounded-[18px] px-3 text-xs font-medium ${DESKTOP_CONTROL_SURFACE_CLASSNAME}`}
            onClick={() => void loadLogs()}
          >
            {t("common.refresh")}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="rounded-full border border-border/40 bg-bg-hover/60 px-2.5 py-1 text-muted tabular-nums">
            Showing {filteredLogs.length}{" "}
            {filteredLogs.length === 1 ? "entry" : "entries"}
          </div>
          <div className="rounded-full border border-border/35 bg-bg/80 px-2.5 py-1 text-muted tabular-nums">
            {activeFilterCount}{" "}
            {activeFilterCount === 1 ? "active filter" : "active filters"}
          </div>
        </div>
      </section>

      {/* Log entries — full remaining height */}
      <div
        className={`${LOGS_PANEL_CLASSNAME} flex-1 min-h-0 overflow-y-auto p-2 font-mono text-sm`}
      >
        {filteredLogs.length === 0 ? (
          <DesktopEmptyStatePanel
            role="status"
            className="m-1 min-h-[16rem] rounded-xl border-border/35 bg-bg-hover/60 px-6 py-10"
            description={
              hasActiveFilters
                ? "Try broadening the current log filters to bring entries back into view."
                : "New runtime and service events will appear here as the system emits them."
            }
            title={`${t("logsview.NoLogEntries")}${hasActiveFilters ? " matching filters" : " yet"}.`}
          />
        ) : (
          <div
            className={`${DESKTOP_INSET_PANEL_CLASSNAME} overflow-hidden rounded-[18px]`}
          >
            <div className="hidden grid-cols-[5.75rem_3.5rem_5rem_14rem_minmax(0,1fr)] gap-3 border-b border-border/40 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted md:grid">
              <span>Time</span>
              <span>Level</span>
              <span>Source</span>
              <span>Tags</span>
              <span>Message</span>
            </div>
            {filteredLogs.map((entry: LogEntry) => (
              <div
                key={`${entry.timestamp}-${entry.source}-${entry.level}-${entry.message}`}
                className="flex items-start gap-3 border-b border-border/40 px-3 py-3 text-[13px] last:border-b-0"
                data-testid="log-entry"
              >
                {/* Timestamp */}
                <span className="w-[5.75rem] shrink-0 whitespace-nowrap text-[11px] text-muted tabular-nums">
                  {formatTime(entry.timestamp, { fallback: "—" })}
                </span>

                {/* Level */}
                <span
                  className={`w-14 shrink-0 font-semibold uppercase tracking-[0.08em] text-[11px] ${
                    LOGS_LEVEL_CLASSNAMES[entry.level] ?? "text-muted"
                  }`}
                >
                  {entry.level}
                </span>

                {/* Source */}
                <span className="w-20 shrink-0 truncate text-[11px] text-muted">
                  [{entry.source}]
                </span>

                {/* Tag badges */}
                <span className="inline-flex max-w-[14rem] shrink-0 flex-wrap gap-1">
                  {(entry.tags ?? []).map((t: string) => {
                    return (
                      <span
                        key={t}
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${TAG_TONE_CLASSNAMES[t] ?? "border-border/35 bg-bg-hover text-muted-strong"}`}
                        style={{
                          fontFamily: "var(--font-body, sans-serif)",
                        }}
                      >
                        {t}
                      </span>
                    );
                  })}
                </span>

                {/* Message */}
                <span className="min-w-0 flex-1 break-words leading-6 text-txt">
                  {entry.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
