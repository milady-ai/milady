import type { StreamEventEnvelope } from "./api-client";

export type AutonomyRunHealthStatus =
  | "ok"
  | "gap_detected"
  | "recovered"
  | "partial";

export interface AutonomyRunHealth {
  runId: string;
  status: AutonomyRunHealthStatus;
  lastSeq: number | null;
  missingSeqs: number[];
  gapCount: number;
  lastGapAt?: number;
  recoveredAt?: number;
  partialAt?: number;
}

export type AutonomyRunHealthMap = Record<string, AutonomyRunHealth>;

export interface MergeAutonomyEventsOptions {
  existingEvents: StreamEventEnvelope[];
  incomingEvents: StreamEventEnvelope[];
  runHealthByRunId: AutonomyRunHealthMap;
  maxEvents?: number;
  replay?: boolean;
}

export interface MergeAutonomyEventsResult {
  events: StreamEventEnvelope[];
  latestEventId: string | null;
  runHealthByRunId: AutonomyRunHealthMap;
  insertedCount: number;
  duplicateCount: number;
  runsWithNewGaps: string[];
  runsRecovered: string[];
  hasUnresolvedGaps: boolean;
}

const DEFAULT_MAX_EVENTS = 1200;

function cloneRunHealthMap(
  runHealthByRunId: AutonomyRunHealthMap,
): AutonomyRunHealthMap {
  return Object.fromEntries(
    Object.entries(runHealthByRunId).map(([runId, health]) => [
      runId,
      {
        ...health,
        missingSeqs: [...health.missingSeqs],
      },
    ]),
  );
}

function fallbackDedupKey(event: StreamEventEnvelope): string | null {
  if (typeof event.runId !== "string" || event.runId.length === 0) return null;
  if (typeof event.stream !== "string" || event.stream.length === 0)
    return null;
  if (typeof event.seq !== "number" || !Number.isFinite(event.seq)) return null;
  return `${event.runId}:${event.seq}:${event.stream}`;
}

