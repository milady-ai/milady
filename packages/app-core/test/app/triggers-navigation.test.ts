import {
  ALL_TAB_GROUPS,
  APPS_ENABLED,
  APPS_TOOL_TABS,
  pathForTab,
  tabFromPath,
  titleForTab,
} from "@miladyai/app-core/navigation";
import { describe, expect, test } from "vitest";

describe("navigation", () => {
  test("resolves path and title for advanced tabs and triggers", () => {
    expect(pathForTab("advanced")).toBe("/advanced");
    // /advanced is a legacy alias that now resolves to fine-tuning
    expect(tabFromPath("/advanced")).toBe("fine-tuning");
    expect(titleForTab("advanced")).toBe("Fine-Tuning");

    expect(pathForTab("trajectories")).toBe("/trajectories");
    expect(tabFromPath("/trajectories")).toBe("trajectories");
    expect(titleForTab("trajectories")).toBe("Trajectories");

    expect(pathForTab("voice")).toBe("/voice");
    expect(tabFromPath("/voice")).toBe("settings");
    expect(titleForTab("voice")).toBe("Voice");

    expect(pathForTab("runtime")).toBe("/runtime");
    expect(tabFromPath("/runtime")).toBe("runtime");
    expect(titleForTab("runtime")).toBe("Runtime");

    expect(pathForTab("fine-tuning")).toBe("/fine-tuning");
    expect(tabFromPath("/fine-tuning")).toBe("fine-tuning");
    expect(titleForTab("fine-tuning")).toBe("Fine-Tuning");

    expect(pathForTab("triggers")).toBe("/triggers");
    expect(tabFromPath("/triggers")).toBe("triggers");
    expect(titleForTab("triggers")).toBe("Heartbeats");
  });

  test("promotes heartbeats to a top-level group and keeps other tools in Apps", () => {
    const settings = ALL_TAB_GROUPS.find((group) => group.label === "Settings");
    expect(settings).toBeDefined();
    // Connectors merged into Settings group
    expect(settings?.tabs).toEqual(["settings", "connectors"]);

    const heartbeats = ALL_TAB_GROUPS.find(
      (group) => group.label === "Heartbeats",
    );
    expect(heartbeats).toBeDefined();
    expect(heartbeats?.tabs).toEqual(["triggers"]);

    // "Advanced" group was replaced by "Apps" which includes all tool tabs
    const apps = ALL_TAB_GROUPS.find((group) => group.label === "Apps");
    expect(apps).toBeDefined();
    expect(apps?.tabs).toContain("apps");
    expect(apps?.tabs).toContain("plugins");
    expect(apps?.tabs).toContain("skills");
    expect(apps?.tabs).toContain("fine-tuning");
    expect(apps?.tabs).toContain("trajectories");
    expect(apps?.tabs).toContain("runtime");
    expect(apps?.tabs).toContain("database");
    expect(apps?.tabs).toContain("logs");
    // "advanced" is a legacy hidden alias within Apps
    expect(apps?.tabs).toContain("advanced");
    // triggers live in their own Heartbeats group, not in Apps
    expect(apps?.tabs).not.toContain("triggers");
  });

  test("hides Voice from top-level header groups", () => {
    const voice = ALL_TAB_GROUPS.find((group) => group.label === "Voice");
    expect(voice).toBeUndefined();
  });

  test("keeps /game as a legacy redirect to apps", () => {
    expect(tabFromPath("/game")).toBe(APPS_ENABLED ? "apps" : "chat");
  });

  test("keeps /agent as a legacy redirect to character", () => {
    expect(tabFromPath("/agent")).toBe("character");
  });

  test("routes /connectors to connectors tab", () => {
    expect(pathForTab("connectors")).toBe("/connectors");
    expect(tabFromPath("/connectors")).toBe("connectors");
    expect(titleForTab("connectors")).toBe("Connectors");
  });

  test("routes /inventory and keeps legacy /wallets redirect", () => {
    expect(pathForTab("inventory")).toBe("/inventory");
    expect(tabFromPath("/inventory")).toBe("inventory");
    expect(tabFromPath("/wallets")).toBe("inventory");
    expect(titleForTab("inventory")).toBe("Inventory");
  });

  test("Apps group includes apps entry plus all tool tabs", () => {
    const apps = ALL_TAB_GROUPS.find((group) => group.label === "Apps");
    expect(apps).toBeDefined();
    expect(apps?.tabs).toEqual(["apps", ...APPS_TOOL_TABS]);
  });

  test("keeps inventory/knowledge/character as top-level groups, connectors in settings, and heartbeats in the main nav", () => {
    const labels = ALL_TAB_GROUPS.map((group) => group.label);
    expect(labels).toContain("Character");
    expect(labels).toContain("Inventory");
    expect(labels).toContain("Knowledge");
    // Connectors merged into Settings — no standalone group
    expect(labels).not.toContain("Connectors");
    expect(labels).toContain("Heartbeats");
    expect(labels).not.toContain("Tasks");
    expect(labels).not.toContain("Triggers");
    // No standalone Advanced group — tools now live under Apps
    expect(labels).not.toContain("Advanced");
    const settings = ALL_TAB_GROUPS.find((group) => group.label === "Settings");
    expect(settings?.tabs).toEqual(["settings", "connectors"]);
    const heartbeats = ALL_TAB_GROUPS.find(
      (group) => group.label === "Heartbeats",
    );
    expect(heartbeats?.tabs).toEqual(["triggers"]);
    expect(labels).not.toContain("Agent");
  });
});
