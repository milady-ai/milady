/**
 * RuntimeView — structured runtime inspector with a left rail navigator and
 * a focused summary/detail pane.
 */

import { Button, Input, PageLayoutHeader } from "@miladyai/ui";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import {
  client,
  type RuntimeDebugSnapshot,
  type RuntimeOrderItem,
  type RuntimeServiceOrderItem,
} from "../api";
import { useApp } from "../state";
import {
  DESKTOP_CONTROL_SURFACE_ACCENT_CLASSNAME,
  DESKTOP_CONTROL_SURFACE_CLASSNAME,
  DESKTOP_CONTROL_SURFACE_COMPACT_CLASSNAME,
  DESKTOP_INPUT_SHELL_CLASSNAME,
  DESKTOP_INSET_EMPTY_PANEL_CLASSNAME,
  DESKTOP_INSET_PANEL_CLASSNAME,
  DESKTOP_PADDED_SURFACE_PANEL_CLASSNAME,
  DESKTOP_PAGE_CONTENT_CLASSNAME,
  DESKTOP_RAIL_SUMMARY_CARD_COMPACT_CLASSNAME,
  DESKTOP_SECTION_SHELL_CLASSNAME,
  DESKTOP_SURFACE_PANEL_CLASSNAME,
  DesktopEmptyStatePanel,
  DesktopPageFrame,
  DesktopRailSummaryCard,
} from "./desktop-surface-primitives";
import { formatDateTime } from "./format";
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
  APP_SIDEBAR_SECTION_HEADING_CLASSNAME,
} from "./sidebar-shell-styles";

type RuntimeSectionKey =
  | "summary"
  | "runtime"
  | "actions"
  | "providers"
  | "plugins"
  | "services"
  | "evaluators";

type RuntimeTreeSectionKey = Exclude<RuntimeSectionKey, "summary">;

const RUNTIME_SHELL_CLASSNAME = APP_DESKTOP_SPLIT_SHELL_CLASSNAME;
const RUNTIME_PANE_CLASSNAME = `${DESKTOP_PAGE_CONTENT_CLASSNAME} min-h-0`;
const RUNTIME_TOOLBAR_BUTTON_CLASSNAME = `${DESKTOP_CONTROL_SURFACE_COMPACT_CLASSNAME} ${DESKTOP_CONTROL_SURFACE_CLASSNAME}`;
const RUNTIME_TOOLBAR_BUTTON_ACCENT_CLASSNAME = `${DESKTOP_CONTROL_SURFACE_COMPACT_CLASSNAME} ${DESKTOP_CONTROL_SURFACE_ACCENT_CLASSNAME}`;
const RUNTIME_INPUT_CLASSNAME = `${DESKTOP_INPUT_SHELL_CLASSNAME} h-9 rounded-[16px] px-3 text-sm text-txt`;
const RUNTIME_SECTION_BUTTON_CLASSNAME = APP_SIDEBAR_COMPACT_CARD_CLASSNAME;

const SECTION_TAB_KEYS: Array<{
  key: RuntimeSectionKey;
  i18nKey: string;
}> = [
  {
    key: "summary",
    i18nKey: "runtimeview.Summary",
  },
  {
    key: "runtime",
    i18nKey: "runtimeview.tabRuntime",
  },
  {
    key: "actions",
    i18nKey: "runtimeview.tabActions",
  },
  {
    key: "providers",
    i18nKey: "runtimeview.tabProviders",
  },
  {
    key: "plugins",
    i18nKey: "runtimeview.tabPlugins",
  },
  {
    key: "services",
    i18nKey: "runtimeview.tabServices",
  },
  {
    key: "evaluators",
    i18nKey: "runtimeview.tabEvaluators",
  },
];

const SECTION_DESCRIPTION_KEYS: Record<RuntimeSectionKey, string> = {
  summary: "runtimeview.summaryDescription",
  runtime: "runtimeview.runtimeDescription",
  actions: "runtimeview.actionsDescription",
  providers: "runtimeview.providersDescription",
  plugins: "runtimeview.pluginsDescription",
  services: "runtimeview.servicesDescription",
  evaluators: "runtimeview.evaluatorsDescription",
};

