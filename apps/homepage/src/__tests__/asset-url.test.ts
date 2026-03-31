import { beforeEach, describe, expect, it, vi } from "vitest";

describe("resolveHomepageAssetUrl", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("uses generated raw GitHub release metadata when no env override is set", async () => {
    const { resolveHomepageAssetUrl } = await import("../lib/asset-url");
    expect(resolveHomepageAssetUrl("logo.png")).toContain(
      "/apps/homepage/public/logo.png",
    );
  });

  it("prefers a build-time asset base override when present", async () => {
    vi.stubEnv("VITE_ASSET_BASE_URL", "https://cdn.example.com/homepage/");
    const { resolveHomepageAssetUrl } = await import("../lib/asset-url");
    expect(resolveHomepageAssetUrl("vrms/previews/milady-1.png")).toBe(
      "https://cdn.example.com/homepage/vrms/previews/milady-1.png",
    );
    vi.unstubAllEnvs();
  });
});
