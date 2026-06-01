import { useEffect, useRef, useState } from "react";
import { runtime } from "./runtime/client";
import type { AgentStatus } from "./runtime/types";
import { Home } from "./ui/Home";
import { StartupShell } from "./ui/StartupShell";

type Phase =
  | { kind: "connecting"; status: string }
  | { kind: "ready"; status: AgentStatus };

/** Human-readable "what the agent is doing" from the runtime's boot phase. */
function phaseLabel(s: AgentStatus): string {
  const phase = s.startup?.phase ?? s.state;
  switch (phase) {
    case "starting":
    case "starting-backend":
      return "Starting agent…";
    case "polling-backend":
    case "connecting":
      return "Connecting to agent…";
    case "restoring-session":
      return "Restoring session…";
    case "loading-plugins":
    case "runtime-plugins":
    case "core-plugin-waves":
      return "Loading plugins…";
    case "migrating":
    case "hydrating":
      return "Preparing database…";
    case "running":
    case "ready":
      return "Ready";
    default:
      return phase ? `Agent: ${phase}…` : "Starting agent…";
  }
}

/**
 * Boot loop. Milady owns the splash→app transition (the old app waited on
 * eliza's coordinator with no feedback). We POLL /api/status, surface the live
 * boot phase so the user sees WHAT the agent is doing, and RETRY on transient
 * failure — the renderer can paint before the separate agent process is up, so
 * a single check would race and hang forever (the old desktop bug).
 */
export function App() {
  const [phase, setPhase] = useState<Phase>({
    kind: "connecting",
    status: "Connecting…",
  });
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    const ctrl = new AbortController();

    (async () => {
      for (let attempt = 0; !cancelled.current; attempt++) {
        try {
          const status = await runtime.getStatus(ctrl.signal);
          const ready =
            status.state === "running" || status.startup?.phase === "running";
          if (ready) {
            if (!cancelled.current) setPhase({ kind: "ready", status });
            return;
          }
          if (!cancelled.current)
            setPhase({ kind: "connecting", status: phaseLabel(status) });
        } catch {
          // Agent process not reachable yet (still binding / pre-auth window).
          if (!cancelled.current) {
            setPhase({
              kind: "connecting",
              status:
                attempt < 2
                  ? "Connecting to agent…"
                  : "Waiting for agent to start…",
            });
          }
        }
        await new Promise((r) => setTimeout(r, 800));
      }
    })();

    return () => {
      cancelled.current = true;
      ctrl.abort();
    };
  }, []);

  if (phase.kind === "ready") return <Home status={phase.status} />;
  return <StartupShell status={phase.status} />;
}
