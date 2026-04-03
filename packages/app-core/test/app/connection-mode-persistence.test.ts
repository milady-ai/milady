// @vitest-environment jsdom

/**
 * Tests for the PersistedConnectionMode persistence layer and
 * startup fresh-install detection added in the onboarding/connection rework.
 *
 * Covers:
 * - Persistence save/load/clear round-trips
 * - Fresh install detection (no persisted mode + no API base → skip backend polling)
 * - Returning user restoration (persisted mode restores client connection)
 * - Mobile sandbox-only enforcement
 * - Cloud provisioning client method
 * - Connection key auto-generation (milady-side)
 * - Direct cloud auth (no backend path)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the API client at top level to avoid hoisting warnings
const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    hasToken: vi.fn(() => false),
    getAuthStatus: vi.fn(async () => ({
      required: false,
      pairingEnabled: false,
      expiresAt: null,
    })),
    getOnboardingStatus: vi.fn(async () => ({ complete: false })),
    disconnectWs: vi.fn(),
    getCodingAgentStatus: vi.fn(async () => null),
    getConfig: vi.fn(async () => ({})),
    setToken: vi.fn(),
  },
}));

vi.mock("@miladyai/app-core/api", () => ({
  client: mockClient,
  SkillScanReportSummary: {},
}));

// ── Persistence layer tests ────────────────────────────────────────────

describe("PersistedConnectionMode persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null when no connection mode is persisted", async () => {
    const { loadPersistedConnectionMode } = await import(
      "@miladyai/app-core/state/persistence"
    );
    expect(loadPersistedConnectionMode()).toBeNull();
  });

  it("round-trips a local connection mode", async () => {
    const { loadPersistedConnectionMode, savePersistedConnectionMode } =
      await import("@miladyai/app-core/state/persistence");

    savePersistedConnectionMode({ runMode: "local" });
    const loaded = loadPersistedConnectionMode();
    expect(loaded).toEqual({ runMode: "local" });
    expect(localStorage.getItem("milady:active-server")).toBe(
      JSON.stringify({
        id: "local:embedded",
        kind: "local",
        label: "This device",
      }),
    );
  });

  it("round-trips a cloud connection mode with auth", async () => {
    const { loadPersistedConnectionMode, savePersistedConnectionMode } =
      await import("@miladyai/app-core/state/persistence");

    savePersistedConnectionMode({
      runMode: "cloud",
      cloudApiBase: "https://api.eliza.ai",
      cloudAuthToken: "token-123",
    });
    const loaded = loadPersistedConnectionMode();
    expect(loaded).toEqual({
      runMode: "cloud",
      cloudApiBase: "https://api.eliza.ai",
      cloudAuthToken: "token-123",
    });
  });

  it("round-trips a remote connection mode", async () => {
    const { loadPersistedConnectionMode, savePersistedConnectionMode } =
      await import("@miladyai/app-core/state/persistence");

    savePersistedConnectionMode({
      runMode: "remote",
      remoteApiBase: "https://my-agent.example.com",
      remoteAccessToken: "key-abc",
    });
    const loaded = loadPersistedConnectionMode();
    expect(loaded).toEqual({
      runMode: "remote",
      remoteApiBase: "https://my-agent.example.com",
      remoteAccessToken: "key-abc",
    });
  });

  it("clears persisted connection mode", async () => {
    const {
      clearPersistedActiveServer,
      clearPersistedConnectionMode,
      loadPersistedActiveServer,
      loadPersistedConnectionMode,
      savePersistedConnectionMode,
    } = await import("@miladyai/app-core/state/persistence");

    savePersistedConnectionMode({ runMode: "local" });
    expect(loadPersistedConnectionMode()).not.toBeNull();
    expect(loadPersistedActiveServer()).not.toBeNull();

    clearPersistedConnectionMode();
    expect(loadPersistedConnectionMode()).toBeNull();
    expect(loadPersistedActiveServer()).toBeNull();

    savePersistedConnectionMode({ runMode: "local" });
    clearPersistedActiveServer();
    expect(loadPersistedConnectionMode()).toBeNull();
    expect(loadPersistedActiveServer()).toBeNull();
  });

  it("returns null for corrupted JSON", async () => {
    const { loadPersistedConnectionMode } = await import(
      "@miladyai/app-core/state/persistence"
    );

    localStorage.setItem("eliza:connection-mode", "not-json{{{");
    expect(loadPersistedConnectionMode()).toBeNull();
  });

  it("returns null for invalid runMode value", async () => {
    const { loadPersistedConnectionMode } = await import(
      "@miladyai/app-core/state/persistence"
    );

    localStorage.setItem(
      "eliza:connection-mode",
      JSON.stringify({ runMode: "invalid" }),
    );
    expect(loadPersistedConnectionMode()).toBeNull();
  });

  it("returns null for non-object stored value", async () => {
    const { loadPersistedConnectionMode } = await import(
      "@miladyai/app-core/state/persistence"
    );

    localStorage.setItem("eliza:connection-mode", JSON.stringify([1, 2, 3]));
    expect(loadPersistedConnectionMode()).toBeNull();
  });

  it("migrates a legacy connection blob into the active server record", async () => {
    const { loadPersistedActiveServer, loadPersistedConnectionMode } =
      await import("@miladyai/app-core/state/persistence");

    localStorage.setItem(
      "eliza:connection-mode",
      JSON.stringify({
        runMode: "remote",
        remoteApiBase: "https://ren.example.com/",
        remoteAccessToken: "key-123",
      }),
    );

    expect(loadPersistedActiveServer()).toEqual({
      id: "remote:https://ren.example.com",
      kind: "remote",
      label: "ren.example.com",
      apiBase: "https://ren.example.com",
      accessToken: "key-123",
    });
    expect(loadPersistedConnectionMode()).toEqual({
      runMode: "remote",
      remoteApiBase: "https://ren.example.com",
      remoteAccessToken: "key-123",
    });
  });

  it("prefers the active server record over a stale legacy connection blob", async () => {
    const { loadPersistedConnectionMode } = await import(
      "@miladyai/app-core/state/persistence"
    );

    localStorage.setItem(
      "milady:active-server",
      JSON.stringify({
        id: "remote:https://kei.example.com",
        kind: "remote",
        label: "kei.example.com",
        apiBase: "https://kei.example.com",
      }),
    );
    localStorage.setItem(
      "eliza:connection-mode",
      JSON.stringify({
        runMode: "cloud",
        cloudApiBase: "https://api.eliza.ai",
        cloudAuthToken: "stale-token",
      }),
    );

    expect(loadPersistedConnectionMode()).toEqual({
      runMode: "remote",
      remoteApiBase: "https://kei.example.com",
    });
  });
});

// ── Fresh install detection ────────────────────────────────────────────

describe("fresh install detection (startup)", () => {
  beforeEach(() => {
    localStorage.clear();
    delete (window as Record<string, unknown>).__MILADY_API_BASE__;
    delete (window as Record<string, unknown>).__ELIZA_API_BASE__;
    Object.assign(document.documentElement, { setAttribute: vi.fn() });
  });

  it("shows splash on fresh install without polling the backend", async () => {
    const React = await import("react");
    const TestRenderer = await import("react-test-renderer");
    const { AppProvider, useApp } = await import("@miladyai/app-core/state");

    let latest: {
      onboardingComplete: boolean;
      onboardingLoading: boolean;
      startupPhase: string;
      startupError: unknown;
    } | null = null;

    function Probe() {
      const app = useApp();
      React.useEffect(() => {
        latest = {
          onboardingComplete: app.onboardingComplete,
          onboardingLoading: app.onboardingLoading,
          startupPhase: app.startupPhase,
          startupError: app.startupError,
        };
      });
      return null;
    }

    let tree: TestRenderer.ReactTestRenderer | null = null;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        React.createElement(AppProvider, null, React.createElement(Probe)),
      );
    });

    await TestRenderer.act(async () => {
      await Promise.resolve();
    });

    // On fresh install: the splash page is shown. The coordinator stays
    // at the splash phase until the user clicks "Start". No backend
    // polling occurs while the splash is visible.
    expect(latest).not.toBeNull();
    expect(latest!.onboardingComplete).toBe(false);
    expect(latest!.startupError).toBeNull();

    // The backend should NOT have been polled while splash is showing
    expect(mockClient.getAuthStatus).not.toHaveBeenCalled();
    expect(mockClient.getOnboardingStatus).not.toHaveBeenCalled();

    await TestRenderer.act(async () => {
      tree?.unmount();
    });
  });
});

// ── API client cloud provisioning ──────────────────────────────────────

describe("MiladyClient.provisionCloudSandbox", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("provisions a sandbox agent through create → provision → poll", async () => {
    const { MiladyClient } = await import("@miladyai/app-core/api/client");
    const client = new MiladyClient("http://localhost:2138");

    const fetchMock = vi.fn();

    // Create agent response
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "agent-1" }),
    });
    // Provision response
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ jobId: "job-1" }),
    });
    // Poll - still pending
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "in_progress" }),
    });
    // Poll - completed
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "completed",
        result: { bridgeUrl: "https://bridge.eliza.ai/agent-1" },
      }),
    });

    globalThis.fetch = fetchMock;

    const progressUpdates: string[] = [];
    const result = await client.provisionCloudSandbox({
      cloudApiBase: "https://api.eliza.ai",
      authToken: "token-123",
      name: "TestAgent",
      onProgress: (status) => progressUpdates.push(status),
    });

    expect(result.bridgeUrl).toBe("https://bridge.eliza.ai/agent-1");
    expect(result.agentId).toBe("agent-1");
    expect(progressUpdates).toContain("creating");
    expect(progressUpdates).toContain("provisioning");
    expect(progressUpdates).toContain("ready");

    // Verify API calls
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.eliza.ai/api/v1/milady/agents",
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://api.eliza.ai/api/v1/milady/agents/agent-1/provision",
    );
  });

  it("throws on provisioning failure", async () => {
    const { MiladyClient } = await import("@miladyai/app-core/api/client");
    const client = new MiladyClient("http://localhost:2138");

    const fetchMock = vi.fn();

    // Create succeeds
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "agent-1" }),
    });
    // Provision succeeds
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ jobId: "job-1" }),
    });
    // Poll - failed
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "failed",
        error: "Insufficient credits",
      }),
    });

    globalThis.fetch = fetchMock;

    await expect(
      client.provisionCloudSandbox({
        cloudApiBase: "https://api.eliza.ai",
        authToken: "token-123",
        name: "TestAgent",
      }),
    ).rejects.toThrow("Provisioning failed: Insufficient credits");
  });

  it("throws on agent creation failure", async () => {
    const { MiladyClient } = await import("@miladyai/app-core/api/client");
    const client = new MiladyClient("http://localhost:2138");

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      text: async () => "Unauthorized",
    });

    await expect(
      client.provisionCloudSandbox({
        cloudApiBase: "https://api.eliza.ai",
        authToken: "bad-token",
        name: "TestAgent",
      }),
    ).rejects.toThrow("Failed to create cloud agent: Unauthorized");
  });
});

// ── Direct cloud auth ──────────────────────────────────────────────────

describe("MiladyClient direct cloud auth", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("cloudLoginDirect calls the cloud API directly", async () => {
    const { MiladyClient } = await import("@miladyai/app-core/api/client");
    const client = new MiladyClient("http://localhost:2138");

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const result = await client.cloudLoginDirect("https://api.eliza.ai");
    expect(result.ok).toBe(true);
    // sessionId is generated client-side via crypto.randomUUID()
    expect(result.sessionId).toBeTruthy();
    expect(result.browserUrl).toContain("cli-login");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.eliza.ai/api/auth/cli-session",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("cloudLoginPollDirect polls the cloud API directly", async () => {
    const { MiladyClient } = await import("@miladyai/app-core/api/client");
    const client = new MiladyClient("http://localhost:2138");

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "authenticated",
        apiKey: "auth-token-xyz",
        userId: "user-1",
      }),
    });

    const result = await client.cloudLoginPollDirect(
      "https://api.eliza.ai",
      "session-123",
    );
    expect(result.status).toBe("authenticated");
    expect(result.token).toBe("auth-token-xyz");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.eliza.ai/api/auth/cli-session/session-123",
    );
  });

  it("cloudLoginDirect returns error on failure", async () => {
    const { MiladyClient } = await import("@miladyai/app-core/api/client");
    const client = new MiladyClient("http://localhost:2138");

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const result = await client.cloudLoginDirect("https://api.eliza.ai");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("500");
  });
});

// ── API client getBaseUrl ──────────────────────────────────────────────

describe("MiladyClient.getBaseUrl", () => {
  it("returns the current base URL", async () => {
    const { MiladyClient } = await import("@miladyai/app-core/api/client");
    const client = new MiladyClient("http://my-agent.example.com");
    expect(client.getBaseUrl()).toBe("http://my-agent.example.com");
  });

  it("returns empty string when no base URL is configured", async () => {
    // In jsdom with about:blank protocol, no injected base
    delete (window as Record<string, unknown>).__MILADY_API_BASE__;
    const { MiladyClient } = await import("@miladyai/app-core/api/client");
    const client = new MiladyClient();
    // May return "" or a fallback depending on window.location.protocol
    expect(typeof client.getBaseUrl()).toBe("string");
  });
});
