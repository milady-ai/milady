/**
 * Tests for ensurePluginManagerAllowed — the function that auto-enables
 * plugin-plugin-manager in the user's config so dashboard plugin installs work.
 *
 * Separate file so config module mocks don't interfere with eliza.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock config module before importing eliza.ts ────────────────────────

const { consoleInfoMock, mockLoadElizaConfig, mockSaveElizaConfig } =
  vi.hoisted(() => ({
    consoleInfoMock: vi.fn(),
    mockLoadElizaConfig: vi.fn(),
    mockSaveElizaConfig: vi.fn(),
  }));

// Mock config module used by plugin-manager-guard.ts
vi.mock("@miladyai/agent/config/config", () => ({
  loadElizaConfig: (...args: unknown[]) => mockLoadElizaConfig(...args),
  saveElizaConfig: (...args: unknown[]) => mockSaveElizaConfig(...args),
}));

import {
  _resetPluginManagerChecked,
  ensurePluginManagerAllowed,
} from "../../src/runtime/plugin-manager-guard";

describe("ensurePluginManagerAllowed", () => {
  const prevEnv = process.env.MILADY_DISABLE_PLUGIN_MANAGER_AUTO_ENABLE;
  const originalWindow = globalThis.window;

  beforeEach(() => {
    _resetPluginManagerChecked();
    consoleInfoMock.mockReset();
    mockLoadElizaConfig.mockReset();
    mockSaveElizaConfig.mockReset();
    delete process.env.MILADY_DISABLE_PLUGIN_MANAGER_AUTO_ENABLE;
    vi.spyOn(console, "info").mockImplementation((...args: unknown[]) =>
      consoleInfoMock(...args),
    );
    delete (globalThis as { window?: Window }).window;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (prevEnv !== undefined) {
      process.env.MILADY_DISABLE_PLUGIN_MANAGER_AUTO_ENABLE = prevEnv;
    } else {
      delete process.env.MILADY_DISABLE_PLUGIN_MANAGER_AUTO_ENABLE;
    }
    if (originalWindow !== undefined) {
      globalThis.window = originalWindow;
    } else {
      delete (globalThis as { window?: Window }).window;
    }
  });

  it("writes plugin-manager entry when absent", async () => {
    const config = { plugins: { entries: {} } };
    mockLoadElizaConfig.mockReturnValue(config);

    await expect(ensurePluginManagerAllowed()).resolves.toBe("enabled");
    expect(mockSaveElizaConfig).toHaveBeenCalledTimes(1);
    const saved = mockSaveElizaConfig.mock.calls[0][0];
    expect(saved.plugins.entries["plugin-manager"]).toEqual({ enabled: true });
    expect(consoleInfoMock).toHaveBeenCalledWith(
      "[milady] Auto-enabled plugin-manager for dashboard plugin installs. " +
        "Set MILADY_DISABLE_PLUGIN_MANAGER_AUTO_ENABLE=1 to prevent this.",
    );
  });

  it("skips write when plugin-manager already present", async () => {
    mockLoadElizaConfig.mockReturnValue({
      plugins: { entries: { "plugin-manager": { enabled: true } } },
    });

    await expect(ensurePluginManagerAllowed()).resolves.toBe("already-enabled");
    expect(mockSaveElizaConfig).not.toHaveBeenCalled();
  });

  it("respects user opt-out (enabled: false)", async () => {
    mockLoadElizaConfig.mockReturnValue({
      plugins: { entries: { "plugin-manager": { enabled: false } } },
    });

    await expect(ensurePluginManagerAllowed()).resolves.toBe(
      "disabled-by-user",
    );
    expect(mockSaveElizaConfig).not.toHaveBeenCalled();
  });

  it("skips config read on second call (in-process guard)", async () => {
    mockLoadElizaConfig.mockReturnValue({
      plugins: { entries: { "plugin-manager": { enabled: true } } },
    });

    await expect(ensurePluginManagerAllowed()).resolves.toBe("already-enabled");
    await expect(ensurePluginManagerAllowed()).resolves.toBe("already-enabled");

    expect(mockLoadElizaConfig).toHaveBeenCalledTimes(1);
  });

  it("skips entirely when MILADY_DISABLE_PLUGIN_MANAGER_AUTO_ENABLE=1", async () => {
    process.env.MILADY_DISABLE_PLUGIN_MANAGER_AUTO_ENABLE = "1";

    await expect(ensurePluginManagerAllowed()).resolves.toBe("disabled-by-env");
    expect(mockLoadElizaConfig).not.toHaveBeenCalled();
    expect(mockSaveElizaConfig).not.toHaveBeenCalled();
  });

  it("returns a non-fatal error in renderer/browser environments", async () => {
    (globalThis as { window?: object }).window = {};

    await expect(ensurePluginManagerAllowed()).resolves.toBe("error");
    expect(mockLoadElizaConfig).not.toHaveBeenCalled();
    expect(mockSaveElizaConfig).not.toHaveBeenCalled();
  });
});
