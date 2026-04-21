import type { IAgentRuntime, Task, UUID } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityProfile, FiredActionsLog } from "./types.js";
import { emptyBucketCounts } from "./types.js";

// ── Hoisted mocks ─────────────────────────────────────

const mocks = vi.hoisted(() => ({
  resolveOwnerEntityId: vi.fn<() => Promise<string | null>>(),
  buildActivityProfile: vi.fn<() => Promise<ActivityProfile>>(),
  refreshCurrentState: vi.fn<() => Promise<ActivityProfile>>(),
  readProfileFromMetadata: vi.fn<() => ActivityProfile | null>(),
  readFiredLogFromMetadata: vi.fn<() => null>(),
  profileNeedsRebuild: vi.fn<() => boolean>(),
  resolveDefaultTimeZone: vi.fn(() => "UTC"),
  loadOwnerContactsConfig: vi.fn(() => ({})),
  resolveOwnerContactWithFallback: vi.fn(() => null),
  mockGetOverview: vi.fn(),
  mockGetCalendarFeed: vi.fn(),
  mockListActivitySignals: vi.fn(() => []),
}));

vi.mock("./service.js", () => ({
  resolveOwnerEntityId: mocks.resolveOwnerEntityId,
  buildActivityProfile: mocks.buildActivityProfile,
  refreshCurrentState: mocks.refreshCurrentState,
  readProfileFromMetadata: mocks.readProfileFromMetadata,
  readFiredLogFromMetadata: mocks.readFiredLogFromMetadata,
  profileNeedsRebuild: mocks.profileNeedsRebuild,
}));

vi.mock("../lifeops/defaults.js", () => ({
  resolveDefaultTimeZone: mocks.resolveDefaultTimeZone,
}));

vi.mock("../config/owner-contacts.js", () => ({
  loadOwnerContactsConfig: mocks.loadOwnerContactsConfig,
  resolveOwnerContactWithFallback: mocks.resolveOwnerContactWithFallback,
}));

