import { describe, expect, it, vi } from "vitest";
import { restartAgentAfterOnboarding } from "./onboarding-restart";

describe("restartAgentAfterOnboarding", () => {
  it("uses the waitable restart path with the onboarding timeout", async () => {
    const status = {
      state: "running",
      agentName: "Momo",
      model: "anthropic/claude-sonnet-4.6",
      startedAt: 123,
      uptime: 456,
    } as const;
    const client = {
      restartAndWait: vi.fn(async (maxWaitMs: number) => {
        expect(maxWaitMs).toBe(120_000);
        return status;
      }),
    };

    await expect(restartAgentAfterOnboarding(client)).resolves.toEqual(status);
    expect(client.restartAndWait).toHaveBeenCalledTimes(1);
  });

  it("forwards a custom timeout when explicitly requested", async () => {
    const client = {
      restartAndWait: vi.fn(async () => ({
        state: "running",
        agentName: "Momo",
      })),
    };

    await restartAgentAfterOnboarding(client, 30_000);
    expect(client.restartAndWait).toHaveBeenCalledWith(30_000);
  });
});
