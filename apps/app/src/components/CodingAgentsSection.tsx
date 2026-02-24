import { useState } from "react";
import type { CodingAgentSession } from "../api-client";
import { client } from "../api-client";

/** Agent type display labels. */
const AGENT_LABELS: Record<string, string> = {
  claude: "Claude",
  gemini: "Gemini",
  codex: "Codex",
  aider: "Aider",
};

/** Status dot color classes. */
const STATUS_DOT: Record<string, string> = {
  active: "bg-ok",
  blocked: "bg-warn",
  error: "bg-danger",
  completed: "bg-ok opacity-50",
  stopped: "bg-muted",
};

interface CodingAgentsSectionProps {
  sessions: CodingAgentSession[];
}

export function CodingAgentsSection({ sessions }: CodingAgentsSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [stopping, setStopping] = useState<Set<string>>(new Set());

  const handleStop = async (sessionId: string) => {
    setStopping((prev) => new Set([...prev, sessionId]));
    await client.stopCodingAgent(sessionId);
    // Don't remove from stopping — the WS event will remove the session
  };

  return (
    <div className="border-b border-border">
      <button
        type="button"
        className="flex justify-between items-center px-3 py-2 cursor-pointer hover:bg-bg-hover text-xs font-semibold uppercase tracking-wide text-muted w-full"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span>Coding Agents ({sessions.length})</span>
        <span>{collapsed ? "\u25B6" : "\u25BC"}</span>
      </button>
      {!collapsed && (
        <div className="px-3 pb-2 space-y-2">
          {sessions.map((session) => (
            <div
              key={session.sessionId}
              className="rounded border border-border px-2 py-1.5"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                    STATUS_DOT[session.status] ?? "bg-muted"
                  }${session.status === "active" ? " animate-pulse" : ""}`}
                />
                <span className="text-[11px] font-medium text-accent uppercase">
                  {AGENT_LABELS[session.agentType] ?? session.agentType}
                </span>
                <span className="text-[12px] text-txt-strong truncate flex-1 min-w-0">
                  {session.label}
                </span>
              </div>
              {session.originalTask && (
                <div className="text-[11px] text-muted mt-1 line-clamp-2">
                  {session.originalTask.length > 80
                    ? `${session.originalTask.slice(0, 80)}...`
                    : session.originalTask}
                </div>
              )}
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[10px] text-muted">
                  {session.status === "blocked"
                    ? "Waiting for input"
                    : session.status === "error"
                      ? "Error"
                      : "Running"}
                </span>
                {(session.status === "active" ||
                  session.status === "blocked") && (
                  <button
                    type="button"
                    className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted hover:text-danger hover:border-danger transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => handleStop(session.sessionId)}
                    disabled={stopping.has(session.sessionId)}
                  >
                    {stopping.has(session.sessionId) ? "Stopping..." : "Stop"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
