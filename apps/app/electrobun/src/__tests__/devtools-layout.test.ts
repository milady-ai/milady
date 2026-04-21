import { describe, expect, it, vi } from "vitest";
import {
  DEVTOOLS_LAYOUT_REFRESH_DELAYS_MS,
  scheduleDevtoolsLayoutRefresh,
} from "../devtools-layout";

describe("scheduleDevtoolsLayoutRefresh", () => {
  it("reapplies the current frame on a short timer sequence", () => {
    const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
    const getFrame = vi.fn(() => ({ x: 10, y: 20, width: 1280, height: 860 }));
    const setFrame = vi.fn();

    scheduleDevtoolsLayoutRefresh(
      { getFrame, setFrame },
      (callback, delayMs) => {
        scheduled.push({ callback, delayMs });
        return delayMs;
      },
    );

    expect(scheduled.map((entry) => entry.delayMs)).toEqual([
      ...DEVTOOLS_LAYOUT_REFRESH_DELAYS_MS,
    ]);

    for (const entry of scheduled) {
      entry.callback();
    }

    expect(getFrame).toHaveBeenCalledTimes(1);
    expect(setFrame).toHaveBeenCalledTimes(
      DEVTOOLS_LAYOUT_REFRESH_DELAYS_MS.length,
    );
    expect(setFrame).toHaveBeenNthCalledWith(1, 10, 20, 1280, 860);
    expect(setFrame).toHaveBeenNthCalledWith(2, 10, 20, 1280, 859);
    expect(setFrame).toHaveBeenNthCalledWith(3, 10, 20, 1280, 860);
  });

  it("is a no-op when the window does not expose frame APIs", () => {
    expect(() => scheduleDevtoolsLayoutRefresh({})).not.toThrow();
    expect(() => scheduleDevtoolsLayoutRefresh(null)).not.toThrow();
  });
});
