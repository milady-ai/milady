import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contract test: CompanionHeader is a self-contained header for the
 * companion overlay. The mode-selector pill (companion / character / desktop)
 * lives here. Voice toggle and new chat controls sit in the center.
 * Clicking the desktop/mobile icon exits the companion overlay.
 */
describe("companion header", () => {
  it("CompanionHeader renders mode pill and voice controls", () => {
    const headerPath = path.resolve(import.meta.dirname, "CompanionHeader.tsx");
    expect(existsSync(headerPath)).toBe(true);
    const source = readFileSync(headerPath, "utf-8");

    expect(source).toContain("onExitToDesktop");
    expect(source).toContain("onExitToCharacter");
    expect(source).toContain("onToggleVoiceMute");
    expect(source).toContain("onNewChat");
    expect(source).toContain("companion-shell-toggle");
  });

  it("Character tab exists in main navigation", () => {
    const navPath = path.resolve(
      import.meta.dirname,
      "..",
      "..",
      "navigation",
      "index.ts",
    );
    expect(existsSync(navPath)).toBe(true);
    const source = readFileSync(navPath, "utf-8");
    expect(source).toContain('"Character"');
    expect(source).toContain('"character"');
  });
});
