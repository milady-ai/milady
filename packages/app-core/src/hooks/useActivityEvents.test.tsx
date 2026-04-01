// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const wsMocks = vi.hoisted(() => {
  const handlers = new Map<string, (data: Record<string, unknown>) => void>();
  const unsubscribers = new Map<string, ReturnType<typeof vi.fn>>();
  const client = {
    onWsEvent: vi.fn(
      (type: string, handler: (data: Record<string, unknown>) => void) => {
        handlers.set(type, handler);
        const unsubscribe = vi.fn(() => {
          handlers.delete(type);
        });
        unsubscribers.set(type, unsubscribe);
        return unsubscribe;
      },
    ),
  };
  return { client, handlers, unsubscribers };
});

vi.mock("../api", () => ({
  client: wsMocks.client,
}));

import { useActivityEvents } from "./useActivityEvents";

let latestState: ReturnType<typeof useActivityEvents> | null = null;

function Harness() {
  latestState = useActivityEvents();
  return null;
}

describe("useActivityEvents", () => {
  beforeEach(() => {
    latestState = null;
    wsMocks.handlers.clear();
    wsMocks.unsubscribers.clear();
    wsMocks.client.onWsEvent.mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-30T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("subscribes to websocket events, appends summaries, and clears them", () => {
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(React.createElement(Harness));
    });

    act(() => {
      wsMocks.handlers.get("pty-session-event")?.({
        eventType: "task_registered",
        sessionId: "session-1",
        data: { label: "Build dashboard" },
      });
    });

    expect(latestState?.events).toHaveLength(1);
    expect(latestState?.events[0]).toMatchObject({
      eventType: "task_registered",
      sessionId: "session-1",
      summary: "Task started: Build dashboard",
    });

    act(() => {
      wsMocks.handlers.get("proactive-message")?.({
        message: "Follow-up issue created",
      });
    });

    expect(latestState?.events).toHaveLength(2);
    expect(latestState?.events[0]).toMatchObject({
      eventType: "proactive-message",
      summary: "Follow-up issue created",
    });

    act(() => {
      latestState?.clearEvents();
    });

    expect(latestState?.events).toEqual([]);

    act(() => {
      tree!.unmount();
    });

    expect(
      wsMocks.unsubscribers.get("pty-session-event"),
    ).toHaveBeenCalledTimes(1);
    expect(
      wsMocks.unsubscribers.get("proactive-message"),
    ).toHaveBeenCalledTimes(1);
  });

  it("caps the ring buffer at 200 entries", () => {
    act(() => {
      TestRenderer.create(React.createElement(Harness));
    });

    act(() => {
      for (let index = 0; index < 205; index += 1) {
        wsMocks.handlers.get("pty-session-event")?.({
          eventType: "tool_running",
          sessionId: `session-${index}`,
          data: { toolName: `tool-${index}` },
        });
      }
    });

    expect(latestState?.events).toHaveLength(200);
    expect(latestState?.events[0]?.summary).toBe("Running tool-204");
    expect(latestState?.events.at(-1)?.summary).toBe("Running tool-5");
  });
});
