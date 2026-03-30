import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useTimeout } from "./useTimeout";

describe("useTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("setTimeout fires callback after delay", () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useTimeout());

    act(() => {
      result.current.setTimeout(callback, 1000);
    });

    expect(callback).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("clearTimeout cancels callback", () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useTimeout());

    let id: ReturnType<typeof setTimeout>;
    act(() => {
      id = result.current.setTimeout(callback, 1000);
    });

    act(() => {
      result.current.clearTimeout(id!);
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it("clears all timeouts on unmount", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const { result, unmount } = renderHook(() => useTimeout());

    act(() => {
      result.current.setTimeout(cb1, 500);
      result.current.setTimeout(cb2, 1000);
    });

    unmount();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).not.toHaveBeenCalled();
  });
});
