/**
 * Plugin list views — Features and Connectors.
 *
 * FeaturesView shows "feature" category plugins (excluding always-on hidden ones).
 * ConnectorsView shows "connector" category plugins.
 *
 * Both share the same card/field rendering via the internal PluginListView component.
 */

import { useEffect, useMemo, useState } from "react";
import { useApp } from "../AppContext.js";
import { client } from "../api-client";
import type { PluginInfo, PluginParamDef } from "../api-client";

/* ── Always-on plugins (hidden from all views) ────────────────────────── */

/**
 * Plugin IDs hidden from Features/Connectors views.
 * Core plugins are visible in Admin > Plugins instead.
 */
const ALWAYS_ON_PLUGIN_IDS = new Set([
  // Core (always loaded)
  "sql",
  "local-embedding",
  "knowledge",
  "agent-skills",
  "directives",
  "commands",
  "personality",
  "experience",
  // Optional core (shown in admin)
  "agent-orchestrator",
  "shell",
  "plugin-manager",
  "cli",
  "code",
  "edge-tts",
  "pdf",
  "scratchpad",
  "secrets-manager",
  "todo",
  "trust",
  "form",
  "goals",
  "scheduling",
  // Internal / infrastructure
  "elizacloud",
  "evm",
  "memory",
  "rolodex",
  "tts",
  "elevenlabs",
  "cron",
  "webhooks",
  "browser",
  "vision",
  "computeruse",
]);

/**
 * Toggleable capability plugins shown as quick-toggle buttons at the top
 * of the Features view. These are enabled by default but can be turned off.
 */
const CAPABILITY_TOGGLE_IDS: { id: string; label: string }[] = [
  { id: "browser", label: "Browser" },
  { id: "vision", label: "Vision" },
  { id: "computeruse", label: "Computer Use" },
];

/* ── Helpers ────────────────────────────────────────────────────────── */

const ACRONYMS = new Set([
  "API", "URL", "ID", "SSH", "SSL", "HTTP", "HTTPS", "RPC",
  "NFT", "EVM", "TLS", "DNS", "IP", "JWT", "SDK", "LLM",
]);

