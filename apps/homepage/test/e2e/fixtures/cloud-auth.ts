/**
 * Reusable Playwright fixtures for testing the homepage's cloud auth +
 * pairing-token flow.
 *
 * The fixtures route every cloud API endpoint that the homepage hits in its
 * "open in cloud" flow. Each test gets a `state` handle for queueing
 * responses (job statuses, pairing replies) and tracking call counts.
 */

import type { BrowserContext, Page, Route } from "@playwright/test";

// Mirrors getCloudTokenStorageKey() for the production cloud host.
// Local dev defaults to https://www.elizacloud.ai which normalizes to
// elizacloud.ai (the bare apex form) for the storage suffix.
const CLOUD_TOKEN_STORAGE_KEY = "milady-cloud-token:elizacloud.ai";

// CLOUD_BASE in the homepage runtime resolves to https://www.elizacloud.ai
// when running against localhost / 127.0.0.1.
const CLOUD_BASE_PATTERNS = [
  "https://www.elizacloud.ai",
  "https://elizacloud.ai",
];

export interface CloudAgentFixture {
  id: string;
  name: string;
  agentName?: string;
  status: string;
  webUiUrl?: string;
  model?: string;
  createdAt?: string;
}

export type JobStatus = "pending" | "in_progress" | "completed" | "failed";
type JsonBody =
  | string
  | number
  | boolean
  | null
  | JsonBody[]
  | { [key: string]: JsonBody };

export interface JobStatusEntry {
  status: JobStatus;
  result?: { [key: string]: JsonBody };
  error?: string;
}

export type PairingResponseEntry =
  | {
      kind: "ready";
      redirectUrl: string;
      token?: string;
      expiresIn?: number;
    }
  | {
      kind: "pending";
      retryAfterMs: number;
    }
  | {
      kind: "error";
      status: number;
      message?: string;
    };

export type CliSessionStatus = "pending" | "authenticated" | "expired";

export interface CliSessionEntry {
  status: CliSessionStatus;
  apiKey?: string;
}

export interface CallCounts {
  listAgents: number;
  createAgent: number;
  provisionAgent: number;
  deleteAgent: number;
  pairingToken: number;
  jobStatus: number;
  cliSessionCreate: number;
  cliSessionPoll: number;
}

export interface MockCloudApiState {
  pushJobStatuses(...entries: JobStatusEntry[]): void;
  setDeleteResponse(opts: { status: number; body?: string }): void;
  expireAuth(): void;
  pushPairingResponses(...entries: PairingResponseEntry[]): void;
  pushCliSessionPolls(...entries: CliSessionEntry[]): void;
  setAgents(agents: CloudAgentFixture[]): void;
  callCounts(): CallCounts;
}

export interface MockCloudApiOptions {
  /** Initial cloud agents returned by GET /api/v1/milady/agents. Default: []. */
  agents?: CloudAgentFixture[];
  /**
   * Pre-queued pairing-token responses. Drained in order; once empty the
   * default ready response is served (with redirectUrl from `defaultRedirectUrl`).
   */
  pairingResponses?: PairingResponseEntry[];
  /** Pre-queued job statuses. Defaults to a single "completed" entry. */
  jobStatuses?: JobStatusEntry[];
  /** Default redirect URL used when no pairing responses are queued. */
  defaultRedirectUrl?: string;
  /** Pre-queued cli-session poll results. */
  cliSessionPolls?: CliSessionEntry[];
  /** Default API key returned on cli-session authentication. */
  defaultApiKey?: string;
}

const DEFAULT_REDIRECT_URL =
  "https://test-agent.example.test/pair?token=tok-default";
const DEFAULT_API_KEY = "test-cloud-api-key";

interface DeleteOverride {
  status: number;
  body?: string;
}

function isCloudUrl(url: string): boolean {
  return CLOUD_BASE_PATTERNS.some((base) => url.startsWith(base));
}

