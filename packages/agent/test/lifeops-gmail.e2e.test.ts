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

function createRuntimeForGmailTests(): AgentRuntime {
  const sqlite = new DatabaseSync(":memory:");
  let tasks: Task[] = [];
  const runtimeSubset = {
    agentId: "lifeops-gmail-agent",
    character: { name: "LifeOpsGmailAgent" } as AgentRuntime["character"],
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

describe("life-ops gmail triage", () => {
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
    stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "lifeops-gmail-"));
    process.env.ELIZA_STATE_DIR = stateDir;
    process.env.MILADY_STATE_DIR = stateDir;
    runtime = createRuntimeForGmailTests();

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
    await repository.deleteConnectorGrant("lifeops-gmail-agent", "google");
    await repository.deleteCalendarEventsForProvider(
      "lifeops-gmail-agent",
      "google",
    );
    await repository.deleteCalendarSyncState("lifeops-gmail-agent", "google");
    await repository.deleteGmailMessagesForProvider(
      "lifeops-gmail-agent",
      "google",
    );
    await repository.deleteGmailSyncState("lifeops-gmail-agent", "google");
  });

  async function connectGoogle(
    capabilities: string[],
    scopes: string[],
  ): Promise<void> {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "gmail-access-token",
          refresh_token: "gmail-refresh-token",
          expires_in: 3600,
          scope: scopes.join(" "),
          token_type: "Bearer",
          id_token: buildIdToken({
            sub: "google-user-gmail",
            email: "agent@example.com",
            email_verified: true,
            name: "Agent Example",
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
      `/api/lifeops/connectors/google/callback?state=${encodeURIComponent(authUrl.searchParams.get("state") ?? "")}&code=gmail-auth-code`,
    );
    expect(callbackRes.status).toBe(200);
  }

  async function expireStoredGoogleToken(): Promise<void> {
    const repository = new LifeOpsRepository(runtime);
    const grant = await repository.getConnectorGrant(
      "lifeops-gmail-agent",
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

  it("syncs gmail triage and links related mail into next-event context", async () => {
    await connectGoogle(
      ["google.calendar.read", "google.gmail.triage"],
      [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/gmail.readonly",
      ],
    );

    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (
        url.startsWith(
          "https://gmail.googleapis.com/gmail/v1/users/me/messages?",
        )
      ) {
        return new Response(
          JSON.stringify({
            messages: [{ id: "msg-1", threadId: "thread-1" }],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (url.includes("/gmail/v1/users/me/messages/msg-1?")) {
        return new Response(
          JSON.stringify({
            id: "msg-1",
            threadId: "thread-1",
            labelIds: ["INBOX", "UNREAD", "IMPORTANT"],
            snippet: "Can you confirm the review agenda and timing?",
            internalDate: String(Date.now() - 10 * 60_000),
            payload: {
              headers: [
                { name: "Subject", value: "Design review agenda" },
                { name: "From", value: "Friend <friend@example.com>" },
                { name: "To", value: "agent@example.com" },
                { name: "Message-Id", value: "<message-1@example.com>" },
              ],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (url.includes("/calendar/v3/calendars/primary/events?")) {
        const startAt = new Date(Date.now() + 25 * 60_000).toISOString();
        const endAt = new Date(Date.now() + 85 * 60_000).toISOString();
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "event-1",
                status: "confirmed",
                summary: "Design review",
                location: "Studio",
                start: {
                  dateTime: startAt,
                  timeZone: "UTC",
                },
                end: {
                  dateTime: endAt,
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
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const triageRes = await req(
      port,
      "GET",
      "/api/lifeops/gmail/triage?maxResults=5",
    );
    expect(triageRes.status).toBe(200);
    expect(triageRes.data.summary).toMatchObject({
      importantNewCount: 1,
      likelyReplyNeededCount: 1,
      unreadCount: 1,
    });
    expect(triageRes.data.messages[0]).toMatchObject({
      subject: "Design review agenda",
      likelyReplyNeeded: true,
      isImportant: true,
    });

    const needsResponseRes = await req(
      port,
      "GET",
      "/api/lifeops/gmail/needs-response?maxResults=5",
    );
    expect(needsResponseRes.status).toBe(200);
    expect(needsResponseRes.data.summary).toMatchObject({
      totalCount: 1,
      unreadCount: 1,
      importantCount: 1,
    });
    expect(needsResponseRes.data.messages).toEqual([
      expect.objectContaining({
        subject: "Design review agenda",
        likelyReplyNeeded: true,
      }),
    ]);

    const contextRes = await req(
      port,
      "GET",
      `/api/lifeops/calendar/next-context?timeZone=UTC&timeMin=${encodeURIComponent(new Date(Date.now() - 60_000).toISOString())}&timeMax=${encodeURIComponent(new Date(Date.now() + 24 * 60 * 60_000).toISOString())}`,
    );
    expect(contextRes.status).toBe(200);
    expect(contextRes.data.linkedMail).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subject: "Design review agenda",
          from: "Friend",
        }),
      ]),
    );
    expect(contextRes.data.linkedMailState).toBe("cache");
    expect(contextRes.data.linkedMailError).toBeNull();
  });

  it("ranks needs-response mail by triage score and excludes automated inbox noise", async () => {
    await connectGoogle(
      ["google.gmail.triage"],
      [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.readonly",
      ],
    );

    const nowMs = Date.now();
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (
        url.startsWith(
          "https://gmail.googleapis.com/gmail/v1/users/me/messages?",
        )
      ) {
        return new Response(
          JSON.stringify({
            messages: [
              { id: "msg-person", threadId: "thread-person" },
              { id: "msg-important", threadId: "thread-important" },
              { id: "msg-auto", threadId: "thread-auto" },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (url.includes("/gmail/v1/users/me/messages/msg-person?")) {
        return new Response(
          JSON.stringify({
            id: "msg-person",
            threadId: "thread-person",
            labelIds: ["INBOX", "UNREAD"],
            snippet: "Can you confirm the venue tonight?",
            internalDate: String(nowMs - 10 * 60_000),
            payload: {
              headers: [
                { name: "Subject", value: "Venue tonight" },
                { name: "From", value: "Alex <alex@example.com>" },
                { name: "To", value: "agent@example.com" },
                { name: "Message-Id", value: "<person@example.com>" },
              ],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (url.includes("/gmail/v1/users/me/messages/msg-important?")) {
        return new Response(
          JSON.stringify({
            id: "msg-important",
            threadId: "thread-important",
            labelIds: ["INBOX", "UNREAD", "IMPORTANT"],
            snippet: "Please send the final draft today.",
            internalDate: String(nowMs - 60 * 60_000),
            payload: {
              headers: [
                { name: "Subject", value: "Final draft today" },
                { name: "From", value: "Mira <mira@example.com>" },
                { name: "To", value: "agent@example.com" },
                { name: "Message-Id", value: "<important@example.com>" },
              ],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (url.includes("/gmail/v1/users/me/messages/msg-auto?")) {
        return new Response(
          JSON.stringify({
            id: "msg-auto",
            threadId: "thread-auto",
            labelIds: ["INBOX", "UNREAD"],
            snippet: "Your weekly digest is ready.",
            internalDate: String(nowMs - 5 * 60_000),
            payload: {
              headers: [
                { name: "Subject", value: "Weekly digest" },
                { name: "From", value: "Updates <noreply@example.com>" },
                { name: "To", value: "agent@example.com" },
                { name: "Auto-Submitted", value: "auto-generated" },
                { name: "Message-Id", value: "<auto@example.com>" },
              ],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const needsResponseRes = await req(
      port,
      "GET",
      "/api/lifeops/gmail/needs-response?maxResults=10",
    );
    expect(needsResponseRes.status).toBe(200);
    expect(needsResponseRes.data.summary).toMatchObject({
      totalCount: 2,
      unreadCount: 2,
      importantCount: 2,
    });
    expect(
      (needsResponseRes.data.messages as Array<Record<string, unknown>>).map(
        (message) => message.subject,
      ),
    ).toEqual(["Final draft today", "Venue tonight"]);
    expect(needsResponseRes.data.messages).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({
          subject: "Weekly digest",
        }),
      ]),
    );
  });

  it("searches Gmail by query, respects reply-needed filtering, and returns empty results cleanly", async () => {
    await connectGoogle(
      ["google.gmail.triage"],
      [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.readonly",
      ],
    );

    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("q=venue")) {
        return new Response(
          JSON.stringify({
            messages: [
              { id: "msg-venue", threadId: "thread-venue" },
              { id: "msg-auto", threadId: "thread-auto" },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (url.includes("q=missing-term")) {
        return new Response(JSON.stringify({ messages: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/gmail/v1/users/me/messages/msg-venue?")) {
        return new Response(
          JSON.stringify({
            id: "msg-venue",
            threadId: "thread-venue",
            labelIds: ["INBOX", "UNREAD", "IMPORTANT"],
            snippet: "Can you confirm the venue tonight?",
            internalDate: String(Date.now() - 12 * 60_000),
            payload: {
              headers: [
                { name: "Subject", value: "Venue tonight" },
                { name: "From", value: "Alex <alex@example.com>" },
                { name: "To", value: "agent@example.com" },
                { name: "Message-Id", value: "<venue@example.com>" },
              ],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (url.includes("/gmail/v1/users/me/messages/msg-auto?")) {
        return new Response(
          JSON.stringify({
            id: "msg-auto",
            threadId: "thread-auto",
            labelIds: ["INBOX", "UNREAD"],
            snippet: "Weekly digest",
            internalDate: String(Date.now() - 5 * 60_000),
            payload: {
              headers: [
                { name: "Subject", value: "Venue notes digest" },
                { name: "From", value: "Updates <noreply@example.com>" },
                { name: "To", value: "agent@example.com" },
                { name: "Auto-Submitted", value: "auto-generated" },
                { name: "Message-Id", value: "<auto@example.com>" },
              ],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const searchRes = await req(
      port,
      "GET",
      "/api/lifeops/gmail/search?query=venue&replyNeededOnly=true&maxResults=5",
    );
    expect(searchRes.status).toBe(200);
    expect(searchRes.data.query).toBe("venue");
    expect(searchRes.data.summary).toMatchObject({
      totalCount: 1,
      unreadCount: 1,
      importantCount: 1,
      replyNeededCount: 1,
    });
    expect(searchRes.data.messages).toEqual([
      expect.objectContaining({
        subject: "Venue tonight",
        likelyReplyNeeded: true,
      }),
    ]);

    const emptyRes = await req(
      port,
      "GET",
      "/api/lifeops/gmail/search?query=missing-term&maxResults=5",
    );
    expect(emptyRes.status).toBe(200);
    expect(emptyRes.data.summary).toMatchObject({
      totalCount: 0,
      unreadCount: 0,
      importantCount: 0,
      replyNeededCount: 0,
    });
    expect(emptyRes.data.messages).toEqual([]);
  });

  it("falls back to recent synced Gmail metadata when the connector lacks Gmail read scope", async () => {
    await connectGoogle(
      ["google.gmail.triage"],
      [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.metadata",
      ],
    );

    const seenUrls: string[] = [];
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      seenUrls.push(url);
      if (
        url.startsWith(
          "https://gmail.googleapis.com/gmail/v1/users/me/messages?",
        )
      ) {
        expect(url).not.toContain("q=");
        return new Response(
          JSON.stringify({
            messages: [{ id: "msg-suran-meta", threadId: "thread-suran-meta" }],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (url.includes("/gmail/v1/users/me/messages/msg-suran-meta?")) {
        return new Response(
          JSON.stringify({
            id: "msg-suran-meta",
            threadId: "thread-suran-meta",
            labelIds: ["INBOX", "UNREAD"],
            snippet: "Checking in about dinner tonight.",
            internalDate: String(Date.now() - 15 * 60_000),
            payload: {
              headers: [
                { name: "Subject", value: "Dinner tonight" },
                { name: "From", value: "Suran Lee <suran@example.com>" },
                { name: "To", value: "agent@example.com" },
                { name: "Message-Id", value: "<suran-meta@example.com>" },
              ],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const searchRes = await req(
      port,
      "GET",
      "/api/lifeops/gmail/search?query=from%3Asuran&maxResults=5",
    );

    expect(searchRes.status).toBe(200);
    expect(searchRes.data.query).toBe("from:suran");
    expect(searchRes.data.messages).toEqual([
      expect.objectContaining({
        subject: "Dinner tonight",
        fromEmail: "suran@example.com",
      }),
    ]);
    expect(
      seenUrls.some((url) => url.includes("q=from%3Asuran")),
    ).toBe(false);
  });

  it("matches sender, address, subject, and broad Gmail filters across operator and free-text queries", async () => {
    await connectGoogle(
      ["google.gmail.triage"],
      [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.readonly",
      ],
    );

    const nowMs = Date.now();
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (
        url.startsWith(
          "https://gmail.googleapis.com/gmail/v1/users/me/messages?",
        )
      ) {
        return new Response(
          JSON.stringify({
            messages: [
              { id: "msg-suran", threadId: "thread-suran" },
              { id: "msg-alex", threadId: "thread-alex" },
              { id: "msg-auto", threadId: "thread-auto" },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (url.includes("/gmail/v1/users/me/messages/msg-suran?")) {
        return new Response(
          JSON.stringify({
            id: "msg-suran",
            threadId: "thread-suran",
            labelIds: ["UNREAD", "CATEGORY_PERSONAL"],
            snippet: "Here is the agenda for tonight.",
            internalDate: String(nowMs - 12 * 60_000),
            payload: {
              headers: [
                { name: "Subject", value: "Dinner agenda" },
                { name: "From", value: "Suran Lee <suran@example.com>" },
                { name: "To", value: "agent@example.com" },
                { name: "Cc", value: "ops@example.com" },
                { name: "Message-Id", value: "<suran@example.com>" },
              ],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (url.includes("/gmail/v1/users/me/messages/msg-alex?")) {
        return new Response(
          JSON.stringify({
            id: "msg-alex",
            threadId: "thread-alex",
            labelIds: ["INBOX", "IMPORTANT"],
            snippet: "Invoice attached for the venue rental.",
            internalDate: String(nowMs - 30 * 60_000),
            payload: {
              headers: [
                { name: "Subject", value: "Venue invoice" },
                { name: "From", value: "Alex Stone <alex@example.com>" },
                { name: "To", value: "agent@example.com" },
                { name: "Message-Id", value: "<alex@example.com>" },
              ],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (url.includes("/gmail/v1/users/me/messages/msg-auto?")) {
        return new Response(
          JSON.stringify({
            id: "msg-auto",
            threadId: "thread-auto",
            labelIds: ["INBOX", "CATEGORY_UPDATES"],
            snippet: "Automated build summary.",
            internalDate: String(nowMs - 6 * 60_000),
            payload: {
              headers: [
                { name: "Subject", value: "Weekly build digest" },
                { name: "From", value: "CI Bot <noreply@example.com>" },
                { name: "To", value: "agent@example.com" },
                { name: "Auto-Submitted", value: "auto-generated" },
                { name: "Message-Id", value: "<auto@example.com>" },
              ],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const cases = [
      {
        query: "from:suran",
        expectedSubjects: ["Dinner agenda"],
      },
      {
        query: "from:suran@example.com",
        expectedSubjects: ["Dinner agenda"],
      },
      {
        query: 'from:"suran lee"',
        expectedSubjects: ["Dinner agenda"],
      },
      {
        query: "subject:agenda",
        expectedSubjects: ["Dinner agenda"],
      },
      {
        query: "cc:ops@example.com",
        expectedSubjects: ["Dinner agenda"],
      },
      {
        query: "suran agenda",
        expectedSubjects: ["Dinner agenda"],
      },
      {
        query: "from:alex@example.com venue",
        expectedSubjects: ["Venue invoice"],
      },
      {
        query: "invoice",
        expectedSubjects: ["Venue invoice"],
      },
      {
        query: "label:CATEGORY_PERSONAL",
        expectedSubjects: ["Dinner agenda"],
      },
      {
        query: "is:unread from:suran",
        expectedSubjects: ["Dinner agenda"],
      },
      {
        query: "in:anywhere from:suran",
        expectedSubjects: ["Dinner agenda"],
      },
    ] as const;

    for (const testCase of cases) {
      const response = await req(
        port,
        "GET",
        `/api/lifeops/gmail/search?query=${encodeURIComponent(testCase.query)}&maxResults=10`,
      );
      expect(response.status).toBe(200);
      expect(response.data.query).toBe(testCase.query);
      expect(
        (response.data.messages as Array<Record<string, unknown>>).map(
          (message) => String(message.subject),
        ),
      ).toEqual(testCase.expectedSubjects);
    }
  });

  it("creates batch Gmail reply drafts and sends confirmed batch follow-ups", async () => {
    await connectGoogle(
      ["google.gmail.triage", "google.gmail.send"],
      [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
      ],
    );

    const nowMs = Date.now();
    let sendCount = 0;
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (
        url.startsWith(
          "https://gmail.googleapis.com/gmail/v1/users/me/messages?",
        )
      ) {
        return new Response(
          JSON.stringify({
            messages: [
              { id: "msg-batch-1", threadId: "thread-batch-1" },
              { id: "msg-batch-2", threadId: "thread-batch-2" },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (url.includes("/gmail/v1/users/me/messages/msg-batch-1?")) {
        return new Response(
          JSON.stringify({
            id: "msg-batch-1",
            threadId: "thread-batch-1",
            labelIds: ["INBOX", "UNREAD"],
            snippet: "Can you send the agenda update?",
            internalDate: String(nowMs - 15 * 60_000),
            payload: {
              headers: [
                { name: "Subject", value: "Agenda update" },
                { name: "From", value: "Mira <mira@example.com>" },
                { name: "To", value: "agent@example.com" },
                { name: "Message-Id", value: "<batch-1@example.com>" },
              ],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (url.includes("/gmail/v1/users/me/messages/msg-batch-2?")) {
        return new Response(
          JSON.stringify({
            id: "msg-batch-2",
            threadId: "thread-batch-2",
            labelIds: ["INBOX", "UNREAD", "IMPORTANT"],
            snippet: "Please confirm the final plan.",
            internalDate: String(nowMs - 10 * 60_000),
            payload: {
              headers: [
                { name: "Subject", value: "Final plan" },
                { name: "From", value: "Alex <alex@example.com>" },
                { name: "To", value: "agent@example.com" },
                { name: "Message-Id", value: "<batch-2@example.com>" },
              ],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (url.endsWith("/gmail/v1/users/me/messages/send")) {
        const parsedBody = JSON.parse(String(init?.body ?? "{}")) as {
          raw?: string;
        };
        const raw = Buffer.from(
          String(parsedBody.raw ?? ""),
          "base64url",
        ).toString("utf-8");
        expect(raw).toContain("Subject: Re:");
        expect(raw).toContain("Best,");
        sendCount += 1;
        return new Response(JSON.stringify({ id: `sent-${sendCount}` }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const batchDraftRes = await req(
      port,
      "POST",
      "/api/lifeops/gmail/batch-reply-drafts",
      {
        replyNeededOnly: true,
        tone: "brief",
        intent: "Thanks. I will follow up shortly.",
        includeQuotedOriginal: false,
      },
    );
    expect(batchDraftRes.status).toBe(201);
    expect(batchDraftRes.data.batch.summary).toMatchObject({
      totalCount: 2,
      sendAllowedCount: 2,
      requiresConfirmationCount: 2,
    });
    expect(batchDraftRes.data.batch.drafts).toHaveLength(2);

    const sendRes = await req(
      port,
      "POST",
      "/api/lifeops/gmail/batch-reply-send",
      {
        confirmSend: true,
        items: (batchDraftRes.data.batch.drafts as Array<
          Record<string, unknown>
        >).map((draft) => ({
          messageId: String(draft.messageId),
          bodyText: String(draft.bodyText),
          subject: String(draft.subject),
          to: draft.to,
          cc: draft.cc,
        })),
      },
    );
    expect(sendRes.status).toBe(200);
    expect(sendRes.data).toEqual({ ok: true, sentCount: 2 });
  });

  it("rejects invalid Gmail search and batch send inputs", async () => {
    await connectGoogle(
      ["google.gmail.triage", "google.gmail.send"],
      [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
      ],
    );

    const invalidSearchRes = await req(
      port,
      "GET",
      "/api/lifeops/gmail/search?query=venue&replyNeededOnly=maybe",
    );
    expect(invalidSearchRes.status).toBe(400);
    expect(String(invalidSearchRes.data.error)).toContain("replyNeededOnly");

    const invalidDraftRes = await req(
      port,
      "POST",
      "/api/lifeops/gmail/batch-reply-drafts",
      {},
    );
    expect(invalidDraftRes.status).toBe(400);
    expect(String(invalidDraftRes.data.error)).toContain(
      "Either query, messageIds, or replyNeededOnly must be provided",
    );

    const invalidSendRes = await req(
      port,
      "POST",
      "/api/lifeops/gmail/batch-reply-send",
      {
        confirmSend: false,
        items: [],
      },
    );
    expect(invalidSendRes.status).toBe(409);
    expect(String(invalidSendRes.data.error)).toContain(
      "explicit confirmation",
    );
  });

  it("surfaces linked-mail errors in next-event context instead of silently hiding them", async () => {
    await connectGoogle(
      ["google.calendar.read", "google.gmail.triage"],
      [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/gmail.readonly",
      ],
    );

    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/calendar/v3/calendars/primary/events?")) {
        const startAt = new Date(Date.now() + 25 * 60_000).toISOString();
        const endAt = new Date(Date.now() + 85 * 60_000).toISOString();
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "event-err",
                status: "confirmed",
                summary: "Admin-blocked mail sync review",
                start: {
                  dateTime: startAt,
                  timeZone: "UTC",
                },
                end: {
                  dateTime: endAt,
                  timeZone: "UTC",
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (
        url.startsWith(
          "https://gmail.googleapis.com/gmail/v1/users/me/messages?",
        )
      ) {
        return new Response(
          JSON.stringify({
            error: {
              message: "Access blocked by your organization's admin policy.",
            },
          }),
          {
            status: 403,
            headers: { "content-type": "application/json" },
          },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const contextRes = await req(
      port,
      "GET",
      `/api/lifeops/calendar/next-context?timeZone=UTC&timeMin=${encodeURIComponent(new Date(Date.now() - 60_000).toISOString())}&timeMax=${encodeURIComponent(new Date(Date.now() + 24 * 60 * 60_000).toISOString())}`,
    );
    expect(contextRes.status).toBe(200);
    expect(contextRes.data.event).toMatchObject({
      title: "Admin-blocked mail sync review",
    });
    expect(contextRes.data.linkedMail).toEqual([]);
    expect(contextRes.data.linkedMailState).toBe("error");
    expect(String(contextRes.data.linkedMailError)).toContain(
      "Google Workspace policy blocked the request",
    );
  });

  it("creates reply drafts and blocks sends without explicit confirmation", async () => {
    await connectGoogle(
      ["google.gmail.triage"],
      [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.readonly",
      ],
    );

    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (
        url.startsWith(
          "https://gmail.googleapis.com/gmail/v1/users/me/messages?",
        )
      ) {
        return new Response(
          JSON.stringify({
            messages: [{ id: "msg-2", threadId: "thread-2" }],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (url.includes("/gmail/v1/users/me/messages/msg-2?")) {
        return new Response(
          JSON.stringify({
            id: "msg-2",
            threadId: "thread-2",
            labelIds: ["INBOX", "UNREAD"],
            snippet: "Please send the revised plan when you can.",
            internalDate: String(Date.now() - 5 * 60_000),
            payload: {
              headers: [
                { name: "Subject", value: "Revised plan" },
                { name: "From", value: "Mira <mira@example.com>" },
                { name: "To", value: "agent@example.com" },
                { name: "Message-Id", value: "<message-2@example.com>" },
              ],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const triageRes = await req(port, "GET", "/api/lifeops/gmail/triage");
    expect(triageRes.status).toBe(200);
    const messageId = String(triageRes.data.messages[0].id);

    const draftRes = await req(
      port,
      "POST",
      "/api/lifeops/gmail/reply-drafts",
      {
        messageId,
        tone: "neutral",
        intent: "I will send the revised plan this afternoon.",
      },
    );
    expect(draftRes.status).toBe(201);
    expect(draftRes.data.draft).toMatchObject({
      messageId,
      sendAllowed: false,
      requiresConfirmation: true,
      to: ["mira@example.com"],
    });
    expect(String(draftRes.data.draft.bodyText)).toContain(
      "I will send the revised plan this afternoon.",
    );

    const blockedSendRes = await req(
      port,
      "POST",
      "/api/lifeops/gmail/reply-send",
      {
        messageId,
        bodyText: "Sending the revised plan shortly.",
        confirmSend: false,
      },
    );
    expect(blockedSendRes.status).toBe(409);
    expect(String(blockedSendRes.data.error)).toContain(
      "explicit confirmation",
    );
  });

  it("sends confirmed replies when gmail send permission is granted", async () => {
    await connectGoogle(
      ["google.gmail.triage", "google.gmail.send"],
      [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
      ],
    );

    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (
        url.startsWith(
          "https://gmail.googleapis.com/gmail/v1/users/me/messages?",
        )
      ) {
        return new Response(
          JSON.stringify({
            messages: [{ id: "msg-3", threadId: "thread-3" }],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (url.includes("/gmail/v1/users/me/messages/msg-3?")) {
        return new Response(
          JSON.stringify({
            id: "msg-3",
            threadId: "thread-3",
            labelIds: ["INBOX", "UNREAD"],
            snippet: "Can you send the final draft?",
            internalDate: String(Date.now() - 5 * 60_000),
            payload: {
              headers: [
                { name: "Subject", value: "Final draft" },
                { name: "From", value: "Mira <mira@example.com>" },
                { name: "To", value: "agent@example.com" },
                { name: "Message-Id", value: "<message-3@example.com>" },
                { name: "References", value: "<thread-root@example.com>" },
              ],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (url.endsWith("/gmail/v1/users/me/messages/send")) {
        const parsedBody = JSON.parse(String(init?.body ?? "{}")) as {
          raw?: string;
        };
        const raw = Buffer.from(
          String(parsedBody.raw ?? ""),
          "base64url",
        ).toString("utf-8");
        expect(raw).toContain("To: mira@example.com");
        expect(raw).toContain("Subject: Re: Final draft");
        expect(raw).toContain("In-Reply-To: <message-3@example.com>");
        expect(raw).toContain(
          "References: <thread-root@example.com> <message-3@example.com>",
        );
        expect(raw).toContain("Here is the final draft.");
        return new Response(JSON.stringify({ id: "sent-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const triageRes = await req(port, "GET", "/api/lifeops/gmail/triage");
    expect(triageRes.status).toBe(200);
    const messageId = String(triageRes.data.messages[0].id);

    const sendRes = await req(port, "POST", "/api/lifeops/gmail/reply-send", {
      messageId,
      bodyText: "Here is the final draft.",
      confirmSend: true,
    });
    expect(sendRes.status).toBe(200);
    expect(sendRes.data).toEqual({ ok: true });
  });

  it("rejects confirmed sends when the selected message has no replyable recipient", async () => {
    await connectGoogle(
      ["google.gmail.triage", "google.gmail.send"],
      [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
      ],
    );

    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (
        url.startsWith(
          "https://gmail.googleapis.com/gmail/v1/users/me/messages?",
        )
      ) {
        return new Response(
          JSON.stringify({
            messages: [
              { id: "msg-no-recipient", threadId: "thread-no-recipient" },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (url.includes("/gmail/v1/users/me/messages/msg-no-recipient?")) {
        return new Response(
          JSON.stringify({
            id: "msg-no-recipient",
            threadId: "thread-no-recipient",
            labelIds: ["INBOX", "UNREAD"],
            snippet: "System status summary",
            internalDate: String(Date.now() - 5 * 60_000),
            payload: {
              headers: [
                { name: "Subject", value: "System status summary" },
                { name: "From", value: "Milady System Updates" },
                { name: "To", value: "agent@example.com" },
                {
                  name: "Message-Id",
                  value: "<message-no-recipient@example.com>",
                },
              ],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const triageRes = await req(port, "GET", "/api/lifeops/gmail/triage");
    expect(triageRes.status).toBe(200);
    const messageId = String(triageRes.data.messages[0].id);

    const sendRes = await req(port, "POST", "/api/lifeops/gmail/reply-send", {
      messageId,
      bodyText: "Acknowledged.",
      confirmSend: true,
    });
    expect(sendRes.status).toBe(409);
    expect(String(sendRes.data.error)).toContain("no replyable recipient");
  });

  it("marks the Gmail connector for reauth when token refresh is revoked", async () => {
    await connectGoogle(
      ["google.gmail.triage"],
      [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.readonly",
      ],
    );
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

    const triageRes = await req(port, "GET", "/api/lifeops/gmail/triage");
    expect(triageRes.status).toBe(401);
    expect(String(triageRes.data.error)).toContain(
      "Google connector needs re-authentication",
    );

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
  });

  it("adds gmail capabilities through explicit re-consent after calendar is already connected", async () => {
    await connectGoogle(
      ["google.calendar.read"],
      [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/calendar.readonly",
      ],
    );

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "gmail-upgrade-access-token",
          refresh_token: "gmail-upgrade-refresh-token",
          expires_in: 3600,
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/calendar.readonly",
            "https://www.googleapis.com/auth/gmail.readonly",
          ].join(" "),
          token_type: "Bearer",
          id_token: buildIdToken({
            sub: "google-user-gmail-upgrade",
            email: "agent@example.com",
            email_verified: true,
            name: "Agent Example",
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
        capabilities: ["google.gmail.triage"],
      },
    );
    expect(startRes.status).toBe(200);
    expect(startRes.data.requestedCapabilities).toEqual(
      expect.arrayContaining([
        "google.basic_identity",
        "google.calendar.read",
        "google.gmail.triage",
      ]),
    );

    const authUrl = new URL(String(startRes.data.authUrl));
    const callbackRes = await req(
      port,
      "GET",
      `/api/lifeops/connectors/google/callback?state=${encodeURIComponent(authUrl.searchParams.get("state") ?? "")}&code=gmail-upgrade-code`,
    );
    expect(callbackRes.status).toBe(200);

    const statusRes = await req(
      port,
      "GET",
      "/api/lifeops/connectors/google/status",
    );
    expect(statusRes.status).toBe(200);
    expect(statusRes.data.grantedCapabilities).toEqual(
      expect.arrayContaining(["google.calendar.read", "google.gmail.triage"]),
    );
  });
});
