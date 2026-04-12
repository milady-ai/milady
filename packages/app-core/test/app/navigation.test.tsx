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
    expect(tabFromPath("/advanced")).toBe("fine-tuning");
    expect(titleForTab("advanced")).toBe("Fine-Tuning");
  });

  it("maps database tab to path and title", () => {
    expect(pathForTab("database")).toBe("/database");
    expect(tabFromPath("/database")).toBe("database");
    expect(titleForTab("database")).toBe("Databases");
  });

  it("includes database, plugins, and logs in the Apps tab group", () => {
    const appsGroup = ALL_TAB_GROUPS.find(
      (group) => group.label === "Apps",
    );
    expect(appsGroup?.tabs).toContain("database");
    expect(appsGroup?.tabs).toContain("plugins");
    expect(appsGroup?.tabs).toContain("logs");
  });
});
