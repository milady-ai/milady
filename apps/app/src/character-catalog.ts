/**
 * Milady character catalog derived from registered preset API (`./boot/register-presets`
 * must load before this module).
 */
import type { CharacterCatalogData } from "@miladyai/app-core/config";
import { buildCharacterCatalog } from "@miladyai/shared/onboarding-presets";

export const MILADY_CHARACTER_CATALOG: CharacterCatalogData =
  buildCharacterCatalog() as CharacterCatalogData;
