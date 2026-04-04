/**
 * Chat workspace widget bar.
 *
 * Desktop: persistent right rail alongside /chat.
 * Mobile: sheet content toggled from the chat header.
 *
 * Shows open todos, ongoing orchestrator sessions, and recent activity.
 */

import type { CodingAgentSession, WorkbenchTodo } from "@miladyai/app-core/api";
import { Badge, Button } from "@miladyai/ui";
import { Activity, ListTodo } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { client } from "../../api";
import { TERMINAL_STATUSES } from "../../coding";
import type { ActivityEvent } from "../../hooks/useActivityEvents";
import { useApp } from "../../state";
import { PULSE_STATUSES, STATUS_DOT } from "../coding/pty-status-dots";

interface TasksEventsPanelProps {
  open: boolean;
  /** Activity events from the parent — kept alive even when the panel unmounts. */
  events: ActivityEvent[];
  clearEvents: () => void;
  /** When true, renders as full-width content (inside a mobile DrawerSheet). */
  mobile?: boolean;
}

const TODO_REFRESH_INTERVAL_MS = 15_000;
const MAX_VISIBLE_TODOS = 8;

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

function sortTodosForWidget(todos: WorkbenchTodo[]): WorkbenchTodo[] {
  return [...todos].sort((left, right) => {
    if (left.isCompleted !== right.isCompleted) {
      return left.isCompleted ? 1 : -1;
    }
    if (left.isUrgent !== right.isUrgent) {
      return left.isUrgent ? -1 : 1;
    }
    const leftPriority = left.priority ?? Number.MAX_SAFE_INTEGER;
    const rightPriority = right.priority ?? Number.MAX_SAFE_INTEGER;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return left.name.localeCompare(right.name);
  });
}

function dedupeTodos(todos: WorkbenchTodo[]): WorkbenchTodo[] {
  const byId = new Map<string, WorkbenchTodo>();
  for (const todo of todos) {
    byId.set(todo.id, todo);
  }
  return sortTodosForWidget([...byId.values()]);
}

