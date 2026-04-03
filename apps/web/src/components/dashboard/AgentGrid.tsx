import { Button } from "@miladyai/ui";
import { useCallback, useEffect, useState } from "react";
import { useAgents } from "../../lib/AgentProvider";
import { openWebUI } from "../../lib/open-web-ui";
import {
  MIN_DEPOSIT_DISPLAY,
  PRICE_IDLE_PER_HR,
  PRICE_RUNNING_PER_HR,
} from "../../lib/pricing-constants";
import { useAuth } from "../../lib/useAuth";
import { AgentCard } from "./AgentCard";
import { AgentDetail } from "./AgentDetail";
import { CreateAgentForm } from "./CreateAgentForm";

export function AgentGrid() {
  const {
    filteredAgents: agents,
    loading,
    isRefreshing,
    error,
    clearError,
    refresh,
  } = useAgents();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<{
    tone: "info" | "success" | "error";
    text: string;
    busy?: boolean;
  } | null>(null);

  const handleAction = useCallback(
    async (agentId: string, action: "play" | "resume" | "pause" | "stop") => {
      const agent = agents.find((a) => a.id === agentId);
      if (!agent) return;
      const verb =
        action === "play"
          ? "Starting"
          : action === "resume"
            ? "Resuming"
            : action === "pause"
              ? "Pausing"
              : "Stopping";
      setActionBusyId(agentId);
      setActionNotice({
        tone: "info",
        text: `${verb} ${agent.name}...`,
        busy: true,
      });
      try {
        if (
          agent.source === "cloud" &&
          agent.cloudClient &&
          agent.cloudAgentId
        ) {
          if (action === "play" || action === "resume") {
            await agent.cloudClient.resumeAgent(agent.cloudAgentId);
          } else if (action === "pause" || action === "stop") {
            await agent.cloudClient.suspendAgent(agent.cloudAgentId);
          }
        } else if (agent.client) {
          if (action === "play") await agent.client.playAgent();
          else if (action === "resume") await agent.client.resumeAgent();
          else if (action === "pause") await agent.client.pauseAgent();
          else if (action === "stop") await agent.client.stopAgent();
        }
        await refresh();
        setActionNotice({
          tone: "success",
          text: `${agent.name} ${action === "pause" ? "paused" : action === "stop" ? "stopped" : "updated"} successfully.`,
        });
      } catch (err) {
        console.error(`Failed to ${action} agent:`, err);
        setActionNotice({
          tone: "error",
          text: `${agent.name}: ${err instanceof Error ? err.message : `Failed to ${action} agent.`}`,
        });
      } finally {
        setActionBusyId((current) => (current === agentId ? null : current));
      }
    },
    [agents, refresh],
  );

  useEffect(() => {
    if (!actionNotice || actionNotice.busy) return;
    const timer = window.setTimeout(() => setActionNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [actionNotice]);

  const getWebUIUrl = useCallback((agent: (typeof agents)[0]) => {
    if (agent.webUiUrl) return agent.webUiUrl;
    return agent.sourceUrl;
  }, []);

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-6 animate-[fade-up_0.4s_ease-out_both]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="h-6 w-28 bg-surface animate-[shimmer_1.8s_ease-in-out_infinite] bg-[linear-gradient(90deg,var(--color-surface)_0%,var(--color-surface-elevated)_40%,var(--color-surface)_80%)] bg-[length:200%_100%]" />
            <div className="h-4 w-44 bg-surface animate-[shimmer_1.8s_ease-in-out_infinite] bg-[linear-gradient(90deg,var(--color-surface)_0%,var(--color-surface-elevated)_40%,var(--color-surface)_80%)] bg-[length:200%_100%] mt-2" />
          </div>
          <div className="h-10 w-28 bg-surface animate-[shimmer_1.8s_ease-in-out_infinite] bg-[linear-gradient(90deg,var(--color-surface)_0%,var(--color-surface-elevated)_40%,var(--color-surface)_80%)] bg-[length:200%_100%]" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <AgentCardSkeleton key={i} delay={i * 60} />
          ))}
        </div>
      </div>
    );
  }

  const selected = selectedId ? agents.find((a) => a.id === selectedId) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-mono text-lg font-medium text-text-light tracking-wide">
            AGENTS
          </h2>
          <p className="font-mono text-xs text-text-muted mt-1 tracking-wide">
            {agents.length === 0
              ? "No agents discovered"
              : `${agents.length} agent${agents.length !== 1 ? "s" : ""} across all sources`}
          </p>
        </div>
        {!showCreate && (
          <Button
            type="button"
            onClick={() => setShowCreate(true)}
            className="h-11 w-full border-brand/70 bg-brand !text-[#08080a] font-mono text-xs font-semibold uppercase tracking-[0.18em] hover:border-brand hover:bg-brand-hover sm:w-auto px-6"
          >
            + New Agent
          </Button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div
          className="flex items-center justify-between gap-4 px-4 py-3 
          border border-status-stopped/30 bg-status-stopped/5 animate-[fade-up_0.4s_ease-out_both]"
          role="alert"
          aria-live="assertive"
        >
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-status-stopped" />
            <span className="font-mono text-xs text-status-stopped">
              {error}
            </span>
          </div>
          <button
            type="button"
            onClick={clearError}
            className="text-status-stopped/60 hover:text-status-stopped transition-colors p-1"
            aria-label="Dismiss error"
          >
            <svg
              aria-hidden="true"
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      )}

      {actionNotice && (
        <div
          className={`flex items-start justify-between gap-4 px-4 py-3 border animate-[fade-up_0.4s_ease-out_both] ${
            actionNotice.tone === "error"
              ? "border-status-stopped/30 bg-status-stopped/5 text-status-stopped"
              : actionNotice.tone === "success"
                ? "border-status-running/30 bg-status-running/5 text-status-running"
                : "border-brand/30 bg-brand/8 text-text-light"
          }`}
          role={actionNotice.tone === "error" ? "alert" : "status"}
          aria-live={actionNotice.tone === "error" ? "assertive" : "polite"}
          aria-busy={actionNotice.busy ? true : undefined}
        >
          <div className="flex items-center gap-3">
            <span
              className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                actionNotice.tone === "error"
                  ? "bg-red-400"
                  : actionNotice.tone === "success"
                    ? "bg-emerald-400"
                    : "bg-brand"
              }`}
            />
            <span className="font-mono text-xs leading-relaxed">
              {actionNotice.text}
            </span>
          </div>
          {!actionNotice.busy ? (
            <button
              type="button"
              onClick={() => setActionNotice(null)}
              className="rounded-md p-1 text-current/70 transition-colors hover:text-current"
              aria-label="Dismiss action notice"
            >
              <svg
                aria-hidden="true"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          ) : null}
        </div>
      )}

      {/* Refreshing indicator */}
      {(isRefreshing || isCreating) && agents.length > 0 && (
        <div className="flex items-center gap-2 font-mono text-[10px] text-text-subtle animate-[fade-up_0.4s_ease-out_both]">
          <svg
            aria-hidden="true"
            className="w-3 h-3 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          {isCreating ? "CREATING AGENT..." : "SYNCING..."}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <CreateAgentForm
          onAuthenticated={() => refresh()}
          onCreated={async () => {
            setShowCreate(false);
            setIsCreating(true);
            await refresh();
            setIsCreating(false);
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Agent list or empty state */}
      {agents.length === 0 && !showCreate ? (
        <EmptyState onCreateClick={() => setShowCreate(true)} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {agents.map((agent, i) => (
            <div
              key={agent.id}
              className="animate-[fade-up_0.4s_ease-out_both]"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <AgentCard
                agent={{
                  agentName: agent.name,
                  state: agent.status,
                  model: agent.model ?? "—",
                  uptime: agent.uptime,
                  memories: agent.memories,
                }}
                avatarIndex={agent.avatarIndex}
                source={agent.source}
                sourceUrl={agent.sourceUrl}
                webUiUrl={getWebUIUrl(agent)}
                nodeId={agent.nodeId}
                lastHeartbeat={agent.lastHeartbeat}
                billing={agent.billing}
                createdAt={agent.createdAt}
                region={agent.region}
                onPlay={() => handleAction(agent.id, "play")}
                onResume={() => handleAction(agent.id, "resume")}
                onPause={() => handleAction(agent.id, "pause")}
                onStop={() => handleAction(agent.id, "stop")}
                onSelect={() =>
                  setSelectedId(selectedId === agent.id ? null : agent.id)
                }
                onOpenUI={() => {
                  const url = getWebUIUrl(agent);
                  if (!url) return;
                  openWebUI(url, agent.source, agent.cloudAgentId);
                }}
                detailsId={`homepage-agent-detail-${agent.id}`}
                selected={selectedId === agent.id}
                busy={actionBusyId === agent.id}
              />
            </div>
          ))}
        </div>
      )}

      {/* Detail panel */}
      {selected && (
        <section
          id={`homepage-agent-detail-${selected.id}`}
          className="animate-[fade-up_0.4s_ease-out_both]"
          aria-label={`${selected.name} details`}
        >
          <AgentDetail
            agent={{
              agentName: selected.name,
              state: selected.status,
              model: selected.model ?? "—",
              uptime: selected.uptime,
              memories: selected.memories,
            }}
            managedAgent={selected}
            connectionId={selected.id}
            webUIUrl={getWebUIUrl(selected)}
          />
        </section>
      )}
    </div>
  );
}

/** Skeleton matching AgentCard layout */
function AgentCardSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="border border-border bg-surface animate-[fade-up_0.4s_ease-out_both]"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Left accent */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-text-muted/20" />

      <div className="p-4 pb-0">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-surface-elevated animate-[shimmer_1.8s_ease-in-out_infinite] bg-[linear-gradient(90deg,var(--color-surface)_0%,var(--color-surface-elevated)_40%,var(--color-surface)_80%)] bg-[length:200%_100%]" />
          <div className="flex-1">
            <div className="h-4 w-28 bg-surface-elevated animate-[shimmer_1.8s_ease-in-out_infinite] bg-[linear-gradient(90deg,var(--color-surface)_0%,var(--color-surface-elevated)_40%,var(--color-surface)_80%)] bg-[length:200%_100%]" />
            <div className="h-3 w-20 bg-surface-elevated animate-[shimmer_1.8s_ease-in-out_infinite] bg-[linear-gradient(90deg,var(--color-surface)_0%,var(--color-surface-elevated)_40%,var(--color-surface)_80%)] bg-[length:200%_100%] mt-1.5" />
          </div>
          <div className="h-7 w-16 bg-surface-elevated animate-[shimmer_1.8s_ease-in-out_infinite] bg-[linear-gradient(90deg,var(--color-surface)_0%,var(--color-surface-elevated)_40%,var(--color-surface)_80%)] bg-[length:200%_100%]" />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-px mt-4 bg-border-subtle">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-surface px-3 py-2.5">
            <div className="h-2 w-8 bg-surface-elevated animate-[shimmer_1.8s_ease-in-out_infinite] bg-[linear-gradient(90deg,var(--color-surface)_0%,var(--color-surface-elevated)_40%,var(--color-surface)_80%)] bg-[length:200%_100%] mb-1" />
            <div className="h-4 w-10 bg-surface-elevated animate-[shimmer_1.8s_ease-in-out_infinite] bg-[linear-gradient(90deg,var(--color-surface)_0%,var(--color-surface-elevated)_40%,var(--color-surface)_80%)] bg-[length:200%_100%]" />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 p-3 bg-dark-secondary/50">
        <div className="h-7 w-16 bg-surface-elevated animate-[shimmer_1.8s_ease-in-out_infinite] bg-[linear-gradient(90deg,var(--color-surface)_0%,var(--color-surface-elevated)_40%,var(--color-surface)_80%)] bg-[length:200%_100%]" />
        <div className="h-7 w-20 bg-surface-elevated animate-[shimmer_1.8s_ease-in-out_infinite] bg-[linear-gradient(90deg,var(--color-surface)_0%,var(--color-surface-elevated)_40%,var(--color-surface)_80%)] bg-[length:200%_100%]" />
      </div>
    </div>
  );
}

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  const { isAuthenticated: authed } = useAuth();

  return (
    <div className="border border-border bg-surface animate-[fade-up_0.4s_ease-out_both]">
      {/* Terminal header */}
      <div className="px-4 py-2.5 bg-dark-secondary border-b border-border">
        <span className="font-mono text-xs text-text-muted">
          $ milady agents --list
        </span>
      </div>

      <div className="p-8 text-center">
        {/* Decorative agent preview */}
        <div className="max-w-sm mx-auto mb-8">
          <div className="border border-border-subtle bg-dark-secondary/30 p-4">
            <div className="flex items-start gap-4 opacity-30">
              <div className="w-12 h-12 border border-text-muted/20 bg-surface flex items-center justify-center">
                <span className="font-mono text-sm text-text-muted">??</span>
              </div>
              <div className="flex-1 text-left">
                <div className="h-4 w-24 bg-text-muted/10 mb-2" />
                <div className="h-3 w-16 bg-text-muted/10" />
              </div>
              <div className="h-6 w-16 bg-text-muted/10" />
            </div>
            <div className="grid grid-cols-4 gap-2 mt-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-surface/50 p-2">
                  <div className="h-2 w-6 bg-text-muted/10 mb-1" />
                  <div className="h-3 w-8 bg-text-muted/10" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <h3 className="font-mono text-sm text-text-light mb-2">
          NO AGENTS FOUND
        </h3>
        <p className="font-mono text-xs text-text-muted max-w-sm mx-auto leading-relaxed mb-4">
          {authed
            ? "Run Milady locally or create a cloud agent."
            : "Run Milady locally or sign in for cloud hosting."}
        </p>

        {/* Pricing preview */}
        <div className="max-w-xs mx-auto mb-6">
          <div className="grid grid-cols-3 gap-px bg-border-subtle text-center">
            <div className="bg-dark-secondary/50 px-3 py-2.5">
              <p className="font-mono text-[9px] tracking-wider text-text-subtle mb-1">
                RUNNING
              </p>
              <p className="font-mono text-xs font-semibold text-brand tabular-nums">
                {PRICE_RUNNING_PER_HR}/hr
              </p>
            </div>
            <div className="bg-dark-secondary/50 px-3 py-2.5">
              <p className="font-mono text-[9px] tracking-wider text-text-subtle mb-1">
                IDLE
              </p>
              <p className="font-mono text-xs font-semibold text-text-light tabular-nums">
                {PRICE_IDLE_PER_HR}/hr
              </p>
            </div>
            <div className="bg-dark-secondary/50 px-3 py-2.5">
              <p className="font-mono text-[9px] tracking-wider text-text-subtle mb-1">
                MIN. DEPOSIT
              </p>
              <p className="font-mono text-xs font-semibold text-text-light tabular-nums">
                {MIN_DEPOSIT_DISPLAY}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="/#install"
            className="flex items-center justify-center gap-2 px-5 py-2.5 
              bg-brand text-dark font-mono text-xs font-semibold tracking-wide
              hover:bg-brand-hover transition-all duration-150"
          >
            DOWNLOAD APP
          </a>
          <button
            type="button"
            onClick={onCreateClick}
            className="flex items-center justify-center gap-2 px-5 py-2.5 
              border border-border text-text-muted font-mono text-xs tracking-wide
              hover:text-text-light hover:border-text-muted hover:bg-surface 
              transition-all duration-150"
          >
            + CREATE CLOUD AGENT
          </button>
        </div>
      </div>

      {/* Bottom hint */}
      <div className="px-4 py-2 bg-dark-secondary border-t border-border">
        <span className="font-mono text-[10px] text-text-subtle">
          Use Connect to add another server target
        </span>
      </div>
    </div>
  );
}
