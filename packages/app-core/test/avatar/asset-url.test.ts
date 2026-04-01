import { resolveApiUrl, resolveAppAssetUrl } from "@miladyai/app-core/utils";
import { beforeEach, describe, expect, it } from "vitest";
import { setBootConfig } from "@miladyai/app-core/config";

describe("resolveAppAssetUrl", () => {
  beforeEach(() => {
    setBootConfig({ branding: {} });
  });

  it("returns root-relative path when runtime URL context is unavailable", () => {
    expect(resolveAppAssetUrl("vrms/1.vrm")).toBe("/vrms/1.vrm");
    expect(resolveAppAssetUrl("/vrms/previews/milady-1.png")).toBe(
      "/vrms/previews/milady-1.png",
    );
  });

  it("passes through already-absolute URLs", () => {
    expect(resolveAppAssetUrl("blob:http://localhost/abc")).toBe(
      "blob:http://localhost/abc",
    );
    expect(resolveAppAssetUrl("data:text/plain,ok")).toBe("data:text/plain,ok");
    expect(resolveAppAssetUrl("https://cdn.example.com/a.vrm")).toBe(
      "https://cdn.example.com/a.vrm",
    );
  });

  it("prefers the configured CDN asset base for relative asset paths", () => {
    setBootConfig({
      branding: {},
      assetBaseUrl:
        "https://raw.githubusercontent.com/milady-ai/milady/v2.0.0-alpha.131/apps/app/public/",
    });
    expect(resolveAppAssetUrl("vrms/1.vrm")).toBe(
      "https://raw.githubusercontent.com/milady-ai/milady/v2.0.0-alpha.131/apps/app/public/vrms/1.vrm",
    );
  });

  it("resolves .spz files through the same raw GitHub base as all other assets", () => {
    setBootConfig({
      branding: {},
      assetBaseUrl:
        "https://raw.githubusercontent.com/milady-ai/milady/v2.0.0-alpha.131/apps/app/public/",
    });
    expect(resolveAppAssetUrl("worlds/companion-day.spz")).toBe(
      "https://raw.githubusercontent.com/milady-ai/milady/v2.0.0-alpha.131/apps/app/public/worlds/companion-day.spz",
    );
  });

  it("resolves file:// assets relative to index directory", () => {
    const url = resolveAppAssetUrl("/vrms/1.vrm", {
      currentUrl:
        "file:///Users/tester/Milady.app/Contents/Resources/app/dist/index.html",
      baseUrl: "./",
    });
    expect(url).toBe(
      "file:///Users/tester/Milady.app/Contents/Resources/app/dist/vrms/1.vrm",
    );
  });

  it("resolves custom-scheme assets using base path", () => {
    const url = resolveAppAssetUrl("animations/idle.glb", {
      currentUrl: "electrobun://-/chat",
      baseUrl: "./",
    });
    expect(url).toBe("electrobun://-/animations/idle.glb");
  });
});

// ---------------------------------------------------------------------------
// resolveApiUrl()
// ---------------------------------------------------------------------------

describe("resolveApiUrl", () => {
  beforeEach(() => {
    setBootConfig({ branding: {} });
    try {
      window.sessionStorage.removeItem("milady_api_base");
    } catch {
      /* no window */
    }
  });

  it("returns the path unchanged when apiBase is not set", () => {
    expect(resolveApiUrl("/api/avatar/vrm")).toBe("/api/avatar/vrm");
  });

  it("returns the path unchanged when window is undefined (SSR/Node)", () => {
    expect(resolveApiUrl("/api/avatar/vrm")).toBe("/api/avatar/vrm");
  });

  it("prefixes with apiBase when set", () => {
    setBootConfig({ branding: {}, apiBase: "http://localhost:2138" });
    expect(resolveApiUrl("/api/avatar/vrm")).toBe(
      "http://localhost:2138/api/avatar/vrm",
    );
  });

  it("handles empty string base gracefully (falsy → passthrough)", () => {
    setBootConfig({ branding: {}, apiBase: "" });
    expect(resolveApiUrl("/api/tts/elevenlabs")).toBe("/api/tts/elevenlabs");
  });
});
