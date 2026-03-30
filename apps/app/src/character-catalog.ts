/**
 * Milady character catalog derived from the shared character preset source.
 */
import type { CharacterCatalogData } from "@miladyai/app-core/config";
import { buildMiladyCharacterCatalog } from "@miladyai/shared/onboarding-presets";

export const MILADY_CHARACTER_CATALOG: CharacterCatalogData =
  buildMiladyCharacterCatalog() as CharacterCatalogData;
