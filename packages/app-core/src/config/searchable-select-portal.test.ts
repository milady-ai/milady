import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const configFieldSource = readFileSync(
  path.resolve(import.meta.dirname, "config-field.tsx"),
  "utf-8",
);

const providerSwitcherSource = readFileSync(
  path.resolve(import.meta.dirname, "..", "components", "ProviderSwitcher.tsx"),
  "utf-8",
);

describe("SearchableSelectInner portal rendering", () => {
  it("imports createPortal from react-dom", () => {
    expect(configFieldSource).toContain(
      'import { createPortal } from "react-dom"',
    );
  });

  it("renders dropdown via createPortal to escape overflow clipping", () => {
    expect(configFieldSource).toContain("createPortal(");
    expect(configFieldSource).toContain("document.body");
  });

  it("uses fixed positioning for the dropdown", () => {
    expect(configFieldSource).toContain('position: "fixed"');
  });

  it("closes on ancestor scroll since fixed position does not track it", () => {
    expect(configFieldSource).toContain('window.addEventListener("scroll"');
  });

  it("does NOT use position:absolute (would be clipped by overflow:hidden)", () => {
    // The dropdown style should use fixed, not absolute
    const dropdownStyleBlock = configFieldSource.match(
      /setDropdownStyle\(\{[\s\S]*?\}\)/,
    );
    expect(dropdownStyleBlock).toBeTruthy();
    expect(dropdownStyleBlock?.[0]).not.toContain('"absolute"');
    expect(dropdownStyleBlock?.[0]).toContain('"fixed"');
  });
});

describe("ProviderSwitcher passes enhanced model options", () => {
  it("passes hint.options with value, label, and description for small models", () => {
    expect(providerSwitcherSource).toMatch(
      /small:\s*\{[\s\S]*?options:\s*modelOptions\.small\.map/,
    );
  });

  it("passes hint.options with value, label, and description for large models", () => {
    expect(providerSwitcherSource).toMatch(
      /large:\s*\{[\s\S]*?options:\s*modelOptions\.large\.map/,
    );
  });

  it("maps model name to label for human-readable dropdown entries", () => {
    // Both small and large should map m.name → label
    const optionMappings = providerSwitcherSource.match(/label:\s*m\.name/g);
    expect(optionMappings).toBeTruthy();
    expect(optionMappings?.length).toBeGreaterThanOrEqual(2);
  });
});