/** Strip plugin-id prefix and title-case the env-key into a human label. */
function autoLabel(key: string, pluginId: string): string {
  const prefixes = [
    pluginId.toUpperCase().replace(/-/g, "_") + "_",
    pluginId.toUpperCase().replace(/-/g, "") + "_",
  ];
  let remainder = key;
  for (const prefix of prefixes) {
    if (key.startsWith(prefix) && key.length > prefix.length) {
      remainder = key.slice(prefix.length);
      break;
    }
  }
  return remainder
    .split("_")
    .map((w) => (ACRONYMS.has(w) ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(" ");
}

/** Infer the best input type from the parameter definition. */
function autoFieldType(param: PluginParamDef): "text" | "password" | "boolean" | "number" | "url" {
  if (param.type === "boolean") return "boolean";
  if (param.sensitive) return "password";
  const k = param.key.toUpperCase();
  if (k.includes("URL") || k.includes("ENDPOINT")) return "url";
  if (param.type === "number" || k.includes("PORT") || k.includes("TIMEOUT") || k.includes("DELAY")) return "number";
  return "text";
}

/** Detect advanced / debug parameters that should be collapsed by default. */
function isAdvancedParam(param: PluginParamDef): boolean {
  const k = param.key.toUpperCase();
  const d = (param.description ?? "").toLowerCase();
  return (
    k.includes("EXPERIMENTAL") ||
    k.includes("DEBUG") ||
    k.includes("VERBOSE") ||
    k.includes("TELEMETRY") ||
    k.includes("BROWSER_BASE") ||
    d.includes("experimental") ||
    d.includes("advanced") ||
    d.includes("debug")
  );
}

type StatusFilter = "all" | "enabled";

/* ── Shared PluginListView ─────────────────────────────────────────── */

interface PluginListViewProps {
  /** Which category to show. */
  category: "feature" | "connector";
  /** Label used in search placeholder and empty state messages. */
  label: string;
  /** Whether to show the "Add Plugin" button. */
  showAddPlugin?: boolean;
}

function PluginListView({ category, label, showAddPlugin = false }: PluginListViewProps) {
  const {
    plugins,
    pluginStatusFilter,
    pluginSearch,
    pluginSettingsOpen,
    pluginAdvancedOpen,
    pluginSaving,
    pluginSaveSuccess,
    loadPlugins,
    handlePluginToggle,
    handlePluginConfigSave,
    setActionNotice,
    setState,
  } = useApp();

  const [pluginConfigs, setPluginConfigs] = useState<Record<string, Record<string, string>>>({});
  const [passwordVisible, setPasswordVisible] = useState<Set<string>>(new Set());
  const [addDirOpen, setAddDirOpen] = useState(false);
  const [addDirPath, setAddDirPath] = useState("");
  const [addDirLoading, setAddDirLoading] = useState(false);

  // Load plugins on mount
  useEffect(() => {
    void loadPlugins();
  }, [loadPlugins]);

  // ── Derived data ───────────────────────────────────────────────────

  /** All plugins in the target category, excluding always-on hidden plugins. */
  const categoryPlugins = useMemo(
    () =>
      plugins.filter(
        (p: PluginInfo) =>
          p.category === category &&
          !ALWAYS_ON_PLUGIN_IDS.has(p.id),
      ),
    [plugins, category],
  );

  const filtered = useMemo(() => {
    const searchLower = pluginSearch.toLowerCase();
    return categoryPlugins.filter((p: PluginInfo) => {
      const matchesStatus =
        pluginStatusFilter === "all" ||
        (pluginStatusFilter === "enabled" && p.enabled);
      const matchesSearch =
        !searchLower ||
        p.name.toLowerCase().includes(searchLower) ||
        (p.description ?? "").toLowerCase().includes(searchLower) ||
        p.id.toLowerCase().includes(searchLower);
      return matchesStatus && matchesSearch;
    });
  }, [categoryPlugins, pluginStatusFilter, pluginSearch]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      if (a.enabled && b.enabled) {
        const aNeedsConfig = a.parameters?.some((p: PluginParamDef) => p.required && !p.isSet) ?? false;
        const bNeedsConfig = b.parameters?.some((p: PluginParamDef) => p.required && !p.isSet) ?? false;
        if (aNeedsConfig !== bNeedsConfig) return aNeedsConfig ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [filtered]);

  const enabledCount = useMemo(() => categoryPlugins.filter((p: PluginInfo) => p.enabled).length, [categoryPlugins]);

  // ── Handlers ───────────────────────────────────────────────────────

  const toggleSettings = (pluginId: string) => {
    const next = new Set(pluginSettingsOpen);
    if (next.has(pluginId)) next.delete(pluginId);
    else next.add(pluginId);
    setState("pluginSettingsOpen", next);
  };

  const toggleAdvanced = (pluginId: string) => {
    const next = new Set(pluginAdvancedOpen);
    if (next.has(pluginId)) next.delete(pluginId);
    else next.add(pluginId);
    setState("pluginAdvancedOpen", next);
  };

  const handleParamChange = (pluginId: string, paramKey: string, value: string) => {
    setPluginConfigs((prev) => ({
      ...prev,
      [pluginId]: { ...prev[pluginId], [paramKey]: value },
    }));
  };

  const handleConfigSave = async (pluginId: string) => {
    const config = pluginConfigs[pluginId] ?? {};
    await handlePluginConfigSave(pluginId, config);
    setPluginConfigs((prev) => {
      const next = { ...prev };
      delete next[pluginId];
      return next;
    });
  };

  const handleConfigReset = (pluginId: string) => {
    setPluginConfigs((prev) => {
      const next = { ...prev };
      delete next[pluginId];
      return next;
    });
  };

  const togglePasswordVisibility = (fieldKey: string) => {
    setPasswordVisible((prev) => {
      const next = new Set(prev);
      if (next.has(fieldKey)) next.delete(fieldKey);
      else next.add(fieldKey);
      return next;
    });
  };

  // ── Add from directory ──────────────────────────────────────────────

  const handleAddFromDirectory = async () => {
    const trimmed = addDirPath.trim();
    if (!trimmed) return;
    setAddDirLoading(true);
    try {
      await client.installRegistryPlugin(trimmed);
      await loadPlugins();
      setAddDirPath("");
      setAddDirOpen(false);
      setActionNotice(`Plugin installed from ${trimmed}`, "success");
    } catch (err) {
      setActionNotice(
        `Failed to add plugin: ${err instanceof Error ? err.message : "unknown error"}`,
        "error",
        3800,
      );
    }
    setAddDirLoading(false);
  };

  // ── Field renderers ────────────────────────────────────────────────

  const renderField = (plugin: PluginInfo, param: PluginParamDef) => {
    const fieldType = autoFieldType(param);
    const fieldLabel = autoLabel(param.key, plugin.id);
    const configValue = pluginConfigs[plugin.id]?.[param.key];
    const currentValue =
      configValue !== undefined ? configValue : param.isSet && !param.sensitive ? (param.currentValue ?? "") : "";
    const effectiveValue = currentValue || (param.default ?? "");
    const pwKey = `${plugin.id}:${param.key}`;

    return (
      <div key={param.key} className="mb-4">
        {/* Label row */}
        <div className="flex items-center gap-1.5 text-[13px] font-semibold mb-1">
          <span
            className={`inline-block w-[7px] h-[7px] rounded-full shrink-0 ${
              param.isSet ? "bg-ok" : param.required ? "bg-destructive" : "bg-muted"
            }`}
          />
          <span>{fieldLabel}</span>
          {param.required && (
            <span className="text-[10px] text-destructive font-normal">required</span>
          )}
          {param.isSet && (
            <span className="text-[10px] text-ok font-normal">configured</span>
          )}
        </div>

        {/* Env key */}
        <div className="font-mono text-[10px] text-muted mb-1.5">
          <code className="bg-bg-hover px-1 py-px border border-border">{param.key}</code>
        </div>

        {/* Input */}
        {fieldType === "boolean" ? (
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="sr-only"
              checked={
                configValue !== undefined
                  ? configValue === "true" || configValue === "1"
                  : param.isSet
                    ? param.currentValue === "true" || param.currentValue === "1"
                    : String(param.default) === "true" || String(param.default) === "1"
              }
              onChange={(e) =>
                handleParamChange(plugin.id, param.key, e.target.checked ? "true" : "false")
              }
            />
            <div
              className={`relative w-9 h-[18px] transition-colors duration-150 ${
                (configValue !== undefined
                  ? configValue === "true" || configValue === "1"
                  : param.isSet
                    ? param.currentValue === "true" || param.currentValue === "1"
                    : String(param.default) === "true" || String(param.default) === "1")
                  ? "bg-accent"
                  : "bg-muted"
              }`}
            >
              <div
                className={`absolute w-3.5 h-3.5 bg-white top-[2px] transition-[left] duration-150 ${
                  (configValue !== undefined
                    ? configValue === "true" || configValue === "1"
                    : param.isSet
                      ? param.currentValue === "true" || param.currentValue === "1"
                      : String(param.default) === "true" || String(param.default) === "1")
                    ? "left-5"
                    : "left-[2px]"
                }`}
              />
            </div>
            <span className="text-xs text-muted">
              {(configValue !== undefined
                ? configValue === "true" || configValue === "1"
                : param.isSet
                  ? param.currentValue === "true" || param.currentValue === "1"
                  : String(param.default) === "true" || String(param.default) === "1")
                ? "Enabled"
                : "Disabled"}
            </span>
          </label>
        ) : fieldType === "password" ? (
          <div className="flex">
            <input
              type={passwordVisible.has(pwKey) ? "text" : "password"}
              className="flex-1 w-full px-2.5 py-[7px] border border-border border-r-0 bg-card text-[13px] font-mono transition-colors duration-150 focus:border-accent focus:outline-none placeholder:text-muted placeholder:font-body placeholder:italic"
              value={configValue ?? ""}
              onChange={(e) => handleParamChange(plugin.id, param.key, e.target.value)}
              placeholder={param.isSet ? "********  (already set, leave blank to keep)" : "Enter value..."}
            />
            <button
              type="button"
              className="px-3 py-[7px] border border-border bg-bg-hover text-[11px] text-muted whitespace-nowrap min-w-[48px] text-center transition-colors duration-150 hover:bg-surface hover:text-txt cursor-pointer"
              onClick={() => togglePasswordVisibility(pwKey)}
            >
              {passwordVisible.has(pwKey) ? "Hide" : "Show"}
            </button>
          </div>
        ) : param.options && param.options.length > 0 ? (
          <select
            className="w-full px-2.5 py-[7px] border border-border bg-card text-[13px] font-mono transition-colors duration-150 focus:border-accent focus:outline-none"
            value={effectiveValue}
            onChange={(e) => handleParamChange(plugin.id, param.key, e.target.value)}
          >
            {!param.required && <option value="">— none —</option>}
            {param.options.map((opt: string) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={fieldType === "number" ? "number" : fieldType === "url" ? "url" : "text"}
            className="w-full px-2.5 py-[7px] border border-border bg-card text-[13px] font-mono transition-colors duration-150 focus:border-accent focus:outline-none placeholder:text-muted placeholder:font-body placeholder:italic"
            value={currentValue}
            onChange={(e) => handleParamChange(plugin.id, param.key, e.target.value)}
            placeholder={param.default ? `Default: ${param.default}` : "Enter value..."}
          />
        )}

        {/* Help text */}
        {param.description && (
          <div className="text-[11px] text-muted mt-1 leading-relaxed">
            {param.description}
            {param.default != null && (
              <span className="opacity-70"> (default: {String(param.default)})</span>
            )}
          </div>
        )}
      </div>
    );
  };

  // ── Card renderer ──────────────────────────────────────────────────

  const renderCard = (p: PluginInfo) => {
    const hasParams = p.parameters && p.parameters.length > 0;
    const settingsOpen = pluginSettingsOpen.has(p.id);
    const setCount = hasParams ? p.parameters.filter((param: PluginParamDef) => param.isSet).length : 0;
    const totalCount = hasParams ? p.parameters.length : 0;
    const allParamsSet = !hasParams || setCount === totalCount;
    const generalParams = hasParams ? p.parameters.filter((param: PluginParamDef) => !isAdvancedParam(param)) : [];
    const advancedParams = hasParams ? p.parameters.filter((param: PluginParamDef) => isAdvancedParam(param)) : [];
    const advancedOpen = pluginAdvancedOpen.has(p.id);
    const isSaving = pluginSaving.has(p.id);
    const saveSuccess = pluginSaveSuccess.has(p.id);

    const enabledBorder = p.enabled
      ? p.enabled && !allParamsSet && hasParams
        ? "border-l-[3px] border-l-warn"
        : "border-l-[3px] border-l-accent"
      : "";

    return (
      <div
        key={p.id}
        className={`border border-border bg-card transition-colors duration-150 ${enabledBorder}`}
        data-plugin-id={p.id}
      >
        {/* Row header — horizontal layout */}
        <div
          className={`flex items-center gap-4 px-4 py-3 ${hasParams ? "cursor-pointer hover:bg-bg-hover" : ""}`}
          onClick={hasParams ? () => toggleSettings(p.id) : undefined}
        >
          {/* Settings chevron (if configurable) */}
          {hasParams && (
            <span
              className={`inline-block text-[10px] text-muted transition-transform duration-150 shrink-0 ${
                settingsOpen ? "rotate-90" : ""
              }`}
            >
              &#9654;
            </span>
          )}

          {/* Name */}
          <span className="font-bold text-sm whitespace-nowrap shrink-0">{p.name}</span>

          {/* Badges */}
          <div className="flex items-center gap-1.5 shrink-0">
            {!allParamsSet && hasParams && (
              <span className="text-[10px] px-1.5 py-px border border-warn bg-warn-subtle text-warn lowercase tracking-wide whitespace-nowrap">
                {setCount}/{totalCount}
              </span>
            )}
            {p.version && (
              <span className="text-[10px] font-mono text-muted opacity-70">v{p.version}</span>
            )}
          </div>

          {/* Description — fills remaining space, truncated to one line */}
          <span className="text-xs text-muted truncate min-w-0 flex-1">
            {p.description || "No description available"}
          </span>

          {/* Config progress */}
          {hasParams && (
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`inline-block w-[7px] h-[7px] rounded-full ${
                  allParamsSet ? "bg-ok" : "bg-destructive"
                }`}
              />
            </div>
          )}

          {/* ON / OFF */}
          <button
            type="button"
            data-plugin-toggle={p.id}
            className={`text-[10px] font-bold tracking-wider px-2.5 py-[2px] border cursor-pointer transition-colors duration-150 shrink-0 ${
              p.enabled
                ? "bg-accent text-accent-fg border-accent"
                : "bg-transparent text-muted border-border hover:text-txt"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              handlePluginToggle(p.id, !p.enabled);
            }}
          >
            {p.enabled ? "ON" : "OFF"}
          </button>
        </div>

        {/* Expanded settings panel — full width below the row */}
        {settingsOpen && hasParams && (
          <div className="border-t border-border bg-surface animate-[pc-slide-in_200ms_ease]">
            {/* Plugin details strip */}
            <div className="px-5 pt-4 pb-2 flex items-center gap-3 flex-wrap text-xs text-muted">
              {p.npmName && (
                <span className="font-mono text-[10px] opacity-60">{p.npmName}</span>
              )}
              {p.pluginDeps && p.pluginDeps.length > 0 && (
                <span className="flex items-center gap-1 flex-wrap">
                  <span className="text-[9px] opacity-70">depends on:</span>
                  {p.pluginDeps.map((dep: string) => (
                    <span
                      key={dep}
                      className="text-[9px] px-[5px] py-px border border-border bg-accent-subtle text-muted tracking-wide"
                    >
                      {dep}
                    </span>
                  ))}
                </span>
              )}
            </div>

            {/* Fields in a responsive multi-column layout */}
            <div className="px-5 pb-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6">
              {generalParams.map((param: PluginParamDef) => renderField(p, param))}
            </div>

            {advancedParams.length > 0 && (
              <>
                <div
                  className="flex items-center gap-1.5 text-xs text-muted cursor-pointer py-2 mx-5 mb-2 border-t border-dashed border-border select-none hover:text-txt"
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleAdvanced(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleAdvanced(p.id);
                    }
                  }}
                >
                  <span
                    className={`inline-block text-[10px] transition-transform duration-150 ${
                      advancedOpen ? "rotate-90" : ""
                    }`}
                  >
                    &#9654;
                  </span>
                  Advanced ({advancedParams.length})
                </div>
                {advancedOpen && (
                  <div className="px-5 pb-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6">
                    {advancedParams.map((param: PluginParamDef) => renderField(p, param))}
                  </div>
                )}
              </>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 px-5 pb-4 pt-2 border-t border-border mx-5 mb-1">
              <button
                type="button"
                className="bg-transparent border border-border text-muted cursor-pointer text-xs px-4 py-[5px] hover:text-txt hover:bg-bg-hover"
                onClick={() => handleConfigReset(p.id)}
              >
                Reset
              </button>
              <button
                type="button"
                className={`text-xs px-4 py-[5px] cursor-pointer border transition-colors duration-150 ${
                  saveSuccess
                    ? "!bg-ok !text-white !border-ok"
                    : "bg-accent text-accent-fg border-accent hover:bg-accent-hover"
                }`}
                onClick={() => handleConfigSave(p.id)}
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : saveSuccess ? "Saved" : "Save Settings"}
              </button>
            </div>
          </div>
        )}

        {/* Validation errors */}
        {p.enabled && p.validationErrors && p.validationErrors.length > 0 && (
          <div className="px-4 py-2 border-t border-destructive bg-[rgba(153,27,27,0.04)] text-xs">
            {p.validationErrors.map((err: { field: string; message: string }, i: number) => (
              <div key={i} className="text-destructive mb-0.5">
                {err.field}: {err.message}
              </div>
            ))}
          </div>
        )}

        {/* Validation warnings */}
        {p.enabled && p.validationWarnings && p.validationWarnings.length > 0 && (
          <div className="px-4 py-1 pb-2">
            {p.validationWarnings.map((w: { field: string; message: string }, i: number) => (
              <div key={i} className="text-warn text-[11px]">
                {w.message}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ── Main render ────────────────────────────────────────────────────

  return (
    <div>
      {/* Toolbar: search + status toggle */}
      <div className="flex items-center gap-2 mb-3.5 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <input
            type="text"
            className="w-full py-[5px] px-3 pr-8 border border-border bg-card text-[13px] transition-colors duration-150 focus:border-accent focus:outline-none placeholder:text-muted placeholder:italic"
            placeholder={`Search ${label.toLowerCase()}...`}
            value={pluginSearch}
            onChange={(e) => setState("pluginSearch", e.target.value)}
          />
          {pluginSearch && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none text-muted cursor-pointer text-sm px-1.5 py-px leading-none hover:text-txt"
              onClick={() => setState("pluginSearch", "")}
              title="Clear search"
            >
              &times;
            </button>
          )}
        </div>

        {/* Status toggle: All / Enabled */}
        <div className="flex gap-1 shrink-0">
          {(["all", "enabled"] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={`px-2.5 py-[3px] border text-[11px] cursor-pointer transition-colors duration-150 ${
                pluginStatusFilter === s
                  ? "bg-accent text-accent-fg border-accent"
                  : "bg-surface text-txt border-border hover:bg-bg-hover"
              }`}
              onClick={() => setState("pluginStatusFilter", s as StatusFilter)}
            >
              {s === "all" ? `All (${categoryPlugins.length})` : `Enabled (${enabledCount})`}
            </button>
          ))}
        </div>

        {/* Add plugin button (only for Features) */}
        {showAddPlugin && (
          <button
            type="button"
            className="px-2.5 py-[3px] border border-accent bg-accent text-accent-fg text-[11px] cursor-pointer shrink-0 hover:bg-accent-hover hover:border-accent-hover"
            onClick={() => setAddDirOpen(true)}
          >
            + Add Plugin
          </button>
        )}
      </div>

      {/* Plugin list */}
      <div className="overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="text-center py-10 px-5 text-muted border border-dashed border-border">
            {pluginSearch ? `No ${label.toLowerCase()} match your search.` : `No ${label.toLowerCase()} available.`}
          </div>
        ) : (
          <div className="flex flex-col gap-[1px]">
            {sorted.map((p: PluginInfo) => renderCard(p))}
          </div>
        )}
      </div>

      {/* Add from directory modal */}
      {addDirOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setAddDirOpen(false);
              setAddDirPath("");
            }
          }}
        >
          <div className="w-full max-w-md border border-border bg-card p-5 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="font-bold text-sm">Add Plugin</div>
              <button
                className="text-muted hover:text-txt text-lg leading-none px-1"
                onClick={() => {
                  setAddDirOpen(false);
                  setAddDirPath("");
                }}
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-muted mb-3">
              Enter the path to a local plugin directory or package name.
            </p>

            <input
              type="text"
              className="w-full py-2 px-3 border border-border bg-bg text-[13px] font-mono transition-colors duration-150 focus:border-accent focus:outline-none placeholder:text-muted placeholder:font-body placeholder:italic"
              placeholder="/path/to/plugin or package-name"
              value={addDirPath}
              onChange={(e) => setAddDirPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleAddFromDirectory();
              }}
              autoFocus
            />

            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                className="px-4 py-[5px] border border-border bg-transparent text-muted text-xs cursor-pointer hover:text-txt hover:bg-bg-hover"
                onClick={() => {
                  setAddDirOpen(false);
                  setAddDirPath("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-[5px] border border-accent bg-accent text-accent-fg text-xs cursor-pointer hover:bg-accent-hover hover:border-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={handleAddFromDirectory}
                disabled={addDirLoading || !addDirPath.trim()}
              >
                {addDirLoading ? "Adding..." : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Capability toggles bar ─────────────────────────────────────────── */

function CapabilityToggles() {
  const { plugins, handlePluginToggle, loadPlugins } = useApp();

  useEffect(() => {
    void loadPlugins();
  }, [loadPlugins]);

  /** Resolve each capability to its plugin data (if found). */
  const capabilities = useMemo(
    () =>
      CAPABILITY_TOGGLE_IDS.map((cap) => ({
        ...cap,
        plugin: plugins.find((p: PluginInfo) => p.id === cap.id) ?? null,
      })),
    [plugins],
  );

  return (
    <div className="flex items-center gap-2 mb-4 p-3 border border-border bg-card">
      <span className="text-xs font-bold text-txt mr-1">Capabilities</span>
      {capabilities.map(({ id, label, plugin }) => {
        const enabled = plugin?.enabled ?? false;
        return (
          <button
            key={id}
            type="button"
            className={`inline-flex items-center gap-1.5 px-3 py-[5px] border text-[11px] font-semibold cursor-pointer transition-colors duration-150 ${
              enabled
                ? "bg-accent text-accent-fg border-accent"
                : "bg-surface text-muted border-border hover:text-txt hover:bg-bg-hover"
            }`}
            onClick={() => {
              if (plugin) void handlePluginToggle(id, !enabled);
            }}
            disabled={!plugin}
            title={plugin ? `${enabled ? "Disable" : "Enable"} ${label}` : `${label} plugin not available`}
          >
            <span
              className={`inline-block w-[7px] h-[7px] rounded-full ${
                enabled ? "bg-white/80" : "bg-muted"
              }`}
            />
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Exported views ────────────────────────────────────────────────── */

/** Features view — shows capability toggles + "feature" category plugins. */
export function FeaturesView() {
  return (
    <div>
      <CapabilityToggles />
      <PluginListView category="feature" label="Features" showAddPlugin />
    </div>
  );
}

/** Connectors view — shows "connector" category plugins. */
export function ConnectorsView() {
  return <PluginListView category="connector" label="Connectors" />;
}

