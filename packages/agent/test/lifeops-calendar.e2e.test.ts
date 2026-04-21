import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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
import { resolveOAuthDir } from "../src/config/paths";
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

function createRuntimeForCalendarTests(): AgentRuntime {
  const sqlite = new DatabaseSync(":memory:");
  let tasks: Task[] = [];
  const runtimeSubset = {
    agentId: "lifeops-calendar-agent",
    character: { name: "LifeOpsCalendarAgent" } as AgentRuntime["character"],
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

function buildIdToken(claims: Record<string, unknown>): string {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(claims)}.signature`;
}

describe("life-ops calendar sync", () => {
  let port = 0;
  let closeServer: (() => Promise<void>) | null = null;
  let envBackup: { restore: () => void };
  let stateDir = "";
  let runtime: AgentRuntime;
  const fetchMock = vi.fn<typeof fetch>();

  beforeAll(async () => {
    envBackup = saveEnv(
      "ELIZA_STATE_DIR",
      "MILADY_STATE_DIR",
      "MILADY_GOOGLE_OAUTH_DESKTOP_CLIENT_ID",
      "ELIZA_GOOGLE_OAUTH_DESKTOP_CLIENT_ID",
      "MILADY_GOOGLE_OAUTH_WEB_CLIENT_ID",
      "ELIZA_GOOGLE_OAUTH_WEB_CLIENT_ID",
      "MILADY_GOOGLE_OAUTH_WEB_CLIENT_SECRET",
      "ELIZA_GOOGLE_OAUTH_WEB_CLIENT_SECRET",
      "MILADY_GOOGLE_OAUTH_PUBLIC_BASE_URL",
      "ELIZA_GOOGLE_OAUTH_PUBLIC_BASE_URL",
    );
    stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "lifeops-calendar-"));
    process.env.ELIZA_STATE_DIR = stateDir;
    process.env.MILADY_STATE_DIR = stateDir;
    runtime = createRuntimeForCalendarTests();

    const server = await startApiServer({
      port: 0,
      runtime,
    });
    port = server.port;
    closeServer = server.close;

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
  }, 60_000);

  afterAll(async () => {
    vi.unstubAllGlobals();
    if (closeServer) {
      await closeServer();
    }
    await fs.rm(stateDir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
    envBackup.restore();
  });

  beforeEach(() => {
    fetchMock.mockReset();
    process.env.MILADY_GOOGLE_OAUTH_DESKTOP_CLIENT_ID = "desktop-client-id";
    delete process.env.ELIZA_GOOGLE_OAUTH_DESKTOP_CLIENT_ID;
    delete process.env.MILADY_GOOGLE_OAUTH_WEB_CLIENT_ID;
    delete process.env.ELIZA_GOOGLE_OAUTH_WEB_CLIENT_ID;
    delete process.env.MILADY_GOOGLE_OAUTH_WEB_CLIENT_SECRET;
    delete process.env.ELIZA_GOOGLE_OAUTH_WEB_CLIENT_SECRET;
    delete process.env.MILADY_GOOGLE_OAUTH_PUBLIC_BASE_URL;
    delete process.env.ELIZA_GOOGLE_OAUTH_PUBLIC_BASE_URL;
  });

  afterEach(async () => {
    await fs.rm(path.join(stateDir, "credentials"), {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 50,
    });
    const repository = new LifeOpsRepository(runtime);
    await repository.deleteConnectorGrant("lifeops-calendar-agent", "google");
    await repository.deleteCalendarEventsForProvider(
      "lifeops-calendar-agent",
      "google",
    );
    await repository.deleteCalendarSyncState(
      "lifeops-calendar-agent",
      "google",
    );
  });

  async function connectGoogleCalendar(
    capabilities: string[] = ["google.calendar.read"],
    scopes: string[] = [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/calendar.readonly",
    ],
  ): Promise<void> {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "calendar-access-token",
          refresh_token: "calendar-refresh-token",
          expires_in: 3600,
          scope: scopes.join(" "),
          token_type: "Bearer",
          id_token: buildIdToken({
            sub: "google-user-calendar",
            email: "calendar@example.com",
            email_verified: true,
            name: "Calendar Example",
          }),
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const startRes = await req(
      port,
      "POST",
      "/api/lifeops/connectors/google/start",
      {
        capabilities,
      },
    );
    expect(startRes.status).toBe(200);

    const authUrl = new URL(String(startRes.data.authUrl));
    const callbackRes = await req(
      port,
      "GET",
      `/api/lifeops/connectors/google/callback?state=${encodeURIComponent(authUrl.searchParams.get("state") ?? "")}&code=calendar-auth-code`,
    );
    expect(callbackRes.status).toBe(200);
  }

  async function expireStoredGoogleToken(): Promise<void> {
    const repository = new LifeOpsRepository(runtime);
    const grant = await repository.getConnectorGrant(
      "lifeops-calendar-agent",
      "google",
      "local",
    );
    expect(grant?.tokenRef).toBeTruthy();
    const tokenPath = path.join(
      resolveOAuthDir(process.env, stateDir),
      "lifeops",
      "google",
      String(grant?.tokenRef),
    );
    const stored = JSON.parse(await fs.readFile(tokenPath, "utf-8")) as Record<
      string,
      unknown
    >;
    stored.expiresAt = Date.now() - 60_000;
    await fs.writeFile(tokenPath, JSON.stringify(stored, null, 2), "utf-8");
  }

  it("syncs today's calendar feed, orders events, and reuses the cache until forced", async () => {
    await connectGoogleCalendar();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-04T16:00:00.000Z"));

    try {
      fetchMock.mockImplementation(async (input, init) => {
        const url = typeof input === "string" ? input : input.toString();
        expect(url).toContain(
          "https://www.googleapis.com/calendar/v3/calendars/primary/events?",
        );
        expect(init?.headers).toMatchObject({
          Authorization: "Bearer calendar-access-token",
        });

        const requestUrl = new URL(url);
        expect(requestUrl.searchParams.get("timeZone")).toBe(
          "America/Los_Angeles",
        );
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "event-later",
                status: "confirmed",
                summary: "Design review",
                description: "Discuss implementation details.",
                location: "Studio",
                htmlLink: "https://calendar.google.com/event?eid=design",
                start: {
                  dateTime: "2026-04-04T15:00:00-07:00",
                  timeZone: "America/Los_Angeles",
                },
                end: {
                  dateTime: "2026-04-04T16:00:00-07:00",
                  timeZone: "America/Los_Angeles",
                },
                attendees: [
                  {
                    email: "friend@example.com",
                    displayName: "Friend",
                    responseStatus: "accepted",
                  },
                ],
              },
              {
                id: "event-earlier",
                status: "confirmed",
                summary: "Morning standup",
                location: "Discord",
                htmlLink: "https://calendar.google.com/event?eid=standup",
                start: {
                  dateTime: "2026-04-04T09:00:00-07:00",
                  timeZone: "America/Los_Angeles",
                },
                end: {
                  dateTime: "2026-04-04T09:30:00-07:00",
                  timeZone: "America/Los_Angeles",
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      });

      const feedRes = await req(
        port,
        "GET",
        "/api/lifeops/calendar/feed?timeZone=America%2FLos_Angeles",
      );
      expect(feedRes.status).toBe(200);
      expect(feedRes.data.source).toBe("synced");
      expect(feedRes.data.calendarId).toBe("primary");
      expect(feedRes.data.events).toHaveLength(2);
      expect(
        feedRes.data.events.map((event: { title: string }) => event.title),
      ).toEqual(["Morning standup", "Design review"]);
      expect(feedRes.data.events[1].htmlLink).toBe(
        "https://calendar.google.com/event?eid=design",
      );

      const cachedRes = await req(
        port,
        "GET",
        "/api/lifeops/calendar/feed?timeZone=America%2FLos_Angeles",
      );
      expect(cachedRes.status).toBe(200);
      expect(cachedRes.data.source).toBe("cache");
      expect(fetchMock).toHaveBeenCalledTimes(2);

      const forcedRes = await req(
        port,
        "GET",
        "/api/lifeops/calendar/feed?timeZone=America%2FLos_Angeles&forceSync=true",
      );
      expect(forcedRes.status).toBe(200);
      expect(forcedRes.data.source).toBe("synced");
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a requested tomorrow window from leaking prior-day all-day events", async () => {
    await connectGoogleCalendar();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [
            {
              id: "event-today-dentist",
              status: "confirmed",
              summary: "Dentist appointment",
              start: {
                date: "2026-04-09",
                timeZone: "America/Los_Angeles",
              },
              end: {
                date: "2026-04-10",
                timeZone: "America/Los_Angeles",
              },
            },
            {
              id: "event-tomorrow-flight",
              status: "confirmed",
              summary: "Flight to Denver (WN 3677)",
              location: "San Francisco SFO",
              start: {
                dateTime: "2026-04-10T14:25:00-07:00",
                timeZone: "America/Los_Angeles",
              },
              end: {
                dateTime: "2026-04-10T17:05:00-06:00",
                timeZone: "America/Los_Angeles",
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const tomorrowWindowRes = await req(
      port,
      "GET",
      "/api/lifeops/calendar/feed?timeZone=America%2FLos_Angeles&timeMin=2026-04-10T07%3A00%3A00.000Z&timeMax=2026-04-11T07%3A00%3A00.000Z",
    );
    expect(tomorrowWindowRes.status).toBe(200);
    expect(tomorrowWindowRes.data.events).toHaveLength(1);
    expect(tomorrowWindowRes.data.events[0]).toMatchObject({
      title: "Flight to Denver (WN 3677)",
      location: "San Francisco SFO",
    });
  });

  it("builds next-event context from the earliest upcoming calendar event", async () => {
    await connectGoogleCalendar();

    const now = new Date();
    const nextStart = new Date(now.getTime() + 20 * 60_000);
    const nextEnd = new Date(now.getTime() + 80 * 60_000);
    const laterStart = new Date(now.getTime() + 4 * 60 * 60_000);
    const laterEnd = new Date(now.getTime() + 5 * 60 * 60_000);

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [
            {
              id: "event-later",
              status: "confirmed",
              summary: "Later review",
              start: {
                dateTime: laterStart.toISOString(),
                timeZone: "UTC",
              },
              end: {
                dateTime: laterEnd.toISOString(),
                timeZone: "UTC",
              },
            },
            {
              id: "event-next",
              status: "confirmed",
              summary: "Design review",
              description: "Read the draft and final comments.",
              location: "Studio",
              conferenceData: {
                entryPoints: [
                  {
                    uri: "https://meet.google.com/next-event",
                  },
                ],
              },
              start: {
                dateTime: nextStart.toISOString(),
                timeZone: "UTC",
              },
              end: {
                dateTime: nextEnd.toISOString(),
                timeZone: "UTC",
              },
              attendees: [
                {
                  email: "friend@example.com",
                  displayName: "Friend",
                  responseStatus: "accepted",
                },
              ],
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    // Pass explicit time window so the server doesn't auto-compute from the
    // current UTC day — avoids flaky failures near midnight when events at
    // now+20min would cross the day boundary.
    const timeMin = new Date(now.getTime() - 60_000).toISOString();
    const timeMax = new Date(now.getTime() + 24 * 60 * 60_000).toISOString();
    const contextRes = await req(
      port,
      "GET",
      `/api/lifeops/calendar/next-context?timeZone=UTC&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`,
    );
    expect(contextRes.status).toBe(200);
    expect(contextRes.data).toMatchObject({
      attendeeCount: 1,
      attendeeNames: ["Friend"],
      location: "Studio",
      conferenceLink: "https://meet.google.com/next-event",
      linkedMail: [],
    });
    expect(contextRes.data.event).toMatchObject({
      title: "Design review",
    });
    expect(contextRes.data.preparationChecklist).toEqual(
      expect.arrayContaining([
        "Confirm route or access for Studio",
        "Open and test the call link before the meeting starts",
        "Review attendee context for Friend",
        "Read the event description and agenda notes",
      ]),
    );
  });

  it("emits calendar reminders through the life-ops overview after sync", async () => {
    await connectGoogleCalendar();

    const now = new Date();
    const startAt = new Date(now.getTime() + 20 * 60_000);
    const endAt = new Date(now.getTime() + 80 * 60_000);

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [
            {
              id: "event-reminder",
              status: "confirmed",
              summary: "Preparation sync",
              htmlLink: "https://calendar.google.com/event?eid=prep-sync",
              start: {
                dateTime: startAt.toISOString(),
                timeZone: "UTC",
              },
              end: {
                dateTime: endAt.toISOString(),
                timeZone: "UTC",
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const feedRes = await req(
      port,
      "GET",
      "/api/lifeops/calendar/feed?timeZone=UTC",
    );
    expect(feedRes.status).toBe(200);

    const overviewRes = await req(port, "GET", "/api/lifeops/overview");
    expect(overviewRes.status).toBe(200);
    expect(overviewRes.data.reminders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ownerType: "calendar_event",
          title: "Preparation sync",
          eventStartAt: startAt.toISOString(),
          dueAt: startAt.toISOString(),
          htmlLink: "https://calendar.google.com/event?eid=prep-sync",
        }),
      ]),
    );
    expect(overviewRes.data.summary.activeReminderCount).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("marks the Google connector for reauth when refresh token exchange fails", async () => {
    await connectGoogleCalendar();
    await expireStoredGoogleToken();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: "invalid_grant",
          error_description: "Token has been expired or revoked.",
        }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const feedRes = await req(
      port,
      "GET",
      "/api/lifeops/calendar/feed?timeZone=UTC",
    );
    expect(feedRes.status).toBe(401);
    expect(String(feedRes.data.error)).toContain(
      "Google connector needs re-authentication",
    );
    expect(String(feedRes.data.error)).toContain("expired or revoked");

    const statusRes = await req(
      port,
      "GET",
      "/api/lifeops/connectors/google/status",
    );
    expect(statusRes.status).toBe(200);
    expect(statusRes.data.connected).toBe(false);
    expect(statusRes.data.reason).toBe("needs_reauth");
    expect(statusRes.data.grant).toMatchObject({
      metadata: expect.objectContaining({
        authState: "needs_reauth",
      }),
    });
    expect(String(statusRes.data.grant.metadata.lastAuthError)).toContain(
      "expired or revoked",
    );
  });

  it("surfaces Google Workspace admin policy blocks without downgrading the grant", async () => {
    await connectGoogleCalendar();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            message:
              "Access blocked by your organization's admin policy for this calendar.",
          },
        }),
        {
          status: 403,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const feedRes = await req(
      port,
      "GET",
      "/api/lifeops/calendar/feed?timeZone=UTC",
    );
    expect(feedRes.status).toBe(403);
    expect(String(feedRes.data.error)).toContain(
      "Google Workspace policy blocked the request",
    );
    expect(String(feedRes.data.error)).toContain("admin policy");

    const statusRes = await req(
      port,
      "GET",
      "/api/lifeops/connectors/google/status",
    );
    expect(statusRes.status).toBe(200);
    expect(statusRes.data.connected).toBe(true);
    expect(statusRes.data.reason).toBe("connected");
  });

  it("clears cached calendar data on disconnect", async () => {
    await connectGoogleCalendar();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [
            {
              id: "event-1",
              status: "confirmed",
              summary: "Solo block",
              htmlLink: "https://calendar.google.com/event?eid=solo",
              start: {
                dateTime: "2026-04-04T11:00:00-07:00",
                timeZone: "America/Los_Angeles",
              },
              end: {
                dateTime: "2026-04-04T12:00:00-07:00",
                timeZone: "America/Los_Angeles",
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const feedRes = await req(
      port,
      "GET",
      "/api/lifeops/calendar/feed?timeZone=America%2FLos_Angeles",
    );
    expect(feedRes.status).toBe(200);

    const disconnectRes = await req(
      port,
      "POST",
      "/api/lifeops/connectors/google/disconnect",
      {},
    );
    expect(disconnectRes.status).toBe(200);
    expect(disconnectRes.data.connected).toBe(false);

    const repository = new LifeOpsRepository(runtime);
    const persisted = await repository.listCalendarEvents(
      "lifeops-calendar-agent",
      "google",
    );
    expect(persisted).toHaveLength(0);

    const afterDisconnect = await req(
      port,
      "GET",
      "/api/lifeops/calendar/feed?timeZone=America%2FLos_Angeles",
    );
    expect(afterDisconnect.status).toBe(409);
    expect(String(afterDisconnect.data.error)).toContain(
      "Google Calendar is not connected",
    );
  });

  it("rejects event creation when the connector only has calendar read access", async () => {
    await connectGoogleCalendar();

    const createRes = await req(port, "POST", "/api/lifeops/calendar/events", {
      title: "Coffee",
      startAt: "2026-04-05T21:00:00.000Z",
      endAt: "2026-04-05T22:00:00.000Z",
      timeZone: "America/Los_Angeles",
    });
    expect(createRes.status).toBe(403);
    expect(String(createRes.data.error)).toContain(
      "Google Calendar write access has not been granted",
    );
  });

  it("creates calendar events with write access and persists the created window", async () => {
    await connectGoogleCalendar(
      ["google.calendar.write"],
      [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/calendar.events",
      ],
    );

    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      expect(url).toBe(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      );
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer calendar-access-token",
        "Content-Type": "application/json",
      });
      expect(JSON.parse(String(init?.body ?? "{}"))).toMatchObject({
        summary: "Coffee with Mira",
        start: {
          dateTime: "2026-04-05T21:00:00.000Z",
          timeZone: "America/Los_Angeles",
        },
        end: {
          dateTime: "2026-04-05T22:30:00.000Z",
          timeZone: "America/Los_Angeles",
        },
      });

      return new Response(
        JSON.stringify({
          id: "created-event-1",
          status: "confirmed",
          summary: "Coffee with Mira",
          description: "Talk through next week.",
          location: "Cafe",
          htmlLink: "https://calendar.google.com/event?eid=created",
          start: {
            dateTime: "2026-04-05T14:00:00-07:00",
            timeZone: "America/Los_Angeles",
          },
          end: {
            dateTime: "2026-04-05T15:30:00-07:00",
            timeZone: "America/Los_Angeles",
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });

    const createRes = await req(port, "POST", "/api/lifeops/calendar/events", {
      title: "Coffee with Mira",
      description: "Talk through next week.",
      location: "Cafe",
      startAt: "2026-04-05T21:00:00.000Z",
      endAt: "2026-04-05T22:30:00.000Z",
      timeZone: "America/Los_Angeles",
    });
    expect(createRes.status).toBe(201);
    expect(createRes.data.event).toMatchObject({
      title: "Coffee with Mira",
      location: "Cafe",
      htmlLink: "https://calendar.google.com/event?eid=created",
    });

    const repository = new LifeOpsRepository(runtime);
    const persisted = await repository.listCalendarEvents(
      "lifeops-calendar-agent",
      "google",
      "2026-04-05T00:00:00.000Z",
      "2026-04-06T00:00:00.000Z",
    );
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({
      title: "Coffee with Mira",
      startAt: "2026-04-05T21:00:00.000Z",
      endAt: "2026-04-05T22:30:00.000Z",
    });
  });
});
