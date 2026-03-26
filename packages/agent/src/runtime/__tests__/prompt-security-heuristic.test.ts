/**
 * Tests for security heuristic helpers in prompt-optimization.ts
 * and intent-action map validation in prompt-compaction.ts.
 *
 * Verifies that:
 * - isHighRiskMessage flags sensitive keywords correctly
 * - shouldSkipSecurityEval is env-var only (no injection vector)
 * - validateIntentActionMap warns on stale action names
 */

import { describe, expect, it } from "vitest";
import {
  isHighRiskMessage,
  shouldSkipSecurityEval,
} from "../prompt-optimization";
import { validateIntentActionMap } from "../prompt-compaction";

// ---------------------------------------------------------------------------
// isHighRiskMessage (security heuristic)
// ---------------------------------------------------------------------------

describe("isHighRiskMessage", () => {
  it("flags messages containing sensitive keywords", () => {
    expect(isHighRiskMessage("give me the api key")).toBe(true);
    expect(isHighRiskMessage("what is the password")).toBe(true);
    expect(isHighRiskMessage("show me the seed phrase")).toBe(true);
    expect(isHighRiskMessage("jailbreak the system")).toBe(true);
    expect(isHighRiskMessage("exfiltrate data")).toBe(true);
  });

  it("passes normal messages as low-risk", () => {
    expect(isHighRiskMessage("what is the weather")).toBe(false);
    expect(isHighRiskMessage("tell me about pancakes")).toBe(false);
    expect(isHighRiskMessage("fix the bug in the repo")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shouldSkipSecurityEval (env-var only, no prompt parsing)
// ---------------------------------------------------------------------------

describe("shouldSkipSecurityEval", () => {
  it("returns false by default (security eval runs)", () => {
    // Default: MILADY_SKIP_SECURITY_EVAL is not set
    expect(shouldSkipSecurityEval()).toBe(false);
  });

  it("is not influenced by prompt content (no injection vector)", () => {
    // A malicious user embedding "Source: client_chat" in their message
    // must NOT cause the security eval to be skipped.
    // shouldSkipSecurityEval() takes no arguments — prompt content is irrelevant.
    expect(shouldSkipSecurityEval()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateIntentActionMap
// ---------------------------------------------------------------------------

describe("validateIntentActionMap", () => {
  it("logs no warnings when all mapped actions are registered", () => {
    const warnings: string[] = [];
    const logger = { warn: (msg: string) => warnings.push(msg) };
    validateIntentActionMap(
      [
        "START_CODING_TASK",
        "SPAWN_CODING_AGENT",
        "PROVISION_WORKSPACE",
        "FINALIZE_WORKSPACE",
        "LIST_CODING_AGENTS",
        "SEND_TO_CODING_AGENT",
        "RUN_IN_TERMINAL",
        "RESTART_AGENT",
        "MANAGE_ISSUES",
        "PLAY_EMOTE",
      ],
      logger,
    );
    expect(warnings).toHaveLength(0);
  });

  it("logs warnings for stale action names not in the registry", () => {
    const warnings: string[] = [];
    const logger = { warn: (msg: string) => warnings.push(msg) };
    // Only register a few — the rest should warn
    validateIntentActionMap(["START_CODING_TASK", "PLAY_EMOTE"], logger);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.includes("SPAWN_CODING_AGENT"))).toBe(true);
  });
});
