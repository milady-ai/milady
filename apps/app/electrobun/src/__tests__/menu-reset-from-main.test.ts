import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildMainMenuResetApiCandidates,
  pickReachableMenuResetApiBase,
  pollMenuResetAgentStatusJson,
  runMainMenuResetAfterApiBaseResolved,
} from "../menu-reset-from-main";

function mockResponse(ok: boolean, json?: unknown, status = 200): Response {
  return {
    ok,
    status,
    json: async () => json as object,
  } as Response;
}

describe("buildMainMenuResetApiCandidates", () => {
  it("prefers embedded loopback then appends configured base when distinct", () => {
    expect(
      buildMainMenuResetApiCandidates({
        embeddedPort: 9_001,
        configuredBase: "http://127.0.0.1:31337",
      }),
    ).toEqual(["http://127.0.0.1:9001", "http://127.0.0.1:31337"]);
  });

  it("dedupes when configured base matches embedded URL", () => {
    expect(
      buildMainMenuResetApiCandidates({
        embeddedPort: 3_1337,
        configuredBase: "http://127.0.0.1:31337",
      }),
    ).toEqual(["http://127.0.0.1:31337"]);
  });

  it("returns only configured base when no embedded port", () => {
    expect(
      buildMainMenuResetApiCandidates({
        embeddedPort: null,
        configuredBase: "http://127.0.0.1:4000",
      }),
    ).toEqual(["http://127.0.0.1:4000"]);
  });
});

describe("pickReachableMenuResetApiBase", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null for empty candidates", async () => {
    await expect(
      pickReachableMenuResetApiBase({
        candidates: [],
        fetchImpl: vi.fn(),
        buildHeaders: () => ({}),
      }),
    ).resolves.toBeNull();
  });

  it("skips non-ok responses and returns the first ok base", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(false, {}, 500))
      .mockResolvedValueOnce(
        mockResponse(true, { state: "running", agentName: "Milady" }),
      );

    const base = await pickReachableMenuResetApiBase({
      candidates: ["http://127.0.0.1:1", "http://127.0.0.1:2"],
      fetchImpl,
      buildHeaders: () => ({ Accept: "application/json" }),
      probeTimeoutMs: 5_000,
    });

    expect(base).toBe("http://127.0.0.1:2");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("http://127.0.0.1:1/api/status");
  });

  it("returns null when every candidate fails or errors", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("econnrefused"));
    await expect(
      pickReachableMenuResetApiBase({
        candidates: ["http://127.0.0.1:9"],
        fetchImpl,
        buildHeaders: () => ({}),
      }),
    ).resolves.toBeNull();
  });
});

describe("pollMenuResetAgentStatusJson", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns immediately when first poll is running", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        mockResponse(true, { state: "running", agentName: "Milady" }),
      );
    const sleep = vi.fn();

    const data = await pollMenuResetAgentStatusJson({
      apiBase: "http://127.0.0.1:1",
      fetchImpl,
      buildHeaders: () => ({}),
      sleep,
      now: () => 0,
      maxMs: 60_000,
      pollMs: 1_000,
    });

    expect(data.state).toBe("running");
    expect(sleep).not.toHaveBeenCalled();
  });

  it("polls until running then returns", async () => {
    let calls = 0;
    let time = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls < 3) {
        return mockResponse(true, { state: "starting", agentName: "Milady" });
      }
      return mockResponse(true, { state: "running", agentName: "Milady" });
    });
    const sleep = vi.fn(async () => {
      time += 50;
    });

    const data = await pollMenuResetAgentStatusJson({
      apiBase: "http://127.0.0.1:1",
      fetchImpl,
      buildHeaders: () => ({}),
      sleep,
      now: () => time,
      maxMs: 60_000,
      pollMs: 50,
    });

    expect(data.state).toBe("running");
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});

