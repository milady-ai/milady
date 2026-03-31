/**
 * Milady default character roster + preset API. Whitelabel forks: replace this
 * module (or its JSON) and call `registerPresetApi(createPresetApi(...))` from boot.
 */
import {
  type CharacterDefinition,
  createPresetApi,
  MILADY_LEGACY_ENGLISH_EXAMPLES,
} from "@miladyai/shared/onboarding-presets";
import characterDefinitionsJson from "../../../../packages/agent/src/brand/character-definitions.json" with {
  type: "json",
};

export const miladyPresets = createPresetApi({
  definitions: characterDefinitionsJson as CharacterDefinition[],
  legacyEnglishExamples: MILADY_LEGACY_ENGLISH_EXAMPLES,
  slugPrefix: "milady",
});
