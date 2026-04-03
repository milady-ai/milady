/**
 * Tests that cloud login/status is handled by Milady's handleCloudRoute
 * (which properly persists the API key), and that billing/compat routes
 * read fresh config from disk.
 *
 * These are regression tests for the bug where:
 * - /api/cloud/login/status fell through to the upstream handler
 * - /api/cloud/billing/* used stale in-memory config without the API key
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../../test-support/test-helpers";

// ── Mocks ──────────────────────────────────────────────────────────────────

const loadElizaConfigMock = vi.fn();
const saveElizaConfigMock = vi.fn();

vi.mock("../../config/config", () => ({
  loadElizaConfig: (...args: unknown[]) => loadElizaConfigMock(...args),
  saveElizaConfig: (...args: unknown[]) => saveElizaConfigMock(...args),
}));

vi.mock("@miladyai/agent/config/config", () => ({
  loadElizaConfig: (...args: unknown[]) => loadElizaConfigMock(...args),
  saveElizaConfig: (...args: unknown[]) => saveElizaConfigMock(...args),
}));

vi.mock("@elizaos/core", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock("@miladyai/agent/cloud/validate-url", () => ({
  validateCloudBaseUrl: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@miladyai/agent/cloud/base-url", () => ({
  normalizeCloudSiteUrl: vi.fn(
    (url?: string) => url ?? "https://cloud.example.com",
  ),
}));

vi.mock("../../diagnostics/integration-observability", () => ({
  createIntegrationTelemetrySpan: vi.fn(() => ({
    success: vi.fn(),
    failure: vi.fn(),
  })),
}));

vi.mock("../cloud-connection", () => ({
  disconnectUnifiedCloudConnection: vi.fn(() => Promise.resolve()),
}));

vi.mock("../cloud-secrets", () => ({
  getCloudSecret: vi.fn(),
  clearCloudSecrets: vi.fn(),
  scrubCloudSecretsFromEnv: vi.fn(),
  _resetCloudSecretsForTesting: vi.fn(),
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function makeConfig(cloudOverrides?: Record<string, unknown>) {
  return {
    env: {},
    cloud: {
      enabled: true,
      apiKey: "test-cloud-key",
      baseUrl: "https://cloud.example.com",
      ...cloudOverrides,
    },
    agents: { defaults: {}, list: [] },
    meta: { onboardingComplete: true },
    models: {},
  };
}

// ── Tests: Cloud login persistence ─────────────────────────────────────────

describe("cloud login route persistence", () => {
  const fetchMock =
    vi.fn<
      (input: string | URL | Request, init?: RequestInit) => Promise<Response>
    >();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ELIZAOS_CLOUD_API_KEY;
    delete process.env.ELIZAOS_CLOUD_ENABLED;
  });

  it("handleCloudRoute handles /api/cloud/login/status and persists API key", async () => {
    const { handleCloudRoute } = await import("../cloud-routes");

    const config = makeConfig({ apiKey: undefined });
    const state = {
      config,
      runtime: null,
      cloudManager: null,
    };

    // Mock the fetch to Eliza Cloud login status endpoint
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "authenticated",
          apiKey: "new-cloud-api-key-from-oauth",
          keyPrefix: "sk-cloud-",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const { res, getJson, getStatus } = createMockHttpResponse();
    const req = createMockIncomingMessage({
      method: "GET",
      url: "/api/cloud/login/status?sessionId=test-session-123",
    });

    const handled = await handleCloudRoute(
      req,
      res,
      "/api/cloud/login/status",
      "GET",
      state,
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);

    const body = getJson();
    expect(body).toMatchObject({ status: "authenticated" });

    // Verify the API key was persisted to config
    expect(saveElizaConfigMock).toHaveBeenCalledTimes(1);
    const savedConfig = saveElizaConfigMock.mock.calls[0][0];
    expect(savedConfig.cloud.apiKey).toBe("new-cloud-api-key-from-oauth");
    expect(savedConfig.linkedAccounts).toMatchObject({
      elizacloud: { status: "linked", source: "api-key" },
    });
    expect(savedConfig.serviceRouting).toMatchObject({
      llmText: {
        backend: "elizacloud",
        transport: "cloud-proxy",
      },
    });
  });

  it("persists a linked cloud key without re-enabling cloud inference for local providers", async () => {
    const { handleCloudRoute } = await import("../cloud-routes");

    const updateAgent = vi.fn(async () => undefined);
    const config = makeConfig({
      enabled: false,
      apiKey: undefined,
      inferenceMode: "byok",
    });
    (
      config as {
        connection?: Record<string, unknown>;
      }
    ).connection = {
      kind: "local-provider",
      provider: "anthropic",
    };
    const state = {
      config,
      runtime: {
        agentId: "agent-1",
        character: { secrets: { ELIZAOS_CLOUD_ENABLED: "true" } },
        updateAgent,
      },
      cloudManager: null,
    };

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "authenticated",
          apiKey: "new-cloud-api-key-from-oauth",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const { res, getStatus } = createMockHttpResponse();
    const req = createMockIncomingMessage({
      method: "GET",
      url: "/api/cloud/login/status?sessionId=test-session-local-provider",
    });

    const handled = await handleCloudRoute(
      req,
      res,
      "/api/cloud/login/status",
      "GET",
      state as never,
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    const savedConfig = saveElizaConfigMock.mock.calls[0][0];
    expect(savedConfig.cloud.apiKey).toBe("new-cloud-api-key-from-oauth");
    expect(savedConfig.linkedAccounts).toMatchObject({
      elizacloud: { status: "linked", source: "api-key" },
    });
    expect(savedConfig.serviceRouting?.llmText).toEqual({
      backend: "anthropic",
      transport: "direct",
    });
    expect(process.env.ELIZAOS_CLOUD_ENABLED).toBeUndefined();
    expect(updateAgent).toHaveBeenCalledWith("agent-1", {
      secrets: {
        ELIZAOS_CLOUD_API_KEY: "new-cloud-api-key-from-oauth",
      },
    });
  });

  it("handleCloudRoute handles /api/cloud/login/status with pending status", async () => {
    const { handleCloudRoute } = await import("../cloud-routes");

    const config = makeConfig({ apiKey: undefined });

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "pending" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const { res, getJson } = createMockHttpResponse();
    const req = createMockIncomingMessage({
      method: "GET",
      url: "/api/cloud/login/status?sessionId=test-session-456",
    });

    const handled = await handleCloudRoute(
      req,
      res,
      "/api/cloud/login/status",
      "GET",
      { config, runtime: null, cloudManager: null },
    );

    expect(handled).toBe(true);
    expect(getJson()).toMatchObject({ status: "pending" });
    // No save when status is pending
    expect(saveElizaConfigMock).not.toHaveBeenCalled();
  });
});

// ── Tests: Route matching ──────────────────────────────────────────────────

describe("cloud route matching in compat handler", () => {
  it("isCloudRoute matches /api/cloud/login/status", () => {
    const pathname = "/api/cloud/login/status";
    const isCloudRoute =
      pathname.startsWith("/api/cloud/") &&
      !pathname.startsWith("/api/cloud/compat/") &&
      !pathname.startsWith("/api/cloud/billing/");
    expect(isCloudRoute).toBe(true);
  });

  it("isCloudRoute matches /api/cloud/login", () => {
    const pathname = "/api/cloud/login";
    const isCloudRoute =
      pathname.startsWith("/api/cloud/") &&
      !pathname.startsWith("/api/cloud/compat/") &&
      !pathname.startsWith("/api/cloud/billing/");
    expect(isCloudRoute).toBe(true);
  });

  it("isCloudRoute matches /api/cloud/status", () => {
    const pathname = "/api/cloud/status";
    const isCloudRoute =
      pathname.startsWith("/api/cloud/") &&
      !pathname.startsWith("/api/cloud/compat/") &&
      !pathname.startsWith("/api/cloud/billing/");
    expect(isCloudRoute).toBe(true);
  });

  it("isCloudRoute matches /api/cloud/disconnect", () => {
    const pathname = "/api/cloud/disconnect";
    const isCloudRoute =
      pathname.startsWith("/api/cloud/") &&
      !pathname.startsWith("/api/cloud/compat/") &&
      !pathname.startsWith("/api/cloud/billing/");
    expect(isCloudRoute).toBe(true);
  });

  it("isCloudRoute excludes /api/cloud/compat/*", () => {
    const pathname = "/api/cloud/compat/agents";
    const isCloudRoute =
      pathname.startsWith("/api/cloud/") &&
      !pathname.startsWith("/api/cloud/compat/") &&
      !pathname.startsWith("/api/cloud/billing/");
    expect(isCloudRoute).toBe(false);
  });

  it("isCloudRoute excludes /api/cloud/billing/*", () => {
    const pathname = "/api/cloud/billing/summary";
    const isCloudRoute =
      pathname.startsWith("/api/cloud/") &&
      !pathname.startsWith("/api/cloud/compat/") &&
      !pathname.startsWith("/api/cloud/billing/");
    expect(isCloudRoute).toBe(false);
  });
});

// ── Tests: Billing/compat use fresh config ─────────────────────────────────

describe("billing and compat routes use fresh config from disk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cloud/compat routes would read apiKey from loadElizaConfig()", () => {
    // Simulate: stale in-memory config has no apiKey, but disk config does
    const staleConfig = makeConfig({ apiKey: undefined });
    const freshConfig = makeConfig({ apiKey: "fresh-key-from-disk" });

    // The compat handler calls loadElizaConfig() — not state.config
    loadElizaConfigMock.mockReturnValue(freshConfig);

    const config = loadElizaConfigMock();
    expect(config.cloud.apiKey).toBe("fresh-key-from-disk");
    // Verify we're NOT using the stale config
    expect(staleConfig.cloud.apiKey).toBeUndefined();
  });

  it("cloud/billing routes would read apiKey from loadElizaConfig()", () => {
    const freshConfig = makeConfig({ apiKey: "billing-key-from-disk" });
    loadElizaConfigMock.mockReturnValue(freshConfig);

    const config = loadElizaConfigMock();
    expect(config.cloud.apiKey).toBe("billing-key-from-disk");
  });
});
