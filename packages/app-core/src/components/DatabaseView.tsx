/**
 * Database View — Supabase-style table browser + SQL editor.
 *
 * Two modes:
 *  - Table browser: sidebar with schema tree, spreadsheet-like data grid
 *  - SQL editor: code textarea with run button and results grid
 */

import { Badge, Button, Input, Textarea } from "@miladyai/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  client,
  type ColumnInfo,
  type DatabaseStatus,
  type QueryResult,
  type TableInfo,
  type TableRowsResponse,
} from "../api";
import { useApp } from "../state";
import {
  DESKTOP_CONTROL_SURFACE_CLASSNAME,
  DESKTOP_INSET_EMPTY_PANEL_CLASSNAME,
  DESKTOP_INSET_PANEL_CLASSNAME,
  DESKTOP_PAGE_CONTENT_CLASSNAME,
  DESKTOP_SEGMENTED_GROUP_CLASSNAME,
  DESKTOP_SEGMENTED_ITEM_ACTIVE_CLASSNAME,
  DESKTOP_SEGMENTED_ITEM_BASE_CLASSNAME,
  DESKTOP_SEGMENTED_ITEM_INACTIVE_CLASSNAME,
  DESKTOP_SURFACE_PANEL_CLASSNAME,
  DesktopEmptyStatePanel,
  DesktopRailSummaryCard,
} from "./desktop-surface-primitives";
import {
  APP_DESKTOP_SIDEBAR_RAIL_STANDARD_CLASSNAME,
  APP_DESKTOP_SPLIT_SHELL_CLASSNAME,
  APP_SIDEBAR_CARD_ACTIVE_CLASSNAME,
  APP_SIDEBAR_CARD_BASE_CLASSNAME,
  APP_SIDEBAR_CARD_INACTIVE_CLASSNAME,
  APP_SIDEBAR_INNER_CLASSNAME,
  APP_SIDEBAR_PILL_CLASSNAME,
  APP_SIDEBAR_RAIL_CLASSNAME,
  APP_SIDEBAR_SCROLL_REGION_CLASSNAME,
  APP_SIDEBAR_SEARCH_INPUT_CLASSNAME,
} from "./sidebar-shell-styles";

const DATABASE_SHELL_CLASS = APP_DESKTOP_SPLIT_SHELL_CLASSNAME;
const DATABASE_SIDEBAR_CLASS = APP_DESKTOP_SIDEBAR_RAIL_STANDARD_CLASSNAME;
const DATABASE_INFO_PANEL_CLASS = `${DESKTOP_INSET_PANEL_CLASSNAME} rounded-[18px] px-3 py-3 text-[11px] text-muted`;
const DATABASE_EMPTY_HINT_CLASS = `${DESKTOP_INSET_EMPTY_PANEL_CLASSNAME} rounded-[18px] px-3 py-4 text-center text-xs text-muted`;
const DATABASE_HISTORY_BUTTON_CLASS = `h-auto w-full justify-start rounded-[18px] px-3 py-2 text-left text-[11px] font-mono ${DESKTOP_CONTROL_SURFACE_CLASSNAME}`;
const DATABASE_REFRESH_BUTTON_CLASS = `h-10 w-full justify-start rounded-[18px] px-4 text-xs font-semibold ${DESKTOP_CONTROL_SURFACE_CLASSNAME}`;

type DbView = "tables" | "query";
type SortDir = "asc" | "desc" | null;

/** Format a cell value for display. */
function formatCell(val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "object") {
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }
  return String(val);
}

/** Abbreviated type label for column badges. */
function typeLabel(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("int")) return "int";
  if (t.includes("serial")) return "serial";
  if (t.includes("bool")) return "bool";
  if (
    t.includes("float") ||
    t.includes("double") ||
    t.includes("numeric") ||
    t.includes("real")
  )
    return "float";
  if (t.includes("json")) return "json";
  if (t.includes("uuid")) return "uuid";
  if (t.includes("timestamp")) return "time";
  if (t.includes("date")) return "date";
  if (t.includes("text") || t.includes("char") || t.includes("varchar"))
    return "text";
  if (t.includes("vector")) return "vector";
  if (t.includes("bytea")) return "bytes";
  return type.slice(0, 6);
}

/** Color for column type badge. */
function typeBadgeColor(type: string): string {
  const t = type.toLowerCase();
  if (
    t.includes("int") ||
    t.includes("serial") ||
    t.includes("float") ||
    t.includes("numeric") ||
    t.includes("real") ||
    t.includes("double")
  )
    return "text-accent-fg bg-accent/12";
  if (t.includes("bool")) return "text-ok bg-ok/10";
  if (t.includes("json")) return "text-warn bg-warn/10";
  if (t.includes("uuid")) return "text-accent bg-accent/10";
  if (t.includes("timestamp") || t.includes("date"))
    return "text-danger bg-danger/10";
  if (t.includes("text") || t.includes("char"))
    return "text-muted-strong bg-bg-hover";
  if (t.includes("vector")) return "text-accent bg-accent/12";
  return "text-muted-strong bg-bg-hover";
}

function CellPopover({
  value,
  onClose,
}: {
  value: string;
  onClose: () => void;
}) {
  const { t } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-card/60 backdrop-blur-md border border-border/40 shadow-[0_8px_30px_rgba(var(--accent-rgb),0.15)] rounded-xl p-4 max-w-[500px] max-h-[300px] overflow-auto"
      style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
    >
      <div className="flex items-center justify-between mb-3 border-b border-border/40 pb-2">
        <span className="text-xs text-muted uppercase font-bold tracking-wider">
          {t("databaseview.CellValue")}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="w-6 h-6 rounded-full transition-[background-color,color,box-shadow] hover:bg-bg-hover hover:text-txt hover:shadow-[0_0_10px_rgba(var(--accent-rgb),0.2)]"
          onClick={onClose}
        >
          ×
        </Button>
      </div>
      <pre className="text-xs text-txt font-mono whitespace-pre-wrap break-all m-0 bg-bg/40 p-3 rounded-lg border border-border/40">
        {value}
      </pre>
    </div>
  );
}

