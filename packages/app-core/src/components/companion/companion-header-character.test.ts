import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contract test: character editor uses CompanionHeader (glassmorphic bar),
 * not the native Header.
 */
describe("character editor header", () => {
  it("App.tsx renders CompanionHeader when characterSceneVisible", () => {
    const appPath = path.resolve(import.meta.dirname, "..", "..", "App.tsx");
    expect(existsSync(appPath)).toBe(true);
    const source = readFileSync(appPath, "utf-8");

    // characterSceneVisible path should use CompanionHeader, not Header
    const charBlock = source.indexOf("characterSceneVisible ?");
    expect(charBlock).toBeGreaterThan(-1);
    const after = source.slice(charBlock, charBlock + 800);
    expect(after).toContain("CompanionHeader");
    expect(after).toContain('activeShellView="character"');
    expect(after).not.toContain("onSave");
  });

  it("CompanionHeader accepts onSave/isSaving/saveSuccess props", () => {
    const headerPath = path.resolve(import.meta.dirname, "CompanionHeader.tsx");
    const source = readFileSync(headerPath, "utf-8");
    expect(source).toContain("onSave?:");
    expect(source).toContain("isSaving?:");
    expect(source).toContain("saveSuccess?:");
  });
});
