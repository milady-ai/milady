import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./claude-jsonl-completion-watcher", () => ({
  readLatestAssistantFromWorkdir: vi.fn().mockResolvedValue(null),
}));

import { installTaskProgressStreamer } from "./task-progress-streamer";

type SessionEventCallback = (
  sessionId: string,
  event: string,
  data: unknown,
) => void;

function createRuntime() {
  const getTaskThread = vi.fn().mockResolvedValue({ roomId: "room-1" });
  return {
    getRoom: vi.fn().mockResolvedValue({
      id: "room-1",
      source: "telegram",
      channelId: null,
      serverId: "server-1",
    }),
    sendMessageToTarget: vi.fn().mockResolvedValue(undefined),
    getService: vi.fn((name: string) =>
      name === "SWARM_COORDINATOR" ? { getTaskThread } : null,
    ),
    getTaskThread,
  };
}

function createPtyService(metadata: Record<string, unknown>): {
  pty: {
    onSessionEvent: ReturnType<typeof vi.fn>;
    sessionMetadata: Map<string, Record<string, unknown>>;
    getSession: ReturnType<typeof vi.fn>;
  };
  emitSessionEvent: SessionEventCallback;
} {
  let emit: SessionEventCallback = () => {};
  const pty = {
    onSessionEvent: vi.fn((cb: SessionEventCallback) => {
      emit = cb;
      return () => {};
    }),
    sessionMetadata: new Map([["s-1", metadata]]),
    getSession: vi.fn().mockReturnValue({ workdir: "/workspace/task-agent" }),
  };
  return {
    pty,
    emitSessionEvent: (sessionId, event, data) => emit(sessionId, event, data),
  };
}

describe("installTaskProgressStreamer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  async function flushFinalReportDelay() {
    vi.advanceTimersByTime(10_000);
    await Promise.resolve();
    await Promise.resolve();
  }

  it("routes delayed final reports back through the originating room", async () => {
    const runtime = createRuntime();
    const { pty, emitSessionEvent } = createPtyService({
      threadId: "thread-1",
    });

    installTaskProgressStreamer(runtime as never, pty as never);

    emitSessionEvent("s-1", "task_complete", {});
    await flushFinalReportDelay();

    expect(runtime.getTaskThread).toHaveBeenCalledWith("thread-1");
    expect(runtime.sendMessageToTarget).toHaveBeenCalledWith(
      {
        source: "telegram",
        roomId: "room-1",
        channelId: "room-1",
        serverId: "server-1",
      },
      expect.objectContaining({
        text: "task finished",
      }),
    );
  });

  it("routes login-required notices back through the originating room", async () => {
    const runtime = createRuntime();
    const { pty, emitSessionEvent } = createPtyService({ roomId: "room-1" });

    installTaskProgressStreamer(runtime as never, pty as never);

    emitSessionEvent("s-1", "login_required", {
      instructions: "Finish signing in",
      url: "https://claude.example/login",
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(runtime.sendMessageToTarget).toHaveBeenCalledWith(
      {
        source: "telegram",
        roomId: "room-1",
        channelId: "room-1",
        serverId: "server-1",
      },
      expect.objectContaining({
        text: expect.stringContaining(
          "Login link: https://claude.example/login",
        ),
      }),
    );
  });

  it("still routes the final completion after a recoverable login notice", async () => {
    const runtime = createRuntime();
    const { pty, emitSessionEvent } = createPtyService({ roomId: "room-1" });

    installTaskProgressStreamer(runtime as never, pty as never);

    emitSessionEvent("s-1", "login_required", {
      instructions: "Finish signing in",
      url: "https://claude.example/login",
    });
    emitSessionEvent("s-1", "task_complete", {});
    await flushFinalReportDelay();

    expect(runtime.sendMessageToTarget).toHaveBeenCalledTimes(2);
    expect(runtime.sendMessageToTarget.mock.calls[0]?.[1]?.text).toContain(
      "provider login",
    );
    expect(runtime.sendMessageToTarget.mock.calls[1]?.[1]?.text).toContain(
      "task finished",
    );
  });
});
