import { describe, expect, it } from "vitest";
import {
  AGENT_STARTUP_ABSOLUTE_MAX_MS,
  computeAgentDeadlineExtensions,
} from "../../src/state/agent-startup-timing.js";

describe("computeAgentDeadlineExtensions", () => {
  it("does not slide before the grace window", () => {
    const t0 = 1_000_000;
    const deadline = t0 + 60_000;
    expect(
      computeAgentDeadlineExtensions({
        agentWaitStartedAt: t0,
        agentDeadlineAt: deadline,
        state: "starting",
        now: t0 + 5_000,
      }),
    ).toBe(deadline);
  });

  it("slides forward while state is starting after grace", () => {
    const t0 = 0;
    const deadline = 60_000;
    const next = computeAgentDeadlineExtensions({
      agentWaitStartedAt: t0,
      agentDeadlineAt: deadline,
      state: "starting",
      now: 20_000,
    });
    expect(next).toBeGreaterThan(deadline);
    expect(next).toBeLessThanOrEqual(t0 + AGENT_STARTUP_ABSOLUTE_MAX_MS);
  });

  it("does not extend when not starting", () => {
    const deadline = 99_000;
    expect(
      computeAgentDeadlineExtensions({
        agentWaitStartedAt: 0,
        agentDeadlineAt: deadline,
        state: "running",
        now: 500_000,
      }),
    ).toBe(deadline);
  });
});
