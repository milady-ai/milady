/**
 * Role utility functions — hierarchy checks, permission gates, world helpers.
 */

import fs from "node:fs";
import path from "node:path";

import {
  createUniqueUuid,
  type IAgentRuntime,
  logger,
  type Memory,
  type UUID,
} from "@elizaos/core";
import {
  type ConnectorAdminWhitelist,
  ROLE_RANK,
  type RoleName,
  type RolesWorldMetadata,
} from "./types";

const CONNECTOR_ADMIN_WHITELIST_KEY = Symbol.for(
  "@miladyai/plugin-roles.connectorAdmins",
);
const CONNECTOR_ADMIN_CACHE_KEY = Symbol.for(
  "@miladyai/plugin-roles.connectorAdmins.cache",
);
const CANONICAL_OWNER_SETTING_KEY = "MILADY_ADMIN_ENTITY_ID";
const OWNER_CONTACTS_SETTING_KEY = "MILADY_OWNER_CONTACTS_JSON";
const CONNECTOR_ID_FIELDS = ["userId", "id", "username", "userName"] as const;
const CONNECTOR_STABLE_ID_FIELDS = ["userId", "id"] as const;

type RuntimeWithConnectorAdmins = IAgentRuntime & {
  [CONNECTOR_ADMIN_WHITELIST_KEY]?: ConnectorAdminWhitelist;
  [CONNECTOR_ADMIN_CACHE_KEY]?: Set<string>;
};

type ResolveEntityRoleOptions = {
  liveEntityMetadata?: Record<string, unknown> | null;
};

