import { describe, expect, it } from "vitest";
import {
  formatDevSettingsTable,
  wrapToWidth,
} from "./dev-settings-table.js";

function maxLineLength(text: string): number {
  return Math.max(0, ...text.split("\n").map((l) => l.length));
}

describe("formatDevSettingsTable", () => {
  it("includes title, header row, separator, and data rows", () => {
    const out = formatDevSettingsTable(
      "Test banner",
      [
        {
          setting: "MILADY_FOO",
          effective: "1",
          source: "default (unset)",
          change: "export MILADY_FOO=0",
        },
      ],
      { layout: "wide" },
    );
    expect(out).toContain("=== Test banner ===");
    expect(out).toContain("Setting");
    expect(out).toContain("Effective");
    expect(out).toContain("Source");
    expect(out).toContain("Change");
    expect(out).toContain("MILADY_FOO");
    expect(out).toContain("---");
  });

  it("truncates long cells with ellipsis when capped", () => {
    const long = "x".repeat(100);
    const out = formatDevSettingsTable(
      "Wide",
      [{ setting: long, effective: "a", source: "b", change: "c" }],
      { layout: "wide", caps: { setting: 12 } },
    );
    expect(out).toContain("…");
  });

  it("default narrow layout wraps so lines stay within narrowWidth", () => {
    const out = formatDevSettingsTable("Narrow test", [
      {
        setting: "FOO",
        effective: "on",
        source: "default",
        change:
          "export FOO=0 and also this text runs long past eighty columns to force wrapping in the change field",
      },
    ]);
    expect(maxLineLength(out)).toBeLessThanOrEqual(80);
    expect(out).toContain("  Change:");
    expect(out).toContain("╭");
    expect(out).toContain("╰");
  });

  it("narrowFrame: false keeps legacy === title === block", () => {
    const out = formatDevSettingsTable(
      "Plain narrow",
      [
        {
          setting: "X",
          effective: "1",
          source: "default",
          change: "unset",
        },
      ],
      { narrowFrame: false },
    );
    expect(out).toContain("=== Plain narrow ===");
    expect(out).not.toContain("╭");
  });
});

describe("wrapToWidth", () => {
  it("hard-breaks tokens longer than width", () => {
    expect(wrapToWidth("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
  });
});
