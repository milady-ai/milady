"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAgents } from "../../lib/AgentProvider";
import type { LogEntry } from "../../lib/cloud-api";

interface DisplayLine {
  id: string;
  time: string;
  level: string;
  msg: string;
  raw?: boolean;
}

function levelColor(level: string): string {
  switch (level.toLowerCase()) {
    case "error":
    case "err":
      return "text-status-stopped/90";
    case "warn":
    case "warning":
      return "text-yellow-400/90";
    case "debug":
      return "text-text-subtle";
    default:
      return "text-status-running/70";
  }
}

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return ts;
  }
}

/** Parse raw log text (newline-separated) into display lines */
function parseRawLogs(raw: string): DisplayLine[] {
  return raw
    .split("\n")
    .filter((l) => l.trim())
    .map((line, i) => {
      // Try to detect JSON log format
      try {
        const obj = JSON.parse(line) as Record<string, unknown>;
        const level = String(obj.level ?? obj.lvl ?? "INFO").toUpperCase();
        const msg = String(obj.msg ?? obj.message ?? obj.text ?? line);
        const ts =
          typeof obj.time === "string" || typeof obj.timestamp === "string"
            ? formatTimestamp(String(obj.time ?? obj.timestamp))
            : "—";
        return { id: `raw-${i}`, time: ts, level, msg, raw: true };
      } catch {
        // Plain text line — try to extract level
        const levelMatch = line.match(/\[(INFO|WARN|ERROR|DEBUG)\]/i);
        const level = levelMatch ? levelMatch[1].toUpperCase() : "INFO";
        const msg = line.replace(/\[.*?\]/g, "").trim();
        return { id: `raw-${i}`, time: "—", level, msg, raw: true };
      }
    });
}

/** Convert structured LogEntry[] to display lines */
function fromLogEntries(entries: LogEntry[]): DisplayLine[] {
  return entries.map((e, i) => ({
    id: `entry-${i}`,
    time: formatTimestamp(e.timestamp),
    level: (e.level ?? "info").toUpperCase(),
    msg: e.message,
  }));
}

