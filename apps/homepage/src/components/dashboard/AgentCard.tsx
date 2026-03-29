import type { AgentSource } from "../../lib/AgentProvider";
import type { AgentStatus } from "../../lib/cloud-api";
import { formatUptime } from "../../lib/format";

interface AgentCardProps {
  agent: AgentStatus;
  source: AgentSource;
  /** VRM avatar index from agent stream settings (overrides name-based hash). */
  avatarIndex?: number;
  detailsId?: string;
  sourceUrl?: string;
  webUiUrl?: string;
  nodeId?: string;
  lastHeartbeat?: string;
  billing?: {
    plan?: string;
    costPerHour?: number;
    totalCost?: number;
    currency?: string;
  };
  createdAt?: string;
  region?: string;
  onPlay: () => void;
  onResume: () => void;
  onPause: () => void;
  onStop: () => void;
  onSelect: () => void;
  onOpenUI?: () => void;
  selected: boolean;
  busy?: boolean;
}

const STATE_CONFIG: Record<
  string,
  { color: string; bg: string; bgLight: string; label: string; border: string }
> = {
  running: {
    color: "text-status-running",
    bg: "bg-status-running",
    bgLight: "bg-status-running/10",
    border: "border-status-running/20",
    label: "LIVE",
  },
  paused: {
    color: "text-brand",
    bg: "bg-brand",
    bgLight: "bg-brand/10",
    border: "border-brand/20",
    label: "PAUSED",
  },
  stopped: {
    color: "text-status-stopped",
    bg: "bg-status-stopped",
    bgLight: "bg-status-stopped/10",
    border: "border-status-stopped/20",
    label: "STOPPED",
  },
  provisioning: {
    color: "text-brand",
    bg: "bg-brand",
    bgLight: "bg-brand/10",
    border: "border-brand/20",
    label: "STARTING",
  },
  unknown: {
    color: "text-text-muted",
    bg: "bg-text-muted",
    bgLight: "bg-text-muted/10",
    border: "border-text-muted/20",
    label: "OFFLINE",
  },
};

/** Derive a character avatar index (1-8) from agent name */
function getAvatarIndex(name: string): number {
  const hash = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return (hash % 8) + 1;
}

const SOURCE_ICON: Record<string, string> = {
  cloud: "\u2601",
  local: "\u25C9",
  remote: "\u2B21",
};

