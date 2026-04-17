import { useState } from "react";
import type { ManagedAgent } from "../../lib/AgentProvider";
import { FilterChips } from "../ui/FilterChips";
import { InstanceCard } from "./InstanceCard";

export type GridFilter = "all" | "local" | "cloud" | "remote";

export interface InstanceGridProps {
  agents: ManagedAgent[];
  loading: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  onOpen: (agent: ManagedAgent) => void;
  onCopyUrl: (agent: ManagedAgent) => void;
  /** Forget a remote connection (local state only). */
  onForgetRemote: (agent: ManagedAgent) => void;
  /** Delete a cloud agent (real resource). Returns a promise for in-card state. */
  onDeleteCloud: (agent: ManagedAgent) => Promise<void>;
  onAttachRemote: () => void;
  onOpenLocal: () => void;
  onProvisionAgent?: () => void;
  canProvision: boolean;
}

export function InstanceGrid({
  agents,
  loading,
  isRefreshing,
  onRefresh,
  onOpen,
  onCopyUrl,
  onForgetRemote,
  onDeleteCloud,
  onAttachRemote,
  onOpenLocal,
  onProvisionAgent,
  canProvision,
}: InstanceGridProps) {
  const [filter, setFilter] = useState<GridFilter>("all");

  const counts = {
    all: agents.length,
    local: agents.filter((agent) => agent.source === "local").length,
    cloud: agents.filter((agent) => agent.source === "cloud").length,
    remote: agents.filter((agent) => agent.source === "remote").length,
  };
  const filtered =
    filter === "all"
      ? agents
      : agents.filter((agent) => agent.source === filter);
  const showControls = agents.length > 0 || loading;

  return (
    <section aria-labelledby="runtimes-heading" className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2
          id="runtimes-heading"
          className="text-[15px] font-medium tracking-tight text-white/80"
        >
          runtimes
          {counts.all > 0 ? (
            <span className="ml-2 font-mono text-[11px] font-normal text-white/35">
              {counts.all}
            </span>
          ) : null}
        </h2>

        {showControls ? (
          <div className="flex flex-wrap items-center gap-2">
            <FilterChips
              ariaLabel="Filter runtimes by source"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "all", count: counts.all },
                { value: "local", label: "local", count: counts.local },
                { value: "cloud", label: "cloud", count: counts.cloud },
                { value: "remote", label: "remote", count: counts.remote },
              ]}
            />
            {onProvisionAgent ? (
              <button
                type="button"
                onClick={onProvisionAgent}
                disabled={!canProvision}
                aria-label={
                  canProvision
                    ? "Create new cloud agent"
                    : "Sign in to cloud to create an agent"
                }
                title={
                  canProvision
                    ? "Create a new cloud agent"
                    : "Sign in to cloud to create an agent"
                }
                className="group/new inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-white/[0.02] px-3 font-mono text-[11px] lowercase tracking-[0.06em] text-white/70 transition duration-200 hover:border-brand/40 hover:bg-brand/[0.05] hover:text-brand active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span
                  aria-hidden="true"
                  className="inline-block transition duration-200 group-hover/new:rotate-90"
                >
                  +
                </span>
                <span>new agent</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              aria-label="Refresh runtimes"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-white/70 transition hover:border-white/25 hover:text-white disabled:opacity-50"
            >
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className={isRefreshing ? "animate-spin" : ""}
              >
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
              </svg>
            </button>
          </div>
        ) : null}
      </header>

      {loading ? (
        <GridSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState
          filter={filter}
          onAttachRemote={onAttachRemote}
          onOpenLocal={onOpenLocal}
          onProvisionAgent={onProvisionAgent}
          canProvision={canProvision}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((agent) => (
            <InstanceCard
              key={agent.id}
              agent={agent}
              onOpen={() => onOpen(agent)}
              onCopyUrl={() => onCopyUrl(agent)}
              onForget={
                agent.source === "remote"
                  ? () => onForgetRemote(agent)
                  : undefined
              }
              onDelete={
                agent.source === "cloud"
                  ? () => onDeleteCloud(agent)
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

function GridSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading runtimes"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex flex-col gap-4 rounded-lg border border-border bg-white/[0.02] p-5"
          style={{ animationDelay: `${i * 90}ms` }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="skeleton-shimmer h-3 w-20 rounded" />
            <div className="skeleton-shimmer h-3 w-24 rounded opacity-60" />
          </div>
          <div className="space-y-2">
            <div className="skeleton-shimmer h-5 w-2/3 rounded" />
            <div className="skeleton-shimmer h-3 w-1/3 rounded opacity-60" />
          </div>
          <div className="flex items-center gap-1.5">
            <div className="skeleton-shimmer h-8 flex-1 rounded-md" />
            <div className="skeleton-shimmer h-8 w-8 rounded-md opacity-60" />
            <div className="skeleton-shimmer h-8 w-8 rounded-md opacity-60" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  filter,
  onAttachRemote,
  onOpenLocal,
  onProvisionAgent,
  canProvision,
}: {
  filter: GridFilter;
  onAttachRemote: () => void;
  onOpenLocal: () => void;
  onProvisionAgent?: () => void;
  canProvision: boolean;
}) {
  const cloudCta: ReactCTA | undefined =
    canProvision && onProvisionAgent
      ? { label: "+ new cloud agent", onClick: onProvisionAgent, primary: true }
      : undefined;
  const copy: Record<
    GridFilter,
    { title: string; body: string; cta?: ReactCTA }
  > = {
    all: {
      title: "no runtimes yet.",
      body: "open local milady, or attach a remote runtime by url.",
      cta: { label: "open local", onClick: onOpenLocal, primary: true },
    },
    local: {
      title: "no local runtime responded.",
      body: "launch milady locally, then refresh. we scan common local ports and configured sandboxes.",
      cta: { label: "open local", onClick: onOpenLocal, primary: true },
    },
    cloud: {
      title: canProvision ? "no cloud runtimes yet." : "no cloud runtimes.",
      body: canProvision
        ? "spin up your first cloud agent and it'll show up here."
        : "sign in to Eliza Cloud to discover hosted milady instances attached to your account.",
      cta: cloudCta,
    },
    remote: {
      title: "no remote connections.",
      body: "attach a vps, lan box, or any milady or elizaOS runtime by url.",
      cta: { label: "attach remote", onClick: onAttachRemote },
    },
  };
  const state = copy[filter];
  return (
    <div className="flex flex-col items-start gap-4 rounded-lg border border-border bg-white/[0.015] px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6">
      <div className="max-w-md space-y-1.5">
        <h3 className="text-[15px] font-medium tracking-tight text-white/90">
          {state.title}
        </h3>
        <p className="text-[13px] leading-6 text-white/55">{state.body}</p>
      </div>
      {state.cta ? (
        <button
          type="button"
          onClick={state.cta.onClick}
          className={`shrink-0 rounded-md px-4 py-2 text-[12px] font-medium transition duration-200 active:scale-[0.98] ${
            state.cta.primary
              ? "bg-brand text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_6px_16px_-8px_rgba(240,185,11,0.4)] hover:-translate-y-0.5 hover:bg-[var(--color-gold-300)]"
              : "border border-border text-white/85 hover:-translate-y-0.5 hover:border-white/25 hover:text-white"
          }`}
        >
          {state.cta.label}
        </button>
      ) : null}
    </div>
  );
}

interface ReactCTA {
  label: string;
  onClick: () => void;
  primary?: boolean;
}
