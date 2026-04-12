/**
 * PRD validation inventory for Milaidy life-ops.
 *
 * Contract scenarios are executable by default.
 * Live connector scenarios are executable but env-gated, so the PRD scope
 * stays in-repo without forcing external credentials in normal CI.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentRuntime, Task, UUID } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { describeIf, itIf } from "../../../test/helpers/conditional-tests.ts";
import { req } from "../../../test/helpers/http";
import { saveEnv, sleep } from "../../../test/helpers/test-utils";
import { startApiServer } from "../src/api/server";
import { resolveOAuthDir } from "../src/config/paths";
import { LifeOpsRepository } from "../src/lifeops/repository";
import { LifeOpsService } from "../src/lifeops/service";
import { DatabaseSync } from "../src/test-utils/sqlite-compat";

const envPath = path.resolve(import.meta.dirname, "..", "..", "..", ".env");
try {
  const { config } = await import("dotenv");
  config({ path: envPath });
} catch {
  // dotenv is optional in CI; live tests may also rely on already-exported env vars.
}

type Phase = "P0" | "P1" | "P2" | "P3";
type Domain =
  | "onboarding"
  | "tasks"
  | "habits"
  | "goals"
  | "reminders"
  | "calendar"
  | "gmail"
  | "workflows"
  | "privacy"
  | "channels"
  | "browser"
  | "x";

type Scenario = {
  id: string;
  phase: Phase;
  domain: Domain;
  title: string;
};

const contractScenarios: Scenario[] = [
  {
    id: "P0-01",
    phase: "P0",
    domain: "onboarding",
    title:
      "conversational onboarding asks for the user's name when unknown and explains unlocked connector capabilities",
  },
  {
    id: "P0-02",
    phase: "P0",
    domain: "tasks",
    title:
      '"Remind me to brush my teeth every morning and every night" creates one durable definition with separate bounded occurrences',
  },
  {
    id: "P0-03",
    phase: "P0",
    domain: "habits",
    title:
      "morning and night occurrences only surface when their relevance windows are active",
  },
  {
    id: "P0-04",
    phase: "P0",
    domain: "reminders",
    title:
      "snoozing a habit occurrence by 30 minutes reliably resurfaces it after restart",
  },
  {
    id: "P0-05",
    phase: "P0",
    domain: "tasks",
    title:
      "completing a recurring habit marks only the current occurrence and does not retire the definition",
  },
  {
    id: "P0-06",
    phase: "P0",
    domain: "habits",
    title:
      "progressive routine rules store the progression formula, not only the latest numeric target",
  },
  {
    id: "P0-07",
    phase: "P0",
    domain: "goals",
    title:
      "goals remain first-class objects with their own review surface and may suggest supporting tasks without collapsing into todos",
  },
  {
    id: "P0-08",
    phase: "P0",
    domain: "reminders",
    title:
      "the right rail shows next urgent tasks and active reminders without rendering every recurring item all day",
  },
  {
    id: "P0-09",
    phase: "P0",
    domain: "privacy",
    title:
      "personal routines, health-adjacent habits, and emotional goals default to private surfaces and are blocked from public contexts",
  },
  {
    id: "P1-01",
    phase: "P1",
    domain: "calendar",
    title:
      "desktop local mode completes Google OAuth via installed-app PKCE plus loopback callback for calendar read access",
  },
  {
    id: "P1-02",
    phase: "P1",
    domain: "calendar",
    title:
      "remote or hosted mode completes Google OAuth via web-server callback while exposing the same connector status contract to the UI",
  },
  {
    id: "P1-03",
    phase: "P1",
    domain: "calendar",
    title:
      "today's calendar widget shows upcoming events in order and supports click-through into fuller detail",
  },
  {
    id: "P1-04",
    phase: "P1",
    domain: "calendar",
    title:
      "the agent answers next-event context questions with time, attendees, location, preparation needs, and linked mail context when available",
  },
  {
    id: "P1-05",
    phase: "P1",
    domain: "calendar",
    title:
      '"Schedule something for me tomorrow afternoon" requires calendar write capability and creates the expected event window',
  },
  {
    id: "P1-06",
    phase: "P1",
    domain: "reminders",
    title:
      "calendar event reminders are emitted through the same reminder and escalation engine used for tasks",
  },
  {
    id: "P1-07",
    phase: "P1",
    domain: "gmail",
    title:
      "Gmail triage surfaces important new mail and likely-reply-needed messages with clearly scoped permissions",
  },
  {
    id: "P1-08",
    phase: "P1",
    domain: "gmail",
    title:
      "reply drafting is allowed but message send remains blocked until the user explicitly confirms or enables a trusted automation",
  },
  {
    id: "P1-09",
    phase: "P1",
    domain: "gmail",
    title:
      "adding Gmail after Calendar triggers an explicit re-consent flow and updates the recorded granted capabilities",
  },
  {
    id: "P2-01",
    phase: "P2",
    domain: "channels",
    title:
      "phone number capture requires explicit consent and records whether SMS and voice escalation are individually allowed",
  },
  {
    id: "P2-02",
    phase: "P2",
    domain: "reminders",
    title:
      "multi-step escalation respects quiet hours, channel policies, urgency, and prior acknowledgment state",
  },
  {
    id: "P2-03",
    phase: "P2",
    domain: "workflows",
    title:
      "scheduled workflows are inspectable, editable, pausable, and attributable to a clear origin",
  },
  {
    id: "P2-04",
    phase: "P2",
    domain: "workflows",
    title:
      "workflow actions may create tasks, check calendar or mail state, summarize information, and run browser actions under policy gates",
  },
  {
    id: "P2-05",
    phase: "P2",
    domain: "reminders",
    title:
      "the user can inspect why a reminder fired, which connector was used, and which escalation step executed",
  },
  {
    id: "P3-01",
    phase: "P3",
    domain: "x",
    title:
      "X read and write capabilities are stored separately and presented as distinct permissions",
  },
  {
    id: "P3-02",
    phase: "P3",
    domain: "x",
    title:
      "posting to X never happens without per-post confirmation or an independently approved trusted posting policy",
  },
  {
    id: "P3-03",
    phase: "P3",
    domain: "browser",
    title:
      "agent-controlled browser sessions expose visible state including awaiting confirmation, queued, and done",
  },
  {
    id: "P3-04",
    phase: "P3",
    domain: "browser",
    title:
      "browser-side account-affecting actions require explicit confirmation before execution",
  },
];

const liveScenarios: Scenario[] = [
  {
    id: "LIVE-01",
    phase: "P1",
    domain: "calendar",
    title:
      "real Google desktop OAuth loopback callback exchanges a code and stores a refresh token locally",
  },
  {
    id: "LIVE-02",
    phase: "P1",
    domain: "calendar",
    title:
      "real Google remote HTTPS callback exchanges a code and surfaces connected status to the Milady UI",
  },
  {
    id: "LIVE-03",
    phase: "P1",
    domain: "calendar",
    title:
      "real Google Calendar sync refreshes upcoming events and recovers cleanly after access token expiry",
  },
  {
    id: "LIVE-04",
    phase: "P1",
    domain: "gmail",
    title:
      "real Gmail triage reads the configured mailbox with the approved scope set and never sends mail automatically",
  },
  {
    id: "LIVE-05",
    phase: "P1",
    domain: "gmail",
    title:
      "revoking Google access on the account side forces connector status back to disconnected or needs-reauth",
  },
  {
    id: "LIVE-06",
    phase: "P2",
    domain: "channels",
    title:
      "Twilio or approved private channel escalation fires only on allowed channels and records the delivery audit trail",
  },
  {
    id: "LIVE-07",
    phase: "P2",
    domain: "calendar",
    title:
      "Workspace admin policy blocks produce a surfaced permission error instead of a silent connector failure",
  },
  {
    id: "LIVE-08",
    phase: "P3",
    domain: "browser",
    title:
      "real browser-session visibility stays in sync while the agent navigates and waits for user approval",
  },
];

const requiredDomains: Domain[] = [
  "onboarding",
  "tasks",
  "habits",
  "goals",
  "reminders",
  "calendar",
  "gmail",
  "workflows",
  "privacy",
  "channels",
  "browser",
  "x",
];

function assertUniqueScenarioIds(scenarios: Scenario[]): void {
  const ids = scenarios.map((scenario) => scenario.id);
  expect(new Set(ids).size).toBe(ids.length);
}

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

function createSqliteRuntime(
  agentId = "milaidy-lifeops-prd-agent",
): AgentRuntime {
  const sqlite = new DatabaseSync(":memory:");
  const runtimeSubset = {
    agentId,
    character: { name: "MilaidyLifeOpsValidation" },
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

function createApiRuntime(
  agentId = "milaidy-lifeops-prd-api-agent",
): AgentRuntime {
  const sqlite = new DatabaseSync(":memory:");
  let tasks: Task[] = [];
  const runtimeSubset = {
    agentId,
    character: {
      name: "MilaidyLifeOpsValidation",
    } as AgentRuntime["character"],
    registerSendHandler: () => {},
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

async function withGoogleOAuthApiServer<T>(
  env: Record<string, string>,
  fn: (args: {
    port: number;
    stateDir: string;
    fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  }) => Promise<T>,
): Promise<T> {
  const envBackup = saveEnv(
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
  const stateDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "milaidy-prd-google-oauth-"),
  );
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

  process.env.ELIZA_STATE_DIR = stateDir;
  process.env.MILADY_STATE_DIR = stateDir;
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }

  const server = await startApiServer({
    port: 0,
    runtime: createApiRuntime(),
  });

  try {
    return await fn({
      port: server.port,
      stateDir,
      fetchMock,
    });
  } finally {
    await server.close();
    vi.unstubAllGlobals();
    await fs.rm(stateDir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
    envBackup.restore();
  }
}

const LIVE_TEST_TIMEOUT_MS = 180_000;
const LIVE_SIGNAL_POLL_MS = 1_000;

type LiveServerContext = {
  port: number;
  stateDir: string;
  runtime: AgentRuntime;
};

function readOptionalEnv(key: string): string | null {
  const value = process.env[key]?.trim();
  return value && value.length > 0 ? value : null;
}

function readOptionalEnvAny(...keys: string[]): string | null {
  for (const key of keys) {
    const value = readOptionalEnv(key);
    if (value) {
      return value;
    }
  }
  return null;
}

function hasLiveGoogleLocalConfig(): boolean {
  return Boolean(
    readOptionalEnvAny(
      "MILADY_GOOGLE_OAUTH_DESKTOP_CLIENT_ID",
      "ELIZA_GOOGLE_OAUTH_DESKTOP_CLIENT_ID",
    ),
  );
}

function hasLiveGoogleRemoteConfig(): boolean {
  return Boolean(
    readOptionalEnvAny(
      "MILADY_GOOGLE_OAUTH_WEB_CLIENT_ID",
      "ELIZA_GOOGLE_OAUTH_WEB_CLIENT_ID",
    ) &&
      readOptionalEnvAny(
        "MILADY_GOOGLE_OAUTH_WEB_CLIENT_SECRET",
        "ELIZA_GOOGLE_OAUTH_WEB_CLIENT_SECRET",
      ) &&
      readOptionalEnvAny(
        "MILADY_GOOGLE_OAUTH_PUBLIC_BASE_URL",
        "ELIZA_GOOGLE_OAUTH_PUBLIC_BASE_URL",
      ),
  );
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf-8")) as T;
}

async function withLiveLifeOpsApiServer<T>(
  fn: (args: LiveServerContext) => Promise<T>,
): Promise<T> {
  const envBackup = saveEnv("ELIZA_STATE_DIR", "MILADY_STATE_DIR");
  const stateDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "milaidy-prd-live-lifeops-"),
  );
  process.env.ELIZA_STATE_DIR = stateDir;
  process.env.MILADY_STATE_DIR = stateDir;

  const runtime = createApiRuntime(
    `milaidy-prd-live-${crypto.randomUUID().slice(0, 8)}`,
  );
  const server = await startApiServer({
    port: 0,
    runtime,
  });

  try {
    return await fn({
      port: server.port,
      stateDir,
      runtime,
    });
  } finally {
    await server.close();
    await fs.rm(stateDir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
    envBackup.restore();
  }
}

async function waitForSignalFile(args: {
  label: string;
  filePath: string;
  instructions: string;
  timeoutMs?: number;
}): Promise<string> {
  const timeoutMs = args.timeoutMs ?? LIVE_TEST_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  await fs.mkdir(path.dirname(args.filePath), { recursive: true });
  await fs.rm(args.filePath, { force: true });
  await fs.writeFile(
    `${args.filePath}.instructions.txt`,
    `${args.instructions.trim()}\n`,
    "utf-8",
  );
  console.log(`[${args.label}] ${args.instructions}`);

  while (Date.now() < deadline) {
    try {
      const raw = (await fs.readFile(args.filePath, "utf-8")).trim();
      if (raw.length > 0) {
        return raw;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
    await sleep(LIVE_SIGNAL_POLL_MS);
  }

  throw new Error(
    `[${args.label}] timed out waiting for ${args.filePath} after ${timeoutMs}ms`,
  );
}

async function waitForCallbackUrl(args: {
  label: string;
  authUrl: string;
  callbackFile: string;
  timeoutMs?: number;
}): Promise<URL> {
  const raw = await waitForSignalFile({
    label: args.label,
    filePath: args.callbackFile,
    timeoutMs: args.timeoutMs,
    instructions: [
      `Open this Google auth URL in a browser:`,
      args.authUrl,
      "",
      `After consent completes, write the full callback URL into:`,
      args.callbackFile,
    ].join("\n"),
  });
  return new URL(raw);
}

async function listAuditEventTypes(runtime: AgentRuntime): Promise<string[]> {
  const rows = (await runtime.adapter.db.execute({
    queryChunks: [
      {
        value: [
          `SELECT event_type
             FROM life_audit_events
            WHERE agent_id = '${String(runtime.agentId).replace(/'/g, "''")}'
            ORDER BY created_at ASC`,
        ],
      },
    ],
  })) as Array<{ event_type?: unknown }>;
  return rows.map((row) => String(row.event_type ?? ""));
}

async function connectLiveGoogle(args: {
  port: number;
  stateDir: string;
  mode: "local" | "remote";
  capabilities: string[];
  callbackFile: string;
  expectedEmail?: string | null;
}): Promise<{
  status: Record<string, unknown>;
  tokenPath: string;
}> {
  const startRes = await req(
    port,
    "POST",
    "/api/lifeops/connectors/google/start",
    {
      mode: args.mode,
      capabilities: args.capabilities,
    },
  );
  expect(startRes.status).toBe(200);

  const callbackUrl = await waitForCallbackUrl({
    label: `google-${args.mode}`,
    authUrl: String(startRes.data.authUrl),
    callbackFile: args.callbackFile,
  });

  const callbackRes = await req(
    args.port,
    "GET",
    `/api/lifeops/connectors/google/callback${callbackUrl.search}`,
  );
  expect(callbackRes.status).toBe(200);
  expect(String(callbackRes.data._raw)).toContain("Google Connected");

  const statusRes = await req(
    args.port,
    "GET",
    `/api/lifeops/connectors/google/status?mode=${args.mode}`,
  );
  expect(statusRes.status).toBe(200);
  expect(statusRes.data.connected).toBe(true);

  if (args.expectedEmail) {
    expect(
      String(
        (statusRes.data.identity as Record<string, unknown> | null)?.email ??
          "",
      ).toLowerCase(),
    ).toBe(args.expectedEmail.toLowerCase());
  }

  const grant = statusRes.data.grant as Record<string, unknown>;
  const tokenPath = path.join(
    resolveOAuthDir(process.env, args.stateDir),
    "lifeops",
    "google",
    String(grant.tokenRef ?? ""),
  );
  await fs.access(tokenPath);

  return {
    status: statusRes.data as Record<string, unknown>,
    tokenPath,
  };
}

async function expireStoredGoogleAccessToken(tokenPath: string): Promise<void> {
  const raw = await readJsonFile<Record<string, unknown>>(tokenPath);
  raw.expiresAt = Date.now() - 60_000;
  await fs.writeFile(tokenPath, JSON.stringify(raw, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
}

async function assertBrowserSessionListed(
  port: number,
  sessionId: string,
  status: string,
): Promise<void> {
  const listed = await req(port, "GET", "/api/lifeops/browser/sessions");
  expect(listed.status).toBe(200);
  expect(
    (listed.data.sessions as Array<Record<string, unknown>>).some(
      (session) => session.id === sessionId && session.status === status,
    ),
  ).toBe(true);
}

async function createMorningNightHabit(runtime: AgentRuntime) {
  const service = new LifeOpsService(runtime);
  const created = await service.createDefinition({
    kind: "habit",
    title: "Brush teeth",
    description: "Brush every morning and night",
    originalIntent: "Remind me to brush my teeth every morning and every night",
    timezone: "America/Los_Angeles",
    cadence: {
      kind: "daily",
      windows: ["morning", "night"],
    },
  });
  return {
    service,
    created,
  };
}

function requireOccurrenceByWindow(
  overview: Awaited<ReturnType<LifeOpsService["getOverview"]>>,
  windowName: string,
) {
  const occurrence = overview.occurrences.find(
    (candidate) => candidate.windowName === windowName,
  );
  expect(occurrence).toBeDefined();
  return occurrence!;
}

function buildDenseSlots() {
  return Array.from({ length: 12 }, (_, index) => ({
    key: `slot-${index + 1}`,
    label: `Slot ${index + 1}`,
    minuteOfDay: index * 90,
    durationMinutes: 20,
  }));
}

describe("Milaidy PRD validation inventory", () => {
  it("covers every milestone phase", () => {
    const phases = [
      ...new Set(contractScenarios.map((scenario) => scenario.phase)),
    ].sort();
    expect(phases).toEqual(["P0", "P1", "P2", "P3"]);
  });

  it("covers every required product domain", () => {
    const domains = new Set(
      contractScenarios.map((scenario) => scenario.domain),
    );
    for (const domain of requiredDomains) {
      expect(domains.has(domain)).toBe(true);
    }
  });

  it("keeps contract scenario ids unique", () => {
    assertUniqueScenarioIds(contractScenarios);
  });

  it("keeps live scenario ids unique", () => {
    assertUniqueScenarioIds(liveScenarios);
  });
});

for (const phase of ["P0", "P1", "P2", "P3"] as const) {
  describe(`Milaidy PRD contract coverage ${phase}`, () => {
    for (const scenario of contractScenarios.filter(
      (candidate) => candidate.phase === phase,
    )) {
      if (scenario.id === "P0-01") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          const server = await startApiServer({ port: 0 });
          try {
            const missingName = await req(
              server.port,
              "POST",
              "/api/onboarding",
              {
                deploymentTarget: "local",
                linkedAccounts: [],
                serviceRouting: {},
                credentialInputs: {},
              },
            );
            expect(missingName.status).toBe(400);
            expect(String(missingName.data.error)).toContain("agent name");

            const options = await req(
              server.port,
              "GET",
              "/api/onboarding/options",
            );
            expect(options.status).toBe(200);
            expect(Array.isArray(options.data.names)).toBe(true);
            expect((options.data.names as string[]).length).toBeGreaterThan(0);
            expect(Array.isArray(options.data.providers)).toBe(true);
            expect(
              (options.data.providers as Array<Record<string, unknown>>).length,
            ).toBeGreaterThan(0);

            const runtime = createApiRuntime("p0-01-lifeops-agent");
            const lifeopsServer = await startApiServer({
              port: 0,
              runtime,
            });
            try {
              const connectorStatus = await req(
                lifeopsServer.port,
                "GET",
                "/api/lifeops/connectors/google/status",
              );
              expect(connectorStatus.status).toBe(200);
              expect(connectorStatus.data).toMatchObject({
                provider: "google",
                connected: false,
                grantedCapabilities: [],
              });
            } finally {
              await lifeopsServer.close();
            }
          } finally {
            await server.close();
          }
        });
        continue;
      }

      if (scenario.id === "P0-02") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          const runtime = createSqliteRuntime("p0-02-agent");
          const { service, created } = await createMorningNightHabit(runtime);
          const repository = new LifeOpsRepository(runtime);

          expect(created.definition.status).toBe("active");
          expect(created.reminderPlan?.steps).toHaveLength(1);

          const overview = await service.getOverview(
            new Date("2026-04-04T16:00:00.000Z"),
          );
          const morning = requireOccurrenceByWindow(overview, "morning");
          const night = requireOccurrenceByWindow(overview, "night");
          expect(morning.state).toBe("visible");
          expect(night.state).toBe("pending");
          expect(morning.definitionId).toBe(created.definition.id);
          expect(night.definitionId).toBe(created.definition.id);
          expect(morning.id).not.toBe(night.id);
          expect(new Date(morning.scheduledAt ?? 0).getTime()).toBeLessThan(
            new Date(night.scheduledAt ?? 0).getTime(),
          );

          const persisted = await repository.listOccurrencesForDefinition(
            created.definition.agentId,
            created.definition.id,
          );
          expect(persisted.map((occurrence) => occurrence.windowName)).toEqual(
            expect.arrayContaining(["morning", "night"]),
          );
        });
        continue;
      }

      if (scenario.id === "P0-03") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          const runtime = createSqliteRuntime("p0-03-agent");
          const { service } = await createMorningNightHabit(runtime);

          const morningOverview = await service.getOverview(
            new Date("2026-04-04T16:00:00.000Z"),
          );
          expect(
            requireOccurrenceByWindow(morningOverview, "morning").state,
          ).toBe("visible");
          expect(
            requireOccurrenceByWindow(morningOverview, "night").state,
          ).toBe("pending");

          const afternoonOverview = await service.getOverview(
            new Date("2026-04-04T20:30:00.000Z"),
          );
          expect(
            afternoonOverview.occurrences.some(
              (occurrence) =>
                occurrence.windowName === "morning" &&
                occurrence.state === "visible",
            ),
          ).toBe(false);
          expect(
            requireOccurrenceByWindow(afternoonOverview, "night").state,
          ).toBe("pending");
        });
        continue;
      }

      if (scenario.id === "P0-04") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          const runtime = createSqliteRuntime("p0-04-agent");
          const { service } = await createMorningNightHabit(runtime);
          const morningTime = new Date("2026-04-04T16:00:00.000Z");
          const morningOverview = await service.getOverview(morningTime);
          const morning = requireOccurrenceByWindow(morningOverview, "morning");

          const snoozed = await service.snoozeOccurrence(
            morning.id,
            {
              minutes: 30,
            },
            morningTime,
          );
          expect(snoozed.state).toBe("snoozed");

          const restartedService = new LifeOpsService(runtime);
          const beforeResurface = await restartedService.getOverview(
            new Date("2026-04-04T16:20:00.000Z"),
          );
          expect(
            beforeResurface.occurrences.find(
              (occurrence) => occurrence.id === morning.id,
            )?.state,
          ).toBe("snoozed");

          const afterResurface = await restartedService.getOverview(
            new Date("2026-04-04T16:31:00.000Z"),
          );
          expect(
            afterResurface.occurrences.find(
              (occurrence) => occurrence.id === morning.id,
            )?.state,
          ).toBe("visible");
        });
        continue;
      }

      if (scenario.id === "P0-05") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          const runtime = createSqliteRuntime("p0-05-agent");
          const { service, created } = await createMorningNightHabit(runtime);
          const repository = new LifeOpsRepository(runtime);
          const morningTime = new Date("2026-04-04T16:00:00.000Z");
          const morningOverview = await service.getOverview(morningTime);
          const morning = requireOccurrenceByWindow(morningOverview, "morning");

          const completed = await service.completeOccurrence(
            morning.id,
            {
              note: "done",
            },
            morningTime,
          );
          expect(completed.state).toBe("completed");

          const definitionRecord = await service.getDefinition(
            created.definition.id,
          );
          expect(definitionRecord.definition.status).toBe("active");

          const occurrences = await repository.listOccurrencesForDefinition(
            created.definition.agentId,
            created.definition.id,
          );
          expect(
            occurrences.find((occurrence) => occurrence.id === morning.id)
              ?.state,
          ).toBe("completed");
          expect(
            occurrences.some(
              (occurrence) =>
                occurrence.windowName === "night" &&
                occurrence.state === "pending",
            ),
          ).toBe(true);
        });
        continue;
      }

      if (scenario.id === "P0-06") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          const runtime = createSqliteRuntime("p0-06-agent");
          const service = new LifeOpsService(runtime);
          const repository = new LifeOpsRepository(runtime);
          const created = await service.createDefinition({
            kind: "routine",
            title: "Push-ups",
            timezone: "America/Los_Angeles",
            cadence: {
              kind: "daily",
              windows: ["morning", "night"],
            },
            progressionRule: {
              kind: "linear_increment",
              metric: "reps",
              start: 20,
              step: 5,
              unit: "reps",
            },
          });

          const overview = await service.getOverview(
            new Date("2026-04-04T16:00:00.000Z"),
          );
          const morning = requireOccurrenceByWindow(overview, "morning");
          await service.completeOccurrence(
            morning.id,
            {},
            new Date("2026-04-04T16:00:00.000Z"),
          );

          const definitionRecord = await service.getDefinition(
            created.definition.id,
          );
          expect(definitionRecord.definition.progressionRule).toEqual({
            kind: "linear_increment",
            metric: "reps",
            start: 20,
            step: 5,
            unit: "reps",
          });

          const occurrences = await repository.listOccurrencesForDefinition(
            created.definition.agentId,
            created.definition.id,
          );
          const night = occurrences.find(
            (occurrence) =>
              occurrence.windowName === "night" &&
              occurrence.state === "pending",
          );
          expect(night?.derivedTarget).toMatchObject({
            kind: "linear_increment",
            metric: "reps",
            start: 20,
            step: 5,
            target: 25,
            unit: "reps",
          });
        });
        continue;
      }

      if (scenario.id === "P0-07") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          const runtime = createSqliteRuntime("p0-07-agent");
          const service = new LifeOpsService(runtime);
          const goalRecord = await service.createGoal({
            title: "Stabilize sleep schedule",
            description: "Wake up consistently and protect bedtime.",
          });
          const definitionRecord = await service.createDefinition({
            kind: "habit",
            title: "Lights out routine",
            timezone: "America/Los_Angeles",
            goalId: goalRecord.goal.id,
            cadence: {
              kind: "daily",
              windows: ["night"],
            },
          });

          const fetchedGoal = await service.getGoal(goalRecord.goal.id);
          expect(fetchedGoal.goal.id).toBe(goalRecord.goal.id);
          expect(fetchedGoal.links).toHaveLength(1);
          expect(fetchedGoal.links[0]).toMatchObject({
            goalId: goalRecord.goal.id,
            linkedType: "definition",
            linkedId: definitionRecord.definition.id,
          });

          const overview = await service.getOverview(
            new Date("2026-04-05T05:30:00.000Z"),
          );
          expect(overview.goals.map((goal) => goal.id)).toContain(
            goalRecord.goal.id,
          );
        });
        continue;
      }

      if (scenario.id === "P0-08") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          const runtime = createSqliteRuntime("p0-08-agent");
          const service = new LifeOpsService(runtime);
          await service.createDefinition({
            kind: "routine",
            title: "Deep work pulse",
            timezone: "UTC",
            cadence: {
              kind: "times_per_day",
              slots: buildDenseSlots(),
            },
          });

          const overview = await service.getOverview(
            new Date("2026-04-04T00:30:00.000Z"),
          );
          expect(overview.occurrences.length).toBe(8);
          expect(overview.summary.activeOccurrenceCount).toBeGreaterThanOrEqual(
            1,
          );
          expect(overview.reminders.length).toBeGreaterThanOrEqual(1);
          expect(
            overview.reminders.every(
              (reminder) => reminder.channel === "in_app",
            ),
          ).toBe(true);
        });
        continue;
      }

      if (scenario.id === "P0-09") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          const runtime = createSqliteRuntime("p0-09-agent");
          const service = new LifeOpsService(runtime);

          const definitionRecord = await service.createDefinition({
            kind: "habit",
            title: "Medication check-in",
            description: "Take morning medication with breakfast.",
            timezone: "America/Los_Angeles",
            cadence: {
              kind: "daily",
              windows: ["morning"],
            },
          });
          const goalRecord = await service.createGoal({
            title: "Stabilize mood this month",
            description: "Track how I feel and protect recovery time.",
          });

          expect(definitionRecord.definition.metadata).toMatchObject({
            privacyClass: "private",
            publicContextBlocked: true,
          });
          expect(goalRecord.goal.metadata).toMatchObject({
            privacyClass: "private",
            publicContextBlocked: true,
          });
        });
        continue;
      }

      if (scenario.id === "P1-01") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          await withGoogleOAuthApiServer(
            {
              MILADY_GOOGLE_OAUTH_DESKTOP_CLIENT_ID: "desktop-client-id",
            },
            async ({ port, stateDir, fetchMock }) => {
              fetchMock.mockResolvedValueOnce(
                new Response(
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
                      name: "Agent Example",
                      email_verified: true,
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
                { capabilities: ["google.calendar.read"] },
              );
              expect(startRes.status).toBe(200);
              expect(startRes.data.mode).toBe("local");
              expect(startRes.data.requestedCapabilities).toEqual([
                "google.basic_identity",
                "google.calendar.read",
              ]);

              const authUrl = new URL(String(startRes.data.authUrl));
              expect(authUrl.searchParams.get("redirect_uri")).toBe(
                `http://127.0.0.1:${port}/api/lifeops/connectors/google/callback`,
              );
              expect(authUrl.searchParams.get("code_challenge_method")).toBe(
                "S256",
              );
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
                `/api/lifeops/connectors/google/callback?state=${encodeURIComponent(authUrl.searchParams.get("state") ?? "")}&code=desktop-code`,
              );
              expect(callbackRes.status).toBe(200);
              expect(String(callbackRes.data._raw)).toContain(
                "Google Connected",
              );

              const statusRes = await req(
                port,
                "GET",
                "/api/lifeops/connectors/google/status",
              );
              expect(statusRes.status).toBe(200);
              expect(statusRes.data.connected).toBe(true);
              expect(statusRes.data.mode).toBe("local");
              expect(statusRes.data.reason).toBe("connected");
              expect(statusRes.data.grantedCapabilities).toEqual([
                "google.basic_identity",
                "google.calendar.read",
              ]);

              const grant = statusRes.data.grant as Record<string, unknown>;
              const tokenPath = path.join(
                stateDir,
                "credentials",
                "lifeops",
                "google",
                String(grant.tokenRef),
              );
              const raw = JSON.parse(await fs.readFile(tokenPath, "utf-8")) as {
                refreshToken: string;
              };
              expect(raw.refreshToken).toBe("desktop-refresh-token");
            },
          );
        });
        continue;
      }

      if (scenario.id === "P1-02") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          await withGoogleOAuthApiServer(
            {
              MILADY_GOOGLE_OAUTH_WEB_CLIENT_ID: "web-client-id",
              MILADY_GOOGLE_OAUTH_WEB_CLIENT_SECRET: "web-client-secret",
              MILADY_GOOGLE_OAUTH_PUBLIC_BASE_URL: "https://milady.example.com",
            },
            async ({ port, fetchMock }) => {
              fetchMock.mockResolvedValueOnce(
                new Response(
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
                      name: "Remote Example",
                      email_verified: true,
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
                  mode: "remote",
                  capabilities: ["google.calendar.write"],
                },
              );
              expect(startRes.status).toBe(200);
              expect(startRes.data.mode).toBe("remote");
              expect(startRes.data.redirectUri).toBe(
                "https://milady.example.com/api/lifeops/connectors/google/callback",
              );

              const authUrl = new URL(String(startRes.data.authUrl));
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

              await req(
                port,
                "GET",
                `/api/lifeops/connectors/google/callback?state=${encodeURIComponent(authUrl.searchParams.get("state") ?? "")}&code=remote-code`,
              );

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
              expect(
                (statusRes.data.identity as Record<string, unknown>).email,
              ).toBe("remote@example.com");
            },
          );
        });
        continue;
      }

      if (scenario.id === "P1-03") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          await withGoogleOAuthApiServer(
            {
              MILADY_GOOGLE_OAUTH_DESKTOP_CLIENT_ID: "desktop-client-id",
            },
            async ({ port, fetchMock }) => {
              fetchMock.mockResolvedValueOnce(
                new Response(
                  JSON.stringify({
                    access_token: "calendar-access-token",
                    refresh_token: "calendar-refresh-token",
                    expires_in: 3600,
                    scope: [
                      "openid",
                      "email",
                      "profile",
                      "https://www.googleapis.com/auth/calendar.readonly",
                    ].join(" "),
                    token_type: "Bearer",
                    id_token: buildIdToken({
                      sub: "google-user-3",
                      email: "calendar@example.com",
                      name: "Calendar Example",
                      email_verified: true,
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
                { capabilities: ["google.calendar.read"] },
              );
              expect(startRes.status).toBe(200);

              const authUrl = new URL(String(startRes.data.authUrl));
              await req(
                port,
                "GET",
                `/api/lifeops/connectors/google/callback?state=${encodeURIComponent(authUrl.searchParams.get("state") ?? "")}&code=calendar-code`,
              );

              fetchMock.mockResolvedValueOnce(
                new Response(
                  JSON.stringify({
                    items: [
                      {
                        id: "event-later",
                        status: "confirmed",
                        summary: "Design review",
                        location: "Studio",
                        htmlLink:
                          "https://calendar.google.com/event?eid=design",
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
                        htmlLink:
                          "https://calendar.google.com/event?eid=standup",
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
                ),
              );

              vi.useFakeTimers();
              vi.setSystemTime(new Date("2026-04-04T16:00:00.000Z"));
              try {
                const feedRes = await req(
                  port,
                  "GET",
                  "/api/lifeops/calendar/feed?timeZone=America%2FLos_Angeles",
                );
                expect(feedRes.status).toBe(200);
                expect(feedRes.data.source).toBe("synced");
                expect(
                  feedRes.data.events.map(
                    (event: { title: string }) => event.title,
                  ),
                ).toEqual(["Morning standup", "Design review"]);
                expect(feedRes.data.events[1]).toMatchObject({
                  title: "Design review",
                  htmlLink: "https://calendar.google.com/event?eid=design",
                });
              } finally {
                vi.useRealTimers();
              }
            },
          );
        });
        continue;
      }

      if (scenario.id === "P1-04") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          await withGoogleOAuthApiServer(
            {
              MILADY_GOOGLE_OAUTH_DESKTOP_CLIENT_ID: "desktop-client-id",
            },
            async ({ port, fetchMock }) => {
              vi.useFakeTimers();
              vi.setSystemTime(new Date("2026-04-04T16:00:00.000Z"));
              try {
                fetchMock.mockResolvedValueOnce(
                  new Response(
                    JSON.stringify({
                      access_token: "calendar-context-token",
                      refresh_token: "calendar-context-refresh",
                      expires_in: 3600,
                      scope: [
                        "openid",
                        "email",
                        "profile",
                        "https://www.googleapis.com/auth/calendar.readonly",
                      ].join(" "),
                      token_type: "Bearer",
                      id_token: buildIdToken({
                        sub: "google-user-4",
                        email: "calendar-context@example.com",
                        name: "Calendar Context Example",
                        email_verified: true,
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
                  { capabilities: ["google.calendar.read"] },
                );
                const authUrl = new URL(String(startRes.data.authUrl));
                await req(
                  port,
                  "GET",
                  `/api/lifeops/connectors/google/callback?state=${encodeURIComponent(authUrl.searchParams.get("state") ?? "")}&code=context-code`,
                );

                fetchMock.mockResolvedValueOnce(
                  new Response(
                    JSON.stringify({
                      items: [
                        {
                          id: "event-next",
                          status: "confirmed",
                          summary: "Design review",
                          description: "Read the spec and final comments.",
                          location: "Studio",
                          conferenceData: {
                            entryPoints: [
                              {
                                uri: "https://meet.google.com/design-review",
                              },
                            ],
                          },
                          start: {
                            dateTime: "2026-04-04T10:30:00-07:00",
                            timeZone: "America/Los_Angeles",
                          },
                          end: {
                            dateTime: "2026-04-04T11:30:00-07:00",
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
                          id: "event-later",
                          status: "confirmed",
                          summary: "Later planning",
                          start: {
                            dateTime: "2026-04-04T14:00:00-07:00",
                            timeZone: "America/Los_Angeles",
                          },
                          end: {
                            dateTime: "2026-04-04T15:00:00-07:00",
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

                const contextRes = await req(
                  port,
                  "GET",
                  "/api/lifeops/calendar/next-context?timeZone=America%2FLos_Angeles",
                );
                expect(contextRes.status).toBe(200);
                expect(contextRes.data).toMatchObject({
                  attendeeCount: 1,
                  attendeeNames: ["Friend"],
                  location: "Studio",
                  conferenceLink: "https://meet.google.com/design-review",
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
              } finally {
                vi.useRealTimers();
              }
            },
          );
        });
        continue;
      }

      if (scenario.id === "P1-05") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          await withGoogleOAuthApiServer(
            {
              MILADY_GOOGLE_OAUTH_DESKTOP_CLIENT_ID: "desktop-client-id",
            },
            async ({ port, fetchMock }) => {
              vi.useFakeTimers();
              vi.setSystemTime(new Date("2026-04-04T19:00:00.000Z"));
              try {
                fetchMock.mockResolvedValueOnce(
                  new Response(
                    JSON.stringify({
                      access_token: "calendar-read-token",
                      refresh_token: "calendar-read-refresh",
                      expires_in: 3600,
                      scope: [
                        "openid",
                        "email",
                        "profile",
                        "https://www.googleapis.com/auth/calendar.readonly",
                      ].join(" "),
                      token_type: "Bearer",
                      id_token: buildIdToken({
                        sub: "google-user-4",
                        email: "calendar-write@example.com",
                        name: "Calendar Write Example",
                        email_verified: true,
                      }),
                    }),
                    {
                      status: 200,
                      headers: { "content-type": "application/json" },
                    },
                  ),
                );

                const readStart = await req(
                  port,
                  "POST",
                  "/api/lifeops/connectors/google/start",
                  { capabilities: ["google.calendar.read"] },
                );
                const readAuthUrl = new URL(String(readStart.data.authUrl));
                await req(
                  port,
                  "GET",
                  `/api/lifeops/connectors/google/callback?state=${encodeURIComponent(readAuthUrl.searchParams.get("state") ?? "")}&code=read-code`,
                );

                const rejected = await req(
                  port,
                  "POST",
                  "/api/lifeops/calendar/events",
                  {
                    title: "Coffee with Mira",
                    windowPreset: "tomorrow_afternoon",
                    durationMinutes: 90,
                    timeZone: "America/Los_Angeles",
                  },
                );
                expect(rejected.status).toBe(403);

                fetchMock.mockResolvedValueOnce(
                  new Response(
                    JSON.stringify({
                      access_token: "calendar-write-token",
                      refresh_token: "calendar-write-refresh",
                      expires_in: 3600,
                      scope: [
                        "openid",
                        "email",
                        "profile",
                        "https://www.googleapis.com/auth/calendar.events",
                      ].join(" "),
                      token_type: "Bearer",
                      id_token: buildIdToken({
                        sub: "google-user-4",
                        email: "calendar-write@example.com",
                        name: "Calendar Write Example",
                        email_verified: true,
                      }),
                    }),
                    {
                      status: 200,
                      headers: { "content-type": "application/json" },
                    },
                  ),
                );

                const writeStart = await req(
                  port,
                  "POST",
                  "/api/lifeops/connectors/google/start",
                  { capabilities: ["google.calendar.write"] },
                );
                const writeAuthUrl = new URL(String(writeStart.data.authUrl));
                await req(
                  port,
                  "GET",
                  `/api/lifeops/connectors/google/callback?state=${encodeURIComponent(writeAuthUrl.searchParams.get("state") ?? "")}&code=write-code`,
                );

                fetchMock.mockImplementationOnce(async (input, init) => {
                  const url =
                    typeof input === "string" ? input : input.toString();
                  expect(url).toBe(
                    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
                  );
                  expect(init?.method).toBe("POST");
                  expect(init?.headers).toMatchObject({
                    Authorization: "Bearer calendar-write-token",
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
                      id: "created-event-prd",
                      status: "confirmed",
                      summary: "Coffee with Mira",
                      htmlLink:
                        "https://calendar.google.com/event?eid=created-prd",
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

                const createRes = await req(
                  port,
                  "POST",
                  "/api/lifeops/calendar/events",
                  {
                    title: "Coffee with Mira",
                    windowPreset: "tomorrow_afternoon",
                    durationMinutes: 90,
                    timeZone: "America/Los_Angeles",
                  },
                );
                expect(createRes.status).toBe(201);
                expect(createRes.data.event).toMatchObject({
                  title: "Coffee with Mira",
                  startAt: "2026-04-05T21:00:00.000Z",
                  endAt: "2026-04-05T22:30:00.000Z",
                });
              } finally {
                vi.useRealTimers();
              }
            },
          );
        });
        continue;
      }

      if (scenario.id === "P1-06") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          await withGoogleOAuthApiServer(
            {
              MILADY_GOOGLE_OAUTH_DESKTOP_CLIENT_ID: "desktop-client-id",
            },
            async ({ port, fetchMock }) => {
              fetchMock.mockResolvedValueOnce(
                new Response(
                  JSON.stringify({
                    access_token: "calendar-reminder-token",
                    refresh_token: "calendar-reminder-refresh",
                    expires_in: 3600,
                    scope: [
                      "openid",
                      "email",
                      "profile",
                      "https://www.googleapis.com/auth/calendar.readonly",
                    ].join(" "),
                    token_type: "Bearer",
                    id_token: buildIdToken({
                      sub: "google-user-5",
                      email: "calendar-reminder@example.com",
                      name: "Calendar Reminder Example",
                      email_verified: true,
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
                { capabilities: ["google.calendar.read"] },
              );
              const authUrl = new URL(String(startRes.data.authUrl));
              await req(
                port,
                "GET",
                `/api/lifeops/connectors/google/callback?state=${encodeURIComponent(authUrl.searchParams.get("state") ?? "")}&code=reminder-code`,
              );

              const now = new Date();
              const eventStart = new Date(now.getTime() + 20 * 60_000);
              const eventEnd = new Date(now.getTime() + 80 * 60_000);

              fetchMock.mockResolvedValueOnce(
                new Response(
                  JSON.stringify({
                    items: [
                      {
                        id: "event-reminder",
                        status: "confirmed",
                        summary: "Preparation sync",
                        htmlLink:
                          "https://calendar.google.com/event?eid=prep-sync",
                        start: {
                          dateTime: eventStart.toISOString(),
                          timeZone: "UTC",
                        },
                        end: {
                          dateTime: eventEnd.toISOString(),
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

              const overviewRes = await req(
                port,
                "GET",
                "/api/lifeops/overview",
              );
              expect(overviewRes.status).toBe(200);
              expect(overviewRes.data.reminders).toEqual(
                expect.arrayContaining([
                  expect.objectContaining({
                    ownerType: "calendar_event",
                    title: "Preparation sync",
                    dueAt: eventStart.toISOString(),
                  }),
                ]),
              );
            },
          );
        });
        continue;
      }

      if (scenario.id === "P1-07") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          await withGoogleOAuthApiServer(
            {
              MILADY_GOOGLE_OAUTH_DESKTOP_CLIENT_ID: "desktop-client-id",
            },
            async ({ port, fetchMock }) => {
              fetchMock.mockResolvedValueOnce(
                new Response(
                  JSON.stringify({
                    access_token: "gmail-triage-token",
                    refresh_token: "gmail-triage-refresh",
                    expires_in: 3600,
                    scope: [
                      "openid",
                      "email",
                      "profile",
                      "https://www.googleapis.com/auth/gmail.readonly",
                    ].join(" "),
                    token_type: "Bearer",
                    id_token: buildIdToken({
                      sub: "google-user-gmail-triage",
                      email: "gmail-triage@example.com",
                      name: "Gmail Triage Example",
                      email_verified: true,
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
                { capabilities: ["google.gmail.triage"] },
              );
              const authUrl = new URL(String(startRes.data.authUrl));
              await req(
                port,
                "GET",
                `/api/lifeops/connectors/google/callback?state=${encodeURIComponent(authUrl.searchParams.get("state") ?? "")}&code=gmail-triage-code`,
              );

              fetchMock.mockImplementation(async (input) => {
                const url =
                  typeof input === "string" ? input : input.toString();
                if (
                  url.startsWith(
                    "https://gmail.googleapis.com/gmail/v1/users/me/messages?",
                  )
                ) {
                  return new Response(
                    JSON.stringify({
                      messages: [{ id: "msg-prd-1", threadId: "thread-prd-1" }],
                    }),
                    {
                      status: 200,
                      headers: { "content-type": "application/json" },
                    },
                  );
                }
                if (url.includes("/gmail/v1/users/me/messages/msg-prd-1?")) {
                  return new Response(
                    JSON.stringify({
                      id: "msg-prd-1",
                      threadId: "thread-prd-1",
                      labelIds: ["INBOX", "UNREAD", "IMPORTANT"],
                      snippet: "Can you confirm the agenda and timing?",
                      internalDate: String(Date.now() - 10 * 60_000),
                      payload: {
                        headers: [
                          { name: "Subject", value: "Design review agenda" },
                          {
                            name: "From",
                            value: "Friend <friend@example.com>",
                          },
                          { name: "To", value: "gmail-triage@example.com" },
                          {
                            name: "Message-Id",
                            value: "<message-prd-1@example.com>",
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
              expect(triageRes.data.messages).toEqual(
                expect.arrayContaining([
                  expect.objectContaining({
                    subject: "Design review agenda",
                    isImportant: true,
                    likelyReplyNeeded: true,
                  }),
                ]),
              );

              const statusRes = await req(
                port,
                "GET",
                "/api/lifeops/connectors/google/status",
              );
              expect(statusRes.status).toBe(200);
              expect(statusRes.data.grantedCapabilities).toEqual(
                expect.arrayContaining(["google.gmail.triage"]),
              );
              expect(statusRes.data.grantedCapabilities).not.toContain(
                "google.gmail.send",
              );
            },
          );
        });
        continue;
      }

      if (scenario.id === "P1-08") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          await withGoogleOAuthApiServer(
            {
              MILADY_GOOGLE_OAUTH_DESKTOP_CLIENT_ID: "desktop-client-id",
            },
            async ({ port, fetchMock }) => {
              fetchMock.mockResolvedValueOnce(
                new Response(
                  JSON.stringify({
                    access_token: "gmail-draft-token",
                    refresh_token: "gmail-draft-refresh",
                    expires_in: 3600,
                    scope: [
                      "openid",
                      "email",
                      "profile",
                      "https://www.googleapis.com/auth/gmail.readonly",
                    ].join(" "),
                    token_type: "Bearer",
                    id_token: buildIdToken({
                      sub: "google-user-gmail-draft",
                      email: "gmail-draft@example.com",
                      name: "Gmail Draft Example",
                      email_verified: true,
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
                { capabilities: ["google.gmail.triage"] },
              );
              const authUrl = new URL(String(startRes.data.authUrl));
              await req(
                port,
                "GET",
                `/api/lifeops/connectors/google/callback?state=${encodeURIComponent(authUrl.searchParams.get("state") ?? "")}&code=gmail-draft-code`,
              );

              fetchMock.mockImplementation(async (input) => {
                const url =
                  typeof input === "string" ? input : input.toString();
                if (
                  url.startsWith(
                    "https://gmail.googleapis.com/gmail/v1/users/me/messages?",
                  )
                ) {
                  return new Response(
                    JSON.stringify({
                      messages: [{ id: "msg-prd-2", threadId: "thread-prd-2" }],
                    }),
                    {
                      status: 200,
                      headers: { "content-type": "application/json" },
                    },
                  );
                }
                if (url.includes("/gmail/v1/users/me/messages/msg-prd-2?")) {
                  return new Response(
                    JSON.stringify({
                      id: "msg-prd-2",
                      threadId: "thread-prd-2",
                      labelIds: ["INBOX", "UNREAD"],
                      snippet: "Please send the revised plan when you can.",
                      internalDate: String(Date.now() - 5 * 60_000),
                      payload: {
                        headers: [
                          { name: "Subject", value: "Revised plan" },
                          { name: "From", value: "Mira <mira@example.com>" },
                          { name: "To", value: "gmail-draft@example.com" },
                          {
                            name: "Message-Id",
                            value: "<message-prd-2@example.com>",
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

              const triageRes = await req(
                port,
                "GET",
                "/api/lifeops/gmail/triage",
              );
              expect(triageRes.status).toBe(200);
              const messageId = String(triageRes.data.messages[0].id);

              const draftRes = await req(
                port,
                "POST",
                "/api/lifeops/gmail/reply-drafts",
                {
                  messageId,
                  intent: "I will send the revised plan this afternoon.",
                },
              );
              expect(draftRes.status).toBe(201);
              expect(draftRes.data.draft).toMatchObject({
                sendAllowed: false,
                requiresConfirmation: true,
                to: ["mira@example.com"],
              });

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
            },
          );
        });
        continue;
      }

      if (scenario.id === "P1-09") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          await withGoogleOAuthApiServer(
            {
              MILADY_GOOGLE_OAUTH_DESKTOP_CLIENT_ID: "desktop-client-id",
            },
            async ({ port, fetchMock }) => {
              fetchMock.mockResolvedValueOnce(
                new Response(
                  JSON.stringify({
                    access_token: "calendar-only-token",
                    refresh_token: "calendar-only-refresh",
                    expires_in: 3600,
                    scope: [
                      "openid",
                      "email",
                      "profile",
                      "https://www.googleapis.com/auth/calendar.readonly",
                    ].join(" "),
                    token_type: "Bearer",
                    id_token: buildIdToken({
                      sub: "google-user-calendar-only",
                      email: "calendar-only@example.com",
                      name: "Calendar Only Example",
                      email_verified: true,
                    }),
                  }),
                  {
                    status: 200,
                    headers: { "content-type": "application/json" },
                  },
                ),
              );

              const calendarStartRes = await req(
                port,
                "POST",
                "/api/lifeops/connectors/google/start",
                { capabilities: ["google.calendar.read"] },
              );
              const calendarAuthUrl = new URL(
                String(calendarStartRes.data.authUrl),
              );
              await req(
                port,
                "GET",
                `/api/lifeops/connectors/google/callback?state=${encodeURIComponent(calendarAuthUrl.searchParams.get("state") ?? "")}&code=calendar-only-code`,
              );

              fetchMock.mockResolvedValueOnce(
                new Response(
                  JSON.stringify({
                    access_token: "gmail-upgrade-token",
                    refresh_token: "gmail-upgrade-refresh",
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
                      sub: "google-user-calendar-only",
                      email: "calendar-only@example.com",
                      name: "Calendar Only Example",
                      email_verified: true,
                    }),
                  }),
                  {
                    status: 200,
                    headers: { "content-type": "application/json" },
                  },
                ),
              );

              const gmailStartRes = await req(
                port,
                "POST",
                "/api/lifeops/connectors/google/start",
                { capabilities: ["google.gmail.triage"] },
              );
              expect(gmailStartRes.status).toBe(200);
              expect(gmailStartRes.data.requestedCapabilities).toEqual(
                expect.arrayContaining([
                  "google.basic_identity",
                  "google.calendar.read",
                  "google.gmail.triage",
                ]),
              );

              const gmailAuthUrl = new URL(String(gmailStartRes.data.authUrl));
              const callbackRes = await req(
                port,
                "GET",
                `/api/lifeops/connectors/google/callback?state=${encodeURIComponent(gmailAuthUrl.searchParams.get("state") ?? "")}&code=gmail-upgrade-code`,
              );
              expect(callbackRes.status).toBe(200);

              const statusRes = await req(
                port,
                "GET",
                "/api/lifeops/connectors/google/status",
              );
              expect(statusRes.status).toBe(200);
              expect(statusRes.data.grantedCapabilities).toEqual(
                expect.arrayContaining([
                  "google.calendar.read",
                  "google.gmail.triage",
                ]),
              );
            },
          );
        });
        continue;
      }

      if (scenario.id === "P2-01") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          const runtime = createApiRuntime("p2-01-agent");
          const server = await startApiServer({
            port: 0,
            runtime,
          });

          try {
            const blocked = await req(
              server.port,
              "POST",
              "/api/lifeops/channels/phone-consent",
              {
                phoneNumber: "415-555-0100",
                consentGiven: false,
                allowSms: true,
                allowVoice: false,
              },
            );
            expect(blocked.status).toBe(400);
            expect(String(blocked.data.error)).toContain("Explicit consent");

            const captured = await req(
              server.port,
              "POST",
              "/api/lifeops/channels/phone-consent",
              {
                phoneNumber: "415-555-0100",
                consentGiven: true,
                allowSms: true,
                allowVoice: false,
                metadata: {
                  source: "onboarding",
                },
              },
            );
            expect(captured.status).toBe(201);
            expect(captured.data.phoneNumber).toBe("+14155550100");
            expect(captured.data.policies).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  channelType: "sms",
                  channelRef: "+14155550100",
                  allowEscalation: true,
                }),
                expect.objectContaining({
                  channelType: "voice",
                  channelRef: "+14155550100",
                  allowEscalation: false,
                }),
              ]),
            );

            const listed = await req(
              server.port,
              "GET",
              "/api/lifeops/channel-policies",
            );
            expect(listed.status).toBe(200);
            expect(listed.data.policies).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  channelType: "sms",
                  channelRef: "+14155550100",
                  metadata: expect.objectContaining({
                    consentGiven: true,
                    smsAllowed: true,
                    voiceAllowed: false,
                  }),
                }),
                expect.objectContaining({
                  channelType: "voice",
                  channelRef: "+14155550100",
                  metadata: expect.objectContaining({
                    consentGiven: true,
                    smsAllowed: true,
                    voiceAllowed: false,
                  }),
                }),
              ]),
            );
          } finally {
            await server.close();
          }
        });
        continue;
      }

      if (scenario.id === "P2-02") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          const runtime = createApiRuntime("p2-02-agent");
          const service = new LifeOpsService(runtime);
          const server = await startApiServer({
            port: 0,
            runtime,
          });

          try {
            const consent = await req(
              server.port,
              "POST",
              "/api/lifeops/channels/phone-consent",
              {
                phoneNumber: "415-555-0101",
                consentGiven: true,
                allowSms: true,
                allowVoice: true,
              },
            );
            expect(consent.status).toBe(201);

            const created = await service.createDefinition({
              kind: "task",
              title: "Check in on the venue",
              timezone: "America/Los_Angeles",
              priority: 3,
              cadence: {
                kind: "once",
                dueAt: "2026-04-04T05:20:00.000Z",
                visibilityLeadMinutes: 0,
                visibilityLagMinutes: 900,
              },
              reminderPlan: {
                steps: [
                  {
                    channel: "in_app",
                    offsetMinutes: 0,
                    label: "In-app",
                  },
                  {
                    channel: "sms",
                    offsetMinutes: 5,
                    label: "SMS",
                  },
                  {
                    channel: "voice",
                    offsetMinutes: 10,
                    label: "Voice",
                  },
                ],
                quietHours: {
                  timezone: "America/Los_Angeles",
                  startMinute: 22 * 60,
                  endMinute: 7 * 60,
                  channels: ["sms", "voice"],
                },
              },
            });

            const quietOverview = await service.getOverview(
              new Date("2026-04-04T05:35:00.000Z"),
            );
            const occurrence = quietOverview.occurrences.find(
              (candidate) => candidate.definitionId === created.definition.id,
            );
            expect(occurrence).toBeDefined();

            const firstProcess = await req(
              server.port,
              "POST",
              "/api/lifeops/reminders/process",
              {
                now: "2026-04-04T05:35:00.000Z",
                limit: 10,
              },
            );
            expect(firstProcess.status).toBe(200);
            const quietAttempts = (
              firstProcess.data.attempts as Array<Record<string, unknown>>
            ).filter((attempt) => attempt.ownerId === occurrence?.id);
            expect(quietAttempts).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  channel: "in_app",
                  outcome: "delivered",
                }),
                expect.objectContaining({
                  channel: "sms",
                  outcome: "blocked_quiet_hours",
                }),
                expect.objectContaining({
                  channel: "voice",
                  outcome: "blocked_urgency",
                }),
              ]),
            );

            const acknowledged = await req(
              server.port,
              "POST",
              "/api/lifeops/reminders/acknowledge",
              {
                ownerType: "occurrence",
                ownerId: occurrence?.id,
                note: "Seen already",
              },
            );
            expect(acknowledged.status).toBe(200);

            const afterAck = await req(
              server.port,
              "POST",
              "/api/lifeops/reminders/process",
              {
                now: "2026-04-04T16:00:00.000Z",
                limit: 10,
              },
            );
            expect(afterAck.status).toBe(200);
            expect(
              (afterAck.data.attempts as Array<Record<string, unknown>>).some(
                (attempt) =>
                  attempt.ownerId === occurrence?.id &&
                  attempt.outcome === "blocked_acknowledged",
              ),
            ).toBe(true);

            const policyUpdate = await req(
              server.port,
              "POST",
              "/api/lifeops/channel-policies",
              {
                channelType: "sms",
                channelRef: "+14155550101",
                allowReminders: true,
                allowEscalation: false,
                requireConfirmationForActions: true,
              },
            );
            expect(policyUpdate.status).toBe(201);

            const secondDefinition = await service.createDefinition({
              kind: "task",
              title: "Confirm arrival window",
              timezone: "America/Los_Angeles",
              priority: 1,
              cadence: {
                kind: "once",
                dueAt: "2026-04-04T15:35:00.000Z",
                visibilityLeadMinutes: 0,
                visibilityLagMinutes: 240,
              },
              reminderPlan: {
                steps: [
                  {
                    channel: "in_app",
                    offsetMinutes: 0,
                    label: "In-app",
                  },
                  {
                    channel: "sms",
                    offsetMinutes: 5,
                    label: "SMS",
                  },
                ],
              },
            });
            const dayOverview = await service.getOverview(
              new Date("2026-04-04T15:45:00.000Z"),
            );
            const secondOccurrence = dayOverview.occurrences.find(
              (candidate) =>
                candidate.definitionId === secondDefinition.definition.id,
            );
            expect(secondOccurrence).toBeDefined();

            const policyBlocked = await req(
              server.port,
              "POST",
              "/api/lifeops/reminders/process",
              {
                now: "2026-04-04T15:45:00.000Z",
                limit: 10,
              },
            );
            expect(policyBlocked.status).toBe(200);
            expect(
              (
                policyBlocked.data.attempts as Array<Record<string, unknown>>
              ).some(
                (attempt) =>
                  attempt.ownerId === secondOccurrence?.id &&
                  attempt.channel === "sms" &&
                  attempt.outcome === "blocked_policy",
              ),
            ).toBe(true);
          } finally {
            await server.close();
          }
        });
        continue;
      }

      if (scenario.id === "P2-03") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          const runtime = createApiRuntime("p2-03-agent");
          const server = await startApiServer({
            port: 0,
            runtime,
          });

          try {
            const created = await req(
              server.port,
              "POST",
              "/api/lifeops/workflows",
              {
                title: "Morning ops sweep",
                triggerType: "schedule",
                schedule: {
                  kind: "interval",
                  everyMinutes: 60,
                  timezone: "UTC",
                },
                actionPlan: {
                  steps: [
                    {
                      kind: "summarize",
                      resultKey: "summary",
                      prompt: "Daily summary",
                    },
                  ],
                },
                metadata: {
                  origin: "milady-panel",
                },
              },
            );
            expect(created.status).toBe(201);
            expect(created.data.definition).toMatchObject({
              title: "Morning ops sweep",
              triggerType: "schedule",
              createdBy: "user",
              status: "active",
              metadata: {
                origin: "milady-panel",
              },
            });
            const workflowId = String(created.data.definition.id);

            const listed = await req(
              server.port,
              "GET",
              "/api/lifeops/workflows",
            );
            expect(listed.status).toBe(200);
            expect(listed.data.workflows).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  definition: expect.objectContaining({
                    id: workflowId,
                    createdBy: "user",
                    metadata: expect.objectContaining({
                      origin: "milady-panel",
                    }),
                  }),
                  runs: [],
                }),
              ]),
            );

            const updated = await req(
              server.port,
              "PUT",
              `/api/lifeops/workflows/${encodeURIComponent(workflowId)}`,
              {
                title: "Paused ops sweep",
                status: "paused",
                schedule: {
                  kind: "cron",
                  cronExpression: "0 14 * * *",
                  timezone: "UTC",
                },
              },
            );
            expect(updated.status).toBe(200);
            expect(updated.data.definition).toMatchObject({
              id: workflowId,
              title: "Paused ops sweep",
              status: "paused",
              createdBy: "user",
              schedule: {
                kind: "cron",
                cronExpression: "0 14 * * *",
              },
            });

            const fetched = await req(
              server.port,
              "GET",
              `/api/lifeops/workflows/${encodeURIComponent(workflowId)}`,
            );
            expect(fetched.status).toBe(200);
            expect(fetched.data.definition).toMatchObject({
              id: workflowId,
              title: "Paused ops sweep",
              createdBy: "user",
              metadata: {
                origin: "milady-panel",
              },
            });
          } finally {
            await server.close();
          }
        });
        continue;
      }

      if (scenario.id === "P2-04") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          await withGoogleOAuthApiServer(
            {
              MILADY_GOOGLE_OAUTH_DESKTOP_CLIENT_ID: "desktop-client-id",
            },
            async ({ port, fetchMock }) => {
              fetchMock.mockResolvedValueOnce(
                new Response(
                  JSON.stringify({
                    access_token: "workflow-access-token",
                    refresh_token: "workflow-refresh-token",
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
                      sub: "workflow-google-user",
                      email: "workflow@example.com",
                      name: "Workflow Example",
                      email_verified: true,
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
                  capabilities: ["google.calendar.read", "google.gmail.triage"],
                },
              );
              expect(startRes.status).toBe(200);
              const authUrl = new URL(String(startRes.data.authUrl));
              const callbackRes = await req(
                port,
                "GET",
                `/api/lifeops/connectors/google/callback?state=${encodeURIComponent(authUrl.searchParams.get("state") ?? "")}&code=workflow-code`,
              );
              expect(callbackRes.status).toBe(200);

              const now = new Date("2026-04-04T16:00:00.000Z");
              fetchMock.mockImplementation(async (input) => {
                const target = String(input);
                if (target.includes("/calendar/v3/calendars/primary/events")) {
                  return new Response(
                    JSON.stringify({
                      items: [
                        {
                          id: "workflow-event",
                          status: "confirmed",
                          summary: "Workflow planning",
                          start: {
                            dateTime: now.toISOString(),
                            timeZone: "UTC",
                          },
                          end: {
                            dateTime: new Date(
                              now.getTime() + 60 * 60_000,
                            ).toISOString(),
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
                  target ===
                  "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=3&includeSpamTrash=false&labelIds=INBOX"
                ) {
                  return new Response(
                    JSON.stringify({
                      messages: [{ id: "mail-1", threadId: "thread-1" }],
                    }),
                    {
                      status: 200,
                      headers: { "content-type": "application/json" },
                    },
                  );
                }
                if (
                  target.startsWith(
                    "https://gmail.googleapis.com/gmail/v1/users/me/messages/mail-1?",
                  )
                ) {
                  return new Response(
                    JSON.stringify({
                      id: "mail-1",
                      threadId: "thread-1",
                      labelIds: ["INBOX", "UNREAD", "IMPORTANT"],
                      snippet: "Need your sign-off on the next draft.",
                      internalDate: String(now.getTime()),
                      payload: {
                        headers: [
                          { name: "Subject", value: "Next draft" },
                          { name: "From", value: "Mira <mira@example.com>" },
                          { name: "To", value: "workflow@example.com" },
                          {
                            name: "Message-Id",
                            value: "<workflow@example.com>",
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
                throw new Error(`Unexpected fetch: ${target}`);
              });

              const workflowCreate = await req(
                port,
                "POST",
                "/api/lifeops/workflows",
                {
                  title: "Triage and plan",
                  triggerType: "schedule",
                  schedule: {
                    kind: "interval",
                    everyMinutes: 120,
                    timezone: "UTC",
                  },
                  actionPlan: {
                    steps: [
                      {
                        kind: "get_calendar_feed",
                        resultKey: "calendar",
                        request: {
                          timeZone: "UTC",
                          forceSync: true,
                        },
                      },
                      {
                        kind: "get_gmail_triage",
                        resultKey: "mail",
                        request: {
                          maxResults: 3,
                          forceSync: true,
                        },
                      },
                      {
                        kind: "summarize",
                        resultKey: "summary",
                        sourceKey: "mail",
                        prompt: "Workflow mail summary",
                      },
                      {
                        kind: "create_task",
                        resultKey: "task",
                        request: {
                          kind: "task",
                          title: "Follow up with Mira",
                          timezone: "UTC",
                          cadence: {
                            kind: "once",
                            dueAt: "2026-04-04T18:00:00.000Z",
                          },
                        },
                      },
                      {
                        kind: "browser",
                        resultKey: "browser",
                        sessionTitle: "Review account settings",
                        actions: [
                          {
                            kind: "navigate",
                            label: "Open settings",
                            url: "https://example.com/settings",
                            accountAffecting: true,
                            requiresConfirmation: true,
                          },
                        ],
                      },
                    ],
                  },
                  permissionPolicy: {
                    allowBrowserActions: true,
                    trustedBrowserActions: false,
                    requireConfirmationForBrowserActions: true,
                  },
                },
              );
              expect(workflowCreate.status).toBe(201);

              const browserSettings = await req(
                port,
                "POST",
                "/api/lifeops/browser/settings",
                {
                  allowBrowserControl: true,
                  enabled: true,
                  trackingMode: "current_tab",
                },
              );
              expect(browserSettings.status).toBe(200);

              const runRes = await req(
                port,
                "POST",
                `/api/lifeops/workflows/${encodeURIComponent(String(workflowCreate.data.definition.id))}/run`,
                {
                  now: now.toISOString(),
                },
              );
              expect(runRes.status).toBe(201);
              expect(runRes.data.run.result.outputs.task).toMatchObject({
                title: "Follow up with Mira",
              });
              expect(runRes.data.run.result.outputs.summary).toMatchObject({
                text: expect.stringContaining("Workflow mail summary"),
              });
              expect(runRes.data.run.result.outputs.browser).toMatchObject({
                requiresConfirmation: true,
                status: "awaiting_confirmation",
              });

              const sessionId = String(
                runRes.data.run.result.outputs.browser.sessionId,
              );
              const sessionRes = await req(
                port,
                "GET",
                `/api/lifeops/browser/sessions/${encodeURIComponent(sessionId)}`,
              );
              expect(sessionRes.status).toBe(200);
              expect(sessionRes.data.session).toMatchObject({
                id: sessionId,
                status: "awaiting_confirmation",
              });
            },
          );
        });
        continue;
      }

      if (scenario.id === "P2-05") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          const envBackup = saveEnv(
            "TWILIO_ACCOUNT_SID",
            "TWILIO_AUTH_TOKEN",
            "TWILIO_PHONE_NUMBER",
          );
          process.env.TWILIO_ACCOUNT_SID = "AC123";
          process.env.TWILIO_AUTH_TOKEN = "secret";
          process.env.TWILIO_PHONE_NUMBER = "+14155550999";
          const fetchMock = vi.fn<typeof fetch>().mockImplementation(
            async () =>
              new Response(JSON.stringify({ sid: "SM123" }), {
                status: 201,
                headers: { "content-type": "application/json" },
              }),
          );
          vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

          const runtime = createApiRuntime("p2-05-agent");
          const service = new LifeOpsService(runtime);
          const server = await startApiServer({
            port: 0,
            runtime,
          });

          try {
            const consent = await req(
              server.port,
              "POST",
              "/api/lifeops/channels/phone-consent",
              {
                phoneNumber: "415-555-0102",
                consentGiven: true,
                allowSms: true,
                allowVoice: false,
              },
            );
            expect(consent.status).toBe(201);

            const created = await service.createDefinition({
              kind: "task",
              title: "Reply to venue",
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
                    channel: "in_app",
                    offsetMinutes: 0,
                    label: "In-app",
                  },
                  {
                    channel: "sms",
                    offsetMinutes: 5,
                    label: "SMS",
                  },
                ],
              },
            });
            const overview = await service.getOverview(
              new Date("2026-04-04T16:10:00.000Z"),
            );
            const occurrence = overview.occurrences.find(
              (candidate) => candidate.definitionId === created.definition.id,
            );
            expect(occurrence).toBeDefined();

            const processed = await req(
              server.port,
              "POST",
              "/api/lifeops/reminders/process",
              {
                now: "2026-04-04T16:10:00.000Z",
                limit: 10,
              },
            );
            expect(processed.status).toBe(200);

            const inspection = await req(
              server.port,
              "GET",
              `/api/lifeops/reminders/inspection?ownerType=occurrence&ownerId=${encodeURIComponent(String(occurrence?.id ?? ""))}`,
            );
            expect(inspection.status).toBe(200);
            expect(inspection.data.attempts).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  channel: "sms",
                  stepIndex: 1,
                  outcome: "delivered",
                  connectorRef: "twilio:+14155550102",
                  deliveryMetadata: expect.objectContaining({
                    sid: "SM123",
                  }),
                }),
              ]),
            );
            expect(inspection.data.audits).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  eventType: "reminder_due",
                }),
                expect.objectContaining({
                  eventType: "reminder_delivered",
                  decision: expect.objectContaining({
                    connectorRef: "twilio:+14155550102",
                  }),
                }),
              ]),
            );
          } finally {
            await server.close();
            vi.unstubAllGlobals();
            envBackup.restore();
          }
        });
        continue;
      }

      if (scenario.id === "P3-01") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          const runtime = createApiRuntime("p3-01-agent");
          const server = await startApiServer({
            port: 0,
            runtime,
          });

          try {
            const readOnly = await req(
              server.port,
              "POST",
              "/api/lifeops/connectors/x",
              {
                capabilities: ["x.read"],
                identity: {
                  handle: "@milady",
                },
              },
            );
            expect(readOnly.status).toBe(201);
            expect(readOnly.data.grantedCapabilities).toEqual(["x.read"]);

            const upgraded = await req(
              server.port,
              "POST",
              "/api/lifeops/connectors/x",
              {
                capabilities: ["x.read", "x.write"],
                identity: {
                  handle: "@milady",
                },
              },
            );
            expect(upgraded.status).toBe(201);
            expect(upgraded.data.grantedCapabilities).toEqual(
              expect.arrayContaining(["x.read", "x.write"]),
            );

            const statusRes = await req(
              server.port,
              "GET",
              "/api/lifeops/connectors/x/status",
            );
            expect(statusRes.status).toBe(200);
            expect(statusRes.data.grantedCapabilities).toEqual(
              expect.arrayContaining(["x.read", "x.write"]),
            );
            expect(statusRes.data.identity).toMatchObject({
              handle: "@milady",
            });
          } finally {
            await server.close();
          }
        });
        continue;
      }

      if (scenario.id === "P3-02") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          const envBackup = saveEnv(
            "TWITTER_API_KEY",
            "TWITTER_API_SECRET_KEY",
            "TWITTER_ACCESS_TOKEN",
            "TWITTER_ACCESS_TOKEN_SECRET",
          );
          process.env.TWITTER_API_KEY = "key";
          process.env.TWITTER_API_SECRET_KEY = "secret";
          process.env.TWITTER_ACCESS_TOKEN = "token";
          process.env.TWITTER_ACCESS_TOKEN_SECRET = "token-secret";
          const fetchMock = vi.fn<typeof fetch>().mockImplementation(
            async () =>
              new Response(JSON.stringify({ data: { id: "tweet-123" } }), {
                status: 201,
                headers: { "content-type": "application/json" },
              }),
          );
          vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

          const runtime = createApiRuntime("p3-02-agent");
          const server = await startApiServer({
            port: 0,
            runtime,
          });

          try {
            const startupFetchCount = fetchMock.mock.calls.length;
            const connector = await req(
              server.port,
              "POST",
              "/api/lifeops/connectors/x",
              {
                capabilities: ["x.read", "x.write"],
              },
            );
            expect(connector.status).toBe(201);

            const blocked = await req(
              server.port,
              "POST",
              "/api/lifeops/x/posts",
              {
                text: "No confirmation yet",
              },
            );
            expect(blocked.status).toBe(409);
            expect(fetchMock.mock.calls.length).toBe(startupFetchCount);

            const confirmed = await req(
              server.port,
              "POST",
              "/api/lifeops/x/posts",
              {
                text: "Confirmed post",
                confirmPost: true,
              },
            );
            expect(confirmed.status).toBe(201);
            expect(confirmed.data).toMatchObject({
              ok: true,
              postId: "tweet-123",
            });

            const trustedPolicy = await req(
              server.port,
              "POST",
              "/api/lifeops/channel-policies",
              {
                channelType: "x",
                channelRef: "default",
                allowPosts: true,
                requireConfirmationForActions: false,
              },
            );
            expect(trustedPolicy.status).toBe(201);

            const trustedPost = await req(
              server.port,
              "POST",
              "/api/lifeops/x/posts",
              {
                text: "Trusted policy post",
              },
            );
            expect(trustedPost.status).toBe(201);
            expect(trustedPost.data).toMatchObject({
              ok: true,
              postId: "tweet-123",
            });
            expect(fetchMock.mock.calls.length).toBe(startupFetchCount + 2);
          } finally {
            await server.close();
            vi.unstubAllGlobals();
            envBackup.restore();
          }
        });
        continue;
      }

      if (scenario.id === "P3-03") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          const runtime = createApiRuntime("p3-03-agent");
          const server = await startApiServer({
            port: 0,
            runtime,
          });

          try {
            const browserSettings = await req(
              server.port,
              "POST",
              "/api/lifeops/browser/settings",
              {
                allowBrowserControl: true,
                enabled: true,
                trackingMode: "current_tab",
              },
            );
            expect(browserSettings.status).toBe(200);

            const created = await req(
              server.port,
              "POST",
              "/api/lifeops/browser/sessions",
              {
                title: "Account review",
                actions: [
                  {
                    kind: "navigate",
                    label: "Open account",
                    url: "https://example.com/account",
                    accountAffecting: true,
                    requiresConfirmation: true,
                  },
                ],
              },
            );
            expect(created.status).toBe(201);
            const sessionId = String(created.data.session.id);
            expect(created.data.session.status).toBe("awaiting_confirmation");

            const confirmed = await req(
              server.port,
              "POST",
              `/api/lifeops/browser/sessions/${encodeURIComponent(sessionId)}/confirm`,
              {
                confirmed: true,
              },
            );
            expect(confirmed.status).toBe(200);
            expect(confirmed.data.session.status).toBe("queued");

            const completed = await req(
              server.port,
              "POST",
              `/api/lifeops/browser/sessions/${encodeURIComponent(sessionId)}/complete`,
              {
                result: {
                  finalUrl: "https://example.com/account",
                },
              },
            );
            expect(completed.status).toBe(200);
            expect(completed.data.session.status).toBe("done");

            const listed = await req(
              server.port,
              "GET",
              "/api/lifeops/browser/sessions",
            );
            expect(listed.status).toBe(200);
            expect(listed.data.sessions).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  id: sessionId,
                  status: "done",
                }),
              ]),
            );
          } finally {
            await server.close();
          }
        });
        continue;
      }

      if (scenario.id === "P3-04") {
        it(`[${scenario.id}] ${scenario.title}`, async () => {
          const runtime = createApiRuntime("p3-04-agent");
          const server = await startApiServer({
            port: 0,
            runtime,
          });

          try {
            const browserSettings = await req(
              server.port,
              "POST",
              "/api/lifeops/browser/settings",
              {
                allowBrowserControl: true,
                enabled: true,
                trackingMode: "current_tab",
              },
            );
            expect(browserSettings.status).toBe(200);

            const created = await req(
              server.port,
              "POST",
              "/api/lifeops/browser/sessions",
              {
                title: "Delete draft",
                actions: [
                  {
                    kind: "click",
                    label: "Delete draft",
                    selector: "[data-delete]",
                    accountAffecting: true,
                    requiresConfirmation: true,
                  },
                ],
              },
            );
            expect(created.status).toBe(201);
            const sessionId = String(created.data.session.id);
            expect(
              created.data.session.awaitingConfirmationForActionId,
            ).toBeTruthy();

            const blocked = await req(
              server.port,
              "POST",
              `/api/lifeops/browser/sessions/${encodeURIComponent(sessionId)}/complete`,
              {
                result: {
                  finalUrl: "https://example.com/drafts",
                },
              },
            );
            expect(blocked.status).toBe(409);
            expect(String(blocked.data.error)).toContain(
              "explicit confirmation",
            );

            const cancelled = await req(
              server.port,
              "POST",
              `/api/lifeops/browser/sessions/${encodeURIComponent(sessionId)}/confirm`,
              {
                confirmed: false,
              },
            );
            expect(cancelled.status).toBe(200);
            expect(cancelled.data.session.status).toBe("cancelled");
          } finally {
            await server.close();
          }
        });
        continue;
      }

      it(`[${scenario.id}] ${scenario.title}`, () => {
        throw new Error(`Missing executable validation for ${scenario.id}`);
      });
    }
  });
}

const describeLive = describeIf(process.env.MILADY_LIFEOPS_LIVE_TEST === "1");

function liveScenarioTitle(id: string): string {
  return liveScenarios.find((scenario) => scenario.id === id)?.title ?? id;
}

const liveGoogleExpectedEmail = readOptionalEnv(
  "MILADY_LIFEOPS_LIVE_GOOGLE_EXPECTED_EMAIL",
);
const liveGoogleLocalCallbackFile = readOptionalEnv(
  "MILADY_LIFEOPS_LIVE_GOOGLE_LOCAL_CALLBACK_FILE",
);
const liveGoogleRemoteCallbackFile = readOptionalEnv(
  "MILADY_LIFEOPS_LIVE_GOOGLE_REMOTE_CALLBACK_FILE",
);
const liveGoogleCalendarCallbackFile = readOptionalEnv(
  "MILADY_LIFEOPS_LIVE_GOOGLE_CALENDAR_CALLBACK_FILE",
);
const liveGoogleGmailCallbackFile = readOptionalEnv(
  "MILADY_LIFEOPS_LIVE_GOOGLE_GMAIL_CALLBACK_FILE",
);
const liveGoogleRevokeCallbackFile = readOptionalEnv(
  "MILADY_LIFEOPS_LIVE_GOOGLE_REVOKE_CALLBACK_FILE",
);
const liveGoogleRevokeMarkerFile = readOptionalEnv(
  "MILADY_LIFEOPS_LIVE_GOOGLE_REVOKE_MARKER_FILE",
);
const liveGoogleAdminBlockCallbackFile = readOptionalEnv(
  "MILADY_LIFEOPS_LIVE_GOOGLE_ADMIN_BLOCK_CALLBACK_FILE",
);
const liveGoogleAdminBlockMode =
  readOptionalEnv("MILADY_LIFEOPS_LIVE_GOOGLE_ADMIN_BLOCK_MODE") === "remote"
    ? "remote"
    : "local";
const liveTwilioToPhone = readOptionalEnv(
  "MILADY_LIFEOPS_LIVE_TWILIO_TO_PHONE",
);
const liveTwilioPrimaryChannel =
  readOptionalEnv("MILADY_LIFEOPS_LIVE_TWILIO_PRIMARY_CHANNEL") === "voice"
    ? "voice"
    : "sms";
const hasTwilioConfig =
  Boolean(readOptionalEnv("TWILIO_ACCOUNT_SID")) &&
  Boolean(readOptionalEnv("TWILIO_AUTH_TOKEN")) &&
  Boolean(readOptionalEnv("TWILIO_PHONE_NUMBER"));

describeLive("Milaidy PRD live connector coverage", () => {
  itIf(hasLiveGoogleLocalConfig() || !liveGoogleLocalCallbackFile)(
    `[LIVE-01] ${liveScenarioTitle("LIVE-01")}`,
    async () => {
      await withLiveLifeOpsApiServer(async ({ port, stateDir }) => {
        const { status, tokenPath } = await connectLiveGoogle({
          port,
          stateDir,
          mode: "local",
          capabilities: ["google.calendar.read"],
          callbackFile: liveGoogleLocalCallbackFile!,
          expectedEmail: liveGoogleExpectedEmail,
        });
        const raw = await readJsonFile<{
          refreshToken?: string | null;
        }>(tokenPath);
        expect(raw.refreshToken?.trim()).toBeTruthy();
        expect(status.mode).toBe("local");
        expect(status.reason).toBe("connected");
        expect(status.grantedCapabilities).toEqual(
          expect.arrayContaining([
            "google.basic_identity",
            "google.calendar.read",
          ]),
        );
      });
    },
    LIVE_TEST_TIMEOUT_MS,
  );

  itIf(hasLiveGoogleRemoteConfig() || !liveGoogleRemoteCallbackFile)(
    `[LIVE-02] ${liveScenarioTitle("LIVE-02")}`,
    async () => {
      await withLiveLifeOpsApiServer(async ({ port, stateDir }) => {
        const { status, tokenPath } = await connectLiveGoogle({
          port,
          stateDir,
          mode: "remote",
          capabilities: ["google.calendar.read"],
          callbackFile: liveGoogleRemoteCallbackFile!,
          expectedEmail: liveGoogleExpectedEmail,
        });
        const raw = await readJsonFile<{
          refreshToken?: string | null;
        }>(tokenPath);
        expect(raw.refreshToken?.trim()).toBeTruthy();
        expect(status.mode).toBe("remote");
        expect(status.connected).toBe(true);
      });
    },
    LIVE_TEST_TIMEOUT_MS,
  );

  itIf(hasLiveGoogleLocalConfig() || !liveGoogleCalendarCallbackFile)(
    `[LIVE-03] ${liveScenarioTitle("LIVE-03")}`,
    async () => {
      await withLiveLifeOpsApiServer(async ({ port, stateDir }) => {
        const { tokenPath } = await connectLiveGoogle({
          port,
          stateDir,
          mode: "local",
          capabilities: ["google.calendar.read"],
          callbackFile: liveGoogleCalendarCallbackFile!,
          expectedEmail: liveGoogleExpectedEmail,
        });

        const firstFeed = await req(
          port,
          "GET",
          "/api/lifeops/calendar/feed?mode=local&forceSync=1&timeZone=UTC",
        );
        expect(firstFeed.status).toBe(200);
        expect(Array.isArray(firstFeed.data.events)).toBe(true);

        await expireStoredGoogleAccessToken(tokenPath);

        const secondFeed = await req(
          port,
          "GET",
          "/api/lifeops/calendar/feed?mode=local&forceSync=1&timeZone=UTC",
        );
        expect(secondFeed.status).toBe(200);
        expect(Array.isArray(secondFeed.data.events)).toBe(true);

        const refreshed = await readJsonFile<{
          expiresAt?: number;
          refreshToken?: string | null;
        }>(tokenPath);
        expect(refreshed.refreshToken?.trim()).toBeTruthy();
        expect(Number(refreshed.expiresAt)).toBeGreaterThan(Date.now());

        const statusRes = await req(
          port,
          "GET",
          "/api/lifeops/connectors/google/status?mode=local",
        );
        expect(statusRes.status).toBe(200);
        expect(statusRes.data.connected).toBe(true);
        expect(statusRes.data.reason).toBe("connected");
      });
    },
    LIVE_TEST_TIMEOUT_MS,
  );

  itIf(hasLiveGoogleLocalConfig() || !liveGoogleGmailCallbackFile)(
    `[LIVE-04] ${liveScenarioTitle("LIVE-04")}`,
    async () => {
      await withLiveLifeOpsApiServer(async ({ port, stateDir, runtime }) => {
        const { status } = await connectLiveGoogle({
          port,
          stateDir,
          mode: "local",
          capabilities: ["google.gmail.triage"],
          callbackFile: liveGoogleGmailCallbackFile!,
          expectedEmail: liveGoogleExpectedEmail,
        });
        expect(status.grantedCapabilities).toEqual(
          expect.arrayContaining([
            "google.basic_identity",
            "google.gmail.triage",
          ]),
        );
        expect(status.grantedCapabilities).not.toContain("google.gmail.send");

        const triageRes = await req(
          port,
          "GET",
          "/api/lifeops/gmail/triage?mode=local&forceSync=1&maxResults=10",
        );
        expect(triageRes.status).toBe(200);
        expect(Array.isArray(triageRes.data.messages)).toBe(true);

        const auditEventTypes = await listAuditEventTypes(runtime);
        expect(auditEventTypes).toContain("gmail_triage_synced");
        expect(auditEventTypes).not.toContain("gmail_reply_sent");
      });
    },
    LIVE_TEST_TIMEOUT_MS,
  );

  itIf(
    !hasLiveGoogleLocalConfig() ||
      !liveGoogleRevokeCallbackFile ||
      !liveGoogleRevokeMarkerFile,
  )(
    `[LIVE-05] ${liveScenarioTitle("LIVE-05")}`,
    async () => {
      await withLiveLifeOpsApiServer(async ({ port, stateDir }) => {
        const { tokenPath } = await connectLiveGoogle({
          port,
          stateDir,
          mode: "local",
          capabilities: ["google.calendar.read"],
          callbackFile: liveGoogleRevokeCallbackFile!,
          expectedEmail: liveGoogleExpectedEmail,
        });

        await waitForSignalFile({
          label: "google-revoke",
          filePath: liveGoogleRevokeMarkerFile!,
          instructions: [
            "Revoke the connected Google app access for this account, then write any text into:",
            liveGoogleRevokeMarkerFile!,
          ].join("\n"),
        });

        await expireStoredGoogleAccessToken(tokenPath);

        const feedRes = await req(
          port,
          "GET",
          "/api/lifeops/calendar/feed?mode=local&forceSync=1&timeZone=UTC",
        );
        expect(feedRes.status).toBe(401);
        expect(String(feedRes.data.error).toLowerCase()).toContain("re-auth");

        const statusRes = await req(
          port,
          "GET",
          "/api/lifeops/connectors/google/status?mode=local",
        );
        expect(statusRes.status).toBe(200);
        expect(statusRes.data.connected).toBe(false);
        expect(statusRes.data.reason).toBe("needs_reauth");
      });
    },
    LIVE_TEST_TIMEOUT_MS,
  );

  itIf(hasTwilioConfig || !liveTwilioToPhone)(
    `[LIVE-06] ${liveScenarioTitle("LIVE-06")}`,
    async () => {
      await withLiveLifeOpsApiServer(async ({ port, runtime }) => {
        const primaryChannel = liveTwilioPrimaryChannel;
        const blockedChannel = primaryChannel === "sms" ? "voice" : "sms";
        const service = new LifeOpsService(runtime);

        const consent = await req(
          port,
          "POST",
          "/api/lifeops/channels/phone-consent",
          {
            phoneNumber: liveTwilioToPhone!,
            consentGiven: true,
            allowSms: primaryChannel === "sms",
            allowVoice: primaryChannel === "voice",
          },
        );
        expect(consent.status).toBe(201);

        const created = await service.createDefinition({
          kind: "task",
          title: "Live Twilio escalation check",
          timezone: "UTC",
          priority: 1,
          cadence: {
            kind: "once",
            dueAt: "2026-04-04T12:00:00.000Z",
            visibilityLeadMinutes: 0,
            visibilityLagMinutes: 240,
          },
          reminderPlan: {
            steps: [
              {
                channel: primaryChannel,
                offsetMinutes: 0,
                label: `Primary ${primaryChannel}`,
              },
              {
                channel: blockedChannel,
                offsetMinutes: 5,
                label: `Blocked ${blockedChannel}`,
              },
            ],
          },
        });
        const overview = await service.getOverview(
          new Date("2026-04-04T12:10:00.000Z"),
        );
        const occurrence = overview.occurrences.find(
          (candidate) => candidate.definitionId === created.definition.id,
        );
        expect(occurrence).toBeDefined();

        const processed = await req(
          port,
          "POST",
          "/api/lifeops/reminders/process",
          {
            now: "2026-04-04T12:10:00.000Z",
            limit: 10,
          },
        );
        expect(processed.status).toBe(200);

        const attempts = (
          processed.data.attempts as Array<Record<string, unknown>>
        ).filter((attempt) => attempt.ownerId === occurrence?.id);
        expect(attempts).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              channel: primaryChannel,
              outcome: "delivered",
              connectorRef: `twilio:${liveTwilioToPhone}`,
            }),
            expect.objectContaining({
              channel: blockedChannel,
              outcome: "blocked_policy",
            }),
          ]),
        );

        const inspection = await req(
          port,
          "GET",
          `/api/lifeops/reminders/inspection?ownerType=occurrence&ownerId=${encodeURIComponent(String(occurrence?.id ?? ""))}`,
        );
        expect(inspection.status).toBe(200);
        expect(Array.isArray(inspection.data.audits)).toBe(true);
        expect(
          (inspection.data.audits as Array<Record<string, unknown>>).some(
            (audit) =>
              audit.eventType === "reminder_delivered" &&
              String(audit.decision?.connectorRef ?? "").startsWith("twilio:"),
          ),
        ).toBe(true);
      });
    },
    LIVE_TEST_TIMEOUT_MS,
  );

  itIf(
    !liveGoogleAdminBlockCallbackFile ||
      (liveGoogleAdminBlockMode === "local"
        ? !hasLiveGoogleLocalConfig()
        : !hasLiveGoogleRemoteConfig()),
  )(
    `[LIVE-07] ${liveScenarioTitle("LIVE-07")}`,
    async () => {
      await withLiveLifeOpsApiServer(async ({ port }) => {
        const startRes = await req(
          port,
          "POST",
          "/api/lifeops/connectors/google/start",
          {
            mode: liveGoogleAdminBlockMode,
            capabilities: ["google.calendar.read"],
          },
        );
        expect(startRes.status).toBe(200);

        const callbackUrl = await waitForCallbackUrl({
          label: "google-admin-block",
          authUrl: String(startRes.data.authUrl),
          callbackFile: liveGoogleAdminBlockCallbackFile!,
        });
        const callbackRes = await req(
          port,
          "GET",
          `/api/lifeops/connectors/google/callback${callbackUrl.search}`,
        );

        if (callbackRes.status !== 200) {
          expect([400, 403]).toContain(callbackRes.status);
          expect(String(callbackRes.data._raw).toLowerCase()).toMatch(
            /admin|policy|blocked|workspace|organization|forbidden/,
          );
          return;
        }

        const feedRes = await req(
          port,
          "GET",
          `/api/lifeops/calendar/feed?mode=${liveGoogleAdminBlockMode}&forceSync=1&timeZone=UTC`,
        );
        expect(feedRes.status).toBe(403);
        expect(String(feedRes.data.error).toLowerCase()).toMatch(
          /admin|policy|blocked|workspace|organization|forbidden/,
        );
      });
    },
    LIVE_TEST_TIMEOUT_MS,
  );

  it(`[LIVE-08] ${liveScenarioTitle("LIVE-08")}`, async () => {
    await withLiveLifeOpsApiServer(async ({ port }) => {
      const created = await req(port, "POST", "/api/lifeops/browser/sessions", {
        title: "Live browser session",
        actions: [
          {
            kind: "navigate",
            label: "Open settings",
            url: "https://example.com/settings",
          },
          {
            kind: "click",
            label: "Save settings",
            selector: "[data-save]",
            accountAffecting: true,
            requiresConfirmation: true,
          },
        ],
      });
      expect(created.status).toBe(201);
      const sessionId = String(created.data.session.id);

      const pending = await req(
        port,
        "GET",
        `/api/lifeops/browser/sessions/${encodeURIComponent(sessionId)}`,
      );
      expect(pending.status).toBe(200);
      expect(pending.data.session.status).toBe("awaiting_confirmation");
      expect(pending.data.session.awaitingConfirmationForActionId).toBeTruthy();

      await assertBrowserSessionListed(
        port,
        sessionId,
        "awaiting_confirmation",
      );

      const confirmed = await req(
        port,
        "POST",
        `/api/lifeops/browser/sessions/${encodeURIComponent(sessionId)}/confirm`,
        {
          confirmed: true,
        },
      );
      expect(confirmed.status).toBe(200);
      expect(confirmed.data.session.status).toBe("queued");

      await assertBrowserSessionListed(port, sessionId, "queued");

      const completed = await req(
        port,
        "POST",
        `/api/lifeops/browser/sessions/${encodeURIComponent(sessionId)}/complete`,
        {
          result: {
            finalUrl: "https://example.com/settings/saved",
          },
        },
      );
      expect(completed.status).toBe(200);
      expect(completed.data.session.status).toBe("done");

      await assertBrowserSessionListed(port, sessionId, "done");
    });
  });
});
