import { describe, expect, it } from "vitest";

import {
  type Tab,
  pathForTab,
  tabFromPath,
  getTabGroups,
  ALL_TAB_GROUPS,
} from "../navigation/index";

const ALL_TABS: Tab[] = [
  "chat",
  "companion",
  "stream",
  "apps",
  "character",
  "character-select",
  "wallets",
  "knowledge",
  "connectors",
  "triggers",
  "plugins",
  "skills",
  "actions",
  "advanced",
  "fine-tuning",
  "trajectories",
  "lifo",
  "voice",
  "runtime",
  "database",
  "desktop",
  "settings",
  "logs",
  "security",
];

describe("QA: Navigation", () => {
  describe("Tab count", () => {
    it("should have exactly 24 tabs defined", () => {
      expect(ALL_TABS).toHaveLength(24);
    });
  });

  describe("pathForTab", () => {
    it.each(ALL_TABS)(
      "returns a non-empty path for tab '%s'",
      (tab) => {
        const path = pathForTab(tab);
        expect(path).toBeTruthy();
        expect(typeof path).toBe("string");
        expect(path.length).toBeGreaterThan(0);
      },
    );

    it("prepends basePath when provided", () => {
      const path = pathForTab("chat", "/app");
      expect(path).toMatch(/^\/app/);
    });

    it("works without basePath (defaults to root)", () => {
      const path = pathForTab("chat");
      expect(path).toMatch(/^\//);
    });
  });

  describe("tabFromPath round-trip", () => {
    // Exclude voice (maps to settings), companion (may be disabled),
    // apps (APPS_ENABLED=false so getTabGroups filters it but tabFromPath still works),
    // desktop (no direct path mapping in some configs)
    const roundTripTabs = ALL_TABS.filter(
      (t) => t !== "voice" && t !== "companion" && t !== "desktop" && t !== "apps",
    );

    it.each(roundTripTabs)(
      "round-trips for tab '%s'",
      (tab) => {
        const path = pathForTab(tab);
        const resolved = tabFromPath(path);
        expect(resolved).toBe(tab);
      },
    );

    it("voice tab path resolves to settings (voice is a settings sub-tab)", () => {
      const path = pathForTab("voice");
      const resolved = tabFromPath(path);
      expect(resolved).toBe("settings");
    });

    it("round-trips with a custom basePath", () => {
      const basePath = "/dashboard";
      const path = pathForTab("wallets", basePath);
      const resolved = tabFromPath(path, basePath);
      expect(resolved).toBe("wallets");
    });
  });

  describe("tabFromPath edge cases", () => {
    it("root path '/' resolves to 'chat'", () => {
      const resolved = tabFromPath("/");
      expect(resolved).toBe("chat");
    });

    it("returns null for unknown paths", () => {
      const resolved = tabFromPath("/this-does-not-exist");
      expect(resolved).toBeNull();
    });

    it("handles trailing slashes", () => {
      const resolved = tabFromPath("/chat/");
      expect(resolved).toBe("chat");
    });
  });

  describe("Legacy path redirects", () => {
    // Only test legacy paths that are actually defined in LEGACY_PATHS
    it("/inventory resolves to 'wallets'", () => {
      expect(tabFromPath("/inventory")).toBe("wallets");
    });

    it("/agent resolves to 'character'", () => {
      expect(tabFromPath("/agent")).toBe("character");
    });

    it("/features resolves to 'plugins'", () => {
      expect(tabFromPath("/features")).toBe("plugins");
    });

    it("/admin resolves to 'advanced'", () => {
      expect(tabFromPath("/admin")).toBe("advanced");
    });

    it("/config resolves to 'settings'", () => {
      expect(tabFromPath("/config")).toBe("settings");
    });
  });

  describe("getTabGroups filtering", () => {
    it("returns tab groups as an array", () => {
      const groups = getTabGroups();
      expect(Array.isArray(groups)).toBe(true);
      expect(groups.length).toBeGreaterThan(0);
    });

    it("filters out Stream tab when streamEnabled is false", () => {
      const groups = getTabGroups(false);
      const allTabs = groups.flatMap((g) => g.tabs);
      expect(allTabs).not.toContain("stream");
    });

    it("includes Stream tab when streamEnabled is true", () => {
      const groups = getTabGroups(true);
      const allTabs = groups.flatMap((g) => g.tabs);
      expect(allTabs).toContain("stream");
    });

    it("ALL_TAB_GROUPS is defined and non-empty", () => {
      expect(ALL_TAB_GROUPS).toBeDefined();
      expect(Array.isArray(ALL_TAB_GROUPS)).toBe(true);
      expect(ALL_TAB_GROUPS.length).toBeGreaterThan(0);
    });
  });
});
