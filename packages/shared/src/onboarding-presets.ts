import {
  CHARACTER_LANGUAGES,
  type CharacterLanguage,
  type StylePreset,
} from "./contracts/onboarding.js";

export type MessageExample = Array<{
  user: string;
  content: { text: string };
}>;

type CharacterVariant = {
  catchphrase: string;
  hint: string;
  postExamples: string[];
};

export type CharacterDefinition = {
  id: StylePreset["id"];
  name: StylePreset["name"];
  avatarIndex: StylePreset["avatarIndex"];
  voicePresetId: StylePreset["voicePresetId"];
  greetingAnimation: StylePreset["greetingAnimation"];
  bio: StylePreset["bio"];
  system: string;
  adjectives: StylePreset["adjectives"];
  style: StylePreset["style"];
  topics: StylePreset["topics"];
  messageExamples: StylePreset["messageExamples"];
  variants: Record<CharacterLanguage, CharacterVariant>;
  /** When set, used as the VRM slug instead of `${slugPrefix}-${avatarIndex}`. */
  slug?: string;
};

const DEFAULT_LANGUAGE: CharacterLanguage = "en";

const LANGUAGE_REPLY_RULES: Record<CharacterLanguage, string> = {
  en: "Default to natural English unless the user clearly switches languages.",
  "zh-CN":
    "Default to natural simplified Chinese unless the user clearly switches languages.",
  ko: "Default to natural Korean unless the user clearly switches languages.",
  es: "Default to natural Spanish unless the user clearly switches languages.",
  pt: "Default to natural Brazilian Portuguese unless the user clearly switches languages.",
  vi: "Default to natural Vietnamese unless the user clearly switches languages.",
  tl: "Default to natural Tagalog unless the user clearly switches languages.",
};

export const SHARED_STYLE_RULES = [
  "Keep it short unless the user clearly wants depth.",
  "Sound young, current, and self-aware without trying too hard.",
  "No assistant filler, no cringe, and no fake enthusiasm.",
  "Avoid metaphors, similes, and 'x is like y' phrasing.",
  "Address one person or a group directly when it fits.",
] as const;

export { MILADY_LEGACY_ENGLISH_EXAMPLES } from "./milady-legacy-english-examples.js";

function mergeUniqueStrings(
  ...collections: ReadonlyArray<ReadonlyArray<string>>
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const collection of collections) {
    for (const value of collection) {
      if (!value || seen.has(value)) {
        continue;
      }
      seen.add(value);
      result.push(value);
    }
  }

  return result;
}

function cloneMessageExample(conversation: MessageExample): MessageExample {
  return conversation.map((message) => ({
    user: message.user,
    content: { text: message.content.text },
  }));
}

function mergeUniqueMessageExamples(
  ...collections: ReadonlyArray<ReadonlyArray<MessageExample>>
): StylePreset["messageExamples"] {
  const result: StylePreset["messageExamples"] = [];
  const seen = new Set<string>();

  for (const collection of collections) {
    for (const conversation of collection) {
      const key = JSON.stringify(conversation);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(cloneMessageExample(conversation));
    }
  }

  return result;
}

function addLanguageRule(system: string, language: CharacterLanguage): string {
  const rule = LANGUAGE_REPLY_RULES[language];
  return `${system} ${rule}`;
}

export function normalizeCharacterLanguage(input: unknown): CharacterLanguage {
  if (typeof input !== "string") {
    return DEFAULT_LANGUAGE;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return DEFAULT_LANGUAGE;
  }

  if ((CHARACTER_LANGUAGES as readonly string[]).includes(trimmed as string)) {
    return trimmed as CharacterLanguage;
  }

  const lower = trimmed.toLowerCase();
  if (lower === "zh" || lower === "zh-cn" || lower.startsWith("zh-hans")) {
    return "zh-CN";
  }
  if (lower.startsWith("ko")) {
    return "ko";
  }
  if (lower.startsWith("es")) {
    return "es";
  }
  if (lower.startsWith("pt")) {
    return "pt";
  }
  if (lower.startsWith("vi")) {
    return "vi";
  }
  if (lower.startsWith("tl") || lower.startsWith("fil")) {
    return "tl";
  }
  return DEFAULT_LANGUAGE;
}

/** When no roster is registered, `getDefaultStylePreset` falls back to this. */
const MODULE_EMPTY_PRESET: StylePreset = {
  id: "default",
  name: "Assistant",
  avatarIndex: 1,
  voicePresetId: "",
  greetingAnimation: "",
  catchphrase: "",
  hint: "",
  bio: ["{{name}} is an AI assistant powered by elizaOS."],
  system: "You are {{name}}, an autonomous AI agent powered by elizaOS.",
  adjectives: [],
  style: {
    all: [...SHARED_STYLE_RULES],
    chat: [],
    post: [],
  },
  topics: [],
  postExamples: [],
  messageExamples: [],
};

