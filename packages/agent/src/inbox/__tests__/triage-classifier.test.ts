import { describe, expect, it } from "vitest";
import { applyTriageRules } from "../triage-classifier.js";
import type { InboundMessage, InboxTriageRules } from "../types.js";

function makeMessage(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    id: "msg-1",
    source: "discord",
    senderName: "Alice",
    channelName: "Alice (DM)",
    channelType: "dm",
    text: "Hey, are we meeting tomorrow?",
    snippet: "Hey, are we meeting tomorrow?",
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("applyTriageRules", () => {
  it("returns null when no rules match", () => {
    const rules: InboxTriageRules = {
      alwaysUrgent: ["keyword:emergency"],
      alwaysIgnore: ["channel:spam"],
      alwaysNotify: ["sender:vip-id"],
    };
    const result = applyTriageRules(makeMessage(), rules, undefined);
    expect(result).toBeNull();
  });

  it("matches keyword:urgent in alwaysUrgent", () => {
    const rules: InboxTriageRules = {
      alwaysUrgent: ["keyword:urgent"],
    };
    const result = applyTriageRules(
      makeMessage({ text: "This is URGENT please respond" }),
      rules,
      undefined,
    );
    expect(result).toBe("urgent");
  });

  it("matches keyword case-insensitively", () => {
    const rules: InboxTriageRules = {
      alwaysUrgent: ["keyword:emergency"],
    };
    const result = applyTriageRules(
      makeMessage({ text: "EMERGENCY: server is down" }),
      rules,
      undefined,
    );
    expect(result).toBe("urgent");
  });

  it("matches sender in alwaysIgnore", () => {
    const rules: InboxTriageRules = {
      alwaysIgnore: ["sender:bot-123"],
    };
    const result = applyTriageRules(
      makeMessage({ entityId: "bot-123" }),
      rules,
      undefined,
    );
    expect(result).toBe("ignore");
  });

  it("matches channel in alwaysNotify", () => {
    const rules: InboxTriageRules = {
      alwaysNotify: ["channel:announcements"],
    };
    const result = applyTriageRules(
      makeMessage({ channelName: "#announcements" }),
      rules,
      undefined,
    );
    expect(result).toBe("notify");
  });

  it("matches source in rules", () => {
    const rules: InboxTriageRules = {
      alwaysIgnore: ["source:sms"],
    };
    const result = applyTriageRules(
      makeMessage({ source: "sms" }),
      rules,
      undefined,
    );
    expect(result).toBe("ignore");
  });

  it("urgent takes priority over ignore when both match", () => {
    const rules: InboxTriageRules = {
      alwaysUrgent: ["keyword:help"],
      alwaysIgnore: ["source:discord"],
    };
    const result = applyTriageRules(
      makeMessage({ text: "help me please", source: "discord" }),
      rules,
      undefined,
    );
    // urgent rules are checked first
    expect(result).toBe("urgent");
  });

  it("returns null when rules are undefined", () => {
    const result = applyTriageRules(makeMessage(), undefined, undefined);
    expect(result).toBeNull();
  });

  it("returns null when gmail signals are present (hints only)", () => {
    const result = applyTriageRules(
      makeMessage({
        gmailIsImportant: true,
        gmailLikelyReplyNeeded: true,
      }),
      { alwaysUrgent: [], alwaysIgnore: [], alwaysNotify: [] },
      undefined,
    );
    expect(result).toBeNull();
  });
});
