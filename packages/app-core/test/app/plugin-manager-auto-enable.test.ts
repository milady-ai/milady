/**
 * Tests for ensurePluginManagerAllowed — the function that auto-enables
 * plugin-plugin-manager in the user's config so dashboard plugin installs work.
 *
 * Separate file so config module mocks don't interfere with eliza.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock config module before importing eliza.ts ────────────────────────

const mockLoadElizaConfig = vi.fn();
const mockSaveElizaConfig = vi.fn();

// Mock config module used by plugin-manager-guard.ts
vi.mock("../../src/config/config.js", () => ({
  loadElizaConfig: (...args: unknown[]) => mockLoadElizaConfig(...args),
  saveElizaConfig: (...args: unknown[]) => mockSaveElizaConfig(...args),
}));

import {
  ensurePluginManagerAllowed,
  _resetPluginManagerChecked,
} from "../../src/runtime/plugin-manager-guard";

describe("ensurePluginManagerAllowed", () => {
  const prevEnv = process.env.MILADY_DISABLE_PLUGIN_MANAGER_AUTO_ENABLE;

  beforeEach(() => {
    _resetPluginManagerChecked();
    mockLoadElizaConfig.mockReset();
    mockSaveElizaConfig.mockReset();
    delete process.env.MILADY_DISABLE_PLUGIN_MANAGER_AUTO_ENABLE;
  });

  afterEach(() => {
    if (prevEnv !== undefined) {
      process.env.MILADY_DISABLE_PLUGIN_MANAGER_AUTO_ENABLE = prevEnv;
    } else {
      delete process.env.MILADY_DISABLE_PLUGIN_MANAGER_AUTO_ENABLE;
    }
  });

  it("writes plugin-manager entry when absent", () => {
    const config = { plugins: { entries: {} } };
    mockLoadElizaConfig.mockReturnValue(config);

    ensurePluginManagerAllowed();

    expect(mockSaveElizaConfig).toHaveBeenCalledTimes(1);
    const saved = mockSaveElizaConfig.mock.calls[0][0];
    expect(saved.plugins.entries["plugin-manager"]).toEqual({ enabled: true });
  });

  it("skips write when plugin-manager already present", () => {
    mockLoadElizaConfig.mockReturnValue({
      plugins: { entries: { "plugin-manager": { enabled: true } } },
    });

    ensurePluginManagerAllowed();

    expect(mockSaveElizaConfig).not.toHaveBeenCalled();
  });

  it("respects user opt-out (enabled: false)", () => {
    mockLoadElizaConfig.mockReturnValue({
      plugins: { entries: { "plugin-manager": { enabled: false } } },
    });

    ensurePluginManagerAllowed();

    expect(mockSaveElizaConfig).not.toHaveBeenCalled();
  });

  it("skips config read on second call (in-process guard)", () => {
    mockLoadElizaConfig.mockReturnValue({
      plugins: { entries: { "plugin-manager": { enabled: true } } },
    });

    ensurePluginManagerAllowed();
    ensurePluginManagerAllowed();

    expect(mockLoadElizaConfig).toHaveBeenCalledTimes(1);
  });

  it("skips entirely when MILADY_DISABLE_PLUGIN_MANAGER_AUTO_ENABLE=1", () => {
    process.env.MILADY_DISABLE_PLUGIN_MANAGER_AUTO_ENABLE = "1";

    ensurePluginManagerAllowed();

    expect(mockLoadElizaConfig).not.toHaveBeenCalled();
    expect(mockSaveElizaConfig).not.toHaveBeenCalled();
  });
});
