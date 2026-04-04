/**
 * Role-based access control types for plugin-roles.
 *
 * Roles are stored on `world.metadata.roles` as a Record<entityId, RoleName>.
 * The hierarchy is: OWNER > ADMIN > USER > GUEST.
 */

import type { UUID } from "@elizaos/core";

/**
 * Supported role levels.
 *
 * OWNER  — full control, can assign any role including other OWNERs.
 * ADMIN  — can manage USER/GUEST roles, access admin-gated features.
 * USER   — standard authenticated user, default for known entities.
 * GUEST  — minimal access, default for unknown/new entities.
 */
export type RoleName = "OWNER" | "ADMIN" | "USER" | "GUEST";

/** Role hierarchy — higher number = more privilege. */
export const ROLE_RANK: Record<RoleName, number> = {
  GUEST: 0,
  USER: 1,
  ADMIN: 2,
  OWNER: 3,
};

/** World metadata shape that we read/write roles from. */
export type RolesWorldMetadata = {
  ownership?: { ownerId?: string };
  roles?: Record<string, RoleName>;
};

/**
 * Per-connector admin whitelist configuration.
 *
 * Lives in milady.json at `roles.connectorAdmins`.
 * Keys are connector IDs (e.g. "discord", "telegram").
 * Values are arrays of platform-specific user identifiers
 * that should be auto-promoted to ADMIN when they first interact.
 */
export type ConnectorAdminWhitelist = Record<string, string[]>;

/**
 * Plugin-level configuration stored in milady.json under
 * `plugins.entries["@miladyai/plugin-roles"].config`.
 */
export type RolesPluginConfig = {
  /** Per-connector admin whitelists. */
  connectorAdmins?: ConnectorAdminWhitelist;
};

/** Result of a role check. */
export type RoleCheckResult = {
  entityId: UUID;
  role: RoleName;
  isOwner: boolean;
  isAdmin: boolean;
  canManageRoles: boolean;
};
