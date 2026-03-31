# Whitelabel: characters and VRM roster

This repo keeps **preset machinery** in `@miladyai/shared` and **roster data** in the host app and agent so forks can stay on upstream packages and only maintain JSON + assets.

## What you own

1. **`character-definitions.json`** — canonical roster (ids, `avatarIndex`, voice, per-locale `variants`, bios, etc.). In-tree Milady copy: [`packages/agent/src/brand/character-definitions.json`](../packages/agent/src/brand/character-definitions.json).
2. **Optional English extras** — [`MILADY_LEGACY_ENGLISH_EXAMPLES`](../packages/shared/src/milady-legacy-english-examples.ts) is Milady-only; pass `{}` or your own partial map into `createPresetApi`.
3. **Public VRM files** under `apps/app/public/vrms/` — `{{slug}}.vrm.gz`, `previews/{{slug}}.png`, `backgrounds/{{slug}}.png` must match the slugs you expose in boot config.

## API

- `createPresetApi({ definitions, legacyEnglishExamples?, slugPrefix? })` — returns `getStylePresets`, resolvers, `buildCharacterCatalog`, etc.
- `registerPresetApi(api)` — wires the global helpers (`getStylePresets`, `STYLE_PRESETS`, `buildCharacterCatalog`, …) used by app-core and the agent.

Per-character **`slug`** in JSON overrides `${slugPrefix}-${avatarIndex}` for VRM URLs.

## Web app (`apps/app`)

1. Add or replace `src/brand/brand-presets.ts` (see current [`brand-presets.ts`](../apps/app/src/brand/brand-presets.ts)).
2. Import `./boot/register-presets` **first** in [`main.tsx`](../apps/app/src/main.tsx) so presets exist before `character-catalog` and `AppBootConfig` are built.
3. Set `AppBootConfig.vrmAssets` from `buildCharacterCatalog().assets` (or equivalent `{ title, slug }[]`).
4. Optional: `companionBackgrounds: { light, dark }` — 1-based indices into the roster; clamped to roster size ([`boot-config`](../packages/app-core/src/config/boot-config.ts)).

## Agent / CLI (`packages/agent`)

- Side-effect import [`init-character-presets.ts`](../packages/agent/src/init-character-presets.ts) runs at the top of [`eliza.ts`](../packages/agent/src/runtime/eliza.ts) so API/CLI see the same roster as the UI.
- Replace `packages/agent/src/brand/character-definitions.json` for your product, or register your own API earlier from a custom entrypoint.
- If the roster is **empty**, CLI onboarding skips the catchphrase/style step; cloud onboarding still works with `preset` undefined.

## Other surfaces

- **Vitest**: root [`test/setup.ts`](../test/setup.ts) registers Milady presets for suites that import `@miladyai/shared/onboarding-presets`.
- **Homepage**: [`apps/homepage/src/register-presets.ts`](../apps/homepage/src/register-presets.ts) registers before any `STYLE_PRESETS` usage.

## Checklist

- [ ] `character-definitions.json` valid for your locales (`variants` must include at least `en`).
- [ ] Slugs match files on disk and `vrmAssets` in boot config.
- [ ] `registerPresetApi` runs before any code calls `getStylePresets()` / `buildCharacterCatalog()`.
- [ ] Agent entry imports your preset init (or the default `init-character-presets`) before server routes resolve styles.
