import type {
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
  State,
  UUID,
} from "@elizaos/core";
import { checkSenderRole } from "@miladyai/plugin-roles";

/** Maximum total characters for the provider text output. */
const MAX_TEXT_LENGTH = 2000;

/** Maximum messages to fetch per client_chat room. */
const MESSAGES_PER_ROOM = 10;

/** Maximum client_chat rooms to scan (most recent activity wins). */
const MAX_ROOMS = 3;

type WorldMetadataShape = {
  ownership?: { ownerId?: string };
};

/**
 * Resolves the owner entity ID from the current message's room/world chain.
 * Returns `undefined` when the ownership metadata is absent.
 */
async function resolveOwnerEntityId(
  runtime: IAgentRuntime,
  message: Memory,
): Promise<string | undefined> {
  const room = await runtime.getRoom(message.roomId);
  if (!room?.worldId) return undefined;
  const world = await runtime.getWorld(room.worldId);
  const metadata = (world?.metadata ?? {}) as WorldMetadataShape;
  return metadata.ownership?.ownerId ?? undefined;
}

/**
 * Returns true when the caller is the agent itself or an admin/owner.
 */
async function hasAdminPanelAccess(
  runtime: IAgentRuntime,
  message: Memory,
): Promise<boolean> {
  if (message.entityId === runtime.agentId) {
    return true;
  }
  const role = await checkSenderRole(runtime, message);
  return Boolean(role?.isAdmin);
}

/**
 * Fetch recent messages from the owner's client_chat rooms.
 * Returns messages newest-first, capped to a sensible limit.
 */
async function fetchOwnerChatMessages(
  runtime: IAgentRuntime,
  adminEntityId: string,
): Promise<Memory[]> {
  const roomIds = await runtime.getRoomsForParticipant(adminEntityId as UUID);
  if (roomIds.length === 0) return [];

  // Resolve rooms and filter to client_chat source
  const roomResults = await Promise.all(
    roomIds.map((id) => runtime.getRoom(id)),
  );
  const chatRooms = roomResults.filter(
    (r): r is NonNullable<typeof r> => r != null && r.source === "client_chat",
  );
  if (chatRooms.length === 0) return [];

  // Limit how many rooms we scan
  const targetRooms = chatRooms.slice(0, MAX_ROOMS);
  const targetRoomIds = targetRooms.map((r) => r.id as UUID);

  const memories = await runtime.getMemoriesByRoomIds({
    tableName: "messages",
    roomIds: targetRoomIds,
    limit: MESSAGES_PER_ROOM * MAX_ROOMS,
  });

  // Sort newest-first (getMemoriesByRoomIds default may vary)
  memories.sort((a, b) => {
    const ta = a.createdAt ?? 0;
    const tb = b.createdAt ?? 0;
    return tb - ta;
  });

  return memories.slice(0, MESSAGES_PER_ROOM * MAX_ROOMS);
}

function formatMessages(
  messages: Memory[],
  agentId: string,
): string {
  if (messages.length === 0) return "";

  // Display oldest-first for natural reading order
  const ordered = [...messages].reverse();

  const lines = ordered.map((m) => {
    const sender = m.entityId === agentId ? "Agent" : "Owner";
    const text = (m.content as { text?: string })?.text ?? "";
    return `[${sender}] ${text.substring(0, 200)}`;
  });

  let result = `# Recent Owner Conversation (Milady App)\n${lines.join("\n")}`;
  if (result.length > MAX_TEXT_LENGTH) {
    result = `${result.substring(0, MAX_TEXT_LENGTH - 3)}...`;
  }
  return result;
}

export const adminPanelProvider: Provider = createAdminPanelProvider();

export function createAdminPanelProvider(): Provider {
  return {
    name: "adminPanel",
    description:
      "Surfaces the owner's recent Milady app chat so the agent has context across platforms.",
    dynamic: true,
    position: 14,
    async get(
      runtime: IAgentRuntime,
      message: Memory,
      _state: State,
    ): Promise<ProviderResult> {
      const empty: ProviderResult = {
        text: "",
        values: { hasAdminChat: false },
        data: { messageCount: 0 },
      };

      if (!(await hasAdminPanelAccess(runtime, message))) {
        return empty;
      }

      // Only inject web-chat history when the agent is responding within the
      // web chat itself.  Surfacing it in connector channels (iMessage,
      // Telegram, etc.) causes the agent to confuse which channel the current
      // conversation is on.
      const source = (message.content as Record<string, unknown> | undefined)
        ?.source;
      if (source && source !== "client_chat") {
        return empty;
      }

      const adminEntityId = await resolveOwnerEntityId(runtime, message);
      if (!adminEntityId) {
        return empty;
      }

      const messages = await fetchOwnerChatMessages(runtime, adminEntityId);
      const text = formatMessages(messages, runtime.agentId);

      return {
        text,
        values: { hasAdminChat: messages.length > 0 },
        data: { messageCount: messages.length },
      };
    },
  };
}
