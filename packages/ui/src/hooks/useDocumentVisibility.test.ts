import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useDocumentVisibility, useIntervalWhenDocumentVisible } from "./useDocumentVisibility";

describe("useDocumentVisibility", () => {
  it("returns true by default (jsdom visibilityState is visible)", () => {
    const { result } = renderHook(() => useDocumentVisibility());
    expect(result.current).toBe(true);
  });
});

describe("useIntervalWhenDocumentVisible", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls callback at interval when document is visible", () => {
    const callback = vi.fn();

    renderHook(() => useIntervalWhenDocumentVisible(callback, 100));

    expect(callback).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(callback).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(callback).toHaveBeenCalledTimes(2);

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(callback).toHaveBeenCalledTimes(3);
  });
});