function ResultsGrid({
  columns,
  rows,
  columnMeta,
  sortCol,
  sortDir,
  onSort,
  onCellClick,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
  columnMeta?: Map<string, ColumnInfo>;
  sortCol?: string;
  sortDir?: SortDir;
  onSort?: (col: string) => void;
  onCellClick?: (value: string) => void;
}) {
  const { t } = useApp();
  return (
    <div
      className="overflow-auto border border-border/40 bg-card/40 backdrop-blur-md rounded-2xl shadow-inner"
      style={{ maxHeight: "calc(100vh - 340px)" }}
    >
      <table className="w-full border-collapse text-[12px] font-mono">
        <thead className="sticky top-0 z-10 backdrop-blur-xl bg-bg/80 border-b border-border/40 shadow-sm">
          <tr>
            {/* Row number column */}
            <th className="w-[50px] min-w-[50px] px-3 py-2.5 text-[10px] text-muted font-medium text-right border-r border-border/40">
              #
            </th>
            {columns.map((col) => {
              const meta = columnMeta?.get(col);
              const isSorted = sortCol === col;
              return (
                <th
                  key={col}
                  className="px-4 py-2.5 text-left border-r border-border/40 whitespace-nowrap cursor-pointer select-none hover:bg-bg-hover transition-colors group"
                  onClick={() => onSort?.(col)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-txt font-semibold group-hover:text-txt transition-colors">
                      {col}
                    </span>
                    {meta && (
                      <Badge
                        variant="outline"
                        className={`text-[9px] px-1.5 py-0 border-none font-medium ${typeBadgeColor(meta.type)}`}
                      >
                        {typeLabel(meta.type)}
                      </Badge>
                    )}
                    {meta?.isPrimaryKey && (
                      <Badge
                        variant="outline"
                        className="border-none bg-accent/16 px-1.5 py-0 text-[9px] font-bold text-accent-fg shadow-sm"
                      >
                        PK
                      </Badge>
                    )}
                    {isSorted && (
                      <span className="text-[10px] text-[var(--accent)]">
                        {sortDir === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={JSON.stringify(row)}
              className="border-b border-border/20 hover:bg-accent/10 transition-colors group"
            >
              <td className="px-3 py-2 text-[10px] text-muted text-right border-r border-border/30 bg-bg/20 tabular-nums group-hover:text-txt/70 transition-colors">
                {i + 1}
              </td>
              {columns.map((col) => {
                const raw = row[col];
                const display = formatCell(raw);
                const isNull = raw === null || raw === undefined;
                const isExpandable = display.length > 40 && !!onCellClick;
                return (
                  <td
                    key={col}
                    className="px-4 py-2 border-r border-border/20 max-w-[280px] truncate cursor-default transition-colors"
                    title={display}
                    onClick={() => {
                      if (isExpandable) onCellClick(display);
                    }}
                    onKeyDown={(e) => {
                      if (!isExpandable) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onCellClick(display);
                      }
                    }}
                    role={isExpandable ? "button" : undefined}
                    tabIndex={isExpandable ? 0 : undefined}
                  >
                    {isNull ? (
                      <span className="text-[var(--muted)] italic opacity-50">
                        {t("databaseview.NULL")}
                      </span>
                    ) : (
                      <span className="text-[var(--txt)]">{display}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PaginationBar({
  total,
  offset,
  limit,
  onPrev,
  onNext,
}: {
  total: number;
  offset: number;
  limit: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { t } = useApp();
  const start = offset + 1;
  const end = Math.min(offset + limit, total);
  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;

  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/40 bg-card/60 backdrop-blur-md rounded-b-2xl text-[11px] text-muted">
      <span className="font-medium">
        {total.toLocaleString()} {t("databaseview.row")}
        {total !== 1 ? "s" : ""}
        {total > 0 && ` · showing ${start}-${end}`}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-auto min-h-[1.75rem] whitespace-normal break-words rounded-lg border-border/50 bg-bg/50 py-1 text-left text-[11px] backdrop-blur-sm transition-[border-color,color,box-shadow] hover:border-accent hover:text-txt hover:shadow-[0_0_10px_rgba(var(--accent-rgb),0.2)]"
          disabled={!hasPrev}
          onClick={onPrev}
        >
          {t("databaseview.Prev")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-auto min-h-[1.75rem] whitespace-normal break-words rounded-lg border-border/50 bg-bg/50 py-1 text-left text-[11px] backdrop-blur-sm transition-[border-color,color,box-shadow] hover:border-accent hover:text-txt hover:shadow-[0_0_10px_rgba(var(--accent-rgb),0.2)]"
          disabled={!hasNext}
          onClick={onNext}
        >
          {t("onboarding.next")}
        </Button>
      </div>
    </div>
  );
}

export function DatabaseView({ leftNav }: { leftNav?: ReactNode }) {
  const { t } = useApp();
  const showExternalSidebar = Boolean(leftNav);
  const [dbStatus, setDbStatus] = useState<DatabaseStatus | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [tableData, setTableData] = useState<TableRowsResponse | null>(null);
  const [columnMeta, setColumnMeta] = useState<Map<string, ColumnInfo>>(
    new Map(),
  );
  const [view, setView] = useState<DbView>("tables");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sortCol, setSortCol] = useState("");
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [rowOffset, setRowOffset] = useState(0);
  const [cellInspect, setCellInspect] = useState<string | null>(null);

  // SQL editor state
  const [queryText, setQueryText] = useState("");
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryHistory, setQueryHistory] = useState<string[]>([]);

  const ROW_LIMIT = 50;

  const loadStatus = useCallback(async (): Promise<DatabaseStatus | null> => {
    try {
      const status = await client.getDatabaseStatus();
      setDbStatus(status);
      return status;
    } catch {
      return null;
    }
  }, []);

  const loadTables = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const { tables: t } = await client.getDatabaseTables();
      setTables(t);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "error";
      // Don't show error if database is simply not connected (cloud mode, agent not running)
      if (!msg.includes("Database not available")) {
        setErrorMessage(`Failed to load tables: ${msg}`);
      }
    }
    setLoading(false);
  }, []);

  const loadTableData = useCallback(
    async (
      tableName: string,
      opts?: { sort?: string; order?: "asc" | "desc"; offset?: number },
    ) => {
      setLoading(true);
      setErrorMessage("");
      try {
        const data = await client.getDatabaseRows(tableName, {
          limit: ROW_LIMIT,
          offset: opts?.offset ?? 0,
          sort: opts?.sort,
          order: opts?.order,
        });
        setTableData(data);
        setSelectedTable(tableName);

        // Get column metadata for the table
        const info = tables.find((t) => t.name === tableName);
        if (info?.columns) {
          const meta = new Map<string, ColumnInfo>();
          for (const col of info.columns) meta.set(col.name, col);
          setColumnMeta(meta);
        }
      } catch (err) {
        setErrorMessage(
          `Failed to load table: ${err instanceof Error ? err.message : "error"}`,
        );
      }
      setLoading(false);
    },
    [tables],
  );

  const handleSort = useCallback(
    (col: string) => {
      let newDir: SortDir;
      if (sortCol !== col) {
        newDir = "asc";
      } else if (sortDir === "asc") {
        newDir = "desc";
      } else {
        newDir = null;
      }
      setSortCol(newDir ? col : "");
      setSortDir(newDir);
      setRowOffset(0);
      if (selectedTable) {
        loadTableData(selectedTable, {
          sort: newDir ? col : undefined,
          order: newDir ?? undefined,
          offset: 0,
        });
      }
    },
    [sortCol, sortDir, selectedTable, loadTableData],
  );

  const handleSelectTable = useCallback(
    (tableName: string) => {
      setSortCol("");
      setSortDir(null);
      setRowOffset(0);
      loadTableData(tableName);
    },
    [loadTableData],
  );

  const handlePrev = useCallback(() => {
    const newOffset = Math.max(0, rowOffset - ROW_LIMIT);
    setRowOffset(newOffset);
    loadTableData(selectedTable, {
      sort: sortDir ? sortCol : undefined,
      order: sortDir ?? undefined,
      offset: newOffset,
    });
  }, [rowOffset, selectedTable, sortCol, sortDir, loadTableData]);

  const handleNext = useCallback(() => {
    const newOffset = rowOffset + ROW_LIMIT;
    setRowOffset(newOffset);
    loadTableData(selectedTable, {
      sort: sortDir ? sortCol : undefined,
      order: sortDir ?? undefined,
      offset: newOffset,
    });
  }, [rowOffset, selectedTable, sortCol, sortDir, loadTableData]);

  const runQuery = useCallback(async () => {
    if (!queryText.trim()) return;
    setQueryLoading(true);
    setErrorMessage("");
    try {
      const result = await client.executeDatabaseQuery(queryText);
      setQueryResult(result);
      setQueryHistory((prev) => {
        const next = [queryText, ...prev.filter((q) => q !== queryText)];
        return next.slice(0, 20);
      });
    } catch (err) {
      setErrorMessage(
        `Query failed: ${err instanceof Error ? err.message : "error"}`,
      );
    }
    setQueryLoading(false);
  }, [queryText]);

  useEffect(() => {
    const init = async () => {
      const status = await loadStatus();
      if (status?.connected) {
        await loadTables();
      }
    };
    void init();
  }, [loadStatus, loadTables]);

  const filteredTables = useMemo(
    () =>
      tables.filter(
        (t) =>
          !sidebarSearch ||
          t.name.toLowerCase().includes(sidebarSearch.toLowerCase()),
      ),
    [tables, sidebarSearch],
  );

  const viewToggle = (
    <div
      className={DESKTOP_SEGMENTED_GROUP_CLASSNAME}
      role="tablist"
      aria-label="Database editor modes"
    >
      <Button
        variant="ghost"
        size="sm"
        role="tab"
        aria-selected={view === "tables"}
        className={`${DESKTOP_SEGMENTED_ITEM_BASE_CLASSNAME} h-10 flex-1 ${
          view === "tables"
            ? DESKTOP_SEGMENTED_ITEM_ACTIVE_CLASSNAME
            : DESKTOP_SEGMENTED_ITEM_INACTIVE_CLASSNAME
        }`}
        onClick={() => setView("tables")}
      >
        {t("databaseview.TableEditor")}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        role="tab"
        aria-selected={view === "query"}
        className={`${DESKTOP_SEGMENTED_ITEM_BASE_CLASSNAME} h-10 flex-1 ${
          view === "query"
            ? DESKTOP_SEGMENTED_ITEM_ACTIVE_CLASSNAME
            : DESKTOP_SEGMENTED_ITEM_INACTIVE_CLASSNAME
        }`}
        onClick={() => setView("query")}
      >
        {t("databaseview.SQLEditor")}
      </Button>
    </div>
  );

  const sidebarSummary = (
    <DesktopRailSummaryCard className="mt-4">
      <div className="flex items-center gap-2 text-sm font-medium text-txt">
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            dbStatus?.connected
              ? "bg-ok shadow-[0_0_8px_rgba(34,197,94,0.5)]"
              : "bg-danger"
          }`}
        />
        <span>{dbStatus?.provider ?? t("onboarding.connecting")}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/75">
        <span className={APP_SIDEBAR_PILL_CLASSNAME}>
          {tables.length} {t("databaseview.tables")}
        </span>
        <span className={APP_SIDEBAR_PILL_CLASSNAME}>
          {view === "tables"
            ? t("databaseview.TableEditor")
            : t("databaseview.SQLEditor")}
        </span>
        {selectedTable ? (
          <span className="rounded-full border border-accent/25 bg-accent/8 px-2.5 py-1 text-accent">
            {selectedTable}
          </span>
        ) : null}
      </div>
    </DesktopRailSummaryCard>
  );

  if (showExternalSidebar) {
    return (
      <div className={DATABASE_SHELL_CLASS}>
        <aside className={DATABASE_SIDEBAR_CLASS}>
          <div className={APP_SIDEBAR_INNER_CLASSNAME}>
            <div className="space-y-3 pt-4">
              {leftNav}
              {viewToggle}
              {sidebarSummary}
              <Button
                variant="outline"
                size="sm"
                className={DATABASE_REFRESH_BUTTON_CLASS}
                onClick={async () => {
                  const status = await loadStatus();
                  if (status?.connected) {
                    await loadTables();
                  }
                }}
              >
                {t("common.refresh")}
              </Button>
            </div>

            <div className="mt-4 h-px bg-border/30" />

            {view === "tables" ? (
              <>
                <div className="space-y-3 pt-4">
                  <Input
                    type="text"
                    placeholder={t("databaseview.FilterTables")}
                    value={sidebarSearch}
                    onChange={(e) => setSidebarSearch(e.target.value)}
                    className={APP_SIDEBAR_SEARCH_INPUT_CLASSNAME}
                  />
                  <div className="text-[10px] text-muted uppercase font-bold tracking-widest px-2 bg-bg/50 py-1.5 rounded-lg border border-border/30 inline-flex items-center shadow-inner">
                    {t("databaseview.Tables")} ({filteredTables.length})
                  </div>
                </div>

                <div
                  className={`mt-3 space-y-1.5 ${APP_SIDEBAR_SCROLL_REGION_CLASSNAME}`}
                >
                  {loading && tables.length === 0 ? (
                    <div className={DATABASE_EMPTY_HINT_CLASS}>
                      {t("databaseview.Loading")}
                    </div>
                  ) : (
                    filteredTables.map((table) => (
                      <Button
                        variant="ghost"
                        key={table.name}
                        onClick={() => handleSelectTable(table.name)}
                        className={`${APP_SIDEBAR_CARD_BASE_CLASSNAME} gap-2 ${
                          selectedTable === table.name
                            ? APP_SIDEBAR_CARD_ACTIVE_CLASSNAME
                            : APP_SIDEBAR_CARD_INACTIVE_CLASSNAME
                        }`}
                      >
                        <span
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border text-sm font-bold ${
                            selectedTable === table.name
                              ? "border-accent/30 bg-accent/18 text-txt-strong"
                              : "border-border/50 bg-bg-accent/80 text-muted"
                          }`}
                        >
                          {table.name.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1 text-left">
                          <span className="block truncate text-sm font-semibold leading-snug">
                            {table.name}
                          </span>
                          <span className="mt-1 block text-[11px] leading-relaxed text-muted/85">
                            {(table.rowCount ?? 0).toLocaleString()} rows
                          </span>
                        </span>
                      </Button>
                    ))
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="space-y-3 pt-4">
                  <div className={DATABASE_INFO_PANEL_CLASS}>
                    Write ad-hoc queries and inspect results without leaving the
                    database workspace.
                  </div>
                </div>

                {queryHistory.length > 0 ? (
                  <div
                    className={`mt-3 space-y-1.5 ${APP_SIDEBAR_SCROLL_REGION_CLASSNAME}`}
                  >
                    <div className="text-[10px] text-muted uppercase tracking-[0.16em]">
                      {t("databaseview.RecentQueries")}
                    </div>
                    {queryHistory.slice(0, 8).map((q) => (
                      <Button
                        variant="ghost"
                        key={q}
                        className={DATABASE_HISTORY_BUTTON_CLASS}
                        onClick={() => setQueryText(q)}
                      >
                        <span className="truncate">{q}</span>
                      </Button>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </aside>

        <div
          className={`${DESKTOP_PAGE_CONTENT_CLASSNAME} flex flex-col bg-transparent`}
        >
          {errorMessage ? (
            <div className="m-5 rounded-xl border border-danger/35 bg-danger/10 px-4 py-3 text-sm text-danger">
              {errorMessage}
            </div>
          ) : null}

          {dbStatus && !dbStatus.connected ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-auto p-6">
              <section
                className={`${DESKTOP_SURFACE_PANEL_CLASSNAME} px-5 py-5 sm:px-6`}
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                  Database
                </div>
                <h1 className="mt-1 text-2xl font-semibold text-txt-strong">
                  Table Browser
                </h1>
              </section>

              <div
                className={`${DESKTOP_SURFACE_PANEL_CLASSNAME} mt-4 flex min-h-[18rem] flex-1 items-center justify-center p-6`}
              >
                <DesktopEmptyStatePanel
                  className="w-full min-h-[14rem]"
                  title={t("databaseview.DatabaseNotAvailab")}
                  description={t("databaseview.TheDatabaseViewer")}
                />
              </div>
            </div>
          ) : view === "tables" ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-auto p-6">
              {!selectedTable ? (
                <>
                  <section
                    className={`${DESKTOP_SURFACE_PANEL_CLASSNAME} px-5 py-5 sm:px-6`}
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                      Database
                    </div>
                    <h1 className="mt-1 text-2xl font-semibold text-txt-strong">
                      Table Browser
                    </h1>
                  </section>

                  <div
                    className={`${DESKTOP_SURFACE_PANEL_CLASSNAME} mt-4 flex min-h-[18rem] flex-1 items-center justify-center p-6`}
                  >
                    <DesktopEmptyStatePanel
                      className="w-full min-h-[14rem]"
                      title={t("databaseview.SelectATable")}
                      description={t("databaseview.ChooseATableFrom")}
                    />
                  </div>
                </>
              ) : loading && !tableData ? (
                <div
                  className={`${DESKTOP_SURFACE_PANEL_CLASSNAME} flex flex-1 items-center justify-center px-6 py-10 text-sm font-medium italic text-muted`}
                >
                  {t("databaseview.Loading")}
                </div>
              ) : tableData ? (
                <>
                  <section
                    className={`${DESKTOP_SURFACE_PANEL_CLASSNAME} px-5 py-5 sm:px-6`}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                          Database
                        </div>
                        <h1 className="mt-1 text-2xl font-semibold text-txt-strong">
                          {selectedTable}
                        </h1>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {columnMeta.size > 0 && (
                          <span className={APP_SIDEBAR_PILL_CLASSNAME}>
                            {columnMeta.size} {t("databaseview.columns")}
                          </span>
                        )}
                        <span className={APP_SIDEBAR_PILL_CLASSNAME}>
                          {tableData.total.toLocaleString()} rows
                        </span>
                      </div>
                    </div>
                  </section>

                  <div
                    className={`${DESKTOP_SURFACE_PANEL_CLASSNAME} mt-4 flex flex-1 min-h-0 flex-col overflow-hidden p-3`}
                  >
                    <div className="flex-1 min-h-0">
                      {tableData.rows.length === 0 ? (
                        <DesktopEmptyStatePanel
                          className="min-h-[14rem]"
                          title={t("databaseview.TableIsEmpty")}
                          description="This table is connected and available, but it does not have any rows yet."
                        />
                      ) : (
                        <ResultsGrid
                          columns={tableData.columns}
                          rows={tableData.rows}
                          columnMeta={columnMeta}
                          sortCol={sortCol}
                          sortDir={sortDir}
                          onSort={handleSort}
                          onCellClick={(v) => setCellInspect(v)}
                        />
                      )}
                    </div>

                    <PaginationBar
                      total={tableData.total}
                      offset={rowOffset}
                      limit={ROW_LIMIT}
                      onPrev={handlePrev}
                      onNext={handleNext}
                    />
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-auto p-6">
              <section
                className={`${DESKTOP_SURFACE_PANEL_CLASSNAME} px-5 py-5 sm:px-6`}
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                  Database
                </div>
                <h1 className="mt-1 text-2xl font-semibold text-txt-strong">
                  SQL Workspace
                </h1>
              </section>

              <div
                className={`${DESKTOP_SURFACE_PANEL_CLASSNAME} mt-4 flex flex-col p-4`}
              >
                <div className="relative group">
                  <div className="absolute -inset-[1px] bg-gradient-to-r from-accent/0 via-accent/30 to-accent/0 rounded-2xl opacity-0 group-focus-within:opacity-100 blur transition-opacity duration-500" />
                  <Textarea
                    value={queryText}
                    onChange={(e) => setQueryText(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                        e.preventDefault();
                        runQuery();
                      }
                    }}
                    placeholder={t("databaseview.SELECTFROMMemori")}
                    rows={6}
                    className="w-full relative bg-bg/80 backdrop-blur-md border-border/50 text-txt text-sm font-mono resize-y leading-relaxed rounded-xl focus-visible:ring-accent focus-visible:border-accent custom-scrollbar shadow-inner"
                    spellCheck={false}
                  />
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <Button
                    variant="default"
                    size="sm"
                    className="h-auto min-h-[2.25rem] whitespace-normal break-words rounded-xl bg-accent px-6 py-1.5 text-left text-xs font-bold text-accent-fg shadow-[0_0_15px_rgba(var(--accent-rgb),0.4)] transition-[opacity,transform,box-shadow] hover:scale-[1.02] hover:opacity-90 disabled:opacity-40"
                    disabled={queryLoading || !queryText.trim()}
                    onClick={runQuery}
                  >
                    {queryLoading
                      ? t("common.running", { defaultValue: "Running..." })
                      : t("databaseview.runQuery", {
                          defaultValue: "Run Query",
                        })}
                  </Button>
                  <kbd className="text-[10px] text-muted font-mono bg-bg/50 px-2 py-1 rounded-md border border-border/30 shadow-inner tracking-wider">
                    {navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}{" "}
                    {t("onboarding.enter")}
                  </kbd>
                  {queryResult && (
                    <div className="text-xs text-muted ml-auto bg-bg/50 px-3 py-1.5 rounded-lg border border-border/30 font-medium shadow-inner tracking-wide">
                      <span className="text-txt">{queryResult.rowCount}</span>{" "}
                      {t("databaseview.row")}
                      {queryResult.rowCount !== 1 ? "s" : ""} ·{" "}
                      <span className="text-txt">
                        {queryResult.durationMs}ms
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {queryResult && queryResult.rows.length > 0 ? (
                <div
                  className={`${DESKTOP_SURFACE_PANEL_CLASSNAME} mt-4 flex flex-1 min-h-0 flex-col overflow-hidden p-3`}
                >
                  <ResultsGrid
                    columns={queryResult.columns}
                    rows={queryResult.rows}
                    onCellClick={(v) => setCellInspect(v)}
                  />
                </div>
              ) : null}

              {queryResult && queryResult.rows.length === 0 ? (
                <DesktopEmptyStatePanel
                  className="mt-4 min-h-[12rem]"
                  title={t("databaseview.QueryReturnedNoRo")}
                  description="The query completed successfully but did not return any rows."
                />
              ) : null}
            </div>
          )}
        </div>

        {cellInspect !== null && (
          <CellPopover
            value={cellInspect}
            onClose={() => setCellInspect(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {!showExternalSidebar && (
        <div className="flex items-center gap-3 p-3 bg-card/60 backdrop-blur-xl border border-border/40 rounded-2xl shadow-sm flex-wrap">
          <div className="flex items-center gap-2 text-xs text-muted font-medium bg-bg/50 px-3 py-1.5 rounded-lg border border-border/30">
            {dbStatus ? (
              <>
                <span
                  className={`h-2 w-2 rounded-full shadow-[0_0_8px_currentColor] ${dbStatus.connected ? "bg-ok text-ok" : "bg-danger text-danger"}`}
                />
                <span className="tracking-wide">{dbStatus.provider}</span>
                <span className="opacity-40">·</span>
                <span>
                  {dbStatus.tableCount} {t("databaseview.tables")}
                </span>
              </>
            ) : (
              <span>{t("onboarding.connecting")}</span>
            )}
          </div>

          <div className="flex-1" />

          {!showExternalSidebar && viewToggle}

          <Button
            variant="outline"
            size="sm"
            className="h-auto min-h-[2.25rem] whitespace-normal break-words rounded-xl border-border/50 bg-bg/50 px-4 py-1.5 text-xs font-medium backdrop-blur-md shadow-sm transition-[border-color,color,transform,box-shadow] duration-300 hover:border-accent hover:text-txt hover:shadow-[0_0_15px_rgba(var(--accent-rgb),0.3)]"
            onClick={async () => {
              const status = await loadStatus();
              if (status?.connected) {
                await loadTables();
              }
            }}
          >
            {t("common.refresh")}
          </Button>
        </div>
      )}

      {dbStatus && !dbStatus.connected && (
        <div className="p-4 border border-border/40 bg-card/60 backdrop-blur-md rounded-2xl text-muted text-sm shadow-sm">
          <p className="m-0 mb-2 font-medium text-txt tracking-wide">
            {t("databaseview.DatabaseNotAvailab")}
          </p>
          <p className="m-0 text-xs">{t("databaseview.TheDatabaseViewer")}</p>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 border border-danger/50 bg-danger/10 text-danger text-sm rounded-xl mb-2 flex items-center justify-between shadow-[0_0_15px_rgba(231,76,60,0.15)] backdrop-blur-md">
          <span className="font-medium tracking-wide">{errorMessage}</span>
          <Button
            variant="ghost"
            size="icon"
            className="w-6 h-6 rounded-full text-danger hover:bg-danger/20 hover:text-danger-foreground transition-colors"
            onClick={() => setErrorMessage("")}
          >
            ×
          </Button>
        </div>
      )}

      {view === "tables" ? (
        /* ── Table Editor ──────────────────────────────────────── */
        <div className="flex flex-1 min-h-0 gap-4">
          {(showExternalSidebar || !sidebarCollapsed) && (
            <aside
              className={`overflow-hidden rounded-2xl border shadow-sm ${APP_SIDEBAR_RAIL_CLASSNAME} ${
                showExternalSidebar
                  ? "w-[21rem] max-w-[352px] shrink-0"
                  : "w-[220px] flex-shrink-0"
              }`}
            >
              <div
                className={
                  showExternalSidebar
                    ? APP_SIDEBAR_INNER_CLASSNAME
                    : "p-3 flex flex-col h-full gap-3"
                }
              >
                {showExternalSidebar && (
                  <>
                    {sidebarSummary}
                    <div className="space-y-3 pt-4">
                      {viewToggle}
                      {leftNav}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-10 w-full justify-start rounded-xl px-4 text-xs font-semibold shadow-sm"
                        onClick={async () => {
                          const status = await loadStatus();
                          if (status?.connected) {
                            await loadTables();
                          }
                        }}
                      >
                        {t("common.refresh")}
                      </Button>
                    </div>
                    <div className="h-px bg-border/30" />
                  </>
                )}

                <div className="relative">
                  <Input
                    type="text"
                    placeholder={t("databaseview.FilterTables")}
                    value={sidebarSearch}
                    onChange={(e) => setSidebarSearch(e.target.value)}
                    className={`w-full pr-8 text-xs ${APP_SIDEBAR_SEARCH_INPUT_CLASSNAME}`}
                  />
                </div>
                <div className="text-[10px] text-muted uppercase font-bold tracking-widest px-2 bg-bg/50 py-1.5 rounded-lg border border-border/30 inline-flex items-center shadow-inner">
                  {t("databaseview.Tables")} ({filteredTables.length})
                </div>
                {loading && tables.length === 0 ? (
                  <div className="text-xs text-muted px-2 py-4 italic text-center opacity-70">
                    {t("databaseview.Loading")}
                  </div>
                ) : (
                  <div
                    className={`flex flex-col gap-1 flex-1 overflow-auto pr-1 custom-scrollbar ${
                      showExternalSidebar
                        ? APP_SIDEBAR_SCROLL_REGION_CLASSNAME
                        : ""
                    }`}
                  >
                    {filteredTables.map((t) => (
                      <Button
                        variant="ghost"
                        key={t.name}
                        onClick={() => handleSelectTable(t.name)}
                        className={`${APP_SIDEBAR_CARD_BASE_CLASSNAME} gap-2 ${
                          selectedTable === t.name
                            ? APP_SIDEBAR_CARD_ACTIVE_CLASSNAME
                            : APP_SIDEBAR_CARD_INACTIVE_CLASSNAME
                        }`}
                      >
                        <span
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border text-sm font-bold ${
                            selectedTable === t.name
                              ? "border-accent/30 bg-accent/18 text-txt-strong"
                              : "border-border/50 bg-bg-accent/80 text-muted"
                          }`}
                        >
                          {t.name.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1 text-left">
                          <span className="block truncate text-sm font-semibold leading-snug">
                            {t.name}
                          </span>
                          <span className="mt-1 block text-[11px] leading-relaxed text-muted/85">
                            {(t.rowCount ?? 0).toLocaleString()} rows
                          </span>
                        </span>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          )}

          {/* Toggle sidebar */}
          {!showExternalSidebar && (
            <Button
              variant="ghost"
              size="icon"
              className="my-auto flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-border/40 bg-card/50 shadow-sm text-muted transition-all hover:border-accent/40 hover:bg-bg-hover hover:text-txt"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              title={
                sidebarCollapsed
                  ? t("databaseview.showSidebar", {
                      defaultValue: "Show sidebar",
                    })
                  : t("databaseview.hideSidebar", {
                      defaultValue: "Hide sidebar",
                    })
              }
            >
              {sidebarCollapsed ? (
                <ChevronRight className="w-3.5 h-3.5" />
              ) : (
                <ChevronLeft className="w-3.5 h-3.5" />
              )}
            </Button>
          )}

          {/* Main grid area */}
          <div className="flex-1 min-w-0 flex flex-col bg-bg/10">
            {!selectedTable ? (
              <DesktopEmptyStatePanel
                className="min-h-[18rem]"
                title={t("databaseview.SelectATable")}
                description={t("databaseview.ChooseATableFrom")}
              />
            ) : loading && !tableData ? (
              <div
                className={`${DESKTOP_SURFACE_PANEL_CLASSNAME} flex flex-1 items-center justify-center px-6 py-10 text-sm font-medium italic text-muted`}
              >
                {t("databaseview.Loading")}
              </div>
            ) : tableData ? (
              <>
                <section
                  className={`${DESKTOP_SURFACE_PANEL_CLASSNAME} px-5 py-5 sm:px-6`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                        Database
                      </div>
                      <div className="mt-1 text-2xl font-semibold text-txt-strong">
                        {selectedTable}
                      </div>
                      <div className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
                        Inspect rows, sort columns, and review table structure
                        in one place.
                      </div>
                    </div>
                    {columnMeta.size > 0 && (
                      <div className="flex flex-wrap gap-2">
                        <span className={APP_SIDEBAR_PILL_CLASSNAME}>
                          {columnMeta.size} {t("databaseview.columns")}
                        </span>
                        <span className={APP_SIDEBAR_PILL_CLASSNAME}>
                          {tableData.total.toLocaleString()} rows
                        </span>
                      </div>
                    )}
                  </div>
                </section>

                <div
                  className={`${DESKTOP_SURFACE_PANEL_CLASSNAME} mt-4 flex flex-1 min-h-0 flex-col overflow-hidden p-3`}
                >
                  <div className="flex-1 min-h-0">
                    {tableData.rows.length === 0 ? (
                      <DesktopEmptyStatePanel
                        className="min-h-[14rem]"
                        title={t("databaseview.TableIsEmpty")}
                        description="This table is connected and available, but it does not have any rows yet."
                      />
                    ) : (
                      <ResultsGrid
                        columns={tableData.columns}
                        rows={tableData.rows}
                        columnMeta={columnMeta}
                        sortCol={sortCol}
                        sortDir={sortDir}
                        onSort={handleSort}
                        onCellClick={(v) => setCellInspect(v)}
                      />
                    )}
                  </div>

                  <PaginationBar
                    total={tableData.total}
                    offset={rowOffset}
                    limit={ROW_LIMIT}
                    onPrev={handlePrev}
                    onNext={handleNext}
                  />
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : (
        /* ── SQL Editor ────────────────────────────────────────── */
        <div className="flex flex-1 min-h-0 gap-4">
          {showExternalSidebar && (
            <aside
              className={`w-[21rem] max-w-[352px] shrink-0 overflow-hidden rounded-[24px] border border-border/34 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_20px_30px_-28px_rgba(15,23,42,0.18)] ${APP_SIDEBAR_RAIL_CLASSNAME}`}
            >
              <div className={APP_SIDEBAR_INNER_CLASSNAME}>
                {sidebarSummary}
                <div className="space-y-3 pt-4">
                  {viewToggle}
                  {leftNav}
                  <Button
                    variant="outline"
                    size="sm"
                    className={DATABASE_REFRESH_BUTTON_CLASS}
                    onClick={async () => {
                      const status = await loadStatus();
                      if (status?.connected) {
                        await loadTables();
                      }
                    }}
                  >
                    {t("common.refresh")}
                  </Button>
                </div>
                <div className="h-px bg-border/30" />
                <div className={DATABASE_INFO_PANEL_CLASS}>
                  Write ad-hoc queries and inspect results without leaving the
                  database workspace.
                </div>
                {queryHistory.length > 0 ? (
                  <div
                    className={`space-y-1.5 ${APP_SIDEBAR_SCROLL_REGION_CLASSNAME}`}
                  >
                    <div className="text-[10px] text-muted uppercase tracking-[0.16em]">
                      {t("databaseview.RecentQueries")}
                    </div>
                    {queryHistory.slice(0, 8).map((q) => (
                      <Button
                        variant="ghost"
                        key={q}
                        className={DATABASE_HISTORY_BUTTON_CLASS}
                        onClick={() => setQueryText(q)}
                      >
                        <span className="truncate">{q}</span>
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            </aside>
          )}

          <div
            className={`${DESKTOP_PAGE_CONTENT_CLASSNAME} flex min-h-0 flex-col gap-4 bg-transparent`}
          >
            <section
              className={`${DESKTOP_SURFACE_PANEL_CLASSNAME} px-5 py-5 sm:px-6`}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                    Database
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-txt-strong">
                    SQL Workspace
                  </div>
                  <div className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
                    Run ad-hoc queries, inspect results, and reuse recent SQL
                    from the sidebar.
                  </div>
                </div>
              </div>
            </section>

            <div
              className={`${DESKTOP_SURFACE_PANEL_CLASSNAME} flex flex-col p-4`}
            >
              <div className="relative group">
                <div className="absolute -inset-[1px] bg-gradient-to-r from-accent/0 via-accent/30 to-accent/0 rounded-2xl opacity-0 group-focus-within:opacity-100 blur transition-opacity duration-500" />
                <Textarea
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      runQuery();
                    }
                  }}
                  placeholder={t("databaseview.SELECTFROMMemori")}
                  rows={6}
                  className="w-full relative bg-bg/80 backdrop-blur-md border-border/50 text-txt text-sm font-mono resize-y leading-relaxed rounded-xl focus-visible:ring-accent focus-visible:border-accent custom-scrollbar shadow-inner"
                  spellCheck={false}
                />
              </div>
              <div className="flex items-center gap-3 mt-3">
                <Button
                  variant="default"
                  size="sm"
                  className="h-auto min-h-[2.25rem] whitespace-normal break-words rounded-xl bg-accent px-6 py-1.5 text-left text-xs font-bold text-accent-fg shadow-[0_0_15px_rgba(var(--accent-rgb),0.4)] transition-[opacity,transform,box-shadow] hover:scale-[1.02] hover:opacity-90 disabled:opacity-40"
                  disabled={queryLoading || !queryText.trim()}
                  onClick={runQuery}
                >
                  {queryLoading
                    ? t("common.running", { defaultValue: "Running..." })
                    : t("databaseview.runQuery", { defaultValue: "Run Query" })}
                </Button>
                <kbd className="text-[10px] text-muted font-mono bg-bg/50 px-2 py-1 rounded-md border border-border/30 shadow-inner tracking-wider">
                  {navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}{" "}
                  {t("onboarding.enter")}
                </kbd>
                {queryResult && (
                  <div className="text-xs text-muted ml-auto bg-bg/50 px-3 py-1.5 rounded-lg border border-border/30 font-medium shadow-inner tracking-wide">
                    <span className="text-txt">{queryResult.rowCount}</span>{" "}
                    {t("databaseview.row")}
                    {queryResult.rowCount !== 1 ? "s" : ""} ·{" "}
                    <span className="text-txt">{queryResult.durationMs}ms</span>
                  </div>
                )}
              </div>
            </div>

            {/* Query history dropdown */}
            {queryHistory.length > 0 &&
              !queryResult &&
              !showExternalSidebar && (
                <div className="border border-border/40 bg-card/40 backdrop-blur-xl rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-4 py-2.5 text-[10px] text-muted uppercase font-bold tracking-widest bg-bg/60 border-b border-border/40 shadow-inner">
                    {t("databaseview.RecentQueries")}
                  </div>
                  <div className="flex flex-col">
                    {queryHistory.slice(0, 5).map((q) => (
                      <Button
                        variant="ghost"
                        key={q}
                        className="w-full px-4 py-3 h-auto justify-start text-[11px] font-mono text-txt text-left rounded-none border-b border-border/20 hover:bg-accent/10 hover:text-txt transition-colors truncate"
                        onClick={() => setQueryText(q)}
                      >
                        <span className="truncate opacity-80 group-hover:opacity-100">
                          {q}
                        </span>
                      </Button>
                    ))}
                  </div>
                </div>
              )}

            {/* Results */}
            {queryResult && queryResult.rows.length > 0 && (
              <div className="flex-1 min-h-0">
                <ResultsGrid
                  columns={queryResult.columns}
                  rows={queryResult.rows}
                  onCellClick={(v) => setCellInspect(v)}
                />
              </div>
            )}

            {queryResult && queryResult.rows.length === 0 && (
              <div className="flex items-center justify-center p-8 border border-border/40 bg-card/60 backdrop-blur-xl rounded-2xl shadow-sm text-muted text-sm tracking-wide font-medium">
                <div className="px-6 py-4 bg-bg/50 shadow-inner rounded-xl border border-border/30">
                  {t("databaseview.QueryReturnedNoRo")}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cell inspect overlay */}
      {cellInspect !== null && (
        <CellPopover value={cellInspect} onClose={() => setCellInspect(null)} />
      )}
    </div>
  );
}
