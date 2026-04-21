import { describe, expect, it } from "vitest";
import {
  type CalendarEventSlim,
  type OccurrenceSlim,
  planDowntimeNudges,
  planGm,
  planGn,
  planNudges,
  selectTargetPlatform,
} from "./proactive-planner";
import type { ActivityProfile, FiredActionsLog } from "./types";
import { emptyBucketCounts } from "./types";

// ── Test helpers ──────────────────────────────────────

function makeProfile(
  overrides: Partial<ActivityProfile> = {},
): ActivityProfile {
  return {
    ownerEntityId: "owner-1",
    analyzedAt: Date.now(),
    analysisWindowDays: 7,
    timezone: "UTC",
    totalMessages: 100,
    sustainedInactivityThresholdMinutes: 180,
    platforms: [
      {
        source: "telegram",
        messageCount: 80,
        bucketCounts: emptyBucketCounts(),
        lastMessageAt: Date.now() - 5 * 60 * 1000,
        averageMessagesPerDay: 11,
      },
      {
        source: "discord",
        messageCount: 20,
        bucketCounts: emptyBucketCounts(),
        lastMessageAt: Date.now() - 30 * 60 * 1000,
        averageMessagesPerDay: 3,
      },
    ],
    primaryPlatform: "telegram",
    secondaryPlatform: "discord",
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
    lastSeenAt: Date.now() - 5 * 60 * 1000,
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

const TZ = "UTC";
// Monday 2026-04-06 07:00 UTC
const NOW = new Date("2026-04-06T07:00:00Z");
const NOW_MS = NOW.getTime();

function makeCalendarEvents(
  entries: Array<{
    hourStart: number;
    hourEnd: number;
    summary?: string;
    allDay?: boolean;
  }>,
): CalendarEventSlim[] {
  return entries.map((e, i) => ({
    id: `cal-${i}`,
    summary: e.summary ?? `Meeting ${i + 1}`,
    startAt: `2026-04-06T${String(e.hourStart).padStart(2, "0")}:00:00Z`,
    endAt: `2026-04-06T${String(e.hourEnd).padStart(2, "0")}:00:00Z`,
    isAllDay: e.allDay ?? false,
  }));
}

function makeOccurrences(
  entries: Array<{
    id?: string;
    title: string;
    dueHour: number;
    state?: string;
  }>,
): OccurrenceSlim[] {
  return entries.map((e, i) => ({
    id: e.id ?? `occ-${i}`,
    title: e.title,
    dueAt: `2026-04-06T${String(e.dueHour).padStart(2, "0")}:00:00Z`,
    state: e.state ?? "upcoming",
  }));
}

function makeOneOffOccurrence(
  overrides: Partial<OccurrenceSlim> & { title: string; dueAt: string },
): OccurrenceSlim {
  return {
    id: overrides.id ?? "occ-one-off",
    title: overrides.title,
    dueAt: overrides.dueAt,
    state: overrides.state ?? "pending",
    definitionKind: overrides.definitionKind ?? "task",
    cadence: overrides.cadence ?? { kind: "once" },
    priority: overrides.priority ?? 0,
  };
}

function requireValue<T>(value: T | null | undefined): T {
  expect(value).toBeDefined();
  expect(value).not.toBeNull();
  return value as T;
}

// ── selectTargetPlatform ──────────────────────────────

describe("selectTargetPlatform", () => {
  it("returns lastSeenPlatform when preferCurrent and user is active", () => {
    const profile = makeProfile({
      lastSeenPlatform: "discord",
      isCurrentlyActive: true,
    });
    expect(selectTargetPlatform(profile, true)).toBe("discord");
  });

  it("returns primaryPlatform when preferCurrent but user is inactive", () => {
    const profile = makeProfile({ isCurrentlyActive: false });
    expect(selectTargetPlatform(profile, true)).toBe("telegram");
  });

  it("returns primaryPlatform when preferCurrent is false", () => {
    const profile = makeProfile({
      lastSeenPlatform: "discord",
      isCurrentlyActive: true,
    });
    expect(selectTargetPlatform(profile, false)).toBe("telegram");
  });

  it("falls back to client_chat when no primaryPlatform", () => {
    const profile = makeProfile({
      primaryPlatform: null,
      isCurrentlyActive: false,
    });
    expect(selectTargetPlatform(profile, false)).toBe("client_chat");
  });
});

// ── planGm ────────────────────────────────────────────

describe("planGm", () => {
  it("returns a GM action with calendar context", () => {
    const profile = makeProfile({ lastSeenAt: NOW_MS - 60_000 });
    const events = makeCalendarEvents([{ hourStart: 9, hourEnd: 10 }]);
    const action = planGm(profile, [], events, null, TZ, NOW);
    const gmAction = requireValue(action);

    expect(gmAction.kind).toBe("gm");
    expect(gmAction.targetPlatform).toBe("telegram");
    expect(gmAction.contextSummary).toContain("1 meeting today");
    expect(gmAction.contextSummary).toContain("first at 9:00");
    expect(gmAction.messageText).toContain("Good morning.");
    expect(gmAction.messageText).toContain("1 meeting today");
    expect(gmAction.status).toBe("pending");
  });

  it("skips GM while the user is asleep", () => {
    const profile = makeProfile({
      isCurrentlySleeping: true,
      hasOpenActivityCycle: false,
      lastSleepSignalAt: NOW_MS - 2 * 60 * 60 * 1000,
    });
    const action = planGm(profile, [], [], null, TZ, NOW);

    expect(action).toBeNull();
  });

  it("includes morning occurrences in context", () => {
    const profile = makeProfile({ lastSeenAt: NOW_MS - 60_000 });
    const occs = makeOccurrences([{ title: "Brush teeth", dueHour: 8 }]);
    const action = planGm(profile, occs, [], null, TZ, NOW);
    const gmAction = requireValue(action);

    expect(gmAction.contextSummary).toContain("Brush teeth");
  });

  it("returns null if GM already fired today", () => {
    const profile = makeProfile({ lastSeenAt: NOW_MS - 60_000 });
    const firedToday: FiredActionsLog = {
      date: "2026-04-06",
      gmFiredAt: NOW_MS - 3600_000,
      nudgedOccurrenceIds: [],
      nudgedCalendarEventIds: [],
    };
    const action = planGm(profile, [], [], firedToday, TZ, NOW);
    expect(action).toBeNull();
  });

  it("returns skipped action if user inactive for 48h+", () => {
    const profile = makeProfile({ lastSeenAt: NOW_MS - 49 * 60 * 60 * 1000 });
    const action = planGm(profile, [], [], null, TZ, NOW);
    const skippedAction = requireValue(action);

    expect(skippedAction.status).toBe("skipped");
    expect(skippedAction.skipReason).toContain("48h");
  });

  it("returns null if past 11 AM cutoff", () => {
    const lateNow = new Date("2026-04-06T11:30:00Z");
    const profile = makeProfile({ lastSeenAt: lateNow.getTime() - 60_000 });
    const action = planGm(profile, [], [], null, TZ, lateNow);
    expect(action).toBeNull();
  });

  it("uses calendar first event hour minus 30 min for scheduling", () => {
    const profile = makeProfile({
      lastSeenAt: NOW_MS - 60_000,
      typicalFirstActiveHour: 8,
    });
    const events = makeCalendarEvents([{ hourStart: 9, hourEnd: 10 }]);
    const action = planGm(profile, [], events, null, TZ, NOW);
    const gmAction = requireValue(action);

    // GM should be at 8:30 (9:00 - 30min), epoch for 08:30 UTC on 2026-04-06
    const scheduledDate = new Date(gmAction.scheduledFor);
    // resolveGmHour floors (9 - 0.5 = 8.5 → 8), then localHourToEpoch snaps to hour
    expect(scheduledDate.getUTCHours()).toBe(8);
    expect(scheduledDate.getUTCMinutes()).toBe(0);
  });

  it("falls back to message histogram when no calendar", () => {
    const profile = makeProfile({
      lastSeenAt: NOW_MS - 60_000,
      typicalFirstActiveHour: 9,
      typicalWakeHour: 9,
      hasCalendarData: false,
    });
    const action = planGm(profile, [], [], null, TZ, NOW);
    const gmAction = requireValue(action);

    // 9:00 - 30 min = 8:30, floor to hour 8
    const scheduledDate = new Date(gmAction.scheduledFor);
    expect(scheduledDate.getUTCHours()).toBe(8);
  });

  it("falls back to default 8 AM when no data", () => {
    const profile = makeProfile({
      lastSeenAt: NOW_MS - 60_000,
      typicalFirstActiveHour: null,
      typicalWakeHour: null,
      typicalFirstEventHour: null,
    });
    const action = planGm(profile, [], [], null, TZ, NOW);
    const gmAction = requireValue(action);

    const scheduledDate = new Date(gmAction.scheduledFor);
    expect(scheduledDate.getUTCHours()).toBe(8);
  });

  it("skips GM while an all-nighter keeps the previous day open", () => {
    const now = new Date("2026-04-07T02:15:00Z");
    const profile = makeProfile({
      lastSeenAt: now.getTime() - 10 * 60 * 1000,
      currentActivityCycleStartedAt: Date.parse("2026-04-06T20:00:00Z"),
      currentActivityCycleLocalDate: "2026-04-06",
      effectiveDayKey: "2026-04-06",
      hasOpenActivityCycle: true,
    });

    const action = planGm(profile, [], [], null, TZ, now);
    expect(action).toBeNull();
  });
});

// ── planGn ────────────────────────────────────────────

describe("planGn", () => {
  it("returns a GN action when user was active today", () => {
    const profile = makeProfile({ lastSeenAt: NOW_MS - 60_000 });
    const action = planGn(profile, null, TZ, NOW);
    const gnAction = requireValue(action);

    expect(gnAction.kind).toBe("gn");
    expect(gnAction.messageText).toBe("Good night.");
    expect(gnAction.status).toBe("pending");
  });

  it("uses lastSeenPlatform when user is currently active", () => {
    const profile = makeProfile({
      lastSeenAt: NOW_MS - 60_000,
      lastSeenPlatform: "discord",
      isCurrentlyActive: true,
    });
    const action = planGn(profile, null, TZ, NOW);
    const gnAction = requireValue(action);
    expect(gnAction.targetPlatform).toBe("discord");
  });

  it("returns null if GN already fired today", () => {
    const profile = makeProfile({ lastSeenAt: NOW_MS - 60_000 });
    const firedToday: FiredActionsLog = {
      date: "2026-04-06",
      gnFiredAt: NOW_MS - 1800_000,
      nudgedOccurrenceIds: [],
      nudgedCalendarEventIds: [],
    };
    const action = planGn(profile, firedToday, TZ, NOW);
    expect(action).toBeNull();
  });

  it("returns null if user was not active today", () => {
    // lastSeenAt is yesterday
    const profile = makeProfile({
      lastSeenAt: NOW_MS - 25 * 60 * 60 * 1000,
    });
    const action = planGn(profile, null, TZ, NOW);
    expect(action).toBeNull();
  });

  it("schedules GN 30 min after typical last active hour", () => {
    const profile = makeProfile({
      lastSeenAt: NOW_MS - 60_000,
      typicalLastActiveHour: 21,
    });
    const action = planGn(profile, null, TZ, NOW);
    const gnAction = requireValue(action);
    const scheduledDate = new Date(gnAction.scheduledFor);
    // 21 + 0.5 = 21.5, ceil = 22
    expect(scheduledDate.getUTCHours()).toBe(22);
  });

  it("falls back to 10 PM when no data", () => {
    const profile = makeProfile({
      lastSeenAt: NOW_MS - 60_000,
      typicalLastActiveHour: null,
    });
    const action = planGn(profile, null, TZ, NOW);
    const gnAction = requireValue(action);
    const scheduledDate = new Date(gnAction.scheduledFor);
    expect(scheduledDate.getUTCHours()).toBe(22);
  });
});

// ── planNudges ────────────────────────────────────────

describe("planNudges", () => {
  it("creates nudge for occurrence due within horizon", () => {
    // NOW is 07:00, occurrence due at 07:30
    const profile = makeProfile({ lastSeenAt: NOW_MS - 60_000 });
    const occs = makeOccurrences([
      { title: "Brush teeth", dueHour: 7, state: "upcoming" },
    ]);
    // Adjust dueAt to 07:30
    occs[0].dueAt = "2026-04-06T07:30:00Z";

    const actions = planNudges(profile, occs, [], null, TZ, NOW);

    expect(actions).toHaveLength(1);
    expect(actions[0].kind).toBe("pre_activity_nudge");
    expect(actions[0].contextSummary).toContain("Brush teeth");
    expect(actions[0].occurrenceId).toBe("occ-0");
  });

  it("includes nearby calendar event in nudge context", () => {
    const profile = makeProfile({ lastSeenAt: NOW_MS - 60_000 });
    const occs = makeOccurrences([{ title: "Brush teeth", dueHour: 7 }]);
    occs[0].dueAt = "2026-04-06T07:20:00Z";
    // Standup at 07:30, within 45-min horizon AND within 1 hour of brush occurrence
    const events: CalendarEventSlim[] = [
      {
        id: "cal-0",
        summary: "Standup",
        startAt: "2026-04-06T07:30:00Z",
        endAt: "2026-04-06T08:00:00Z",
        isAllDay: false,
      },
    ];

    const actions = planNudges(profile, occs, events, null, TZ, NOW);

    expect(actions).toHaveLength(2); // 1 occurrence nudge + 1 calendar nudge
    const occNudge = requireValue(
      actions.find((action) => action.occurrenceId === "occ-0"),
    );
    const calendarNudge = actions.find((a) => a.calendarEventId === "cal-0");
    expect(occNudge.contextSummary).toContain("Brush teeth");
    expect(occNudge.contextSummary).toContain("Standup");
    expect(calendarNudge).toMatchObject({
      kind: "pre_activity_nudge",
      calendarEventId: "cal-0",
      contextSummary: "Standup",
    });
  });

  it("skips already-nudged occurrences", () => {
    const profile = makeProfile({ lastSeenAt: NOW_MS - 60_000 });
    const occs = makeOccurrences([
      { id: "occ-99", title: "Brush teeth", dueHour: 7 },
    ]);
    occs[0].dueAt = "2026-04-06T07:30:00Z";

    const firedToday: FiredActionsLog = {
      date: "2026-04-06",
      nudgedOccurrenceIds: ["occ-99"],
      nudgedCalendarEventIds: [],
    };

    const actions = planNudges(profile, occs, [], firedToday, TZ, NOW);
    expect(actions).toHaveLength(0);
  });

  it("skips completed occurrences", () => {
    const profile = makeProfile({ lastSeenAt: NOW_MS - 60_000 });
    const occs = makeOccurrences([
      { title: "Brush teeth", dueHour: 7, state: "completed" },
    ]);
    occs[0].dueAt = "2026-04-06T07:30:00Z";

    const actions = planNudges(profile, occs, [], null, TZ, NOW);
    expect(actions).toHaveLength(0);
  });

  it("skips occurrences outside horizon", () => {
    const profile = makeProfile({ lastSeenAt: NOW_MS - 60_000 });
    // Due at 09:00, which is 2 hours away — outside 45-min horizon
    const occs = makeOccurrences([{ title: "Brush teeth", dueHour: 9 }]);

    const actions = planNudges(profile, occs, [], null, TZ, NOW);
    expect(actions).toHaveLength(0);
  });

  it("skips all-day calendar events", () => {
    const profile = makeProfile({ lastSeenAt: NOW_MS - 60_000 });
    const events = makeCalendarEvents([
      { hourStart: 0, hourEnd: 0, summary: "Holiday", allDay: true },
    ]);

    const actions = planNudges(profile, [], events, null, TZ, NOW);
    expect(actions).toHaveLength(0);
  });

  it("skips already-nudged calendar events", () => {
    const profile = makeProfile({ lastSeenAt: NOW_MS - 60_000 });
    const events = makeCalendarEvents([
      { hourStart: 7, hourEnd: 8, summary: "Standup" },
    ]);

    const firedToday: FiredActionsLog = {
      date: "2026-04-06",
      nudgedOccurrenceIds: [],
      nudgedCalendarEventIds: ["cal-0"],
    };

    const actions = planNudges(profile, [], events, firedToday, TZ, NOW);
    expect(actions).toHaveLength(0);
  });

  it("returns empty array when no upcoming items", () => {
    const profile = makeProfile();
    const actions = planNudges(profile, [], [], null, TZ, NOW);
    expect(actions).toHaveLength(0);
  });
});

// ── planDowntimeNudges ────────────────────────────────

describe("planDowntimeNudges", () => {
  it("selects the most urgent one-off task during downtime", () => {
    const profile = makeProfile({ lastSeenAt: NOW_MS - 60_000 });
    const tasks = [
      makeOneOffOccurrence({
        id: "low",
        title: "Buy razor blades",
        dueAt: "2026-04-06T17:00:00Z",
        priority: 1,
      }),
      makeOneOffOccurrence({
        id: "high",
        title: "Book cavity appointment",
        dueAt: "2026-04-05T23:00:00Z",
        priority: 10,
      }),
    ];

    const actions = planDowntimeNudges(profile, tasks, [], null, TZ, NOW);

    expect(actions).toHaveLength(1);
    expect(actions[0].occurrenceId).toBe("high");
    expect(actions[0].contextSummary).toContain("Book cavity appointment");
    expect(actions[0].contextSummary).toContain("overdue");
    expect(actions[0].scheduledFor).toBe(NOW_MS);
  });

  it("suppresses downtime nudges on a busy day", () => {
    const profile = makeProfile({
      lastSeenAt: NOW_MS - 60_000,
      avgWeekdayMeetings: 4.5,
    });
    const tasks = [
      makeOneOffOccurrence({
        id: "low",
        title: "Buy razor blades",
        dueAt: "2026-04-06T17:00:00Z",
      }),
    ];
    const events = makeCalendarEvents([
      { hourStart: 8, hourEnd: 9 },
      { hourStart: 10, hourEnd: 11 },
      { hourStart: 13, hourEnd: 14 },
      { hourStart: 16, hourEnd: 17 },
    ]);

    const actions = planDowntimeNudges(profile, tasks, events, null, TZ, NOW);
    expect(actions).toHaveLength(0);
  });

  it("suppresses downtime nudges when the screen is busy", () => {
    const profile = makeProfile({
      lastSeenAt: NOW_MS - 60_000,
      screenContextAvailable: true,
      screenContextBusy: true,
      screenContextFocus: "work",
      screenContextSource: "browser-capture",
      screenContextSampledAt: NOW_MS - 2 * 60_000,
      screenContextConfidence: 0.88,
    });
    const tasks = [
      makeOneOffOccurrence({
        id: "low",
        title: "Buy razor blades",
        dueAt: "2026-04-06T17:00:00Z",
      }),
    ];

    const actions = planDowntimeNudges(profile, tasks, [], null, TZ, NOW);
    expect(actions).toHaveLength(0);
  });

  it("suppresses downtime nudges when an urgent item is due soon", () => {
    const profile = makeProfile({ lastSeenAt: NOW_MS - 60_000 });
    const tasks = [
      makeOneOffOccurrence({
        id: "urgent",
        title: "Respond to email",
        dueAt: "2026-04-06T08:30:00Z",
      }),
    ];

    const actions = planDowntimeNudges(profile, tasks, [], null, TZ, NOW);
    expect(actions).toHaveLength(0);
  });
});

// ── Full brushing teeth scenario ──────────────────────

describe("brushing teeth scenario", () => {
  const morningNow = new Date("2026-04-06T06:30:00Z"); // 6:30 AM
  const eveningNow = new Date("2026-04-06T21:30:00Z"); // 9:30 PM

  const profile = makeProfile({
    lastSeenAt: morningNow.getTime() - 5 * 60 * 1000,
    typicalFirstActiveHour: 7,
    typicalLastActiveHour: 22,
    isCurrentlyActive: true,
    lastSeenPlatform: "telegram",
  });

  const brushOccs = makeOccurrences([
    { id: "brush-am", title: "Brush teeth (morning)", dueHour: 7 },
    { id: "brush-pm", title: "Brush teeth (night)", dueHour: 22 },
  ]);

  const calEvents = makeCalendarEvents([
    { hourStart: 9, hourEnd: 10, summary: "Standup" },
  ]);

  it("GM fires at 6:30 with brush teeth + standup context", () => {
    const gm = planGm(profile, brushOccs, calEvents, null, TZ, morningNow);
    const gmAction = requireValue(gm);

    expect(gmAction.kind).toBe("gm");
    expect(gmAction.contextSummary).toContain("Brush teeth (morning)");
    expect(gmAction.contextSummary).toContain("1 meeting today");
    expect(gmAction.targetPlatform).toBe("telegram");
  });

  it("morning nudge fires for brush teeth before standup", () => {
    const nudges = planNudges(
      profile,
      brushOccs,
      calEvents,
      null,
      TZ,
      morningNow,
    );

    const brushNudge = requireValue(
      nudges.find((nudge) => nudge.occurrenceId === "brush-am"),
    );
    expect(brushNudge.contextSummary).toContain("Brush teeth (morning)");
    // Standup at 9:00 is within 1 hour of brush at 7:00
  });

  it("GN fires in the evening", () => {
    const eveningProfile = makeProfile({
      ...profile,
      lastSeenAt: eveningNow.getTime() - 5 * 60 * 1000,
      typicalLastActiveHour: 22,
    });

    const gn = planGn(eveningProfile, null, TZ, eveningNow);
    const gnAction = requireValue(gn);

    expect(gnAction.kind).toBe("gn");
    expect(gnAction.targetPlatform).toBe("telegram");
  });

  it("evening nudge fires for brush teeth", () => {
    const eveningProfile = makeProfile({
      ...profile,
      lastSeenAt: eveningNow.getTime() - 5 * 60 * 1000,
    });

    const nudges = planNudges(
      eveningProfile,
      brushOccs,
      [],
      null,
      TZ,
      eveningNow,
    );

    const brushNudge = requireValue(
      nudges.find((nudge) => nudge.occurrenceId === "brush-pm"),
    );
    expect(brushNudge.contextSummary).toContain("Brush teeth (night)");
  });
});
