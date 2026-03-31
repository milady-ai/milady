import { describe, expect, it } from "vitest";
import {
  buildJsDelivrAssetBase,
  resolveMiladyAssetBaseUrls,
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
});
