import { describe, expect, it } from "vitest";
import {
  prependDevSubsystemFigletHeading,
  renderDevSubsystemFigletHeading,
} from "./dev-settings-figlet-heading.js";

describe("renderDevSubsystemFigletHeading", () => {
  it("renders Standard figlet for API with typical slash-underscore art", () => {
    const out = renderDevSubsystemFigletHeading("api", { maxWidth: 80 });
    expect(out.length).toBeGreaterThan(10);
    expect(out.split("\n").length).toBeGreaterThanOrEqual(3);
    expect(out).toMatch(/[/\\_|]/);
  });

  it("prepends figlet with blank line before table", () => {
    const inner = "╭─x─╮\n╰───╯\n";
    const full = prependDevSubsystemFigletHeading("vite", inner);
    expect(full).toContain(inner);
    expect(full.indexOf("╭")).toBeGreaterThan(0);
    expect(full.slice(0, full.indexOf("╭")).trimEnd().length).toBeGreaterThan(
      0,
    );
  });
});