function formatRelativeTime(isoString?: string): string {
  if (!isoString) return "";
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function stopProp(handler: () => void) {
  return (e: React.MouseEvent) => {
    e.stopPropagation();
    handler();
  };
}

function PlayIcon() {
  return (
    <svg
      aria-hidden="true"
      className="w-3 h-3"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M8 6.82v10.36c0 .79.87 1.27 1.54.84l8.16-5.18a1 1 0 0 0 0-1.68L9.54 5.98A1 1 0 0 0 8 6.82Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg
      aria-hidden="true"
      className="w-3 h-3"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M7 5.5A1.5 1.5 0 0 1 8.5 4h1A1.5 1.5 0 0 1 11 5.5v13A1.5 1.5 0 0 1 9.5 20h-1A1.5 1.5 0 0 1 7 18.5v-13Zm6 0A1.5 1.5 0 0 1 14.5 4h1A1.5 1.5 0 0 1 17 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-1A1.5 1.5 0 0 1 13 18.5v-13Z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg
      aria-hidden="true"
      className="w-3 h-3"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </svg>
  );
}

export function AgentCard({
  agent,
  source,
  detailsId,
  sourceUrl,
  webUiUrl,
  nodeId,
  lastHeartbeat,
  billing,
  createdAt,
  region,
  onPlay,
  onResume,
  onPause,
  onStop,
  onSelect,
  onOpenUI,
  avatarIndex: avatarIndexProp,
  selected,
  busy = false,
}: AgentCardProps) {
  const stateConfig = STATE_CONFIG[agent.state] ?? STATE_CONFIG.unknown;
  const canOpenUI = agent.state === "running" || source === "cloud";
  const uiUrl = webUiUrl || sourceUrl;
  const resolvedAvatarIndex =
    avatarIndexProp ?? getAvatarIndex(agent.agentName);
  const avatarUrl = `/vrms/previews/milady-${resolvedAvatarIndex}.png`;
  const isLive = agent.state === "running";
  const isProvisioning = agent.state === "provisioning";

  return (
    <article
      className={`group relative transition-[box-shadow,border-color,transform] duration-200
        ${
          selected ? "ring-1 ring-brand/50" : "hover:ring-1 hover:ring-border"
        }`}
    >
      {/* Status accent bar - left edge */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-1 transition-all duration-300
          ${stateConfig.bg} ${isLive || isProvisioning ? "animate-[status-pulse_2s_ease-in-out_infinite]" : ""}`}
      />

      {/* Card body */}
      <div
        className={`bg-surface border border-border ${selected ? "border-brand/30" : ""}`}
      >
        <button
          type="button"
          aria-expanded={selected}
          aria-controls={detailsId}
          aria-label={`Open details for ${agent.agentName}`}
          onClick={onSelect}
          className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-dark"
        >
          {/* Header row */}
          <div className="flex items-start gap-4 p-4 pb-0">
            {/* Agent avatar - prominent */}
            <div
              className={`w-12 h-12 flex-shrink-0 overflow-hidden
              ${stateConfig.border} border`}
            >
              <img
                src={avatarUrl}
                alt={agent.agentName}
                className="w-full h-full object-cover object-top"
              />
            </div>

            {/* Agent identity */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-medium text-text-light truncate leading-tight">
                  {agent.agentName}
                </h3>
                <span className="text-text-subtle text-xs" title={source}>
                  {SOURCE_ICON[source]}
                </span>
              </div>
              {agent.model && (
                <p className="text-xs text-text-muted mt-0.5 font-mono truncate">
                  {agent.model}
                </p>
              )}
            </div>

            {/* Status indicator */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <span
                className={`w-1.5 h-1.5 rounded-full ${stateConfig.bg}
                ${isLive || isProvisioning ? "animate-[status-pulse_2s_ease-in-out_infinite]" : ""}`}
              />
              <span
                className={`font-mono text-[11px] tracking-wide ${stateConfig.color}`}
              >
                {stateConfig.label}
              </span>
            </div>
          </div>

          {/* Stats grid - only show cells with real data */}
          {(() => {
            const stats: { label: string; value: string; accent?: boolean }[] =
              [
                { label: "UPTIME", value: formatUptime(agent.uptime) },
                {
                  label: "MEMORY",
                  value:
                    agent.memories !== undefined
                      ? String(agent.memories)
                      : "\u2014",
                },
              ];
            const hb = formatRelativeTime(lastHeartbeat);
            if (hb) {
              stats.push({ label: "HEARTBEAT", value: hb });
            }
            if (billing?.costPerHour !== undefined) {
              stats.push({
                label: "COST",
                value: `$${billing.costPerHour.toFixed(2)}`,
                accent: true,
              });
            }
            const cols =
              stats.length <= 2
                ? "grid-cols-2"
                : stats.length === 3
                  ? "grid-cols-3"
                  : "grid-cols-4";
            return (
              <div className={`grid ${cols} gap-px mt-4 bg-border-subtle`}>
                {stats.map((s) => (
                  <StatCell
                    key={s.label}
                    label={s.label}
                    value={s.value}
                    accent={s.accent}
                  />
                ))}
              </div>
            );
          })()}
        </button>

        {/* Actions row */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-dark-secondary/50">
          {/* Control actions */}
          <div className="flex flex-wrap items-center gap-1">
            {agent.state === "stopped" && (
              <ActionBtn
                onClick={stopProp(onPlay)}
                variant="success"
                icon={<PlayIcon />}
                label="Start"
                disabled={busy}
              />
            )}
            {agent.state === "paused" && (
              <ActionBtn
                onClick={stopProp(onResume)}
                variant="success"
                icon={<PlayIcon />}
                label="Resume"
                disabled={busy}
              />
            )}
            {agent.state === "running" && (
              <ActionBtn
                onClick={stopProp(onPause)}
                variant="warn"
                icon={<PauseIcon />}
                label="Pause"
                disabled={busy}
              />
            )}
            {agent.state !== "stopped" &&
              agent.state !== "provisioning" &&
              agent.state !== "unknown" && (
                <ActionBtn
                  onClick={stopProp(onStop)}
                  variant="danger"
                  icon={<StopIcon />}
                  label="Stop"
                  disabled={busy}
                />
              )}
            {(agent.state === "provisioning" || busy) && (
              <span className="text-[11px] font-mono text-brand animate-pulse px-2">
                {busy ? "Working\u2026" : "Starting\u2026"}
              </span>
            )}
          </div>

          {/* Open UI - primary when available */}
          {canOpenUI && uiUrl && (
            <button
              type="button"
              onClick={stopProp(() => {
                if (onOpenUI) {
                  onOpenUI();
                } else if (uiUrl) {
                  window.open(uiUrl, "_blank", "noopener,noreferrer");
                }
              })}
              aria-label={`Open ${agent.agentName} UI`}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5
                min-h-[40px] bg-brand text-dark font-mono text-[11px] font-semibold tracking-wide
                transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-dark
                hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              OPEN UI
              <svg
                aria-hidden="true"
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Extended info when selected */}
        {selected && (nodeId || region || createdAt) && (
          <div className="px-4 py-3 border-t border-border-subtle bg-dark-secondary/30">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono text-text-subtle">
              {nodeId && <span>NODE: {nodeId}</span>}
              {region && <span>REGION: {region.toUpperCase()}</span>}
              {createdAt && (
                <span>CREATED: {formatRelativeTime(createdAt)}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function StatCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-surface px-3 py-2.5">
      <p className="text-[9px] font-mono font-medium text-text-subtle tracking-wider mb-0.5">
        {label}
      </p>
      <p
        className={`text-sm font-mono font-medium tabular-nums
        ${accent ? "text-brand" : "text-text-light"}`}
      >
        {value}
      </p>
    </div>
  );
}

function ActionBtn({
  onClick,
  variant,
  icon,
  label,
  disabled = false,
}: {
  onClick: (e: React.MouseEvent) => void;
  variant: "success" | "warn" | "danger";
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
}) {
  const colors = {
    success:
      "text-status-running hover:bg-status-running/10 border-status-running/20",
    warn: "text-brand hover:bg-brand/10 border-brand/20",
    danger:
      "text-status-stopped hover:bg-status-stopped/10 border-status-stopped/20",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-2.5 py-1.5
        min-h-[40px] font-mono text-[11px] font-medium border transition-colors duration-150
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-dark disabled:cursor-not-allowed disabled:opacity-50
        ${colors[variant]}`}
    >
      <span className="inline-flex items-center justify-center">{icon}</span>
      {label}
    </button>
  );
}
