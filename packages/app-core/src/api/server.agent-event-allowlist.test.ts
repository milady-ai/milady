import { describe, expect, it } from "vitest";
import { AGENT_EVENT_ALLOWED_STREAMS } from "./server";

describe("AGENT_EVENT_ALLOWED_STREAMS", () => {
  it("includes core stream names", () => {
    for (const name of [
      "chat",
      "terminal",
      "game",
      "autonomy",
      "stream",
      "system",
    ]) {
      expect(AGENT_EVENT_ALLOWED_STREAMS.has(name)).toBe(true);
    }
  });

  it("rejects unknown stream names", () => {
    expect(AGENT_EVENT_ALLOWED_STREAMS.has("__proto__")).toBe(false);
    expect(AGENT_EVENT_ALLOWED_STREAMS.has("notARealStream")).toBe(false);
  });
});
