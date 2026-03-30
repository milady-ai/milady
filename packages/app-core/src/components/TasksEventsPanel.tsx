/**
 * Tasks & Events side panel — collapsible right-side panel showing active
 * coding agent tasks and a recent event log.
 */

import type { CodingAgentSession } from "@miladyai/app-core/api";
import { useApp } from "../state";
import type { ActivityEvent } from "../hooks/useActivityEvents";
import {
  Badge,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@miladyai/ui";
import { Activity, ListTodo, X } from "lucide-react";
import { PULSE_STATUSES, STATUS_DOT } from "./pty-status-dots";

interface TasksEventsPanelProps {
  open: boolean;
  onClose: () => void;
  /** Activity events from the parent — kept alive even when the panel unmounts. */
  events: ActivityEvent[];
  clearEvents: () => void;
  /** When true, renders as full-width content (inside a mobile DrawerSheet). */
  mobile?: boolean;
}

/** Derive activity text for a coding agent session. */
function deriveSessionActivity(s: CodingAgentSession): string {
  if (s.status === "tool_running" && s.toolDescription) {
    return `Running ${s.toolDescription}`.slice(0, 60);
  }
  if (s.status === "blocked") return "Waiting for input";
  if (s.status === "error") return "Error";
  return "Running";
}

/** Format a timestamp as a relative string (e.g. "2m ago"). */
function relativeTime(ts: number): string {
  const delta = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (delta < 5) return "just now";
  if (delta < 60) return `${delta}s ago`;
  const mins = Math.floor(delta / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  task_registered: "bg-ok/20 text-ok",
  task_complete: "bg-ok/20 text-ok",
  stopped: "bg-muted/20 text-muted",
  tool_running: "bg-accent/20 text-accent",
  blocked: "bg-warn/20 text-warn",
  blocked_auto_resolved: "bg-ok/20 text-ok",
  escalation: "bg-warn/20 text-warn",
  error: "bg-danger/20 text-danger",
  "proactive-message": "bg-accent/20 text-accent",
};

function TaskCard({
  session,
  onSessionClick,
}: {
  session: CodingAgentSession;
  onSessionClick?: (sessionId: string) => void;
}) {
  const activity = session.lastActivity ?? deriveSessionActivity(session);

  return (
    <button
      type="button"
      onClick={() => onSessionClick?.(session.sessionId)}
      className="w-full text-left rounded-lg border border-border/50 bg-bg-accent/30 p-3 transition-colors hover:bg-bg-hover cursor-pointer"
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className={`inline-block w-2 h-2 rounded-full shrink-0 ${
            STATUS_DOT[session.status] ?? "bg-muted"
          }${PULSE_STATUSES.has(session.status) ? " animate-pulse" : ""}`}
        />
        <span className="text-xs font-semibold text-txt truncate flex-1">
          {session.label}
        </span>
      </div>
      {session.originalTask ? (
        <p className="text-[11px] text-muted line-clamp-2 mb-1">
          {session.originalTask}
        </p>
      ) : null}
      <p
        className={`text-[11px] truncate ${
          session.status === "error"
            ? "text-danger"
            : session.status === "blocked"
              ? "text-warn"
              : "text-muted"
        }`}
      >
        {activity}
      </p>
    </button>
  );
}

function TasksTab() {
  const { ptySessions } = useApp();
  const sessions = ptySessions ?? [];

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <ListTodo className="w-8 h-8 text-muted/50" />
        <p className="text-sm text-muted">No active tasks</p>
        <p className="text-xs text-muted/70">
          Coding agent tasks will appear here when running.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-1">
      {sessions.map((session) => (
        <TaskCard key={session.sessionId} session={session} />
      ))}
    </div>
  );
}

function EventsTab({
  events,
  clearEvents,
}: {
  events: ActivityEvent[];
  clearEvents: () => void;
}) {
  return (
    <div className="flex flex-col min-h-0">
      {events.length > 0 ? (
        <div className="flex items-center justify-end px-1 py-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={clearEvents}
            className="text-xs text-muted h-6 px-2"
          >
            Clear
          </Button>
        </div>
      ) : null}
      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <Activity className="w-8 h-8 text-muted/50" />
          <p className="text-sm text-muted">No recent events</p>
          <p className="text-xs text-muted/70">
            Activity events will stream here in real time.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5 p-1">
          {events.map((event) => (
            <div
              key={event.id}
              className="flex items-start gap-2 rounded px-2 py-1.5 hover:bg-bg-hover/50 transition-colors"
            >
              <span className="text-[10px] text-muted whitespace-nowrap mt-0.5 w-12 shrink-0">
                {relativeTime(event.timestamp)}
              </span>
              <Badge
                variant="secondary"
                className={`text-[9px] px-1.5 py-0 h-4 shrink-0 ${
                  EVENT_TYPE_COLORS[event.eventType] ?? ""
                }`}
              >
                {event.eventType.replace(/_/g, " ")}
              </Badge>
              <span className="text-[11px] text-txt min-w-0 break-words flex-1">
                {event.summary}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TasksEventsPanel({
  open,
  onClose,
  events,
  clearEvents,
  mobile = false,
}: TasksEventsPanelProps) {
  const { t } = useApp();

  if (!open) return null;

  const rootClassName = mobile
    ? "flex flex-col flex-1 min-h-0 overflow-hidden bg-bg"
    : "w-80 shrink-0 border-l border-border bg-bg flex flex-col min-h-0 overflow-hidden";

  return (
    <aside className={rootClassName}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50">
        <h2 className="text-sm font-semibold text-txt">
          {t("taskseventspanel.Title", { defaultValue: "Tasks & Events" })}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-7 w-7 text-muted hover:text-txt"
          aria-label={t("aria.close")}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="tasks" className="flex flex-col flex-1 min-h-0">
        <TabsList className="mx-3 mt-2 shrink-0">
          <TabsTrigger value="tasks" className="flex-1 text-xs">
            {t("taskseventspanel.Tasks", { defaultValue: "Tasks" })}
          </TabsTrigger>
          <TabsTrigger value="events" className="flex-1 text-xs">
            {t("taskseventspanel.Events", { defaultValue: "Events" })}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="tasks" className="flex-1 overflow-y-auto px-2 pb-2">
          <TasksTab />
        </TabsContent>
        <TabsContent
          value="events"
          className="flex-1 overflow-y-auto px-2 pb-2"
        >
          <EventsTab events={events} clearEvents={clearEvents} />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
