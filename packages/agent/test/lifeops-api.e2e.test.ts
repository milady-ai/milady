import crypto from "node:crypto";
import type { AgentRuntime, Task, UUID } from "@elizaos/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { req } from "../../../test/helpers/http";

import { startApiServer } from "../src/api/server";
import { DatabaseSync } from "../src/test-utils/sqlite-compat";

type SqlQuery = {
  queryChunks?: Array<{ value?: unknown }>;
};

function extractSqlText(query: SqlQuery): string {
  if (!Array.isArray(query.queryChunks)) return "";
  return query.queryChunks
    .map((chunk) => {
      const value = chunk?.value;
      if (Array.isArray(value)) return value.join("");
      return String(value ?? "");
    })
    .join("");
}

function createRuntimeForLifeOpsApiTests(): AgentRuntime {
  const sqlite = new DatabaseSync(":memory:");
  let tasks: Task[] = [];
  const runtimeSubset = {
    agentId: "lifeops-api-agent",
    character: { name: "LifeOpsApiAgent" } as AgentRuntime["character"],
    getSetting: () => undefined,
    getService: () => null,
    getRoomsByWorld: async () => [],
    getTasks: async (query?: { tags?: string[] }) => {
      if (!query?.tags || query.tags.length === 0) return tasks;
      return tasks.filter((task) =>
        query.tags?.every((tag) => task.tags?.includes(tag)),
      );
    },
    getTask: async (taskId: UUID) =>
      tasks.find((task) => task.id === taskId) ?? null,
    createTask: async (task: Task) => {
      const id = (task.id as UUID | undefined) ?? (crypto.randomUUID() as UUID);
      tasks.push({ ...task, id });
      return id;
    },
    updateTask: async (taskId: UUID, update: Partial<Task>) => {
      tasks = tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              ...update,
              metadata: {
                ...((task.metadata as Record<string, unknown> | undefined) ??
                  {}),
                ...((update.metadata as Record<string, unknown> | undefined) ??
                  {}),
              } as Task["metadata"],
            }
          : task,
      );
    },
    deleteTask: async (taskId: UUID) => {
      tasks = tasks.filter((task) => task.id !== taskId);
    },
    adapter: {
      db: {
        execute: async (query: SqlQuery) => {
          const sql = extractSqlText(query).trim();
          if (sql.length === 0) return [];
          if (/^(select|pragma)\b/i.test(sql)) {
            return sqlite.prepare(sql).all() as Array<Record<string, unknown>>;
          }
          sqlite.exec(sql);
          return [];
        },
      },
    },
  };

  return runtimeSubset as unknown as AgentRuntime;
}

