/**
 * Milady character catalog — reads from the local catalog.json and provides
 * resolved character data for the boot config.
 *
 * This file is Milady-specific and lives in apps/app, NOT in packages/app-core.
 */
import type { CharacterCatalogData } from "@miladyai/app-core/config";
import catalog from "../characters/catalog.json" with { type: "json" };

export const MILADY_CHARACTER_CATALOG: CharacterCatalogData =
  catalog as CharacterCatalogData;
