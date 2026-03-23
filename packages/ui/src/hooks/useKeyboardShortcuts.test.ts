import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useKeyboardShortcuts, formatShortcut } from "./useKeyboardShortcuts";

describe("useKeyboardShortcuts", () => {
  it("calls handler when matching key combo is pressed", () => {
    const handler = vi.fn();

    renderHook(() =>
      useKeyboardShortcuts([
        { key: "k", ctrl: true, handler, description: "test" },
      ]),
    );

    const event = new KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: true,
      bubbles: true,
    });
    window.dispatchEvent(event);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not call handler for non-matching key", () => {
    const handler = vi.fn();

    renderHook(() =>
      useKeyboardShortcuts([
        { key: "k", ctrl: true, handler, description: "test" },
      ]),
    );

    const event = new KeyboardEvent("keydown", {
      key: "j",
      ctrlKey: true,
      bubbles: true,
    });
    window.dispatchEvent(event);

    expect(handler).not.toHaveBeenCalled();
  });
});

describe("formatShortcut", () => {
  it("returns correct string for ctrl+shift+key", () => {
    expect(
      formatShortcut({ key: "k", ctrl: true, shift: true, description: "test" }),
    ).toBe("Ctrl+Shift+K");
  });

  it("returns correct string for meta+key", () => {
    expect(
      formatShortcut({ key: "s", meta: true, description: "save" }),
    ).toBe("Cmd+S");
  });

  it("returns correct string for single key", () => {
    expect(
      formatShortcut({ key: "Escape", description: "close" }),
    ).toBe("Escape");
  });
});
