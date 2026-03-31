import process from "node:process";

export const MILADY_GITHUB_REPOSITORY = "milady-ai/milady";
const CDN_ORIGIN = "https://cdn.jsdelivr.net/gh";

function normalizeReleaseTag(value) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  return normalized.startsWith("v") ? normalized : `v${normalized}`;
}

export function resolveMiladyReleaseTag({ env = process.env } = {}) {
  return normalizeReleaseTag(
    env.MILADY_RELEASE_TAG || env.RELEASE_TAG || env.GITHUB_REF_NAME,
  );
}

export function resolveMiladyAssetRepository({ env = process.env } = {}) {
  const configured =
    env.MILADY_ASSET_GITHUB_REPOSITORY?.trim() || env.GITHUB_REPOSITORY?.trim();
  return configured || MILADY_GITHUB_REPOSITORY;
}

export function buildJsDelivrAssetBase({
  repository = MILADY_GITHUB_REPOSITORY,
  releaseTag,
  assetRoot,
}) {
  if (!releaseTag || !assetRoot) {
    return "";
  }
  const normalizedRoot = assetRoot.replace(/^\/+|\/+$/g, "");
  return `${CDN_ORIGIN}/${repository}@${releaseTag}/${normalizedRoot}/`;
}

export function resolveMiladyAssetBaseUrls({
  env = process.env,
  releaseTag = resolveMiladyReleaseTag({ env }),
  repository = resolveMiladyAssetRepository({ env }),
} = {}) {
  const explicitAppBase =
    env.VITE_ASSET_BASE_URL?.trim() || env.MILADY_ASSET_BASE_URL?.trim() || "";
  const explicitHomepageBase =
    env.VITE_HOMEPAGE_ASSET_BASE_URL?.trim() ||
    env.HOMEPAGE_ASSET_BASE_URL?.trim() ||
    "";

  return {
    releaseTag,
    appAssetBaseUrl:
      explicitAppBase ||
      buildJsDelivrAssetBase({
        repository,
        releaseTag,
        assetRoot: "apps/app/public",
      }),
    homepageAssetBaseUrl:
      explicitHomepageBase ||
      buildJsDelivrAssetBase({
        repository,
        releaseTag,
        assetRoot: "apps/homepage/public",
      }),
  };
}