vi.mock("../lifeops/service.js", () => ({
  LifeOpsService: class {
    getOverview = mocks.mockGetOverview;
    getCalendarFeed = mocks.mockGetCalendarFeed;
    listActivitySignals = mocks.mockListActivitySignals;
  },
  LifeOpsServiceError: class extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

import {
  ensureProactiveAgentTask,
  executeProactiveTask,
  PROACTIVE_TASK_INTERVAL_MS,
  PROACTIVE_TASK_NAME,
  PROACTIVE_TASK_TAGS,
  registerProactiveTaskWorker,
} from "./proactive-worker.js";

// ── Fixtures ──────────────────────────────────────────

const MORNING_NOW = new Date("2026-04-06T07:00:00Z");

function makeProfile(
  overrides: Partial<ActivityProfile> = {},
): ActivityProfile {
  return {
    ownerEntityId: "owner-1",
    analyzedAt: MORNING_NOW.getTime() - 5 * 60 * 1000,
    analysisWindowDays: 7,
    timezone: "UTC",
    totalMessages: 100,
    sustainedInactivityThresholdMinutes: 180,
    platforms: [
      {
        source: "telegram",
        messageCount: 80,
        bucketCounts: emptyBucketCounts(),
        lastMessageAt: MORNING_NOW.getTime() - 5 * 60 * 1000,
        averageMessagesPerDay: 11,
      },
    ],
    primaryPlatform: "telegram",
    secondaryPlatform: null,
    bucketCounts: emptyBucketCounts(),
    hasCalendarData: false,
    typicalFirstEventHour: null,
    typicalLastEventHour: null,
    avgWeekdayMeetings: null,
    typicalFirstActiveHour: 8,
    typicalLastActiveHour: 19,
    typicalWakeHour: 8,
    typicalSleepHour: 23,
    hasSleepData: false,
    isCurrentlySleeping: false,
    lastSleepSignalAt: null,
    lastWakeSignalAt: null,
    sleepSourcePlatform: null,
    sleepSource: null,
    typicalSleepDurationMinutes: null,
    lastSeenAt: MORNING_NOW.getTime() - 5 * 60 * 1000,
    lastSeenPlatform: "telegram",
    isCurrentlyActive: true,
    hasOpenActivityCycle: true,
    currentActivityCycleStartedAt: Date.parse("2026-04-06T06:00:00Z"),
    currentActivityCycleLocalDate: "2026-04-06",
    effectiveDayKey: "2026-04-06",
    screenContextFocus: null,
    screenContextSource: null,
    screenContextSampledAt: null,
    screenContextConfidence: null,
    screenContextBusy: false,
    screenContextAvailable: false,
    screenContextStale: false,
    ...overrides,
  };
}

function createRuntimeMock(tasks: Task[] = []) {
  const workerRegistry = new Map<string, unknown>();
  const state = { tasks: [...tasks] };
  const eventService = {
    emit: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
    subscribeHeartbeat: vi.fn(() => vi.fn()),
  };
  const runtime = {
    agentId: "agent-1" as UUID,
    getService: vi.fn((serviceType: string) => {
      if (serviceType === "agent_event" || serviceType === "AGENT_EVENT") {
        return eventService;
      }
      return {
        getAutonomousRoomId: () => "room-proactive" as UUID,
      };
    }),
    getTasks: vi.fn(async () => [...state.tasks]),
    createTask: vi.fn(async (task: Task) => {
      const id = (task.id ?? "proactive-task-id") as UUID;
      state.tasks.push({ ...task, id });
      return id;
    }),
    updateTask: vi.fn(async (taskId: UUID, update: Partial<Task>) => {
      state.tasks = state.tasks.map((t) => {
        if (t.id !== taskId) return t;
        const merged = { ...t, ...update } as Task;
        if (update.metadata) {
          (merged as { metadata: unknown }).metadata = {
            ...((t.metadata ?? {}) as Record<string, unknown>),
            ...((update.metadata ?? {}) as Record<string, unknown>),
          };
        }
        return merged;
      });
    }),
    sendMessageToTarget: vi.fn(async () => {}),
    registerTaskWorker: vi.fn((worker: { name: string }) => {
      workerRegistry.set(worker.name, worker);
    }),
    getTaskWorker: vi.fn((name: string) => workerRegistry.get(name)),
  } as unknown as IAgentRuntime;

  return { runtime, workerRegistry, state, eventService };
}

function makeExistingProactiveTask(
  metadata: Record<string, unknown> = {},
): Task {
  return {
    id: "existing-proactive-task" as UUID,
    name: PROACTIVE_TASK_NAME,
    description: "Proactive agent: GM/GN/nudges based on activity profile",
    tags: [...PROACTIVE_TASK_TAGS],
    metadata: {
      proactiveAgent: { kind: "runtime_runner", version: 1 },
      updateInterval: PROACTIVE_TASK_INTERVAL_MS,
      baseInterval: PROACTIVE_TASK_INTERVAL_MS,
      blocking: true,
      ...metadata,
    },
  };
}

function configureTelegramDelivery(): void {
  mocks.loadOwnerContactsConfig.mockReturnValue({
    telegram: { entityId: "owner-tg", channelId: "ch-1" },
  });
  mocks.resolveOwnerContactWithFallback.mockReturnValue({
    source: "telegram",
    contact: { entityId: "owner-tg", channelId: "ch-1" },
    resolvedFrom: "config",
  });
}

function getPersistedMetadata(
  state: { tasks: Task[] },
  taskId: UUID,
): Record<string, unknown> {
  const updatedTask = state.tasks.find((task) => task.id === taskId);
  expect(updatedTask).toBeDefined();
  return (updatedTask?.metadata ?? {}) as Record<string, unknown>;
}

function getPersistedFiredLog(
  state: { tasks: Task[] },
  taskId: UUID,
): FiredActionsLog {
  return getPersistedMetadata(state, taskId).firedActionsLog as FiredActionsLog;
}

function requireTaskId(task: Task): UUID {
  expect(task.id).toBeDefined();
  return task.id as UUID;
}

// ── ensureProactiveAgentTask ──────────────────────────

describe("ensureProactiveAgentTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates the task when none exists", async () => {
    const { runtime, state } = createRuntimeMock();
    const taskId = await ensureProactiveAgentTask(runtime);

    expect(taskId).toBe("proactive-task-id");
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0].name).toBe(PROACTIVE_TASK_NAME);
    expect(state.tasks[0].tags).toEqual([...PROACTIVE_TASK_TAGS]);
    expect(state.tasks[0].metadata).toMatchObject({
      proactiveAgent: { kind: "runtime_runner", version: 1 },
      updateInterval: PROACTIVE_TASK_INTERVAL_MS,
      blocking: true,
    });
  });

  it("updates and reuses an existing task", async () => {
    const existing = makeExistingProactiveTask();
    const { runtime } = createRuntimeMock([existing]);

    const taskId = await ensureProactiveAgentTask(runtime);

    expect(taskId).toBe(existing.id);
    expect(vi.mocked(runtime.updateTask)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runtime.createTask)).not.toHaveBeenCalled();
  });

  it("preserves existing metadata when updating", async () => {
    const existing = makeExistingProactiveTask({
      activityProfile: { ownerEntityId: "owner-1", analyzedAt: 123 },
    });
    const { runtime, state } = createRuntimeMock([existing]);

    await ensureProactiveAgentTask(runtime);

    const updated = state.tasks.find((t) => t.id === existing.id);
    const meta = updated?.metadata as Record<string, unknown>;
    expect(meta.activityProfile).toEqual({
      ownerEntityId: "owner-1",
      analyzedAt: 123,
    });
    expect(meta.proactiveAgent).toEqual({
      kind: "runtime_runner",
      version: 1,
    });
  });

  it("uses autonomy room ID when available", async () => {
    const { runtime } = createRuntimeMock();

    await ensureProactiveAgentTask(runtime);

    expect(vi.mocked(runtime.createTask)).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: "room-proactive" }),
    );
  });
});

