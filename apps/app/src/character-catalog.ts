/**
 * Milady character catalog derived from the shared character preset source.
 */
import type { CharacterCatalogData } from "@elizaos/app-core";
import { buildElizaCharacterCatalog } from "@elizaos/shared/onboarding-presets";

export const MILADY_CHARACTER_CATALOG: CharacterCatalogData =
  buildElizaCharacterCatalog() as CharacterCatalogData;