function nodeSummary(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") {
    const compact = value.length > 100 ? `${value.slice(0, 100)}...` : value;
    return JSON.stringify(compact);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const typeTag = typeof record.__type === "string" ? record.__type : null;
    if (typeTag === "array" && typeof record.length === "number") {
      return `Array(${String(record.length)})`;
    }
    if (typeTag === "map" && typeof record.size === "number") {
      return `Map(${String(record.size)})`;
    }
    if (typeTag === "set" && typeof record.size === "number") {
      return `Set(${String(record.size)})`;
    }
    if (typeTag === "object") {
      const className =
        typeof record.className === "string" ? record.className : "Object";
      const props =
        record.properties &&
        typeof record.properties === "object" &&
        !Array.isArray(record.properties)
          ? Object.keys(record.properties as Record<string, unknown>).length
          : 0;
      return `${className} {${props}}`;
    }
    return `${typeTag ?? "Object"} {${Object.keys(record).length}}`;
  }
  return String(value);
}

function isExpandable(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (!value || typeof value !== "object") return false;
  return Object.keys(value as Record<string, unknown>).length > 0;
}

function nodeEntries(
  value: unknown,
  path: string,
): Array<{ key: string; value: unknown; path: string }> {
  if (Array.isArray(value)) {
    return value.map((entry, index) => ({
      key: `[${index}]`,
      value: entry,
      path: `${path}[${index}]`,
    }));
  }
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).map(
    ([key, entry]) => ({
      key,
      value: entry,
      path: `${path}.${key}`,
    }),
  );
}

function buildInitialExpanded(rootPath: string, value: unknown): Set<string> {
  const expanded = new Set<string>([rootPath]);
  const firstLayer = nodeEntries(value, rootPath).slice(0, 24);
  for (const entry of firstLayer) expanded.add(entry.path);
  return expanded;
}

function orderItemLabel(entry: RuntimeOrderItem): string {
  const idPart = entry.id ? ` (${entry.id})` : "";
  return `[${entry.index}] ${entry.name} :: ${entry.className}${idPart}`;
}

