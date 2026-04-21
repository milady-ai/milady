/**
 * Smoke tests for the LIFE action — verifies the full handler chain
 * with realistic mock data, exercising the real classifyIntent + handler
 * code path without requiring a live LLM or server.
 *
 * These simulate what happens when the LLM selects the LIFE action
 * with various parameter combinations:
 *
 *   1. LLM provides `action` param (primary path, reliable)
 *   2. LLM omits `action` but provides `intent` (fallback classifier path)
 *   3. LLM provides both (action wins)
 *   4. LLM provides malformed/missing params (error paths)
 *
 * Run: bunx vitest run packages/agent/src/actions/life-smoke.test.ts
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifyIntent } from "./life";

const mocks = vi.hoisted(() => {
  class _LifeOpsServiceError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = "LifeOpsServiceError";
    }
  }
  return {
    LifeOpsServiceError: _LifeOpsServiceError,
    checkSenderPrivateAccess: vi.fn(),
    resolveCanonicalOwnerIdForMessage: vi.fn(),
    createDefinition: vi.fn(),
    createGoal: vi.fn(),
    updateDefinition: vi.fn(),
    deleteDefinition: vi.fn(),
    deleteGoal: vi.fn(),
    completeOccurrence: vi.fn(),
    skipOccurrence: vi.fn(),
    snoozeOccurrence: vi.fn(),
    reviewGoal: vi.fn(),
    capturePhoneConsent: vi.fn(),
    getOverview: vi.fn(),
    listDefinitions: vi.fn(),
    listGoals: vi.fn(),
    getCalendarFeed: vi.fn(),
    getNextCalendarEventContext: vi.fn(),
    getGmailTriage: vi.fn(),
    getGoogleConnectorStatus: vi.fn(),
  };
});

vi.mock("@elizaos/core/roles", () => ({
  checkSenderPrivateAccess: mocks.checkSenderPrivateAccess,
  resolveCanonicalOwnerIdForMessage: mocks.resolveCanonicalOwnerIdForMessage,
}));

vi.mock("../lifeops/service.js", () => ({
  LifeOpsServiceError: mocks.LifeOpsServiceError,
  LifeOpsService: class {
    createDefinition = mocks.createDefinition;
    createGoal = mocks.createGoal;
    updateDefinition = mocks.updateDefinition;
    deleteDefinition = mocks.deleteDefinition;
    deleteGoal = mocks.deleteGoal;
    completeOccurrence = mocks.completeOccurrence;
    skipOccurrence = mocks.skipOccurrence;
    snoozeOccurrence = mocks.snoozeOccurrence;
    reviewGoal = mocks.reviewGoal;
    capturePhoneConsent = mocks.capturePhoneConsent;
    getOverview = mocks.getOverview;
    listDefinitions = mocks.listDefinitions;
    listGoals = mocks.listGoals;
    getCalendarFeed = mocks.getCalendarFeed;
    getNextCalendarEventContext = mocks.getNextCalendarEventContext;
    getGmailTriage = mocks.getGmailTriage;
    getGoogleConnectorStatus = mocks.getGoogleConnectorStatus;
  },
}));

import { lifeAction } from "./life";

const runtime = { agentId: "agent-1" } as never;
const privateAccess = { hasPrivateAccess: true };

function send(params: Record<string, unknown>, messageText?: string) {
  return lifeAction.handler?.(
    runtime,
    { entityId: "owner-1", content: { source: "client_chat", text: messageText ?? (params.intent as string) ?? "test" } } as never,
    {} as never,
    { parameters: params } as never,
  );
}

describe("LIFE action smoke tests — BRD acceptance criteria", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.checkSenderPrivateAccess.mockResolvedValue(privateAccess);
  });

  // ── AC-1: "I need help brushing my teeth twice a day" ──

  it("AC-1: creates a twice-daily brushing habit via action param", async () => {
    mocks.listGoals.mockResolvedValue([]);
    mocks.createDefinition.mockResolvedValue({
      definition: {
        id: "d1",
        title: "Brush teeth",
        cadence: { kind: "times_per_day", slots: [
          { key: "morning", label: "Morning", minuteOfDay: 420, durationMinutes: 5 },
          { key: "night", label: "Night", minuteOfDay: 1320, durationMinutes: 5 },
        ]},
      },
      reminderPlan: null,
    });

    const result = await send({
      action: "create",
      intent: "help me brush my teeth twice a day, morning and night",
      title: "Brush teeth",
      details: {
        kind: "habit",
        cadence: { kind: "times_per_day", slots: [
          { key: "morning", label: "Morning", minuteOfDay: 420, durationMinutes: 5 },
          { key: "night", label: "Night", minuteOfDay: 1320, durationMinutes: 5 },
        ]},
        confirmed: true,
      },
    });

    expect(result).toMatchObject({ success: true });
    expect(mocks.createDefinition).toHaveBeenCalledWith(expect.objectContaining({
      title: "Brush teeth",
      kind: "habit",
      cadence: expect.objectContaining({ kind: "times_per_day" }),
    }));
  });

  it("AC-1 fallback: classifier routes brushing request to create_definition", () => {
    expect(classifyIntent("I need help brushing my teeth twice a day")).toBe("create_definition");
  });

  // ── AC-2: Snooze a brushing reminder for 30 minutes ──

  it("AC-2: snoozes via action param with 30m preset", async () => {
    mocks.getOverview.mockResolvedValue({
      owner: { occurrences: [{ id: "occ-1", title: "Brush teeth", state: "visible", domain: "user_lifeops" }] },
      agentOps: { occurrences: [] },
    });
    mocks.snoozeOccurrence.mockResolvedValue({ id: "occ-1", title: "Brush teeth", state: "snoozed" });

    const result = await send({
      action: "snooze",
      intent: "snooze brushing for 30 minutes",
      target: "Brush teeth",
      details: { preset: "30m" },
    });

    expect(result).toMatchObject({ success: true });
    expect(mocks.snoozeOccurrence).toHaveBeenCalledWith("occ-1", { preset: "30m", minutes: undefined });
  });

  // ── AC-3: "Add one push-up and sit-up every day" (progressive) ──

  it("AC-3: creates a progressive daily routine", async () => {
    mocks.listGoals.mockResolvedValue([]);
    mocks.createDefinition.mockResolvedValue({
      definition: { id: "d2", title: "Daily pushups", cadence: { kind: "daily", windows: ["morning"] } },
      reminderPlan: null,
    });

    const result = await send({
      action: "create",
      intent: "add one push-up every day, start at 10 and add one each day",
      title: "Daily pushups",
      details: {
        kind: "routine",
        cadence: { kind: "daily", windows: ["morning"] },
        progressionRule: { kind: "linear_increment", metric: "push-ups", start: 10, step: 1, unit: "reps" },
        confirmed: true,
      },
    });

    expect(result).toMatchObject({ success: true });
    expect(mocks.createDefinition).toHaveBeenCalledWith(expect.objectContaining({
      kind: "routine",
      progressionRule: expect.objectContaining({ kind: "linear_increment", start: 10, step: 1 }),
    }));
  });

  // ── AC-4: "I want to call my mom every week" ──

  it("AC-4: creates an explicitly named weekly goal", async () => {
    mocks.createGoal.mockResolvedValue({
      goal: { id: "g1", title: "Call Mom every week" },
      links: [],
    });

    const result = await send({
      action: "create_goal",
      intent: "Actually create a goal called Call Mom every week",
      title: "Call Mom every week",
      details: {
        cadence: { kind: "weekly" },
        supportStrategy: { approach: "weekly_nudge", message: "Have you called Mom this week?" },
        confirmed: true,
      },
    });

    expect(result).toMatchObject({ success: true, text: expect.stringContaining("Call Mom every week") });
  });

  it("AC-4 fallback: explicit goal phrasing routes to goal creation", () => {
    expect(classifyIntent("my goal is to stay healthy")).toBe("create_goal");
  });

  // ── AC-5: Calendar query ──

  it("AC-5: shows today's calendar events", async () => {
    mocks.getGoogleConnectorStatus.mockResolvedValue({
      connected: true, grantedCapabilities: ["google.calendar.read"],
    });
    mocks.getCalendarFeed.mockResolvedValue({
      calendarId: "primary",
      events: [
        { title: "Team standup", startAt: "2026-04-05T09:00:00Z", endAt: "2026-04-05T09:30:00Z", isAllDay: false, location: "Zoom", attendees: [{ displayName: "Alice" }], conferenceLink: "https://zoom.us/123" },
        { title: "Lunch with Bob", startAt: "2026-04-05T12:00:00Z", endAt: "2026-04-05T13:00:00Z", isAllDay: false, location: "Cafe", attendees: [], conferenceLink: null },
      ],
      source: "synced", timeMin: "", timeMax: "", syncedAt: "2026-04-05T08:00:00Z",
    });

    const result = await send({ action: "calendar", intent: "what's on my calendar today" });

    const text = (result as { text: string }).text;
    expect(text).toContain("Team standup");
    expect(text).toContain("Lunch with Bob");
    expect(text).toContain("Zoom");
    expect(text).toContain("Alice");
  });

  // ── AC-6: Escalation chain ──

  it("AC-6: configures SMS escalation on a reminder", async () => {
    mocks.listDefinitions.mockResolvedValue([
      { definition: { id: "d1", title: "Brush teeth", domain: "user_lifeops" } },
    ]);
    mocks.updateDefinition.mockResolvedValue({ definition: { id: "d1", title: "Brush teeth" } });

    const result = await send({
      action: "escalation",
      intent: "text me if I ignore the brushing reminder, call me if it's urgent",
      target: "Brush teeth",
      details: {
        steps: [
          { channel: "in_app", offsetMinutes: 0, label: "In-app reminder" },
          { channel: "sms", offsetMinutes: 15, label: "SMS if not acknowledged" },
          { channel: "voice", offsetMinutes: 30, label: "Phone call for urgent" },
        ],
      },
    });

    expect(result).toMatchObject({ success: true });
    expect(mocks.updateDefinition).toHaveBeenCalledWith("d1", expect.objectContaining({
      reminderPlan: expect.objectContaining({
        steps: expect.arrayContaining([
          expect.objectContaining({ channel: "sms", offsetMinutes: 15 }),
          expect.objectContaining({ channel: "voice", offsetMinutes: 30 }),
        ]),
      }),
    }));
  });

  // ── AC-7: "Do I have any important emails?" ──

  it("AC-7: shows email triage", async () => {
    mocks.getGoogleConnectorStatus.mockResolvedValue({
      connected: true, grantedCapabilities: ["google.gmail.triage"],
    });
    mocks.getGmailTriage.mockResolvedValue({
      messages: [
        { id: "m1", subject: "Contract review needed", from: "legal@co.com", fromEmail: "legal@co.com", isImportant: true, likelyReplyNeeded: true, receivedAt: "2026-04-05T07:00:00Z", snippet: "Please review the attached contract" },
        { id: "m2", subject: "Lunch plans", from: "friend@mail.com", fromEmail: "friend@mail.com", isImportant: false, likelyReplyNeeded: false, receivedAt: "2026-04-05T06:00:00Z", snippet: "Want to grab lunch?" },
      ],
      source: "synced", syncedAt: "2026-04-05T08:00:00Z",
      summary: { unreadCount: 5, importantNewCount: 2, likelyReplyNeededCount: 1 },
    });

    const result = await send({ action: "email", intent: "do I have any important emails?" });

    const text = (result as { text: string }).text;
    expect(text).toContain("Contract review needed");
    expect(text).toContain("important");
    expect(text).toContain("reply needed");
    expect(text).toContain("5 unread");
  });

  it("AC-7 fallback: classifier routes email query", () => {
    expect(classifyIntent("Do I have anything important I need to respond to?")).toBe("query_email");
  });
});

describe("LIFE action — robustness scenarios", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.checkSenderPrivateAccess.mockResolvedValue(privateAccess);
  });

  it("handles complete → target not found gracefully", async () => {
    mocks.getOverview.mockResolvedValue({ owner: { occurrences: [] }, agentOps: { occurrences: [] } });
    const result = await send({ action: "complete", intent: "mark nonexistent done", target: "nonexistent" });
    expect(result).toMatchObject({ success: false, text: expect.stringContaining("could not find") });
  });

  it("handles create without title gracefully", async () => {
    const result = await send({ action: "create", intent: "add something", details: { cadence: { kind: "daily", windows: ["morning"] }, confirmed: true } });
    expect(result).toMatchObject({ success: false, text: expect.stringContaining("name") });
  });

  it("handles create without cadence gracefully", async () => {
    const result = await send({ action: "create", intent: "add pushups", title: "Pushups" });
    expect(result).toMatchObject({ success: false, text: expect.stringContaining("schedule") });
  });

  it("handles Google not connected for calendar gracefully", async () => {
    mocks.getGoogleConnectorStatus.mockRejectedValue(new Error("not configured"));
    const result = await send({ action: "calendar", intent: "what's on my calendar" });
    expect(result).toMatchObject({ success: false, text: expect.stringContaining("not connected") });
  });

  it("handles phone capture without number gracefully", async () => {
    const result = await send({ action: "phone", intent: "text me reminders" });
    expect(result).toMatchObject({ success: false, text: expect.stringContaining("phone number") });
  });

  it("handles empty intent gracefully", async () => {
    const result = await send({ action: "overview", intent: "" }, "");
    expect(result).toMatchObject({ success: false, text: expect.stringContaining("intent") });
  });

  it("handles missing action + intent (double fallback)", async () => {
    const result = await send({ intent: "asdfghjkl gibberish" });
    expect(result).toMatchObject({ success: false, text: expect.stringContaining("schedule") });
  });

  it("catches LifeOpsServiceError and returns user-friendly message instead of provider issue", async () => {
    mocks.listGoals.mockResolvedValue([]);
    mocks.createDefinition.mockRejectedValue(
      new mocks.LifeOpsServiceError(400, "cadence.kind must be one of: daily, weekly, times_per_day"),
    );

    const result = await send({
      action: "create",
      intent: "Actually create a habit",
      title: "Test habit",
      details: { kind: "habit", cadence: { kind: "invalid" }, confirmed: true },
    });

    expect(result).toMatchObject({ success: false, text: expect.stringContaining("cadence.kind must be") });
  });

  it("succeeds when action param is provided but classifier would disagree", async () => {
    // "review the calendar" would classify as review_goal, but action says "calendar"
    mocks.getGoogleConnectorStatus.mockResolvedValue({ connected: true, grantedCapabilities: ["google.calendar.read"] });
    mocks.getCalendarFeed.mockResolvedValue({
      calendarId: "primary", events: [], source: "cache", timeMin: "", timeMax: "", syncedAt: null,
    });
    const result = await send({ action: "calendar", intent: "review the calendar" });
    expect(result).toMatchObject({ success: true, text: expect.stringContaining("No events") });
    // Proves action param overrides classifier
    expect(mocks.reviewGoal).not.toHaveBeenCalled();
  });
});
