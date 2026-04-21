import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findPluginBrowserStagehandDir } from "./eliza.js";

describe("findPluginBrowserStagehandDir", () => {
  it("finds stagehand from packages/agent/src/runtime (Milady layout)", () => {
    const root = mkdtempSync(join(tmpdir(), "milady-stagehand-"));
    const stagehand = join(
      root,
      "plugins",
      "plugin-browser",
      "stagehand-server",
    );
    mkdirSync(join(stagehand, "src"), { recursive: true });
    writeFileSync(join(stagehand, "src", "index.ts"), "export {}\n");
    const runtimeDir = join(root, "packages", "agent", "src", "runtime");
    mkdirSync(runtimeDir, { recursive: true });
    expect(findPluginBrowserStagehandDir(runtimeDir)).toBe(stagehand);
  });

  it("finds stagehand from eliza/packages/agent/src/runtime (parent workspace layout)", () => {
    const workspace = mkdtempSync(join(tmpdir(), "eliza-ws-stagehand-"));
    const stagehand = join(
      workspace,
      "plugins",
      "plugin-browser",
      "stagehand-server",
    );
    mkdirSync(join(stagehand, "dist"), { recursive: true });
    writeFileSync(join(stagehand, "dist", "index.js"), "module.exports = {}\n");
    const runtimeDir = join(
      workspace,
      "eliza",
      "packages",
      "agent",
      "src",
      "runtime",
    );
    mkdirSync(runtimeDir, { recursive: true });
    expect(findPluginBrowserStagehandDir(runtimeDir)).toBe(stagehand);
  });

  it("returns null when no stagehand tree exists", () => {
    const empty = mkdtempSync(join(tmpdir(), "no-stagehand-"));
    expect(findPluginBrowserStagehandDir(empty)).toBeNull();
  });
});
