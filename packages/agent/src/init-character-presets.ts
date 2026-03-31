/**
 * Registers bundled character definitions for CLI/API parity with the dashboard.
 * Whitelabel: replace `character-definitions.json` in this folder or call
 * `registerPresetApi(createPresetApi(...))` earlier from your entrypoint.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPresetApi,
  type CharacterDefinition,
  MILADY_LEGACY_ENGLISH_EXAMPLES,
  registerPresetApi,
} from "@miladyai/shared/onboarding-presets";

const here = path.dirname(fileURLToPath(import.meta.url));
const jsonPath = path.join(here, "brand", "character-definitions.json");
const raw = readFileSync(jsonPath, "utf-8");
const definitions = JSON.parse(raw) as CharacterDefinition[];

registerPresetApi(
  createPresetApi({
    definitions,
    legacyEnglishExamples: MILADY_LEGACY_ENGLISH_EXAMPLES,
    slugPrefix: "milady",
  }),
);