function WidgetSection({
  title,
  icon,
  count,
  action,
  children,
  testId,
}: {
  title: string;
  icon: ReactNode;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
  testId: string;
}) {
  return (
    <section
      data-testid={testId}
      className="rounded-xl border border-border/60 bg-bg-accent/25"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border/40 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-bg-hover text-muted">
            {icon}
          </span>
          <span className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-muted">
            {title}
          </span>
          {typeof count === "number" ? (
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              {count}
            </Badge>
          ) : null}
        </div>
        {action}
      </div>
      <div className="px-3 py-3">{children}</div>
    </section>
  );
}

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
      className="w-full cursor-pointer rounded-lg border border-border/50 bg-bg-accent/30 p-3 text-left transition-colors hover:bg-bg-hover"
    >
      <div className="mb-1 flex items-center gap-2">
        <span
          className={`inline-block h-2 w-2 shrink-0 rounded-full ${
            STATUS_DOT[session.status] ?? "bg-muted"
          }${PULSE_STATUSES.has(session.status) ? " animate-pulse" : ""}`}
        />
        <span className="flex-1 truncate text-xs font-semibold text-txt">
          {session.label}
        </span>
      </div>
      {session.originalTask ? (
        <p className="mb-1 line-clamp-2 text-[11px] text-muted">
          {session.originalTask}
        </p>
      ) : null}
      <p
        className={`truncate text-[11px] ${
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

function TodoRow({ todo }: { todo: WorkbenchTodo }) {
  const showDescription =
    todo.description.trim().length > 0 && todo.description !== todo.name;
  const showType = todo.type.trim().length > 0 && todo.type !== "task";

  return (
    <div className="rounded-lg border border-border/50 bg-bg/70 p-3">
      <div className="flex items-start gap-2">
        <span
          className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${
            todo.isUrgent
              ? "bg-danger"
              : todo.priority != null
                ? "bg-accent"
                : "bg-muted"
          }`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="min-w-0 truncate text-xs font-semibold text-txt">
              {todo.name}
            </span>
            {todo.isUrgent ? (
              <Badge variant="secondary" className="text-[9px] text-danger">
                Urgent
              </Badge>
            ) : null}
            {todo.priority != null ? (
              <Badge variant="secondary" className="text-[9px]">
                P{todo.priority}
              </Badge>
            ) : null}
            {showType ? (
              <Badge variant="secondary" className="text-[9px]">
                {todo.type}
              </Badge>
            ) : null}
          </div>
          {showDescription ? (
            <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted">
              {todo.description}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TodosSection({
  todos,
  loading,
}: {
  todos: WorkbenchTodo[];
  loading: boolean;
}) {
  const openTodos = todos.filter((todo) => !todo.isCompleted);
  const hiddenCompletedCount = todos.length - openTodos.length;
  const visibleTodos = openTodos.slice(0, MAX_VISIBLE_TODOS);
  const remainingCount = openTodos.length - visibleTodos.length;

  if (loading && todos.length === 0) {
    return <div className="py-3 text-xs text-muted">Refreshing todos…</div>;
  }

  if (openTodos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <ListTodo className="h-8 w-8 text-muted/50" />
        <p className="text-sm text-muted">No open todos</p>
        <p className="text-xs text-muted/70">
          Agent-created work items will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {visibleTodos.map((todo) => (
        <TodoRow key={todo.id} todo={todo} />
      ))}
      {remainingCount > 0 ? (
        <p className="px-1 text-[11px] text-muted">
          +{remainingCount} more open todo{remainingCount === 1 ? "" : "s"}
        </p>
      ) : null}
      {hiddenCompletedCount > 0 ? (
        <p className="px-1 text-[11px] text-muted">
          {hiddenCompletedCount} completed todo
          {hiddenCompletedCount === 1 ? "" : "s"} hidden
        </p>
      ) : null}
    </div>
  );
}

function TasksSection({ sessions }: { sessions: CodingAgentSession[] }) {
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <Activity className="h-8 w-8 text-muted/50" />
        <p className="text-sm text-muted">No orchestrator work running</p>
        <p className="text-xs text-muted/70">
          New coding agent sessions will appear here live.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {sessions.map((session) => (
        <TaskCard key={session.sessionId} session={session} />
      ))}
    </div>
  );
}

function EventsSection({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <Activity className="h-8 w-8 text-muted/50" />
        <p className="text-sm text-muted">No recent events</p>
        <p className="text-xs text-muted/70">
          Activity events will stream here in real time.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {events.map((event) => (
        <div
          key={event.id}
          className="flex items-start gap-2 rounded px-2 py-1.5 transition-colors hover:bg-bg-hover/50"
        >
          <span className="mt-0.5 w-12 shrink-0 whitespace-nowrap text-[10px] text-muted">
            {relativeTime(event.timestamp)}
          </span>
          <Badge
            variant="secondary"
            className={`h-4 shrink-0 px-1.5 py-0 text-[9px] ${
              EVENT_TYPE_COLORS[event.eventType] ?? ""
            }`}
          >
            {event.eventType.replace(/_/g, " ")}
          </Badge>
          <span className="min-w-0 flex-1 break-words text-[11px] text-txt">
            {event.summary}
          </span>
        </div>
      ))}
    </div>
  );
}

export function TasksEventsPanel({
  open,
  events,
  clearEvents,
  mobile = false,
}: TasksEventsPanelProps) {
  const { ptySessions, t, workbench } = useApp();
  const [todos, setTodos] = useState<WorkbenchTodo[]>(() =>
    dedupeTodos(workbench?.todos ?? []),
  );
  const [todosLoading, setTodosLoading] = useState(false);

  const activeSessions = useMemo(
    () =>
      (ptySessions ?? []).filter(
        (session) => !TERMINAL_STATUSES.has(session.status),
      ),
    [ptySessions],
  );
  const openTodoCount = useMemo(
    () => todos.filter((todo) => !todo.isCompleted).length,
    [todos],
  );

  useEffect(() => {
    setTodos(dedupeTodos(workbench?.todos ?? []));
  }, [workbench?.todos]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let active = true;

    const loadTodos = async (silent = false) => {
      if (!silent) {
        setTodosLoading(true);
      }

      try {
        const result = await client.listWorkbenchTodos();
        if (!active) {
          return;
        }
        setTodos(dedupeTodos(result.todos));
      } catch {
        if (!active) {
          return;
        }
        if ((workbench?.todos?.length ?? 0) > 0) {
          setTodos(dedupeTodos(workbench?.todos ?? []));
        }
      } finally {
        if (active) {
          setTodosLoading(false);
        }
      }
    };

    void loadTodos(todos.length > 0);
    const intervalId = window.setInterval(() => {
      void loadTodos(true);
    }, TODO_REFRESH_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [open, todos.length, workbench?.todos]);

  if (!open) return null;

  const rootClassName = mobile
    ? "flex flex-1 min-h-0 flex-col overflow-hidden bg-bg"
    : "flex min-h-0 w-[22rem] shrink-0 flex-col overflow-hidden border-l border-border bg-bg";

  return (
    <aside className={rootClassName} data-testid="chat-widgets-bar">
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
        <WidgetSection
          title={t("taskseventspanel.Todos", { defaultValue: "Todos" })}
          icon={<ListTodo className="h-4 w-4" />}
          count={openTodoCount}
          testId="chat-widget-todos"
        >
          <TodosSection todos={todos} loading={todosLoading} />
        </WidgetSection>

        <WidgetSection
          title={t("taskseventspanel.Tasks", { defaultValue: "Tasks" })}
          icon={<Activity className="h-4 w-4" />}
          count={activeSessions.length}
          testId="chat-widget-orchestrator"
        >
          <TasksSection sessions={activeSessions} />
        </WidgetSection>

        <WidgetSection
          title={t("taskseventspanel.Events", { defaultValue: "Events" })}
          icon={<Activity className="h-4 w-4" />}
          count={events.length}
          action={
            events.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearEvents}
                className="h-6 px-2 text-xs text-muted"
              >
                Clear
              </Button>
            ) : undefined
          }
          testId="chat-widget-events"
        >
          <EventsSection events={events} />
        </WidgetSection>
      </div>
    </aside>
  );
}
