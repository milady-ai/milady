import { beforeEach, describe, expect, it, vi } from "vitest";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let agentDisposeDeferred = createDeferred<void>();

const agentManager = {
  dispose: vi.fn(() => agentDisposeDeferred.promise),
  setSendToWebview: vi.fn(),
};

function createSyncManager() {
  return {
    dispose: vi.fn(),
    setSendToWebview: vi.fn(),
    setMainWindow: vi.fn(),
  };
}

const cameraManager = createSyncManager();
const canvasManager = createSyncManager();
const desktopManager = createSyncManager();
const gatewayManager = createSyncManager();
const gpuWindowManager = createSyncManager();
const locationManager = createSyncManager();
const permissionManager = createSyncManager();
const screenCaptureManager = {
  ...createSyncManager(),
  setMainWebview: vi.fn(),
};
const swabbleManager = createSyncManager();
const talkModeManager = createSyncManager();

vi.mock("../agent", () => ({
  getAgentManager: () => agentManager,
}));
vi.mock("../camera", () => ({
  getCameraManager: () => cameraManager,
}));
vi.mock("../canvas", () => ({
  getCanvasManager: () => canvasManager,
}));
vi.mock("../desktop", () => ({
  getDesktopManager: () => desktopManager,
}));
vi.mock("../gateway", () => ({
  getGatewayDiscovery: () => gatewayManager,
}));
vi.mock("../gpu-window", () => ({
  getGpuWindowManager: () => gpuWindowManager,
}));
vi.mock("../location", () => ({
  getLocationManager: () => locationManager,
}));
vi.mock("../permissions", () => ({
  getPermissionManager: () => permissionManager,
}));
vi.mock("../screencapture", () => ({
  getScreenCaptureManager: () => screenCaptureManager,
}));
vi.mock("../swabble", () => ({
  getSwabbleManager: () => swabbleManager,
}));
vi.mock("../talkmode", () => ({
  getTalkModeManager: () => talkModeManager,
}));

import { disposeNativeModules } from "../index";

describe("native index disposal", () => {
  beforeEach(() => {
    agentDisposeDeferred = createDeferred<void>();
    agentManager.dispose.mockImplementation(() => agentDisposeDeferred.promise);
    for (const manager of [
      cameraManager,
      canvasManager,
      desktopManager,
      gatewayManager,
      gpuWindowManager,
      locationManager,
      permissionManager,
      screenCaptureManager,
      swabbleManager,
      talkModeManager,
    ]) {
      manager.dispose.mockReset();
      manager.dispose.mockImplementation(() => undefined);
    }
  });

  it("waits for async manager disposal before resolving", async () => {
    let settled = false;
    const disposePromise = disposeNativeModules().then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(agentManager.dispose).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);

    agentDisposeDeferred.resolve();
    await disposePromise;

    expect(settled).toBe(true);
    expect(cameraManager.dispose).toHaveBeenCalledTimes(1);
    expect(screenCaptureManager.dispose).toHaveBeenCalledTimes(1);
  });
});
