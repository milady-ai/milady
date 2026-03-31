import { buildCharacterCatalog } from "@miladyai/shared/onboarding-presets";

/**
 * Public preview image path for a bundled VRM, aligned with `buildCharacterCatalog` slugs.
 * Call after the host has run `registerPresetApi` (see `register-presets.ts`).
 */
export function bundledVrmPreviewUrlForAvatarIndex(
  avatarIndex: number,
): string {
  const { assets } = buildCharacterCatalog();
  const match = assets.find((a) => a.id === avatarIndex);
  if (match) {
    return `/vrms/previews/${match.slug}.png`;
  }
  const fallback = assets[0];
  if (fallback) {
    return `/vrms/previews/${fallback.slug}.png`;
  }
  // Matches `createPresetApi` default `slugPrefix` ("avatar") when nothing is registered.
  return `/vrms/previews/avatar-${avatarIndex}.png`;
}
