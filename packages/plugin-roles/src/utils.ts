/**
 * Role utility functions — hierarchy checks, permission gates, world helpers.
 */

import type { IAgentRuntime, Memory, UUID } from "@elizaos/core";
import {
  type ConnectorAdminWhitelist,
  type RoleName,
  type RolesWorldMetadata,
  ROLE_RANK,
} from "./types";

const CONNECTOR_ADMIN_WHITELIST_KEY = Symbol.for(
  "@miladyai/plugin-roles.connectorAdmins",
);
const CONNECTOR_ID_FIELDS = ["userId", "id", "username", "userName"] as const;

type RuntimeWithConnectorAdmins = IAgentRuntime & {
  [CONNECTOR_ADMIN_WHITELIST_KEY]?: ConnectorAdminWhitelist;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeConnectorAdminWhitelist(
  whitelist: ConnectorAdminWhitelist | Record<string, unknown> | undefined,
): ConnectorAdminWhitelist {
  if (!whitelist || typeof whitelist !== "object") return {};

  return Object.fromEntries(
    Object.entries(whitelist)
      .map(([connector, values]) => [connector, asStringArray(values)])
      .filter(([, values]) => values.length > 0),
  );
}

export function setConnectorAdminWhitelist(
  runtime: IAgentRuntime,
  whitelist: ConnectorAdminWhitelist | Record<string, unknown> | undefined,
): void {
  (runtime as RuntimeWithConnectorAdmins)[CONNECTOR_ADMIN_WHITELIST_KEY] =
    normalizeConnectorAdminWhitelist(whitelist);
}

export function getConnectorAdminWhitelist(
  runtime: IAgentRuntime,
): ConnectorAdminWhitelist {
  return (
    (runtime as RuntimeWithConnectorAdmins)[CONNECTOR_ADMIN_WHITELIST_KEY] ?? {}
  );
}

export function matchEntityToConnectorAdminWhitelist(
  entityMetadata: Record<string, unknown> | null | undefined,
  whitelist: ConnectorAdminWhitelist | Record<string, unknown> | undefined,
): { connector: string; matchedValue: string } | null {
  if (!entityMetadata || typeof entityMetadata !== "object") return null;

  const normalizedWhitelist = normalizeConnectorAdminWhitelist(whitelist);
  for (const [connector, platformIds] of Object.entries(normalizedWhitelist)) {
    const connectorMeta = entityMetadata[connector];
    if (
      !connectorMeta ||
      typeof connectorMeta !== "object" ||
      Array.isArray(connectorMeta)
    ) {
      continue;
    }

    for (const field of CONNECTOR_ID_FIELDS) {
      const value = connectorMeta[field];
      if (typeof value === "string" && platformIds.includes(value)) {
        return { connector, matchedValue: value };
      }
    }
  }

  return null;
}

/**
 * Normalise a role string to a valid RoleName. Unknown values become "GUEST".
 */
export function normalizeRole(raw: string | undefined | null): RoleName {
  const upper = (raw ?? "").toUpperCase();
  if (upper === "OWNER" || upper === "ADMIN" || upper === "USER") return upper;
  return "GUEST";
}

/**
 * Get an entity's role from world metadata.
 */
export function getEntityRole(
  metadata: RolesWorldMetadata | undefined,
  entityId: string,
): RoleName {
  if (!metadata?.roles) return "GUEST";
  return normalizeRole(metadata.roles[entityId]);
}

/**
 * Resolve an entity's effective role, including connector-admin whitelist
 * matches for users that first appear after plugin bootstrap.
 */
export async function resolveEntityRole(
  runtime: IAgentRuntime,
  world: Awaited<ReturnType<IAgentRuntime["getWorld"]>>,
  metadata: RolesWorldMetadata | undefined,
  entityId: string,
): Promise<RoleName> {
  const explicitRole = getEntityRole(metadata, entityId);
  if (explicitRole !== "GUEST") {
    return explicitRole;
  }

  const whitelist = getConnectorAdminWhitelist(runtime);
  if (Object.keys(whitelist).length === 0) {
    return explicitRole;
  }

  if (typeof runtime.getEntityById !== "function") {
    return explicitRole;
  }

  let entity: Awaited<ReturnType<IAgentRuntime["getEntityById"]>> | null = null;
  try {
    entity = await runtime.getEntityById(entityId as UUID);
  } catch {
    return explicitRole;
  }

  const matched = matchEntityToConnectorAdminWhitelist(
    (entity?.metadata as Record<string, unknown> | undefined) ?? undefined,
    whitelist,
  );
  if (!matched) {
    return explicitRole;
  }

  if (!metadata?.roles) {
    metadata = { ...(metadata ?? {}), roles: {} };
  }
  metadata.roles ??= {};
  metadata.roles[entityId] = "ADMIN";

  if (world) {
    try {
      (world as { metadata: RolesWorldMetadata }).metadata = metadata;
      await runtime.updateWorld(
        world as Parameters<IAgentRuntime["updateWorld"]>[0],
      );
    } catch {
      // Best-effort persistence. The effective role still resolves to ADMIN.
    }
  }

  return "ADMIN";
}

/**
 * Whether `actor` can set `target`'s role to `newRole`.
 *
 * Rules:
 * - OWNER can set anyone to any role (including other OWNERs).
 * - ADMIN can modify users ranked below them (USER/GUEST) and assign up to ADMIN.
 * - USER and GUEST cannot modify roles.
 * - Cannot set someone to the role they already have.
 */
export function canModifyRole(
  actorRole: RoleName,
  targetCurrentRole: RoleName,
  newRole: RoleName,
): boolean {
  if (targetCurrentRole === newRole) return false;
  const actorRank = ROLE_RANK[actorRole];
  const targetRank = ROLE_RANK[targetCurrentRole];
  if (actorRole === "OWNER") return true;
  // ADMIN can modify users ranked below them and assign up to their own level.
  if (actorRole === "ADMIN") {
    if (targetRank >= actorRank) return false; // can't touch peers or superiors
    if (newRole === "OWNER") return false; // can't promote to OWNER
    return true;
  }
  return false;
}

/**
 * Resolve the world + metadata for a message's room.
 * Returns null if the room or world can't be resolved.
 */
export async function resolveWorldForMessage(
  runtime: IAgentRuntime,
  message: Memory,
): Promise<{
  world: Awaited<ReturnType<IAgentRuntime["getWorld"]>>;
  metadata: RolesWorldMetadata;
} | null> {
  const room = await runtime.getRoom(message.roomId);
  if (!room?.worldId) return null;
  const world = await runtime.getWorld(room.worldId);
  if (!world) return null;
  const metadata = (world.metadata ?? {}) as RolesWorldMetadata;
  return { world, metadata };
}

/**
 * Get a RoleCheckResult for the message sender.
 */
export async function checkSenderRole(
  runtime: IAgentRuntime,
  message: Memory,
): Promise<{
  entityId: UUID;
  role: RoleName;
  isOwner: boolean;
  isAdmin: boolean;
  canManageRoles: boolean;
} | null> {
  const resolved = await resolveWorldForMessage(runtime, message);
  if (!resolved) return null;
  const { world, metadata } = resolved;
  const entityId = message.entityId as UUID;
  const role = await resolveEntityRole(runtime, world, metadata, entityId);
  return {
    entityId,
    role,
    isOwner: role === "OWNER",
    isAdmin: role === "OWNER" || role === "ADMIN",
    canManageRoles: role === "OWNER" || role === "ADMIN",
  };
}

/**
 * Set an entity's role in world metadata and persist.
 * Returns the updated metadata roles map.
 */
export async function setEntityRole(
  runtime: IAgentRuntime,
  message: Memory,
  targetEntityId: string,
  newRole: RoleName,
): Promise<Record<string, RoleName>> {
  const resolved = await resolveWorldForMessage(runtime, message);
  if (!resolved) throw new Error("Cannot resolve world for role assignment");
  const { world, metadata } = resolved;
  if (!metadata.roles) metadata.roles = {};
  metadata.roles[targetEntityId] = newRole;
  (world as { metadata: RolesWorldMetadata }).metadata = metadata;
  await runtime.updateWorld(world as Parameters<IAgentRuntime["updateWorld"]>[0]);
  return { ...metadata.roles };
}
