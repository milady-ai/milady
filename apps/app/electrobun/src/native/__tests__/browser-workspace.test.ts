import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const windowHandlers: Record<string, () => void> = {};
const evaluateJavascriptWithResponse = vi.fn();
const mockWindow = {
  webview: {
    loadURL: vi.fn(),
    rpc: {
      requestProxy: {
        evaluateJavascriptWithResponse,
      },
    },
  },
  getPosition: vi.fn(() => ({ x: 120, y: 90 })),
  getSize: vi.fn(() => ({ width: 1360, height: 920 })),
  setPosition: vi.fn(),
  show: vi.fn(),
  focus: vi.fn(),
  close: vi.fn(),
  on: vi.fn((event: string, handler: () => void) => {
    windowHandlers[event] = handler;
  }),
};

vi.mock("electrobun/bun", () => {
  // biome-ignore lint/complexity/useArrowFunction: constructor mock requires a regular function
  const BrowserWindow = vi.fn(function () {
    return { ...mockWindow };
  });
  return { BrowserWindow };
});

const { BrowserWorkspaceManager, resetBrowserWorkspaceManagerForTesting } =
  await import("../browser-workspace");
type BrowserWorkspaceManagerInstance = InstanceType<
  typeof BrowserWorkspaceManager
>;

function resetMocks() {
  vi.clearAllMocks();
  for (const key of Object.keys(windowHandlers)) {
    delete windowHandlers[key];
  }
}

describe("BrowserWorkspaceManager", () => {
  let manager: BrowserWorkspaceManagerInstance;

  beforeEach(() => {
    resetMocks();
    manager = new BrowserWorkspaceManager();
  });

  afterEach(() => {
    manager.dispose();
    resetBrowserWorkspaceManagerForTesting();
  });

  it("opens hidden tabs by default so they keep running in the background", async () => {
    const tab = await manager.openTab({ url: "https://example.com" });

    expect(tab.visible).toBe(false);
    expect(mockWindow.setPosition).not.toHaveBeenCalled();
  });

  it("shows a hidden tab by restoring its saved position", async () => {
    const tab = await manager.openTab({ url: "https://example.com" });

    const shown = await manager.showTab({ id: tab.id });

    expect(shown?.visible).toBe(true);
    expect(mockWindow.setPosition).toHaveBeenCalledWith(120, 90);
    expect(mockWindow.show).toHaveBeenCalled();
    expect(mockWindow.focus).toHaveBeenCalled();
  });

  it("navigates external http/https URLs", async () => {
    const tab = await manager.openTab({ url: "https://example.com" });

    const navigated = await manager.navigateTab({
      id: tab.id,
      url: "https://news.ycombinator.com",
    });

    expect(navigated?.url).toBe("https://news.ycombinator.com/");
    expect(mockWindow.webview.loadURL).toHaveBeenCalledWith(
      "https://news.ycombinator.com/",
    );
  });

  it("evaluates JavaScript inside the tab webview", async () => {
    evaluateJavascriptWithResponse.mockResolvedValueOnce({ title: "ok" });
    const tab = await manager.openTab({ url: "https://example.com" });

    const result = await manager.evaluateTab({
      id: tab.id,
      script: "document.title",
    });

    expect(result).toEqual({ title: "ok" });
    expect(evaluateJavascriptWithResponse).toHaveBeenCalledWith({
      script: "document.title",
    });
  });

  it("removes tabs when the native window closes", async () => {
    const tab = await manager.openTab({ url: "https://example.com" });
    expect((await manager.listTabs()).tabs).toHaveLength(1);

    windowHandlers.close?.();

    expect(manager.getTabSnapshot(tab.id)).toBeNull();
    expect((await manager.listTabs()).tabs).toHaveLength(0);
  });
});