export type PresetApiInput = {
  definitions: CharacterDefinition[];
  legacyEnglishExamples?: Partial<
    Record<
      StylePreset["id"],
      { postExamples: string[]; messageExamples: MessageExample[] }
    >
  >;
  /** Default VRM slug prefix when a definition has no `slug` field. */
  slugPrefix?: string;
};

export type CharacterPresetApi = ReturnType<typeof createPresetApi>;

export function createPresetApi(input: PresetApiInput) {
  const slugPrefix = (input.slugPrefix ?? "avatar").replace(/-+$/, "");
  const definitions = Array.isArray(input.definitions) ? input.definitions : [];
  const legacyEnglishExamples = input.legacyEnglishExamples ?? {};

  function vrmSlugFor(definition: CharacterDefinition): string {
    const raw = definition.slug?.trim();
    if (raw) return raw;
    return `${slugPrefix}-${definition.avatarIndex}`;
  }

  function resolveCharacterVariant(
    definition: CharacterDefinition,
    language: CharacterLanguage,
  ): StylePreset {
    const variant = definition.variants[language] ?? definition.variants.en;
    const legacyExamples = legacyEnglishExamples[definition.id];
    const postExamples =
      language === "en"
        ? mergeUniqueStrings(
            variant.postExamples,
            legacyExamples?.postExamples ?? [],
          )
        : [...variant.postExamples];
    const messageExamples = mergeUniqueMessageExamples(
      definition.messageExamples,
      legacyExamples?.messageExamples ?? [],
    );

    return {
      id: definition.id,
      name: definition.name,
      avatarIndex: definition.avatarIndex,
      voicePresetId: definition.voicePresetId,
      greetingAnimation: definition.greetingAnimation,
      catchphrase: variant.catchphrase,
      hint: variant.hint,
      bio: [...definition.bio],
      system: addLanguageRule(definition.system, language),
      adjectives: [...definition.adjectives],
      style: {
        all: [...definition.style.all],
        chat: [...definition.style.chat],
        post: [...definition.style.post],
      },
      topics: [...definition.topics],
      postExamples,
      messageExamples,
    };
  }

  const stylePresetCache = Object.fromEntries(
    CHARACTER_LANGUAGES.map((language) => [
      language,
      definitions.map((definition) =>
        resolveCharacterVariant(definition, language),
      ),
    ]),
  ) as Record<CharacterLanguage, StylePreset[]>;

  return {
    definitions,
    slugPrefix,
    vrmSlugFor,
    getStylePresets(language: unknown = DEFAULT_LANGUAGE): StylePreset[] {
      return stylePresetCache[normalizeCharacterLanguage(language)];
    },
    getDefaultStylePreset(language: unknown = DEFAULT_LANGUAGE): StylePreset {
      const list = stylePresetCache[normalizeCharacterLanguage(language)];
      return list[0] ?? MODULE_EMPTY_PRESET;
    },
    resolveStylePresetById(
      id: string | null | undefined,
      language: unknown = DEFAULT_LANGUAGE,
    ): StylePreset | undefined {
      if (!id) {
        return undefined;
      }
      const normalized = normalizeCharacterLanguage(language);
      const definition = definitions.find(
        (entry) => entry.id.toLowerCase() === id.toLowerCase(),
      );
      return definition
        ? resolveCharacterVariant(definition, normalized)
        : undefined;
    },
    resolveStylePresetByName(
      name: string | null | undefined,
      language: unknown = DEFAULT_LANGUAGE,
    ): StylePreset | undefined {
      if (!name) {
        return undefined;
      }
      const normalized = normalizeCharacterLanguage(language);
      const definition = definitions.find(
        (entry) => entry.name.toLowerCase() === name.toLowerCase(),
      );
      return definition
        ? resolveCharacterVariant(definition, normalized)
        : undefined;
    },
    resolveStylePresetByAvatarIndex(
      avatarIndex: number | null | undefined,
      language: unknown = DEFAULT_LANGUAGE,
    ): StylePreset | undefined {
      if (!Number.isFinite(avatarIndex)) {
        return undefined;
      }
      const normalized = normalizeCharacterLanguage(language);
      const definition = definitions.find(
        (entry) => entry.avatarIndex === avatarIndex,
      );
      return definition
        ? resolveCharacterVariant(definition, normalized)
        : undefined;
    },
    getPresetNameMap(
      language: unknown = DEFAULT_LANGUAGE,
    ): Record<string, string> {
      const result: Record<string, string> = {};
      for (const preset of stylePresetCache[
        normalizeCharacterLanguage(language)
      ]) {
        result[preset.name] = preset.catchphrase;
      }
      return result;
    },
    buildCharacterCatalog(): {
      assets: Array<{
        id: number;
        slug: string;
        title: string;
        sourceName: string;
      }>;
      injectedCharacters: Array<{
        catchphrase: string;
        name: string;
        avatarAssetId: number;
        voicePresetId?: string;
      }>;
    } {
      const enPresets = stylePresetCache[DEFAULT_LANGUAGE];
      const byId = new Map(definitions.map((d) => [d.id, d]));
      const assets = enPresets
        .slice()
        .sort((left, right) => left.avatarIndex - right.avatarIndex)
        .map((preset) => {
          const def = byId.get(preset.id);
          const slug = def
            ? vrmSlugFor(def)
            : `${slugPrefix}-${preset.avatarIndex}`;
          return {
            id: preset.avatarIndex,
            slug,
            title: preset.name,
            sourceName: preset.name,
          };
        });

      const injectedCharacters = enPresets.map((preset) => ({
        catchphrase: preset.catchphrase,
        name: preset.name,
        avatarAssetId: preset.avatarIndex,
        voicePresetId: preset.voicePresetId,
      }));

      return { assets, injectedCharacters };
    },
    get bundledVrmCount(): number {
      return definitions.length;
    },
  };
}