function jsonResponse(
  route: Route,
  status: number,
  payload: JsonBody,
  extraHeaders: Record<string, string> = {},
): Promise<void> {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: extraHeaders,
    body: JSON.stringify(payload),
  });
}

/**
 * Pre-populate the cloud auth token in localStorage so the page boots already
 * authenticated. Must be called before navigation.
 */
export async function seedCloudAuth(
  page: Page,
  opts: { token: string },
): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value);
    },
    { key: CLOUD_TOKEN_STORAGE_KEY, value: opts.token },
  );
}

/**
 * Helper for tests that just want to be authenticated; equivalent to
 * `seedCloudAuth(page, { token: "test-cloud-api-key" })`.
 */
export async function loginViaPolling(page: Page): Promise<void> {
  await seedCloudAuth(page, { token: DEFAULT_API_KEY });
}

/**
 * Mock all cloud API endpoints needed for the open-in-cloud flow.
 * Returns a state handle for queueing responses and inspecting call counts.
 */
export async function mockCloudApi(
  context: BrowserContext,
  options: MockCloudApiOptions = {},
): Promise<MockCloudApiState> {
  let agents: CloudAgentFixture[] = options.agents ?? [];
  const jobQueue: JobStatusEntry[] = [
    ...(options.jobStatuses ?? [{ status: "completed" }]),
  ];
  const pairingQueue: PairingResponseEntry[] = [
    ...(options.pairingResponses ?? []),
  ];
  const cliSessionQueue: CliSessionEntry[] = [
    ...(options.cliSessionPolls ?? []),
  ];
  const defaultRedirectUrl = options.defaultRedirectUrl ?? DEFAULT_REDIRECT_URL;
  const defaultApiKey = options.defaultApiKey ?? DEFAULT_API_KEY;
  let authActive = true;
  let deleteOverride: DeleteOverride | null = null;

  const counts: CallCounts = {
    listAgents: 0,
    createAgent: 0,
    provisionAgent: 0,
    deleteAgent: 0,
    pairingToken: 0,
    jobStatus: 0,
    cliSessionCreate: 0,
    cliSessionPoll: 0,
  };

  // Match any host on cloud base, all paths under /api/.
  await context.route(/\/api\/.*/, async (route) => {
    const request = route.request();
    const rawUrl = request.url();
    if (!isCloudUrl(rawUrl)) {
      await route.fallback();
      return;
    }
    const url = new URL(rawUrl);
    const { pathname } = url;
    const method = request.method();

    // List cloud agents.
    if (pathname === "/api/v1/milady/agents" && method === "GET") {
      counts.listAgents += 1;
      if (!authActive) {
        await jsonResponse(route, 401, {
          success: false,
          error: "Invalid or expired API key",
        });
        return;
      }
      await jsonResponse(route, 200, { agents } as unknown as JsonBody);
      return;
    }

    // Create cloud agent.
    if (pathname === "/api/v1/milady/agents" && method === "POST") {
      counts.createAgent += 1;
      const id = `created-${counts.createAgent}`;
      // Add to agents list so any subsequent listAgents reflects it.
      let postedName = `cloud-agent-${counts.createAgent}`;
      const body = request.postData();
      if (body) {
        try {
          const parsed = JSON.parse(body) as { agentName?: string };
          if (parsed.agentName) postedName = parsed.agentName;
        } catch {
          // Malformed fixture payloads use the generated default name.
        }
      }
      agents = [
        ...agents,
        {
          id,
          name: postedName,
          agentName: postedName,
          status: "provisioning",
        },
      ];
      await jsonResponse(route, 200, { success: true, data: { id } });
      return;
    }

    // Delete cloud agent.
    const deleteMatch = pathname.match(/^\/api\/v1\/milady\/agents\/([^/]+)$/);
    if (deleteMatch && method === "DELETE") {
      counts.deleteAgent += 1;
      const status = deleteOverride?.status ?? 200;
      const body = deleteOverride?.body ?? JSON.stringify({ success: true });
      await route.fulfill({
        status,
        contentType: "application/json",
        body,
      });
      return;
    }

    // Provision cloud agent.
    const provisionMatch = pathname.match(
      /^\/api\/v1\/milady\/agents\/([^/]+)\/provision$/,
    );
    if (provisionMatch && method === "POST") {
      counts.provisionAgent += 1;
      await jsonResponse(route, 200, {
        jobId: `job-${counts.provisionAgent}`,
      });
      return;
    }

    // Pairing token.
    const pairingMatch = pathname.match(
      /^\/api\/v1\/milady\/agents\/([^/]+)\/pairing-token$/,
    );
    if (pairingMatch && method === "POST") {
      counts.pairingToken += 1;
      const next = pairingQueue.shift() ?? {
        kind: "ready" as const,
        redirectUrl: defaultRedirectUrl,
      };
      if (next.kind === "ready") {
        await jsonResponse(route, 200, {
          success: true,
          data: {
            token: next.token ?? "tok-default",
            redirectUrl: next.redirectUrl,
            expiresIn: next.expiresIn ?? 60,
          },
        });
        return;
      }
      if (next.kind === "pending") {
        const retrySec = Math.max(0, Math.round(next.retryAfterMs / 1000));
        await jsonResponse(
          route,
          202,
          {
            success: true,
            data: {
              agentId: pairingMatch[1],
              status: "starting",
              retryAfterMs: next.retryAfterMs,
            },
          },
          { "Retry-After": String(retrySec) },
        );
        return;
      }
      await jsonResponse(route, next.status, {
        success: false,
        error: next.message ?? "Pairing token error",
      });
      return;
    }

    // Job status.
    const jobMatch = pathname.match(/^\/api\/v1\/jobs\/([^/]+)$/);
    if (jobMatch && method === "GET") {
      counts.jobStatus += 1;
      const next =
        jobQueue.length > 0
          ? jobQueue.shift()
          : { status: "completed" as JobStatus };
      const jobId = jobMatch[1];
      const payload = {
        id: jobId,
        status: next?.status ?? "completed",
        ...(next?.result ? { result: next.result } : {}),
        ...(next?.error ? { error: next.error } : {}),
      };
      await jsonResponse(route, 200, payload);
      return;
    }

    // CLI session create.
    if (pathname === "/api/auth/cli-session" && method === "POST") {
      counts.cliSessionCreate += 1;
      const sessionId = `session-${counts.cliSessionCreate}`;
      await jsonResponse(route, 200, {
        sessionId,
        browserUrl: `https://www.elizacloud.ai/auth/cli-login?session=${sessionId}`,
      });
      return;
    }

    // CLI session poll.
    const cliPollMatch = pathname.match(/^\/api\/auth\/cli-session\/([^/]+)$/);
    if (cliPollMatch && method === "GET") {
      counts.cliSessionPoll += 1;
      const next = cliSessionQueue.shift() ?? {
        status: "authenticated" as const,
        apiKey: defaultApiKey,
      };
      if (next.status === "expired") {
        await jsonResponse(route, 404, {
          success: false,
          error: "Session expired",
        });
        return;
      }
      if (next.status === "authenticated") {
        await jsonResponse(route, 200, {
          status: "authenticated",
          apiKey: next.apiKey ?? defaultApiKey,
        });
        return;
      }
      await jsonResponse(route, 200, { status: "pending" });
      return;
    }

    // Sessions current, called by some homepage code paths.
    if (pathname === "/api/sessions/current" && method === "GET") {
      await jsonResponse(route, 200, { credits: 0, requests: 0, tokens: 0 });
      return;
    }

    // Credits balance / summary, called by AgentProvider on login.
    if (pathname === "/api/credits/balance" && method === "GET") {
      await jsonResponse(route, 200, { balance: 0, currency: "usd" });
      return;
    }
    if (pathname === "/api/v1/credits/summary" && method === "GET") {
      await jsonResponse(route, 200, { credits: 0 });
      return;
    }

    // Anything else under /api/ returns empty success.
    await jsonResponse(route, 200, { success: true });
  });

  // Block sandbox discovery; it is a separate origin and can hang the test.
  await context.route(/sandboxes\.waifu\.fun/, async (route) => {
    await jsonResponse(route, 200, []);
  });

  return {
    pushJobStatuses(...entries: JobStatusEntry[]) {
      jobQueue.push(...entries);
    },
    setDeleteResponse(opts: { status: number; body?: string }) {
      deleteOverride = { status: opts.status, body: opts.body };
    },
    expireAuth() {
      authActive = false;
    },
    pushPairingResponses(...entries: PairingResponseEntry[]) {
      pairingQueue.push(...entries);
    },
    pushCliSessionPolls(...entries: CliSessionEntry[]) {
      cliSessionQueue.push(...entries);
    },
    setAgents(next: CloudAgentFixture[]) {
      agents = next;
    },
    callCounts() {
      return { ...counts };
    },
  };
}

