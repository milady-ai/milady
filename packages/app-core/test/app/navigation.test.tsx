import {
  ALL_TAB_GROUPS,
  pathForTab,
  tabFromPath,
  titleForTab,
} from "@miladyai/app-core/navigation";
import { describe, expect, it } from "vitest";

describe("navigation", () => {
  it("maps advanced tab to path and title", () => {
    expect(pathForTab("advanced")).toBe("/advanced");
    expect(tabFromPath("/advanced")).toBe("advanced");
    expect(titleForTab("advanced")).toBe("Advanced");
  });

  it("includes database and logs in the advanced tab group", () => {
    const advancedGroup = ALL_TAB_GROUPS.find(
      (group) => group.label === "Advanced",
    );
    expect(advancedGroup?.tabs).toContain("database");
    expect(advancedGroup?.tabs).toContain("logs");
  });
});
