/**
 * Role utility functions — hierarchy checks, permission gates, world helpers.
 */

import type { IAgentRuntime, Memory, UUID } from "@elizaos/core";
import { type RoleName, type RolesWorldMetadata, ROLE_RANK } from "./types";

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
  const { metadata } = resolved;
  const entityId = message.entityId as UUID;
  const role = getEntityRole(metadata, entityId);
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