export function LogsPanel() {
  const { agents, loading, cloudClient } = useAgents();
  const [selectedId, setSelectedId] = useState<string>("");
  const [lines, setLines] = useState<DisplayLine[]>([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-select first agent
  useEffect(() => {
    if (!selectedId && agents.length > 0) {
      setSelectedId(agents[0].id);
    }
  }, [agents, selectedId]);

  const selectedAgent = agents.find((a) => a.id === selectedId) ?? null;

  const fetchLogs = useCallback(async () => {
    if (!selectedAgent) return;
    setFetching(true);
    setError(null);

    try {
      // 1. CloudApiClient (local/remote) — structured logs
      if (selectedAgent.client) {
        const entries = await selectedAgent.client.getLogs({ limit: 200 });
        setLines(fromLogEntries(entries));
        setLastFetched(new Date());
        return;
      }

      // 2. Cloud container logs (raw text)
      if (cloudClient && selectedAgent.nodeId) {
        const raw = await cloudClient.getContainerLogs(selectedAgent.nodeId);
        setLines(parseRawLogs(raw));
        setLastFetched(new Date());
        return;
      }

      // 3. No log source available
      setError("No log source available for this agent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch logs");
    } finally {
      setFetching(false);
    }
  }, [selectedAgent, cloudClient]);

  // Fetch on agent change
  useEffect(() => {
    if (!selectedAgent) return;
    setLines([]);
    setError(null);
    fetchLogs();
  }, [fetchLogs, selectedAgent]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (autoRefresh && selectedAgent) {
      intervalRef.current = setInterval(fetchLogs, 8_000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, fetchLogs, selectedAgent]);

  // Auto-scroll to bottom when new lines arrive
  useEffect(() => {
    if (scrollRef.current && lines.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  const hasLogs = lines.length > 0;
  const isConnected = !!selectedAgent;

  return (
    <div className="animate-[fade-up_0.4s_ease-out_both]">
      <div className="border border-border bg-surface">
        {/* Header */}
        <div className="px-4 py-2.5 bg-dark-secondary border-b border-border flex items-center justify-between gap-3">
          <span className="font-mono text-xs text-text-muted flex-shrink-0">
            $ tail -f agent.log
          </span>

          <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
            {/* Agent selector */}
            {agents.length > 1 && (
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="font-mono text-[10px] bg-dark-secondary border border-border text-text-muted px-2 py-1 max-w-[180px] truncate focus:outline-none focus:border-text-muted/50"
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}

            {/* Auto-refresh toggle */}
            <button
              type="button"
              onClick={() => setAutoRefresh((v) => !v)}
              title={
                autoRefresh ? "Disable auto-refresh" : "Enable auto-refresh"
              }
              className={`font-mono text-[9px] tracking-wider px-2 py-1 border transition-colors ${
                autoRefresh
                  ? "border-status-running/40 text-status-running/80 bg-status-running/5"
                  : "border-border text-text-subtle"
              }`}
            >
              AUTO
            </button>

            {/* Manual refresh */}
            <button
              type="button"
              onClick={fetchLogs}
              disabled={fetching || !selectedAgent}
              className="font-mono text-[9px] tracking-wider px-2 py-1 border border-border text-text-subtle hover:text-text-muted hover:border-text-muted/40 disabled:opacity-40 transition-colors"
            >
              {fetching ? "..." : "↺"}
            </button>

            {/* Status dot */}
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-text-subtle flex-shrink-0">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  fetching
                    ? "bg-yellow-400/60 animate-pulse"
                    : isConnected && hasLogs
                      ? "bg-status-running/80 animate-pulse"
                      : "bg-text-muted/30"
                }`}
              />
              {fetching
                ? "FETCHING"
                : isConnected && hasLogs
                  ? "LIVE"
                  : "DISCONNECTED"}
            </div>
          </div>
        </div>

        {/* Log area */}
        <div
          ref={scrollRef}
          className="p-4 min-h-[240px] max-h-[480px] overflow-y-auto font-mono text-[11px] leading-relaxed"
        >
          {loading && (
            <p className="text-text-subtle text-center py-8">
              Loading agents...
            </p>
          )}

          {!loading && agents.length === 0 && (
            <div className="text-center py-8">
              <h3 className="font-mono text-sm text-text-light mb-2">
                NO LOG STREAM
              </h3>
              <p className="font-mono text-xs text-text-muted max-w-sm mx-auto leading-relaxed">
                Connect to a running agent to stream live logs.
              </p>
            </div>
          )}

          {!loading && agents.length > 0 && !hasLogs && !fetching && (
            <div className="text-center py-8">
              {error ? (
                <>
                  <p className="text-status-stopped/80 mb-1">Error: {error}</p>
                  <p className="text-text-subtle text-[10px]">
                    This agent may not expose a logs endpoint.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-text-muted mb-1">
                    {selectedAgent
                      ? `No logs available for ${selectedAgent.name}`
                      : "Select an agent above"}
                  </p>
                  <p className="text-text-subtle text-[10px]">
                    Agent must be running and expose /api/logs or container logs
                  </p>
                </>
              )}
            </div>
          )}

          {hasLogs && (
            <div className="space-y-1">
              {lines.map((line) => (
                <div
                  key={line.id}
                  className="flex items-start gap-3 hover:bg-white/2 px-1 py-0.5 rounded-sm"
                >
                  <span className="text-text-subtle tabular-nums flex-shrink-0 w-20 text-right">
                    {line.time}
                  </span>
                  <span
                    className={`flex-shrink-0 w-14 ${levelColor(line.level)}`}
                  >
                    [{line.level}]
                  </span>
                  <span className="text-text-muted break-all">{line.msg}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {hasLogs && (
          <div className="px-4 py-2 bg-dark-secondary border-t border-border flex items-center justify-between">
            <span className="font-mono text-[9px] text-text-subtle">
              {lines.length} lines
              {selectedAgent && ` · ${selectedAgent.name}`}
            </span>
            {lastFetched && (
              <span className="font-mono text-[9px] text-text-subtle">
                updated {lastFetched.toLocaleTimeString()}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
