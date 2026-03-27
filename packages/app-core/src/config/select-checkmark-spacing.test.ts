import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// packages/app-core/src/config/ → packages/ui/src/components/ui/
const selectSource = readFileSync(
  path.resolve(
    import.meta.dirname,
    "..",
    "..",
    "..",
    "ui",
    "src",
    "components",
    "ui",
    "select.tsx",
  ),
  "utf-8",
);

describe("SelectItem checkmark spacing", () => {
  it("uses flex layout (not absolute positioning) to prevent overlap", () => {
    // The checkmark span must NOT be absolute — it should be a flex child
    // so it always occupies space and never overlaps the text.
    const itemBlock = selectSource.match(
      /SelectPrimitive\.Item[\s\S]*?<\/SelectPrimitive\.Item>/,
    );
    expect(itemBlock).toBeTruthy();
    expect(itemBlock?.[0]).not.toContain("absolute");
    expect(itemBlock?.[0]).toContain("shrink-0");
  });

  it("check icon is h-3 w-3 to fit within compact item rows", () => {
    expect(selectSource).toContain('Check className="h-3 w-3"');
  });

  it("uses gap between checkmark and text instead of padding hack", () => {
    expect(selectSource).toMatch(/SelectPrimitive\.Item[\s\S]*?gap-1\.5/);
  });
});
