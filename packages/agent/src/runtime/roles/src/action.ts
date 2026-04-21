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
import type { RoleName } from "./types";
import {
  canModifyRole,
  getLiveEntityMetadataFromMessage,
  normalizeRole,
  resolveCanonicalOwnerId,
  resolveEntityRole,
  resolveWorldForMessage,
  setEntityRole,
} from "./utils";

/** Maximum length for message text we'll attempt to parse. */
const MAX_COMMAND_LENGTH = 200;

/** Maximum length for a target username. */
const MAX_USERNAME_LENGTH = 64;

/** Role names accepted in commands. MEMBER/NONE map to GUEST for backwards compat. */
const ROLE_PATTERN = "OWNER|ADMIN|USER|GUEST|MEMBER|NONE";
const ROLE_ALIAS_PATTERN = "OWNER|ADMIN|USER|GUEST|MEMBER|NONE|MOD|MODERATOR";
const RECENT_ROOM_MESSAGE_LIMIT = 100;
const AMBIGUOUS_MATCH_SCORE_GAP = 10;
const MIN_CONFIDENT_MATCH_SCORE = 70;
const ROLE_CONTEXT_MESSAGE_COUNT = 6;

type ParsedRoleCommand =
  | {
      kind: "role";
      targetName: string;
      newRole: RoleName;
      label?: string;
      confidence: "direct" | "confirm";
    }
  | {
      kind: "revoke";
      targetName: string;
      label: string;
      confidence: "direct" | "confirm";
    };

/**
 * Natural language relationship labels → system role mapping.
 * "boss"-family → ADMIN, "coworker"-family → USER.
 */
const NATURAL_ROLE_MAP: Record<string, RoleName> = {
  boss: "ADMIN",
  manager: "ADMIN",
  supervisor: "ADMIN",
  superior: "ADMIN",
  lead: "ADMIN",

  coworker: "USER",
  "co-worker": "USER",
  teammate: "USER",
  colleague: "USER",
  peer: "USER",
  friend: "USER",
  partner: "USER",
};

/** Regex fragment matching any natural role label (longest-first for correct alternation). */
const NATURAL_ROLE_LABEL_RE = Object.keys(NATURAL_ROLE_MAP)
  .sort((a, b) => b.length - a.length)
  .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

function resolveNaturalRole(label: string): RoleName | null {
  const normalized = label.toLowerCase().trim();
  return NATURAL_ROLE_MAP[normalized] ?? null;
}

type RelationshipsContactLike = {
  entityId: UUID;
  categories?: string[];
  customFields?: Record<string, unknown>;
};

type RelationshipAnalyticsLike = {
  strength: number;
  interactionCount: number;
  sharedConversationWindows?: number;
  lastInteractionAt?: string;
};

type RelationshipsServiceLike = {
  searchContacts?: (criteria: {
    categories?: string[];
    tags?: string[];
    searchTerm?: string;
    privacyLevel?: string;
  }) => Promise<RelationshipsContactLike[]>;
  getContact?: (entityId: UUID) => Promise<RelationshipsContactLike | null>;
  analyzeRelationship?: (
    sourceEntityId: UUID,
    targetEntityId: UUID,
  ) => Promise<RelationshipAnalyticsLike | null>;
};

