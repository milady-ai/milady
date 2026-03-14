import { describe, it, expect } from "vitest";
import { getPositionsAction } from "../actions/getPositions";

describe("getPositionsAction", () => {
  it("should have correct action name", () => {
    expect(getPositionsAction.name).toBe("POLYMARKET_GET_POSITIONS");
  });

  it("should have position-related similes", () => {
    expect(getPositionsAction.similes).toContain("POLYMARKET_MY_POSITIONS");
    expect(getPositionsAction.similes).toContain("POLYMARKET_PORTFOLIO");
  });

  it("should require a private key in validate", async () => {
    const mockRuntime = {
      getSetting: () => undefined,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    };
    const result = await getPositionsAction.validate(mockRuntime as any, {} as any);
    expect(result).toBe(false);
  });

  it("should pass validate with private key", async () => {
    const mockRuntime = {
      getSetting: (key: string) => {
        if (key === "POLYMARKET_PRIVATE_KEY") return "0xdeadbeef";
        return undefined;
      },
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    };
    const result = await getPositionsAction.validate(mockRuntime as any, {} as any);
    expect(result).toBe(true);
  });
});
