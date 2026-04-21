import { describe, expect, it } from "vitest";
import {
  buildJsDelivrAssetBase,
  buildManagedAssetUrl,
  buildRawGitHubAssetBase,
  buildReleaseValidationAssetUrl,
  isCanonicalMiladyRepository,
  resolveMiladyAssetBaseUrls,
  resolveMiladyAssetRepository,
  resolveMiladyReleaseTag,
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

  it("builds raw GitHub asset bases from an explicit release tag", () => {
    expect(
      resolveMiladyAssetBaseUrls({
        env: { MILADY_RELEASE_TAG: "v2.0.0-alpha.131" },
      }),
    ).toEqual({
      releaseTag: "v2.0.0-alpha.131",
      appAssetBaseUrl:
        "https://cdn.jsdelivr.net/gh/milady-ai/milady@v2.0.0-alpha.131/apps/app/public/",
      homepageAssetBaseUrl:
        "https://cdn.jsdelivr.net/gh/milady-ai/milady@v2.0.0-alpha.131/apps/web/public/",
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

  it("uses the current Actions repository for fork builds", () => {
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
        "https://cdn.jsdelivr.net/gh/dutchiono/milady@v2.0.0-alpha.131-cdn.1/apps/web/public/",
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

  it("buildJsDelivrAssetBase still produces correct jsDelivr URLs for opt-in use", () => {
    expect(
      buildJsDelivrAssetBase({
        repository: "milady-ai/milady",
        releaseTag: "v2.0.0-alpha.131",
        assetRoot: "apps/app/public",
      }),
    ).toBe(
      "https://cdn.jsdelivr.net/gh/milady-ai/milady@v2.0.0-alpha.131/apps/app/public/",
    );
  });

  it("uses raw GitHub for all asset types uniformly via buildManagedAssetUrl", () => {
    expect(isCanonicalMiladyRepository("milady-ai/milady")).toBe(true);
    expect(isCanonicalMiladyRepository("dutchiono/milady")).toBe(false);
    expect(
      buildRawGitHubAssetBase({
        repository: "dutchiono/milady",
        releaseTag: "v2.0.0-alpha.131-cdn.1",
        assetRoot: "apps/app/public",
      }),
    ).toBe(
      "https://raw.githubusercontent.com/dutchiono/milady/v2.0.0-alpha.131-cdn.1/apps/app/public/",
    );

    // .spz files now use raw GitHub like everything else
    expect(
      buildManagedAssetUrl({
        repository: "milady-ai/milady",
        releaseTag: "v2.0.0-alpha.131",
        assetRoot: "apps/app/public",
        assetPath: "worlds/companion-day.spz",
      }),
    ).toBe(
      "https://raw.githubusercontent.com/milady-ai/milady/v2.0.0-alpha.131/apps/app/public/worlds/companion-day.spz",
    );

    // .vrm.gz files also use raw GitHub
    expect(
      buildManagedAssetUrl({
        repository: "dutchiono/milady",
        releaseTag: "v2.0.0-alpha.131-cdn.1",
        assetRoot: "apps/app/public",
        assetPath: "vrms/milady-1.vrm.gz",
      }),
    ).toBe(
      "https://raw.githubusercontent.com/dutchiono/milady/v2.0.0-alpha.131-cdn.1/apps/app/public/vrms/milady-1.vrm.gz",
    );

    // Validation URLs also use raw GitHub uniformly
    expect(
      buildReleaseValidationAssetUrl({
        repository: "dutchiono/milady",
        releaseTag: "v2.0.0-alpha.131-cdn.1",
        assetRoot: "apps/app/public",
        assetPath: "vrms/milady-1.vrm.gz",
      }),
    ).toBe(
      "https://raw.githubusercontent.com/dutchiono/milady/v2.0.0-alpha.131-cdn.1/apps/app/public/vrms/milady-1.vrm.gz",
    );
    expect(
      buildReleaseValidationAssetUrl({
        repository: "milady-ai/milady",
        releaseTag: "v2.0.0-alpha.131",
        assetRoot: "apps/app/public",
        assetPath: "vrms/milady-1.vrm.gz",
      }),
    ).toBe(
      "https://raw.githubusercontent.com/milady-ai/milady/v2.0.0-alpha.131/apps/app/public/vrms/milady-1.vrm.gz",
    );
  });
});
