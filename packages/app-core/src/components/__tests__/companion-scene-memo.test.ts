/**
 * Tests that CompanionSceneHost's custom memo comparator only
 * re-renders when `active` or `interactive` change, not when
 * `children` change (which happens on every App re-render due
 * to chat input keystrokes recreating the JSX tree).
 */
import { describe, expect, it } from "vitest";
import { companionSceneHostAreEqual } from "../CompanionSceneHost";

describe("CompanionSceneHost memo comparator", () => {
  it("returns true when only children change (no re-render)", () => {
    const prev = { active: true, interactive: true };
    const next = { active: true, interactive: true };
    expect(companionSceneHostAreEqual(prev, next)).toBe(true);
  });

  it("returns false when active changes", () => {
    const prev = { active: true, interactive: true };
    const next = { active: false, interactive: true };
    expect(companionSceneHostAreEqual(prev, next)).toBe(false);
  });

  it("returns false when interactive changes", () => {
    const prev = { active: true, interactive: true };
    const next = { active: true, interactive: false };
    expect(companionSceneHostAreEqual(prev, next)).toBe(false);
  });

  it("returns true when all scene-relevant props are equal", () => {
    const prev = { active: false, interactive: false };
    const next = { active: false, interactive: false };
    expect(companionSceneHostAreEqual(prev, next)).toBe(true);
  });

  it("handles undefined interactive (default param)", () => {
    const prev = { active: true };
    const next = { active: true };
    expect(companionSceneHostAreEqual(prev, next)).toBe(true);
  });
});
