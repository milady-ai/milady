/**
 * Roles provider — injects the current speaker's role and the server role
 * hierarchy into the agent's context so actions/providers can be gated.
 */

import {
  logger,
  type IAgentRuntime,
  type Memory,
  type Provider,
  type ProviderResult,
  type State,
  type UUID,
} from "@elizaos/core";
import { type RoleName, type RolesWorldMetadata } from "./types";
import { getEntityRole, normalizeRole } from "./utils";

export const rolesProvider: Provider = {
  name: "roles",
  description:
    "Provides the current speaker's role and the server role hierarchy. " +
    "Use this to gate actions and decide what a user is allowed to do.",
  dynamic: true,
  position: 10,

  async get(
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
  ): Promise<ProviderResult> {
    const room = await runtime.getRoom(message.roomId);
    if (!room) {
      return empty("No room context available.");
    }

    // Roles apply in all channel types — DM owner is still OWNER.
    if (!room.worldId) {
      return empty("No world binding for this room.");
    }

    const world = await runtime.getWorld(room.worldId);
    if (!world) {
      return empty("World not found.");
    }

    const metadata = (world.metadata ?? {}) as RolesWorldMetadata;
    const roles = metadata.roles ?? {};
    const speakerRole = getEntityRole(metadata, message.entityId);

    // Build a compact role summary for the agent context.
    const owners: string[] = [];
    const admins: string[] = [];

    for (const [entityId, role] of Object.entries(roles)) {
      const normalized = normalizeRole(role);
      if (normalized === "OWNER") owners.push(entityId);
      else if (normalized === "ADMIN") admins.push(entityId);
    }

    // Resolve display names where possible (best-effort, no hard failures).
    const resolveNames = async (ids: string[]): Promise<string[]> => {
      const results: string[] = [];
      for (const id of ids) {
        try {
          const entity = await runtime.getEntityById(id as UUID);
          const name =
            entity?.names?.[0] ??
            (entity?.metadata as Record<string, Record<string, string>> | undefined)
              ?.default?.name ??
            id.slice(0, 8);
          results.push(name);
        } catch {
          results.push(id.slice(0, 8));
        }
      }
      return results;
    };

    const ownerNames = await resolveNames(owners);
    const adminNames = await resolveNames(admins);

    let text = `## Roles\n`;
    text += `Current speaker role: **${speakerRole}**\n`;
    if (ownerNames.length > 0) {
      text += `Owners: ${ownerNames.join(", ")}\n`;
    }
    if (adminNames.length > 0) {
      text += `Admins: ${adminNames.join(", ")}\n`;
    }

    const canManage = speakerRole === "OWNER" || speakerRole === "ADMIN";

    logger.debug(
      `[roles] Speaker ${message.entityId} role=${speakerRole} canManage=${canManage}`,
    );

    return {
      text,
      values: {
        speakerRole,
        canManageRoles: canManage,
        ownerCount: owners.length,
        adminCount: admins.length,
      },
      data: {
        speakerRole,
        canManageRoles: canManage,
        owners,
        admins,
        roles,
      },
    };
  },
};

function empty(reason: string): ProviderResult {
  return {
    text: "",
    values: {
      speakerRole: "NONE" as RoleName,
      canManageRoles: false,
    },
    data: {
      speakerRole: "NONE" as RoleName,
      canManageRoles: false,
      owners: [],
      admins: [],
      roles: {},
    },
  };
}
