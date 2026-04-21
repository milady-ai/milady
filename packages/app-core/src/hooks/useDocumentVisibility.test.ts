// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  useDocumentVisibility,
  useIntervalWhenDocumentVisible,
} from "./useDocumentVisibility";

describe("useDocumentVisibility", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("updates when visibility changes", () => {
    const { result } = renderHook(() => useDocumentVisibility());
    expect(result.current).toBe(true);

    act(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current).toBe(false);
  });
});

describe("useIntervalWhenDocumentVisible", () => {
  it("does not fire when hidden", () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    renderHook(() => useIntervalWhenDocumentVisible(cb, 1000, true));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(cb).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("fires on interval when visible", () => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    const cb = vi.fn();
    renderHook(() => useIntervalWhenDocumentVisible(cb, 1000, true));
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(cb).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
