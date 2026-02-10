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
  const loadedOptional = optional.filter(p => p.loaded).length;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="text-xs text-[var(--muted)]">
        {loadedCore}/{core.length} core loaded &middot; {loadedOptional}/{optional.length} optional loaded
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
          Can be enabled by adding to the plugins allow list in config. Restart required.
        </p>
        <div className="grid gap-2">
          {optional.map(p => (
            <PluginRow key={p.id} plugin={p} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PluginRow({ plugin }: { plugin: CorePluginEntry }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded bg-[var(--surface)] border border-[var(--border)]">
      <span
        className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
          plugin.loaded
            ? "bg-[var(--ok,#16a34a)]"
            : "bg-[var(--muted)]"
        }`}
        title={plugin.loaded ? "Loaded" : "Not loaded"}
      />
      <span className="text-sm font-medium text-[var(--txt)] flex-1 min-w-0 truncate">
        {plugin.name}
      </span>
      <code className="text-[10px] text-[var(--muted)] font-[var(--mono)] flex-shrink-0">
        {plugin.npmName}
      </code>
      <span className={`text-[10px] font-medium flex-shrink-0 ${
        plugin.loaded ? "text-[var(--ok,#16a34a)]" : "text-[var(--muted)]"
      }`}>
        {plugin.loaded ? "Running" : "Off"}
      </span>
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
