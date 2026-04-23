import { useEffect, useRef, useState } from "react";
import type { ManagedAgent } from "../../lib/AgentProvider";
import { formatUptime } from "../../lib/format";
import { StatusDot } from "../ui/StatusDot";

export interface InstanceCardProps {
  agent: ManagedAgent;
  onOpen: () => void;
  onCopyUrl: () => void;
  /**
   * Destructive action for cloud agents — deletes the real resource.
   * Returns a promise so the card can show a "deleting…" state.
   * Card handles the two-step inline confirm itself.
   */
  onDelete?: () => Promise<void>;
  /**
   * Destructive action for remote connections — drops local state only.
   * Single click (no confirm) since it's forgetting a URL, not destroying data.
   */
  onForget?: () => void;
}

const SOURCE_LABEL: Record<ManagedAgent["source"], string> = {
  local: "local",
  cloud: "cloud",
  remote: "remote",
};

type DeleteState = "idle" | "confirm" | "deleting";

/**
 * Copy + tooltip per non-running status. When the underlying container isn't
 * reachable we replace the "open" button with a muted, disabled variant so
 * users don't click through into a dead page.
 */
const OPEN_DISABLED_COPY: Partial<
  Record<
    import("../../lib/AgentProvider").ManagedAgent["status"],
    { label: string; title: string }
  >
> = {
  provisioning: {
    label: "starting\u2026",
    title: "Agent is booting up. This usually takes 30\u201360s.",
  },
  stopped: {
    label: "stopped",
    title: "Agent is stopped.",
  },
  paused: {
    label: "paused",
    title: "Agent is paused.",
  },
  unknown: {
    label: "unreachable",
    title: "Agent not responding to health checks.",
  },
};

/**
 * Runtime card — typography + data, no image.
 *
 * Action model (post-H7):
 *   Primary:   "open"  — gold, opens web UI (every source)
 *   Secondary: copy    — icon button, copies URL   (every source)
 *   Menu ⋯:    destructive only, per-source:
 *                cloud  → "delete agent"      (two-step inline confirm)
 *                remote → "forget connection" (single click)
 *                local  → no menu rendered
 */
