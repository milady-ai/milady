import { describe, expect, it } from "vitest";
import {
  buildJsDelivrAssetBase,
  buildManagedAssetUrl,
  buildRawGitHubAssetBase,
  resolveMiladyAssetBaseUrls,
  resolveMiladyAssetRepository,
  resolveMiladyReleaseTag,
  shouldUseRawGitHubAssetHost,
} from "./lib/asset-cdn.mjs";

describe("asset-cdn", () => {
  it("normalizes explicit release tags from workflow context", () => {
    expect(
      resolveMiladyReleaseTag({
        env: { MILADY_RELEASE_TAG: "2.0.0-alpha.131" },
      }),
    ).toBe("v2.0.0-alpha.131");
    expect(
      resolveMiladyReleaseTag({
        env: { RELEASE_TAG: "v2.0.0-alpha.131" },
      }),
    ).toBe("v2.0.0-alpha.131");
  });

  it("does not fall back to package.json when release context is missing", () => {
    expect(resolveMiladyReleaseTag({ env: {} })).toBeNull();
    expect(resolveMiladyAssetRepository({ env: {} })).toBe("milady-ai/milady");
    expect(resolveMiladyAssetBaseUrls({ env: {} })).toEqual({
      releaseTag: null,
      appAssetBaseUrl: "",
      homepageAssetBaseUrl: "",
    });
  });

  it("builds jsDelivr asset bases from an explicit release tag", () => {
    expect(
      resolveMiladyAssetBaseUrls({
        env: { MILADY_RELEASE_TAG: "v2.0.0-alpha.131" },
      }),
    ).toEqual({
      releaseTag: "v2.0.0-alpha.131",
      appAssetBaseUrl:
        "https://cdn.jsdelivr.net/gh/milady-ai/milady@v2.0.0-alpha.131/apps/app/public/",
      homepageAssetBaseUrl:
        "https://cdn.jsdelivr.net/gh/milady-ai/milady@v2.0.0-alpha.131/apps/homepage/public/",
    });
  });

  it("prefers explicit asset base overrides when present", () => {
    expect(
      resolveMiladyAssetBaseUrls({
        env: {
          MILADY_RELEASE_TAG: "v2.0.0-alpha.131",
          MILADY_ASSET_BASE_URL: "https://cdn.example.com/app/",
          HOMEPAGE_ASSET_BASE_URL: "https://cdn.example.com/homepage/",
        },
      }),
    ).toEqual({
      releaseTag: "v2.0.0-alpha.131",
      appAssetBaseUrl: "https://cdn.example.com/app/",
      homepageAssetBaseUrl: "https://cdn.example.com/homepage/",
    });
  });

  it("uses the current Actions repository for fork validation runs", () => {
    expect(
      resolveMiladyAssetRepository({
        env: { GITHUB_REPOSITORY: "dutchiono/milady" },
      }),
    ).toBe("dutchiono/milady");
    expect(
      resolveMiladyAssetBaseUrls({
        env: {
          GITHUB_REPOSITORY: "dutchiono/milady",
          MILADY_RELEASE_TAG: "v2.0.0-alpha.131-cdn.1",
        },
      }),
    ).toEqual({
      releaseTag: "v2.0.0-alpha.131-cdn.1",
      appAssetBaseUrl:
        "https://cdn.jsdelivr.net/gh/dutchiono/milady@v2.0.0-alpha.131-cdn.1/apps/app/public/",
      homepageAssetBaseUrl:
        "https://cdn.jsdelivr.net/gh/dutchiono/milady@v2.0.0-alpha.131-cdn.1/apps/homepage/public/",
    });
  });

  it("returns empty jsDelivr bases when required fields are missing", () => {
    expect(
      buildJsDelivrAssetBase({ releaseTag: "", assetRoot: "apps/app/public" }),
    ).toBe("");
    expect(
      buildJsDelivrAssetBase({
        releaseTag: "v2.0.0-alpha.131",
        assetRoot: "",
      }),
    ).toBe("");
  });

  it("routes blocked world splats through raw GitHub for the same tagged release", () => {
    expect(shouldUseRawGitHubAssetHost("worlds/companion-day.spz")).toBe(true);
    expect(
      buildRawGitHubAssetBase({
        repository: "dutchiono/milady",
        releaseTag: "v2.0.0-alpha.131-cdn.1",
        assetRoot: "apps/app/public",
      }),
    ).toBe(
      "https://raw.githubusercontent.com/dutchiono/milady/v2.0.0-alpha.131-cdn.1/apps/app/public/",
    );
    expect(
      buildManagedAssetUrl({
        repository: "dutchiono/milady",
        releaseTag: "v2.0.0-alpha.131-cdn.1",
        assetRoot: "apps/app/public",
        assetPath: "worlds/companion-day.spz",
      }),
    ).toBe(
      "https://raw.githubusercontent.com/dutchiono/milady/v2.0.0-alpha.131-cdn.1/apps/app/public/worlds/companion-day.spz",
    );
    expect(
      buildManagedAssetUrl({
        repository: "dutchiono/milady",
        releaseTag: "v2.0.0-alpha.131-cdn.1",
        assetRoot: "apps/app/public",
        assetPath: "vrms/milady-1.vrm.gz",
      }),
    ).toBe(
      "https://cdn.jsdelivr.net/gh/dutchiono/milady@v2.0.0-alpha.131-cdn.1/apps/app/public/vrms/milady-1.vrm.gz",
    );
  });
});
