function normalizeBaseHref(baseHref: string): string {
  return baseHref.endsWith("/") ? baseHref : `${baseHref}/`;
}

/**
 * Resolve a homepage public asset path. Defaults to a local-served path (the
 * file must exist in `apps/homepage/public/`). CDN override is opt-in via
 * `VITE_ASSET_BASE_URL` — we deliberately do NOT fall back to
 * raw.githubusercontent.com, which has routinely 404'd when release tags drift.
 */
export function resolveHomepageAssetUrl(assetPath: string): string {
  if (!assetPath) return assetPath;
  if (
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(assetPath) ||
    assetPath.startsWith("//")
  ) {
    return assetPath;
  }

  const normalized = assetPath.replace(/^\.?\//, "").replace(/^\/+/, "");
  const configuredBase = (
    import.meta.env.VITE_ASSET_BASE_URL as string | undefined
  )?.trim();

  if (!configuredBase) {
    return `/${normalized}`;
  }

  return new URL(normalized, normalizeBaseHref(configuredBase)).toString();
}
