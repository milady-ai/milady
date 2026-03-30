// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
const isElectrobunMock = vi.fn();

vi.mock("../../bridge", () => ({
  invokeDesktopBridgeRequest: (...args: unknown[]) => invokeMock(...args),
  isElectrobunRuntime: () => isElectrobunMock(),
}));

import {
  isVrmBatteryPixelCapEnabled,
  refreshVrmDesktopBatteryPixelPolicy,
  VRM_BATTERY_PIXEL_CAP_STORAGE_KEY,
} from "./vrm-desktop-energy";

function stubEngine() {
  return {
    isInitialized: () => true,
    setLowPowerRenderMode: vi.fn(),
    setHalfFramerateMode: vi.fn(),
  };
}

function stubWindowLocalStorage(
  store: Record<string, string | null>,
): () => void {
  const fake: Storage = {
    get length() {
      return Object.keys(store).filter((k) => store[k] != null).length;
    },
    clear: vi.fn(),
    getItem: vi.fn((key: string) =>
      Object.hasOwn(store, key) ? (store[key] ?? null) : null,
    ),
    key: vi.fn(),
    removeItem: vi.fn(),
    setItem: vi.fn(),
  };
  const desc = Object.getOwnPropertyDescriptor(window, "localStorage");
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: fake,
  });
  return () => {
    if (desc) {
      Object.defineProperty(window, "localStorage", desc);
    } else {
      Reflect.deleteProperty(window, "localStorage");
    }
  };
}

