/**
 * Hook that subscribes to WebSocket activity events and maintains a ring buffer
 * of recent entries for the Tasks & Events panel.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { client } from "../api";

const RING_BUFFER_CAP = 200;

export interface ActivityEvent {
  id: string;
  timestamp: number;
  eventType: string;
  sessionId?: string;
  summary: string;
}

let nextEventId = 0;

function makeEventId(): string {
  nextEventId += 1;
  return `evt-${nextEventId}-${Date.now()}`;
}

/**
 * Subscribe to "pty-session-event" and "proactive-message" WS events,
 * returning a capped list of recent activity entries.
 */
export function useActivityEvents() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const bufferRef = useRef<ActivityEvent[]>([]);

  const pushEvent = useCallback((entry: Omit<ActivityEvent, "id">) => {
    const event: ActivityEvent = { ...entry, id: makeEventId() };
    const buf = bufferRef.current;
    buf.unshift(event);
    if (buf.length > RING_BUFFER_CAP) {
      buf.length = RING_BUFFER_CAP;
    }
    setEvents([...buf]);
  }, []);

  useEffect(() => {
    const unbindPty = client.onWsEvent(
      "pty-session-event",
      (data: Record<string, unknown>) => {
        const eventType = (data.eventType ?? data.type) as string;
        const sessionId = data.sessionId as string | undefined;
        const d = data.data as Record<string, unknown> | undefined;

        let summary = eventType;
        if (eventType === "task_registered") {
          summary = `Task started: ${(d?.label as string) ?? sessionId ?? "unknown"}`;
        } else if (eventType === "task_complete" || eventType === "stopped") {
          summary = `Task ${eventType === "task_complete" ? "completed" : "stopped"}`;
        } else if (eventType === "tool_running") {
          const tool =
            (d?.description as string) ?? (d?.toolName as string) ?? "tool";
          summary = `Running ${tool}`.slice(0, 80);
        } else if (eventType === "blocked") {
          summary = "Waiting for input";
        } else if (eventType === "blocked_auto_resolved") {
          summary = "Decision auto-approved";
        } else if (eventType === "escalation") {
          summary = "Escalated — needs attention";
        } else if (eventType === "error") {
          summary = "Error occurred";
        }

        pushEvent({
          timestamp: Date.now(),
          eventType,
          sessionId: sessionId ?? undefined,
          summary,
        });
      },
    );

    const unbindProactive = client.onWsEvent(
      "proactive-message",
      (data: Record<string, unknown>) => {
        const message =
          typeof data.message === "string"
            ? data.message.slice(0, 120)
            : "Proactive message";
        pushEvent({
          timestamp: Date.now(),
          eventType: "proactive-message",
          summary: message,
        });
      },
    );

    return () => {
      unbindPty();
      unbindProactive();
    };
  }, [pushEvent]);

  const clearEvents = useCallback(() => {
    bufferRef.current = [];
    setEvents([]);
  }, []);

  return { events, clearEvents } as const;
}
