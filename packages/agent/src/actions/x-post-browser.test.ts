import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as browserWorkspace from "../services/browser-workspace";
import { postToXBrowserAction } from "./x-post-browser";

const ORIGINAL_ENV = { ...process.env };

function makeMessage(text: string) {
  return {
    content: { text },
  } as never;
}

async function callHandler(text: string, params?: Record<string, unknown>) {
  return postToXBrowserAction.handler?.(
    {} as never,
    makeMessage(text),
    {} as never,
    params ? ({ parameters: params } as never) : undefined,
  );
}

describe("postToXBrowserAction", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.X_BROWSER_DRY_RUN;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  it("validates only explicit X/Twitter posting intents", async () => {
    await expect(
      postToXBrowserAction.validate?.(
        {} as never,
        makeMessage("post to x hello"),
      ),
    ).resolves.toBe(true);
    await expect(
      postToXBrowserAction.validate?.(
        {} as never,
        makeMessage("hello botdick"),
      ),
    ).resolves.toBe(false);
  });

  it("blocks when the desktop browser bridge is unavailable", async () => {
    vi.spyOn(
      browserWorkspace,
      "isBrowserWorkspaceBridgeConfigured",
    ).mockReturnValue(false);

    const result = await callHandler("post to x hello world");

    expect(result).toMatchObject({
      success: false,
      values: { error: "BROWSER_BRIDGE_UNAVAILABLE" },
    });
  });

  it("prepares a draft without clicking Post when browser dry-run is on", async () => {
    process.env.X_BROWSER_DRY_RUN = "true";
    vi.spyOn(
      browserWorkspace,
      "isBrowserWorkspaceBridgeConfigured",
    ).mockReturnValue(true);
    const executeSpy = vi
      .spyOn(browserWorkspace, "executeBrowserWorkspaceCommand")
      .mockResolvedValueOnce({
        mode: "desktop",
        subaction: "open",
        tab: {
          id: "btab_1",
          title: "X Compose",
          url: "https://x.com/compose/post",
          partition: "persist:milady-browser",
          visible: true,
          createdAt: "2026-04-29T00:00:00.000Z",
          updatedAt: "2026-04-29T00:00:00.000Z",
          lastFocusedAt: "2026-04-29T00:00:00.000Z",
        },
      })
      .mockResolvedValueOnce({
        mode: "desktop",
        subaction: "wait",
        value: { ok: true },
      })
      .mockResolvedValueOnce({
        mode: "desktop",
        subaction: "eval",
        value: { ok: true },
      });

    const result = await callHandler("post to x hello world");

    expect(result).toMatchObject({
      success: true,
      values: { prepared: true, published: false },
    });
    expect(executeSpy).toHaveBeenCalledTimes(3);
  });

  it("opens X compose, fills text, and clicks Post when publishing", async () => {
    vi.spyOn(
      browserWorkspace,
      "isBrowserWorkspaceBridgeConfigured",
    ).mockReturnValue(true);
    const executeSpy = vi
      .spyOn(browserWorkspace, "executeBrowserWorkspaceCommand")
      .mockResolvedValueOnce({
        mode: "desktop",
        subaction: "open",
        tab: {
          id: "btab_1",
          title: "X Compose",
          url: "https://x.com/compose/post",
          partition: "persist:milady-browser",
          visible: true,
          createdAt: "2026-04-29T00:00:00.000Z",
          updatedAt: "2026-04-29T00:00:00.000Z",
          lastFocusedAt: "2026-04-29T00:00:00.000Z",
        },
      })
      .mockResolvedValueOnce({
        mode: "desktop",
        subaction: "wait",
        value: { ok: true },
      })
      .mockResolvedValueOnce({
        mode: "desktop",
        subaction: "eval",
        value: { ok: true },
      })
      .mockResolvedValueOnce({
        mode: "desktop",
        subaction: "eval",
        value: { clicked: true },
      });

    const result = await callHandler("tweet this", {
      text: "live browser post",
      publish: true,
    });

    expect(result).toMatchObject({
      success: true,
      values: { published: true },
    });
    expect(executeSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        subaction: "open",
        url: "https://x.com/compose/post",
      }),
    );
    expect(executeSpy).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        subaction: "eval",
        script: expect.stringContaining("live browser post"),
      }),
    );
    expect(executeSpy).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        subaction: "eval",
        script: expect.stringContaining("tweetButton"),
      }),
    );
  });
});
