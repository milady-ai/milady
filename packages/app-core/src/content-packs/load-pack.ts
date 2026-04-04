/**
 * Content pack loader.
 *
 * Loads a content pack from a directory URL (e.g. /packs/cyberpunk-neon/)
 * or from a bundled pack definition. Validates the manifest and resolves
 * asset paths to absolute URLs.
 */

import {
  CONTENT_PACK_MANIFEST_FILENAME,
  type ContentPackManifest,
  type ContentPackSource,
  type ResolvedContentPack,
  validateContentPackManifest,
} from "@miladyai/shared/contracts/content-pack";

export class ContentPackLoadError extends Error {
  constructor(
    message: string,
    public readonly source: ContentPackSource,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ContentPackLoadError";
  }
}

/**
 * Load a content pack from a base URL (directory containing pack.json).
 * The base URL should end with a trailing slash.
 */
export async function loadContentPackFromUrl(
  baseUrl: string,
): Promise<ResolvedContentPack> {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const source: ContentPackSource = { kind: "url", url: normalizedBase };
  const manifestUrl = `${normalizedBase}${CONTENT_PACK_MANIFEST_FILENAME}`;

  let raw: unknown;
  try {
    const res = await fetch(manifestUrl);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    raw = await res.json();
  } catch (err) {
    throw new ContentPackLoadError(
      `Failed to fetch pack manifest from ${manifestUrl}`,
      source,
      err,
    );
  }

  const errors = validateContentPackManifest(raw);
  if (errors.length > 0) {
    throw new ContentPackLoadError(
      `Invalid pack manifest: ${errors.map((e) => `${e.field}: ${e.message}`).join("; ")}`,
      source,
    );
  }

  const manifest = raw as ContentPackManifest;
  return resolvePackAssets(manifest, normalizedBase, source);
}

/**
 * Resolve a pack from an already-parsed manifest and a base URL.
 * Useful for bundled packs that ship with the app.
 */
export function resolveContentPackFromManifest(
  manifest: ContentPackManifest,
  baseUrl: string,
  source: ContentPackSource,
): ResolvedContentPack {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return resolvePackAssets(manifest, normalizedBase, source);
}

function resolvePackAssets(
  manifest: ContentPackManifest,
  baseUrl: string,
  source: ContentPackSource,
): ResolvedContentPack {
  const { assets } = manifest;
  const resolve = (path: string | undefined) =>
    path ? `${baseUrl}${path}` : undefined;

  return {
    manifest,
    vrmUrl: resolve(assets.vrm?.file),
    vrmPreviewUrl: resolve(assets.vrm?.preview),
    backgroundUrl: resolve(assets.background),
    worldUrl: resolve(assets.world),
    colorScheme: assets.colorScheme,
    streamOverlayPath: resolve(assets.streamOverlay),
    personality: assets.personality,
    source,
  };
}

/**
 * Create a resolved content pack from a bundled pack definition.
 * Bundled packs live in apps/app/public/packs/<id>/.
 */
export function loadBundledContentPack(
  manifest: ContentPackManifest,
  packsBaseUrl = "/packs",
): ResolvedContentPack {
  const baseUrl = `${packsBaseUrl}/${manifest.id}/`;
  return resolveContentPackFromManifest(manifest, baseUrl, {
    kind: "bundled",
    id: manifest.id,
  });
}