// ---------------------------------------------------------------------------
// Global registration — host app / agent call `registerPresetApi` at startup.
// ---------------------------------------------------------------------------

let registeredApi: CharacterPresetApi | null = null;

export function registerPresetApi(api: CharacterPresetApi): void {
  registeredApi = api;
  syncExportedPresetArrays();
}

/** Test-only: clear registration between Vitest cases. */
export function clearRegisteredPresetApiForTests(): void {
  registeredApi = null;
  syncExportedPresetArrays();
}

export function getRegisteredPresetApi(): CharacterPresetApi | null {
  return registeredApi;
}

/** @internal Synced when `registerPresetApi` runs — stable references for legacy imports. */
export const STYLE_PRESETS: StylePreset[] = [];

export const CHARACTER_PRESETS: Array<{
  id: string;
  name: string;
  catchphrase: string;
  description: string;
  style: string;
}> = [];

export const CHARACTER_PRESET_META: Record<
  string,
  {
    id: string;
    name: string;
    avatarIndex: number;
    voicePresetId?: string;
    catchphrase: string;
  }
> = {};

function syncExportedPresetArrays(): void {
  STYLE_PRESETS.length = 0;
  CHARACTER_PRESETS.length = 0;
  for (const k of Object.keys(CHARACTER_PRESET_META)) {
    delete CHARACTER_PRESET_META[k];
  }
  if (!registeredApi) {
    return;
  }
  const en = registeredApi.getStylePresets(DEFAULT_LANGUAGE);
  STYLE_PRESETS.push(...en);
  for (const preset of en) {
    CHARACTER_PRESETS.push({
      id: preset.id,
      name: preset.name,
      catchphrase: preset.catchphrase,
      description: preset.hint,
      style: preset.id,
    });
    CHARACTER_PRESET_META[preset.catchphrase] = {
      id: preset.id,
      name: preset.name,
      avatarIndex: preset.avatarIndex,
      voicePresetId: preset.voicePresetId,
      catchphrase: preset.catchphrase,
    };
  }
}

export function getStylePresets(
  language: unknown = DEFAULT_LANGUAGE,
): StylePreset[] {
  if (!registeredApi) {
    return [];
  }
  return registeredApi.getStylePresets(language);
}

export function getDefaultStylePreset(
  language: unknown = DEFAULT_LANGUAGE,
): StylePreset {
  if (!registeredApi) {
    return MODULE_EMPTY_PRESET;
  }
  return registeredApi.getDefaultStylePreset(language);
}

export function resolveStylePresetById(
  id: string | null | undefined,
  language: unknown = DEFAULT_LANGUAGE,
): StylePreset | undefined {
  return registeredApi?.resolveStylePresetById(id, language);
}

export function resolveStylePresetByName(
  name: string | null | undefined,
  language: unknown = DEFAULT_LANGUAGE,
): StylePreset | undefined {
  return registeredApi?.resolveStylePresetByName(name, language);
}

export function resolveStylePresetByAvatarIndex(
  avatarIndex: number | null | undefined,
  language: unknown = DEFAULT_LANGUAGE,
): StylePreset | undefined {
  return registeredApi?.resolveStylePresetByAvatarIndex(avatarIndex, language);
}

export function getPresetNameMap(
  language: unknown = DEFAULT_LANGUAGE,
): Record<string, string> {
  if (!registeredApi) {
    return {};
  }
  return registeredApi.getPresetNameMap(language);
}

export function buildCharacterCatalog(): ReturnType<
  CharacterPresetApi["buildCharacterCatalog"]
> {
  if (!registeredApi) {
    return { assets: [], injectedCharacters: [] };
  }
  return registeredApi.buildCharacterCatalog();
}

/** @deprecated Use `buildCharacterCatalog()`. */
export function buildMiladyCharacterCatalog(): ReturnType<
  CharacterPresetApi["buildCharacterCatalog"]
> {
  return buildCharacterCatalog();
}