type CandidateRecord = {
  entityId: UUID;
  names: string[];
  aliases: string[];
  inCurrentRoom: boolean;
  spokeRecentlyInRoom: boolean;
  lastRoomActivityAt?: number;
  contact: RelationshipsContactLike | null;
  analytics: RelationshipAnalyticsLike | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeEntityLookupName(raw: string): string | null {
  const normalized = raw
    .trim()
    .replace(/^@+/, "")
    .replace(/[.!?,;:]+$/g, "")
    .trim();
  if (!normalized || normalized.length > MAX_USERNAME_LENGTH) {
    return null;
  }
  return normalized;
}

/**
 * Normalize a role string from user input to a valid assignable RoleName.
 * MEMBER and NONE are legacy aliases for GUEST.
 */
function normalizeInputRole(raw: string): RoleName {
  const upper = raw.toUpperCase();
  if (upper === "MEMBER" || upper === "NONE") return "GUEST";
  if (upper === "MOD" || upper === "MODERATOR") return "ADMIN";
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
 *  - `nubs is your boss`
 *
 * Returns null if the message doesn't look like a role command.
 */
function parseRoleCommand(
  text: string,
): ParsedRoleCommand | null {
  if (!text) return null;
  const trimmed = text.trim();

  // Reject oversized input before regex processing.
  if (trimmed.length > MAX_COMMAND_LENGTH) return null;

  // Pattern: /role @name ROLE  or  role @name ROLE
  const slashRe = new RegExp(
    `^\\/?\\s*role\\s+@?(.+?)\\s+(${ROLE_ALIAS_PATTERN})\\s*$`,
    "i",
  );
  const slashMatch = trimmed.match(slashRe);
  if (slashMatch) {
    const name = normalizeEntityLookupName(slashMatch[1]);
    if (!name) return null;
    return {
      kind: "role",
      targetName: name,
      newRole: normalizeInputRole(slashMatch[2]),
      confidence: "direct",
    };
  }

  // Pattern: make @name admin/owner/user/guest
  const makeRe = new RegExp(
    `^make\\s+@?(.+?)\\s+(?:an?\\s+)?(${ROLE_ALIAS_PATTERN})\\s*$`,
    "i",
  );
  const makeMatch = trimmed.match(makeRe);
  if (makeMatch) {
    const name = normalizeEntityLookupName(makeMatch[1]);
    if (!name) return null;
    return {
      kind: "role",
      targetName: name,
      newRole: normalizeInputRole(makeMatch[2]),
      confidence: "direct",
    };
  }

  // Pattern: set @name role ADMIN
  const setRe = new RegExp(
    `^set\\s+@?(.+?)\\s+(?:role\\s+)?(${ROLE_ALIAS_PATTERN})\\s*$`,
    "i",
  );
  const setMatch = trimmed.match(setRe);
  if (setMatch) {
    const name = normalizeEntityLookupName(setMatch[1]);
    if (!name) return null;
    return {
      kind: "role",
      targetName: name,
      newRole: normalizeInputRole(setMatch[2]),
      confidence: "direct",
    };
  }

  const directRequestRe = new RegExp(
    `^(?:(?:can|could|would|will)\\s+you\\s+(?:please\\s+)?|(?:please|pls|plz|yo|hey)\\s+)?(?:make|set|give|promote|bump)\\s+@?(.+?)\\s+(?:to\\s+)?(?:an?\\s+)?(${ROLE_ALIAS_PATTERN})[.!?]*$`,
    "i",
  );
  const directRequestMatch = trimmed.match(directRequestRe);
  if (directRequestMatch) {
    const name = normalizeEntityLookupName(directRequestMatch[1]);
    if (!name) return null;
    return {
      kind: "role",
      targetName: name,
      newRole: normalizeInputRole(directRequestMatch[2]),
      confidence: "direct",
    };
  }

  // --- Natural language negation (check BEFORE assignment to avoid false name capture) ---

  // Tentative negation: "I think/guess X is not/isn't your LABEL"
  {
    const re = new RegExp(
      `^i\\s+(?:think|guess|figure)\\s+@?(.+?)\\s+(?:is\\s+not|isn'?t|is\\s+no\\s+longer)\\s+(?:really\\s+)?(?:your|my|our|ur|a|an)\\s+(${NATURAL_ROLE_LABEL_RE})(?:\\s+any\\s*more)?[.!?]*$`,
      "i",
    );
    const match = trimmed.match(re);
    if (match) {
      const name = normalizeEntityLookupName(match[1]);
      if (name) {
        return {
          kind: "revoke",
          targetName: name,
          label: match[2].toLowerCase(),
          confidence: "confirm",
        };
      }
    }
  }

  // Direct negation: "X is not/isn't/no longer (your|my|a) LABEL (anymore)"
  {
    const re = new RegExp(
      `^@?(.+?)\\s+(?:is\\s+not|isn'?t|is\\s+no\\s+longer)\\s+(?:really\\s+)?(?:your|my|our|ur|a|an)\\s+(${NATURAL_ROLE_LABEL_RE})(?:\\s+any\\s*more)?[.!?]*$`,
      "i",
    );
    const match = trimmed.match(re);
    if (match) {
      const name = normalizeEntityLookupName(match[1]);
      if (name) {
        return {
          kind: "revoke",
          targetName: name,
          label: match[2].toLowerCase(),
          confidence: "direct",
        };
      }
    }
  }

  // Negation: "don't/do not treat/consider X (as/like) LABEL"
  {
    const re = new RegExp(
      `^(?:don'?t|do\\s+not)\\s+(?:treat|consider)\\s+@?(.+?)\\s+(?:(?:as|like)\\s+)?(?:your|my|our|ur|a|an)\\s+(${NATURAL_ROLE_LABEL_RE})[.!?]*$`,
      "i",
    );
    const match = trimmed.match(re);
    if (match) {
      const name = normalizeEntityLookupName(match[1]);
      if (name) {
        return {
          kind: "revoke",
          targetName: name,
          label: match[2].toLowerCase(),
          confidence: "direct",
        };
      }
    }
  }

  // Negation: "remove X as LABEL"
  {
    const re = new RegExp(
      `^remove\\s+@?(.+?)\\s+as\\s+(?:(?:your|my|our|ur|a|an)\\s+)?(${NATURAL_ROLE_LABEL_RE})[.!?]*$`,
      "i",
    );
    const match = trimmed.match(re);
    if (match) {
      const name = normalizeEntityLookupName(match[1]);
      if (name) {
        return {
          kind: "revoke",
          targetName: name,
          label: match[2].toLowerCase(),
          confidence: "direct",
        };
      }
    }
  }

  // --- Natural language assignment ---

  // Tentative assignment: "I think/guess X is (your|my|a) LABEL"
  {
    const re = new RegExp(
      `^i\\s+(?:think|guess|figure)\\s+@?(.+?)\\s+is\\s+(?:your|my|our|ur|a|an)\\s+(${NATURAL_ROLE_LABEL_RE})[.!?]*$`,
      "i",
    );
    const match = trimmed.match(re);
    if (match) {
      const name = normalizeEntityLookupName(match[1]);
      const role = resolveNaturalRole(match[2]);
      if (name && role) {
        return {
          kind: "role",
          targetName: name,
          newRole: role,
          label: match[2].toLowerCase(),
          confidence: "confirm",
        };
      }
    }
  }

  // Direct assignment: "X is (your|my|our|a|an) LABEL"
  {
    const re = new RegExp(
      `^@?(.+?)\\s+is\\s+(?:your|my|our|ur|a|an)\\s+(${NATURAL_ROLE_LABEL_RE})[.!?]*$`,
      "i",
    );
    const match = trimmed.match(re);
    if (match) {
      const name = normalizeEntityLookupName(match[1]);
      const role = resolveNaturalRole(match[2]);
      if (name && role) {
        return {
          kind: "role",
          targetName: name,
          newRole: role,
          label: match[2].toLowerCase(),
          confidence: "direct",
        };
      }
    }
  }

  // Inverted assignment: "my/your LABEL is X"
  {
    const re = new RegExp(
      `^(?:your|my|our|ur)\\s+(${NATURAL_ROLE_LABEL_RE})\\s+is\\s+@?(.+?)[.!?]*$`,
      "i",
    );
    const match = trimmed.match(re);
    if (match) {
      const name = normalizeEntityLookupName(match[2]);
      const role = resolveNaturalRole(match[1]);
      if (name && role) {
        return {
          kind: "role",
          targetName: name,
          newRole: role,
          label: match[1].toLowerCase(),
          confidence: "direct",
        };
      }
    }
  }

  // Assignment: "treat/consider X (as/like) (your|my|a) LABEL"
  {
    const re = new RegExp(
      `^(?:(?:please|pls|hey)\\s+)?(?:treat|consider)\\s+@?(.+?)\\s+(?:(?:as|like)\\s+)?(?:your|my|our|ur|a|an)\\s+(${NATURAL_ROLE_LABEL_RE})[.!?]*$`,
      "i",
    );
    const match = trimmed.match(re);
    if (match) {
      const name = normalizeEntityLookupName(match[1]);
      const role = resolveNaturalRole(match[2]);
      if (name && role) {
        return {
          kind: "role",
          targetName: name,
          newRole: role,
          label: match[2].toLowerCase(),
          confidence: "direct",
        };
      }
    }
  }

  // --- Soft/tentative explicit role name patterns ---

  const softAssignmentRe = new RegExp(
    `^(?:i\\s+(?:think|reckon|figure)\\s+)?@?(.+?)\\s+(?:should(?:\\s+(?:probably|prolly|probs))?\\s+be|needs\\s+to\\s+be|oughta?\\s+be|feels\\s+like\\s+they\\s+should\\s+be)\\s+(?:an?\\s+)?(${ROLE_ALIAS_PATTERN})[.!?]*$`,
    "i",
  );
  const softAssignmentMatch = trimmed.match(softAssignmentRe);
  if (softAssignmentMatch) {
    const name = normalizeEntityLookupName(softAssignmentMatch[1]);
    if (!name) return null;
    return {
      kind: "role",
      targetName: name,
      newRole: normalizeInputRole(softAssignmentMatch[2]),
      confidence: "confirm",
    };
  }

  const canGetRoleRe = new RegExp(
    `^can\\s+@?(.+?)\\s+get\\s+(?:an?\\s+)?(${ROLE_ALIAS_PATTERN})[.!?]*$`,
    "i",
  );
  const canGetRoleMatch = trimmed.match(canGetRoleRe);
  if (canGetRoleMatch) {
    const name = normalizeEntityLookupName(canGetRoleMatch[1]);
    if (!name) return null;
    return {
      kind: "role",
      targetName: name,
      newRole: normalizeInputRole(canGetRoleMatch[2]),
      confidence: "confirm",
    };
  }

  return null;
}

function isAffirmativeRoleReply(text: string): boolean {
  return /^(?:yes|yeah|yep|sure|ok(?:ay)?|do it|go ahead|please do|pls do|sounds good|that'?s right|correct|make it so)[.!?]*$/i.test(
    text.trim(),
  );
}

function isNegativeRoleReply(text: string): boolean {
  return /^(?:no|nah|nope|not yet|don'?t|do not|leave it|hold off|never mind|nvm|cancel that)[.!?]*$/i.test(
    text.trim(),
  );
}

async function getRecentConversationMessages(
  runtime: IAgentRuntime,
  roomId: UUID,
): Promise<Memory[]> {
  if (typeof runtime.getMemories === "function") {
    try {
      return await runtime.getMemories({
        tableName: "messages",
        roomId,
        count: ROLE_CONTEXT_MESSAGE_COUNT,
      });
    } catch {
      // Fall back below.
    }
  }

  if (typeof runtime.getMemoriesByRoomIds === "function") {
    try {
      return await runtime.getMemoriesByRoomIds({
        tableName: "messages",
        roomIds: [roomId],
        limit: ROLE_CONTEXT_MESSAGE_COUNT,
      });
    } catch {
      return [];
    }
  }

  return [];
}

async function findPendingRoleIntent(
  runtime: IAgentRuntime,
  message: Memory,
): Promise<ParsedRoleCommand | null> {
  const recentMessages = await getRecentConversationMessages(runtime, message.roomId);
  const sameUserMessages = recentMessages
    .filter((memory) => memory?.entityId === message.entityId)
    .reverse();

  for (const memory of sameUserMessages) {
    const text = typeof memory.content?.text === "string" ? memory.content.text : "";
    const parsed = parseRoleCommand(text);
    if (parsed?.confidence === "confirm") {
      return parsed;
    }
  }

  return null;
}

function buildRoleConfirmationPrompt(intent: ParsedRoleCommand): string {
  if (intent.kind === "revoke") {
    return `Do you want me to remove ${intent.targetName} as your ${intent.label}? Reply yes to confirm.`;
  }

  if (intent.label) {
    return `Do you want me to set ${intent.targetName} as your ${intent.label} (${intent.newRole})? Reply yes to confirm.`;
  }

  return `Do you want me to update ${intent.targetName} to **${intent.newRole}**? Reply yes to confirm.`;
}

function extractCustomFieldStrings(
  customFields: Record<string, unknown> | undefined,
  keys: string[],
): string[] {
  if (!customFields) {
    return [];
  }

  const values = new Set<string>();
  for (const key of keys) {
    const rawValue = customFields[key];
    if (typeof rawValue === "string" && rawValue.trim().length > 0) {
      values.add(rawValue.trim());
      continue;
    }
    if (Array.isArray(rawValue)) {
      for (const entry of rawValue) {
        if (typeof entry === "string" && entry.trim().length > 0) {
          values.add(entry.trim());
        }
      }
    }
  }

  return [...values];
}

function getRelationshipsService(
  runtime: IAgentRuntime,
): RelationshipsServiceLike | null {
  if (typeof runtime.getService !== "function") {
    return null;
  }

  return runtime.getService("relationships") as RelationshipsServiceLike | null;
}

function collectCandidateNames(args: {
  names?: string[];
  metadata?: Record<string, unknown>;
  contact?: RelationshipsContactLike | null;
}): { names: string[]; aliases: string[] } {
  const names = new Set<string>();
  const aliases = new Set<string>();

  for (const name of args.names ?? []) {
    if (typeof name === "string" && name.trim().length > 0) {
      names.add(name.trim());
    }
  }

  const metadata = asRecord(args.metadata);
  if (metadata) {
    for (const source of Object.values(metadata)) {
      const sourceRecord = asRecord(source);
      if (!sourceRecord) {
        continue;
      }
      for (const key of [
        "username",
        "userName",
        "name",
        "displayName",
        "handle",
        "screenName",
      ]) {
        const value = asString(sourceRecord[key]);
        if (value) {
          aliases.add(value);
        }
      }
    }
  }

  const contactFields = args.contact?.customFields as
    | Record<string, unknown>
    | undefined;
  for (const value of extractCustomFieldStrings(contactFields, [
    "displayName",
    "preferredName",
    "nickname",
    "nicknames",
    "alias",
    "aliases",
    "username",
    "usernames",
    "handle",
    "handles",
  ])) {
    aliases.add(value);
  }

  return {
    names: [...names],
    aliases: [...aliases],
  };
}

function normalizeComparisonValue(value: string): string {
  return value.trim().replace(/^@+/, "").replace(/\s+/g, " ").toLowerCase();
}

function scoreCandidateNameMatch(
  targetName: string,
  candidate: CandidateRecord,
): { nameScore: number; matchedValue: string | null } {
  const target = normalizeComparisonValue(targetName);
  const values = [...candidate.names, ...candidate.aliases];
  let bestScore = 0;
  let matchedValue: string | null = null;

  for (const rawValue of values) {
    const value = normalizeComparisonValue(rawValue);
    if (!value) {
      continue;
    }

    let score = 0;
    if (value === target) {
      score = 100;
    } else if (value.split(/\s+/).includes(target)) {
      score = 88;
    } else if (value.startsWith(target) || target.startsWith(value)) {
      score = 80;
    } else if (value.includes(target) || target.includes(value)) {
      score = 68;
    }

    if (score > bestScore) {
      bestScore = score;
      matchedValue = rawValue;
    }
  }

  return { nameScore: bestScore, matchedValue };
}

async function getRecentRoomActivity(
  runtime: IAgentRuntime,
  roomId: UUID,
): Promise<Map<UUID, number>> {
  const activity = new Map<UUID, number>();
  if (typeof runtime.getMemoriesByRoomIds !== "function") {
    return activity;
  }

  try {
    const memories = await runtime.getMemoriesByRoomIds({
      tableName: "messages",
      roomIds: [roomId],
      limit: RECENT_ROOM_MESSAGE_LIMIT,
    });
    for (const memory of memories) {
      if (!memory?.entityId || typeof memory.createdAt !== "number") {
        continue;
      }
      const previous = activity.get(memory.entityId as UUID) ?? 0;
      if (memory.createdAt > previous) {
        activity.set(memory.entityId as UUID, memory.createdAt);
      }
    }
  } catch (error) {
    logger.warn(`[roles] Failed to read recent room activity: ${error}`);
  }

  return activity;
}

async function resolveRoleTargetEntity(args: {
  runtime: IAgentRuntime;
  roomId: UUID;
  requesterEntityId: UUID;
  targetName: string;
}): Promise<{
  entityId: UUID | null;
  error?: string;
}> {
  const { runtime, roomId, requesterEntityId, targetName } = args;
  const candidateMap = new Map<UUID, CandidateRecord>();
  const relationships = getRelationshipsService(runtime);
  const recentRoomActivity = await getRecentRoomActivity(runtime, roomId);

  const upsertCandidate = async (
    entityId: UUID,
    options?: {
      names?: string[];
      metadata?: Record<string, unknown>;
      inCurrentRoom?: boolean;
      contact?: RelationshipsContactLike | null;
    },
  ) => {
    let candidate = candidateMap.get(entityId);
    if (!candidate) {
      let entity: {
        names?: string[];
        metadata?: Record<string, unknown>;
      } | null =
        options?.names && options?.metadata
          ? { names: options.names, metadata: options.metadata }
          : null;
      if (!entity && typeof runtime.getEntityById === "function") {
        entity = await runtime.getEntityById(entityId);
      }
      const contact =
        options?.contact ??
        (relationships && typeof relationships.getContact === "function"
          ? await relationships.getContact(entityId)
          : null);
      const identifiers = collectCandidateNames({
        names: entity?.names,
        metadata: entity?.metadata as Record<string, unknown> | undefined,
        contact,
      });
      candidate = {
        entityId,
        names: identifiers.names,
        aliases: identifiers.aliases,
        inCurrentRoom: Boolean(options?.inCurrentRoom),
        spokeRecentlyInRoom: recentRoomActivity.has(entityId),
        lastRoomActivityAt: recentRoomActivity.get(entityId),
        contact,
        analytics: null,
      };
      candidateMap.set(entityId, candidate);
      return;
    }

    if (options?.inCurrentRoom) {
      candidate.inCurrentRoom = true;
    }
    if (!candidate.contact && options?.contact) {
      candidate.contact = options.contact;
    }
  };

  try {
    const roomEntities = await runtime.getEntitiesForRoom(roomId);
    for (const entity of roomEntities) {
      if (!entity?.id) continue;
      await upsertCandidate(entity.id as UUID, {
        names: entity.names as string[] | undefined,
        metadata: entity.metadata as Record<string, unknown> | undefined,
        inCurrentRoom: true,
      });
    }
  } catch (error) {
    logger.warn(`[roles] Failed to load room entities: ${error}`);
  }

  for (const entityId of recentRoomActivity.keys()) {
    await upsertCandidate(entityId, { inCurrentRoom: false });
  }

  if (relationships && typeof relationships.searchContacts === "function") {
    try {
      const contacts = await relationships.searchContacts({
        searchTerm: targetName,
      });
      for (const contact of contacts) {
        if (!contact?.entityId) continue;
        await upsertCandidate(contact.entityId, {
          contact,
        });
      }
    } catch (error) {
      logger.warn(`[roles] Failed to search rolodex contacts: ${error}`);
    }
  }

  const scoredCandidates = await Promise.all(
    [...candidateMap.values()].map(async (candidate) => {
      if (
        relationships &&
        typeof relationships.analyzeRelationship === "function" &&
        candidate.entityId !== requesterEntityId
      ) {
        try {
          candidate.analytics = await relationships.analyzeRelationship(
            requesterEntityId,
            candidate.entityId,
          );
        } catch (error) {
          logger.warn(
            `[roles] Failed to analyze relationship for candidate ${candidate.entityId}: ${error}`,
          );
        }
      }

      const { nameScore } = scoreCandidateNameMatch(targetName, candidate);
      if (nameScore === 0) {
        return null;
      }

      let score = nameScore;
      if (candidate.inCurrentRoom) {
        score += 14;
      }
      if (candidate.spokeRecentlyInRoom) {
        score += 12;
      }
      if (candidate.contact) {
        score += 6;
      }
      if (candidate.analytics) {
        score += Math.round(candidate.analytics.strength / 5);
        score += Math.min(
          (candidate.analytics.sharedConversationWindows ?? 0) * 8,
          24,
        );
        const lastInteractionAt = candidate.analytics.lastInteractionAt;
        if (lastInteractionAt) {
          const ageMs = Date.now() - new Date(lastInteractionAt).getTime();
          if (ageMs <= 1000 * 60 * 60 * 24) {
            score += 12;
          } else if (ageMs <= 1000 * 60 * 60 * 24 * 7) {
            score += 8;
          } else if (ageMs <= 1000 * 60 * 60 * 24 * 30) {
            score += 4;
          }
        }
      }

      return { candidate, score, nameScore };
    }),
  );

  const ranked = scoredCandidates
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) => right.score - left.score);

  if (ranked.length === 0) {
    return {
      entityId: null,
      error: `Could not find user "${targetName}" in this room or rolodex.`,
    };
  }

  const best = ranked[0];
  const second = ranked[1];
  if (
    best.score < MIN_CONFIDENT_MATCH_SCORE ||
    (second && best.score - second.score < AMBIGUOUS_MATCH_SCORE_GAP)
  ) {
    return {
      entityId: null,
      error: `I found multiple possible matches for "${targetName}". Please use a more specific name or handle.`,
    };
  }

  return { entityId: best.candidate.entityId };
}

