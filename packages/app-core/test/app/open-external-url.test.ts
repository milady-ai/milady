// @vitest-environment jsdom

import { openExternalUrl } from "@miladyai/app-core/utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as electrobunRpc from "@miladyai/app-core/bridge/electrobun-rpc";

type BridgeWindow = Window & { __MILADY_ELECTROBUN_RPC__?: unknown };

describe("openExternalUrl", () => {
  beforeEach(() => {
    // Ensure no desktop bridge is present by default (web environment)
    delete (window as BridgeWindow).__MILADY_ELECTROBUN_RPC__;
    vi.spyOn(electrobunRpc, "getElectrobunRendererRpc").mockReturnValue(
      undefined,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as BridgeWindow).__MILADY_ELECTROBUN_RPC__;
    vi.restoreAllMocks();
  });

  it("uses the Electrobun desktop bridge when available", async () => {
    const request = vi.fn().mockResolvedValue(undefined);
    (window as BridgeWindow).__MILADY_ELECTROBUN_RPC__ = {
      request: { desktopOpenExternal: request },
      onMessage: vi.fn(),
      offMessage: vi.fn(),
    };
    const openSpy = vi.spyOn(window, "open");

    await openExternalUrl("https://claude.ai");

    expect(request).toHaveBeenCalledWith({
      url: "https://claude.ai",
    });
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("falls back to window.open on web", async () => {
    // No RPC bridge → invokeDesktopBridgeRequest returns null,
    // getElectrobunRendererRpc returns undefined → web fallback path.
    const popup = {} as Window;
    const openSpy = vi.spyOn(window, "open").mockReturnValue(popup);

    await expect(openExternalUrl("https://platform.openai.com")).resolves.toBe(
      undefined,
    );

    expect(openSpy).toHaveBeenCalledWith(
      "https://platform.openai.com",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("throws when the browser blocks the fallback popup", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);

    await expect(openExternalUrl("https://claude.ai")).rejects.toThrow(
      "Popup blocked. Allow popups and try again.",
    );
  });
});

