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

import { type IAgentRuntime, logger, type Plugin } from "@elizaos/core";
import { updateRoleAction } from "./action";
import { rolesProvider } from "./provider";
import type { RolesPluginConfig, RolesWorldMetadata } from "./types";
import {
  matchEntityToConnectorAdminWhitelist,
  normalizeRole,
  setConnectorAdminWhitelist,
} from "./utils";

const BOOTSTRAP_RETRY_TIMERS_KEY = Symbol.for(
  "@miladyai/plugin-roles.bootstrapRetries",
);
const BOOTSTRAP_RETRY_LIMIT = 3;

type RuntimeWithBootstrapRetries = IAgentRuntime & {
  [BOOTSTRAP_RETRY_TIMERS_KEY]?: Map<string, ReturnType<typeof setTimeout>>;
};

export { updateRoleAction } from "./action";
export { rolesProvider } from "./provider";
export type {
  ConnectorAdminWhitelist,
  RoleCheckResult,
  RoleName,
  RolesPluginConfig,
  RolesWorldMetadata,
} from "./types";
export { ROLE_RANK } from "./types";
export {
  canModifyRole,
  checkSenderRole,
  getEntityRole,
  normalizeRole,
  resolveWorldForMessage,
  setEntityRole,
} from "./utils";

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
  await runtime.updateWorld(
    world as Parameters<IAgentRuntime["updateWorld"]>[0],
  );
}

function getBootstrapRetryTimers(
  runtime: IAgentRuntime,
): Map<string, ReturnType<typeof setTimeout>> {
  const runtimeWithBootstrapRetries = runtime as RuntimeWithBootstrapRetries;
  runtimeWithBootstrapRetries[BOOTSTRAP_RETRY_TIMERS_KEY] ??= new Map();
  return runtimeWithBootstrapRetries[BOOTSTRAP_RETRY_TIMERS_KEY];
}

function scheduleBootstrapRetry(
  runtime: IAgentRuntime,
  label: string,
  task: () => Promise<boolean>,
  attempt = 1,
): void {
  const timers = getBootstrapRetryTimers(runtime);
  const existingTimer = timers.get(label);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const delayMs = Math.min(1500 * attempt, 5000);
  const timer = setTimeout(() => {
    timers.delete(label);
    void task().then((ok) => {
      if (ok) {
        return;
      }

      if (attempt >= BOOTSTRAP_RETRY_LIMIT) {
        logger.warn(
          `[roles] ${label} retries exhausted because runtime state is still unavailable`,
        );
        return;
      }

      logger.info(
        `[roles] ${label} retry ${attempt} skipped because runtime state is still unavailable`,
      );
      scheduleBootstrapRetry(runtime, label, task, attempt + 1);
    });
  }, delayMs);
  timers.set(label, timer);
}

/**
 * Ensure the world owner has OWNER role in metadata.
 * Called on plugin init — guarantees the app-local user is always OWNER.
 */
async function ensureOwnerRole(runtime: IAgentRuntime): Promise<boolean> {
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
    return true;
  } catch (err) {
    logger.info(
      `[roles] Deferring owner role bootstrap until worlds are available: ${err}`,
    );
    return false;
  }
}

/**
 * Apply connector admin whitelists from config.
 * Scans worlds for entities matching whitelisted IDs and promotes them to ADMIN.
 */
async function applyConnectorAdminWhitelists(
  runtime: IAgentRuntime,
  whitelist: Record<string, string[]>,
): Promise<boolean> {
  const hasWhitelist = Object.values(whitelist).some((ids) => ids.length > 0);
  if (!hasWhitelist) return true;

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

            const matched = matchEntityToConnectorAdminWhitelist(
              (entity.metadata as Record<string, unknown> | undefined) ??
                undefined,
              whitelist,
            );

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
    return true;
  } catch (err) {
    logger.info(
      `[roles] Deferring connector admin bootstrap until worlds are available: ${String(err)}`,
    );
    return false;
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
    const config = pluginConfig as RolesPluginConfig | undefined;

    // Step 1: Ensure world owners have OWNER role
    const ownerBootstrapOk = await ensureOwnerRole(runtime);
    if (!ownerBootstrapOk) {
      scheduleBootstrapRetry(runtime, "Owner role bootstrap", () =>
        ensureOwnerRole(runtime),
      );
    }

    // Step 2: Apply connector admin whitelists if configured
    const connectorAdmins = config?.connectorAdmins;
    if (connectorAdmins) {
      setConnectorAdminWhitelist(runtime, connectorAdmins);
      const adminBootstrapOk = await applyConnectorAdminWhitelists(
        runtime,
        connectorAdmins,
      );
      if (!adminBootstrapOk) {
        scheduleBootstrapRetry(runtime, "Connector admin bootstrap", () =>
          applyConnectorAdminWhitelists(runtime, connectorAdmins),
        );
      }
    } else {
      setConnectorAdminWhitelist(runtime, undefined);
    }

    logger.info("[roles] Plugin-roles initialized");
  },
};

export default rolesPlugin;
