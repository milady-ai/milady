import { describe, it, expect } from "vitest";
import { getRewardsAction } from "../actions/getRewards";

describe("getRewardsAction", () => {
  it("should have correct action name", () => {
    expect(getRewardsAction.name).toBe("POLYMARKET_GET_REWARDS");
  });

  it("should have similes for reward-related queries", () => {
    expect(getRewardsAction.similes).toContain("POLYMARKET_LP_EARNINGS");
    expect(getRewardsAction.similes).toContain("POLYMARKET_REWARD_STATUS");
  });

  it("should have examples", () => {
    expect(getRewardsAction.examples.length).toBeGreaterThan(0);
  });

  it("should require API credentials in validate", async () => {
    const mockRuntime = {
      getSetting: (key: string) => {
        if (key === "CLOB_API_URL") return "https://clob.polymarket.com";
        return undefined;
      },
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    };
    const mockMessage = { content: { text: "show my rewards" } };
    const result = await getRewardsAction.validate(mockRuntime as any, mockMessage as any);
    expect(result).toBe(false); // No private key
  });

  it("should pass validate with all credentials", async () => {
    const mockRuntime = {
      getSetting: (key: string) => {
        const settings: Record<string, string> = {
          CLOB_API_URL: "https://clob.polymarket.com",
          POLYMARKET_PRIVATE_KEY: "0xdeadbeef",
          CLOB_API_KEY: "key",
          CLOB_API_SECRET: "secret",
          CLOB_API_PASSPHRASE: "passphrase",
        };
        return settings[key] ?? undefined;
      },
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    };
    const mockMessage = { content: { text: "show my rewards" } };
    const result = await getRewardsAction.validate(mockRuntime as any, mockMessage as any);
    expect(result).toBe(true);
  });
});