export const updateRoleAction: Action = {
  name: "UPDATE_ROLE",
  similes: [
    "CHANGE_ROLE",
    "SET_ROLE",
    "ASSIGN_ROLE",
    "MAKE_ADMIN",
    "MAKE_OWNER",
    "SET_BOSS",
    "SET_COWORKER",
    "REVOKE_ROLE",
  ],
  description:
    "Assign or revoke a role using commands (/role @name ADMIN) or natural language " +
    '("alice is your boss", "bob is not your coworker"). Only OWNERs and ADMINs can manage roles.',

  validate: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
  ): Promise<boolean> => {
    const text =
      typeof message?.content?.text === "string" ? message.content.text : "";
    // Only trigger on explicit role commands
    return parseRoleCommand(text) !== null;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback,
  ) => {
    const text =
      typeof message?.content?.text === "string" ? message.content.text : "";

    const parsed = parseRoleCommand(text);
    if (!parsed) {
      await callback?.({
        text: "Could not parse role command. Usage: `/role @username ADMIN`",
      });
      return { success: false };
    }

    const targetName = parsed.targetName;

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
    const requesterRole = await resolveEntityRole(
      runtime,
      world,
      metadata,
      message.entityId,
      {
        liveEntityMetadata: getLiveEntityMetadataFromMessage(message),
      },
    );
    if (requesterRole !== "OWNER" && requesterRole !== "ADMIN") {
      await callback?.({
        text: "You don't have permission to manage roles. Only OWNERs and ADMINs can assign roles.",
      });
      return { success: false };
    }

    // Find target entity
    const targetResolution = await resolveRoleTargetEntity({
      runtime,
      roomId: message.roomId,
      requesterEntityId: message.entityId,
      targetName,
    });
    const targetEntityId = targetResolution.entityId;
    if (!targetEntityId) {
      await callback?.({
        text:
          targetResolution.error ??
          `Could not find user "${targetName}" in this room.`,
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

    const targetCurrentRole = await resolveEntityRole(
      runtime,
      world,
      metadata,
      targetEntityId,
    );

    // Determine the new role: revoke → GUEST, otherwise use the parsed role.
    const newRole: RoleName =
      parsed.kind === "revoke" ? "GUEST" : parsed.newRole;

    // Permission check
    if (newRole === "OWNER") {
      const canonicalOwnerId = resolveCanonicalOwnerId(runtime, metadata);
      if (!canonicalOwnerId || targetEntityId !== canonicalOwnerId) {
        await callback?.({
          text: "OWNER is reserved for the canonical agent owner. Use ADMIN for additional elevated users.",
        });
        return { success: false };
      }
    }

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
        text:
          `Cannot change ${targetName}'s role from ${targetCurrentRole} to ${newRole}. ` +
          `Your role (${requesterRole}) doesn't have sufficient permissions.`,
      });
      return { success: false };
    }

    // Apply the role change via the shared helper so roleSources stays in sync.
    await setEntityRole(runtime, message, targetEntityId, newRole);

    logger.info(
      `[roles] ${message.entityId} set ${targetEntityId} (${targetName}) to ${newRole}`,
    );

    // Build response message using natural language when a label is present.
    let responseText: string;
    if (parsed.kind === "revoke") {
      responseText = `${targetName} is no longer your ${parsed.label}.`;
    } else if (parsed.label) {
      responseText = `${targetName} is now your ${parsed.label}.`;
    } else {
      responseText = `Updated ${targetName}'s role to **${newRole}**.`;
    }

    await callback?.({ text: responseText });

    return {
      success: true,
      data: {
        targetEntityId,
        targetName,
        previousRole: targetCurrentRole,
        newRole,
        assignedBy: message.entityId,
        ...(parsed.kind === "revoke"
          ? { revoked: true, revokedLabel: parsed.label }
          : {}),
        ...(parsed.label ? { label: parsed.label } : {}),
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
        content: { text: "bob is your coworker" },
      },
      {
        name: "{{agentName}}",
        content: { text: "bob is now your coworker." },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: { text: "charlie is not your boss" },
      },
      {
        name: "{{agentName}}",
        content: { text: "charlie is no longer your boss." },
      },
    ],
  ] as ActionExample[][],
};