export interface RemoteAgentMockOptions {
  /** Status payload returned by /api/status. Default: running, agentName "remote-agent". */
  status?: {
    state?: string;
    agentName?: string;
    model?: string;
    uptime?: number;
    memories?: number;
  };
  /** /api/stream/settings response. Default: ok=true, settings={}. */
  streamSettings?: {
    ok?: boolean;
    settings?: { [key: string]: JsonBody };
  };
}

export interface RemoteAgentMockState {
  /** Authorization header values seen across all routed requests. */
  seenAuthHeaders(): string[];
  /** Total request count to the mocked URL across all paths. */
  totalRequests(): number;
}

/**
 * Stub /api/health, /api/status, and /api/stream/settings on an arbitrary
 * remote agent base URL so AgentProvider's health probes succeed without
 * touching the network.
 */
export async function mockRemoteAgent(
  context: BrowserContext,
  baseUrl: string,
  opts: RemoteAgentMockOptions = {},
): Promise<RemoteAgentMockState> {
  const normalized = baseUrl.replace(/\/+$/, "");
  const seenAuth: string[] = [];
  let total = 0;
  const status = {
    state: opts.status?.state ?? "running",
    agentName: opts.status?.agentName ?? "remote-agent",
    model: opts.status?.model ?? "remote-model",
    uptime: opts.status?.uptime ?? 100,
    memories: opts.status?.memories,
  };
  const streamSettings = {
    ok: opts.streamSettings?.ok ?? true,
    settings: opts.streamSettings?.settings ?? {},
  };

  const matcher = new RegExp(
    `^${normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/api/`,
  );

  await context.route(matcher, async (route) => {
    const request = route.request();
    total += 1;
    const auth = request.headers().authorization ?? "";
    seenAuth.push(auth);
    const url = new URL(request.url());
    if (url.pathname === "/api/health") {
      await jsonResponse(route, 200, {
        status: "ok",
        ready: true,
        uptime: status.uptime,
      });
      return;
    }
    if (url.pathname === "/api/status") {
      const statusBody: { [key: string]: JsonBody } = {
        state: status.state,
        agentName: status.agentName,
        model: status.model,
        uptime: status.uptime,
      };
      if (status.memories !== undefined) {
        statusBody.memories = status.memories;
      }
      await jsonResponse(route, 200, statusBody);
      return;
    }
    if (url.pathname === "/api/stream/settings") {
      await jsonResponse(route, 200, streamSettings);
      return;
    }
    await jsonResponse(route, 200, { ok: true });
  });

  return {
    seenAuthHeaders() {
      return [...seenAuth];
    },
    totalRequests() {
      return total;
    },
  };
}
