// @vitest-environment jsdom

import {
  alertDesktopMessage,
  confirmDesktopAction,
  copyTextToClipboard,
} from "@miladyai/app-core/utils";
import * as electrobunRpc from "@miladyai/app-core/bridge/electrobun-rpc";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

  // No custom globals needed

describe("desktop dialog and clipboard helpers", () => {
  beforeEach(() => {
    if (!navigator.clipboard) {
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: vi.fn().mockResolvedValue(undefined),
        },
        configurable: true,
      });
      return;
    }

    if (!navigator.clipboard.writeText) {
      Object.defineProperty(navigator.clipboard, "writeText", {
        value: vi.fn().mockResolvedValue(undefined),
        configurable: true,
      });
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses the Electrobun message-box RPC for confirm dialogs", async () => {
    const request = vi.fn().mockResolvedValue({ response: 0 });
    vi.stubGlobal("__MILADY_ELECTROBUN_RPC__", {
      request: { desktopShowMessageBox: request },
      onMessage: vi.fn(),
      offMessage: vi.fn(),
    });
    const confirmSpy = vi.spyOn(window, "confirm");

    await expect(
      confirmDesktopAction({
        title: "Delete Item",
        message: "Delete this item?",
      }),
    ).resolves.toBe(true);

    expect(request).toHaveBeenCalledWith({
      type: "question",
      title: "Delete Item",
      message: "Delete this item?",
      detail: undefined,
      buttons: ["Confirm", "Cancel"],
      defaultId: 0,
      cancelId: 1,
    });
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("treats bare numeric 0 from the message-box RPC as confirm (not falsy `if (response)`)", async () => {
    const request = vi.fn().mockResolvedValue(0);
    vi.stubGlobal("__MILADY_ELECTROBUN_RPC__", {
      request: { desktopShowMessageBox: request },
      onMessage: vi.fn(),
      offMessage: vi.fn(),
    });
    const confirmSpy = vi.spyOn(window, "confirm");

    await expect(
      confirmDesktopAction({
        title: "Disconnect",
        message: "OK?",
      }),
    ).resolves.toBe(true);

    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("parses nested RPC envelopes (data / result / payload)", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ data: { response: 0 } })
      .mockResolvedValueOnce({ result: { response: 1 } })
      .mockResolvedValueOnce({ payload: { response: 0 } });
    vi.stubGlobal("__MILADY_ELECTROBUN_RPC__", {
      request: { desktopShowMessageBox: request },
      onMessage: vi.fn(),
      offMessage: vi.fn(),
    });
    const confirmSpy = vi.spyOn(window, "confirm");

    await expect(
      confirmDesktopAction({ title: "A", message: "m" }),
    ).resolves.toBe(true);
    await expect(
      confirmDesktopAction({ title: "B", message: "m" }),
    ).resolves.toBe(false);
    await expect(
      confirmDesktopAction({ title: "C", message: "m" }),
    ).resolves.toBe(true);

    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("falls back to window.confirm on web", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    await expect(
      confirmDesktopAction({
        title: "Disconnect",
        message: "Disconnect now?",
      }),
    ).resolves.toBe(true);

    expect(confirmSpy).toHaveBeenCalledWith("Disconnect\n\nDisconnect now?");
  });

  it("uses the Electrobun message-box RPC for alerts", async () => {
    const request = vi.fn().mockResolvedValue({ response: 0 });
    vi.stubGlobal("__MILADY_ELECTROBUN_RPC__", {
      request: { desktopShowMessageBox: request },
      onMessage: vi.fn(),
      offMessage: vi.fn(),
    });
    const alertSpy = vi.spyOn(window, "alert");

    await expect(
      alertDesktopMessage({
        title: "Reset Failed",
        message: "Check the logs.",
        type: "error",
      }),
    ).resolves.toBeUndefined();

    expect(request).toHaveBeenCalledWith({
      type: "error",
      title: "Reset Failed",
      message: "Check the logs.",
      detail: undefined,
      buttons: ["OK"],
      defaultId: 0,
      cancelId: 0,
    });
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("uses the Electrobun clipboard RPC when available", async () => {
    const request = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("__MILADY_ELECTROBUN_RPC__", {
      request: { desktopWriteToClipboard: request },
      onMessage: vi.fn(),
      offMessage: vi.fn(),
    });
    const clipboardSpy = vi.spyOn(navigator.clipboard, "writeText");

    await copyTextToClipboard("eliza");

    expect(request).toHaveBeenCalledWith({
      text: "eliza",
    });
    expect(clipboardSpy).not.toHaveBeenCalled();
  });

  it("falls back to navigator.clipboard on web", async () => {
    const clipboardSpy = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);

    await copyTextToClipboard("desktopless");

    expect(clipboardSpy).toHaveBeenCalledWith("desktopless");
  });
});