export function InstanceCard({
  agent,
  onOpen,
  onCopyUrl,
  onDelete,
  onForget,
}: InstanceCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteState, setDeleteState] = useState<DeleteState>("idle");
  const menuRef = useRef<HTMLDivElement | null>(null);
  const confirmTimerRef = useRef<number | null>(null);

  // Close menu on outside click / escape; also reset any pending confirm state.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // When the menu closes, any pending "confirm?" should reset so it doesn't
  // persist silently into the next open.
  useEffect(() => {
    if (!menuOpen && deleteState === "confirm") {
      setDeleteState("idle");
      if (confirmTimerRef.current !== null) {
        window.clearTimeout(confirmTimerRef.current);
        confirmTimerRef.current = null;
      }
    }
  }, [menuOpen, deleteState]);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current !== null) {
        window.clearTimeout(confirmTimerRef.current);
      }
    };
  }, []);

  const uptimeLabel = agent.uptime ? formatUptime(agent.uptime) : null;
  const runtimeLabel = agent.model ?? "milady runtime";

  const hasMenu = !!onDelete || !!onForget;

  // Only allow opening the web UI when the runtime is actually reachable.
  // During provisioning / boot / stopped states, the button flips to a muted,
  // disabled variant with italic status text so nobody clicks into a dead page.
  const canOpen = agent.status === "running";
  const disabledCopy = canOpen ? null : OPEN_DISABLED_COPY[agent.status];

  const handleDeleteClick = async () => {
    if (!onDelete) return;
    if (deleteState === "idle") {
      setDeleteState("confirm");
      if (confirmTimerRef.current !== null) {
        window.clearTimeout(confirmTimerRef.current);
      }
      // Auto-revert confirm state after 4s so a half-intended click doesn't
      // stay armed forever.
      confirmTimerRef.current = window.setTimeout(() => {
        setDeleteState("idle");
      }, 4000);
      return;
    }
    if (deleteState === "confirm") {
      if (confirmTimerRef.current !== null) {
        window.clearTimeout(confirmTimerRef.current);
        confirmTimerRef.current = null;
      }
      setDeleteState("deleting");
      try {
        await onDelete();
        // On success the agent vanishes from the list, so this component
        // will unmount. If it doesn't (parent decided to keep it), reset.
        setDeleteState("idle");
        setMenuOpen(false);
      } catch {
        // Parent shows the toast; we just reset so user can retry.
        setDeleteState("idle");
      }
    }
  };

  const handleForgetClick = () => {
    if (!onForget) return;
    setMenuOpen(false);
    onForget();
  };

  return (
    <article className="group relative flex flex-col gap-4 rounded-lg border border-border bg-[#0b0b10] p-4 transition hover:border-brand/35 hover:shadow-[0_0_0_1px_rgba(240,185,11,0.08),0_12px_30px_-18px_rgba(240,185,11,0.18)] sm:p-5 [@media(hover:hover)]:hover:-translate-y-0.5">
      {/* Row 1 — inline meta strip */}
      <header className="flex items-center justify-between gap-3">
        <StatusDot status={agent.status} />
        <div className="flex items-center gap-3 font-mono text-[10px] lowercase tracking-[0.14em] text-white/40">
          <span>{SOURCE_LABEL[agent.source]}</span>
          {uptimeLabel ? (
            <>
              <span aria-hidden="true" className="text-white/20">
                ·
              </span>
              <span>up {uptimeLabel}</span>
            </>
          ) : null}
        </div>
      </header>

      {/* Row 2 — name + runtime */}
      <div>
        <h3 className="truncate text-[19px] font-semibold leading-tight tracking-tight text-white">
          {agent.name}
        </h3>
        <p className="mt-1 truncate font-mono text-[11px] lowercase tracking-[0.08em] text-white/40">
          {runtimeLabel}
        </p>
      </div>

      {/* Row 3 — action strip */}
      <div className="mt-1 flex items-center gap-1.5">
        {canOpen ? (
          <button
            type="button"
            onClick={onOpen}
            className="group/btn flex flex-1 items-center justify-between rounded-md bg-brand/90 px-3 py-2 text-[12px] font-semibold text-black transition duration-200 hover:bg-brand active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand/70"
          >
            <span className="inline-flex items-center gap-1.5">
              <svg
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
              <span>open</span>
            </span>
            <span
              aria-hidden="true"
              className="transition group-hover/btn:translate-x-0.5"
            >
              ↗
            </span>
          </button>
        ) : (
          <button
            type="button"
            disabled
            aria-disabled="true"
            tabIndex={-1}
            title={disabledCopy?.title}
            className="flex flex-1 items-center justify-between rounded-md border border-brand/20 bg-brand/[0.06] px-3 py-2 text-[12px] font-medium text-brand/60 cursor-not-allowed"
          >
            <span className="inline-flex items-center gap-2">
              {agent.status === "provisioning" ? (
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-brand animate-pulse"
                />
              ) : null}
              <span className="italic lowercase tracking-wide">
                {disabledCopy?.label ?? "unavailable"}
              </span>
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={onCopyUrl}
          aria-label={`Copy ${agent.name} URL`}
          title="Copy URL"
          className="rounded-md border border-border bg-transparent p-2 text-white/60 transition hover:border-white/25 hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white/30"
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
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
        </button>
        {hasMenu ? (
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="rounded-md border border-border bg-transparent p-2 text-white/60 transition hover:border-white/25 hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white/30"
            >
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="currentColor"
                aria-hidden="true"
              >
                <circle cx="5" cy="12" r="1.75" />
                <circle cx="12" cy="12" r="1.75" />
                <circle cx="19" cy="12" r="1.75" />
              </svg>
            </button>
            {menuOpen ? (
              <div
                role="menu"
                className="absolute bottom-full right-0 mb-2 w-52 overflow-hidden rounded-md border border-border bg-[#0d0d13] shadow-2xl"
              >
                {onDelete ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleDeleteClick()}
                    disabled={deleteState === "deleting"}
                    className={`block w-full px-3 py-2 text-left text-[12px] transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      deleteState === "confirm"
                        ? "bg-rose-500/10 font-medium text-rose-200"
                        : "text-rose-300 hover:bg-rose-500/10"
                    }`}
                  >
                    {deleteState === "idle"
                      ? "delete agent"
                      : deleteState === "confirm"
                        ? "confirm delete?"
                        : "deleting…"}
                  </button>
                ) : null}
                {onForget ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleForgetClick}
                    className="block w-full px-3 py-2 text-left text-[12px] text-rose-300 transition hover:bg-rose-500/10"
                  >
                    forget connection
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
