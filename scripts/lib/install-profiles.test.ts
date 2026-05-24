import { describe, expect, it } from "vitest";
import {
  applyInstallProfileKey,
  buildInstallPlan,
  defaultInstallProfileIds,
  parseInstallProfileList,
  renderInstallProfilePrompt,
} from "./install-profiles.mjs";

describe("install profiles", () => {
  it("defaults to package mode for non-interactive installs", () => {
    expect(defaultInstallProfileIds()).toEqual(["packages"]);
  });

  it("expands all into the package and local source install paths", () => {
    const plan = buildInstallPlan(["all"], ["--frozen-lockfile"]);

    expect(plan.map((step) => step.id)).toEqual(["packages", "local"]);
    expect(plan[0]?.args).toEqual(["install", "--frozen-lockfile"]);
    expect(plan[0]?.env.MILADY_ELIZA_SOURCE).toBe("packages");
    expect(plan[1]?.args).toEqual([
      "scripts/eliza-source-mode.mjs",
      "local",
      "--install",
    ]);
    expect(plan[1]?.env.MILADY_ELIZA_SOURCE).toBe("local");
  });

  it("deduplicates profiles while preserving install order", () => {
    const plan = buildInstallPlan(["local", "packages", "all"], []);

    expect(plan.map((step) => step.id)).toEqual(["packages", "local"]);
  });

  it("parses comma separated profile lists", () => {
    expect(parseInstallProfileList("packages, local all")).toEqual([
      "packages",
      "local",
      "all",
    ]);
  });

  it("toggles the focused profile with space", () => {
    const state = applyInstallProfileKey(
      { cursor: 1, selectedIds: ["packages"] },
      " ",
    );

    expect(state.selectedIds).toEqual(["packages", "local"]);
  });

  it("moves with arrow keys and renders space bar instructions", () => {
    const state = applyInstallProfileKey(
      { cursor: 0, selectedIds: ["packages"] },
      "\u001b[B",
    );

    expect(state.cursor).toBe(1);
    expect(renderInstallProfilePrompt(state)).toContain(
      "Space to select, Enter to install",
    );
  });
});
