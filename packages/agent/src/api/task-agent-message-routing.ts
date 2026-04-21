import type { AgentRuntime, UUID } from "@elizaos/core";

export interface TaskAgentChatRouting {
  sessionId?: string;
  threadId?: string;
  roomId?: string | null;
}

type RoutingRuntime = Pick<
  AgentRuntime,
  "getRoom" | "getService" | "sendMessageToTarget"
>;

export async function routeTaskAgentTextToConnector(
  runtime: RoutingRuntime | null,
  text: string,
  source: string,
  routing?: TaskAgentChatRouting,
): Promise<boolean> {
  if (!runtime || !routing) return false;

  let roomId = routing.roomId ?? null;
  if (!roomId && routing.threadId) {
    const coordinator = runtime.getService("SWARM_COORDINATOR") as
      | { getTaskThread?: (threadId: string) => Promise<{ roomId?: string | null } | null> }
      | undefined;
    const thread = await coordinator?.getTaskThread?.(routing.threadId);
    roomId =
      thread && typeof thread.roomId === "string" && thread.roomId.trim().length > 0
        ? thread.roomId
        : null;
  }
  if (!roomId) return false;

  const room = await runtime.getRoom(roomId as UUID).catch(() => null);
  if (!room?.source) return false;

  await runtime.sendMessageToTarget(
    ({
      source: room.source,
      roomId: room.id,
      channelId: room.channelId ?? room.id,
      serverId: room.serverId ?? undefined,
    } as Parameters<RoutingRuntime["sendMessageToTarget"]>[0]),
    { text, source },
  );
  return true;
}
