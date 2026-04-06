/**
 * ActivityProfileService — orchestrates data fetching, analysis, and
 * persistence for the user activity profile. Uses task metadata for storage.
 */

import type { IAgentRuntime, UUID } from "@elizaos/core";
import type { LifeOpsActivitySignal } from "@miladyai/shared/contracts/lifeops";
import { LifeOpsService } from "../lifeops/service.js";
import { resolveDefaultTimeZone } from "../lifeops/defaults.js";
import {
  analyzeMessages,
  enrichWithCalendar,
  resolveCurrentActivityState,
  SUSTAINED_INACTIVITY_GAP_MS,
  type CalendarEventRecord,
  type MessageRecord,
} from "./analyzer.js";
import {
  LifeOpsScreenContextSampler,
  type LifeOpsScreenContextSummary,
} from "../lifeops/screen-context.js";
import type {
  ActivityProfile,
  ActivitySignalRecord,
  FiredActionsLog,
} from "./types.js";

// ── Constants ─────────────────────────────────────────

const PROFILE_MAX_AGE_MS = 60 * 60 * 1000; // 60 min full rebuild threshold
const MESSAGES_WINDOW_DAYS = 7;
const MESSAGES_LIMIT = 500;
const MAX_ROOMS = 50;
const ACTIVITY_SIGNALS_WINDOW_LIMIT = 500;
const CURRENT_ACTIVITY_SIGNAL_LIMIT = 32;

let screenContextSampler: LifeOpsScreenContextSampler | null = null;

// ── Owner resolution ──────────────────────────────────

type WorldMetadataShape = {
  ownership?: { ownerId?: string };
};

