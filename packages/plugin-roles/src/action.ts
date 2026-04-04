/**
 * UPDATE_ROLE action — simple, direct role assignment.
 *
 * Usage: `/role @username ADMIN` or `/role @username GUEST`
 *
 * No LLM extraction — parses the command directly from message text.
 * Only OWNER and ADMIN can assign roles (with hierarchy constraints).
 */

import {
  type Action,
  type ActionExample,
  type HandlerCallback,
  type IAgentRuntime,
  logger,
  type Memory,
  type State,
  type UUID,
} from "@elizaos/core";
import type { RoleName, RolesWorldMetadata } from "./types";
import {
  canModifyRole,
  getEntityRole,
  normalizeRole,
  resolveWorldForMessage,
} from "./utils";

/** Maximum length for message text we'll attempt to parse. */
const MAX_COMMAND_LENGTH = 200;

/** Maximum length for a target username. */
const MAX_USERNAME_LENGTH = 64;

/** Role names accepted in commands. MEMBER/NONE map to GUEST for backwards compat. */
const ROLE_PATTERN = "OWNER|ADMIN|USER|GUEST|MEMBER|NONE";

/**
 * Normalize a role string from user input to a valid assignable RoleName.
 * MEMBER and NONE are legacy aliases for GUEST.
 */
function normalizeInputRole(raw: string): RoleName {
  const upper = raw.toUpperCase();
  if (upper === "MEMBER" || upper === "NONE") return "GUEST";
  return normalizeRole(upper);
}

/**
 * Parse a role command from message text.
 *
 * Supports formats:
 *  - `/role @username ADMIN`
 *  - `role username USER`
 *  - `make @username admin`
 *  - `set @username role GUEST`
 *
 * Returns null if the message doesn't look like a role command.
 */
function parseRoleCommand(
  text: string,
): { targetName: string; newRole: RoleName } | null {
  if (!text) return null;
  const trimmed = text.trim();

  // Reject oversized input before regex processing.
  if (trimmed.length > MAX_COMMAND_LENGTH) return null;

  // Pattern: /role @name ROLE  or  role @name ROLE
  const slashRe = new RegExp(
    `^\\/?\\s*role\\s+@?(\\S+)\\s+(${ROLE_PATTERN})\\s*$`,
    "i",
  );
  const slashMatch = trimmed.match(slashRe);
  if (slashMatch) {
    const name = slashMatch[1];
    if (name.length > MAX_USERNAME_LENGTH) return null;
    return { targetName: name, newRole: normalizeInputRole(slashMatch[2]) };
  }

  // Pattern: make @name admin/owner/user/guest
  const makeRe = new RegExp(
    `^make\\s+@?(\\S+)\\s+(?:an?\\s+)?(${ROLE_PATTERN})\\s*$`,
    "i",
  );
  const makeMatch = trimmed.match(makeRe);
  if (makeMatch) {
    const name = makeMatch[1];
    if (name.length > MAX_USERNAME_LENGTH) return null;
    return { targetName: name, newRole: normalizeInputRole(makeMatch[2]) };
  }

  // Pattern: set @name role ADMIN
  const setRe = new RegExp(
    `^set\\s+@?(\\S+)\\s+(?:role\\s+)?(${ROLE_PATTERN})\\s*$`,
    "i",
  );
  const setMatch = trimmed.match(setRe);
  if (setMatch) {
    const name = setMatch[1];
    if (name.length > MAX_USERNAME_LENGTH) return null;
    return { targetName: name, newRole: normalizeInputRole(setMatch[2]) };
  }

  return null;
}

/**
 * Find an entity in the room by name/username.
 * Searches entity names and metadata for a match.
 */
async function findEntityByName(
  runtime: IAgentRuntime,
  roomId: UUID,
  targetName: string,
): Promise<UUID | null> {
  const lower = targetName.toLowerCase();
  try {
    const entities = await runtime.getEntitiesForRoom(roomId);
    for (const entity of entities) {
      if (!entity?.id) continue;
      const entityId = entity.id as UUID;

      // Check names array
      if (entity.names?.some((n: string) => n.toLowerCase() === lower)) {
        return entityId;
      }

      // Check metadata username/name fields
      const meta = entity.metadata as Record<
        string,
        Record<string, unknown> | undefined
      >;
      if (meta) {
        for (const source of Object.values(meta)) {
          if (
            typeof source === "object" &&
            source !== null &&
            ((typeof source.username === "string" &&
              source.username.toLowerCase() === lower) ||
              (typeof source.userName === "string" &&
                source.userName.toLowerCase() === lower) ||
              (typeof source.name === "string" &&
                source.name.toLowerCase() === lower))
          ) {
            return entityId;
          }
        }
      }
    }
  } catch (err) {
    logger.warn(`[roles] Failed to search entities: ${err}`);
  }
  return null;
}

