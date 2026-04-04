/**
 * plugin-roles — Role-based access control for elizaOS.
 *
 * Provides OWNER / ADMIN / USER / GUEST role hierarchy with:
 * - Auto-assignment of OWNER to the app user (world owner)
 * - Connector admin whitelisting (Discord, Telegram, etc.)
 * - /role command for live role management
 * - Provider that injects role context for action/provider gating
 *
 * Config (milady.json):
 *   plugins.entries["@miladyai/plugin-roles"].config.connectorAdmins = {
 *     "discord": ["discordUserId1", "discordUserId2"],
 *     "telegram": ["telegramUserId1"]
 *   }
 */

import {
  logger,
  type IAgentRuntime,
  type Plugin,
} from "@elizaos/core";
import { rolesProvider } from "./provider";
import { updateRoleAction } from "./action";
import type { RolesPluginConfig, RolesWorldMetadata } from "./types";
import { normalizeRole } from "./utils";

export { rolesProvider } from "./provider";
export { updateRoleAction } from "./action";
export {
  canModifyRole,
  checkSenderRole,
  getEntityRole,
  normalizeRole,
  resolveWorldForMessage,
  setEntityRole,
} from "./utils";
export type {
  ConnectorAdminWhitelist,
  RoleCheckResult,
  RoleName,
  RolesPluginConfig,
  RolesWorldMetadata,
} from "./types";
export { ROLE_RANK } from "./types";

async function updateWorldMetadata(
  runtime: IAgentRuntime,
  worldId: string,
  update: (metadata: RolesWorldMetadata) => boolean | Promise<boolean>,
): Promise<void> {
  const world = await runtime.getWorld(worldId);
  if (!world) return;

  const metadata = (world.metadata ?? {}) as RolesWorldMetadata;
  const changed = await update(metadata);
  if (!changed) return;

  (world as { metadata: RolesWorldMetadata }).metadata = metadata;
  await runtime.updateWorld(world as Parameters<IAgentRuntime["updateWorld"]>[0]);
}

/**
 * Ensure the world owner has OWNER role in metadata.
 * Called on plugin init — guarantees the app-local user is always OWNER.
 */
async function ensureOwnerRole(runtime: IAgentRuntime): Promise<void> {
  try {
    const worlds = await runtime.getAllWorlds();

    for (const world of worlds) {
      if (!world.id) continue;

      await updateWorldMetadata(runtime, world.id, (metadata) => {
        const ownerId = metadata.ownership?.ownerId;
        if (!ownerId) return false;

        const currentRole = normalizeRole(metadata.roles?.[ownerId]);
        if (currentRole === "OWNER") return false;

        if (!metadata.roles) metadata.roles = {};
        metadata.roles[ownerId] = "OWNER";
        logger.info(
          `[roles] Auto-assigned OWNER role to world owner ${ownerId} in world ${world.id}`,
        );
        return true;
      });
    }
  } catch (err) {
    logger.warn(`[roles] Failed to bootstrap owner roles: ${err}`);
  }
}

/**
 * Apply connector admin whitelists from config.
 * Scans worlds for entities matching whitelisted IDs and promotes them to ADMIN.
 */
async function applyConnectorAdminWhitelists(
  runtime: IAgentRuntime,
  whitelist: Record<string, string[]>,
): Promise<void> {
  const hasWhitelist = Object.values(whitelist).some((ids) => ids.length > 0);
  if (!hasWhitelist) return;

  try {
    const worlds = await runtime.getAllWorlds();

    for (const world of worlds) {
      if (!world.id) continue;

      const rooms = await runtime.getRooms(world.id);
      if (rooms.length === 0) continue;

      await updateWorldMetadata(runtime, world.id, async (metadata) => {
        if (!metadata.roles) metadata.roles = {};
        let updated = false;

        for (const room of rooms) {
          const entities = await runtime.getEntitiesForRoom(room.id);
          for (const entity of entities) {
            if (!entity?.id) continue;
            const entityId = entity.id;

            if (metadata.roles[entityId]) continue;

            if (!entity.metadata) continue;

            const platformMetadata = entity.metadata as Record<
              string,
              Record<string, unknown> | undefined
            >;
            let matched = false;

            for (const [connector, platformIds] of Object.entries(whitelist)) {
              const connectorMeta = platformMetadata[connector];
              if (!connectorMeta || typeof connectorMeta !== "object") continue;

              for (const field of ["userId", "id", "username", "userName"]) {
                const value = connectorMeta[field];
                if (typeof value === "string" && platformIds.includes(value)) {
                  matched = true;
                  break;
                }
              }

              if (matched) break;
            }

            if (matched) {
              metadata.roles[entityId] = "ADMIN";
              updated = true;
              logger.info(
                `[roles] Auto-promoted whitelisted entity ${entityId} to ADMIN`,
              );
            }
          }
        }

        return updated;
      });
    }
  } catch (err) {
    logger.warn(
      `[roles] Failed to apply connector admin whitelists: ${String(err)}`,
    );
  }
}

const rolesPlugin: Plugin = {
  name: "@miladyai/plugin-roles",
  description:
    "Role-based access control — OWNER/ADMIN/USER/GUEST hierarchy with " +
    "connector whitelisting and /role command.",

  providers: [rolesProvider],
  actions: [updateRoleAction],

  async init(pluginConfig: Record<string, unknown>, runtime: IAgentRuntime) {
    logger.info("[roles] Initializing plugin-roles");

    // Step 1: Ensure world owners have OWNER role
    await ensureOwnerRole(runtime);

    // Step 2: Apply connector admin whitelists if configured
    const config = pluginConfig as RolesPluginConfig | undefined;
    if (config?.connectorAdmins) {
      await applyConnectorAdminWhitelists(runtime, config.connectorAdmins);
    }

    logger.info("[roles] Plugin-roles initialized");
  },
};

export default rolesPlugin;