describe("Life-ops API E2E", () => {
  describe("without runtime", () => {
    let port: number;
    let close: () => Promise<void>;

    beforeAll(async () => {
      const server = await startApiServer({ port: 0 });
      port = server.port;
      close = server.close;
    });

    afterAll(async () => {
      await close();
    });

    it("returns 503 for overview and definition writes", async () => {
      const overview = await req(port, "GET", "/api/lifeops/overview");
      expect(overview.status).toBe(503);

      const create = await req(port, "POST", "/api/lifeops/definitions", {
        kind: "habit",
        title: "Test",
        cadence: { kind: "daily", windows: ["morning"] },
      });
      expect(create.status).toBe(503);
    });
  });

  describe("with runtime", () => {
    let port: number;
    let close: () => Promise<void>;

    beforeAll(async () => {
      const server = await startApiServer({
        port: 0,
        runtime: createRuntimeForLifeOpsApiTests(),
      });
      port = server.port;
      close = server.close;
    });

    afterAll(async () => {
      await close();
    });

    it("supports creating, reading, snoozing, and completing life-ops items", async () => {
      const now = new Date();
      const minuteOfDay = now.getUTCHours() * 60 + now.getUTCMinutes();

      const goalCreate = await req(port, "POST", "/api/lifeops/goals", {
        title: "Stay on top of personal ops",
        description: "Keep recurring responsibilities visible.",
      });
      expect(goalCreate.status).toBe(201);
      const goal = goalCreate.data.goal as Record<string, unknown>;
      const goalId = goal.id as string;
      expect(goal.domain).toBe("user_lifeops");
      expect(goal.subjectType).toBe("owner");

      const definitionCreate = await req(
        port,
        "POST",
        "/api/lifeops/definitions",
        {
          kind: "routine",
          title: "Current slot check-in",
          timezone: "UTC",
          goalId,
          cadence: {
            kind: "times_per_day",
            slots: [
              // Keep this fixture single-slot so the due occurrence set stays
              // stable near UTC midnight; wrapped "later" slots make the
              // perfect-day streak assertion flaky.
              {
                key: "current",
                label: "Current",
                minuteOfDay,
                durationMinutes: 20,
              },
            ],
          },
        },
      );
      expect(definitionCreate.status).toBe(201);
      const definition = definitionCreate.data.definition as Record<
        string,
        unknown
      >;
      const definitionId = definition.id as string;
      expect(definition.domain).toBe("user_lifeops");
      expect(definition.subjectType).toBe("owner");
      expect(
        (definitionCreate.data.reminderPlan as Record<string, unknown>).id,
      ).toBeTruthy();

      const listDefinitions = await req(
        port,
        "GET",
        "/api/lifeops/definitions",
      );
      expect(listDefinitions.status).toBe(200);
      expect(
        (
          listDefinitions.data.definitions as Array<Record<string, unknown>>
        ).some(
          (entry) =>
            (entry.definition as Record<string, unknown>).id === definitionId,
        ),
      ).toBe(true);

      const overview = await req(port, "GET", "/api/lifeops/overview");
      expect(overview.status).toBe(200);
      expect(Array.isArray(overview.data.occurrences)).toBe(true);
      expect(Array.isArray(overview.data.goals)).toBe(true);
      expect(Array.isArray(overview.data.reminders)).toBe(true);
      expect(Array.isArray(overview.data.owner?.occurrences)).toBe(true);
      expect(Array.isArray(overview.data.agentOps?.occurrences)).toBe(true);
      expect((overview.data.agentOps?.occurrences as unknown[]) ?? []).toHaveLength(
        0,
      );
      const currentOccurrence = (
        overview.data.occurrences as Array<Record<string, unknown>>
      ).find(
        (occurrence) =>
          occurrence.definitionId === definitionId &&
          occurrence.state === "visible",
      );
      expect(currentOccurrence).toBeDefined();

      const workbenchOverview = await req(
        port,
        "GET",
        "/api/workbench/overview",
      );
      expect(workbenchOverview.status).toBe(200);
      expect(workbenchOverview.data.lifeopsAvailable).toBe(true);
      expect(typeof workbenchOverview.data.lifeops).toBe("object");
      expect(Array.isArray(workbenchOverview.data.lifeops.owner?.occurrences)).toBe(
        true,
      );
      expect(Array.isArray(workbenchOverview.data.lifeops.agentOps?.occurrences)).toBe(
        true,
      );

      const snooze = await req(
        port,
        "POST",
        `/api/lifeops/occurrences/${encodeURIComponent(currentOccurrence!.id as string)}/snooze`,
        { minutes: 30 },
      );
      expect(snooze.status).toBe(200);
      expect((snooze.data.occurrence as Record<string, unknown>).state).toBe(
        "snoozed",
      );

      const complete = await req(
        port,
        "POST",
        `/api/lifeops/occurrences/${encodeURIComponent(currentOccurrence!.id as string)}/complete`,
        { note: "finished" },
      );
      expect(complete.status).toBe(200);
      expect((complete.data.occurrence as Record<string, unknown>).state).toBe(
        "completed",
      );

      const definitionRead = await req(
        port,
        "GET",
        `/api/lifeops/definitions/${encodeURIComponent(definitionId)}`,
      );
      expect(definitionRead.status).toBe(200);
      const performance = definitionRead.data.performance as Record<
        string,
        unknown
      >;
      expect(performance.totalCompletedCount).toBe(1);
      expect(performance.currentOccurrenceStreak).toBe(1);
      expect(performance.bestOccurrenceStreak).toBeGreaterThanOrEqual(1);
      expect(performance.currentPerfectDayStreak).toBe(1);
      expect(performance.bestPerfectDayStreak).toBeGreaterThanOrEqual(1);
      expect(performance.lastCompletedAt).toEqual(expect.any(String));
      const last7Days = performance.last7Days as Record<string, unknown>;
      expect(last7Days.completedCount).toBeGreaterThanOrEqual(1);
      expect(last7Days.perfectDayCount).toBeGreaterThanOrEqual(1);
      expect(last7Days.scheduledCount).toBeGreaterThanOrEqual(
        Number(last7Days.completedCount),
      );
      expect(
        Number(last7Days.completedCount) +
          Number(last7Days.skippedCount) +
          Number(last7Days.pendingCount),
      ).toBe(Number(last7Days.scheduledCount));

      const occurrenceExplanation = await req(
        port,
        "GET",
        `/api/lifeops/occurrences/${encodeURIComponent(currentOccurrence!.id as string)}/explanation`,
      );
      expect(occurrenceExplanation.status).toBe(200);
      expect(
        (occurrenceExplanation.data.definition as Record<string, unknown>).id,
      ).toBe(definitionId);
      expect(
        (
          occurrenceExplanation.data.summary as Record<string, unknown>
        ).originalIntent,
      ).toBe("Current slot check-in");
      expect(
        String(
          (occurrenceExplanation.data.summary as Record<string, unknown>)
            .lastActionSummary,
        ),
      ).toContain("occurrence completed");
      const explanationPerformance = occurrenceExplanation.data
        .definitionPerformance as Record<string, unknown>;
      expect(explanationPerformance.totalCompletedCount).toBe(1);
      expect(
        (explanationPerformance.last7Days as Record<string, unknown>)
          .completedCount,
      ).toBeGreaterThanOrEqual(1);

      const goalReview = await req(
        port,
        "GET",
        `/api/lifeops/goals/${encodeURIComponent(goalId)}/review`,
      );
      expect(goalReview.status).toBe(200);
      expect(
        (goalReview.data.summary as Record<string, unknown>).linkedDefinitionCount,
      ).toBe(1);
      expect(
        (goalReview.data.summary as Record<string, unknown>).completedLast7Days,
      ).toBeGreaterThanOrEqual(1);
      expect(
        (goalReview.data.goal as Record<string, unknown>).reviewState,
      ).toBe("on_track");
      expect(
        Array.isArray(goalReview.data.suggestions as unknown[]),
      ).toBe(true);

      const goalRead = await req(
        port,
        "GET",
        `/api/lifeops/goals/${encodeURIComponent(goalId)}`,
      );
      expect(goalRead.status).toBe(200);
      expect(Array.isArray(goalRead.data.links)).toBe(true);
      expect(
        (goalRead.data.links as Array<Record<string, unknown>>).length,
      ).toBe(1);
      expect(
        (goalRead.data.links as Array<Record<string, unknown>>)[0]?.linkedId,
      ).toBe(definitionId);
    });

    it("applies reminder preferences through the API and reminder processor", async () => {
      const now = new Date();
      const minuteOfDay = Math.max(
        0,
        now.getUTCHours() * 60 + now.getUTCMinutes() - 70,
      );

      const definitionCreate = await req(
        port,
        "POST",
        "/api/lifeops/definitions",
        {
          kind: "habit",
          title: "Drink water",
          timezone: "UTC",
          cadence: {
            kind: "times_per_day",
            slots: [
              {
                key: "soon",
                label: "Soon",
                minuteOfDay,
                durationMinutes: 180,
              },
            ],
          },
          reminderPlan: {
            steps: [
              {
                channel: "in_app",
                offsetMinutes: 0,
                label: "first",
              },
              {
                channel: "in_app",
                offsetMinutes: 30,
                label: "second",
              },
            ],
          },
        },
      );
      expect(definitionCreate.status).toBe(201);
      const definitionId = String(
        (definitionCreate.data.definition as Record<string, unknown>).id,
      );

      const preferenceSet = await req(
        port,
        "POST",
        "/api/lifeops/reminder-preferences",
        {
          definitionId,
          intensity: "low",
          note: "send fewer reminders for water",
        },
      );
      expect(preferenceSet.status).toBe(201);
      expect(
        (preferenceSet.data.effective as Record<string, unknown>).intensity,
      ).toBe("minimal");

      const preferenceRead = await req(
        port,
        "GET",
        `/api/lifeops/reminder-preferences?definitionId=${encodeURIComponent(definitionId)}`,
      );
      expect(preferenceRead.status).toBe(200);
      expect(
        (preferenceRead.data.effective as Record<string, unknown>).intensity,
      ).toBe("minimal");
      expect(
        (preferenceRead.data.definition as Record<string, unknown>).source,
      ).toBe("definition_metadata");

      const process = await req(port, "POST", "/api/lifeops/reminders/process", {
        now: now.toISOString(),
      });
      expect(process.status).toBe(200);
      expect(
        Array.isArray(process.data.attempts as unknown[]),
      ).toBe(true);
      expect((process.data.attempts as Array<unknown>).length).toBe(1);

      const overview = await req(port, "GET", "/api/lifeops/overview");
      expect(overview.status).toBe(200);
      const reminderTitles = (overview.data.reminders as Array<Record<string, unknown>>)
        .filter((reminder) => reminder.definitionId === definitionId)
        .map((reminder) => reminder.stepLabel);
      expect(reminderTitles).toEqual(["first"]);
    });

    it("normalizes channel policies and updates them in place across consent and manual policy writes", async () => {
      const consent = await req(
        port,
        "POST",
        "/api/lifeops/channels/phone-consent",
        {
          phoneNumber: "415-555-0123",
          consentGiven: true,
          allowSms: true,
          allowVoice: true,
          metadata: {
            source: "settings",
            capturePhase: "initial",
          },
        },
      );
      expect(consent.status).toBe(201);
      expect(consent.data.phoneNumber).toBe("+14155550123");
      expect(consent.data.policies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            channelType: "sms",
            channelRef: "+14155550123",
            allowReminders: true,
            allowEscalation: true,
            metadata: expect.objectContaining({
              source: "settings",
              capturePhase: "initial",
              phoneNumber: "+14155550123",
              smsAllowed: true,
              voiceAllowed: true,
            }),
          }),
          expect.objectContaining({
            channelType: "voice",
            channelRef: "+14155550123",
            allowReminders: true,
            allowEscalation: true,
            metadata: expect.objectContaining({
              source: "settings",
              capturePhase: "initial",
              phoneNumber: "+14155550123",
              smsAllowed: true,
              voiceAllowed: true,
            }),
          }),
        ]),
      );

      const update = await req(port, "POST", "/api/lifeops/channel-policies", {
        channelType: "sms",
        channelRef: "415-555-0123",
        privacyClass: "private",
        allowReminders: false,
        allowEscalation: false,
        requireConfirmationForActions: false,
        metadata: {
          updatedBy: "api-test",
          reminderMode: "paused",
        },
      });
      expect(update.status).toBe(201);
      expect(update.data.policy).toMatchObject({
        channelType: "sms",
        channelRef: "+14155550123",
        allowReminders: false,
        allowEscalation: false,
        requireConfirmationForActions: false,
        metadata: expect.objectContaining({
          source: "settings",
          capturePhase: "initial",
          phoneNumber: "+14155550123",
          updatedBy: "api-test",
          reminderMode: "paused",
        }),
      });

      const listed = await req(port, "GET", "/api/lifeops/channel-policies");
      expect(listed.status).toBe(200);
      const matchingPolicies = (
        listed.data.policies as Array<Record<string, unknown>>
      ).filter((policy) => policy.channelRef === "+14155550123");
      expect(matchingPolicies).toHaveLength(2);
      expect(matchingPolicies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            channelType: "sms",
            allowReminders: false,
            allowEscalation: false,
            metadata: expect.objectContaining({
              source: "settings",
              capturePhase: "initial",
              updatedBy: "api-test",
              reminderMode: "paused",
            }),
          }),
          expect.objectContaining({
            channelType: "voice",
            allowReminders: true,
            allowEscalation: true,
            metadata: expect.objectContaining({
              source: "settings",
              capturePhase: "initial",
              smsAllowed: true,
              voiceAllowed: true,
            }),
          }),
        ]),
      );
    });

    it("captures and lists activity signals with filtering and validation", async () => {
      const activeAt = "2026-04-06T15:58:00.000Z";
      const backgroundAt = "2026-04-06T15:59:00.000Z";
      const mobileAt = "2026-04-06T16:00:00.000Z";

      const active = await req(port, "POST", "/api/lifeops/activity-signals", {
        source: "app_lifecycle",
        platform: "web_app",
        state: "active",
        observedAt: activeAt,
        metadata: {
          reason: "qa-active",
        },
      });
      expect(active.status).toBe(201);
      expect(active.data.signal).toMatchObject({
        source: "app_lifecycle",
        platform: "web_app",
        state: "active",
        observedAt: activeAt,
        metadata: {
          reason: "qa-active",
        },
      });

      const background = await req(
        port,
        "POST",
        "/api/lifeops/activity-signals",
        {
          source: "page_visibility",
          platform: "web_app",
          state: "background",
          observedAt: backgroundAt,
          metadata: {
            reason: "qa-background",
          },
        },
      );
      expect(background.status).toBe(201);

      const mobile = await req(port, "POST", "/api/lifeops/activity-signals", {
        source: "mobile_device",
        platform: "ios",
        state: "locked",
        observedAt: mobileAt,
        idleState: "locked",
        onBattery: true,
        metadata: {
          reason: "qa-mobile",
        },
      });
      expect(mobile.status).toBe(201);
      expect(mobile.data.signal).toMatchObject({
        source: "mobile_device",
        platform: "ios",
        state: "locked",
        observedAt: mobileAt,
        metadata: {
          reason: "qa-mobile",
        },
      });

      const listed = await req(
        port,
        "GET",
        `/api/lifeops/activity-signals?state=active&sinceAt=${encodeURIComponent("2026-04-06T15:57:00.000Z")}`,
      );
      expect(listed.status).toBe(200);
      expect(listed.data.signals).toEqual([
        expect.objectContaining({
          source: "app_lifecycle",
          state: "active",
          observedAt: activeAt,
        }),
      ]);

      const limited = await req(
        port,
        "GET",
        "/api/lifeops/activity-signals?limit=1",
      );
      expect(limited.status).toBe(200);
      expect(limited.data.signals).toHaveLength(1);
      expect(limited.data.signals[0]).toMatchObject({
        state: "locked",
        observedAt: mobileAt,
      });

      const invalidState = await req(
        port,
        "GET",
        "/api/lifeops/activity-signals?state=awake",
      );
      expect(invalidState.status).toBe(400);
      expect(invalidState.data.error).toContain("state must be one of");

      const invalidLimit = await req(
        port,
        "GET",
        "/api/lifeops/activity-signals?limit=0",
      );
      expect(invalidLimit.status).toBe(400);
      expect(invalidLimit.data.error).toContain("limit must be a positive integer");
    });

    it("separates owner lifeops from agent ops", async () => {
      const now = new Date();
      const minuteOfDay = now.getUTCHours() * 60 + now.getUTCMinutes();

      const agentGoalCreate = await req(port, "POST", "/api/lifeops/goals", {
        title: "Keep the bridge healthy",
        description: "Track agent-private operational goals.",
        ownership: {
          domain: "agent_ops",
          subjectType: "agent",
        },
      });
      expect(agentGoalCreate.status).toBe(201);
      const agentGoal = agentGoalCreate.data.goal as Record<string, unknown>;
      expect(agentGoal.domain).toBe("agent_ops");
      expect(agentGoal.subjectType).toBe("agent");
      expect(agentGoal.visibilityScope).toBe("agent_and_admin");
      expect(agentGoal.contextPolicy).toBe("never");

      const agentDefinitionCreate = await req(
        port,
        "POST",
        "/api/lifeops/definitions",
        {
          kind: "routine",
          title: "Review bridge health",
          description: "Internal agent operations checklist.",
          timezone: "UTC",
          ownership: {
            domain: "agent_ops",
            subjectType: "agent",
          },
          cadence: {
            kind: "times_per_day",
            slots: [
              {
                key: "current",
                label: "Current",
                minuteOfDay,
                durationMinutes: 20,
              },
            ],
          },
        },
      );
      expect(agentDefinitionCreate.status).toBe(201);
      const agentDefinition = agentDefinitionCreate.data.definition as Record<
        string,
        unknown
      >;
      const agentDefinitionId = agentDefinition.id as string;
      expect(agentDefinition.domain).toBe("agent_ops");
      expect(agentDefinition.subjectType).toBe("agent");
      expect(agentDefinition.visibilityScope).toBe("agent_and_admin");
      expect(agentDefinition.contextPolicy).toBe("never");

      const overview = await req(port, "GET", "/api/lifeops/overview");
      expect(overview.status).toBe(200);
      const agentOccurrence = (
        overview.data.agentOps?.occurrences as Array<Record<string, unknown>>
      ).find((occurrence) => occurrence.definitionId === agentDefinitionId);
      expect(agentOccurrence).toBeDefined();
      expect(agentOccurrence?.subjectType).toBe("agent");
      expect(
        (overview.data.occurrences as Array<Record<string, unknown>>).some(
          (occurrence) => occurrence.id === agentOccurrence?.id,
        ),
      ).toBe(false);
      expect(
        (overview.data.goals as Array<Record<string, unknown>>).some(
          (goal) => goal.id === agentGoal.id,
        ),
      ).toBe(false);
      expect(
        (
          overview.data.agentOps?.occurrences as Array<Record<string, unknown>>
        ).some((occurrence) => occurrence.id === agentOccurrence?.id),
      ).toBe(true);
      expect(
        (overview.data.agentOps?.goals as Array<Record<string, unknown>>).some(
          (goal) => goal.id === agentGoal.id,
        ),
      ).toBe(true);

      const workbenchOverview = await req(
        port,
        "GET",
        "/api/workbench/overview",
      );
      expect(workbenchOverview.status).toBe(200);
      expect(
        (
          workbenchOverview.data.lifeops.agentOps.occurrences as Array<
            Record<string, unknown>
          >
        ).some((occurrence) => occurrence.id === agentOccurrence?.id),
      ).toBe(true);
      expect(
        (
          workbenchOverview.data.lifeops.agentOps.goals as Array<
            Record<string, unknown>
          >
        ).some((goal) => goal.id === agentGoal.id),
      ).toBe(true);
      expect(
        (workbenchOverview.data.todos as Array<Record<string, unknown>>).some(
          (todo) => todo.name === "Review bridge health",
        ),
      ).toBe(false);
    });

    it("rejects invalid reminder-processing, phone-consent, channel-policy, and gmail needs-response inputs", async () => {
      const missingConsent = await req(
        port,
        "POST",
        "/api/lifeops/channels/phone-consent",
        {
          phoneNumber: "415-555-0999",
          consentGiven: false,
          allowSms: true,
          allowVoice: false,
        },
      );
      expect(missingConsent.status).toBe(400);
      expect(String(missingConsent.data.error)).toContain("Explicit consent");

      const invalidConsentPhone = await req(
        port,
        "POST",
        "/api/lifeops/channels/phone-consent",
        {
          phoneNumber: "not a phone number",
          consentGiven: true,
          allowSms: true,
          allowVoice: false,
        },
      );
      expect(invalidConsentPhone.status).toBe(400);
      expect(String(invalidConsentPhone.data.error)).toContain(
        "phoneNumber must be a valid phone number",
      );

      const invalidPolicyPhone = await req(
        port,
        "POST",
        "/api/lifeops/channel-policies",
        {
          channelType: "sms",
          channelRef: "still not a phone number",
          allowReminders: true,
        },
      );
      expect(invalidPolicyPhone.status).toBe(400);
      expect(String(invalidPolicyPhone.data.error)).toContain(
        "channelRef must be a valid phone number",
      );

      const invalidNeedsResponseMode = await req(
        port,
        "GET",
        "/api/lifeops/gmail/needs-response?mode=desktop",
      );
      expect(invalidNeedsResponseMode.status).toBe(400);
      expect(String(invalidNeedsResponseMode.data.error)).toContain(
        "mode must be one of: local, remote, cloud_managed",
      );

      const invalidNeedsResponseSide = await req(
        port,
        "GET",
        "/api/lifeops/gmail/needs-response?side=team",
      );
      expect(invalidNeedsResponseSide.status).toBe(400);
      expect(String(invalidNeedsResponseSide.data.error)).toContain(
        "side must be one of: owner, agent",
      );

      const invalidNeedsResponseForceSync = await req(
        port,
        "GET",
        "/api/lifeops/gmail/needs-response?forceSync=maybe",
      );
      expect(invalidNeedsResponseForceSync.status).toBe(400);
      expect(String(invalidNeedsResponseForceSync.data.error)).toContain(
        "forceSync must be a boolean",
      );

      const invalidNeedsResponseMaxResults = await req(
        port,
        "GET",
        "/api/lifeops/gmail/needs-response?maxResults=0",
      );
      expect(invalidNeedsResponseMaxResults.status).toBe(400);
      expect(String(invalidNeedsResponseMaxResults.data.error)).toContain(
        "maxResults must be between 1 and 50",
      );

      const invalidReminderNow = await req(
        port,
        "POST",
        "/api/lifeops/reminders/process",
        {
          now: "not-a-date",
        },
      );
      expect(invalidReminderNow.status).toBe(400);
      expect(String(invalidReminderNow.data.error)).toContain(
        "now must be a valid ISO datetime",
      );

      const invalidReminderLimit = await req(
        port,
        "POST",
        "/api/lifeops/reminders/process",
        {
          limit: 0,
        },
      );
      expect(invalidReminderLimit.status).toBe(400);
      expect(String(invalidReminderLimit.data.error)).toContain(
        "limit must be greater than zero",
      );
    });

    it("rejects invalid query parameters, calendar ranges, and malformed path ids", async () => {
      const invalidMode = await req(
        port,
        "GET",
        "/api/lifeops/connectors/google/status?mode=desktop",
      );
      expect(invalidMode.status).toBe(400);
      expect(String(invalidMode.data.error)).toContain(
        "mode must be one of: local, remote",
      );

      const invalidForceSync = await req(
        port,
        "GET",
        "/api/lifeops/calendar/feed?forceSync=sometimes",
      );
      expect(invalidForceSync.status).toBe(400);
      expect(String(invalidForceSync.data.error)).toContain(
        "forceSync must be a boolean",
      );

      const partialCalendarWindow = await req(
        port,
        "GET",
        "/api/lifeops/calendar/feed?timeMin=2026-04-04T00%3A00%3A00.000Z",
      );
      expect(partialCalendarWindow.status).toBe(400);
      expect(String(partialCalendarWindow.data.error)).toContain(
        "timeMin and timeMax must be provided together",
      );

      const invertedCalendarWindow = await req(
        port,
        "GET",
        "/api/lifeops/calendar/feed?timeMin=2026-04-04T10%3A00%3A00.000Z&timeMax=2026-04-04T09%3A00%3A00.000Z",
      );
      expect(invertedCalendarWindow.status).toBe(400);
      expect(String(invertedCalendarWindow.data.error)).toContain(
        "timeMax must be later than timeMin",
      );

      const invalidMaxResults = await req(
        port,
        "GET",
        "/api/lifeops/gmail/triage?maxResults=0",
      );
      expect(invalidMaxResults.status).toBe(400);
      expect(String(invalidMaxResults.data.error)).toContain(
        "maxResults must be between 1 and 50",
      );

      const invalidInspectionOwner = await req(
        port,
        "GET",
        "/api/lifeops/reminders/inspection?ownerType=definition&ownerId=test-owner",
      );
      expect(invalidInspectionOwner.status).toBe(400);
      expect(String(invalidInspectionOwner.data.error)).toContain(
        "ownerType must be occurrence or calendar_event",
      );

      const missingInspectionOwnerId = await req(
        port,
        "GET",
        "/api/lifeops/reminders/inspection?ownerType=occurrence",
      );
      expect(missingInspectionOwnerId.status).toBe(400);
      expect(String(missingInspectionOwnerId.data.error)).toContain(
        "ownerId is required",
      );

      const malformedDefinitionId = await req(
        port,
        "GET",
        "/api/lifeops/definitions/%E0%A4%A",
      );
      expect(malformedDefinitionId.status).toBe(400);
      expect(String(malformedDefinitionId.data.error)).toContain(
        "Invalid definition id: malformed URL encoding",
      );

      const invalidDefinitionTimezone = await req(
        port,
        "POST",
        "/api/lifeops/definitions",
        {
          kind: "task",
          title: "Broken timezone task",
          timezone: "Mars/Olympus",
          cadence: {
            kind: "once",
            dueAt: "2026-04-05T10:00:00.000Z",
          },
        },
      );
      expect(invalidDefinitionTimezone.status).toBe(400);
      expect(String(invalidDefinitionTimezone.data.error)).toContain(
        "timezone must be a valid IANA time zone",
      );

      const invalidWindowPolicy = await req(
        port,
        "POST",
        "/api/lifeops/definitions",
        {
          kind: "task",
          title: "Broken windows task",
          timezone: "UTC",
          cadence: {
            kind: "daily",
            windows: ["custom"],
          },
          windowPolicy: {
            timezone: "UTC",
            windows: [
              {
                name: "custom",
                label: "Broken",
                startMinute: 600,
                endMinute: 500,
              },
            ],
          },
        },
      );
      expect(invalidWindowPolicy.status).toBe(400);
      expect(String(invalidWindowPolicy.data.error)).toContain(
        "windowPolicy.windows[0].endMinute must be greater than startMinute",
      );

      const invalidQuietHours = await req(
        port,
        "POST",
        "/api/lifeops/definitions",
        {
          kind: "task",
          title: "Broken quiet hours task",
          timezone: "UTC",
          cadence: {
            kind: "once",
            dueAt: "2026-04-05T10:00:00.000Z",
          },
          reminderPlan: {
            steps: [
              {
                channel: "sms",
                offsetMinutes: 0,
                label: "SMS",
              },
            ],
            quietHours: {
              timezone: "UTC",
              startMinute: 0,
              endMinute: 60,
              channels: ["pager"],
            },
          },
        },
      );
      expect(invalidQuietHours.status).toBe(400);
      expect(String(invalidQuietHours.data.error)).toContain(
        "reminderPlan.quietHours.channels[0] must be one of",
      );

      const invalidCalendarEventTimezone = await req(
        port,
        "POST",
        "/api/lifeops/calendar/events",
        {
          title: "Bad calendar event",
          startAt: "2026-04-05T10:00:00.000Z",
          endAt: "2026-04-05T11:00:00.000Z",
          timeZone: "Moon/Base",
        },
      );
      expect(invalidCalendarEventTimezone.status).toBe(400);
      expect(String(invalidCalendarEventTimezone.data.error)).toContain(
        "timeZone must be a valid IANA time zone",
      );

      const invalidWorkflowTimezone = await req(
        port,
        "POST",
        "/api/lifeops/workflows",
        {
          title: "Broken schedule workflow",
          triggerType: "schedule",
          schedule: {
            kind: "cron",
            cronExpression: "not-a-cron",
            timezone: "UTC",
          },
          actionPlan: {
            steps: [
              {
                kind: "summarize",
                id: "summary-step",
                prompt: "Summarize today",
              },
            ],
          },
        },
      );
      expect(invalidWorkflowTimezone.status).toBe(400);
      expect(String(invalidWorkflowTimezone.data.error)).toContain(
        "schedule.cronExpression must be a valid 5-field cron expression",
      );

      const invalidWorkflowScheduleTimezone = await req(
        port,
        "POST",
        "/api/lifeops/workflows",
        {
          title: "Broken timezone workflow",
          triggerType: "schedule",
          schedule: {
            kind: "interval",
            everyMinutes: 30,
            timezone: "Invalid/Timezone",
          },
          actionPlan: {
            steps: [
              {
                kind: "summarize",
                id: "summary-step",
                prompt: "Summarize today",
              },
            ],
          },
        },
      );
      expect(invalidWorkflowScheduleTimezone.status).toBe(400);
      expect(String(invalidWorkflowScheduleTimezone.data.error)).toContain(
        "schedule.timezone must be a valid IANA time zone",
      );
    });
  });
});
