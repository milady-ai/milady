import { runtime } from "../runtime/client";
import type { AgentStatus } from "../runtime/types";

const NAV = ["Companion", "Chat", "Wallet", "Character", "Settings"];

function uptimeLabel(ms?: number): string {
  if (!ms) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/**
 * Phase 0 home — a deliberately small but real Milady surface that proves the
 * boundary: the renderer reached "ready" purely by talking to the runtime over
 * HTTP, with no eliza `<App/>` and no eliza source graph compiled in.
 */
export function Home({ status }: { status: AgentStatus }) {
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__dot" aria-hidden="true" />
          Milady
        </div>
        <nav className="topbar__nav">
          {NAV.map((item, i) => (
            <button
              key={item}
              className={`nav__item${i === 0 ? " nav__item--active" : ""}`}
              type="button"
            >
              {item}
            </button>
          ))}
        </nav>
        <span className="topbar__phase">nextgen · phase 0</span>
      </header>

      <main className="stage">
        <div className="stage__orb" aria-hidden="true" />
        <h1 className="stage__title">Connected to the agent</h1>
        <p className="stage__subtitle">
          Milady's own renderer · talking to the eliza runtime over HTTP · no{" "}
          <code>&lt;App/&gt;</code>, no eliza source graph.
        </p>

        <dl className="statuscard">
          <div>
            <dt>Agent</dt>
            <dd>{status.agentName ?? "—"}</dd>
          </div>
          <div>
            <dt>State</dt>
            <dd>
              <span className="dot dot--ok" /> {status.state}
            </dd>
          </div>
          <div>
            <dt>Model provider</dt>
            <dd>{status.model ?? "not configured"}</dd>
          </div>
          <div>
            <dt>Uptime</dt>
            <dd>{uptimeLabel(status.uptime)}</dd>
          </div>
          <div>
            <dt>Runtime</dt>
            <dd className="mono">{runtime.base || "same-origin"}</dd>
          </div>
          <div>
            <dt>Cloud</dt>
            <dd>{status.cloud?.connectionStatus ?? "—"}</dd>
          </div>
        </dl>
      </main>
    </div>
  );
}
