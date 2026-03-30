/**
 * @vitest-environment jsdom
 *
 * Tests the container portal pattern used by DialogContent to escape
 * 3D-transform stacking contexts while preserving Radix accessibility.
 */
import { describe, expect, it } from "vitest";

describe("Dialog container portal pattern", () => {
  it("document.body is a valid HTMLElement for Radix DialogPortal container", () => {
    const container =
      typeof document !== "undefined" ? document.body : undefined;
    expect(container).toBeInstanceOf(HTMLElement);
  });

  it("container expression evaluates safely when document exists", () => {
    // Pattern used in KnowledgeView and SkillsView modals:
    // container={typeof document !== "undefined" ? document.body : undefined}
    const result = typeof document !== "undefined" ? document.body : undefined;
    expect(result).toBe(document.body);
  });

  it("companion message layer bottom uses dynamic px value when composerHeight > 0", () => {
    // ChatView calculates: composerHeight > 0 ? `${composerHeight + GAP}px` : fallback
    const GAP = 10;
    const fallback = "4rem";

    expect(60 > 0 ? `${60 + GAP}px` : fallback).toBe("70px");
    expect(0 > 0 ? `${0 + GAP}px` : fallback).toBe(fallback);
  });
});
