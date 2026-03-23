import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useClickOutside } from "./useClickOutside";

function makeRef(el: HTMLElement | null) {
  return { current: el };
}

describe("useClickOutside", () => {
  it("calls handler when clicking outside ref element", () => {
    const handler = vi.fn();
    const div = document.createElement("div");
    document.body.appendChild(div);
    const ref = makeRef(div);

    renderHook(() => useClickOutside(ref, handler));

    const outside = new MouseEvent("mousedown", { bubbles: true });
    document.dispatchEvent(outside);

    expect(handler).toHaveBeenCalledTimes(1);
    document.body.removeChild(div);
  });

  it("calls handler on Escape", () => {
    const handler = vi.fn();
    const div = document.createElement("div");
    document.body.appendChild(div);
    const ref = makeRef(div);

    renderHook(() => useClickOutside(ref, handler));

    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
    document.dispatchEvent(escape);

    expect(handler).toHaveBeenCalledTimes(1);
    document.body.removeChild(div);
  });

  it("does not call handler when clicking inside", () => {
    const handler = vi.fn();
    const div = document.createElement("div");
    document.body.appendChild(div);
    const ref = makeRef(div);

    renderHook(() => useClickOutside(ref, handler));

    const inside = new MouseEvent("mousedown", { bubbles: true });
    div.dispatchEvent(inside);

    expect(handler).not.toHaveBeenCalled();
    document.body.removeChild(div);
  });

  it("does not call handler when active=false", () => {
    const handler = vi.fn();
    const div = document.createElement("div");
    document.body.appendChild(div);
    const ref = makeRef(div);

    renderHook(() => useClickOutside(ref, handler, false));

    const outside = new MouseEvent("mousedown", { bubbles: true });
    document.dispatchEvent(outside);

    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
    document.dispatchEvent(escape);

    expect(handler).not.toHaveBeenCalled();
    document.body.removeChild(div);
  });
});
