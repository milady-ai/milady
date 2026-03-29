"use client";

import { useEffect, useState } from "react";
import { useAgents } from "../../lib/AgentProvider";
import type { MetricsData } from "../../lib/cloud-api";

interface AgentMetrics {
  agentId: string;
  agentName: string;
  data: MetricsData | null;
  error?: string;
}

function formatUptime(seconds?: number): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function StatBox({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-surface p-4 text-left">
      <p className="font-mono text-[9px] tracking-wider text-text-subtle mb-1">
        {label}
      </p>
      <p
        className={`font-mono text-xl tabular-nums ${accent ? "text-emerald-400" : "text-text-muted"}`}
      >
        {value}
      </p>
      <p className="font-mono text-[10px] text-text-subtle mt-0.5">{sub}</p>
    </div>
  );
}

export function MetricsPanel() {
  const { agents, loading, cloudClient } = useAgents();
  const [metricsMap, setMetricsMap] = useState<Record<string, AgentMetrics>>(
    {},
  );
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  const runningAgents = agents.filter((a) => a.status === "running");
  const stoppedAgents = agents.filter(
    (a) => a.status === "stopped" || a.status === "unknown",
  );

  // Calculate aggregate uptime (sum of all running agents' uptime in seconds)
  const totalUptimeSecs = runningAgents.reduce(
    (acc, a) => acc + (a.uptime ?? 0),
    0,
  );
  const totalMemories = agents.reduce((acc, a) => acc + (a.memories ?? 0), 0);

  // Fetch per-agent metrics from agents that have a client
  useEffect(() => {
    if (agents.length === 0) return;

    const fetchAll = async () => {
      const updates: Record<string, AgentMetrics> = {};

      await Promise.allSettled(
        agents
          .filter((a) => a.status === "running")
          .map(async (agent) => {
            // Try CloudApiClient metrics first (local/remote agents)
            if (agent.client) {
              try {
                const rows = await agent.client.getMetrics();
                const latest = rows[rows.length - 1] ?? null;
                updates[agent.id] = {
                  agentId: agent.id,
                  agentName: agent.name,
                  data: latest,
                };
                return;
              } catch {
                // fall through to cloud container metrics
              }
            }

            // Try cloud container metrics
            if (cloudClient && agent.nodeId) {
              try {
                const raw = (await cloudClient.getContainerMetrics(
                  agent.nodeId,
                )) as Partial<MetricsData>;
                updates[agent.id] = {
                  agentId: agent.id,
                  agentName: agent.name,
                  data: {
                    cpu: raw.cpu ?? 0,
                    memoryMb: raw.memoryMb ?? 0,
                    diskMb: raw.diskMb ?? 0,
                    timestamp: raw.timestamp ?? new Date().toISOString(),
                  },
                };
                return;
              } catch {
                // no metrics available
              }
            }

            updates[agent.id] = {
              agentId: agent.id,
              agentName: agent.name,
              data: null,
              error: "unavailable",
            };
          }),
      );

      setMetricsMap(updates);
      setFetchedAt(new Date());
    };

    fetchAll();
    const interval = setInterval(fetchAll, 10_000);
    return () => clearInterval(interval);
  }, [agents, cloudClient]);

  // Aggregate CPU and memory across agents that reported real metrics
  const agentsWithMetrics = Object.values(metricsMap).filter(
    (m) => m.data !== null,
  );
  const avgCpu =
    agentsWithMetrics.length > 0
      ? (
          agentsWithMetrics.reduce((s, m) => s + (m.data?.cpu ?? 0), 0) /
          agentsWithMetrics.length
        ).toFixed(1)
      : null;
  const totalMem =
    agentsWithMetrics.length > 0
      ? agentsWithMetrics
          .reduce((s, m) => s + (m.data?.memoryMb ?? 0), 0)
          .toFixed(0)
      : null;

  return (
    <div className="animate-[fade-up_0.4s_ease-out_both]">
      <div className="border border-border bg-surface">
        {/* Header */}
        <div className="px-4 py-2.5 bg-dark-secondary border-b border-border flex items-center justify-between">
          <span className="font-mono text-xs text-text-muted">
            $ metrics --watch
          </span>
          <div className="flex items-center gap-2 text-[10px] font-mono text-text-subtle">
            {loading ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400/60 animate-pulse" />
                LOADING
              </>
            ) : agents.length > 0 ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80 animate-pulse" />
                LIVE
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-text-muted/30" />
                NO AGENTS
              </>
            )}
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Aggregate stats row */}
          <div>
            <p className="font-mono text-[9px] tracking-widest text-text-subtle mb-3">
              AGGREGATE
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border">
              <StatBox
                label="AGENTS"
                value={String(agents.length)}
                sub="total"
              />
              <StatBox
                label="RUNNING"
                value={String(runningAgents.length)}
                sub="active"
                accent={runningAgents.length > 0}
              />
              <StatBox
                label="STOPPED"
                value={String(stoppedAgents.length)}
                sub="inactive"
              />
              <StatBox
                label="MEMORIES"
                value={totalMemories > 0 ? String(totalMemories) : "—"}
                sub="total stored"
              />
            </div>
          </div>

          {/* Per-agent uptime & model */}
          {agents.length > 0 && (
            <div>
              <p className="font-mono text-[9px] tracking-widest text-text-subtle mb-3">
                AGENTS
              </p>
              <div className="space-y-px bg-border border border-border">
                {agents.map((agent) => {
                  const m = metricsMap[agent.id];
                  return (
                    <div
                      key={agent.id}
                      className="bg-surface px-4 py-2.5 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            agent.status === "running"
                              ? "bg-emerald-400"
                              : agent.status === "provisioning"
                                ? "bg-yellow-400 animate-pulse"
                                : "bg-text-muted/30"
                          }`}
                        />
                        <span className="font-mono text-xs text-text-light truncate">
                          {agent.name}
                        </span>
                        {agent.model && (
                          <span className="font-mono text-[10px] text-text-subtle hidden sm:block">
                            {agent.model}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        {m?.data && (
                          <>
                            <span className="font-mono text-[10px] text-text-muted tabular-nums">
                              {m.data.cpu.toFixed(1)}% CPU
                            </span>
                            <span className="font-mono text-[10px] text-text-muted tabular-nums">
                              {m.data.memoryMb.toFixed(0)}MB
                            </span>
                          </>
                        )}
                        <span className="font-mono text-[10px] text-text-subtle tabular-nums w-14 text-right">
                          {formatUptime(agent.uptime)}
                        </span>
                        <span
                          className={`font-mono text-[9px] tracking-wider w-20 text-right ${
                            agent.status === "running"
                              ? "text-emerald-400/80"
                              : "text-text-subtle"
                          }`}
                        >
                          {agent.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Container metrics summary (if any agents reported) */}
          {agentsWithMetrics.length > 0 && (
            <div>
              <p className="font-mono text-[9px] tracking-widest text-text-subtle mb-3">
                CONTAINER METRICS
              </p>
              <div className="grid grid-cols-3 gap-px bg-border">
                <StatBox
                  label="AVG CPU"
                  value={avgCpu !== null ? `${avgCpu}%` : "—%"}
                  sub="utilization"
                  accent={avgCpu !== null && parseFloat(avgCpu) > 0}
                />
                <StatBox
                  label="TOTAL MEM"
                  value={totalMem !== null ? `${totalMem}MB` : "—MB"}
                  sub="allocated"
                />
                <StatBox
                  label="UPTIME"
                  value={formatUptime(totalUptimeSecs)}
                  sub="combined"
                />
              </div>
            </div>
          )}

          {/* Empty state */}
          {!loading && agents.length === 0 && (
            <div className="text-center py-4">
              <h3 className="font-mono text-sm text-text-light mb-2">
                NO ACTIVE METRICS
              </h3>
              <p className="font-mono text-xs text-text-muted max-w-sm mx-auto leading-relaxed">
                Connect to a running agent to stream real-time performance data.
              </p>
              <div className="mt-5 flex items-center justify-center gap-2 text-[10px] font-mono text-text-subtle">
                <span className="w-1.5 h-1.5 rounded-full bg-text-muted/30" />
                WAITING FOR DATA
              </div>
            </div>
          )}

          {/* Footer timestamp */}
          {fetchedAt && (
            <p className="font-mono text-[9px] text-text-subtle text-right">
              last updated {fetchedAt.toLocaleTimeString()}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
