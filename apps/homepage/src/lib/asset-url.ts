import { releaseData } from "../generated/release-data";

function normalizeBaseHref(baseHref: string): string {
  return baseHref.endsWith("/") ? baseHref : `${baseHref}/`;
}

export function resolveHomepageAssetUrl(assetPath: string): string {
  if (!assetPath) return assetPath;
  if (
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(assetPath) ||
    assetPath.startsWith("//")
  ) {
    return assetPath;
  }

  const normalized = assetPath.replace(/^\.?\//, "").replace(/^\/+/, "");
  const configuredBase =
    (import.meta.env.VITE_ASSET_BASE_URL as string | undefined)?.trim() ||
    releaseData.cdn?.homepageAssetBaseUrl?.trim();

  if (!configuredBase) {
    return `/${normalized}`;
  }

  return new URL(normalized, normalizeBaseHref(configuredBase)).toString();
}
