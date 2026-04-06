// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileSignalsWeb } from "./web";

function setVisibilityState(state: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: state,
  });
}

describe("MobileSignalsWeb", () => {
  beforeEach(() => {
    setVisibilityState("visible");
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
  });

  it("returns health snapshots from the web fallback", async () => {
    const plugin = new MobileSignalsWeb();
    const signalEvents: unknown[] = [];

    expect(await plugin.checkPermissions()).toMatchObject({
      status: "not-applicable",
      canRequest: false,
      permissions: {
        sleep: false,
        biometrics: false,
      },
    });
    expect(await plugin.requestPermissions()).toMatchObject({
      status: "not-applicable",
      canRequest: false,
    });

    await plugin.addListener("signal", (event) => {
      signalEvents.push(event);
    });

    const startResult = await plugin.startMonitoring({
      emitInitial: true,
    });

    expect(startResult.enabled).toBe(true);
    expect(startResult.supported).toBe(true);
    expect(startResult.snapshot).toMatchObject({
      source: "mobile_device",
      state: "active",
    });
    expect(startResult.healthSnapshot).toMatchObject({
      source: "mobile_health",
      state: "idle",
      healthSource: "healthkit",
      permissions: {
        sleep: false,
        biometrics: false,
      },
    });

    expect(signalEvents).toHaveLength(2);
    expect(signalEvents[0]).toMatchObject({
      source: "mobile_device",
      state: "active",
    });
    expect(signalEvents[1]).toMatchObject({
      source: "mobile_health",
      state: "idle",
    });
  });

  it("stops monitoring and clears listeners", async () => {
    const plugin = new MobileSignalsWeb();
    await plugin.startMonitoring();

    const stopResult = await plugin.stopMonitoring();

    expect(stopResult).toEqual({ stopped: true });
    expect(await plugin.getSnapshot()).toMatchObject({
      supported: true,
      snapshot: {
        source: "mobile_device",
      },
      healthSnapshot: {
        source: "mobile_health",
      },
    });
  });
});