export async function resolveOwnerEntityId(
  runtime: IAgentRuntime,
): Promise<string | null> {
  // Find owner via the agent's rooms → world → ownership metadata
  try {
    const roomIds = await runtime.getRoomsForParticipant(runtime.agentId);
    for (const roomId of roomIds.slice(0, 10)) {
      try {
        const room = await runtime.getRoom(roomId);
        if (!room?.worldId) continue;
        const world = await runtime.getWorld(room.worldId);
        const metadata = (world?.metadata ?? {}) as WorldMetadataShape;
        if (metadata.ownership?.ownerId) {
          return metadata.ownership.ownerId;
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Fall through
  }
  return null;
}

export function setScreenContextSamplerForTesting(
  sampler: LifeOpsScreenContextSampler | null,
): void {
  screenContextSampler = sampler;
}

function getScreenContextSampler(): LifeOpsScreenContextSampler {
  if (!screenContextSampler) {
    screenContextSampler = new LifeOpsScreenContextSampler();
  }
  return screenContextSampler;
}

async function sampleScreenContext(
  currentTime: Date,
): Promise<LifeOpsScreenContextSummary> {
  return await getScreenContextSampler().sample(currentTime.getTime());
}

function mapActivitySignalRecord(
  signal: LifeOpsActivitySignal,
): ActivitySignalRecord {
  return {
    source: signal.source,
    platform: signal.platform,
    state: signal.state,
    observedAt: Date.parse(signal.observedAt),
    idleState: signal.idleState,
    idleTimeSeconds: signal.idleTimeSeconds,
    onBattery: signal.onBattery,
    health: signal.health,
    metadata: signal.metadata,
  };
}

async function loadWindowActivitySignals(
  runtime: IAgentRuntime,
  currentTime: Date,
): Promise<ActivitySignalRecord[]> {
  const lifeOpsService = new LifeOpsService(runtime);
  const sinceAt = new Date(
    currentTime.getTime() - MESSAGES_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const signals = await lifeOpsService.listActivitySignals({
    sinceAt,
    limit: ACTIVITY_SIGNALS_WINDOW_LIMIT,
  });
  return signals
    .map(mapActivitySignalRecord)
    .filter((signal) => Number.isFinite(signal.observedAt));
}

async function loadRecentActivitySignals(
  runtime: IAgentRuntime,
): Promise<ActivitySignalRecord[]> {
  const lifeOpsService = new LifeOpsService(runtime);
  const signals = await lifeOpsService.listActivitySignals({
    limit: CURRENT_ACTIVITY_SIGNAL_LIMIT,
  });
  return signals
    .map(mapActivitySignalRecord)
    .filter((signal) => Number.isFinite(signal.observedAt));
}

function mergeScreenContext(
  profile: ActivityProfile,
  screenContext: LifeOpsScreenContextSummary | null,
  now: Date,
): ActivityProfile {
  const updatedProfile: ActivityProfile = {
    ...profile,
    screenContextFocus: screenContext?.focus ?? null,
    screenContextSource: screenContext?.source ?? null,
    screenContextSampledAt: screenContext?.sampledAtMs ?? null,
    screenContextConfidence: screenContext?.confidence ?? null,
    screenContextBusy: screenContext?.busy ?? false,
    screenContextAvailable: screenContext?.available ?? false,
    screenContextStale: screenContext?.stale ?? false,
  };
  const activityState = resolveCurrentActivityState(
    updatedProfile,
    now,
  );
  return {
    ...updatedProfile,
    ...activityState,
    effectiveDayKey: activityState.effectiveDayKey,
  };
}

// ── Profile building ──────────────────────────────────

export async function buildActivityProfile(
  runtime: IAgentRuntime,
  ownerEntityId: string,
  timezone?: string,
  now?: Date,
): Promise<ActivityProfile> {
  const tz = timezone ?? resolveDefaultTimeZone();
  const currentTime = now ?? new Date();
  const activitySignals = await loadWindowActivitySignals(runtime, currentTime);

  // 1. Get all rooms the owner participates in
  const roomIds = await runtime.getRoomsForParticipant(ownerEntityId as UUID);
  const limitedRoomIds = roomIds.slice(0, MAX_ROOMS);

  // 2. Build room → source map
  const roomSourceMap = new Map<string, string>();
  await Promise.all(
    limitedRoomIds.map(async (roomId) => {
      try {
        const room = await runtime.getRoom(roomId);
        if (room?.source) {
          roomSourceMap.set(roomId, room.source);
        }
      } catch {
        // Skip rooms we can't read
      }
    }),
  );

  // 3. Fetch messages
  const messages: MessageRecord[] = [];
  if (limitedRoomIds.length > 0) {
    const memories = await runtime.getMemoriesByRoomIds({
      tableName: "messages",
      roomIds: limitedRoomIds,
      limit: MESSAGES_LIMIT,
    });
    for (const mem of memories) {
      messages.push({
        entityId: mem.entityId,
        roomId: mem.roomId,
        createdAt: mem.createdAt ?? 0,
      });
    }
  }

  // 4. Analyze messages
  const baseProfile = analyzeMessages(
    messages,
    roomSourceMap,
    ownerEntityId,
    tz,
    MESSAGES_WINDOW_DAYS,
    activitySignals,
    currentTime,
  );

  // 5. Enrich with calendar if available
  let calendarEvents: CalendarEventRecord[] = [];
  try {
    const lifeOpsService = new LifeOpsService(runtime);
    const feed = await lifeOpsService.getCalendarFeed(
      new URL("http://localhost/api/lifeops/calendar"),
      {},
      currentTime,
    );
    calendarEvents = feed.events.map((e) => ({
      startAt: e.startAt,
      endAt: e.endAt,
      isAllDay: e.isAllDay,
    }));
  } catch {
    // Calendar not connected — that's fine
  }

  const withCalendar = enrichWithCalendar(baseProfile, calendarEvents, tz);
  const screenContext = await sampleScreenContext(currentTime);
  return mergeScreenContext(withCalendar, screenContext, currentTime);
}

// ── Lightweight current-state refresh ─────────────────

export async function refreshCurrentState(
  runtime: IAgentRuntime,
  ownerEntityId: string,
  profile: ActivityProfile,
  now?: Date,
): Promise<ActivityProfile> {
  const currentTime = now ?? new Date();
  const roomIds = await runtime.getRoomsForParticipant(ownerEntityId as UUID);
  const limitedRoomIds = roomIds.slice(0, MAX_ROOMS);
  const screenContext = await sampleScreenContext(currentTime);
  const activitySignals = await loadRecentActivitySignals(runtime);

  const roomSourceMap = new Map<string, string>();
  if (limitedRoomIds.length > 0) {
    await Promise.all(
      limitedRoomIds.map(async (roomId) => {
        try {
          const room = await runtime.getRoom(roomId);
          if (room?.source) {
            roomSourceMap.set(roomId, room.source);
          }
        } catch {
          // Skip rooms we cannot inspect during refresh.
        }
      }),
    );
  }

  let lastSeenAt = profile.lastSeenAt;
  let lastSeenPlatform = profile.lastSeenPlatform;
  if (limitedRoomIds.length > 0) {
    const memories = await runtime.getMemoriesByRoomIds({
      tableName: "messages",
      roomIds: limitedRoomIds,
      limit: 10,
    });

    for (const memory of memories) {
      const createdAt = memory.createdAt ?? 0;
      if (createdAt > currentTime.getTime()) {
        continue;
      }

      const source = roomSourceMap.get(memory.roomId) ?? "unknown";
      const isOwnerMessage = memory.entityId === ownerEntityId;
      const isClientChatSignal = source === "client_chat";
      if (!isOwnerMessage && !isClientChatSignal) {
        continue;
      }

      if (createdAt >= lastSeenAt) {
        lastSeenAt = createdAt;
        lastSeenPlatform = isClientChatSignal ? "client_chat" : source;
      }
    }
  }

  for (const signal of activitySignals) {
    if (signal.state !== "active" || signal.observedAt > currentTime.getTime()) {
      continue;
    }
    if (signal.observedAt >= lastSeenAt) {
      lastSeenAt = signal.observedAt;
      lastSeenPlatform = signal.platform;
    }
  }

  return mergeScreenContext(
    {
      ...profile,
      lastSeenAt,
      lastSeenPlatform,
      sustainedInactivityThresholdMinutes:
        profile.sustainedInactivityThresholdMinutes ||
        SUSTAINED_INACTIVITY_GAP_MS / 60_000,
    },
    screenContext,
    currentTime,
  );
}

// ── Metadata persistence helpers ──────────────────────

export interface ProactiveTaskMetadata {
  activityProfile?: ActivityProfile;
  firedActionsLog?: FiredActionsLog;
  proactiveAgent: {
    kind: "runtime_runner";
    version: number;
  };
  updateInterval: number;
  baseInterval: number;
}

export function readProfileFromMetadata(
  metadata: Record<string, unknown> | null,
): ActivityProfile | null {
  if (!metadata?.activityProfile) return null;
  return metadata.activityProfile as ActivityProfile;
}

export function readFiredLogFromMetadata(
  metadata: Record<string, unknown> | null,
  todayDateStr: string,
): FiredActionsLog | null {
  const log = metadata?.firedActionsLog as FiredActionsLog | undefined;
  if (!log || log.date !== todayDateStr) return null;
  return log;
}

export function profileNeedsRebuild(
  profile: ActivityProfile | null,
  now: Date,
): boolean {
  if (!profile) return true;
  return now.getTime() - profile.analyzedAt > PROFILE_MAX_AGE_MS;
}
