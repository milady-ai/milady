import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentRuntime } from "@elizaos/core";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  createConversation,
  postConversationMessage,
} from "../../../test/helpers/http";
import { saveEnv } from "../../../test/helpers/test-utils";
import { createLifeOpsChatTestRuntime } from "./helpers/lifeops-chat-runtime";
import { gmailAction } from "../src/actions/gmail";
import { startApiServer } from "../src/api/server";
import { resolveOAuthDir } from "../src/config/paths";
import {
  createLifeOpsConnectorGrant,
  LifeOpsRepository,
} from "../src/lifeops/repository";

const AGENT_ID = "lifeops-gmail-chat-agent";
const GOOGLE_GMAIL_MESSAGES_ENDPOINT =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages";

function buildMetadataMessage(args: {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  snippet: string;
  internalDate: string;
  labelIds?: string[];
  bodyText?: string;
}): Record<string, unknown> {
  return {
    id: args.id,
    threadId: args.threadId,
    labelIds: args.labelIds ?? ["INBOX"],
    snippet: args.snippet,
    internalDate: args.internalDate,
    payload: {
      mimeType: "multipart/alternative",
      headers: [
        { name: "Subject", value: args.subject },
        { name: "From", value: args.from },
        { name: "To", value: args.to },
        {
          name: "Date",
          value: new Date(Number(args.internalDate)).toUTCString(),
        },
      ],
      parts: args.bodyText
        ? [
            {
              mimeType: "text/plain",
              body: {
                data: Buffer.from(args.bodyText, "utf-8").toString("base64url"),
              },
            },
          ]
        : undefined,
    },
  };
}

async function seedLocalGmail(runtime: AgentRuntime, stateDir: string) {
  const repository = new LifeOpsRepository(runtime);
  const tokenRef = `${AGENT_ID}/owner/local.json`;
  const tokenPath = path.join(
    resolveOAuthDir(process.env, stateDir),
    "lifeops",
    "google",
    tokenRef,
  );
  const tokenDir = path.dirname(tokenPath);
  await fs.promises.mkdir(tokenDir, { recursive: true, mode: 0o700 });
  const nowIso = new Date().toISOString();
  await fs.promises.writeFile(
    tokenPath,
    JSON.stringify(
      {
        provider: "google",
        agentId: AGENT_ID,
        side: "owner",
        mode: "local",
        clientId: "lifeops-gmail-chat-client",
        redirectUri: "http://127.0.0.1/callback",
        accessToken: "gmail-chat-access-token",
        refreshToken: "gmail-chat-refresh-token",
        tokenType: "Bearer",
        grantedScopes: [
          "openid",
          "email",
          "profile",
          "https://www.googleapis.com/auth/gmail.readonly",
        ],
        expiresAt: Date.now() + 60 * 60 * 1000,
        refreshTokenExpiresAt: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      null,
      2,
    ),
    { encoding: "utf-8", mode: 0o600 },
  );

  await repository.upsertConnectorGrant(
    createLifeOpsConnectorGrant({
      agentId: AGENT_ID,
      provider: "google",
      side: "owner",
      identity: {
        email: "shawmakesmagic@gmail.com",
        name: "Shaw",
      },
      grantedScopes: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.readonly",
      ],
      capabilities: ["google.basic_identity", "google.gmail.triage"],
      tokenRef,
      mode: "local",
      metadata: {},
      lastRefreshAt: nowIso,
    }),
  );
}

