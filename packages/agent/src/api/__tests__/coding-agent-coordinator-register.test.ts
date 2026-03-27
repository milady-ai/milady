import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Read the patched plugin dist to verify the coordinator registration fix
const pluginSource = readFileSync(
  path.resolve(
    import.meta.dirname,
    "..",
    "..",
    "..",
    "..",
    "..",
    "node_modules",
    "@elizaos",
    "plugin-coding-agent",
    "dist",
    "index.js",
  ),
  "utf-8",
);

describe("coding-agent coordinator registration (patch)", () => {
  it("registers task with coordinator even when task param is empty", () => {
    // The upstream plugin had `if (coordinator && task)` which skipped
    // registration when no task text was provided. This caused the
    // coordinator to discard buffered events and the UI to show no output.
    const guards = pluginSource.match(/if \(coordinator && task\)/g);
    expect(guards).toBeNull();
  });

  it("uses coordinator-only guard for registerTask calls", () => {
    // All registerTask calls should be guarded by `if (coordinator)` only
    const registerCalls = pluginSource.match(/coordinator\.registerTask\(/g);
    expect(registerCalls).toBeTruthy();
    expect(registerCalls!.length).toBeGreaterThanOrEqual(3);
  });

  it("defaults originalTask to empty string when task is undefined", () => {
    // Prevent undefined from being stored in the coordinator task context
    expect(pluginSource).toContain('originalTask: task || ""');
    const defaults = pluginSource.match(/originalTask: task \|\| ""/g);
    expect(defaults!.length).toBeGreaterThanOrEqual(3);
  });
});
