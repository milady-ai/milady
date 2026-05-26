# Wiring `first-light.gguf` into the rest of the iOS port

This document tells the next agent (or human) how to plug the first-light
GGUF model into the three places that need to know about it:

1. The Swift `LlamaBridge` implementation (the host side of `llama_load_model`)
2. The polyfill's `bridge.paths_*` query path that resolves where the GGUF lives
3. The chat UI's "model not present" handling

It assumes you've already run `download-first-light.sh` and (for dev
builds) `stage-into-xcode.mjs`, so the GGUF is staged either in the Xcode
bundle or in `~/Library/Application Support/Milady/models/`. See
`README.md` and `FIRST_LAUNCH_DOWNLOAD.md` for the staging story.

## 1. Swift LlamaBridge (model path resolution)

`llama_load_model({ path })` (see `BRIDGE_CONTRACT.md`) takes an absolute
path. The Swift implementation must:

- Accept any absolute path the caller hands it. Do not transform the path
  on the host side — the caller (the polyfill / agent JS) is responsible
  for resolving "the right copy of first-light.gguf".
- On `path` not existing or not being a regular file, resolve with
  `{ error: "model not found: <path>" }` (consistent with the
  rest of the bridge's `null + error` pattern).
- On `path` existing but failing GGUF magic-number validation
  (`gguf_init_from_file` returning null), resolve with
  `{ error: "not a valid GGUF: <path>" }`. **Do not** silently retry
  with a different path or attempt a re-download — that belongs in the
  UI layer.

The Swift host also implements `paths_bundle_resource(name, ext)`. For
the bundled dev build path, this must return the absolute path inside
`Bundle.main` to `agent/models/first-light.gguf`. Concretely:

```swift
// In MiladyBridge.swift / paths_bundle_resource
case ("first-light", "gguf"):
    return Bundle.main.url(
        forResource: "first-light",
        withExtension: "gguf",
        subdirectory: "agent/models"
    )?.path
```

If `subdirectory` doesn't resolve (the file was added with "Create
groups" not "Create folder references"), fall back to a flat lookup:
`Bundle.main.url(forResource: "first-light", withExtension: "gguf")`.

## 2. Polyfill: resolving the model path

Add a small helper in the polyfill — one place that all callers go
through — so we don't scatter `paths_app_support()` + `"models/" + filename`
across the agent code. Suggested home: `polyfill/src/modules/model-paths.ts`.

```ts
import { bridge } from "../bridge";

const MODELS_SUBDIR = "models";
const FIRST_LIGHT_FILENAME = "first-light.gguf";

/**
 * Returns the absolute path of the first-light GGUF, or null if it is
 * not present anywhere. Resolution order:
 *   1. Application Support /models/first-light.gguf  (writeable, primary)
 *   2. Bundle resource agent/models/first-light.gguf (bundled dev build)
 *
 * On first launch in a dev build, the agent should copy (2) → (1) before
 * calling llama_load_model; the app sandbox's Bundle Resources dir is
 * read-only and the file would not survive an OTA model update.
 */
export function resolveFirstLightPath(): string | null {
  const appSupport = bridge.paths_app_support();
  const userPath = `${appSupport}/${MODELS_SUBDIR}/${FIRST_LIGHT_FILENAME}`;
  if (bridge.fs_exists(userPath)) return userPath;

  const bundled = bridge.paths_bundle_resource("first-light", "gguf");
  if (bundled && bridge.fs_exists(bundled)) return bundled;

  return null;
}

/** Path the chat UI should download into for App Store / TestFlight. */
export function firstLightInstallPath(): string {
  const appSupport = bridge.paths_app_support();
  return `${appSupport}/${MODELS_SUBDIR}/${FIRST_LIGHT_FILENAME}`;
}

export function ensureModelsDir(): void {
  const appSupport = bridge.paths_app_support();
  bridge.fs_mkdir(`${appSupport}/${MODELS_SUBDIR}`, /* recursive */ true);
}

/** One-time hop: in dev builds, copy the bundled GGUF into Application Support
 *  so the user-writable path also has it. No-op if the user-writable path is
 *  already populated, or if there is no bundled copy. */
export function maybeHydrateFromBundle(): boolean {
  const userPath = firstLightInstallPath();
  if (bridge.fs_exists(userPath)) return true;
  const bundled = bridge.paths_bundle_resource("first-light", "gguf");
  if (!bundled || !bridge.fs_exists(bundled)) return false;
  ensureModelsDir();
  return bridge.fs_copy(bundled, userPath);
}
```

The agent's runtime then does:

```ts
import { maybeHydrateFromBundle, resolveFirstLightPath } from "./model-paths";

await maybeHydrateFromBundle();
const path = resolveFirstLightPath();
if (!path) {
  // Hand control to the chat UI: it should kick off the download
  // first-run download (see FIRST_LAUNCH_DOWNLOAD.md).
  throw new ModelNotPresentError("first-light");
}
const { context_id } = await bridge.llama_load_model({ path });
```

## 3. Chat UI: "model not present" handling

The chat UI is a Capacitor-hosted React app. It interacts with the
Bun-shape agent over the in-process `__MILADY_BRIDGE__`. When the agent
throws `ModelNotPresentError` (or returns a structured `error` from
`llama_load_model`), the UI must:

1. Branch on distribution tier (`MILADY_DISTRIBUTION_TIER` baked into the
   build, surfaced as a JS const or via `bridge.env_get`):
   - `dev` or `sideload`: show a developer-facing error screen, including
     the absolute paths it checked and a hint to run
     `download-first-light.sh`. Do **not** start a download — dev builds
     should fail loudly, not paper over a missing bundle.
   - `appstore`: enter the first-run download flow described in
     `FIRST_LAUNCH_DOWNLOAD.md`. On successful download + SHA verify,
     re-call `llama_load_model` with the new path.

2. Read the expected SHA256 from a build-time constant (compiled in from
   `manifest.json`) and use it for verification. Never let the model
   binary tell the app what its SHA is.

3. After a successful first load, persist a `models/manifest.json` next
   to `first-light.gguf` (see schema in `FIRST_LAUNCH_DOWNLOAD.md`). On
   subsequent boots, verify the on-disk file matches the manifest before
   calling `llama_load_model`. On mismatch, run the first-run download again.

## Build-time constant injection

To keep the SHA expectations out of runtime fetches, generate a tiny TS
file from `manifest.json` during the agent bundle build. The build
script (out of scope for this directory — see
`eliza/packages/agent/scripts/build-mobile-bundle.mjs` for the agent
bundle entrypoint) should emit something like:

```ts
// Auto-generated from native/ios-bun-port/models/manifest.json — do not edit.
export const FIRST_LIGHT_MODEL = {
  filename: "first-light.gguf",
  sha256: "74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db",
  size_bytes: 491400032,
  url: "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf",
} as const;
```

The chat UI and the polyfill both import this. When the manifest is
updated (model swap, version bump), rerun the bundle build — there is
no runtime fallback or default.

## Smoke test

After wiring everything, the end-to-end test on iPhone Simulator should
look like:

```bash
# 1. Stage model
cd /Users/shawwalters/milaidy/native/ios-bun-port/models
./download-first-light.sh
node stage-into-xcode.mjs

# 2. Build + open in Xcode
cd /Users/shawwalters/milaidy
bun run mobile:ios     # or whatever the canonical build command is at the time

# 3. Run on iPhone 15 / 16 Simulator, Apple Silicon host
# Expected: app boots, no "model not present" screen, first chat turn
# generates a response in <2s.
```

If the smoke test shows the "model not present" screen on a fresh
Simulator launch, the bundled path is broken — most likely
`first-light.gguf` is not in the App target's "Copy Bundle Resources"
phase. Re-run `stage-into-xcode.mjs --check-only` and follow the manual
Xcode steps it prints.
