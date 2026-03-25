/**
 * RuntimeView — deep runtime state inspector for advanced debugging.
 *
 * Shows:
 * - Full runtime snapshot
 * - Split sections: actions/providers/plugins/services/evaluators
 * - Explicit load order metadata
 */

import { Button, Input } from "@miladyai/ui";
import { useCallback, useEffect, useState } from "react";
import {
  client,
  type RuntimeDebugSnapshot,
  type RuntimeOrderItem,
  type RuntimeServiceOrderItem,
} from "../api";
import { useApp } from "../state";
import { formatDateTime } from "./format";

type RuntimeSectionKey =
  | "runtime"
  | "actions"
  | "providers"
  | "plugins"
  | "services"
  | "evaluators";

const SECTION_TAB_KEYS: Array<{
  key: RuntimeSectionKey;
  i18nKey: string;
}> = [
  { key: "runtime", i18nKey: "runtimeview.tabRuntime" },
  { key: "actions", i18nKey: "runtimeview.tabActions" },
  { key: "providers", i18nKey: "runtimeview.tabProviders" },
  { key: "plugins", i18nKey: "runtimeview.tabPlugins" },
  { key: "services", i18nKey: "runtimeview.tabServices" },
  { key: "evaluators", i18nKey: "runtimeview.tabEvaluators" },
];

const SECTION_DESCRIPTIONS: Record<RuntimeSectionKey, string> = {
  runtime:
    "Inspect the full serialized runtime object and expand into the raw state tree.",
  actions:
    "Review registered actions and their load order in the active runtime.",
  providers:
    "Check loaded providers, execution precedence, and which contexts are available.",
  plugins:
    "Verify plugin registration order and confirm what the runtime has loaded.",
  services: "Inspect grouped services and their instantiated implementations.",
  evaluators:
    "Review evaluator registration and ordering for agent decision loops.",
};

const RUNTIME_PANEL_CLASSNAME =
  "rounded-2xl border border-border/50 bg-card/92 shadow-sm";
const RUNTIME_SUBPANEL_CLASSNAME =
  "rounded-xl border border-border/40 bg-bg-hover/60";
const RUNTIME_TOOLBAR_BUTTON_CLASSNAME =
  "min-h-10 rounded-xl px-3 text-xs font-medium";
const RUNTIME_TAB_BUTTON_CLASSNAME =
  "min-h-10 rounded-xl border px-3 text-xs font-medium transition-colors";

function nodeSummary(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") {
    const compact = value.length > 100 ? `${value.slice(0, 100)}...` : value;
    return JSON.stringify(compact);
  }
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
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
    return value.map((entry, i) => ({
      key: `[${i}]`,
      value: entry,
      path: `${path}[${i}]`,
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
            title={open ? "Collapse" : "Expand"}
          >
            {open ? "▾" : "▸"}
          </Button>
        ) : (
          <span className="inline-block w-4 text-muted">·</span>
        )}
        <span className="text-muted">{label}</span>
        <span className="min-w-0 break-all text-txt">{nodeSummary(value)}</span>
      </div>

      {canExpand && open && (
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
      )}
    </div>
  );
}