function TreeNode(props: {
  label: string;
  value: unknown;
  path: string;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
}) {
  const { t } = useApp();
  const { label, value, path, depth, expanded, onToggle } = props;
  const canExpand = isExpandable(value);
  const open = expanded.has(path);
  const entries = canExpand ? nodeEntries(value, path) : [];

  return (
    <div>
      <div
        className="flex items-baseline gap-1 text-xs font-mono leading-6"
        style={{ paddingLeft: `${depth * 14}px` }}
      >
        {canExpand ? (
          <Button
            variant="ghost"
            size="icon"
            type="button"
            onClick={() => onToggle(path)}
            className="h-5 w-5 shrink-0 rounded-md p-0 text-left text-muted hover:bg-bg-hover hover:text-txt"
            title={open ? t("runtimeview.Collapse") : t("runtimeview.Expand")}
          >
            {open ? "▾" : "▸"}
          </Button>
        ) : (
          <span className="inline-block w-4 text-muted">·</span>
        )}
        <span className="text-muted">{label}</span>
        <span className="min-w-0 break-all text-txt">{nodeSummary(value)}</span>
      </div>

      {canExpand && open ? (
        <div>
          {entries.map((entry) => (
            <TreeNode
              key={entry.path}
              label={entry.key}
              value={entry.value}
              path={entry.path}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function OrderCard(props: { title: string; entries: RuntimeOrderItem[] }) {
  const { t } = useApp();
  const { title, entries } = props;

  return (
    <section className={`${DESKTOP_SECTION_SHELL_CLASSNAME} p-5`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-txt">{title}</div>
        <div className={APP_SIDEBAR_PILL_CLASSNAME}>{entries.length}</div>
      </div>
      <div
        className={`${DESKTOP_INSET_PANEL_CLASSNAME} max-h-[18rem] overflow-auto px-4 py-3 text-[12px] font-mono leading-6 tabular-nums`}
      >
        {entries.length === 0 ? (
          <div className="text-muted">{t("runtimeview.none")}</div>
        ) : (
          entries.map((entry) => (
            <div
              key={`${title}-${entry.index}`}
              className="min-w-0 break-words text-txt"
            >
              {orderItemLabel(entry)}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function ServicesOrderCard(props: { entries: RuntimeServiceOrderItem[] }) {
  const { t } = useApp();
  const { entries } = props;

  return (
    <section className={`${DESKTOP_SECTION_SHELL_CLASSNAME} p-5`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-txt">
          {t("runtimeview.Services")}
        </div>
        <div className={APP_SIDEBAR_PILL_CLASSNAME}>
          {entries.length} {t("runtimeview.types")}
        </div>
      </div>
      <div
        className={`${DESKTOP_INSET_PANEL_CLASSNAME} max-h-[18rem] space-y-3 overflow-auto px-4 py-3 text-[12px] font-mono leading-6 tabular-nums`}
      >
        {entries.length === 0 ? (
          <div className="text-muted">{t("runtimeview.none")}</div>
        ) : (
          entries.map((serviceGroup) => (
            <div
              key={`${serviceGroup.serviceType}-${serviceGroup.index}`}
              className={`${DESKTOP_INSET_PANEL_CLASSNAME} px-3 py-3`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 break-words text-txt">
                  [{serviceGroup.index}] {serviceGroup.serviceType}
                </div>
                <div className={APP_SIDEBAR_PILL_CLASSNAME}>
                  {serviceGroup.count}
                </div>
              </div>
              <div className="mt-2 space-y-1 pl-3 text-muted">
                {serviceGroup.instances.map((instance) => (
                  <div
                    key={`${serviceGroup.serviceType}-${instance.index}`}
                    className="min-w-0 break-words"
                  >
                    {orderItemLabel(instance)}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function RuntimeSummaryCard(props: {
  snapshot: RuntimeDebugSnapshot;
  t: (key: string) => string;
}) {
  const { snapshot, t } = props;

  const summaryRows = [
    {
      label: t("runtimeview.runtime"),
      value: snapshot.runtimeAvailable
        ? t("runtimeview.available")
        : t("runtimeview.offline"),
    },
    { label: t("runtimeview.agent"), value: snapshot.meta.agentName },
    { label: t("runtimeview.state"), value: snapshot.meta.agentState },
    { label: t("runtimeview.model"), value: snapshot.meta.model ?? "n/a" },
    {
      label: t("runtimeview.plugins"),
      value: String(snapshot.meta.pluginCount),
    },
    {
      label: t("runtimeview.actions"),
      value: String(snapshot.meta.actionCount),
    },
    {
      label: t("runtimeview.providers"),
      value: String(snapshot.meta.providerCount),
    },
    {
      label: t("runtimeview.evaluators"),
      value: String(snapshot.meta.evaluatorCount),
    },
    {
      label: t("runtimeview.services"),
      value: String(snapshot.meta.serviceCount),
    },
  ];

  return (
    <section className={`${DESKTOP_SECTION_SHELL_CLASSNAME} p-5`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-txt">
          {t("runtimeview.Summary")}
        </div>
        <div
          className={
            snapshot.runtimeAvailable
              ? "rounded-full border border-ok/30 bg-ok/10 px-2.5 py-1 text-[11px] font-medium text-ok"
              : "rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-[11px] font-medium text-warning"
          }
        >
          {snapshot.runtimeAvailable
            ? t("runtimeview.available")
            : t("runtimeview.offline")}
        </div>
      </div>
      <div className="grid gap-2 text-xs tabular-nums">
        {summaryRows.map((row) => (
          <div
            key={row.label}
            className={`${DESKTOP_INSET_PANEL_CLASSNAME} flex items-start justify-between gap-3 px-3 py-2`}
          >
            <span className="text-muted">{row.label}</span>
            <span className="min-w-0 break-all text-right font-semibold text-txt">
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function RuntimeView({
  contentHeader,
}: {
  contentHeader?: ReactNode;
} = {}) {
  const { t } = useApp();
  const [snapshot, setSnapshot] = useState<RuntimeDebugSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] =
    useState<RuntimeSectionKey>("summary");
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [depth, setDepth] = useState(10);
  const [maxArrayLength, setMaxArrayLength] = useState(1000);
  const [maxObjectEntries, setMaxObjectEntries] = useState(1000);

  const sectionData =
    activeSection === "summary"
      ? (snapshot?.sections.runtime ?? null)
      : (snapshot?.sections[activeSection as RuntimeTreeSectionKey] ?? null);
  const rootPath =
    activeSection === "summary" ? "$runtime" : `$${activeSection}`;

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await client.getRuntimeSnapshot({
        depth,
        maxArrayLength,
        maxObjectEntries,
      });
      setSnapshot(next);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load runtime snapshot",
      );
    } finally {
      setLoading(false);
    }
  }, [depth, maxArrayLength, maxObjectEntries]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    setExpandedPaths(buildInitialExpanded(rootPath, sectionData));
  }, [rootPath, sectionData]);

  const handleTogglePath = useCallback((path: string) => {
    setExpandedPaths((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const sectionMeta: Record<RuntimeSectionKey, string> = {
    summary: snapshot
      ? `${snapshot.meta.pluginCount + snapshot.meta.providerCount + snapshot.meta.evaluatorCount} signals`
      : "overview",
    runtime: snapshot
      ? `${Object.keys(snapshot.sections.runtime ?? {}).length} roots`
      : "raw tree",
    actions: snapshot ? "registered handlers" : "actions",
    providers: snapshot ? "loaded contexts" : "providers",
    plugins: snapshot ? "active modules" : "plugins",
    services: snapshot ? "instantiated services" : "services",
    evaluators: snapshot ? "decision hooks" : "evaluators",
  };

  const getSectionCount = (sectionKey: RuntimeSectionKey) => {
    if (!snapshot) return null;
    switch (sectionKey) {
      case "summary":
        return null;
      case "runtime":
        return snapshot.runtimeAvailable ? "live" : "offline";
      case "actions":
        return String(snapshot.order.actions.length);
      case "providers":
        return String(snapshot.order.providers.length);
      case "plugins":
        return String(snapshot.order.plugins.length);
      case "services":
        return String(snapshot.order.services.length);
      case "evaluators":
        return String(snapshot.order.evaluators.length);
    }
  };

  return (
    <DesktopPageFrame>
      <div data-testid="runtime-view" className={RUNTIME_SHELL_CLASSNAME}>
        <aside className={APP_DESKTOP_SIDEBAR_RAIL_STANDARD_CLASSNAME}>
          <div className={APP_SIDEBAR_INNER_CLASSNAME}>
            <DesktopRailSummaryCard
              className={`mt-2 space-y-2 ${DESKTOP_RAIL_SUMMARY_CARD_COMPACT_CLASSNAME}`}
            >
              {/* biome-ignore lint/a11y/noLabelWithoutControl: programmatic control association is preserved */}
              <label className="flex flex-col gap-1 text-[11px] text-muted">
                <span>{t("runtimeview.depth")}</span>
                <Input
                  type="number"
                  min={1}
                  max={24}
                  value={depth}
                  onChange={(event) =>
                    setDepth(
                      Math.max(
                        1,
                        Math.min(24, Number(event.target.value) || 1),
                      ),
                    )
                  }
                  className={RUNTIME_INPUT_CLASSNAME}
                />
              </label>

              {/* biome-ignore lint/a11y/noLabelWithoutControl: programmatic control association is preserved */}
              <label className="flex flex-col gap-1 text-[11px] text-muted">
                <span>{t("runtimeview.arrayCap")}</span>
                <Input
                  type="number"
                  min={1}
                  max={5000}
                  value={maxArrayLength}
                  onChange={(event) =>
                    setMaxArrayLength(
                      Math.max(
                        1,
                        Math.min(5000, Number(event.target.value) || 1),
                      ),
                    )
                  }
                  className={RUNTIME_INPUT_CLASSNAME}
                />
              </label>

              {/* biome-ignore lint/a11y/noLabelWithoutControl: programmatic control association is preserved */}
              <label className="flex flex-col gap-1 text-[11px] text-muted">
                <span>{t("runtimeview.objectCap")}</span>
                <Input
                  type="number"
                  min={1}
                  max={5000}
                  value={maxObjectEntries}
                  onChange={(event) =>
                    setMaxObjectEntries(
                      Math.max(
                        1,
                        Math.min(5000, Number(event.target.value) || 1),
                      ),
                    )
                  }
                  className={RUNTIME_INPUT_CLASSNAME}
                />
              </label>

              <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => void loadSnapshot()}
                  disabled={loading}
                  className={
                    loading
                      ? RUNTIME_TOOLBAR_BUTTON_ACCENT_CLASSNAME
                      : RUNTIME_TOOLBAR_BUTTON_CLASSNAME
                  }
                >
                  {loading ? t("runtimeview.Refreshing") : t("common.refresh")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() =>
                    setExpandedPaths(
                      buildInitialExpanded(rootPath, sectionData),
                    )
                  }
                  className={RUNTIME_TOOLBAR_BUTTON_CLASSNAME}
                  disabled={activeSection === "summary"}
                >
                  {t("runtimeview.ExpandTop")}
                </Button>
              </div>
            </DesktopRailSummaryCard>

            <div className={`mt-3 ${APP_SIDEBAR_SECTION_HEADING_CLASSNAME}`}>
              {t("runtimeview.sections")}
            </div>
            <div className={`mt-2 ${APP_SIDEBAR_SCROLL_REGION_CLASSNAME}`}>
              <div className="space-y-1.5">
                {SECTION_TAB_KEYS.map((section) => {
                  const active = section.key === activeSection;
                  return (
                    <Button
                      key={section.key}
                      variant="ghost"
                      type="button"
                      onClick={() => setActiveSection(section.key)}
                      className={`${RUNTIME_SECTION_BUTTON_CLASSNAME} ${
                        active
                          ? APP_SIDEBAR_CARD_ACTIVE_CLASSNAME
                          : APP_SIDEBAR_CARD_INACTIVE_CLASSNAME
                      }`}
                      aria-current={active ? "page" : undefined}
                    >
                      <span
                        className={
                          active
                            ? APP_SIDEBAR_COMPACT_ICON_ACTIVE_CLASSNAME
                            : APP_SIDEBAR_COMPACT_ICON_INACTIVE_CLASSNAME
                        }
                      >
                        {section.key === "summary"
                          ? "Σ"
                          : t(section.i18nKey).charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1 text-left">
                        <span className={APP_SIDEBAR_COMPACT_TITLE_CLASSNAME}>
                          {t(section.i18nKey)}
                        </span>
                        <span className={APP_SIDEBAR_COMPACT_META_CLASSNAME}>
                          {sectionMeta[section.key]}
                        </span>
                      </span>
                      {getSectionCount(section.key) ? (
                        <span className={APP_SIDEBAR_COMPACT_PILL_CLASSNAME}>
                          {getSectionCount(section.key)}
                        </span>
                      ) : null}
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>

        <div className={RUNTIME_PANE_CLASSNAME}>
          <div className="flex min-h-0 flex-1 flex-col gap-4 p-3 lg:p-4">
            {contentHeader ? (
              <PageLayoutHeader>{contentHeader}</PageLayoutHeader>
            ) : null}
            {error ? (
              <div className="rounded-[18px] border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
                {error}
              </div>
            ) : null}

            {!snapshot ? (
              <DesktopEmptyStatePanel
                className="min-h-[24rem]"
                description={t("runtimeview.loadingDescription")}
                title={
                  loading
                    ? t("runtimeview.loadingSnapshot")
                    : t("runtimeview.noSnapshotAvailable")
                }
              />
            ) : !snapshot.runtimeAvailable ? (
              <DesktopEmptyStatePanel
                className="min-h-[24rem] border-warning/25 bg-warning/10 text-warning"
                description={t("runtimeview.runtimePendingDescription")}
                title={t("runtimeview.AgentRuntimeIsNot")}
              />
            ) : activeSection === "summary" ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <OrderCard
                  title={t("runtimeview.Plugins")}
                  entries={snapshot.order.plugins}
                />
                <OrderCard
                  title={t("runtimeview.Actions")}
                  entries={snapshot.order.actions}
                />
                <OrderCard
                  title={t("runtimeview.Providers")}
                  entries={snapshot.order.providers}
                />
                <OrderCard
                  title={t("runtimeview.Evaluators")}
                  entries={snapshot.order.evaluators}
                />
                <ServicesOrderCard entries={snapshot.order.services} />
                <RuntimeSummaryCard snapshot={snapshot} t={t} />
              </div>
            ) : (
              <>
                <section className={DESKTOP_PADDED_SURFACE_PANEL_CLASSNAME}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted/70">
                        {t("runtimeview.sectionLabel")}
                      </div>
                      <div className="mt-2 text-[2rem] font-semibold leading-tight text-txt">
                        {t(
                          SECTION_TAB_KEYS.find(
                            (section) => section.key === activeSection,
                          )?.i18nKey ?? "runtimeview.runtime",
                        )}
                      </div>
                      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
                        {t(SECTION_DESCRIPTION_KEYS[activeSection])}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => setExpandedPaths(new Set([rootPath]))}
                        className={RUNTIME_TOOLBAR_BUTTON_CLASSNAME}
                      >
                        {t("runtimeview.Collapse")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() =>
                          setExpandedPaths(
                            buildInitialExpanded(rootPath, sectionData),
                          )
                        }
                        className={RUNTIME_TOOLBAR_BUTTON_CLASSNAME}
                      >
                        {t("runtimeview.ExpandTop")}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div
                      className={`${DESKTOP_INSET_PANEL_CLASSNAME} px-4 py-4`}
                    >
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted/70">
                        {t("runtimeview.path")}
                      </div>
                      <div className="mt-2 font-mono text-sm text-txt">
                        {rootPath}
                      </div>
                    </div>
                    <div
                      className={`${DESKTOP_INSET_PANEL_CLASSNAME} px-4 py-4`}
                    >
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted/70">
                        {t("runtimeview.lastUpdated")}
                      </div>
                      <div className="mt-2 text-sm font-semibold text-txt">
                        {formatDateTime(snapshot.generatedAt, {
                          fallback: "n/a",
                        })}
                      </div>
                    </div>
                    <div
                      className={`${DESKTOP_INSET_PANEL_CLASSNAME} px-4 py-4`}
                    >
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted/70">
                        {t("runtimeview.depth")}
                      </div>
                      <div className="mt-2 text-sm font-semibold text-txt">
                        {depth}
                      </div>
                    </div>
                    <div
                      className={`${DESKTOP_INSET_PANEL_CLASSNAME} px-4 py-4`}
                    >
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted/70">
                        {t("runtimeview.objectCap")}
                      </div>
                      <div className="mt-2 text-sm font-semibold text-txt">
                        {maxObjectEntries}
                      </div>
                    </div>
                  </div>
                </section>

                <section
                  className={`${DESKTOP_SURFACE_PANEL_CLASSNAME} min-h-[24rem] flex-1 overflow-auto p-4`}
                >
                  {sectionData == null ? (
                    <DesktopEmptyStatePanel
                      className={`min-h-[18rem] ${DESKTOP_INSET_EMPTY_PANEL_CLASSNAME}`}
                      description={t("runtimeview.noSectionData")}
                      title={t("runtimeview.sectionUnavailable")}
                    />
                  ) : (
                    <TreeNode
                      label={activeSection}
                      value={sectionData}
                      path={rootPath}
                      depth={0}
                      expanded={expandedPaths}
                      onToggle={handleTogglePath}
                    />
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </DesktopPageFrame>
  );
}
