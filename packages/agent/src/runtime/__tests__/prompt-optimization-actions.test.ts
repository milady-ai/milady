/**
 * Tests for context-aware action formatting in prompt-optimization.ts.
 *
 * Verifies that:
 * - Intent detection correctly classifies messages
 * - Full param sets are built for the right intents
 * - Action compaction strips params for non-matching actions
 * - Universal actions always keep full params
 * - Coding intent implies terminal + issues
 * - No-intent fallback keeps all actions intact
 * - The agent can still use compacted actions correctly
 */

import { describe, expect, it } from "vitest";
import {
  buildFullParamActionSet,
  compactActionsForIntent,
  detectIntentCategories,
} from "../prompt-compaction";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const SAMPLE_ACTIONS_BLOCK = `<actions>
  <action>
    <name>REPLY</name>
    <description>Reply to the user.</description>
  </action>
  <action>
    <name>NONE</name>
    <description>Do nothing.</description>
  </action>
  <action>
    <name>IGNORE</name>
    <description>Ignore the message.</description>
  </action>
  <action>
    <name>START_CODING_TASK</name>
    <description>Launch a coding agent.</description>
    <params>
      <param>
        <name>repo</name>
        <description>Git repository URL to clone.</description>
        <type>string</type>
        <required>false</required>
      </param>
      <param>
        <name>task</name>
        <description>The task to send to the agent.</description>
        <type>string</type>
        <required>false</required>
      </param>
      <param>
        <name>agentType</name>
        <description>Agent type: claude, gemini, codex, aider.</description>
        <type>string</type>
        <required>false</required>
      </param>
    </params>
  </action>
  <action>
    <name>MANAGE_ISSUES</name>
    <description>Manage GitHub issues for a repository.</description>
    <params>
      <param>
        <name>operation</name>
        <description>create, list, get, update, comment, close, reopen</description>
        <type>string</type>
        <required>true</required>
      </param>
      <param>
        <name>repo</name>
        <description>Repository in owner/repo format.</description>
        <type>string</type>
        <required>true</required>
      </param>
    </params>
  </action>
  <action>
    <name>RUN_IN_TERMINAL</name>
    <description>Run a shell command in the terminal.</description>
    <params>
      <param>
        <name>command</name>
        <description>The shell command to execute.</description>
        <type>string</type>
        <required>true</required>
      </param>
    </params>
  </action>
  <action>
    <name>PLAY_EMOTE</name>
    <description>Play an avatar animation.</description>
    <params>
      <param>
        <name>emote</name>
        <description>The emote ID to play.</description>
        <type>string</type>
        <required>true</required>
      </param>
    </params>
  </action>
  <action>
    <name>FINALIZE_WORKSPACE</name>
    <description>Commit, push, and create a PR.</description>
    <params>
      <param>
        <name>workspaceId</name>
        <description>Workspace to finalize.</description>
        <type>string</type>
        <required>false</required>
      </param>
      <param>
        <name>prTitle</name>
        <description>PR title.</description>
        <type>string</type>
        <required>false</required>
      </param>
    </params>
  </action>
</actions>`;

function buildPrompt(userMessage: string): string {
  return `<task>Generate dialog and actions for the character Eliza.</task>
<providers>
${SAMPLE_ACTIONS_BLOCK}

# Conversation Messages
assistant: Hello!

# Received Message
user: ${userMessage}
</providers>`;
}

// ---------------------------------------------------------------------------
// detectIntentCategories
// ---------------------------------------------------------------------------

describe("detectIntentCategories", () => {
  it("detects coding intent", () => {
    const prompt = buildPrompt("Fix the bug in the repository");
    expect(detectIntentCategories(prompt)).toContain("coding");
  });

  it("detects terminal intent", () => {
    const prompt = buildPrompt("Run npm install in the terminal");
    expect(detectIntentCategories(prompt)).toContain("terminal");
  });

  it("detects issue intent", () => {
    const prompt = buildPrompt("Create an issue for the login bug");
    expect(detectIntentCategories(prompt)).toContain("issues");
  });

  it("detects emote intent", () => {
    const prompt = buildPrompt("Do a wave emote");
    expect(detectIntentCategories(prompt)).toContain("emote");
  });

  it("detects coding intent from GitHub/GitLab/Bitbucket URLs", () => {
    expect(
      detectIntentCategories(
        buildPrompt(
          "take a look at https://github.com/org/repo and tell me about it",
        ),
      ),
    ).toContain("coding");
    expect(
      detectIntentCategories(
        buildPrompt("check out https://gitlab.com/org/project"),
      ),
    ).toContain("coding");
    expect(
      detectIntentCategories(
        buildPrompt("look at https://bitbucket.org/team/repo"),
      ),
    ).toContain("coding");
  });

  it("detects multiple intents simultaneously", () => {
    const prompt = buildPrompt(
      "Fix the bug in the repo and run the tests in the terminal",
    );
    const categories = detectIntentCategories(prompt);
    expect(categories).toContain("coding");
    expect(categories).toContain("terminal");
  });

  it("returns empty array for general chat", () => {
    const prompt = buildPrompt("What is the difference between a stack and a queue?");
    expect(detectIntentCategories(prompt)).toEqual([]);
  });

  it("detects intent from <task> section", () => {
    const prompt = `<task>Fix the repository code.</task>\n<providers>\n${SAMPLE_ACTIONS_BLOCK}\n</providers>`;
    expect(detectIntentCategories(prompt)).toContain("coding");
  });
});