function OrderCard(props: { title: string; entries: RuntimeOrderItem[] }) {
  const { t } = useApp();
  const { title, entries } = props;
  return (
    <div className={`${RUNTIME_PANEL_CLASSNAME} min-h-[188px] p-4`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-txt">{title}</div>
        <div className="rounded-full border border-border/50 bg-bg-hover/70 px-2.5 py-1 text-[11px] font-medium text-muted">
          {entries.length}
        </div>
      </div>
      <div className="max-h-[220px] rounded-xl border border-border/35 bg-bg-hover/40 p-3 text-[12px] font-mono leading-6 tabular-nums">
        {entries.length === 0 ? (
          <div
            role="status"
            className="rounded-lg border border-border/35 bg-bg/70 px-3 py-3 text-muted"
          >
            {t("runtimeview.none")}
          </div>
        ) : (
          <div className="max-h-[192px] overflow-auto pr-1">
            {entries.map((entry) => (
              <div
                key={`${title}-${entry.index}`}
                className="min-w-0 break-words text-txt"
              >
                {orderItemLabel(entry)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ServicesOrderCard(props: { entries: RuntimeServiceOrderItem[] }) {
  const { t } = useApp();
  const { entries } = props;
  return (
    <div className={`${RUNTIME_PANEL_CLASSNAME} min-h-[188px] p-4`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-txt">
          {t("runtimeview.Services")}
        </div>
        <div className="rounded-full border border-border/50 bg-bg-hover/70 px-2.5 py-1 text-[11px] font-medium text-muted">
          {entries.length} {t("runtimeview.types")}
        </div>
      </div>
      <div className="max-h-[220px] rounded-xl border border-border/35 bg-bg-hover/40 p-3 text-[12px] font-mono leading-6 tabular-nums">
        {entries.length === 0 ? (
          <div
            role="status"
            className="rounded-lg border border-border/35 bg-bg/70 px-3 py-3 text-muted"
          >
            {t("runtimeview.none")}
          </div>
        ) : (
          <div className="max-h-[192px] space-y-3 overflow-auto pr-1">
            {entries.map((serviceGroup) => (
              <div
                key={`${serviceGroup.serviceType}-${serviceGroup.index}`}
                className={`${RUNTIME_SUBPANEL_CLASSNAME} p-3`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 break-words text-txt">
                    [{serviceGroup.index}] {serviceGroup.serviceType}
                  </div>
                  <div className="rounded-full border border-border/40 bg-bg/80 px-2 py-0.5 text-[11px] text-muted">
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
            ))}
          </div>
        )}
      </div>
    </div>
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
    <div className={`${RUNTIME_PANEL_CLASSNAME} p-4`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-txt">
          {t("runtimeview.Summary")}
        </div>
        <div
          className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
            snapshot.runtimeAvailable
              ? "border-ok/30 bg-ok/10 text-ok"
              : "border-warning/30 bg-warning/10 text-warning"
          }`}
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
            className="flex items-start justify-between gap-3 rounded-xl border border-border/35 bg-bg-hover/50 px-3 py-2"
          >
            <span className="text-muted">{row.label}</span>
            <span className="min-w-0 break-all text-right font-semibold text-txt">
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RuntimeView() {
  const { t } = useApp();
  const [snapshot, setSnapshot] = useState<RuntimeDebugSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] =
    useState<RuntimeSectionKey>("runtime");
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  const [depth, setDepth] = useState(10);
  const [maxArrayLength, setMaxArrayLength] = useState(1000);
  const [maxObjectEntries, setMaxObjectEntries] = useState(1000);

  const sectionData = snapshot?.sections[activeSection] ?? null;
  const rootPath = `$${activeSection}`;

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
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  return (
    <div data-testid="runtime-view" className="flex flex-col gap-4 h-full">
      <section
        className={`${RUNTIME_PANEL_CLASSNAME} flex flex-col gap-4 p-4 sm:p-5`}
      >
        <div className="flex flex-col gap-1">
          <div className="text-sm font-semibold text-txt">
            Runtime snapshot controls
          </div>
          <p className="max-w-3xl text-xs leading-5 text-muted">
            Tune how much runtime data to pull into the inspector, refresh the
            snapshot, and quickly collapse or re-expand the first layer when you
            need to scan the tree.
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-[repeat(3,minmax(0,11rem))_auto_auto_auto_1fr]">
          {/* biome-ignore lint/a11y/noLabelWithoutControl: form control is associated programmatically */}
          <label className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
            <span>{t("runtimeview.depth")}</span>
            <Input
              type="number"
              min={1}
              max={24}
              value={depth}
              onChange={(e) =>
                setDepth(Math.max(1, Math.min(24, Number(e.target.value) || 1)))
              }
              className="h-10 w-full rounded-xl border-border/50 bg-bg/80 px-3 text-sm text-txt"
            />
          </label>
          {/* biome-ignore lint/a11y/noLabelWithoutControl: form control is associated programmatically */}
          <label className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
            <span>{t("runtimeview.arrayCap")}</span>
            <Input
              type="number"
              min={1}
              max={5000}
              value={maxArrayLength}
              onChange={(e) =>
                setMaxArrayLength(
                  Math.max(1, Math.min(5000, Number(e.target.value) || 1)),
                )
              }
              className="h-10 w-full rounded-xl border-border/50 bg-bg/80 px-3 text-sm text-txt"
            />
          </label>
          {/* biome-ignore lint/a11y/noLabelWithoutControl: form control is associated programmatically */}
          <label className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
            <span>{t("runtimeview.objectCap")}</span>
            <Input
              type="number"
              min={1}
              max={5000}
              value={maxObjectEntries}
              onChange={(e) =>
                setMaxObjectEntries(
                  Math.max(1, Math.min(5000, Number(e.target.value) || 1)),
                )
              }
              className="h-10 w-full rounded-xl border-border/50 bg-bg/80 px-3 text-sm text-txt"
            />
          </label>
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => void loadSnapshot()}
            disabled={loading}
            className={RUNTIME_TOOLBAR_BUTTON_CLASSNAME}
          >
            {loading ? t("runtimeview.Refreshing") : t("common.refresh")}
          </Button>
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
              setExpandedPaths(buildInitialExpanded(rootPath, sectionData))
            }
            className={RUNTIME_TOOLBAR_BUTTON_CLASSNAME}
          >
            {t("runtimeview.ExpandTop")}
          </Button>
          <div className="flex items-center lg:justify-end">
            <div className="rounded-xl border border-border/40 bg-bg-hover/60 px-3 py-2 text-xs text-muted tabular-nums">
              {snapshot
                ? `${t("runtimeview.lastUpdated")} ${formatDateTime(
                    snapshot.generatedAt,
                    {
                      fallback: "n/a",
                    },
                  )}`
                : t("runtimeview.noSnapshotLoaded")}
            </div>
          </div>
        </div>
      </section>

      {snapshot && (
        <section className="space-y-3">
          <div className="flex flex-col gap-1">
            <div className="text-sm font-semibold text-txt">
              Runtime load order overview
            </div>
            <p className="max-w-3xl text-xs leading-5 text-muted">
              Scan the high-level registration counts before drilling into the
              raw object tree below.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {SECTION_TAB_KEYS.map((tab) => {
          const active = tab.key === activeSection;
          return (
            <Button
              key={tab.key}
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => setActiveSection(tab.key)}
              className={`${RUNTIME_TAB_BUTTON_CLASSNAME} ${
                active
                  ? "border-accent/60 bg-accent/10 text-txt shadow-sm"
                  : "border-border/40 bg-bg-hover/50 text-muted-strong hover:border-border hover:bg-bg-hover hover:text-txt"
              }`}
            >
              {t(tab.i18nKey)}
            </Button>
          );
        })}
      </div>

      <div
        className={`${RUNTIME_PANEL_CLASSNAME} flex-1 min-h-[320px] overflow-auto p-3`}
      >
        {!error && snapshot?.runtimeAvailable ? (
          <div className="mb-3 flex flex-col gap-1 rounded-xl border border-border/35 bg-bg-hover/40 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold capitalize text-txt">
                {activeSection}
              </div>
              <div className="rounded-full border border-border/35 bg-bg/80 px-2.5 py-1 text-[11px] font-medium text-muted">
                {rootPath}
              </div>
            </div>
            <p className="max-w-3xl text-xs leading-5 text-muted">
              {SECTION_DESCRIPTIONS[activeSection]}
            </p>
          </div>
        ) : null}
        {error ? (
          <div
            role="alert"
            className="m-1 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
          >
            {error}
          </div>
        ) : !snapshot ? (
          <div
            role="status"
            className="m-1 rounded-xl border border-border/35 bg-bg-hover/60 px-6 py-10 text-center text-sm text-muted"
          >
            {loading
              ? t("runtimeview.loadingSnapshot")
              : t("runtimeview.noSnapshotAvailable")}
          </div>
        ) : !snapshot.runtimeAvailable ? (
          <div
            role="status"
            className="m-1 rounded-xl border border-warning/25 bg-warning/10 px-6 py-10 text-center text-sm text-warning"
          >
            {t("runtimeview.AgentRuntimeIsNot")}
          </div>
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
      </div>
    </div>
  );
}
