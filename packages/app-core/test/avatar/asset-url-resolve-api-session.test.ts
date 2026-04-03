// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const DEFAULT_BOOT_CONFIG = {
  branding: {},
  cloudApiBase: "https://www.elizacloud.ai",
};

const bootConfigState: {
  current: {
    branding: Record<string, unknown>;
    cloudApiBase: string;
    apiBase?: string;
  };
} = {
  current: DEFAULT_BOOT_CONFIG,
};

async function loadResolveApiUrl() {
  vi.resetModules();
  vi.doMock("../../src/config/boot-config", () => ({
    DEFAULT_BOOT_CONFIG,
    getBootConfig: () => bootConfigState.current,
    setBootConfig: (config: typeof bootConfigState.current) => {
      bootConfigState.current = config;
    },
  }));
  const mod = await import("../../src/utils/asset-url");
  return mod.resolveApiUrl;
}

describe("resolveApiUrl (sessionStorage, jsdom)", () => {
  beforeEach(() => {
    bootConfigState.current = DEFAULT_BOOT_CONFIG;
    window.sessionStorage.removeItem("milady_api_base");
    const w = window as Window & {
      __MILADY_API_BASE__?: string;
      __ELIZA_API_BASE__?: string;
    };
    delete w.__MILADY_API_BASE__;
    delete w.__ELIZA_API_BASE__;
  });

  it("prefers injected api base over stale sessionStorage when boot is unset", async () => {
    const resolveApiUrl = await loadResolveApiUrl();
    window.sessionStorage.setItem(
      "milady_api_base",
      "http://127.0.0.1:31337",
    );
    const w = window as Window & { __MILADY_API_BASE__?: string };
    w.__MILADY_API_BASE__ = "http://127.0.0.1:41414";
    expect(resolveApiUrl("/api/tts/cloud")).toBe(
      "http://127.0.0.1:41414/api/tts/cloud",
    );
  });

  it("uses sessionStorage when boot apiBase is unset", async () => {
    const resolveApiUrl = await loadResolveApiUrl();
    window.sessionStorage.setItem(
      "milady_api_base",
      "http://127.0.0.1:40000",
    );
    expect(resolveApiUrl("/api/status")).toBe(
      "http://127.0.0.1:40000/api/status",
    );
  });

  it("keeps boot config ahead of sessionStorage", async () => {
    const resolveApiUrl = await loadResolveApiUrl();
    window.sessionStorage.setItem(
      "milady_api_base",
      "https://ren.example.com",
    );
    bootConfigState.current = {
      ...DEFAULT_BOOT_CONFIG,
      apiBase: "http://127.0.0.1:2138",
    };
    expect(resolveApiUrl("/api/status")).toBe(
      "http://127.0.0.1:2138/api/status",
    );
  });

  it("falls back to boot apiBase after injected and session values are absent", async () => {
    const resolveApiUrl = await loadResolveApiUrl();
    bootConfigState.current = {
      ...DEFAULT_BOOT_CONFIG,
      apiBase: "http://127.0.0.1:2138",
    };
    expect(resolveApiUrl("/api/tts/cloud")).toBe(
      "http://127.0.0.1:2138/api/tts/cloud",
    );
  });

  it("keeps boot config ahead of injected api base", async () => {
    const resolveApiUrl = await loadResolveApiUrl();
    const w = window as Window & { __MILADY_API_BASE__?: string };
    w.__MILADY_API_BASE__ = "http://127.0.0.1:31337";
    bootConfigState.current = {
      ...DEFAULT_BOOT_CONFIG,
      apiBase: "http://127.0.0.1:2138",
    };
    expect(resolveApiUrl("/api/tts/cloud")).toBe(
      "http://127.0.0.1:2138/api/tts/cloud",
    );
  });
});