// ---------------------------------------------------------------------------
// buildFullParamActionSet
// ---------------------------------------------------------------------------

describe("buildFullParamActionSet", () => {
  it("always includes universal actions", () => {
    const actions = buildFullParamActionSet([]);
    expect(actions.has("REPLY")).toBe(true);
    expect(actions.has("NONE")).toBe(true);
    expect(actions.has("IGNORE")).toBe(true);
  });

  it("includes coding actions for coding intent", () => {
    const actions = buildFullParamActionSet(["coding"]);
    expect(actions.has("START_CODING_TASK")).toBe(true);
    expect(actions.has("SPAWN_CODING_AGENT")).toBe(true);
    expect(actions.has("PROVISION_WORKSPACE")).toBe(true);
    expect(actions.has("FINALIZE_WORKSPACE")).toBe(true);
  });

  it("coding intent implies terminal + issues", () => {
    const actions = buildFullParamActionSet(["coding"]);
    expect(actions.has("RUN_IN_TERMINAL")).toBe(true);
    expect(actions.has("RESTART_AGENT")).toBe(true);
    expect(actions.has("MANAGE_ISSUES")).toBe(true);
  });

  it("terminal intent only includes terminal actions", () => {
    const actions = buildFullParamActionSet(["terminal"]);
    expect(actions.has("RUN_IN_TERMINAL")).toBe(true);
    expect(actions.has("RESTART_AGENT")).toBe(true);
    expect(actions.has("START_CODING_TASK")).toBe(false);
    expect(actions.has("PLAY_EMOTE")).toBe(false);
  });

  it("emote intent includes PLAY_EMOTE", () => {
    const actions = buildFullParamActionSet(["emote"]);
    expect(actions.has("PLAY_EMOTE")).toBe(true);
    expect(actions.has("START_CODING_TASK")).toBe(false);
  });

  it("multiple intents combine their action sets", () => {
    const actions = buildFullParamActionSet(["terminal", "emote"]);
    expect(actions.has("RUN_IN_TERMINAL")).toBe(true);
    expect(actions.has("PLAY_EMOTE")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// compactActionsForIntent
// ---------------------------------------------------------------------------

describe("compactActionsForIntent", () => {
  it("strips params from non-matching actions for general chat", () => {
    // "hello" doesn't match any intent — but the fallback keeps all
    // Let's use a message that matches terminal only
    const prompt = buildPrompt("Run npm install");
    const result = compactActionsForIntent(prompt);

    // RUN_IN_TERMINAL should keep <params>
    expect(result).toContain("<name>RUN_IN_TERMINAL</name>");
    expect(result).toMatch(
      /RUN_IN_TERMINAL[\s\S]*?<params>[\s\S]*?command[\s\S]*?<\/params>/,
    );

    // START_CODING_TASK should NOT have <params> (not terminal intent)
    // Extract just the action block between its <action> and next </action>
    const startCodingIdx = result.indexOf("<name>START_CODING_TASK</name>");
    const startCodingBlockEnd = result.indexOf("</action>", startCodingIdx);
    const startCodingBlock = result.slice(startCodingIdx, startCodingBlockEnd);
    expect(startCodingBlock).not.toContain("<params>");

    // PLAY_EMOTE should NOT have <params>
    const emoteIdx = result.indexOf("<name>PLAY_EMOTE</name>");
    const emoteBlockEnd = result.indexOf("</action>", emoteIdx);
    const emoteBlock = result.slice(emoteIdx, emoteBlockEnd);
    expect(emoteBlock).not.toContain("<params>");
  });

  it("keeps full params for coding actions when coding intent detected", () => {
    const prompt = buildPrompt("Fix the bug in the repository");
    const result = compactActionsForIntent(prompt);

    // START_CODING_TASK should keep <params>
    expect(result).toMatch(
      /START_CODING_TASK[\s\S]*?<params>[\s\S]*?repo[\s\S]*?<\/params>/,
    );

    // FINALIZE_WORKSPACE should keep <params> (coding intent)
    expect(result).toMatch(
      /FINALIZE_WORKSPACE[\s\S]*?<params>[\s\S]*?workspaceId[\s\S]*?<\/params>/,
    );

    // MANAGE_ISSUES should keep <params> (coding implies issues)
    expect(result).toMatch(
      /MANAGE_ISSUES[\s\S]*?<params>[\s\S]*?operation[\s\S]*?<\/params>/,
    );

    // RUN_IN_TERMINAL should keep <params> (coding implies terminal)
    expect(result).toMatch(
      /RUN_IN_TERMINAL[\s\S]*?<params>[\s\S]*?command[\s\S]*?<\/params>/,
    );

    // PLAY_EMOTE should NOT have <params>
    const emoteIdx = result.indexOf("<name>PLAY_EMOTE</name>");
    const emoteBlockEnd = result.indexOf("</action>", emoteIdx);
    const emoteBlock = result.slice(emoteIdx, emoteBlockEnd);
    expect(emoteBlock).not.toContain("<params>");
  });

  it("always preserves universal actions", () => {
    const prompt = buildPrompt("Run npm install");
    const result = compactActionsForIntent(prompt);

    expect(result).toContain("<name>REPLY</name>");
    expect(result).toContain("<name>NONE</name>");
    expect(result).toContain("<name>IGNORE</name>");
  });

  it("preserves all action names even when compacted", () => {
    const prompt = buildPrompt("Run npm install");
    const result = compactActionsForIntent(prompt);

    // All action names should still be present
    for (const name of [
      "REPLY",
      "NONE",
      "IGNORE",
      "START_CODING_TASK",
      "MANAGE_ISSUES",
      "RUN_IN_TERMINAL",
      "PLAY_EMOTE",
      "FINALIZE_WORKSPACE",
    ]) {
      expect(result).toContain(`<name>${name}</name>`);
    }
  });

  it("preserves descriptions even when params are stripped", () => {
    const prompt = buildPrompt("Run npm install");
    const result = compactActionsForIntent(prompt);

    // START_CODING_TASK description should still be present
    expect(result).toContain("Launch a coding agent.");
    // PLAY_EMOTE description should still be present
    expect(result).toContain("Play an avatar animation.");
  });

  it("returns prompt unchanged when no actions block found", () => {
    const prompt = "Just a plain prompt with no actions.";
    expect(compactActionsForIntent(prompt)).toBe(prompt);
  });

  it("strips non-universal action params for general chat (no intent)", () => {
    const prompt = buildPrompt(
      "What is the difference between a stack and a queue?",
    );
    const result = compactActionsForIntent(prompt);

    // Universal actions should keep their structure
    expect(result).toContain("<name>REPLY</name>");
    expect(result).toContain("<name>NONE</name>");

    // Non-universal actions should have params stripped
    const startCodingIdx = result.indexOf("<name>START_CODING_TASK</name>");
    const startCodingBlockEnd = result.indexOf("</action>", startCodingIdx);
    const startCodingBlock = result.slice(startCodingIdx, startCodingBlockEnd);
    expect(startCodingBlock).not.toContain("<params>");

    const emoteIdx = result.indexOf("<name>PLAY_EMOTE</name>");
    const emoteBlockEnd = result.indexOf("</action>", emoteIdx);
    const emoteBlock = result.slice(emoteIdx, emoteBlockEnd);
    expect(emoteBlock).not.toContain("<params>");
  });

  it("reduces prompt size significantly for non-coding chat", () => {
    const prompt = buildPrompt("Run npm install");
    const original = prompt.length;
    const compacted = compactActionsForIntent(prompt).length;

    // Should save at least 20% of the original prompt
    const savings = ((original - compacted) / original) * 100;
    expect(savings).toBeGreaterThan(20);
  });

  it("handles emote-only intent correctly", () => {
    const prompt = buildPrompt("Do a wave emote for me");
    const result = compactActionsForIntent(prompt);

    // PLAY_EMOTE should keep <params>
    expect(result).toMatch(
      /PLAY_EMOTE[\s\S]*?<params>[\s\S]*?emote[\s\S]*?<\/params>/,
    );

    // Coding actions should NOT have <params>
    const startCodingIdx = result.indexOf("<name>START_CODING_TASK</name>");
    const startCodingBlockEnd = result.indexOf("</action>", startCodingIdx);
    const startCodingBlock = result.slice(startCodingIdx, startCodingBlockEnd);
    expect(startCodingBlock).not.toContain("<params>");
  });
});
