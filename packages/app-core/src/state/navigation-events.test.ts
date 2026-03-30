import { describe, expect, it, vi } from "vitest";
import { NavigationEventHub } from "./navigation-events";
import type { TabCommittedDetail } from "./types";

describe("NavigationEventHub", () => {
  it("notifies subscribers with detail", () => {
    const hub = new NavigationEventHub();
    const listener = vi.fn();
    hub.subscribe(listener);
    const detail: TabCommittedDetail = {
      tab: "chat",
      previousTab: "companion",
      uiShellMode: "native",
    };
    hub.emit(detail);
    expect(listener).toHaveBeenCalledWith(detail);
  });

  it("unsubscribe removes listener", () => {
    const hub = new NavigationEventHub();
    const listener = vi.fn();
    const unsub = hub.subscribe(listener);
    unsub();
    hub.emit({
      tab: "settings",
      previousTab: null,
      uiShellMode: "native",
    });
    expect(listener).not.toHaveBeenCalled();
  });
});
