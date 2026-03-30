/**
 * Tests for the coordinator polling loop in wireCoordinatorBridgesWhenReady.
 *
 * The function:
 * 1. Tries immediate wiring
 * 2. If any bridge fails, polls runtime.getService("SWARM_COORDINATOR")
 * 3. Once found, retries failed bridges
 * 4. On timeout/exhaustion, broadcasts a system-warning WS event
 */

import {
  type WirableState,
  type WireCoordinatorOpts,
  wireCoordinatorBridgesWhenReady,
} from "../coordinator-wiring";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function makeMockState(
  overrides?: Partial<WirableState> & {
    getService?: (name: string) => unknown;
  },
): WirableState {
  const broadcastWs = vi.fn();
  const runtime = {
    getService: overrides?.getService ?? (() => null),
  };
  return {
    runtime: (overrides?.runtime === null
      ? null
      : runtime) as WirableState["runtime"],
    broadcastWs: overrides?.broadcastWs ?? broadcastWs,
  };
}

function makeOpts(
  overrides?: Partial<WireCoordinatorOpts>,
): WireCoordinatorOpts {
  return {
    wireChatBridge: overrides?.wireChatBridge ?? vi.fn(() => true),
    wireWsBridge: overrides?.wireWsBridge ?? vi.fn(() => true),
    wireEventRouting: overrides?.wireEventRouting ?? vi.fn(() => true),
    context: overrides?.context ?? "test",
    logger: overrides?.logger ?? { warn: vi.fn(), debug: vi.fn() },
  };
}

describe("wireCoordinatorBridgesWhenReady — polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("wires immediately when all bridges succeed on first try (no polling)", async () => {
    const state = makeMockState();
    const wireChatBridge = vi.fn(() => true);
    const wireWsBridge = vi.fn(() => true);
    const wireEventRouting = vi.fn(() => true);
    const opts = makeOpts({ wireChatBridge, wireWsBridge, wireEventRouting });

    const result = await wireCoordinatorBridgesWhenReady(state, opts);

    expect(result).toEqual({
      chat: true,
      ws: true,
      eventRouting: true,
      swarmSynthesis: false,
    });
    // Each bridge called exactly once — no retries needed
    expect(wireChatBridge).toHaveBeenCalledTimes(1);
    expect(wireWsBridge).toHaveBeenCalledTimes(1);
    expect(wireEventRouting).toHaveBeenCalledTimes(1);
    // No warning broadcast
    expect(state.broadcastWs).not.toHaveBeenCalled();
  });

  it("polls for service then retries successfully", async () => {
    // Service appears after the first poll
    const getService = vi
      .fn<(name: string) => unknown>()
      .mockReturnValueOnce(null)
      .mockReturnValue({ serviceType: "SWARM_COORDINATOR" });
    const state = makeMockState({ getService });

    // Chat bridge fails initially, succeeds after service loads
    const wireChatBridge = vi
      .fn<() => boolean>()
      .mockReturnValueOnce(false)
      .mockReturnValue(true);
    const wireWsBridge = vi.fn(() => true);
    const wireEventRouting = vi.fn(() => true);
    const opts = makeOpts({ wireChatBridge, wireWsBridge, wireEventRouting });

    const promise = wireCoordinatorBridgesWhenReady(state, opts);

    // Advance past poll intervals
    await vi.advanceTimersByTimeAsync(6_000);
    const result = await promise;

    expect(result.chat).toBe(true);
    expect(result.ws).toBe(true);
    expect(result.eventRouting).toBe(true);
    // Chat was called twice: initial + one retry after service found
    expect(wireChatBridge).toHaveBeenCalledTimes(2);
    // WS/event succeeded initially — should NOT be retried
    expect(wireWsBridge).toHaveBeenCalledTimes(1);
    expect(wireEventRouting).toHaveBeenCalledTimes(1);
    // No warning broadcast
    expect(state.broadcastWs).not.toHaveBeenCalled();
  });

  it("broadcasts warning when retries exhausted after service load", async () => {
    // Service appears immediately
    const getService = vi.fn(() => ({ serviceType: "SWARM_COORDINATOR" }));
    const state = makeMockState({ getService });

    // All bridges always fail
    const wireChatBridge = vi.fn(() => false);
    const wireWsBridge = vi.fn(() => false);
    const wireEventRouting = vi.fn(() => false);
    const opts = makeOpts({ wireChatBridge, wireWsBridge, wireEventRouting });

    const promise = wireCoordinatorBridgesWhenReady(state, opts);
    // Advance timers: poll interval (2s) + retry delays (5 * 500ms)
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await promise;

    expect(result).toEqual({
      chat: false,
      ws: false,
      eventRouting: false,
      swarmSynthesis: false,
    });
    // initial (1) + 5 retries = 6 calls
    expect(wireChatBridge).toHaveBeenCalledTimes(6);
    // Should broadcast a system-warning
    expect(state.broadcastWs).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "system-warning",
        message: expect.stringContaining("retries exhausted"),
      }),
    );
  });

  it("does not broadcast warning when service never appears (not configured)", async () => {
    // Service never loads
    const state = makeMockState({ getService: () => null });
    const wireChatBridge = vi.fn(() => false);
    const opts = makeOpts({ wireChatBridge });

    const promise = wireCoordinatorBridgesWhenReady(state, opts);

    // Advance past the 90s poll timeout
    await vi.advanceTimersByTimeAsync(92_000);
    const result = await promise;

    expect(result.chat).toBe(false);
    // No system-warning broadcast — silent timeout is expected when
    // the orchestrator plugin is not loaded
    expect(state.broadcastWs).not.toHaveBeenCalled();
  });

  it("handles null runtime gracefully without broadcasting", async () => {
    const broadcastWs = vi.fn();
    const state: WirableState = {
      runtime: null,
      broadcastWs,
    };
    const wireChatBridge = vi.fn(() => false);
    const warnFn = vi.fn();
    const opts = makeOpts({
      wireChatBridge,
      logger: { warn: warnFn, debug: vi.fn() },
    });

    const result = await wireCoordinatorBridgesWhenReady(state, opts);

    expect(result.chat).toBe(false);
    expect(broadcastWs).not.toHaveBeenCalled();
    expect(warnFn).toHaveBeenCalledWith(expect.stringContaining("no runtime"));
  });
});
