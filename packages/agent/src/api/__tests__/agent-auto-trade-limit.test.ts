import { beforeEach, describe, expect, it } from "vitest";
import {
  AGENT_AUTO_MAX_DAILY_TRADES,
  agentAutoDailyTrades,
  canUseLocalTradeExecution,
  recordAgentAutoTrade,
} from "../trade-safety";

describe("recordAgentAutoTrade", () => {
  beforeEach(() => {
    agentAutoDailyTrades.count = 0;
    agentAutoDailyTrades.resetDate = "";
  });

  it("allows trades up to the daily limit", () => {
    for (let i = 0; i < AGENT_AUTO_MAX_DAILY_TRADES; i++) {
      expect(recordAgentAutoTrade()).toBe(true);
    }
    expect(agentAutoDailyTrades.count).toBe(AGENT_AUTO_MAX_DAILY_TRADES);
  });

  it("rejects trades beyond the daily limit", () => {
    agentAutoDailyTrades.count = AGENT_AUTO_MAX_DAILY_TRADES;
    agentAutoDailyTrades.resetDate = new Date().toISOString().slice(0, 10);
    expect(recordAgentAutoTrade()).toBe(false);
    expect(agentAutoDailyTrades.count).toBe(AGENT_AUTO_MAX_DAILY_TRADES);
  });

  it("resets the counter on a new calendar day", () => {
    agentAutoDailyTrades.count = AGENT_AUTO_MAX_DAILY_TRADES;
    agentAutoDailyTrades.resetDate = "2025-01-01";
    expect(recordAgentAutoTrade()).toBe(true);
    expect(agentAutoDailyTrades.count).toBe(1);
  });

  it("increments count on each allowed trade", () => {
    expect(recordAgentAutoTrade()).toBe(true);
    expect(agentAutoDailyTrades.count).toBe(1);
    expect(recordAgentAutoTrade()).toBe(true);
    expect(agentAutoDailyTrades.count).toBe(2);
  });
});

describe("canUseLocalTradeExecution", () => {
  beforeEach(() => {
    agentAutoDailyTrades.count = 0;
    agentAutoDailyTrades.resetDate = "";
  });

  it("allows agent trades in agent-auto mode (within limit)", () => {
    expect(canUseLocalTradeExecution("agent-auto", true)).toBe(true);
  });

  it("allows user-initiated trades in agent-auto mode without consuming limit", () => {
    agentAutoDailyTrades.count = AGENT_AUTO_MAX_DAILY_TRADES;
    agentAutoDailyTrades.resetDate = new Date().toISOString().slice(0, 10);
    expect(canUseLocalTradeExecution("agent-auto", false)).toBe(true);
  });

  it("rejects agent trades in agent-auto mode when limit reached", () => {
    agentAutoDailyTrades.count = AGENT_AUTO_MAX_DAILY_TRADES;
    agentAutoDailyTrades.resetDate = new Date().toISOString().slice(0, 10);
    expect(canUseLocalTradeExecution("agent-auto", true)).toBe(false);
  });

  it("reports agent-auto capability without consuming quota", () => {
    agentAutoDailyTrades.count = 3;
    agentAutoDailyTrades.resetDate = new Date().toISOString().slice(0, 10);

    expect(
      canUseLocalTradeExecution("agent-auto", true, undefined, {
        consumeAgentQuota: false,
      }),
    ).toBe(true);
    expect(agentAutoDailyTrades.count).toBe(3);
  });

  it("reports capability false at the limit without mutating quota", () => {
    agentAutoDailyTrades.count = AGENT_AUTO_MAX_DAILY_TRADES;
    agentAutoDailyTrades.resetDate = new Date().toISOString().slice(0, 10);

    expect(
      canUseLocalTradeExecution("agent-auto", true, undefined, {
        consumeAgentQuota: false,
      }),
    ).toBe(false);
    expect(agentAutoDailyTrades.count).toBe(AGENT_AUTO_MAX_DAILY_TRADES);
  });

  it("allows user trades in manual-local-key mode", () => {
    expect(canUseLocalTradeExecution("manual-local-key", false)).toBe(true);
  });

  it("rejects agent trades in manual-local-key mode", () => {
    expect(canUseLocalTradeExecution("manual-local-key", true)).toBe(false);
  });

  it("rejects all trades in disabled mode", () => {
    expect(canUseLocalTradeExecution("disabled", false)).toBe(false);
    expect(canUseLocalTradeExecution("disabled", true)).toBe(false);
  });
});
