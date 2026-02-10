/**
 * Admin view — logs, database management, and core plugin status.
 *
 * Contains three sub-tabs:
 *   - Logs: agent runtime logs
 *   - Plugins: core plugin status & optional plugin toggles
 *   - Database: database explorer
 */

import { useCallback, useEffect, useState } from "react";
import { client } from "../api-client";
import type { CorePluginEntry } from "../api-client";
import { LogsView } from "./LogsView";
import { DatabaseView } from "./DatabaseView";

type AdminTab = "logs" | "plugins" | "database";

const ADMIN_TABS: { id: AdminTab; label: string }[] = [
  { id: "logs", label: "Logs" },
  { id: "plugins", label: "Plugins" },
  { id: "database", label: "Database" },
];

/* ── Core Plugins sub-view ──────────────────────────────────────────── */

function CorePluginsView() {
  const [core, setCore] = useState<CorePluginEntry[]>([]);
  const [optional, setOptional] = useState<CorePluginEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await client.getCorePlugins();
      setCore(data.core);
      setOptional(data.optional);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleToggle = useCallback(async (plugin: CorePluginEntry) => {
    setToggling(plugin.id);
    try {
      await client.toggleCorePlugin(plugin.npmName, !plugin.enabled);
      // Optimistic update
      setOptional(prev =>
        prev.map(p =>
          p.id === plugin.id ? { ...p, enabled: !p.enabled } : p,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Toggle failed");
    }
    setToggling(null);
  }, []);

  if (loading) {
    return <div className="text-[var(--muted)] text-sm py-8 text-center">Loading plugin status...</div>;
  }
  if (error) {
    return (
      <div className="text-sm py-8 text-center">
        <span className="text-[var(--danger,#e74c3c)]">{error}</span>
        <button onClick={load} className="ml-3 text-[var(--accent)] bg-transparent border-0 cursor-pointer underline text-sm">
          Retry
        </button>
      </div>
    );
  }

  const loadedCore = core.filter(p => p.loaded).length;
  const enabledOptional = optional.filter(p => p.enabled).length;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="text-xs text-[var(--muted)]">
        {loadedCore}/{core.length} core running &middot; {enabledOptional}/{optional.length} optional enabled
        <button onClick={load} className="ml-3 text-[var(--accent)] bg-transparent border-0 cursor-pointer text-xs underline">
          Refresh
        </button>
      </div>

      {/* Core plugins */}
      <div>
        <h3 className="text-sm font-semibold text-[var(--txt-strong)] mb-3">Core Plugins</h3>
        <p className="text-xs text-[var(--muted)] mb-3">Always loaded. Required for the agent to function.</p>
        <div className="grid gap-2">
          {core.map(p => (
            <PluginRow key={p.id} plugin={p} />
          ))}
        </div>
      </div>

      {/* Optional plugins */}
      <div>
        <h3 className="text-sm font-semibold text-[var(--txt-strong)] mb-3">Optional Plugins</h3>
        <p className="text-xs text-[var(--muted)] mb-3">
          Toggle to enable or disable. Agent will restart automatically.
        </p>
        <div className="grid gap-2">
          {optional.map(p => (
            <PluginRow
              key={p.id}
              plugin={p}
              toggleable
              toggling={toggling === p.id}
              onToggle={() => handleToggle(p)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function PluginRow({
  plugin,
  toggleable,
  toggling,
  onToggle,
}: {
  plugin: CorePluginEntry;
  toggleable?: boolean;
  toggling?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded bg-[var(--surface)] border border-[var(--border)]">
      {/* Status dot */}
      <span
        className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
          plugin.loaded
            ? "bg-[var(--ok,#16a34a)]"
            : plugin.enabled
              ? "bg-[#b8860b]"
              : "bg-[var(--muted)]"
        }`}
        title={plugin.loaded ? "Running" : plugin.enabled ? "Enabled (not loaded yet)" : "Disabled"}
      />

      {/* Name */}
      <span className="text-sm font-medium text-[var(--txt)] flex-1 min-w-0 truncate">
        {plugin.name}
      </span>

      {/* Status label */}
      <span className={`text-[10px] font-medium flex-shrink-0 ${
        plugin.loaded
          ? "text-[var(--ok,#16a34a)]"
          : plugin.enabled
            ? "text-[#b8860b]"
            : "text-[var(--muted)]"
      }`}>
        {plugin.loaded ? "Running" : plugin.enabled ? "Enabled" : "Off"}
      </span>

      {/* Toggle button for optional plugins */}
      {toggleable && onToggle && (
        <button
          className={`relative w-9 h-5 rounded-full border transition-colors flex-shrink-0 cursor-pointer ${
            plugin.enabled
              ? "bg-[var(--accent)] border-[var(--accent)]"
              : "bg-[var(--surface)] border-[var(--border)]"
          } ${toggling ? "opacity-50 pointer-events-none" : ""}`}
          onClick={onToggle}
          disabled={toggling}
          title={plugin.enabled ? "Disable" : "Enable"}
        >
          <span
            className={`absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all ${
              plugin.enabled
                ? "left-[18px] bg-white"
                : "left-[2px] bg-[var(--muted)]"
            }`}
          />
        </button>
      )}
    </div>
  );
}

/* ── Main AdminView ─────────────────────────────────────────────────── */

export function AdminView() {
  const [activeTab, setActiveTab] = useState<AdminTab>("logs");

  return (
    <div>
      {/* Sub-tab bar */}
      <div className="flex gap-1 border-b border-[var(--border)] mb-5">
        {ADMIN_TABS.map((t) => (
          <button
            key={t.id}
            className={`px-4 py-2 text-[13px] bg-transparent border-0 border-b-2 cursor-pointer transition-colors ${
              activeTab === t.id
                ? "text-[var(--accent)] font-medium border-b-[var(--accent)]"
                : "text-[var(--muted)] border-b-transparent hover:text-[var(--txt)]"
            }`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      {activeTab === "logs" && <LogsView />}
      {activeTab === "plugins" && <CorePluginsView />}
      {activeTab === "database" && <DatabaseView />}
    </div>
  );
}
