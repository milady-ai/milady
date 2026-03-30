import { describe, expect, it } from "vitest";
import { isStewardConfigured, resolveStewardAgentId } from "./steward-bridge";

describe("resolveStewardAgentId", () => {
  it("prefers STEWARD_AGENT_ID over brand aliases", () => {
    expect(
      resolveStewardAgentId({
        STEWARD_AGENT_ID: "primary-agent",
        MILADY_STEWARD_AGENT_ID: "brand-agent",
        ELIZA_STEWARD_AGENT_ID: "legacy-agent",
      }),
    ).toBe("primary-agent");
  });

  it("falls back to the provided evm address when no agent id env var exists", () => {
    expect(resolveStewardAgentId({}, "0xabc123")).toBe("0xabc123");
  });
});

describe("isStewardConfigured", () => {
  it("returns true when STEWARD_API_URL and STEWARD_AGENT_ID are set", () => {
    expect(
      isStewardConfigured({
        STEWARD_API_URL: "https://steward.example",
        STEWARD_AGENT_ID: "agent-123",
      }),
    ).toBe(true);
  });

  it("returns true when a brand alias provides the agent id", () => {
    expect(
      isStewardConfigured({
        STEWARD_API_URL: "https://steward.example",
        MILADY_STEWARD_AGENT_ID: "agent-123",
      }),
    ).toBe(true);
  });

  it("returns false when the base URL is missing", () => {
    expect(
      isStewardConfigured({
        STEWARD_AGENT_ID: "agent-123",
      }),
    ).toBe(false);
  });

  it("returns false when the agent id resolves to an empty value", () => {
    expect(
      isStewardConfigured({
        STEWARD_API_URL: "https://steward.example",
        STEWARD_AGENT_ID: "   ",
      }),
    ).toBe(false);
  });
});
