/**
 * CodeCanvas — Live coding agent activity panel.
 *
 * Shows what the coding agent is doing in real-time: active sessions,
 * tool calls, file operations, and embedded terminal output.
 */

import { client } from "@miladyai/app-core/api";
import type { CodingAgentSession } from "@miladyai/app-core/api";
import {
  FolderOpen,
  Terminal,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../../state";
import { PULSE_STATUSES, STATUS_DOT } from "./pty-status-dots";
import { useCodeCanvas } from "./CodeCanvasContext";
import { PtyTerminalPane } from "./PtyTerminalPane";

/** Activity event from the pty-session-event WebSocket stream. */
interface ActivityEntry {
  id: number;
  sessionId: string;
  eventType: string;
  description: string;
  timestamp: number;
}

let activityIdCounter = 0;

function statusLabel(status: CodingAgentSession["status"]): string {
  switch (status) {
    case "active":
      return "Running";
    case "blocked":
      return "Blocked";
    case "tool_running":
      return "Tool running";
    case "completed":
      return "Done";
    case "stopped":
      return "Stopped";
    case "error":
      return "Error";
    default:
      return status;
  }
}

function RelativeTime({ ts }: { ts: number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(interval);
  }, []);
  const ago = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (ago < 5) return <span>just now</span>;
  if (ago < 60) return <span>{ago}s ago</span>;
  return <span>{Math.floor(ago / 60)}m ago</span>;
}