export const updateRoleAction: Action = {
  name: "UPDATE_ROLE",
  similes: ["CHANGE_ROLE", "SET_ROLE", "ASSIGN_ROLE", "MAKE_ADMIN", "MAKE_OWNER"],
  description:
    "Assign a role (OWNER, ADMIN, USER, GUEST) to a user. " +
    "Usage: /role @username ADMIN. Only OWNERs and ADMINs can assign roles.",

  validate: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
  ): Promise<boolean> => {
    const text =
      typeof message?.content?.text === "string"
        ? message.content.text
        : "";
    // Only trigger on explicit role commands
    return parseRoleCommand(text) !== null;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback,
  ) => {
    const text =
      typeof message?.content?.text === "string"
        ? message.content.text
        : "";

    const parsed = parseRoleCommand(text);
    if (!parsed) {
      await callback?.({
        text: "Could not parse role command. Usage: `/role @username ADMIN`",
      });
      return { success: false };
    }

    const { targetName, newRole } = parsed;

    // Resolve world
    const resolved = await resolveWorldForMessage(runtime, message);
    if (!resolved) {
      await callback?.({
        text: "Cannot assign roles — no world context found for this room.",
      });
      return { success: false };
    }

    const { world, metadata } = resolved;

    // Check requester's role
    const requesterRole = getEntityRole(metadata, message.entityId);
    if (requesterRole !== "OWNER" && requesterRole !== "ADMIN") {
      await callback?.({
        text: "You don't have permission to manage roles. Only OWNERs and ADMINs can assign roles.",
      });
      return { success: false };
    }

    // Find target entity
    const targetEntityId = await findEntityByName(
      runtime,
      message.roomId,
      targetName,
    );
    if (!targetEntityId) {
      await callback?.({
        text: `Could not find user "${targetName}" in this room.`,
      });
      return { success: false };
    }

    // Check if target is the agent itself
    if (targetEntityId === runtime.agentId) {
      await callback?.({
        text: "Cannot change the agent's own role.",
      });
      return { success: false };
    }

    // Permission check
    const targetCurrentRole = getEntityRole(metadata, targetEntityId);

    // Prevent the last OWNER from demoting themselves
    if (
      targetEntityId === message.entityId &&
      requesterRole === "OWNER" &&
      newRole !== "OWNER"
    ) {
      const otherOwners = Object.entries(metadata.roles ?? {}).filter(
        ([id, r]) => id !== message.entityId && normalizeRole(r) === "OWNER",
      );
      if (otherOwners.length === 0) {
        await callback?.({
          text: "Cannot remove the last OWNER. Promote another user to OWNER first.",
        });
        return { success: false };
      }
    }
    if (!canModifyRole(requesterRole, targetCurrentRole, newRole)) {
      await callback?.({
        text: `Cannot change ${targetName}'s role from ${targetCurrentRole} to ${newRole}. ` +
          `Your role (${requesterRole}) doesn't have sufficient permissions.`,
      });
      return { success: false };
    }

    // Apply the role change
    if (!metadata.roles) metadata.roles = {};
    metadata.roles[targetEntityId] = newRole;
    (world as { metadata: RolesWorldMetadata }).metadata = metadata;
    await runtime.updateWorld(
      world as Parameters<IAgentRuntime["updateWorld"]>[0],
    );

    logger.info(
      `[roles] ${message.entityId} set ${targetEntityId} (${targetName}) to ${newRole}`,
    );

    await callback?.({
      text: `Updated ${targetName}'s role to **${newRole}**.`,
    });

    return {
      success: true,
      data: {
        targetEntityId,
        targetName,
        previousRole: targetCurrentRole,
        newRole,
        assignedBy: message.entityId,
      },
    };
  },

  examples: [
    [
      {
        name: "{{name1}}",
        content: { text: "/role @alice ADMIN" },
      },
      {
        name: "{{agentName}}",
        content: { text: "Updated alice's role to **ADMIN**." },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: { text: "make @bob user" },
      },
      {
        name: "{{agentName}}",
        content: { text: "Updated bob's role to **USER**." },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: { text: "/role @charlie GUEST" },
      },
      {
        name: "{{agentName}}",
        content: { text: "Updated charlie's role to **GUEST**." },
      },
    ],
  ] as ActionExample[][],
};
