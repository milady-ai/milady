import { describe, expect, it, vi } from "vitest";

import { routeTaskAgentTextToConnector } from "./task-agent-message-routing";

describe("routeTaskAgentTextToConnector", () => {
  it("routes task-agent messages through the originating connector room", async () => {
    const getTaskThread = vi.fn().mockResolvedValue({ roomId: "room-1" });
    const runtime = {
      getService: vi.fn((name: string) =>
        name === "SWARM_COORDINATOR" ? { getTaskThread } : null,
      ),
      getRoom: vi.fn().mockResolvedValue({
        id: "room-1",
        source: "telegram",
        channelId: null,
        serverId: "server-1",
      }),
      sendMessageToTarget: vi.fn().mockResolvedValue(undefined),
    };

    const delivered = await routeTaskAgentTextToConnector(
      runtime as never,
      "task agent needs your attention",
      "coding-agent",
      { threadId: "thread-1" },
    );

    expect(delivered).toBe(true);
    expect(getTaskThread).toHaveBeenCalledWith("thread-1");
    expect(runtime.sendMessageToTarget).toHaveBeenCalledWith(
      {
        source: "telegram",
        roomId: "room-1",
        channelId: "room-1",
        serverId: "server-1",
      },
      {
        text: "task agent needs your attention",
        source: "coding-agent",
      },
    );
  });

  it("returns false when no connector room can be resolved", async () => {
    const runtime = {
      getService: vi.fn().mockReturnValue({
        getTaskThread: vi.fn().mockResolvedValue(null),
      }),
      getRoom: vi.fn(),
      sendMessageToTarget: vi.fn(),
    };

    const delivered = await routeTaskAgentTextToConnector(
      runtime as never,
      "task agent needs your attention",
      "coding-agent",
      { threadId: "thread-1" },
    );

    expect(delivered).toBe(false);
    expect(runtime.getRoom).not.toHaveBeenCalled();
    expect(runtime.sendMessageToTarget).not.toHaveBeenCalled();
  });
});