describe("life-ops gmail chat transcripts", () => {
  let port = 0;
  let closeServer: (() => Promise<void>) | null = null;
  let stateDir = "";
  let runtime: AgentRuntime;
  let envBackup: { restore: () => void };
  const fetchMock = vi.fn<typeof fetch>();

  const messageFixtures = new Map<string, Record<string, unknown>>([
    [
      "msg-suran-recent",
      buildMetadataMessage({
        id: "msg-suran-recent",
        threadId: "thread-suran-recent",
        subject: "Suran follow-up",
        from: "Suran Lee <suran@example.com>",
        to: "Shaw <shawmakesmagic@gmail.com>",
        snippet: "Wanted to follow up on the last few weeks.",
        internalDate: String(Date.parse("2026-04-08T16:00:00.000Z")),
        labelIds: ["INBOX", "UNREAD"],
        bodyText:
          "Hey Shaw,\n\nWanted to follow up on the last few weeks and see if you had time to review the notes.\n\nBest,\nSuran",
      }),
    ],
    [
      "msg-suran-old",
      buildMetadataMessage({
        id: "msg-suran-old",
        threadId: "thread-suran-old",
        subject: "Older Suran note",
        from: "Suran Lee <suran@example.com>",
        to: "Shaw <shawmakesmagic@gmail.com>",
        snippet: "This is the older message outside the window.",
        internalDate: String(Date.parse("2026-03-01T16:00:00.000Z")),
        labelIds: ["INBOX"],
      }),
    ],
    [
      "msg-alex-unread",
      buildMetadataMessage({
        id: "msg-alex-unread",
        threadId: "thread-alex-unread",
        subject: "Alex venue update",
        from: "Alex <alex@example.com>",
        to: "Shaw <shawmakesmagic@gmail.com>",
        snippet: "Please confirm the venue.",
        internalDate: String(Date.parse("2026-04-09T12:00:00.000Z")),
        labelIds: ["INBOX", "UNREAD"],
      }),
    ],
    [
      "msg-venue-reply",
      buildMetadataMessage({
        id: "msg-venue-reply",
        threadId: "thread-venue-reply",
        subject: "Venue confirmation",
        from: "Morgan <morgan@example.com>",
        to: "Shaw <shawmakesmagic@gmail.com>",
        snippet: "Can you confirm the venue for tomorrow?",
        internalDate: String(Date.parse("2026-04-09T15:00:00.000Z")),
        labelIds: ["INBOX", "UNREAD", "IMPORTANT"],
      }),
    ],
  ]);

  beforeAll(async () => {
    envBackup = saveEnv(
      "ELIZA_STATE_DIR",
      "MILADY_GOOGLE_OAUTH_DESKTOP_CLIENT_ID",
    );
    stateDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "lifeops-gmail-chat-"),
    );
    process.env.ELIZA_STATE_DIR = stateDir;
    process.env.MILADY_GOOGLE_OAUTH_DESKTOP_CLIENT_ID =
      "lifeops-gmail-chat-client";
    runtime = createLifeOpsChatTestRuntime({
      agentId: AGENT_ID,
      useModel: async (_modelType: unknown, params?: { prompt?: string }) => {
        const prompt = String(params?.prompt ?? "");
        const promptLower = prompt.toLowerCase();
        if (prompt.includes("Plan the Gmail action for this request.")) {
          if (
            promptLower.includes("suran me escribió") ||
            promptLower.includes("suran me escribio")
          ) {
            return '{"subaction":"search","queries":["from:suran"]}';
          }
          return '{"subaction":null,"queries":[]}';
        }
        return "<response></response>";
      },
      handleTurn: async ({ runtime: runtimeArg, message, state }) => {
        const result = await gmailAction.handler?.(
          runtimeArg,
          message as never,
          state,
          {
            parameters: {},
          } as never,
        );
        return {
          text:
            typeof result?.text === "string" && result.text.trim().length > 0
              ? result.text
              : "I couldn't find anything in your email.",
          data: result?.data,
        };
      },
    });
    await seedLocalGmail(runtime, stateDir);

    fetchMock.mockImplementation(async (input) => {
      const url =
        typeof input === "string" ? new URL(input) : new URL(input.url);
      if (url.origin + url.pathname === GOOGLE_GMAIL_MESSAGES_ENDPOINT) {
        const query = String(url.searchParams.get("q") ?? "").toLowerCase();
        let ids: string[] = [];
        if (query.includes("from:suran") || query.includes('from:"suran"')) {
          ids = query.includes("newer_than:21d")
            ? ["msg-suran-recent"]
            : ["msg-suran-recent", "msg-suran-old"];
        } else if (/\bsuran\b/.test(query)) {
          ids = ["msg-suran-recent", "msg-suran-old"];
        } else if (query.includes("alex@example.com")) {
          ids = ["msg-alex-unread"];
        } else if (query.includes("venue")) {
          ids = ["msg-venue-reply"];
        }
        if (query.includes("is:unread") && ids.length > 0) {
          ids = ids.filter((id) => {
            const labelIds = messageFixtures.get(id)?.labelIds;
            return Array.isArray(labelIds) && labelIds.includes("UNREAD");
          });
        }
        return new Response(
          JSON.stringify({
            messages: ids.map((id) => ({
              id,
              threadId: String(
                messageFixtures.get(id)?.threadId ?? `thread-${id}`,
              ),
            })),
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }

      if (url.href.startsWith(`${GOOGLE_GMAIL_MESSAGES_ENDPOINT}/`)) {
        const messageId = decodeURIComponent(
          url.pathname.split("/").pop() ?? "",
        );
        const fixture = messageFixtures.get(messageId);
        if (!fixture) {
          return new Response(
            JSON.stringify({ error: { message: "Message not found" } }),
            {
              status: 404,
              headers: { "content-type": "application/json" },
            },
          );
        }
        return new Response(JSON.stringify(fixture), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ error: { message: "Unhandled fetch" } }),
        {
          status: 500,
          headers: { "content-type": "application/json" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const server = await startApiServer({
      port: 0,
      runtime,
    });
    port = server.port;
    closeServer = server.close;
  }, 60_000);

  afterAll(async () => {
    vi.unstubAllGlobals();
    if (closeServer) {
      await closeServer();
    }
    await fs.promises.rm(stateDir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
    envBackup.restore();
  });

  beforeEach(() => {
    process.env.MILADY_GOOGLE_OAUTH_DESKTOP_CLIENT_ID =
      "lifeops-gmail-chat-client";
    fetchMock.mockClear();
  });

  it("handles sender and timeframe Gmail searches through the Discord chat transcript", async () => {
    const { conversationId } = await createConversation(port, {
      includeGreeting: false,
      title: "LifeOps Gmail sender/timeframe transcript",
    });

    const direct = await postConversationMessage(port, conversationId, {
      text: "look for all emails sent to me from suran in the last few weeks",
      source: "discord",
    });
    expect(direct.status).toBe(200);
    expect(String(direct.data.text ?? "")).toContain("Suran follow-up");
    expect(String(direct.data.text ?? "")).toContain("last 21 days");
    expect(String(direct.data.text ?? "")).not.toContain("Older Suran note");
  });

  it("handles unread and reply-needed Gmail transcript questions end to end", async () => {
    const { conversationId } = await createConversation(port, {
      includeGreeting: false,
      title: "LifeOps Gmail unread and reply-needed transcript",
    });

    const unread = await postConversationMessage(port, conversationId, {
      text: "show unread emails from alex@example.com",
      source: "discord",
    });
    expect(unread.status).toBe(200);
    expect(String(unread.data.text ?? "")).toContain("Alex venue update");
    expect(String(unread.data.text ?? "")).toContain("unread");

    const replyNeeded = await postConversationMessage(port, conversationId, {
      text: "which emails need a reply about venue",
      source: "discord",
    });
    expect(replyNeeded.status).toBe(200);
    expect(String(replyNeeded.data.text ?? "")).toContain("Venue confirmation");
    expect(String(replyNeeded.data.text ?? "")).toContain("reply needed");
  });

  it("finds suran's email with 'find the last email suran sent me'", async () => {
    const { conversationId } = await createConversation(port, {
      includeGreeting: false,
      title: "Reverse sender phrasing",
    });

    const result = await postConversationMessage(port, conversationId, {
      text: "find the last email suran sent me",
      source: "discord",
    });
    expect(result.status).toBe(200);
    const text = String(result.data.text ?? "");
    expect(text).toContain("Suran");
  });

  it("finds suran's email with bare name 'just search suran'", async () => {
    const { conversationId } = await createConversation(port, {
      includeGreeting: false,
      title: "Bare name search",
    });

    const result = await postConversationMessage(port, conversationId, {
      text: "just search suran",
      source: "discord",
    });
    expect(result.status).toBe(200);
    const text = String(result.data.text ?? "");
    expect(text).toContain("Suran");
  });

  it("finds suran's email from the natural-language question about anyone named suran", async () => {
    const { conversationId } = await createConversation(port, {
      includeGreeting: false,
      title: "Narrative sender search",
    });

    const result = await postConversationMessage(port, conversationId, {
      text: "can you search my email and tell me if anyone named suran emailed me",
      source: "discord",
    });
    expect(result.status).toBe(200);
    const text = String(result.data.text ?? "");
    expect(text).toContain("Suran");
  });

  it("finds suran's email with question form 'did suran email me'", async () => {
    const { conversationId } = await createConversation(port, {
      includeGreeting: false,
      title: "Question-form sender search",
    });

    const result = await postConversationMessage(port, conversationId, {
      text: "did suran email me",
      source: "discord",
    });
    expect(result.status).toBe(200);
    const text = String(result.data.text ?? "");
    expect(text).toContain("Suran");
  });

  it("finds suran's email from a non-English Gmail question", async () => {
    const { conversationId } = await createConversation(port, {
      includeGreeting: false,
      title: "Non-English Gmail sender search",
    });

    const result = await postConversationMessage(port, conversationId, {
      text: "puedes buscar en mi correo y decirme si suran me escribió",
      source: "discord",
    });
    expect(result.status).toBe(200);
    const text = String(result.data.text ?? "");
    expect(text).toContain("Suran");
  });

  it("finds suran's email with narrative phrasing about anyone named suran", async () => {
    const { conversationId } = await createConversation(port, {
      includeGreeting: false,
      title: "Narrative sender search",
    });

    const result = await postConversationMessage(port, conversationId, {
      text: "can you search my email and tell me if anyone named suran emailed me",
      source: "discord",
    });
    expect(result.status).toBe(200);
    const text = String(result.data.text ?? "");
    expect(text).toContain("Suran");
  });

  it("retries search on 'yeah try it' follow-up after initial search", async () => {
    const { conversationId } = await createConversation(port, {
      includeGreeting: false,
      title: "Retry follow-up",
    });

    const initial = await postConversationMessage(port, conversationId, {
      text: "find emails from suran",
      source: "discord",
    });
    expect(initial.status).toBe(200);
    expect(String(initial.data.text ?? "")).toContain("Suran");

    const retry = await postConversationMessage(port, conversationId, {
      text: "yeah try it",
      source: "discord",
    });
    expect(retry.status).toBe(200);
    const retryText = String(retry.data.text ?? "");
    expect(retryText).toContain("Suran");
  });

  it("refines search on 'what about unread ones?' after initial search", async () => {
    const { conversationId } = await createConversation(port, {
      includeGreeting: false,
      title: "Unread refinement follow-up",
    });

    const initial = await postConversationMessage(port, conversationId, {
      text: "find emails from suran",
      source: "discord",
    });
    expect(initial.status).toBe(200);
    expect(String(initial.data.text ?? "")).toContain("Suran");

    const refined = await postConversationMessage(port, conversationId, {
      text: "what about unread ones?",
      source: "discord",
    });
    expect(refined.status).toBe(200);
    const refinedText = String(refined.data.text ?? "");
    expect(refinedText).toContain("Suran follow-up");
    expect(refinedText).not.toContain("Older Suran note");
  });

  it("reads the body of a previously found Gmail message in follow-up chat", async () => {
    const { conversationId } = await createConversation(port, {
      includeGreeting: false,
      title: "LifeOps Gmail read follow-up transcript",
    });

    const search = await postConversationMessage(port, conversationId, {
      text: "find an email from suran",
      source: "discord",
    });
    expect(search.status).toBe(200);
    expect(String(search.data.text ?? "")).toContain("Suran follow-up");

    const read = await postConversationMessage(port, conversationId, {
      text: "yeah, can you read it to me?",
      source: "discord",
    });
    expect(read.status).toBe(200);
    expect(String(read.data.text ?? "")).toContain("Suran follow-up");
    expect(String(read.data.text ?? "")).toContain(
      "Wanted to follow up on the last few weeks",
    );
    expect(String(read.data.text ?? "")).toContain("Best,");
  });
});
