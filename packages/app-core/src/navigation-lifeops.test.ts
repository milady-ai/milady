import {
  ALL_TAB_GROUPS,
  pathForTab,
  tabFromPath,
  titleForTab,
} from "@miladyai/app-core/navigation";
import { describe, expect, it } from "vitest";

describe("LifeOps navigation", () => {
  it("maps the LifeOps tab to its route", () => {
    expect(tabFromPath("/lifeops")).toBe("lifeops");
    expect(pathForTab("lifeops")).toBe("/lifeops");
  });

  it("groups LifeOps under Apps instead of a dedicated top-level tab", () => {
    expect(ALL_TAB_GROUPS.some((entry) => entry.label === "LifeOps")).toBe(
      false,
    );
    const appsGroup = ALL_TAB_GROUPS.find((entry) => entry.label === "Apps");
    expect(appsGroup?.tabs).toContain("lifeops");
  });

  it("returns a human-friendly LifeOps title", () => {
    expect(titleForTab("lifeops")).toBe("LifeOps");
  });
});
