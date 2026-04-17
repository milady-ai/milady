import type { ManagedAgent } from "../../lib/AgentProvider";

const LABELS: Record<ManagedAgent["status"], string> = {
  running: "running",
  paused: "paused",
  stopped: "stopped",
  provisioning: "starting",
  unknown: "unknown",
};

const COLORS: Record<ManagedAgent["status"], string> = {
  running: "bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.35)]",
  paused: "bg-brand shadow-[0_0_6px_rgba(240,185,11,0.32)]",
  stopped: "bg-rose-400",
  provisioning: "bg-brand animate-pulse",
  unknown: "bg-white/30",
};

export function StatusDot({
  status,
  withLabel = true,
  className = "",
}: {
  status: ManagedAgent["status"];
  withLabel?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 ${className}`}
      title={LABELS[status]}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${COLORS[status]}`}
        aria-hidden="true"
      />
      {withLabel ? (
        <span className="text-[11px] text-white/70 lowercase tracking-wide">
          {LABELS[status]}
        </span>
      ) : (
        <span className="sr-only">{LABELS[status]}</span>
      )}
    </span>
  );
}