function ensureRunHealth(
  runHealthByRunId: AutonomyRunHealthMap,
  runId: string,
): AutonomyRunHealth {
  let health = runHealthByRunId[runId];
  if (!health) {
    health = {
      runId,
      status: "ok",
      lastSeq: null,
      missingSeqs: [],
      gapCount: 0,
    };
    runHealthByRunId[runId] = health;
  }
  return health;
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function hydrateRunHealthFromExistingEvents(
  runHealthByRunId: AutonomyRunHealthMap,
  existingEvents: StreamEventEnvelope[],
): void {
  const seqsByRunId = new Map<string, number[]>();
  for (const event of existingEvents) {
    if (
      typeof event.runId !== "string" ||
      event.runId.length === 0 ||
      typeof event.seq !== "number" ||
      !Number.isFinite(event.seq)
    ) {
      continue;
    }

    const runId = event.runId;
    const seq = Math.trunc(event.seq);
    const seqs = seqsByRunId.get(runId);
    if (seqs) {
      seqs.push(seq);
    } else {
      seqsByRunId.set(runId, [seq]);
    }
  }

  for (const [runId, rawSeqs] of seqsByRunId.entries()) {
    const health = ensureRunHealth(runHealthByRunId, runId);
    const observedSeqs = uniqueSorted(rawSeqs);
    const observedSet = new Set(observedSeqs);

    const missingFromObserved: number[] = [];
    for (let idx = 1; idx < observedSeqs.length; idx += 1) {
      const previous = observedSeqs[idx - 1];
      const current = observedSeqs[idx];
      if (current <= previous + 1) continue;
      for (let missing = previous + 1; missing < current; missing += 1) {
        missingFromObserved.push(missing);
      }
    }

    if (observedSeqs.length > 0) {
      const observedLastSeq = observedSeqs[observedSeqs.length - 1] ?? null;
      if (
        observedLastSeq !== null &&
        (health.lastSeq === null || observedLastSeq > health.lastSeq)
      ) {
        health.lastSeq = observedLastSeq;
      }
    }

    const mergedMissing = uniqueSorted([
      ...health.missingSeqs,
      ...missingFromObserved,
    ]).filter((missing) => !observedSet.has(missing));
    health.missingSeqs = mergedMissing;

    if (health.missingSeqs.length > 0) {
      if (health.status === "ok" || health.status === "recovered") {
        health.status = "gap_detected";
      }
      if (missingFromObserved.length > 0) {
        health.gapCount = Math.max(health.gapCount, 1);
      }
    }
  }
}

export function hasPendingAutonomyGaps(
  runHealthByRunId: AutonomyRunHealthMap,
): boolean {
  return Object.values(runHealthByRunId).some(
    (health) => health.missingSeqs.length > 0,
  );
}

export function markPendingAutonomyGapsPartial(
  runHealthByRunId: AutonomyRunHealthMap,
  ts = Date.now(),
): AutonomyRunHealthMap {
  const next = cloneRunHealthMap(runHealthByRunId);
  for (const health of Object.values(next)) {
    if (health.missingSeqs.length === 0) continue;
    health.status = "partial";
    health.partialAt = ts;
  }
  return next;
}

export function mergeAutonomyEvents({
  existingEvents,
  incomingEvents,
  runHealthByRunId,
  maxEvents = DEFAULT_MAX_EVENTS,
  replay = false,
}: MergeAutonomyEventsOptions): MergeAutonomyEventsResult {
  if (incomingEvents.length === 0 && !replay) {
    const latestEventId =
      existingEvents.length > 0
        ? (existingEvents[existingEvents.length - 1]?.eventId ?? null)
        : null;
    return {
      events: existingEvents,
      latestEventId,
      runHealthByRunId,
      insertedCount: 0,
      duplicateCount: 0,
      runsWithNewGaps: [],
      runsRecovered: [],
      hasUnresolvedGaps: hasPendingAutonomyGaps(runHealthByRunId),
    };
  }

  const nextRunHealthByRunId = cloneRunHealthMap(runHealthByRunId);
  const nextEvents = [...existingEvents];
  hydrateRunHealthFromExistingEvents(nextRunHealthByRunId, existingEvents);

  const seenEventIds = new Set<string>();
  const seenFallbackKeys = new Set<string>();

  for (const event of existingEvents) {
    seenEventIds.add(event.eventId);
    const key = fallbackDedupKey(event);
    if (key) seenFallbackKeys.add(key);
  }

  let duplicateCount = 0;
  let insertedCount = 0;
  const runsWithNewGaps = new Set<string>();
  const runsRecovered = new Set<string>();

  for (const event of incomingEvents) {
    const key = fallbackDedupKey(event);
    const duplicate =
      seenEventIds.has(event.eventId) ||
      (key ? seenFallbackKeys.has(key) : false);
    if (duplicate) {
      duplicateCount += 1;
      continue;
    }

    seenEventIds.add(event.eventId);
    if (key) seenFallbackKeys.add(key);

    nextEvents.push(event);
    insertedCount += 1;

    if (
      typeof event.runId !== "string" ||
      event.runId.length === 0 ||
      typeof event.seq !== "number" ||
      !Number.isFinite(event.seq)
    ) {
      continue;
    }

    const health = ensureRunHealth(nextRunHealthByRunId, event.runId);
    const seq = Math.trunc(event.seq);
    const previousLastSeq = health.lastSeq;

    if (previousLastSeq !== null && seq > previousLastSeq + 1) {
      const missingSeqs: number[] = [];
      for (let current = previousLastSeq + 1; current < seq; current += 1) {
        missingSeqs.push(current);
      }
      health.missingSeqs = uniqueSorted([
        ...health.missingSeqs,
        ...missingSeqs,
      ]);
      health.status = "gap_detected";
      health.gapCount += 1;
      health.lastGapAt = event.ts;
      runsWithNewGaps.add(event.runId);
    }

    if (health.missingSeqs.length > 0) {
      health.missingSeqs = health.missingSeqs.filter(
        (missing) => missing !== seq,
      );
    }

    if (health.lastSeq === null || seq > health.lastSeq) {
      health.lastSeq = seq;
    }

    if (
      health.missingSeqs.length === 0 &&
      (health.status === "gap_detected" || health.status === "partial")
    ) {
      health.status = "recovered";
      health.recoveredAt = event.ts;
      runsRecovered.add(event.runId);
    }
  }

  if (replay) {
    const replayTs = Date.now();
    for (const health of Object.values(nextRunHealthByRunId)) {
      if (health.missingSeqs.length === 0) continue;
      health.status = "partial";
      health.partialAt = replayTs;
    }
  }

  const boundedEvents =
    nextEvents.length > maxEvents
      ? nextEvents.slice(nextEvents.length - maxEvents)
      : nextEvents;
  const latestEventId =
    boundedEvents.length > 0
      ? (boundedEvents[boundedEvents.length - 1]?.eventId ?? null)
      : null;

  return {
    events: boundedEvents,
    latestEventId,
    runHealthByRunId: nextRunHealthByRunId,
    insertedCount,
    duplicateCount,
    runsWithNewGaps: [...runsWithNewGaps],
    runsRecovered: [...runsRecovered],
    hasUnresolvedGaps: hasPendingAutonomyGaps(nextRunHealthByRunId),
  };
}
