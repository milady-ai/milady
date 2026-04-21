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
import { req } from "../../../test/helpers/http";
import { saveEnv } from "../../../test/helpers/test-utils";
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

function createRuntimeForGoogleOauthTests(): AgentRuntime {
  const sqlite = new DatabaseSync(":memory:");
  let tasks: Task[] = [];
  const runtimeSubset = {
    agentId: "lifeops-google-agent",
    character: { name: "LifeOpsGoogleAgent" } as AgentRuntime["character"],
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
                ...((task.metadata as Record<string, unknown> | undefined) ?? {}),
                ...((update.metadata as Record<string, unknown> | undefined) ?? {}),
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

describe("life-ops Google OAuth foundation", () => {
  let port = 0;
  let closeServer: (() => Promise<void>) | null = null;
  let envBackup: { restore: () => void };
  let stateDir = "";
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
    stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "lifeops-google-oauth-"));
    process.env.ELIZA_STATE_DIR = stateDir;
    process.env.MILADY_STATE_DIR = stateDir;

    const server = await startApiServer({
      port: 0,
      runtime: createRuntimeForGoogleOauthTests(),
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
    await fs.rm(path.join(stateDir, "credentials"), {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 50,
    });
  });

  it("completes desktop local OAuth and persists a Google connector grant", async () => {
    process.env.MILADY_GOOGLE_OAUTH_DESKTOP_CLIENT_ID = "desktop-client-id";

    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      expect(url).toBe("https://oauth2.googleapis.com/token");
      const params = new URLSearchParams(String(init?.body ?? ""));
      expect(params.get("client_id")).toBe("desktop-client-id");
      expect(params.get("grant_type")).toBe("authorization_code");
      expect(params.get("redirect_uri")).toBe(
        `http://127.0.0.1:${port}/api/lifeops/connectors/google/callback`,
      );
      expect(params.get("client_secret")).toBeNull();
      expect(params.get("code")).toBe("desktop-auth-code");
      expect(params.get("code_verifier")).toBeTruthy();

      return new Response(
        JSON.stringify({
          access_token: "desktop-access-token",
          refresh_token: "desktop-refresh-token",
          expires_in: 3600,
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/calendar.readonly",
          ].join(" "),
          token_type: "Bearer",
          id_token: buildIdToken({
            sub: "google-user-1",
            email: "agent@example.com",
            email_verified: true,
            name: "Agent Example",
            picture: "https://example.com/avatar.png",
          }),
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });

    const startRes = await req(port, "POST", "/api/lifeops/connectors/google/start", {
      capabilities: ["google.calendar.read"],
    });
    expect(startRes.status).toBe(200);
    expect(startRes.data.provider).toBe("google");
    expect(startRes.data.mode).toBe("local");
    expect(startRes.data.requestedCapabilities).toEqual([
      "google.basic_identity",
      "google.calendar.read",
    ]);
    expect(startRes.data.redirectUri).toBe(
      `http://127.0.0.1:${port}/api/lifeops/connectors/google/callback`,
    );

    const authUrl = new URL(String(startRes.data.authUrl));
    expect(authUrl.origin + authUrl.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(authUrl.searchParams.get("client_id")).toBe("desktop-client-id");
    expect(authUrl.searchParams.get("redirect_uri")).toBe(
      `http://127.0.0.1:${port}/api/lifeops/connectors/google/callback`,
    );
    expect(authUrl.searchParams.get("access_type")).toBe("offline");
    expect(authUrl.searchParams.get("prompt")).toBe("consent");
    expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authUrl.searchParams.get("scope")?.split(" ")).toEqual(
      expect.arrayContaining([
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/calendar.readonly",
      ]),
    );

    const callbackRes = await req(
      port,
      "GET",
      `/api/lifeops/connectors/google/callback?state=${encodeURIComponent(authUrl.searchParams.get("state") ?? "")}&code=desktop-auth-code`,
    );
    expect(callbackRes.status).toBe(200);
    expect(String(callbackRes.data._raw)).toContain("Google Connected");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const statusRes = await req(port, "GET", "/api/lifeops/connectors/google/status");
    expect(statusRes.status).toBe(200);
    expect(statusRes.data.connected).toBe(true);
    expect(statusRes.data.reason).toBe("connected");
    expect(statusRes.data.mode).toBe("local");
    expect(statusRes.data.grantedCapabilities).toEqual([
      "google.basic_identity",
      "google.calendar.read",
    ]);
    expect(statusRes.data.grantedScopes).toEqual(
      expect.arrayContaining([
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/calendar.readonly",
      ]),
    );
    expect((statusRes.data.identity as Record<string, unknown>).email).toBe(
      "agent@example.com",
    );
    expect(statusRes.data.hasRefreshToken).toBe(true);

    const grant = statusRes.data.grant as Record<string, unknown>;
    const tokenRef = String(grant.tokenRef);
    const tokenPath = path.join(resolveOAuthDir(process.env, stateDir), "lifeops", "google", tokenRef);
    const storedToken = JSON.parse(await fs.readFile(tokenPath, "utf-8")) as {
      refreshToken: string;
      accessToken: string;
      mode: string;
    };
    expect(storedToken.refreshToken).toBe("desktop-refresh-token");
    expect(storedToken.accessToken).toBe("desktop-access-token");
    expect(storedToken.mode).toBe("local");
  });

  it("completes remote OAuth, returns the same status contract, and disconnects cleanly", async () => {
    process.env.MILADY_GOOGLE_OAUTH_WEB_CLIENT_ID = "web-client-id";
    process.env.MILADY_GOOGLE_OAUTH_WEB_CLIENT_SECRET = "web-client-secret";
    process.env.MILADY_GOOGLE_OAUTH_PUBLIC_BASE_URL = "https://milady.example.com";

    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      expect(url).toBe("https://oauth2.googleapis.com/token");
      const params = new URLSearchParams(String(init?.body ?? ""));
      expect(params.get("client_id")).toBe("web-client-id");
      expect(params.get("client_secret")).toBe("web-client-secret");
      expect(params.get("grant_type")).toBe("authorization_code");
      expect(params.get("redirect_uri")).toBe(
        "https://milady.example.com/api/lifeops/connectors/google/callback",
      );
      expect(params.get("code")).toBe("remote-auth-code");
      return new Response(
        JSON.stringify({
          access_token: "remote-access-token",
          refresh_token: "remote-refresh-token",
          expires_in: 7200,
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/calendar.readonly",
            "https://www.googleapis.com/auth/calendar.events",
          ].join(" "),
          token_type: "Bearer",
          id_token: buildIdToken({
            sub: "google-user-2",
            email: "remote@example.com",
            email_verified: true,
            name: "Remote Example",
          }),
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });

    const startRes = await req(port, "POST", "/api/lifeops/connectors/google/start", {
      mode: "remote",
      capabilities: ["google.calendar.write"],
    });
    expect(startRes.status).toBe(200);
    expect(startRes.data.mode).toBe("remote");
    expect(startRes.data.redirectUri).toBe(
      "https://milady.example.com/api/lifeops/connectors/google/callback",
    );
    expect(startRes.data.requestedCapabilities).toEqual([
      "google.basic_identity",
      "google.calendar.write",
    ]);

    const authUrl = new URL(String(startRes.data.authUrl));
    expect(authUrl.searchParams.get("client_id")).toBe("web-client-id");
    expect(authUrl.searchParams.get("redirect_uri")).toBe(
      "https://milady.example.com/api/lifeops/connectors/google/callback",
    );
    expect(authUrl.searchParams.get("scope")?.split(" ")).toEqual(
      expect.arrayContaining([
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/calendar.events",
      ]),
    );

    const callbackRes = await req(
      port,
      "GET",
      `/api/lifeops/connectors/google/callback?state=${encodeURIComponent(authUrl.searchParams.get("state") ?? "")}&code=remote-auth-code`,
    );
    expect(callbackRes.status).toBe(200);

    const statusRes = await req(
      port,
      "GET",
      "/api/lifeops/connectors/google/status?mode=remote",
    );
    expect(statusRes.status).toBe(200);
    expect(statusRes.data.connected).toBe(true);
    expect(statusRes.data.mode).toBe("remote");
    expect(statusRes.data.reason).toBe("connected");
    expect(statusRes.data.grantedCapabilities).toEqual([
      "google.basic_identity",
      "google.calendar.read",
      "google.calendar.write",
    ]);
    expect((statusRes.data.identity as Record<string, unknown>).email).toBe(
      "remote@example.com",
    );

    const grant = statusRes.data.grant as Record<string, unknown>;
    const tokenPath = path.join(
      resolveOAuthDir(process.env, stateDir),
      "lifeops",
      "google",
      String(grant.tokenRef),
    );
    expect(await fs.stat(tokenPath)).toBeTruthy();

    const disconnectRes = await req(
      port,
      "POST",
      "/api/lifeops/connectors/google/disconnect",
      { mode: "remote" },
    );
    expect(disconnectRes.status).toBe(200);
    expect(disconnectRes.data.connected).toBe(false);
    expect(disconnectRes.data.reason).toBe("disconnected");
    expect(disconnectRes.data.grant).toBeNull();

    await expect(fs.stat(tokenPath)).rejects.toMatchObject({ code: "ENOENT" });

    const statusAfterDisconnect = await req(
      port,
      "GET",
      "/api/lifeops/connectors/google/status?mode=remote",
    );
    expect(statusAfterDisconnect.status).toBe(200);
    expect(statusAfterDisconnect.data.connected).toBe(false);
    expect(statusAfterDisconnect.data.reason).toBe("disconnected");
  });
});