export function CodeCanvas() {
  const { open, focusedSessionId, closeCanvas, focusSession, hideSession, hiddenSessionIds } = useCodeCanvas();
  const { ptySessions: allPtySessions } = useApp();
  const ptySessions = allPtySessions.filter((s) => !hiddenSessionIds.has(s.sessionId));
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [showTerminal, setShowTerminal] = useState<string | null>(null);
  const activityEndRef = useRef<HTMLDivElement>(null);

  // Listen for pty-session-event WebSocket messages to build activity feed
  useEffect(() => {
    if (!open) return;

    const unsub = client.onWsEvent(
      "pty-session-event",
      (data: Record<string, unknown>) => {
        const sessionId = data.sessionId as string;
        const eventType = data.eventType as string;
        const eventData = data.data as Record<string, unknown> | undefined;

        let description = eventType;
        if (eventType === "tool_running") {
          description =
            (eventData?.description as string) ??
            (eventData?.toolName as string) ??
            "Running tool";
        } else if (eventType === "task_registered") {
          description = `Task started: ${(eventData?.label as string) ?? sessionId}`;
        } else if (eventType === "task_complete") {
          description = `Completed: ${(eventData?.validationSummary as string) ?? "done"}`;
        } else if (eventType === "blocked") {
          description = "Waiting for approval";
        } else if (eventType === "blocked_auto_resolved") {
          description = "Auto-approved, continuing";
        } else if (eventType === "turn_complete") {
          description = "Turn complete";
        } else if (eventType === "error") {
          description = `Error: ${(eventData?.message as string) ?? "unknown"}`;
        } else if (eventType === "stopped") {
          description = "Task stopped";
        }

        const entry: ActivityEntry = {
          id: ++activityIdCounter,
          sessionId,
          eventType,
          description,
          timestamp: Date.now(),
        };

        setActivities((prev) => [...prev.slice(-100), entry]);
      },
    );

    return unsub;
  }, [open]);

  // Auto-scroll activity feed
  useEffect(() => {
    activityEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activities.length]);

  // Auto-focus first session if none selected
  const focused =
    ptySessions.find((s) => s.sessionId === focusedSessionId) ??
    ptySessions[0] ??
    null;

  const handleToggleTerminal = useCallback(
    (sessionId: string) => {
      setShowTerminal((prev) => (prev === sessionId ? null : sessionId));
    },
    [],
  );

  if (!open) return null;

  // Filter activities for focused session
  const filteredActivities = focused
    ? activities.filter((a) => a.sessionId === focused.sessionId)
    : activities;

  return (
    <aside
      className="fixed right-4 top-14 bottom-4 z-50 flex flex-col rounded-xl border border-border shadow-2xl w-[420px] xl:w-[520px] 2xl:w-[600px]"
      style={{ backgroundColor: "rgba(15, 17, 25, 0.95)", backdropFilter: "blur(12px)" }}
      data-no-camera-drag="true"
      data-no-camera-zoom="true"
      aria-label="Code canvas"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-bg-hover shrink-0 rounded-t-xl">
        <span className="text-xs font-semibold text-txt flex-1">
          Code Canvas
        </span>
        <span className="text-[10px] text-muted">
          {ptySessions.length} session{ptySessions.length !== 1 ? "s" : ""}
          {hiddenSessionIds.size > 0 && ` · ${hiddenSessionIds.size} hidden`}
        </span>
        <button
          type="button"
          onClick={closeCanvas}
          className="p-1 rounded text-muted hover:text-txt hover:bg-bg-hover transition-colors cursor-pointer"
          title="Close canvas"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Session tabs */}
      {ptySessions.length > 0 && (
        <div className="flex gap-0 overflow-x-auto border-b border-border bg-bg shrink-0">
          {ptySessions.map((s) => (
            <div
              key={s.sessionId}
              className={`group flex items-center border-b-2 whitespace-nowrap transition-colors ${
                s.sessionId === focused?.sessionId
                  ? "border-accent bg-accent/5"
                  : "border-transparent hover:bg-bg-hover"
              }`}
            >
              <button
                type="button"
                onClick={() => focusSession(s.sessionId)}
                className={`flex items-center gap-1.5 pl-3 pr-1 py-1.5 text-[11px] font-medium cursor-pointer ${
                  s.sessionId === focused?.sessionId
                    ? "text-accent"
                    : "text-muted hover:text-txt"
                }`}
              >
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                    STATUS_DOT[s.status] ?? "bg-muted"
                  }${PULSE_STATUSES.has(s.status) ? " animate-pulse" : ""}`}
                />
                <span className="truncate max-w-[120px]">{s.label}</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  hideSession(s.sessionId);
                }}
                className="p-0.5 mr-1 rounded opacity-0 group-hover:opacity-100 text-muted hover:text-txt hover:bg-bg-hover transition-all cursor-pointer"
                title="Close tab"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Focused session details */}
      {focused ? (
        <>
          {/* Session info bar */}
          <div className="px-3 py-2 border-b border-border bg-card shrink-0 space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    STATUS_DOT[focused.status] ?? "bg-muted"
                  }${PULSE_STATUSES.has(focused.status) ? " animate-pulse" : ""}`}
                />
                <span className="text-xs font-medium text-txt">
                  {statusLabel(focused.status)}
                </span>
                <span className="text-[10px] text-muted">
                  {focused.agentType}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleToggleTerminal(focused.sessionId)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors cursor-pointer ${
                  showTerminal === focused.sessionId
                    ? "text-accent bg-accent/10"
                    : "text-muted hover:text-txt hover:bg-bg-hover"
                }`}
                title="Toggle terminal"
              >
                <Terminal className="w-3 h-3" />
                Terminal
              </button>
            </div>

            {focused.workdir && (
              <div className="flex items-center gap-1.5 text-[10px] text-muted">
                <FolderOpen className="w-3 h-3 shrink-0" />
                <span className="truncate font-mono">{focused.workdir}</span>
              </div>
            )}

            {focused.originalTask && (
              <div className="text-[11px] text-txt/80 line-clamp-2">
                {focused.originalTask}
              </div>
            )}

            {focused.toolDescription && (
              <div className="text-[10px] text-accent font-medium">
                {focused.toolDescription}
              </div>
            )}
          </div>

          {/* Terminal pane (collapsible) */}
          {showTerminal === focused.sessionId && (
            <div className="border-b border-border" style={{ height: "35vh", minHeight: 150 }}>
              <PtyTerminalPane
                sessionId={focused.sessionId}
                visible
              />
            </div>
          )}

          {/* Activity feed */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="px-3 py-2">
              <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">
                Activity
              </div>
              {filteredActivities.length === 0 ? (
                <div className="text-[11px] text-muted italic py-4 text-center">
                  {focused.lastActivity ?? "Waiting for activity..."}
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredActivities.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-start gap-2 text-[11px] py-0.5"
                    >
                      <span className="text-muted/50 shrink-0 tabular-nums text-[10px] mt-px">
                        <RelativeTime ts={entry.timestamp} />
                      </span>
                      <span
                        className={
                          entry.eventType === "error"
                            ? "text-danger"
                            : entry.eventType === "task_complete"
                              ? "text-ok"
                              : entry.eventType === "blocked"
                                ? "text-warning"
                                : "text-txt/80"
                        }
                      >
                        {entry.description}
                      </span>
                    </div>
                  ))}
                  <div ref={activityEndRef} />
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center text-sm text-muted">
          No active coding sessions
        </div>
      )}

      {/* Footer */}
      {focused && (
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-border bg-bg-hover text-[10px] text-muted shrink-0">
          <span>
            {focused.decisionCount} decision{focused.decisionCount !== 1 ? "s" : ""}
            {focused.autoResolvedCount > 0 &&
              ` \u00b7 ${focused.autoResolvedCount} auto`}
          </span>
          <span>{focused.agentType}</span>
        </div>
      )}
    </aside>
  );
}
