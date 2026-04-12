import {
  ALL_TAB_GROUPS,
  APPS_ENABLED,
  getTabGroups,
  isRouteRootPath,
  pathForTab,
  resolveInitialTabForPath,
  type Tab,
  tabFromPath,
  titleForTab,
} from "@miladyai/app-core/navigation";
import { describe, expect, it } from "vitest";

describe("tabFromPath", () => {
  it("maps core tabs", () => {
    expect(tabFromPath("/")).toBe("chat");
    expect(tabFromPath("/chat")).toBe("chat");
    expect(tabFromPath("/browser")).toBe("browser");
    expect(tabFromPath("/companion")).toBe("companion");
    expect(tabFromPath("/stream")).toBe("stream");
    expect(tabFromPath("/character")).toBe("character");
    expect(tabFromPath("/character-select")).toBe("character-select");
    expect(tabFromPath("/wallets")).toBe("inventory");
    expect(tabFromPath("/knowledge")).toBe("knowledge");
    expect(tabFromPath("/connectors")).toBe("connectors");
    expect(tabFromPath("/settings")).toBe("settings");
    expect(tabFromPath("/voice")).toBe("settings");
  });

  it("maps app-tool sub-tabs", () => {
    expect(tabFromPath("/advanced")).toBe("fine-tuning");
    expect(tabFromPath("/plugins")).toBe("plugins");
    expect(tabFromPath("/skills")).toBe("skills");
    expect(tabFromPath("/actions")).toBeNull();
    expect(tabFromPath("/triggers")).toBe("triggers");
    expect(tabFromPath("/fine-tuning")).toBe("fine-tuning");
    expect(tabFromPath("/trajectories")).toBe("trajectories");
    expect(tabFromPath("/relationships")).toBe("relationships");
    expect(tabFromPath("/runtime")).toBe("runtime");
    expect(tabFromPath("/database")).toBe("database");
    expect(tabFromPath("/logs")).toBe("logs");
  });

  it("maps legacy paths", () => {
    expect(tabFromPath("/game")).toBe(APPS_ENABLED ? "apps" : "chat");
    expect(tabFromPath("/agent")).toBe("character");
    expect(tabFromPath("/wallets")).toBe("inventory");
    expect(tabFromPath("/features")).toBe("plugins");
    expect(tabFromPath("/admin")).toBe("fine-tuning");
    expect(tabFromPath("/config")).toBe("settings");
  });

  it("is case-insensitive for current paths", () => {
    expect(tabFromPath("/ADVANCED")).toBe("fine-tuning");
    expect(tabFromPath("/Skills")).toBe("skills");
  });

  it("returns null for unknown paths", () => {
    expect(tabFromPath("/workflows")).toBeNull();
    expect(tabFromPath("/nonexistent")).toBeNull();
  });
});

describe("route roots", () => {
  it("treats only slash-root paths as the default landing route", () => {
    expect(isRouteRootPath("/")).toBe(true);
    expect(isRouteRootPath("/index.html")).toBe(true);
    expect(isRouteRootPath("/character")).toBe(false);
    expect(isRouteRootPath("/plugins")).toBe(false);
  });

  it("preserves explicit routed paths when resolving the initial tab", () => {
    expect(resolveInitialTabForPath("/", "companion")).toBe("companion");
    expect(resolveInitialTabForPath("/chat", "companion")).toBe("chat");
    expect(resolveInitialTabForPath("/character", "companion")).toBe(
      "character",
    );
    expect(resolveInitialTabForPath("/plugins", "companion")).toBe("plugins");
    expect(resolveInitialTabForPath("/runtime", "companion")).toBe("runtime");
    expect(resolveInitialTabForPath("/nonexistent", "companion")).toBe(
      "companion",
    );
  });
});

describe("pathForTab", () => {
  const roundTripTabs: Tab[] = [
    "chat",
    "browser",
    "companion",
    "stream",
    "character",
    "character-select",
    "inventory",
    "knowledge",
    "connectors",
    "plugins",
    "skills",
    "triggers",
    "fine-tuning",
    "trajectories",
    "relationships",
    "runtime",
    "database",
    "desktop",
    "settings",
    "logs",
  ];
  if (APPS_ENABLED) {
    roundTripTabs.splice(3, 0, "apps");
  }

  it("round-trips every routed tab through tabFromPath", () => {
    for (const tab of roundTripTabs) {
      const path = pathForTab(tab);
      expect(tabFromPath(path), `${tab} -> ${path}`).toBe(tab);
    }
  });

  it("applies basePath prefixes", () => {
    expect(pathForTab("chat", "/app")).toBe("/app/chat");
    expect(pathForTab("fine-tuning", "/app")).toBe("/app/fine-tuning");
  });
});

describe("tab groups", () => {
  it("includes Character as a top-level navigation group", () => {
    expect(ALL_TAB_GROUPS.map((group) => group.label)).toContain("Character");
    expect(getTabGroups(false).map((group) => group.label)).toContain(
      "Character",
    );
  });

  it("promotes heartbeats to a top-level group and keeps fine-tuning with apps", () => {
    const settings = ALL_TAB_GROUPS.find((group) => group.label === "Settings");
    expect(settings?.tabs).toEqual(["settings", "connectors"]);

    const apps = ALL_TAB_GROUPS.find((group) => group.label === "Apps");
    expect(apps?.tabs).toEqual([
      "apps",
      "lifeops",
      "plugins",
      "skills",
      "fine-tuning",
      "trajectories",
      "relationships",
      "memories",
      "runtime",
      "database",
      "logs",
      "advanced",
    ]);

    const heartbeats = ALL_TAB_GROUPS.find(
      (group) => group.label === "Heartbeats",
    );
    expect(heartbeats?.tabs).toEqual(["triggers"]);
    expect(ALL_TAB_GROUPS.map((group) => group.label)).not.toContain(
      "Advanced",
    );
  });

  it("keeps every supported tab in at least one group", () => {
    const groupedTabs = new Set(ALL_TAB_GROUPS.flatMap((group) => group.tabs));
    const expectedTabs: Tab[] = [
      "chat",
      "lifeops",
      "browser",
      "stream",
      "apps",
      "inventory",
      "knowledge",
      "plugins",
      "skills",
      "triggers",
      "fine-tuning",
      "trajectories",
      "relationships",
      "runtime",
      "database",
      "logs",
      "settings",
      "connectors",
    ];

    for (const tab of expectedTabs) {
      expect(groupedTabs.has(tab), `missing group for ${tab}`).toBe(true);
    }
  });

  it("drops the stream group when stream is disabled", () => {
    expect(getTabGroups(false).map((group) => group.label)).not.toContain(
      "Stream",
    );
    expect(getTabGroups(true).map((group) => group.label)).toContain("Stream");
  });

  it("shows Heartbeats in the visible top-level groups", () => {
    expect(getTabGroups(false).map((group) => group.label)).toContain(
      "Heartbeats",
    );
  });
});

describe("titleForTab", () => {
  it("returns human-friendly titles for representative tabs", () => {
    expect(titleForTab("chat")).toBe("Chat");
    expect(titleForTab("browser")).toBe("Browser");
    expect(titleForTab("advanced")).toBe("Fine-Tuning");
    expect(titleForTab("stream")).toBe("Stream");
    expect(titleForTab("database")).toBe("Databases");
    expect(titleForTab("relationships")).toBe("Relationships");
  });
});