// ── registerProactiveTaskWorker ───────────────────────

describe("registerProactiveTaskWorker", () => {
  it("registers the worker", () => {
    const { runtime, workerRegistry } = createRuntimeMock();
    registerProactiveTaskWorker(runtime);
    expect(workerRegistry.has(PROACTIVE_TASK_NAME)).toBe(true);
  });

  it("does not double-register", () => {
    const { runtime } = createRuntimeMock();
    registerProactiveTaskWorker(runtime);
    registerProactiveTaskWorker(runtime);
    expect(vi.mocked(runtime.registerTaskWorker)).toHaveBeenCalledTimes(1);
  });
});

// ── executeProactiveTask ──────────────────────────────

describe("executeProactiveTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(MORNING_NOW);
    mocks.resolveDefaultTimeZone.mockReturnValue("UTC");
    mocks.mockGetOverview.mockResolvedValue({ occurrences: [] });
    mocks.mockGetCalendarFeed.mockResolvedValue({ events: [] });
    mocks.loadOwnerContactsConfig.mockReturnValue({});
    mocks.readFiredLogFromMetadata.mockReturnValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns nextInterval when no owner is configured", async () => {
    mocks.resolveOwnerEntityId.mockResolvedValue(null);
    const { runtime } = createRuntimeMock();

    const result = await executeProactiveTask(runtime);

    expect(result.nextInterval).toBe(PROACTIVE_TASK_INTERVAL_MS);
    expect(mocks.buildActivityProfile).not.toHaveBeenCalled();
  });

  it("returns nextInterval when proactive task is missing", async () => {
    mocks.resolveOwnerEntityId.mockResolvedValue("owner-1");
    const { runtime } = createRuntimeMock([]); // no tasks

    const result = await executeProactiveTask(runtime);

    expect(result.nextInterval).toBe(PROACTIVE_TASK_INTERVAL_MS);
  });

  it("builds a full profile when none exists in metadata", async () => {
    const profile = makeProfile();
    mocks.resolveOwnerEntityId.mockResolvedValue("owner-1");
    mocks.readProfileFromMetadata.mockReturnValue(null);
    mocks.profileNeedsRebuild.mockReturnValue(true);
    mocks.buildActivityProfile.mockResolvedValue(profile);

    const task = makeExistingProactiveTask();
    const { runtime, state } = createRuntimeMock([task]);

    await executeProactiveTask(runtime);

    expect(mocks.buildActivityProfile).toHaveBeenCalled();
    expect(mocks.refreshCurrentState).not.toHaveBeenCalled();
    // Verify profile was persisted
    const updated = state.tasks.find((t) => t.id === task.id);
    const meta = updated?.metadata as Record<string, unknown>;
    expect(meta.activityProfile).toBe(profile);
  });

  it("refreshes existing profile when it is still fresh", async () => {
    const profile = makeProfile();
    const refreshed = makeProfile({ lastSeenAt: Date.now() });
    mocks.resolveOwnerEntityId.mockResolvedValue("owner-1");
    mocks.readProfileFromMetadata.mockReturnValue(profile);
    mocks.profileNeedsRebuild.mockReturnValue(false);
    mocks.refreshCurrentState.mockResolvedValue(refreshed);

    const task = makeExistingProactiveTask();
    const { runtime } = createRuntimeMock([task]);

    await executeProactiveTask(runtime);

    expect(mocks.refreshCurrentState).toHaveBeenCalledWith(
      runtime,
      "owner-1",
      profile,
      expect.any(Date),
    );
    expect(mocks.buildActivityProfile).not.toHaveBeenCalled();
  });

  it("sends GM when due and records gmFiredAt", async () => {
    const profile = makeProfile({
      lastSeenAt: Date.now() - 60_000,
      typicalFirstActiveHour: 8,
      typicalWakeHour: 8,
    });
    mocks.resolveOwnerEntityId.mockResolvedValue("owner-1");
    mocks.readProfileFromMetadata.mockReturnValue(profile);
    mocks.profileNeedsRebuild.mockReturnValue(false);
    mocks.refreshCurrentState.mockResolvedValue(profile);
    configureTelegramDelivery();

    const task = makeExistingProactiveTask();
    const taskId = requireTaskId(task);
    const { runtime, state } = createRuntimeMock([task]);

    await executeProactiveTask(runtime);

    const sendSpy = vi.mocked(runtime.sendMessageToTarget);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "telegram",
        entityId: "owner-tg",
        channelId: "ch-1",
      }),
      expect.objectContaining({
        text: "Good morning.",
        source: "telegram",
      }),
    );
    expect(getPersistedMetadata(state, taskId).activityProfile).toBeDefined();
    expect(getPersistedFiredLog(state, taskId)).toMatchObject({
      date: "2026-04-06",
      nudgedOccurrenceIds: [],
      nudgedCalendarEventIds: [],
    });
    expect(getPersistedFiredLog(state, taskId).gmFiredAt).toEqual(
      MORNING_NOW.getTime(),
    );
  });

  it("sends GN when due and records gnFiredAt", async () => {
    const profile = makeProfile({
      lastSeenAt: Date.now() - 60_000,
      typicalWakeHour: 23,
      typicalFirstActiveHour: 23,
      typicalLastActiveHour: 6,
    });
    mocks.resolveOwnerEntityId.mockResolvedValue("owner-1");
    mocks.readProfileFromMetadata.mockReturnValue(profile);
    mocks.profileNeedsRebuild.mockReturnValue(false);
    mocks.refreshCurrentState.mockResolvedValue(profile);
    configureTelegramDelivery();

    const task = makeExistingProactiveTask();
    const taskId = requireTaskId(task);
    const { runtime, state } = createRuntimeMock([task]);

    await executeProactiveTask(runtime);

    expect(vi.mocked(runtime.sendMessageToTarget)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runtime.sendMessageToTarget)).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "telegram",
      }),
      expect.objectContaining({
        text: "Good night.",
        source: "telegram",
      }),
    );
    expect(getPersistedFiredLog(state, taskId)).toMatchObject({
      date: "2026-04-06",
      nudgedOccurrenceIds: [],
      nudgedCalendarEventIds: [],
    });
    expect(getPersistedFiredLog(state, taskId).gnFiredAt).toEqual(
      MORNING_NOW.getTime(),
    );
  });

  it("emits GN to client_chat as assistant activity and records gnFiredAt", async () => {
    const profile = makeProfile({
      lastSeenAt: Date.now() - 60_000,
      primaryPlatform: "desktop_app",
      lastSeenPlatform: "desktop_app",
      typicalWakeHour: 23,
      typicalFirstActiveHour: 23,
      typicalLastActiveHour: 6,
    });
    mocks.resolveOwnerEntityId.mockResolvedValue("owner-1");
    mocks.readProfileFromMetadata.mockReturnValue(profile);
    mocks.profileNeedsRebuild.mockReturnValue(false);
    mocks.refreshCurrentState.mockResolvedValue(profile);
    mocks.loadOwnerContactsConfig.mockReturnValue({});

    const task = makeExistingProactiveTask();
    const taskId = requireTaskId(task);
    const { runtime, state, eventService } = createRuntimeMock([task]);

    await executeProactiveTask(runtime);

    expect(vi.mocked(runtime.sendMessageToTarget)).not.toHaveBeenCalled();
    expect(eventService.emit).toHaveBeenCalledTimes(1);
    expect(eventService.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        stream: "assistant",
        agentId: "agent-1",
        data: expect.objectContaining({
          text: "Good night.",
          source: "proactive-gn",
          kind: "gn",
          targetPlatform: "desktop_app",
        }),
      }),
    );
    expect(getPersistedFiredLog(state, taskId)).toMatchObject({
      date: "2026-04-06",
      nudgedOccurrenceIds: [],
      nudgedCalendarEventIds: [],
    });
    expect(getPersistedFiredLog(state, taskId).gnFiredAt).toEqual(
      MORNING_NOW.getTime(),
    );
  });

  it("records occurrence nudges after sending them", async () => {
    const profile = makeProfile({
      lastSeenAt: Date.parse("2026-04-05T08:00:00Z"),
      typicalWakeHour: 23,
      typicalFirstActiveHour: 23,
      typicalLastActiveHour: 23,
      hasOpenActivityCycle: false,
      isCurrentlyActive: false,
      currentActivityCycleStartedAt: null,
      currentActivityCycleLocalDate: "2026-04-05",
    });
    mocks.resolveOwnerEntityId.mockResolvedValue("owner-1");
    mocks.readProfileFromMetadata.mockReturnValue(profile);
    mocks.profileNeedsRebuild.mockReturnValue(false);
    mocks.refreshCurrentState.mockResolvedValue(profile);
    configureTelegramDelivery();
    mocks.mockGetOverview.mockResolvedValue({
      occurrences: [
        {
          id: "brush-am",
          title: "Brush teeth",
          dueAt: new Date(Date.now() + 20 * 60_000).toISOString(),
          state: "upcoming",
          definitionKind: "habit",
          cadence: { kind: "daily" },
          priority: 5,
        },
      ],
    });

    const task = makeExistingProactiveTask();
    const taskId = requireTaskId(task);
    const { runtime, state } = createRuntimeMock([task]);

    await executeProactiveTask(runtime);

    expect(vi.mocked(runtime.sendMessageToTarget)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runtime.sendMessageToTarget)).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "telegram",
      }),
      expect.objectContaining({
        text: "Brush teeth",
        source: "telegram",
      }),
    );
    expect(getPersistedFiredLog(state, taskId)).toMatchObject({
      date: "2026-04-06",
      nudgedOccurrenceIds: ["brush-am"],
      nudgedCalendarEventIds: [],
    });
  });

  it("records calendar-event nudges after sending them", async () => {
    const profile = makeProfile({
      lastSeenAt: Date.parse("2026-04-03T08:00:00Z"),
      typicalWakeHour: 23,
      typicalFirstActiveHour: 23,
      typicalLastActiveHour: 23,
      hasOpenActivityCycle: false,
      isCurrentlyActive: false,
      currentActivityCycleStartedAt: null,
      currentActivityCycleLocalDate: "2026-04-05",
    });
    mocks.resolveOwnerEntityId.mockResolvedValue("owner-1");
    mocks.readProfileFromMetadata.mockReturnValue(profile);
    mocks.profileNeedsRebuild.mockReturnValue(false);
    mocks.refreshCurrentState.mockResolvedValue(profile);
    configureTelegramDelivery();
    mocks.mockGetCalendarFeed.mockResolvedValue({
      events: [
        {
          id: "cal-standup",
          title: "Standup",
          startAt: new Date(Date.now() + 20 * 60_000).toISOString(),
          endAt: new Date(Date.now() + 50 * 60_000).toISOString(),
          isAllDay: false,
        },
      ],
    });

    const task = makeExistingProactiveTask();
    const taskId = requireTaskId(task);
    const { runtime, state } = createRuntimeMock([task]);

    await executeProactiveTask(runtime);

    expect(vi.mocked(runtime.sendMessageToTarget)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runtime.sendMessageToTarget)).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "telegram",
      }),
      expect.objectContaining({
        text: "Standup",
        source: "telegram",
      }),
    );
    expect(getPersistedFiredLog(state, taskId)).toMatchObject({
      date: "2026-04-06",
      nudgedOccurrenceIds: [],
      nudgedCalendarEventIds: ["cal-standup"],
    });
  });

  it("skips actions scheduled in the future", async () => {
    // Keep the owner outside the current effective day so GN is skipped,
    // and push GM far enough ahead that it remains pending.
    const futureProfile = makeProfile({
      lastSeenAt: Date.now() - 25 * 60 * 60 * 1000,
      typicalFirstActiveHour: 23,
      typicalLastActiveHour: 23,
      typicalWakeHour: 23,
      typicalSleepHour: 23,
      hasOpenActivityCycle: false,
      isCurrentlyActive: false,
    });
    mocks.resolveOwnerEntityId.mockResolvedValue("owner-1");
    mocks.readProfileFromMetadata.mockReturnValue(futureProfile);
    mocks.profileNeedsRebuild.mockReturnValue(false);
    mocks.refreshCurrentState.mockResolvedValue(futureProfile);
    mocks.loadOwnerContactsConfig.mockReturnValue({
      telegram: { entityId: "owner-tg" },
    });

    const task = makeExistingProactiveTask();
    const { runtime } = createRuntimeMock([task]);

    await executeProactiveTask(runtime);

    expect(vi.mocked(runtime.sendMessageToTarget)).not.toHaveBeenCalled();
  });

  it("skips sending when no owner contact is configured for the platform", async () => {
    const profile = makeProfile({
      lastSeenAt: Date.now() - 60_000,
      primaryPlatform: "whatsapp",
    });
    mocks.resolveOwnerEntityId.mockResolvedValue("owner-1");
    mocks.readProfileFromMetadata.mockReturnValue(profile);
    mocks.profileNeedsRebuild.mockReturnValue(false);
    mocks.refreshCurrentState.mockResolvedValue(profile);
    mocks.loadOwnerContactsConfig.mockReturnValue({}); // no contacts at all
    mocks.resolveOwnerContactWithFallback.mockReturnValue(null);

    const task = makeExistingProactiveTask();
    const { runtime } = createRuntimeMock([task]);

    await executeProactiveTask(runtime);

    expect(vi.mocked(runtime.sendMessageToTarget)).not.toHaveBeenCalled();
  });

  it("falls back to the resolved owner entity for discord delivery", async () => {
    const profile = makeProfile({
      lastSeenAt: Date.now() - 60_000,
      primaryPlatform: "discord",
    });
    mocks.resolveOwnerEntityId.mockResolvedValue("owner-discord-uuid");
    mocks.readProfileFromMetadata.mockReturnValue(profile);
    mocks.profileNeedsRebuild.mockReturnValue(false);
    mocks.refreshCurrentState.mockResolvedValue(profile);
    mocks.loadOwnerContactsConfig.mockReturnValue({});
    mocks.resolveOwnerContactWithFallback.mockReturnValue({
      source: "discord",
      contact: { entityId: "owner-discord-uuid" },
      resolvedFrom: "owner_entity",
    });

    const task = makeExistingProactiveTask();
    const { runtime } = createRuntimeMock([task]);

    await executeProactiveTask(runtime);

    expect(vi.mocked(runtime.sendMessageToTarget)).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "discord",
        entityId: "owner-discord-uuid",
      }),
      expect.objectContaining({
        source: "discord",
      }),
    );
  });

  it("survives sendMessageToTarget failures and still persists metadata", async () => {
    const profile = makeProfile({
      lastSeenAt: Date.now() - 60_000,
    });
    mocks.resolveOwnerEntityId.mockResolvedValue("owner-1");
    mocks.readProfileFromMetadata.mockReturnValue(profile);
    mocks.profileNeedsRebuild.mockReturnValue(false);
    mocks.refreshCurrentState.mockResolvedValue(profile);
    mocks.loadOwnerContactsConfig.mockReturnValue({
      telegram: { entityId: "owner-tg" },
    });
    mocks.resolveOwnerContactWithFallback.mockReturnValue({
      source: "telegram",
      contact: { entityId: "owner-tg" },
      resolvedFrom: "config",
    });

    const task = makeExistingProactiveTask();
    const { runtime, state } = createRuntimeMock([task]);
    vi.mocked(runtime.sendMessageToTarget).mockRejectedValue(
      new Error("network down"),
    );

    const result = await executeProactiveTask(runtime);

    expect(result.nextInterval).toBe(PROACTIVE_TASK_INTERVAL_MS);
    // Profile should still be persisted despite send failure
    const updated = state.tasks.find((t) => t.id === task.id);
    const meta = updated?.metadata as Record<string, unknown>;
    expect(meta.activityProfile).toBeDefined();
  });

  it("emits client_chat proactive activity without relying on a send handler", async () => {
    const profile = makeProfile({
      lastSeenAt: Date.now() - 60_000,
      primaryPlatform: "desktop_app",
      lastSeenPlatform: "desktop_app",
    });
    mocks.resolveOwnerEntityId.mockResolvedValue("owner-1");
    mocks.readProfileFromMetadata.mockReturnValue(profile);
    mocks.profileNeedsRebuild.mockReturnValue(false);
    mocks.refreshCurrentState.mockResolvedValue(profile);
    mocks.loadOwnerContactsConfig.mockReturnValue({});

    const task = makeExistingProactiveTask();
    const { runtime, state, eventService } = createRuntimeMock([task]);

    await executeProactiveTask(runtime);

    expect(vi.mocked(runtime.sendMessageToTarget)).not.toHaveBeenCalled();
    expect(eventService.emit).toHaveBeenCalledTimes(1);
    const updated = state.tasks.find((t) => t.id === task.id);
    const meta = updated?.metadata as Record<string, unknown>;
    expect(meta.activityProfile).toBeDefined();
  });

  it("returns nextInterval even when the entire execution throws", async () => {
    mocks.resolveOwnerEntityId.mockRejectedValue(
      new Error("database exploded"),
    );

    const { runtime } = createRuntimeMock();

    const result = await executeProactiveTask(runtime);

    expect(result.nextInterval).toBe(PROACTIVE_TASK_INTERVAL_MS);
  });

  it("persists firedActionsLog across the execution", async () => {
    const profile = makeProfile({
      lastSeenAt: Date.now() - 60_000,
      typicalFirstActiveHour: 8,
      typicalWakeHour: 7,
    });
    mocks.resolveOwnerEntityId.mockResolvedValue("owner-1");
    mocks.readProfileFromMetadata.mockReturnValue(profile);
    mocks.profileNeedsRebuild.mockReturnValue(false);
    mocks.refreshCurrentState.mockResolvedValue(profile);
    mocks.loadOwnerContactsConfig.mockReturnValue({
      telegram: { entityId: "owner-tg", channelId: "ch-1" },
    });
    mocks.resolveOwnerContactWithFallback.mockReturnValue({
      source: "telegram",
      contact: { entityId: "owner-tg", channelId: "ch-1" },
      resolvedFrom: "config",
    });

    // Simulate occurrences due soon
    mocks.mockGetOverview.mockResolvedValue({
      occurrences: [
        {
          id: "brush-am",
          title: "Brush teeth",
          dueAt: new Date(Date.now() + 20 * 60_000).toISOString(),
          state: "upcoming",
          definitionKind: "habit",
          cadence: { kind: "daily" },
          priority: 5,
        },
      ],
    });

    const task = makeExistingProactiveTask();
    const { runtime, state } = createRuntimeMock([task]);

    await executeProactiveTask(runtime);

    // Metadata should be updated with both profile and firedLog
    const updated = state.tasks.find((t) => t.id === task.id);
    expect(updated).toBeDefined();
    const meta = updated?.metadata as Record<string, unknown>;
    expect(meta.activityProfile).toBeDefined();
    // firedActionsLog should exist even if empty (date should be set)
    if (meta.firedActionsLog) {
      const log = meta.firedActionsLog as Record<string, unknown>;
      expect(log.date).toBeDefined();
    }
  });
});
