// Import bridge entrypoints directly (not `bridge/index`): loading the barrel
// pulls `capacitor-bridge` first and Vitest can end up with inconsistent module
// instances so `getElectrobunRendererRpc()` and `isElectrobunRuntime()` disagree.

import { afterEach, describe, expect, it } from "vitest";
import { getElectrobunRendererRpc } from "../../../../packages/app-core/src/bridge/electrobun-rpc";
import {
  getBackendStartupTimeoutMs,
  isElectrobunRuntime,
} from "../../../../packages/app-core/src/bridge/electrobun-runtime";

const originalWindow = globalThis.window;

afterEach(() => {
  if (originalWindow === undefined) {
    // @ts-expect-error test cleanup for Node environment
    delete globalThis.window;
    return;
  }

  Object.defineProperty(globalThis, "window", {
    value: originalWindow,
    configurable: true,
    writable: true,
  });
});

describe("electrobun runtime detection", () => {
  it("detects Electrobun from injected window ids before the bridge marker exists", () => {
    Object.defineProperty(globalThis, "window", {
      value: { __electrobunWindowId: 7 },
      configurable: true,
      writable: true,
    });

    expect(isElectrobunRuntime()).toBe(true);
    expect(getBackendStartupTimeoutMs()).toBe(180_000);
  });

  it("falls back to the web timeout when Electrobun globals are absent", () => {
    Object.defineProperty(globalThis, "window", {
      value: {},
      configurable: true,
      writable: true,
    });

    expect(isElectrobunRuntime()).toBe(false);
    expect(getBackendStartupTimeoutMs()).toBe(30_000);
  });

  it("detects Electrobun from the injected webview id", () => {
    Object.defineProperty(globalThis, "window", {
      value: { __electrobunWebviewId: 11 },
      configurable: true,
      writable: true,
    });

    expect(isElectrobunRuntime()).toBe(true);
  });

  it("detects Electrobun when only the Milady renderer RPC bridge is present", () => {
    Object.defineProperty(globalThis, "window", {
      value: {
        __MILADY_ELECTROBUN_RPC__: {
          onMessage: () => {},
          offMessage: () => {},
          request: {},
        },
      },
      configurable: true,
      writable: true,
    });

    expect(getElectrobunRendererRpc()).toBeDefined();
    expect(isElectrobunRuntime()).toBe(true);
    expect(getBackendStartupTimeoutMs()).toBe(180_000);
  });
});
