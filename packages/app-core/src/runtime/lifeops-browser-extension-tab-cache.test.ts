import type { LifeOpsBrowserSettings } from "@miladyai/shared/contracts/lifeops";
import { describe, expect, it } from "vitest";
import {
  findFocusedTab,
  mergeRememberedTabs,
  type RememberedTab,
  selectTabsForSync,
} from "../../../../apps/extensions/lifeops-browser/src/tab-cache";

function createSettings(
  overrides: Partial<LifeOpsBrowserSettings> = {},
): LifeOpsBrowserSettings {
  return {
    enabled: true,
    trackingMode: "active_tabs",
    allowBrowserControl: false,
    requireConfirmationForAccountAffecting: true,
    incognitoEnabled: false,
    siteAccessMode: "all_sites",
    grantedOrigins: [],
    blockedOrigins: [],
    maxRememberedTabs: 10,
    pauseUntil: null,
    metadata: {},
    updatedAt: null,
    ...overrides,
  };
}

function createTab(
  id: string,
  overrides: Partial<RememberedTab> = {},
): RememberedTab {
  return {
    browser: "chrome",
    profileId: "default",
    windowId: "1",
    tabId: id,
    url: `https://example.com/${id}`,
    title: `Tab ${id}`,
    activeInWindow: false,
    focusedWindow: false,
    focusedActive: false,
    incognito: false,
    faviconUrl: null,
    lastSeenAt: "2026-04-11T10:00:00.000Z",
    lastFocusedAt: null,
    metadata: {},
    ...overrides,
  };
}

describe("LifeOps Browser extension tab cache", () => {
  it("preserves lastFocusedAt when an open tab becomes inactive", () => {
    const previous = [
      createTab("a", {
        activeInWindow: true,
        focusedWindow: true,
        focusedActive: true,
        lastFocusedAt: "2026-04-11T10:00:00.000Z",
      }),
    ];
    const snapshot = [
      createTab("a", {
        activeInWindow: false,
        focusedWindow: false,
        focusedActive: false,
        lastSeenAt: "2026-04-11T10:05:00.000Z",
        lastFocusedAt: null,
      }),
    ];

    const merged = mergeRememberedTabs(previous, snapshot, 10);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.lastFocusedAt).toBe("2026-04-11T10:00:00.000Z");
  });

  it("syncs only the focused tab in current_tab mode", () => {
    const snapshot = [
      createTab("a", {
        activeInWindow: true,
        focusedWindow: false,
        focusedActive: false,
      }),
      createTab("b", {
        activeInWindow: true,
        focusedWindow: true,
        focusedActive: true,
      }),
      createTab("c"),
    ];

    const selected = selectTabsForSync({
      previous: [],
      snapshot,
      settings: createSettings({
        trackingMode: "current_tab",
      }),
      fallbackMaxRememberedTabs: 10,
    });

    expect(selected).toHaveLength(1);
    expect(selected[0]?.tabId).toBe("b");
    expect(findFocusedTab(selected)?.tabId).toBe("b");
  });

  it("filters blocked and incognito tabs while keeping active tabs first", () => {
    const snapshot = [
      createTab("1", {
        windowId: "1",
        url: "https://focus.example.com",
        activeInWindow: true,
        focusedWindow: true,
        focusedActive: true,
        lastSeenAt: "2026-04-11T10:03:00.000Z",
        lastFocusedAt: "2026-04-11T10:03:00.000Z",
      }),
      createTab("2", {
        windowId: "2",
        url: "https://active.example.com",
        activeInWindow: true,
        focusedWindow: false,
        focusedActive: false,
        lastSeenAt: "2026-04-11T10:02:00.000Z",
        lastFocusedAt: "2026-04-11T10:02:00.000Z",
      }),
      createTab("3", {
        windowId: "3",
        url: "https://blocked.example.com",
        lastSeenAt: "2026-04-11T10:01:00.000Z",
      }),
      createTab("4", {
        windowId: "4",
        url: "https://secret.example.com",
        incognito: true,
      }),
    ];

    const previous = [
      createTab("5", {
        windowId: "5",
        url: "https://recent.example.com",
        lastSeenAt: "2026-04-11T10:00:00.000Z",
        lastFocusedAt: "2026-04-11T10:00:00.000Z",
      }),
    ];

    const selected = selectTabsForSync({
      previous,
      snapshot,
      settings: createSettings({
        trackingMode: "active_tabs",
        blockedOrigins: ["https://blocked.example.com"],
        maxRememberedTabs: 3,
      }),
      fallbackMaxRememberedTabs: 10,
    });

    expect(selected.map((tab) => tab.tabId)).toEqual(["1", "2", "5"]);
  });
});