describe("vrm-desktop-energy", () => {
  let restoreWindow: (() => void) | null = null;

  beforeEach(() => {
    invokeMock.mockReset();
    isElectrobunMock.mockReset();
    restoreWindow = stubWindowLocalStorage({});
  });

  afterEach(() => {
    restoreWindow?.();
    restoreWindow = null;
  });

  it("balanced + not Electrobun clears low-power and half-FPS (default half mode)", async () => {
    isElectrobunMock.mockReturnValue(false);
    const engine = stubEngine();
    await refreshVrmDesktopBatteryPixelPolicy(engine, {
      companionVrmPowerMode: "balanced",
    });
    expect(engine.setLowPowerRenderMode).toHaveBeenCalledWith(false);
    expect(engine.setHalfFramerateMode).toHaveBeenCalledWith(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("efficiency + not Electrobun sets low-power and half-FPS", async () => {
    isElectrobunMock.mockReturnValue(false);
    const engine = stubEngine();
    await refreshVrmDesktopBatteryPixelPolicy(engine, {
      companionVrmPowerMode: "efficiency",
    });
    expect(engine.setLowPowerRenderMode).toHaveBeenCalledWith(true);
    expect(engine.setHalfFramerateMode).toHaveBeenCalledWith(true);
  });

  it("quality + Electrobun + cap + onBattery clears low-power; half-FPS off by default", async () => {
    isElectrobunMock.mockReturnValue(true);
    invokeMock.mockResolvedValue({ onBattery: true });
    const engine = stubEngine();
    await refreshVrmDesktopBatteryPixelPolicy(engine, {
      companionVrmPowerMode: "quality",
    });
    expect(engine.setLowPowerRenderMode).toHaveBeenCalledWith(false);
    expect(engine.setHalfFramerateMode).toHaveBeenCalledWith(false);
  });

  it("efficiency + Electrobun + cap + AC sets low-power and half-FPS", async () => {
    isElectrobunMock.mockReturnValue(true);
    invokeMock.mockResolvedValue({ onBattery: false });
    const engine = stubEngine();
    await refreshVrmDesktopBatteryPixelPolicy(engine, {
      companionVrmPowerMode: "efficiency",
    });
    expect(engine.setLowPowerRenderMode).toHaveBeenCalledWith(true);
    expect(engine.setHalfFramerateMode).toHaveBeenCalledWith(true);
  });

  it("balanced + Electrobun + cap + onBattery sets low-power and half-FPS", async () => {
    isElectrobunMock.mockReturnValue(true);
    invokeMock.mockResolvedValue({ onBattery: true });
    const engine = stubEngine();
    await refreshVrmDesktopBatteryPixelPolicy(engine, {
      companionVrmPowerMode: "balanced",
    });
    expect(engine.setLowPowerRenderMode).toHaveBeenCalledWith(true);
    expect(engine.setHalfFramerateMode).toHaveBeenCalledWith(true);
  });

  it("balanced + Electrobun + cap + AC clears low-power and half-FPS", async () => {
    isElectrobunMock.mockReturnValue(true);
    invokeMock.mockResolvedValue({ onBattery: false });
    const engine = stubEngine();
    await refreshVrmDesktopBatteryPixelPolicy(engine, {
      companionVrmPowerMode: "balanced",
    });
    expect(engine.setLowPowerRenderMode).toHaveBeenCalledWith(false);
    expect(engine.setHalfFramerateMode).toHaveBeenCalledWith(false);
  });

  it("balanced default matches explicit balanced when on battery", async () => {
    isElectrobunMock.mockReturnValue(true);
    invokeMock.mockResolvedValue({ onBattery: true });
    const engine = stubEngine();
    await refreshVrmDesktopBatteryPixelPolicy(engine);
    expect(engine.setLowPowerRenderMode).toHaveBeenCalledWith(true);
    expect(engine.setHalfFramerateMode).toHaveBeenCalledWith(true);
  });

  it("Electrobun + storage disables cap uses mode quality vs efficiency only", async () => {
    restoreWindow?.();
    restoreWindow = stubWindowLocalStorage({
      [VRM_BATTERY_PIXEL_CAP_STORAGE_KEY]: "0",
    });
    isElectrobunMock.mockReturnValue(true);
    const engine = stubEngine();
    await refreshVrmDesktopBatteryPixelPolicy(engine, {
      companionVrmPowerMode: "balanced",
    });
    expect(invokeMock).not.toHaveBeenCalled();
    expect(engine.setLowPowerRenderMode).toHaveBeenCalledWith(false);
    expect(engine.setHalfFramerateMode).toHaveBeenCalledWith(false);

    const engine2 = stubEngine();
    await refreshVrmDesktopBatteryPixelPolicy(engine2, {
      companionVrmPowerMode: "efficiency",
    });
    expect(engine2.setLowPowerRenderMode).toHaveBeenCalledWith(true);
    expect(engine2.setHalfFramerateMode).toHaveBeenCalledWith(true);
  });

  it("half-FPS always can be on without low-power visuals", async () => {
    isElectrobunMock.mockReturnValue(true);
    invokeMock.mockResolvedValue({ onBattery: true });
    const engine = stubEngine();
    await refreshVrmDesktopBatteryPixelPolicy(engine, {
      companionVrmPowerMode: "quality",
      companionHalfFramerateMode: "always",
    });
    expect(engine.setLowPowerRenderMode).toHaveBeenCalledWith(false);
    expect(engine.setHalfFramerateMode).toHaveBeenCalledWith(true);
  });

  it("half-FPS off keeps full cadence even in efficiency", async () => {
    isElectrobunMock.mockReturnValue(false);
    const engine = stubEngine();
    await refreshVrmDesktopBatteryPixelPolicy(engine, {
      companionVrmPowerMode: "efficiency",
      companionHalfFramerateMode: "off",
    });
    expect(engine.setLowPowerRenderMode).toHaveBeenCalledWith(true);
    expect(engine.setHalfFramerateMode).toHaveBeenCalledWith(false);
  });

  it("isVrmBatteryPixelCapEnabled respects localStorage opt-out", () => {
    restoreWindow?.();
    restoreWindow = stubWindowLocalStorage({
      [VRM_BATTERY_PIXEL_CAP_STORAGE_KEY]: "0",
    });
    expect(isVrmBatteryPixelCapEnabled()).toBe(false);
  });
});
