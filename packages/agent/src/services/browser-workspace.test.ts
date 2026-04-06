import { afterEach, describe, expect, it, vi } from "vitest";
import {
  closeBrowserWorkspaceTab,
  evaluateBrowserWorkspaceTab,
  getBrowserWorkspaceMode,
  getBrowserWorkspaceSnapshot,
  isBrowserWorkspaceBridgeConfigured,
  listBrowserWorkspaceTabs,
  openBrowserWorkspaceTab,
  resolveBrowserWorkspaceBridgeConfig,
} from "./browser-workspace";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("browser-workspace service", () => {
  it("detects when the desktop bridge is unavailable", () => {
    expect(
      resolveBrowserWorkspaceBridgeConfig({
        MILADY_BROWSER_WORKSPACE_URL: "",
      } as NodeJS.ProcessEnv),
    ).toBeNull();
    expect(
      isBrowserWorkspaceBridgeConfigured({
        MILADY_BROWSER_WORKSPACE_URL: "",
      } as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(getBrowserWorkspaceMode({} as NodeJS.ProcessEnv)).toBe("web");
  });

  it("falls back to an in-process web workspace when no bridge config is present", async () => {
    expect(await listBrowserWorkspaceTabs({} as NodeJS.ProcessEnv)).toEqual([]);

    const tab = await openBrowserWorkspaceTab(
      { show: true, url: "https://example.com" },
      {} as NodeJS.ProcessEnv,
    );

    expect(tab.id).toBe("btab_1");

    await expect(
      evaluateBrowserWorkspaceTab(
        { id: tab.id, script: "document.title" },
        {} as NodeJS.ProcessEnv,
      ),
    ).rejects.toThrow(
      "Milady browser workspace eval is only available in the desktop app.",
    );

    await expect(
      getBrowserWorkspaceSnapshot({} as NodeJS.ProcessEnv),
    ).resolves.toMatchObject({
      mode: "web",
      tabs: [{ id: "btab_1", visible: true }],
    });
  });

  it("serialises concurrent web-mode tab mutations without corruption", async () => {
    const env = {} as NodeJS.ProcessEnv;

    // Fire 10 concurrent opens — without the mutex, nextId and tabs could corrupt.
    const opens = Array.from({ length: 10 }, (_, i) =>
      openBrowserWorkspaceTab(
        { show: false, url: `https://example.com/${i}` },
        env,
      ),
    );
    const tabs = await Promise.all(opens);

    // Every tab must have a unique id.
    const ids = new Set(tabs.map((t) => t.id));
    expect(ids.size).toBe(10);

    // All 10 tabs must be present in the snapshot.
    const snapshot = await getBrowserWorkspaceSnapshot(env);
    // Snapshot includes tabs from prior tests in this suite (module-level
    // singleton), so just verify our 10 are present.
    for (const tab of tabs) {
      expect(snapshot.tabs.some((t) => t.id === tab.id)).toBe(true);
    }

    // Clean up so subsequent tests aren't affected.
    for (const tab of tabs) {
      await closeBrowserWorkspaceTab(tab.id, env);
    }
  });

  it("sends bearer auth when opening a tab", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tab: {
          id: "btab_1",
          title: "Milady Browser",
          url: "https://example.com",
          partition: "persist:milady-browser",
          visible: false,
          createdAt: "2026-04-05T00:00:00.000Z",
          updatedAt: "2026-04-05T00:00:00.000Z",
          lastFocusedAt: null,
        },
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const tab = await openBrowserWorkspaceTab({ url: "https://example.com" }, {
      MILADY_BROWSER_WORKSPACE_URL: "http://127.0.0.1:31340",
      MILADY_BROWSER_WORKSPACE_TOKEN: "secret",
    } as NodeJS.ProcessEnv);

    expect(tab.id).toBe("btab_1");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer secret",
    );
  });
});
