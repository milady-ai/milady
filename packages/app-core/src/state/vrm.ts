import { type BundledVrmAsset, getBootConfig } from "../config/boot-config";
import { resolveAppAssetUrl } from "../utils/asset-url";
import type { UiTheme } from "./ui-preferences";

// ---------------------------------------------------------------------------
// Bundled VRM asset roster
// ---------------------------------------------------------------------------

/**
 * When the boot roster is empty, still point at a real bundled asset.
 * Uses the first configured `vrmAssets` slug when present; otherwise `default`
 * (host apps should always set `vrmAssets` when shipping avatars).
 */
function fallbackSlug(): string {
  const assets = getBootConfig().vrmAssets;
  if (Array.isArray(assets) && assets.length > 0 && assets[0]?.slug) {
    return assets[0].slug;
  }
  return "default";
}

/**
 * Get the VRM asset roster from the boot config.
 * The host app passes its character roster via AppBootConfig.vrmAssets.
 * Returns an empty array if no assets were configured.
 */
function getAssets(): BundledVrmAsset[] {
  const assets = getBootConfig().vrmAssets;
  if (Array.isArray(assets) && assets.length > 0) {
    return assets;
  }
  return [];
}

/** Number of bundled VRM avatars from the current boot roster. */
export function getVrmCount(): number {
  return getAssets().length;
}

function clampAvatarIndexToRoster(index: number, count: number): number {
  if (count <= 0) return 1;
  return Math.min(Math.max(1, Math.trunc(index)), count);
}

function companionBackgroundIndices(): Record<UiTheme, number> {
  const count = getAssets().length;
  const cfg = getBootConfig().companionBackgrounds;
  const light = cfg?.light ?? 3;
  const dark = cfg?.dark ?? 4;
  return {
    light: clampAvatarIndexToRoster(light, count),
    dark: clampAvatarIndexToRoster(dark, count),
  };
}

export function normalizeAvatarIndex(index: number): number {
  if (!Number.isFinite(index)) return 1;
  const n = Math.trunc(index);
  if (n === 0) return 0;
  const count = getAssets().length;
  if (count <= 0) return 1;
  if (n < 1 || n > count) return 1;
  return n;
}

/** Resolve a bundled VRM index (1–N) to its public asset URL. */
export function getVrmUrl(index: number): string {
  const assets = getAssets();
  if (assets.length === 0)
    return resolveAppAssetUrl(`vrms/${fallbackSlug()}.vrm.gz`);
  const n = normalizeAvatarIndex(index);
  const safe = n > 0 ? n : 1;
  const slug = assets[safe - 1]?.slug ?? assets[0]?.slug ?? fallbackSlug();
  return resolveAppAssetUrl(`vrms/${slug}.vrm.gz`);
}

/** Resolve a bundled VRM index (1–N) to its preview thumbnail URL. */
export function getVrmPreviewUrl(index: number): string {
  const assets = getAssets();
  if (assets.length === 0)
    return resolveAppAssetUrl(`vrms/previews/${fallbackSlug()}.png`);
  const n = normalizeAvatarIndex(index);
  const safe = n > 0 ? n : 1;
  const slug = assets[safe - 1]?.slug ?? assets[0]?.slug ?? fallbackSlug();
  return resolveAppAssetUrl(`vrms/previews/${slug}.png`);
}

/** Resolve a bundled VRM index (1-N) to its custom background URL. */
export function getVrmBackgroundUrl(index: number): string {
  const assets = getAssets();
  if (assets.length === 0)
    return resolveAppAssetUrl(`vrms/backgrounds/${fallbackSlug()}.png`);
  const n = normalizeAvatarIndex(index);
  const safe = n > 0 ? n : 1;
  const slug = assets[safe - 1]?.slug ?? assets[0]?.slug ?? fallbackSlug();
  return resolveAppAssetUrl(`vrms/backgrounds/${slug}.png`);
}

/** Resolve the fixed companion-mode background for the current UI theme. */
export function getCompanionBackgroundUrl(theme: UiTheme): string {
  const idx = companionBackgroundIndices()[theme];
  return getVrmBackgroundUrl(idx);
}

/** Human-readable roster title for bundled avatars. */
export function getVrmTitle(index: number): string {
  const assets = getAssets();
  if (assets.length === 0) return "Avatar";
  const n = normalizeAvatarIndex(index);
  const safe = n > 0 ? n : 1;
  return assets[safe - 1]?.title ?? assets[0]?.title ?? "Avatar";
}

/** @deprecated Stub — always returns false. Retained for API compatibility. */
export function isOfficialVrmIndex(_index: number): boolean {
  return false;
}

/** @deprecated Stub — always returns false. Retained for API compatibility. */
export function getVrmNeedsFlip(_index: number): boolean {
  return false;
}
