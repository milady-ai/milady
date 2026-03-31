/**
 * Browser-side preset registration for marketing/dashboard code that reads STYLE_PRESETS.
 */
import {
  createPresetApi,
  type CharacterDefinition,
  MILADY_LEGACY_ENGLISH_EXAMPLES,
  registerPresetApi,
} from "@miladyai/shared/onboarding-presets";
import characterDefinitions from "../../../packages/agent/src/brand/character-definitions.json" with {
  type: "json",
};

registerPresetApi(
  createPresetApi({
    definitions: characterDefinitions as CharacterDefinition[],
    legacyEnglishExamples: MILADY_LEGACY_ENGLISH_EXAMPLES,
    slugPrefix: "milady",
  }),
);