describe("runMainMenuResetAfterApiBaseResolved", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POSTs reset, uses embedded restart path, polls, and notifies renderer", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(true)) // POST /api/agent/reset
      .mockResolvedValue(
        mockResponse(true, { state: "running", agentName: "Milady" }),
      );
    const restartEmbeddedClearingLocalDb = vi.fn(async () => ({
      port: 42_000,
    }));
    const pushEmbeddedApiBaseToRenderer = vi.fn();
    const sendMenuResetAppliedToRenderer = vi.fn();

    await runMainMenuResetAfterApiBaseResolved({
      apiBase: "http://127.0.0.1:1",
      fetchImpl,
      buildHeaders: () => ({}),
      useEmbeddedRestart: true,
      restartEmbeddedClearingLocalDb,
      pushEmbeddedApiBaseToRenderer,
      getLocalApiAuthToken: () => "tok",
      postExternalAgentRestart: vi.fn(),
      resolveApiBaseForStatusPoll: () => "http://127.0.0.1:1",
      sendMenuResetAppliedToRenderer,
    });

    expect(fetchImpl.mock.calls[0]?.[0]).toContain("/api/agent/reset");
    expect(restartEmbeddedClearingLocalDb).toHaveBeenCalledOnce();
    expect(pushEmbeddedApiBaseToRenderer).toHaveBeenCalledWith(42_000, "tok");
    expect(sendMenuResetAppliedToRenderer).toHaveBeenCalledWith({
      itemId: "menu-reset-milady-applied",
      agentStatus: expect.objectContaining({
        state: "running",
        agentName: "Milady",
      }),
    });
  });

  it("uses external restart path and pushes token to renderer", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(true))
      .mockResolvedValue(
        mockResponse(true, { state: "running", agentName: "Milady" }),
      );
    const postExternalAgentRestart = vi.fn(async () => {});
    const pushEmbeddedApiBaseToRenderer = vi.fn();
    const restartEmbeddedClearingLocalDb = vi.fn();

    await runMainMenuResetAfterApiBaseResolved({
      apiBase: "http://127.0.0.1:31337",
      fetchImpl,
      buildHeaders: () => ({}),
      useEmbeddedRestart: false,
      restartEmbeddedClearingLocalDb,
      pushEmbeddedApiBaseToRenderer,
      getLocalApiAuthToken: () => "ext-tok",
      postExternalAgentRestart,
      resolveApiBaseForStatusPoll: () => "http://127.0.0.1:31337",
      sendMenuResetAppliedToRenderer: vi.fn(),
    });

    expect(postExternalAgentRestart).toHaveBeenCalledOnce();
    expect(restartEmbeddedClearingLocalDb).not.toHaveBeenCalled();
    // Token is pushed to renderer even in external mode so the client
    // can reconnect with valid auth after the restart.
    expect(pushEmbeddedApiBaseToRenderer).toHaveBeenCalledWith(
      undefined,
      "ext-tok",
    );
  });

  it("throws when reset POST is not ok", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse(false, {}, 403));

    await expect(
      runMainMenuResetAfterApiBaseResolved({
        apiBase: "http://127.0.0.1:1",
        fetchImpl,
        buildHeaders: () => ({}),
        useEmbeddedRestart: false,
        restartEmbeddedClearingLocalDb: vi.fn(),
        pushEmbeddedApiBaseToRenderer: vi.fn(),
        getLocalApiAuthToken: () => "",
        postExternalAgentRestart: vi.fn(),
        resolveApiBaseForStatusPoll: () => "http://127.0.0.1:1",
        sendMenuResetAppliedToRenderer: vi.fn(),
      }),
    ).rejects.toThrow(/Reset API failed \(403\)/);
  });

  it("retries reset once when onboarding is still complete after restart", async () => {
    const fetchImpl = vi.fn(async (input: string) => {
      if (input.endsWith("/api/agent/reset")) return mockResponse(true);
      if (input.endsWith("/api/onboarding/status")) {
        if (
          fetchImpl.mock.calls.filter((call) =>
            String(call[0]).endsWith("/api/onboarding/status"),
          ).length === 1
        ) {
          return mockResponse(true, { complete: true });
        }
        return mockResponse(true, { complete: false });
      }
      if (input.endsWith("/api/status")) {
        return mockResponse(true, { state: "running", agentName: "Milady" });
      }
      return mockResponse(true, {});
    });

    const restartEmbeddedClearingLocalDb = vi
      .fn()
      .mockResolvedValue({ port: 42_000 });

    await runMainMenuResetAfterApiBaseResolved({
      apiBase: "http://127.0.0.1:1",
      fetchImpl,
      buildHeaders: () => ({}),
      useEmbeddedRestart: true,
      restartEmbeddedClearingLocalDb,
      pushEmbeddedApiBaseToRenderer: vi.fn(),
      getLocalApiAuthToken: () => "tok",
      postExternalAgentRestart: vi.fn(),
      resolveApiBaseForStatusPoll: () => "http://127.0.0.1:1",
      sendMenuResetAppliedToRenderer: vi.fn(),
    });

    expect(restartEmbeddedClearingLocalDb).toHaveBeenCalledTimes(2);
    expect(
      fetchImpl.mock.calls.filter((call) =>
        String(call[0]).endsWith("/api/agent/reset"),
      ).length,
    ).toBe(2);
  });

  it("throws when onboarding remains complete after retry", async () => {
    const fetchImpl = vi.fn(async (input: string) => {
      if (input.endsWith("/api/agent/reset")) return mockResponse(true);
      if (input.endsWith("/api/onboarding/status")) {
        return mockResponse(true, { complete: true });
      }
      if (input.endsWith("/api/status")) {
        return mockResponse(true, { state: "running", agentName: "Milady" });
      }
      return mockResponse(true, {});
    });

    await expect(
      runMainMenuResetAfterApiBaseResolved({
        apiBase: "http://127.0.0.1:1",
        fetchImpl,
        buildHeaders: () => ({}),
        useEmbeddedRestart: false,
        restartEmbeddedClearingLocalDb: vi.fn(),
        pushEmbeddedApiBaseToRenderer: vi.fn(),
        getLocalApiAuthToken: () => "",
        postExternalAgentRestart: vi.fn(),
        resolveApiBaseForStatusPoll: () => "http://127.0.0.1:1",
        sendMenuResetAppliedToRenderer: vi.fn(),
      }),
    ).rejects.toThrow(/onboarding still marked complete/);
  });
});
