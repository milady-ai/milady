import crypto from "node:crypto";
import type { AgentRuntime, Task, UUID } from "@elizaos/core";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { startApiServer } from "../src/api/server";
import { LifeOpsRepository } from "../src/lifeops/repository";
import { DatabaseSync } from "../src/test-utils/sqlite-compat";
import { req } from "../../../test/helpers/http";
import { saveEnv } from "../../../test/helpers/test-utils";

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

function createRuntimeForReminderTests(): AgentRuntime {
  const sqlite = new DatabaseSync(":memory:");
  let tasks: Task[] = [];
  const runtimeSubset = {
    agentId: "lifeops-reminders-agent",
    character: { name: "LifeOpsRemindersAgent" } as AgentRuntime["character"],
    sendMessageToTarget: vi.fn().mockResolvedValue(undefined),
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

describe("life-ops reminder processing", () => {
  let port = 0;
  let closeServer: (() => Promise<void>) | null = null;
  let envBackup: { restore: () => void };
  let runtime: AgentRuntime;
  const fetchMock = vi.fn<typeof fetch>();

  beforeAll(async () => {
    envBackup = saveEnv(
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_PHONE_NUMBER",
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
  }, 60_000);

  afterEach(async () => {
    if (closeServer) {
      await closeServer();
      closeServer = null;
    }
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    envBackup.restore();
  });

  beforeEach(async () => {
    fetchMock.mockReset();
    process.env.TWILIO_ACCOUNT_SID = "AC123456789";
    process.env.TWILIO_AUTH_TOKEN = "twilio-auth-token";
    process.env.TWILIO_PHONE_NUMBER = "+14155550199";
    runtime = createRuntimeForReminderTests();
    const server = await startApiServer({
      port: 0,
      runtime,
    });
    port = server.port;
    closeServer = server.close;
    fetchMock.mockReset();
  });

  it("serializes concurrent reminder processing so the same SMS step is delivered once", async () => {
    const consentRes = await req(
      port,
      "POST",
      "/api/lifeops/channels/phone-consent",
      {
        phoneNumber: "415-555-0101",
        consentGiven: true,
        allowSms: true,
        allowVoice: false,
      },
    );
    expect(consentRes.status).toBe(201);

    const definitionRes = await req(port, "POST", "/api/lifeops/definitions", {
      kind: "task",
      title: "Reply to the venue",
      timezone: "UTC",
      priority: 1,
      cadence: {
        kind: "once",
        dueAt: "2026-04-04T16:00:00.000Z",
        visibilityLeadMinutes: 0,
        visibilityLagMinutes: 180,
      },
      reminderPlan: {
        steps: [
          {
            channel: "sms",
            offsetMinutes: 0,
            label: "SMS now",
          },
        ],
      },
    });
    expect(definitionRes.status).toBe(201);

    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      expect(url).toContain(
        "https://api.twilio.com/2010-04-01/Accounts/AC123456789/Messages.json",
      );
      const body = new URLSearchParams(String(init?.body ?? ""));
      expect(body.get("To")).toBe("+14155550101");
      expect(body.get("From")).toBe("+14155550199");
      expect(body.get("Body")).toContain("Reply to the venue");
      await new Promise((resolve) => setTimeout(resolve, 50));
      return new Response(JSON.stringify({ sid: "SM123" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    });

    const [firstProcess, secondProcess] = await Promise.all([
      req(port, "POST", "/api/lifeops/reminders/process", {
        now: "2026-04-04T16:05:00.000Z",
        limit: 10,
      }),
      req(port, "POST", "/api/lifeops/reminders/process", {
        now: "2026-04-04T16:05:00.000Z",
        limit: 10,
      }),
    ]);

    expect(firstProcess.status).toBe(200);
    expect(secondProcess.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const repository = new LifeOpsRepository(runtime);
    const attempts = await repository.listReminderAttempts(
      "lifeops-reminders-agent",
    );
    const smsAttempts = attempts.filter((attempt) => attempt.channel === "sms");
    expect(smsAttempts).toHaveLength(1);
    expect(smsAttempts[0]).toMatchObject({
      channel: "sms",
      outcome: "delivered",
      connectorRef: "twilio:+14155550101",
      scheduledFor: "2026-04-04T16:00:00.000Z",
    });
    expect(smsAttempts[0]?.deliveryMetadata).toMatchObject({
      sid: "SM123",
      status: 201,
      urgency: "critical",
      title: "Reply to the venue",
    });
  });

  it("escalates an unacknowledged reminder onto SMS and resolves the escalation on acknowledgement", async () => {
    const consentRes = await req(
      port,
      "POST",
      "/api/lifeops/channels/phone-consent",
      {
        phoneNumber: "415-555-0102",
        consentGiven: true,
        allowSms: true,
        allowVoice: false,
      },
    );
    expect(consentRes.status).toBe(201);

    const definitionRes = await req(port, "POST", "/api/lifeops/definitions", {
      kind: "habit",
      title: "Brush teeth",
      timezone: "UTC",
      priority: 2,
      cadence: {
        kind: "once",
        dueAt: "2026-04-04T17:00:00.000Z",
        visibilityLeadMinutes: 0,
        visibilityLagMinutes: 240,
      },
      reminderPlan: {
        steps: [
          {
            channel: "in_app",
            offsetMinutes: 0,
            label: "Start in app",
          },
        ],
      },
    });
    expect(definitionRes.status).toBe(201);

    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      expect(url).toContain(
        "https://api.twilio.com/2010-04-01/Accounts/AC123456789/Messages.json",
      );
      const body = new URLSearchParams(String(init?.body ?? ""));
      expect(body.get("To")).toBe("+14155550102");
      expect(body.get("Body")).toContain("Brush teeth");
      return new Response(JSON.stringify({ sid: "SM-ESC-1" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    });

    const initial = await req(port, "POST", "/api/lifeops/reminders/process", {
      now: "2026-04-04T17:00:00.000Z",
      limit: 10,
    });
    expect(initial.status).toBe(200);
    expect(initial.data.attempts).toHaveLength(1);
    expect(initial.data.attempts[0]).toMatchObject({
      channel: "in_app",
      outcome: "delivered",
    });
    expect(fetchMock).not.toHaveBeenCalled();

    const ownerId = String(
      (initial.data.attempts[0] as Record<string, unknown>).ownerId,
    );

    const escalated = await req(port, "POST", "/api/lifeops/reminders/process", {
      now: "2026-04-04T17:21:00.000Z",
      limit: 10,
    });
    expect(escalated.status).toBe(200);
    expect(escalated.data.attempts).toHaveLength(1);
    expect(escalated.data.attempts[0]).toMatchObject({
      ownerId,
      channel: "sms",
      outcome: "delivered",
      connectorRef: "twilio:+14155550102",
      deliveryMetadata: expect.objectContaining({
        lifecycle: "escalation",
        escalationReason: "plan_exhausted_without_acknowledgement",
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const acknowledged = await req(
      port,
      "POST",
      "/api/lifeops/reminders/acknowledge",
      {
        ownerType: "occurrence",
        ownerId,
        acknowledgedAt: "2026-04-04T17:25:00.000Z",
        note: "done",
      },
    );
    expect(acknowledged.status).toBe(200);

    const inspection = await req(
      port,
      "GET",
      `/api/lifeops/reminders/inspection?ownerType=occurrence&ownerId=${encodeURIComponent(
        ownerId,
      )}`,
    );
    expect(inspection.status).toBe(200);
    expect(inspection.data.attempts).toHaveLength(2);
    expect(inspection.data.audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "reminder_escalation_started",
        }),
        expect.objectContaining({
          eventType: "reminder_escalation_resolved",
        }),
      ]),
    );
  });

  it("repeats the last delivered escalation channel after the escalation ladder is exhausted", async () => {
    const consentRes = await req(
      port,
      "POST",
      "/api/lifeops/channels/phone-consent",
      {
        phoneNumber: "415-555-0103",
        consentGiven: true,
        allowSms: true,
        allowVoice: false,
      },
    );
    expect(consentRes.status).toBe(201);

    const definitionRes = await req(port, "POST", "/api/lifeops/definitions", {
      kind: "habit",
      title: "Take medicine",
      timezone: "UTC",
      priority: 1,
      cadence: {
        kind: "once",
        dueAt: "2026-04-04T18:00:00.000Z",
        visibilityLeadMinutes: 0,
        visibilityLagMinutes: 240,
      },
      reminderPlan: {
        steps: [
          {
            channel: "in_app",
            offsetMinutes: 0,
            label: "Start in app",
          },
        ],
      },
    });
    expect(definitionRes.status).toBe(201);

    let smsCallCount = 0;
    fetchMock.mockImplementation(async () => {
      smsCallCount += 1;
      return new Response(JSON.stringify({ sid: `SM-REPEAT-${smsCallCount}` }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    });

    const initial = await req(port, "POST", "/api/lifeops/reminders/process", {
      now: "2026-04-04T18:00:00.000Z",
      limit: 10,
    });
    expect(initial.status).toBe(200);
    expect(initial.data.attempts).toHaveLength(1);
    expect(initial.data.attempts[0]).toMatchObject({
      channel: "in_app",
      outcome: "delivered",
    });

    const firstEscalation = await req(
      port,
      "POST",
      "/api/lifeops/reminders/process",
      {
        now: "2026-04-04T18:05:00.000Z",
        limit: 10,
      },
    );
    expect(firstEscalation.status).toBe(200);
    expect(firstEscalation.data.attempts).toHaveLength(1);
    expect(firstEscalation.data.attempts[0]).toMatchObject({
      channel: "sms",
      outcome: "delivered",
      scheduledFor: "2026-04-04T18:05:00.000Z",
      stepIndex: 1,
    });

    const repeatedEscalation = await req(
      port,
      "POST",
      "/api/lifeops/reminders/process",
      {
        now: "2026-04-04T18:20:00.000Z",
        limit: 10,
      },
    );
    expect(repeatedEscalation.status).toBe(200);
    expect(repeatedEscalation.data.attempts).toHaveLength(1);
    expect(repeatedEscalation.data.attempts[0]).toMatchObject({
      channel: "sms",
      outcome: "delivered",
      scheduledFor: "2026-04-04T18:20:00.000Z",
      stepIndex: 2,
      deliveryMetadata: expect.objectContaining({
        lifecycle: "escalation",
        escalationReason: "previous_escalation_unacknowledged",
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const repository = new LifeOpsRepository(runtime);
    const attempts = await repository.listReminderAttempts(
      "lifeops-reminders-agent",
    );
    const smsAttempts = attempts.filter((attempt) => attempt.channel === "sms");
    expect(smsAttempts).toHaveLength(2);
    expect(smsAttempts.map((attempt) => attempt.scheduledFor)).toEqual([
      "2026-04-04T18:05:00.000Z",
      "2026-04-04T18:20:00.000Z",
    ]);
  });

  it("uses runtime channel policy metadata for escalation without depending on static owner-contact config", async () => {
    const runtimeWithMessaging = runtime as AgentRuntime & {
      createTask: (task: Task) => Promise<UUID>;
      sendMessageToTarget: ReturnType<typeof vi.fn>;
    };
    await runtimeWithMessaging.createTask({
      name: "PROACTIVE_AGENT",
      roomId: crypto.randomUUID() as UUID,
      tags: ["queue", "repeat", "proactive"],
      metadata: {
        proactiveAgent: { kind: "runtime_runner", version: 1 },
        activityProfile: {
          primaryPlatform: "discord",
          secondaryPlatform: null,
          lastSeenPlatform: "discord",
          isCurrentlyActive: true,
        },
      },
      dueAt: Date.now(),
    } as Task);

    const policyRes = await req(port, "POST", "/api/lifeops/channel-policies", {
      channelType: "discord",
      channelRef: "owner-discord",
      privacyClass: "private",
      allowReminders: true,
      allowEscalation: true,
      allowPosts: false,
      requireConfirmationForActions: false,
      metadata: {
        source: "discord",
        entityId: "owner-1",
        channelId: "dm-1",
        isPrimary: true,
      },
    });
    expect(policyRes.status).toBe(201);

    const definitionRes = await req(port, "POST", "/api/lifeops/definitions", {
      kind: "habit",
      title: "Brush teeth",
      timezone: "UTC",
      priority: 1,
      cadence: {
        kind: "once",
        dueAt: "2026-04-04T19:00:00.000Z",
        visibilityLeadMinutes: 0,
        visibilityLagMinutes: 240,
      },
      reminderPlan: {
        steps: [
          {
            channel: "in_app",
            offsetMinutes: 0,
            label: "Start in app",
          },
        ],
      },
    });
    expect(definitionRes.status).toBe(201);

    const initial = await req(port, "POST", "/api/lifeops/reminders/process", {
      now: "2026-04-04T19:00:00.000Z",
      limit: 10,
    });
    expect(initial.status).toBe(200);
    expect(initial.data.attempts).toHaveLength(1);
    expect(initial.data.attempts[0]).toMatchObject({
      channel: "in_app",
      outcome: "delivered",
    });

    const escalated = await req(port, "POST", "/api/lifeops/reminders/process", {
      now: "2026-04-04T19:05:00.000Z",
      limit: 10,
    });
    expect(escalated.status).toBe(200);
    expect(escalated.data.attempts).toHaveLength(1);
    expect(escalated.data.attempts[0]).toMatchObject({
      channel: "discord",
      outcome: "delivered",
      connectorRef: "runtime:discord:dm-1",
      deliveryMetadata: expect.objectContaining({
        lifecycle: "escalation",
        activityPlatform: "discord",
        routeSource: "discord",
        routeEndpoint: "dm-1",
        routeResolution: expect.objectContaining({
          sourceOfTruth: "config",
        }),
      }),
    });
    expect(runtimeWithMessaging.sendMessageToTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "discord",
        entityId: "owner-1",
        channelId: "dm-1",
      }),
      expect.objectContaining({
        source: "discord",
        text: expect.stringContaining("Brush teeth"),
      }),
    );
  });

  it("keeps reminder processing working when activity-profile task reads fail", async () => {
    const unstableRuntime = runtime as AgentRuntime & {
      getTasks: () => Promise<Task[]>;
    };
    unstableRuntime.getTasks = async () => {
      throw new Error("task store unavailable");
    };

    const consentRes = await req(
      port,
      "POST",
      "/api/lifeops/channels/phone-consent",
      {
        phoneNumber: "415-555-0104",
        consentGiven: true,
        allowSms: true,
        allowVoice: false,
      },
    );
    expect(consentRes.status).toBe(201);

    const definitionRes = await req(port, "POST", "/api/lifeops/definitions", {
      kind: "task",
      title: "Reply to Sam",
      timezone: "UTC",
      priority: 1,
      cadence: {
        kind: "once",
        dueAt: "2026-04-04T20:00:00.000Z",
        visibilityLeadMinutes: 0,
        visibilityLagMinutes: 180,
      },
      reminderPlan: {
        steps: [
          {
            channel: "sms",
            offsetMinutes: 0,
            label: "SMS now",
          },
        ],
      },
    });
    expect(definitionRes.status).toBe(201);

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ sid: "SM-FALLBACK-1" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );

    const processRes = await req(port, "POST", "/api/lifeops/reminders/process", {
      now: "2026-04-04T20:00:00.000Z",
      limit: 10,
    });
    expect(processRes.status).toBe(200);
    expect(processRes.data.attempts).toHaveLength(1);
    expect(processRes.data.attempts[0]).toMatchObject({
      channel: "sms",
      outcome: "delivered",
      connectorRef: "twilio:+14155550104",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
