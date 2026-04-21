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

  it("exposes LifeOps as a top-level tab group", () => {
    const group = ALL_TAB_GROUPS.find((entry) => entry.label === "LifeOps");
    expect(group?.tabs).toEqual(["lifeops"]);
  });

  it("returns a human-friendly LifeOps title", () => {
    expect(titleForTab("lifeops")).toBe("LifeOps");
  });
});
