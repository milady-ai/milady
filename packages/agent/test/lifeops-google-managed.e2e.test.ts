import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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
import { req } from "../../../test/helpers/http";
import { saveEnv } from "../../../test/helpers/test-utils";
import { startApiServer } from "../src/api/server";
import { LifeOpsRepository } from "../src/lifeops/repository";
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

function createRuntimeForManagedGoogleTests(): AgentRuntime {
  const sqlite = new DatabaseSync(":memory:");
  let tasks: Task[] = [];
  const runtimeSubset = {
    agentId: "lifeops-google-managed-agent",
    character: {
      name: "LifeOpsManagedGoogleAgent",
    } as AgentRuntime["character"],
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function buildIdToken(claims: Record<string, unknown>): string {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(claims)}.signature`;
}

describe("life-ops managed Google connector", () => {
  let port = 0;
  let closeServer: (() => Promise<void>) | null = null;
  let envBackup: { restore: () => void };
  let stateDir = "";
  let runtime: AgentRuntime;
  const fetchMock = vi.fn<typeof fetch>();

  beforeAll(async () => {
    envBackup = saveEnv(
      "ELIZA_STATE_DIR",
      "ELIZAOS_CLOUD_API_KEY",
      "ELIZAOS_CLOUD_BASE_URL",
      "MILADY_GOOGLE_OAUTH_DESKTOP_CLIENT_ID",
      "ELIZA_GOOGLE_OAUTH_DESKTOP_CLIENT_ID",
      "MILADY_GOOGLE_OAUTH_WEB_CLIENT_ID",
      "ELIZA_GOOGLE_OAUTH_WEB_CLIENT_ID",
      "MILADY_GOOGLE_OAUTH_WEB_CLIENT_SECRET",
      "ELIZA_GOOGLE_OAUTH_WEB_CLIENT_SECRET",
      "MILADY_GOOGLE_OAUTH_PUBLIC_BASE_URL",
      "ELIZA_GOOGLE_OAUTH_PUBLIC_BASE_URL",
    );
    stateDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "lifeops-google-managed-"),
    );
    process.env.ELIZA_STATE_DIR = stateDir;
    process.env.ELIZAOS_CLOUD_API_KEY = "ck-managed-google-test";
    process.env.ELIZAOS_CLOUD_BASE_URL = "https://cloud.example";

    runtime = createRuntimeForManagedGoogleTests();

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
    delete process.env.MILADY_GOOGLE_OAUTH_DESKTOP_CLIENT_ID;
    delete process.env.ELIZA_GOOGLE_OAUTH_DESKTOP_CLIENT_ID;
    delete process.env.MILADY_GOOGLE_OAUTH_WEB_CLIENT_ID;
    delete process.env.ELIZA_GOOGLE_OAUTH_WEB_CLIENT_ID;
    delete process.env.MILADY_GOOGLE_OAUTH_WEB_CLIENT_SECRET;
    delete process.env.ELIZA_GOOGLE_OAUTH_WEB_CLIENT_SECRET;
    delete process.env.MILADY_GOOGLE_OAUTH_PUBLIC_BASE_URL;
    delete process.env.ELIZA_GOOGLE_OAUTH_PUBLIC_BASE_URL;
  });

  afterEach(async () => {
    const repository = new LifeOpsRepository(runtime);
    await repository.deleteConnectorGrant(
      "lifeops-google-managed-agent",
      "google",
    );
    await repository.deleteCalendarEventsForProvider(
      "lifeops-google-managed-agent",
      "google",
    );
    await repository.deleteCalendarSyncState(
      "lifeops-google-managed-agent",
      "google",
    );
    await repository.deleteGmailMessagesForProvider(
      "lifeops-google-managed-agent",
      "google",
    );
    await repository.deleteGmailSyncState(
      "lifeops-google-managed-agent",
      "google",
    );
    await fs.rm(path.join(stateDir, "credentials"), {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 50,
    });
  });

  it("prefers cloud-managed Google when Eliza Cloud is configured and mirrors the grant locally", async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const headers = new Headers(init?.headers);
      expect(headers.get("x-api-key")).toBe("ck-managed-google-test");

      if (
        url === "https://cloud.example/api/v1/milady/google/status?side=owner"
      ) {
        return jsonResponse({
          provider: "google",
          side: "owner",
          mode: "cloud_managed",
          configured: true,
          connected: true,
          reason: "connected",
          identity: {
            id: "google-user-managed",
            email: "founder@example.com",
            name: "Founder Example",
          },
          grantedCapabilities: [
            "google.basic_identity",
            "google.calendar.read",
            "google.gmail.triage",
          ],
          grantedScopes: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/calendar.readonly",
            "https://www.googleapis.com/auth/gmail.readonly",
          ],
          expiresAt: "2026-04-05T00:00:00.000Z",
          hasRefreshToken: true,
          connectionId: "managed-google-connection",
          linkedAt: "2026-04-04T15:00:00.000Z",
          lastUsedAt: "2026-04-04T16:00:00.000Z",
        });
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    const statusRes = await req(
      port,
      "GET",
      "/api/lifeops/connectors/google/status",
    );

    expect(statusRes.status).toBe(200);
    expect(statusRes.data.mode).toBe("cloud_managed");
    expect(statusRes.data.defaultMode).toBe("cloud_managed");
    expect(statusRes.data.availableModes).toEqual(["cloud_managed"]);
    expect(statusRes.data.executionTarget).toBe("cloud");
    expect(statusRes.data.sourceOfTruth).toBe("cloud_connection");
    expect(statusRes.data.connected).toBe(true);
    expect(statusRes.data.cloudConnectionId).toBe("managed-google-connection");
    expect(statusRes.data.identity.email).toBe("founder@example.com");

    const repository = new LifeOpsRepository(runtime);
    const grant = await repository.getConnectorGrant(
      "lifeops-google-managed-agent",
      "google",
      "cloud_managed",
    );
    expect(grant).not.toBeNull();
    expect(grant?.tokenRef).toBeNull();
    expect(grant?.executionTarget).toBe("cloud");
    expect(grant?.sourceOfTruth).toBe("cloud_connection");
    expect(grant?.preferredByAgent).toBe(true);
    expect(grant?.cloudConnectionId).toBe("managed-google-connection");
    expect(grant?.capabilities).toEqual([
      "google.basic_identity",
      "google.calendar.read",
      "google.gmail.triage",
    ]);
  });

  it("switches the preferred Google mode per agent when local and managed connectors both exist", async () => {
    process.env.MILADY_GOOGLE_OAUTH_DESKTOP_CLIENT_ID = "desktop-client-id";

    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";

      if (url === "https://oauth2.googleapis.com/token" && method === "POST") {
        const params = new URLSearchParams(String(init?.body ?? ""));
        expect(params.get("client_id")).toBe("desktop-client-id");
        expect(params.get("grant_type")).toBe("authorization_code");
        expect(params.get("code")).toBe("local-preference-code");
        expect(params.get("redirect_uri")).toBe(
          `http://127.0.0.1:${port}/api/lifeops/connectors/google/callback`,
        );

        return jsonResponse({
          access_token: "local-preference-access-token",
          refresh_token: "local-preference-refresh-token",
          expires_in: 3600,
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/calendar.readonly",
          ].join(" "),
          token_type: "Bearer",
          id_token: buildIdToken({
            sub: "google-local-user",
            email: "local@example.com",
            email_verified: true,
            name: "Local Example",
          }),
        });
      }

      if (
        url === "https://cloud.example/api/v1/milady/google/status?side=owner"
      ) {
        const headers = new Headers(init?.headers);
        expect(headers.get("x-api-key")).toBe("ck-managed-google-test");
        return jsonResponse({
          provider: "google",
          side: "owner",
          mode: "cloud_managed",
          configured: true,
          connected: true,
          reason: "connected",
          identity: {
            id: "google-managed-user",
            email: "managed@example.com",
            name: "Managed Example",
          },
          grantedCapabilities: [
            "google.basic_identity",
            "google.calendar.read",
          ],
          grantedScopes: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/calendar.readonly",
          ],
          expiresAt: "2026-04-05T00:00:00.000Z",
          hasRefreshToken: true,
          connectionId: "managed-google-connection",
          linkedAt: "2026-04-04T15:00:00.000Z",
          lastUsedAt: "2026-04-04T16:00:00.000Z",
        });
      }

      throw new Error(`Unexpected fetch ${method} ${url}`);
    });

    const startRes = await req(
      port,
      "POST",
      "/api/lifeops/connectors/google/start",
      {
        mode: "local",
        capabilities: ["google.calendar.read"],
      },
    );
    expect(startRes.status).toBe(200);
    expect(startRes.data.mode).toBe("local");

    const authUrl = new URL(String(startRes.data.authUrl));
    const callbackRes = await req(
      port,
      "GET",
      `/api/lifeops/connectors/google/callback?state=${encodeURIComponent(authUrl.searchParams.get("state") ?? "")}&code=local-preference-code`,
    );
    expect(callbackRes.status).toBe(200);

    const defaultLocalStatus = await req(
      port,
      "GET",
      "/api/lifeops/connectors/google/status",
    );
    expect(defaultLocalStatus.status).toBe(200);
    expect(defaultLocalStatus.data.mode).toBe("local");
    expect(defaultLocalStatus.data.preferredByAgent).toBe(true);
    expect(defaultLocalStatus.data.connected).toBe(true);

    const managedStatus = await req(
      port,
      "GET",
      "/api/lifeops/connectors/google/status?mode=cloud_managed",
    );
    expect(managedStatus.status).toBe(200);
    expect(managedStatus.data.mode).toBe("cloud_managed");
    expect(managedStatus.data.connected).toBe(true);
    expect(managedStatus.data.preferredByAgent).toBe(false);

    const repository = new LifeOpsRepository(runtime);
    expect(
      (
        await repository.getConnectorGrant(
          "lifeops-google-managed-agent",
          "google",
          "local",
        )
      )?.preferredByAgent,
    ).toBe(true);
    expect(
      (
        await repository.getConnectorGrant(
          "lifeops-google-managed-agent",
          "google",
          "cloud_managed",
        )
      )?.preferredByAgent,
    ).toBe(false);

    const preferManagedRes = await req(
      port,
      "POST",
      "/api/lifeops/connectors/google/preference",
      {
        mode: "cloud_managed",
      },
    );
    expect(preferManagedRes.status).toBe(200);
    expect(preferManagedRes.data.mode).toBe("cloud_managed");
    expect(preferManagedRes.data.preferredByAgent).toBe(true);
    expect(preferManagedRes.data.connected).toBe(true);

    const defaultManagedStatus = await req(
      port,
      "GET",
      "/api/lifeops/connectors/google/status",
    );
    expect(defaultManagedStatus.status).toBe(200);
    expect(defaultManagedStatus.data.mode).toBe("cloud_managed");
    expect(defaultManagedStatus.data.preferredByAgent).toBe(true);

    expect(
      (
        await repository.getConnectorGrant(
          "lifeops-google-managed-agent",
          "google",
          "local",
        )
      )?.preferredByAgent,
    ).toBe(false);
    expect(
      (
        await repository.getConnectorGrant(
          "lifeops-google-managed-agent",
          "google",
          "cloud_managed",
        )
      )?.preferredByAgent,
    ).toBe(true);

    const preferLocalRes = await req(
      port,
      "POST",
      "/api/lifeops/connectors/google/preference",
      {
        mode: "local",
      },
    );
    expect(preferLocalRes.status).toBe(200);
    expect(preferLocalRes.data.mode).toBe("local");
    expect(preferLocalRes.data.preferredByAgent).toBe(true);
    expect(preferLocalRes.data.connected).toBe(true);

    const defaultLocalAgain = await req(
      port,
      "GET",
      "/api/lifeops/connectors/google/status",
    );
    expect(defaultLocalAgain.status).toBe(200);
    expect(defaultLocalAgain.data.mode).toBe("local");
    expect(defaultLocalAgain.data.preferredByAgent).toBe(true);
  });

  it("starts managed auth, syncs calendar and gmail, sends replies, creates events, and disconnects cleanly", async () => {
    let connected = false;
    const createdEventIds: string[] = [];
    const sentSubjects: string[] = [];

    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      const headers = new Headers(init?.headers);
      expect(headers.get("x-api-key")).toBe("ck-managed-google-test");

      if (
        url === "https://cloud.example/api/v1/oauth/google/initiate" &&
        method === "POST"
      ) {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<
          string,
          unknown
        >;
        expect(body.connectionRole).toBe("owner");
        expect(body.scopes).toEqual([
          "https://www.googleapis.com/auth/userinfo.email",
          "https://www.googleapis.com/auth/userinfo.profile",
          "https://www.googleapis.com/auth/calendar.readonly",
          "https://www.googleapis.com/auth/calendar.events",
          "https://www.googleapis.com/auth/gmail.readonly",
          "https://www.googleapis.com/auth/gmail.send",
        ]);
        expect(body.redirectUrl).toBe(
          "http://127.0.0.1:3000/api/lifeops/connectors/google/success?side=owner&mode=cloud_managed",
        );
        connected = true;
        return jsonResponse({
          authUrl:
            "https://accounts.google.com/o/oauth2/v2/auth?client_id=managed-google",
        });
      }

      if (
        url === "https://cloud.example/api/v1/milady/google/status?side=owner"
      ) {
        return jsonResponse(
          connected
            ? {
                provider: "google",
                side: "owner",
                mode: "cloud_managed",
                configured: true,
                connected: true,
                reason: "connected",
                identity: {
                  id: "google-user-managed",
                  email: "founder@example.com",
                  name: "Founder Example",
                },
                grantedCapabilities: [
                  "google.basic_identity",
                  "google.calendar.read",
                  "google.calendar.write",
                  "google.gmail.triage",
                  "google.gmail.send",
                ],
                grantedScopes: [
                  "openid",
                  "email",
                  "profile",
                  "https://www.googleapis.com/auth/calendar.readonly",
                  "https://www.googleapis.com/auth/calendar.events",
                  "https://www.googleapis.com/auth/gmail.readonly",
                  "https://www.googleapis.com/auth/gmail.send",
                ],
                expiresAt: "2026-04-05T00:00:00.000Z",
                hasRefreshToken: true,
                connectionId: "managed-google-connection",
                linkedAt: "2026-04-04T15:00:00.000Z",
                lastUsedAt: "2026-04-04T16:00:00.000Z",
              }
            : {
                provider: "google",
                side: "owner",
                mode: "cloud_managed",
                configured: true,
                connected: false,
                reason: "disconnected",
                identity: null,
                grantedCapabilities: [],
                grantedScopes: [],
                expiresAt: null,
                hasRefreshToken: false,
                connectionId: null,
                linkedAt: null,
                lastUsedAt: null,
              },
        );
      }

      if (
        url.startsWith(
          "https://cloud.example/api/v1/milady/google/calendar/feed?",
        ) &&
        method === "GET"
      ) {
        const parsedUrl = new URL(url);
        expect(parsedUrl.searchParams.get("timeZone")).toBe("UTC");
        return jsonResponse({
          calendarId: "primary",
          events: [
            {
              externalId: "managed-event-1",
              calendarId: "primary",
              title: "Founder sync",
              description: "Discuss the product review",
              location: "HQ",
              status: "confirmed",
              startAt: "2099-04-04T18:00:00.000Z",
              endAt: "2099-04-04T18:30:00.000Z",
              isAllDay: false,
              timezone: "UTC",
              htmlLink: "https://calendar.google.com/event?eid=managed-event-1",
              conferenceLink: null,
              organizer: {
                email: "founder@example.com",
                displayName: "Founder Example",
              },
              attendees: [
                {
                  email: "founder@example.com",
                  displayName: "Founder Example",
                  responseStatus: "accepted",
                  self: false,
                  organizer: true,
                  optional: false,
                },
              ],
              metadata: {
                iCalUid: "managed-event-1@google.com",
                recurringEventId: null,
                created: "2026-04-04T17:00:00.000Z",
              },
            },
          ],
          syncedAt: "2026-04-04T17:05:00.000Z",
        });
      }

      if (
        url === "https://cloud.example/api/v1/milady/google/calendar/events" &&
        method === "POST"
      ) {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<
          string,
          unknown
        >;
        expect(body.side).toBe("owner");
        createdEventIds.push(String(body.title));
        return jsonResponse({
          event: {
            externalId: "managed-created-event",
            calendarId: "primary",
            title: body.title,
            description: body.description ?? "",
            location: body.location ?? "",
            status: "confirmed",
            startAt: body.startAt,
            endAt: body.endAt,
            isAllDay: false,
            timezone: body.timeZone,
            htmlLink:
              "https://calendar.google.com/event?eid=managed-created-event",
            conferenceLink: null,
            organizer: {
              email: "founder@example.com",
              displayName: "Founder Example",
            },
            attendees: [],
            metadata: {},
          },
        });
      }

      if (
        url.startsWith(
          "https://cloud.example/api/v1/milady/google/gmail/triage?",
        ) &&
        method === "GET"
      ) {
        return jsonResponse({
          messages: [
            {
              externalId: "managed-message-1",
              threadId: "managed-thread-1",
              subject: "Project sync",
              from: "Founder Example <founder@example.com>",
              fromEmail: "founder@example.com",
              replyTo: "founder@example.com",
              to: ["founder@example.com"],
              cc: [],
              snippet: "Can we review the product plan today?",
              receivedAt: "2026-04-04T17:30:00.000Z",
              isUnread: true,
              isImportant: true,
              likelyReplyNeeded: true,
              triageScore: 95,
              triageReason: "unread, directly addressed, likely needs reply",
              labels: ["INBOX", "UNREAD", "IMPORTANT"],
              htmlLink:
                "https://mail.google.com/mail/u/0/#inbox/managed-thread-1",
              metadata: {
                historyId: "history-1",
                sizeEstimate: 1234,
                dateHeader: "Fri, 04 Apr 2026 10:30:00 -0700",
                messageIdHeader: "<managed-message-1@example.com>",
                referencesHeader: null,
                listId: null,
                precedence: null,
                autoSubmitted: null,
              },
            },
          ],
          syncedAt: "2026-04-04T17:32:00.000Z",
        });
      }

      if (
        url === "https://cloud.example/api/v1/milady/google/gmail/reply-send" &&
        method === "POST"
      ) {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<
          string,
          unknown
        >;
        expect(body.side).toBe("owner");
        sentSubjects.push(String(body.subject));
        expect(body.to).toEqual(["founder@example.com"]);
        expect(body.inReplyTo).toBe("<managed-message-1@example.com>");
        return jsonResponse({ ok: true });
      }

      if (
        url === "https://cloud.example/api/v1/milady/google/disconnect" &&
        method === "POST"
      ) {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<
          string,
          unknown
        >;
        expect(body.side).toBe("owner");
        connected = false;
        return jsonResponse({ ok: true });
      }

      throw new Error(`Unexpected fetch ${method} ${url}`);
    });

    const startRes = await req(
      port,
      "POST",
      "/api/lifeops/connectors/google/start",
      {
        redirectUrl:
          "http://127.0.0.1:3000/api/lifeops/connectors/google/success?side=owner&mode=cloud_managed",
        capabilities: [
          "google.calendar.read",
          "google.calendar.write",
          "google.gmail.triage",
          "google.gmail.send",
        ],
      },
    );
    expect(startRes.status).toBe(200);
    expect(startRes.data.mode).toBe("cloud_managed");
    expect(startRes.data.redirectUri).toBe(
      "http://127.0.0.1:3000/api/lifeops/connectors/google/success?side=owner&mode=cloud_managed",
    );
    expect(startRes.data.authUrl).toContain("accounts.google.com");

    const statusRes = await req(
      port,
      "GET",
      "/api/lifeops/connectors/google/status",
    );
    expect(statusRes.status).toBe(200);
    expect(statusRes.data.connected).toBe(true);
    expect(statusRes.data.mode).toBe("cloud_managed");
    expect(statusRes.data.grantedCapabilities).toEqual([
      "google.basic_identity",
      "google.calendar.read",
      "google.calendar.write",
      "google.gmail.triage",
      "google.gmail.send",
    ]);

    const feedRes = await req(
      port,
      "GET",
      "/api/lifeops/calendar/feed?mode=cloud_managed&timeZone=UTC&forceSync=true&timeMin=2099-04-04T00%3A00%3A00.000Z&timeMax=2099-04-05T00%3A00%3A00.000Z",
    );
    expect(feedRes.status).toBe(200);
    expect(feedRes.data.source).toBe("synced");
    expect(feedRes.data.events).toHaveLength(1);
    expect(feedRes.data.events[0].title).toBe("Founder sync");

    const createRes = await req(port, "POST", "/api/lifeops/calendar/events", {
      mode: "cloud_managed",
      title: "Launch review",
      startAt: "2099-04-04T19:00:00.000Z",
      endAt: "2099-04-04T19:30:00.000Z",
      timeZone: "UTC",
      description: "Review launch details",
    });
    expect(createRes.status).toBe(201);
    expect(createRes.data.event.title).toBe("Launch review");
    expect(createdEventIds).toEqual(["Launch review"]);

    const triageRes = await req(
      port,
      "GET",
      "/api/lifeops/gmail/triage?mode=cloud_managed&forceSync=true&maxResults=5",
    );
    expect(triageRes.status).toBe(200);
    expect(triageRes.data.source).toBe("synced");
    expect(triageRes.data.messages).toHaveLength(1);
    expect(triageRes.data.messages[0].subject).toBe("Project sync");

    const nextContextRes = await req(
      port,
      "GET",
      "/api/lifeops/calendar/next-context?mode=cloud_managed&timeZone=UTC&timeMin=2099-04-04T00%3A00%3A00.000Z&timeMax=2099-04-05T00%3A00%3A00.000Z",
    );
    expect(nextContextRes.status).toBe(200);
    expect(nextContextRes.data.event.title).toBe("Founder sync");
    expect(nextContextRes.data.linkedMailState).toBe("cache");
    expect(nextContextRes.data.linkedMail).toHaveLength(1);
    expect(nextContextRes.data.linkedMail[0].subject).toBe("Project sync");

    const draftRes = await req(
      port,
      "POST",
      "/api/lifeops/gmail/reply-drafts",
      {
        mode: "cloud_managed",
        messageId: triageRes.data.messages[0].id,
        tone: "warm",
        includeQuotedOriginal: true,
      },
    );
    expect(draftRes.status).toBe(201);
    expect(draftRes.data.draft.to).toEqual(["founder@example.com"]);
    expect(draftRes.data.draft.sendAllowed).toBe(true);
    expect(draftRes.data.draft.bodyText).toContain(
      "Thanks for reaching out about Project sync.",
    );
    expect(draftRes.data.draft.bodyText).toContain(
      "Can we review the product plan today?",
    );

    const sendRes = await req(port, "POST", "/api/lifeops/gmail/reply-send", {
      mode: "cloud_managed",
      messageId: triageRes.data.messages[0].id,
      to: ["founder@example.com"],
      cc: [],
      subject: "Project sync",
      bodyText: "Reviewing it now.",
      confirmSend: true,
    });
    expect(sendRes.status).toBe(200);
    expect(sendRes.data.ok).toBe(true);
    expect(sentSubjects).toEqual(["Project sync"]);

    const repository = new LifeOpsRepository(runtime);
    const calendarEvents = await repository.listCalendarEvents(
      "lifeops-google-managed-agent",
      "google",
    );
    expect(calendarEvents.map((event) => event.title)).toContain(
      "Founder sync",
    );
    expect(calendarEvents.map((event) => event.title)).toContain(
      "Launch review",
    );

    const gmailMessages = await repository.listGmailMessages(
      "lifeops-google-managed-agent",
      "google",
    );
    expect(gmailMessages).toHaveLength(1);
    expect(gmailMessages[0]?.subject).toBe("Project sync");

    const disconnectRes = await req(
      port,
      "POST",
      "/api/lifeops/connectors/google/disconnect",
      {
        mode: "cloud_managed",
      },
    );
    expect(disconnectRes.status).toBe(200);
    expect(disconnectRes.data.connected).toBe(false);
    expect(disconnectRes.data.reason).toBe("disconnected");

    const grant = await repository.getConnectorGrant(
      "lifeops-google-managed-agent",
      "google",
      "cloud_managed",
    );
    expect(grant).toBeNull();
    expect(
      await repository.listCalendarEvents(
        "lifeops-google-managed-agent",
        "google",
      ),
    ).toHaveLength(0);
    expect(
      await repository.listGmailMessages(
        "lifeops-google-managed-agent",
        "google",
      ),
    ).toHaveLength(0);
  });

  it("uses the cloud-managed Gmail search endpoint when a live hit exists", async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const headers = new Headers(init?.headers);
      expect(headers.get("x-api-key")).toBe("ck-managed-google-test");

      if (
        url === "https://cloud.example/api/v1/milady/google/status?side=owner"
      ) {
        return jsonResponse({
          provider: "google",
          side: "owner",
          mode: "cloud_managed",
          configured: true,
          connected: true,
          reason: "connected",
          identity: {
            id: "google-user-managed-search-live",
            email: "founder@example.com",
            name: "Founder Example",
          },
          grantedCapabilities: [
            "google.basic_identity",
            "google.gmail.triage",
          ],
          grantedScopes: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/gmail.readonly",
          ],
          expiresAt: "2026-04-05T00:00:00.000Z",
          hasRefreshToken: true,
          connectionId: "managed-google-search-live-connection",
          linkedAt: "2026-04-04T15:00:00.000Z",
          lastUsedAt: "2026-04-04T16:00:00.000Z",
        });
      }

      if (
        url ===
          "https://cloud.example/api/v1/milady/google/gmail/search?side=owner&query=from%3Asuran&maxResults=5" &&
        (init?.method ?? "GET") === "GET"
      ) {
        return jsonResponse({
          messages: [
            {
              externalId: "managed-live-suran-message",
              threadId: "managed-live-suran-thread",
              subject: "Dinner agenda",
              from: "Suran Lee",
              fromEmail: "suran@example.com",
              replyTo: "suran@example.com",
              to: ["founder@example.com"],
              cc: [],
              snippet: "Here is the agenda for tonight.",
              receivedAt: "2026-04-04T17:30:00.000Z",
              isUnread: true,
              isImportant: false,
              likelyReplyNeeded: true,
              triageScore: 71,
              triageReason: "direct cloud sender match",
              labels: ["INBOX", "UNREAD"],
              htmlLink:
                "https://mail.google.com/mail/u/0/#all/managed-live-suran-thread",
              metadata: {
                messageIdHeader: "<managed-live-suran@example.com>",
              },
            },
          ],
          syncedAt: "2026-04-04T17:32:00.000Z",
        });
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    const searchRes = await req(
      port,
      "GET",
      "/api/lifeops/gmail/search?mode=cloud_managed&forceSync=true&query=from%3Asuran&maxResults=5",
    );

    expect(searchRes.status).toBe(200);
    expect(searchRes.data.query).toBe("from:suran");
    expect(searchRes.data.messages).toEqual([
      expect.objectContaining({
        subject: "Dinner agenda",
        fromEmail: "suran@example.com",
      }),
    ]);
  });

  it("falls back to cached Gmail messages for cloud-managed sender search when live search has no hit", async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const headers = new Headers(init?.headers);
      expect(headers.get("x-api-key")).toBe("ck-managed-google-test");

      if (
        url === "https://cloud.example/api/v1/milady/google/status?side=owner"
      ) {
        return jsonResponse({
          provider: "google",
          side: "owner",
          mode: "cloud_managed",
          configured: true,
          connected: true,
          reason: "connected",
          identity: {
            id: "google-user-managed-search",
            email: "founder@example.com",
            name: "Founder Example",
          },
          grantedCapabilities: [
            "google.basic_identity",
            "google.gmail.triage",
          ],
          grantedScopes: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/gmail.readonly",
          ],
          expiresAt: "2026-04-05T00:00:00.000Z",
          hasRefreshToken: true,
          connectionId: "managed-google-search-connection",
          linkedAt: "2026-04-04T15:00:00.000Z",
          lastUsedAt: "2026-04-04T16:00:00.000Z",
        });
      }

      if (
        url ===
          "https://cloud.example/api/v1/milady/google/gmail/search?side=owner&query=from%3Asuran&maxResults=5" &&
        (init?.method ?? "GET") === "GET"
      ) {
        return jsonResponse({
          messages: [],
          syncedAt: "2026-04-04T17:32:00.000Z",
        });
      }

      if (
        url ===
          "https://cloud.example/api/v1/milady/google/gmail/triage?side=owner&maxResults=50" &&
        (init?.method ?? "GET") === "GET"
      ) {
        return jsonResponse({
          messages: [],
          syncedAt: "2026-04-04T17:32:00.000Z",
        });
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    const repository = new LifeOpsRepository(runtime);
    await repository.upsertGmailMessage(
      {
        id: "cached-suran-message",
        externalId: "managed-cached-suran-message",
        threadId: "managed-cached-suran-thread",
        agentId: "lifeops-google-managed-agent",
        provider: "google",
        side: "owner",
        subject: "Dinner agenda",
        from: "Suran Lee <suran@example.com>",
        fromEmail: "suran@example.com",
        replyTo: "suran@example.com",
        to: ["founder@example.com"],
        cc: [],
        snippet: "Here is the agenda for tonight.",
        receivedAt: "2026-04-04T17:30:00.000Z",
        isUnread: true,
        isImportant: false,
        likelyReplyNeeded: true,
        triageScore: 71,
        triageReason: "cached sender match",
        labels: ["CATEGORY_PERSONAL"],
        htmlLink:
          "https://mail.google.com/mail/u/0/#all/managed-cached-suran-thread",
        metadata: {
          messageIdHeader: "<managed-cached-suran@example.com>",
        },
        syncedAt: "2026-04-04T17:32:00.000Z",
        updatedAt: "2026-04-04T17:32:00.000Z",
      },
      "owner",
    );

    const searchRes = await req(
      port,
      "GET",
      "/api/lifeops/gmail/search?mode=cloud_managed&forceSync=true&query=from%3Asuran&maxResults=5",
    );

    expect(searchRes.status).toBe(200);
    expect(searchRes.data.query).toBe("from:suran");
    expect(searchRes.data.messages).toEqual([
      expect.objectContaining({
        subject: "Dinner agenda",
        fromEmail: "suran@example.com",
      }),
    ]);
  });

  it("marks cloud-managed calendar scope failures as needing reauth", async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const headers = new Headers(init?.headers);
      expect(headers.get("x-api-key")).toBe("ck-managed-google-test");

      if (
        url === "https://cloud.example/api/v1/milady/google/status?side=owner"
      ) {
        return jsonResponse({
          provider: "google",
          side: "owner",
          mode: "cloud_managed",
          configured: true,
          connected: true,
          reason: "connected",
          identity: {
            id: "google-user-managed",
            email: "founder@example.com",
            name: "Founder Example",
          },
          grantedCapabilities: [
            "google.basic_identity",
            "google.calendar.read",
          ],
          grantedScopes: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/calendar.readonly",
          ],
          expiresAt: "2026-04-05T00:00:00.000Z",
          hasRefreshToken: true,
          connectionId: "managed-google-connection",
          linkedAt: "2026-04-04T15:00:00.000Z",
          lastUsedAt: "2026-04-04T16:00:00.000Z",
        });
      }

      if (
        url.startsWith(
          "https://cloud.example/api/v1/milady/google/calendar/feed?",
        ) &&
        (init?.method ?? "GET") === "GET"
      ) {
        return jsonResponse(
          {
            error: "Request had insufficient authentication scopes.",
          },
          502,
        );
      }

      throw new Error(`Unexpected fetch ${init?.method ?? "GET"} ${url}`);
    });

    const statusRes = await req(
      port,
      "GET",
      "/api/lifeops/connectors/google/status?mode=cloud_managed",
    );
    expect(statusRes.status).toBe(200);
    expect(statusRes.data.connected).toBe(true);
    expect(statusRes.data.reason).toBe("connected");

    const feedRes = await req(
      port,
      "GET",
      "/api/lifeops/calendar/feed?mode=cloud_managed&timeZone=UTC&forceSync=true&timeMin=2099-04-04T00%3A00%3A00.000Z&timeMax=2099-04-05T00%3A00%3A00.000Z",
    );
    expect(feedRes.status).toBe(401);
    expect(String(feedRes.data.error)).toContain(
      "Google connector needs re-authentication",
    );
    expect(String(feedRes.data.error)).toContain(
      "insufficient authentication scopes",
    );

    const statusAfterRes = await req(
      port,
      "GET",
      "/api/lifeops/connectors/google/status?mode=cloud_managed",
    );
    expect(statusAfterRes.status).toBe(200);
    expect(statusAfterRes.data.connected).toBe(false);
    expect(statusAfterRes.data.reason).toBe("needs_reauth");
    expect(statusAfterRes.data.grant.metadata).toEqual(
      expect.objectContaining({
        authState: "needs_reauth",
        lastAuthError: expect.stringContaining(
          "insufficient authentication scopes",
        ),
      }),
    );
  });

  it("clears stale managed reauth state after the cloud connection is relinked", async () => {
    let linkedAt = "2026-04-04T15:00:00.000Z";
    let calendarFeedShouldFail = true;

    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const headers = new Headers(init?.headers);
      expect(headers.get("x-api-key")).toBe("ck-managed-google-test");

      if (
        url === "https://cloud.example/api/v1/milady/google/status?side=owner"
      ) {
        return jsonResponse({
          provider: "google",
          side: "owner",
          mode: "cloud_managed",
          configured: true,
          connected: true,
          reason: "connected",
          identity: {
            id: "google-user-managed",
            email: "founder@example.com",
            name: "Founder Example",
          },
          grantedCapabilities: [
            "google.basic_identity",
            "google.calendar.read",
          ],
          grantedScopes: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/calendar.readonly",
          ],
          expiresAt: "2026-04-10T03:00:43.112Z",
          hasRefreshToken: true,
          connectionId: "managed-google-connection",
          linkedAt,
          lastUsedAt: "2026-04-04T16:00:00.000Z",
        });
      }

      if (
        url.startsWith(
          "https://cloud.example/api/v1/milady/google/calendar/feed?",
        ) &&
        (init?.method ?? "GET") === "GET"
      ) {
        if (calendarFeedShouldFail) {
          return jsonResponse(
            {
              error: "Request had insufficient authentication scopes.",
            },
            502,
          );
        }
        return jsonResponse({
          calendarId: "primary",
          events: [],
          syncedAt: "2026-04-10T02:05:00.000Z",
        });
      }

      throw new Error(`Unexpected fetch ${init?.method ?? "GET"} ${url}`);
    });

    const firstFeedRes = await req(
      port,
      "GET",
      "/api/lifeops/calendar/feed?mode=cloud_managed&timeZone=UTC&forceSync=true&timeMin=2099-04-04T00%3A00%3A00.000Z&timeMax=2099-04-05T00%3A00%3A00.000Z",
    );
    expect(firstFeedRes.status).toBe(401);

    const staleStatusRes = await req(
      port,
      "GET",
      "/api/lifeops/connectors/google/status?mode=cloud_managed",
    );
    expect(staleStatusRes.status).toBe(200);
    expect(staleStatusRes.data.connected).toBe(false);
    expect(staleStatusRes.data.reason).toBe("needs_reauth");

    linkedAt = "2026-04-10T02:00:44.119Z";
    calendarFeedShouldFail = false;

    const relinkedStatusRes = await req(
      port,
      "GET",
      "/api/lifeops/connectors/google/status?mode=cloud_managed",
    );
    expect(relinkedStatusRes.status).toBe(200);
    expect(relinkedStatusRes.data.connected).toBe(true);
    expect(relinkedStatusRes.data.reason).toBe("connected");
    expect(relinkedStatusRes.data.grant.metadata.authState ?? null).toBeNull();
    expect(relinkedStatusRes.data.grant.metadata.lastAuthError ?? null).toBeNull();

    const feedAfterRelinkRes = await req(
      port,
      "GET",
      "/api/lifeops/calendar/feed?mode=cloud_managed&timeZone=UTC&forceSync=true&timeMin=2099-04-04T00%3A00%3A00.000Z&timeMax=2099-04-05T00%3A00%3A00.000Z",
    );
    expect(feedAfterRelinkRes.status).toBe(200);
    expect(feedAfterRelinkRes.data.source).toBe("synced");
  });
});