type OwnerContactEntry = {
  entityId?: string;
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

function mergeConnectorAdminWhitelist(
  base: ConnectorAdminWhitelist,
  extra: ConnectorAdminWhitelist | Record<string, unknown> | undefined,
): ConnectorAdminWhitelist {
  const normalizedExtra = normalizeConnectorAdminWhitelist(extra);
  const merged: ConnectorAdminWhitelist = { ...base };
  for (const [connector, ids] of Object.entries(normalizedExtra)) {
    const existing = new Set(merged[connector] ?? []);
    for (const id of ids) {
      existing.add(id);
    }
    merged[connector] = Array.from(existing);
  }
  return merged;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function readLocalConnectorAdminWhitelist():
  | ConnectorAdminWhitelist
  | undefined {
  try {
    const configPath = path.join(process.env.HOME ?? "", ".milady/milady.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      plugins?: {
        entries?: Record<string, { config?: { connectorAdmins?: unknown } }>;
      };
    };
    return normalizeConnectorAdminWhitelist(
      asRecord(
        config.plugins?.entries?.["@miladyai/plugin-roles"]?.config
          ?.connectorAdmins,
      ),
    );
  } catch {
    return undefined;
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getRuntimeSettingString(
  runtime: IAgentRuntime,
  key: string,
): string | undefined {
  if (typeof runtime.getSetting !== "function") {
    return undefined;
  }

  const value = runtime.getSetting(key);
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseOwnerContactEntityIds(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, OwnerContactEntry>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return [];
    }

    return Object.values(parsed)
      .map((entry) =>
        entry && typeof entry.entityId === "string"
          ? entry.entityId.trim()
          : "",
      )
      .filter((entityId) => entityId.length > 0);
  } catch (error) {
    logger.warn(
      `[roles] Failed to parse owner contacts from runtime settings: ${formatError(error)}`,
    );
    return [];
  }
}

function getMemoryMetadata(
  message: Memory,
): Record<string, unknown> | undefined {
  return asRecord((message as Memory & { metadata?: unknown }).metadata);
}

function getMessageSource(message: Memory): string | undefined {
  return typeof message.content?.source === "string"
    ? message.content.source
    : undefined;
}

function getConnectorMetadataFromMemory(
  message: Memory,
): Record<string, unknown> | undefined {
  const memoryMetadata = getMemoryMetadata(message);
  const source = getMessageSource(message);
  if (!source) {
    return undefined;
  }

  const sourceMetadata = asRecord(memoryMetadata?.[source]);
  if (sourceMetadata) {
    return { [source]: sourceMetadata };
  }

  if (source === "discord") {
    const fromId = memoryMetadata?.fromId;
    if (typeof fromId !== "string" || fromId.trim().length === 0) {
      return undefined;
    }

    const entityName =
      typeof memoryMetadata?.entityName === "string"
        ? memoryMetadata.entityName
        : undefined;

    return {
      discord: {
        userId: fromId,
        id: fromId,
        ...(entityName ? { name: entityName, username: entityName } : {}),
      },
    };
  }

  return undefined;
}

async function getEntityMetadata(
  runtime: IAgentRuntime,
  entityId: string,
): Promise<Record<string, unknown> | undefined> {
  if (typeof runtime.getEntityById !== "function") {
    return undefined;
  }

  try {
    const entity = await runtime.getEntityById(entityId as UUID);
    return asRecord(entity?.metadata);
  } catch (error) {
    logger.warn(
      `[roles] Failed to look up entity ${entityId}: ${formatError(error)}`,
    );
    return undefined;
  }
}

export function getConfiguredOwnerEntityIds(runtime: IAgentRuntime): string[] {
  const configuredAdminEntityId = getRuntimeSettingString(
    runtime,
    CANONICAL_OWNER_SETTING_KEY,
  );
  const ownerContactsRaw = getRuntimeSettingString(
    runtime,
    OWNER_CONTACTS_SETTING_KEY,
  );
  const ownerContactEntityIds = parseOwnerContactEntityIds(ownerContactsRaw);
  const deduped = new Set<string>();

  if (configuredAdminEntityId) {
    deduped.add(configuredAdminEntityId);
  }

  for (const entityId of ownerContactEntityIds) {
    deduped.add(entityId);
  }

  return [...deduped];
}

export function hasConfiguredCanonicalOwner(runtime: IAgentRuntime): boolean {
  return getConfiguredOwnerEntityIds(runtime).length > 0;
}

export function resolveCanonicalOwnerId(
  runtime: IAgentRuntime,
  metadata?: RolesWorldMetadata,
): string | null {
  const configuredOwnerIds = getConfiguredOwnerEntityIds(runtime);
  if (configuredOwnerIds.length > 0) {
    return configuredOwnerIds[0] ?? null;
  }

  const worldOwnerId = metadata?.ownership?.ownerId;
  return typeof worldOwnerId === "string" && worldOwnerId.length > 0
    ? worldOwnerId
    : null;
}

function resolveOwnershipCandidateIds(
  runtime: IAgentRuntime,
  metadata?: RolesWorldMetadata,
): string[] {
  const configuredOwnerIds = getConfiguredOwnerEntityIds(runtime);
  if (configuredOwnerIds.length > 0) {
    return configuredOwnerIds;
  }

  const ownerId = resolveCanonicalOwnerId(runtime, metadata);
  return ownerId ? [ownerId] : [];
}

function connectorIdentityMatches(
  left: Record<string, unknown> | null | undefined,
  right: Record<string, unknown> | null | undefined,
): boolean {
  if (!left || !right) return false;

  for (const [connector, leftRaw] of Object.entries(left)) {
    const leftConnector = asRecord(leftRaw);
    const rightConnector = asRecord(right[connector]);
    if (!leftConnector || !rightConnector) {
      continue;
    }

    for (const field of CONNECTOR_STABLE_ID_FIELDS) {
      const leftValue = leftConnector[field];
      const rightValue = rightConnector[field];
      if (
        typeof leftValue === "string" &&
        leftValue.length > 0 &&
        leftValue === rightValue
      ) {
        return true;
      }
    }
  }

  return false;
}

async function hasConfirmedIdentityLink(
  runtime: IAgentRuntime,
  entityId: string,
  ownerId: string,
): Promise<boolean> {
  if (typeof runtime.getRelationships !== "function") {
    return false;
  }

  try {
    const relationships = await runtime.getRelationships({
      entityIds: [entityId as UUID],
      tags: ["identity_link"],
    });

    return relationships.some((relationship) => {
      const metadata = asRecord(relationship.metadata);
      if (metadata?.status !== "confirmed") {
        return false;
      }

      return (
        (relationship.sourceEntityId === entityId &&
          relationship.targetEntityId === ownerId) ||
        (relationship.sourceEntityId === ownerId &&
          relationship.targetEntityId === entityId)
      );
    });
  } catch (error) {
    logger.warn(
      `[roles] Failed to load identity links for ${entityId}: ${formatError(error)}`,
    );
    return false;
  }
}

async function resolveOwnershipRole(
  runtime: IAgentRuntime,
  metadata: RolesWorldMetadata | undefined,
  entityId: string,
  options?: ResolveEntityRoleOptions,
): Promise<RoleName | null> {
  const ownerIds = resolveOwnershipCandidateIds(runtime, metadata);
  if (ownerIds.length === 0) {
    return null;
  }

  const senderMetadata =
    options?.liveEntityMetadata ?? (await getEntityMetadata(runtime, entityId));

  for (const ownerId of ownerIds) {
    if (ownerId === entityId) {
      return "OWNER";
    }

    if (await hasConfirmedIdentityLink(runtime, entityId, ownerId)) {
      return "OWNER";
    }

    const ownerMetadata = await getEntityMetadata(runtime, ownerId);
    if (!ownerMetadata) {
      continue;
    }

    if (connectorIdentityMatches(senderMetadata, ownerMetadata)) {
      return "OWNER";
    }
  }

  return null;
}

function resolveWorldIdFromMessageMetadata(
  runtime: IAgentRuntime,
  message: Memory,
): UUID | null {
  const source = getMessageSource(message);
  const metadata = getMemoryMetadata(message);
  if (source === "discord") {
    const serverId =
      typeof metadata?.discordServerId === "string"
        ? metadata.discordServerId
        : typeof metadata?.discordChannelId === "string"
          ? metadata.discordChannelId
          : null;

    if (!serverId) {
      return null;
    }

    return createUniqueUuid(runtime, serverId) as UUID;
  }

  return null;
}

export function setConnectorAdminWhitelist(
  runtime: IAgentRuntime,
  whitelist: ConnectorAdminWhitelist | Record<string, unknown> | undefined,
): void {
  const runtimeWithConnectorAdmins = runtime as RuntimeWithConnectorAdmins;
  runtimeWithConnectorAdmins[CONNECTOR_ADMIN_WHITELIST_KEY] =
    normalizeConnectorAdminWhitelist(whitelist);
  runtimeWithConnectorAdmins[CONNECTOR_ADMIN_CACHE_KEY]?.clear();
}

export function getConnectorAdminWhitelist(
  runtime: IAgentRuntime,
): ConnectorAdminWhitelist {
  let whitelist = normalizeConnectorAdminWhitelist(
    (runtime as RuntimeWithConnectorAdmins)[CONNECTOR_ADMIN_WHITELIST_KEY],
  );

  const envDiscordAdmins = getRuntimeSettingString(
    runtime,
    "DISCORD_ADMIN_USER_IDS",
  );
  if (envDiscordAdmins) {
    whitelist = mergeConnectorAdminWhitelist(whitelist, {
      discord: envDiscordAdmins.split(","),
    });
  }

  return mergeConnectorAdminWhitelist(
    whitelist,
    readLocalConnectorAdminWhitelist(),
  );
}

function getConnectorAdminCache(runtime: IAgentRuntime): Set<string> {
  const runtimeWithConnectorAdmins = runtime as RuntimeWithConnectorAdmins;
  runtimeWithConnectorAdmins[CONNECTOR_ADMIN_CACHE_KEY] ??= new Set<string>();
  return runtimeWithConnectorAdmins[CONNECTOR_ADMIN_CACHE_KEY];
}

export function matchEntityToConnectorAdminWhitelist(
  entityMetadata: Record<string, unknown> | null | undefined,
  whitelist: ConnectorAdminWhitelist | Record<string, unknown> | undefined,
): { connector: string; matchedValue: string } | null {
  if (!entityMetadata || typeof entityMetadata !== "object") return null;

  const normalizedWhitelist = normalizeConnectorAdminWhitelist(whitelist);
  for (const [connector, platformIds] of Object.entries(normalizedWhitelist)) {
    const connectorMeta = asRecord(entityMetadata[connector]);
    if (!connectorMeta) {
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

function matchEntityIdToConnectorAdminWhitelist(
  runtime: IAgentRuntime,
  entityId: string,
  whitelist: ConnectorAdminWhitelist | Record<string, unknown> | undefined,
): { connector: string; matchedValue: string } | null {
  const normalizedWhitelist = normalizeConnectorAdminWhitelist(whitelist);
  for (const [connector, platformIds] of Object.entries(normalizedWhitelist)) {
    for (const platformId of platformIds) {
      if (createUniqueUuid(runtime, platformId) === entityId) {
        return { connector, matchedValue: platformId };
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

export function getLiveEntityMetadataFromMessage(
  message: Memory,
): Record<string, unknown> | undefined {
  const messageMetadata = asRecord(message.content.metadata);
  const bridgeSender = asRecord(messageMetadata?.bridgeSender);
  const bridgedMetadata = asRecord(bridgeSender?.metadata);
  if (bridgedMetadata) {
    return bridgedMetadata;
  }

  return getConnectorMetadataFromMemory(message);
}

/**
 * Resolve an entity's effective role, including connector-admin whitelist
 * matches for users that first appear after plugin bootstrap.
 */
export async function resolveEntityRole(
  runtime: IAgentRuntime,
  _world: Awaited<ReturnType<IAgentRuntime["getWorld"]>>,
  metadata: RolesWorldMetadata | undefined,
  entityId: string,
  options?: ResolveEntityRoleOptions,
): Promise<RoleName> {
  const explicitRole = getEntityRole(metadata, entityId);
  const ownershipRole = await resolveOwnershipRole(
    runtime,
    metadata,
    entityId,
    options,
  );

  if (ownershipRole === "OWNER") {
    return "OWNER";
  }

  if (explicitRole !== "GUEST") {
    if (explicitRole !== "OWNER") {
      return explicitRole;
    }

    return hasConfiguredCanonicalOwner(runtime) ? "GUEST" : "OWNER";
  }

  const whitelist = getConnectorAdminWhitelist(runtime);
  if (Object.keys(whitelist).length === 0) {
    return explicitRole;
  }

  const connectorAdminCache = getConnectorAdminCache(runtime);
  const entityIdMatched = matchEntityIdToConnectorAdminWhitelist(
    runtime,
    entityId,
    whitelist,
  );
  if (entityIdMatched) {
    connectorAdminCache.add(entityId);
    return "ADMIN";
  }

  const liveMatched = matchEntityToConnectorAdminWhitelist(
    options?.liveEntityMetadata ?? undefined,
    whitelist,
  );
  if (liveMatched) {
    connectorAdminCache.add(entityId);
    return "ADMIN";
  }

  if (connectorAdminCache.has(entityId)) {
    return "ADMIN";
  }

  const entityMetadata = await getEntityMetadata(runtime, entityId);
  const matched = matchEntityToConnectorAdminWhitelist(
    entityMetadata,
    whitelist,
  );
  if (!matched) {
    return explicitRole;
  }

  connectorAdminCache.add(entityId);
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
  const worldId =
    room?.worldId ?? resolveWorldIdFromMessageMetadata(runtime, message);
  if (!worldId) return null;
  const world = await runtime.getWorld(worldId);
  if (!world) return null;
  const metadata = (world.metadata ?? {}) as RolesWorldMetadata;
  return { world, metadata };
}

export async function resolveCanonicalOwnerIdForMessage(
  runtime: IAgentRuntime,
  message: Memory,
): Promise<string | null> {
  const configuredOwnerId = resolveCanonicalOwnerId(runtime);
  if (configuredOwnerId) {
    return configuredOwnerId;
  }

  const resolved = await resolveWorldForMessage(runtime, message);
  return resolveCanonicalOwnerId(runtime, resolved?.metadata);
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
  const entityId = message.entityId as UUID;
  const whitelist = getConnectorAdminWhitelist(runtime);
  if (
    Object.keys(whitelist).length > 0 &&
    matchEntityIdToConnectorAdminWhitelist(runtime, entityId, whitelist)
  ) {
    return {
      entityId,
      role: "ADMIN",
      isOwner: false,
      isAdmin: true,
      canManageRoles: true,
    };
  }

  const resolved = await resolveWorldForMessage(runtime, message);
  if (!resolved) return null;
  const { world, metadata } = resolved;
  const role = await resolveEntityRole(runtime, world, metadata, entityId, {
    liveEntityMetadata: getLiveEntityMetadataFromMessage(message),
  });
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
  await runtime.updateWorld(
    world as Parameters<IAgentRuntime["updateWorld"]>[0],
  );
  return { ...metadata.roles };
}
