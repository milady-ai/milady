# Milady Patch Audit Report

## Executive Summary

Milady maintains **two layers of patching** against upstream dependencies:

1. **10 bun/yarn patch files** in `patches/` (applied via `patchedDependencies` in package.json)
2. **~20 postinstall JS patches** in `scripts/patch-deps.mjs` + `scripts/lib/patch-bun-exports.mjs` (applied by `bun install` postinstall)

Many patches overlap (both layers patch the same package). The patches target three categories of upstream repos:

| Category | Packages | Source Repo |
|----------|----------|-------------|
| **elizaOS core** | `@elizaos/core`, `@elizaos/plugin-sql` | `../eliza` |
| **elizaOS plugins** | `plugin-agent-skills`, `plugin-agent-orchestrator`, `plugin-coding-agent`, `plugin-pdf`, `plugin-vision` | `../plugins` |
| **Third-party** | `@noble/curves`, `@noble/hashes`, `proper-lockfile`, `electrobun`, `@pixiv/three-vrm` | External |
| **Milady internal** | `@miladyai/agent` | This repo (workspace) |

---

## Category 1: Patches That Should Go Upstream to `../eliza`

### 1.1 `@elizaos/core` — Synthetic Chat Messages (HIGH PRIORITY)

**Problem:** The core runtime persists internal bookkeeping as chat memories:
- `text: "Generated reply: ${responseContent.text}"` in reply action
- `"Executed action: ${action.name}"` as action memories

**Fix:** Set reply text to `""`, guard action memory creation with `if (actionText)`.

**Files to patch upstream:**
- `packages/core/src/basic-capabilities/actions/reply.ts` line ~93: change `text: \`Generated reply: ...\`` to `text: ""`
- `packages/core/src/basic-capabilities/services/default-message-service.ts`: wrap action memory creation in `if (actionText)` guard

**Patch files:** `patches/@elizaos%2Fcore@2.0.0-alpha.98.patch` + inline in `patch-deps.mjs`

---

### 1.2 `@elizaos/core` — TTS Handler Guard (HIGH PRIORITY)

**Problem:** `useModel(TEXT_TO_SPEECH)` crashes when no TTS provider is configured.

**Fix:** Guard with `getModel(TEXT_TO_SPEECH)` check before calling `useModel`.

**Files to patch upstream:**
- `packages/core/src/basic-capabilities/services/default-message-service.ts`: add `if (getModel(TEXT_TO_SPEECH))` guard around TTS call sites

**Patch source:** `patchElizaCoreStreamingTtsHandlerGuard()` in `lib/patch-bun-exports.mjs`

---

### 1.3 `@elizaos/core` — Streaming Retry Placeholder (MEDIUM)

**Problem:** Hard-coded `"-- that's not right, let me start again:"` text gets pushed to `onChunk` on each retry, causing triple messages in chat.

**Fix:** Remove or replace the placeholder text with empty string.

**Files to patch upstream:**
- `packages/core/src/basic-capabilities/services/default-message-service.ts`: remove the retry placeholder line

**Patch source:** `patchElizaCoreStreamingRetryPlaceholder()` in `lib/patch-bun-exports.mjs`

---

### 1.4 `@elizaos/core` — Client Chat Evaluate Deferral (MEDIUM)

**Problem:** `runtime.evaluate()` blocks SSE stream close for `client_chat` messages. Evaluator auth errors stall the stream indefinitely.

**Fix:** Fire evaluate as a background promise for `client_chat` source, await for all other sources.

**Files to patch upstream:**
- `packages/core/src/basic-capabilities/services/default-message-service.ts`: conditional deferral based on `message.content?.source === "client_chat"`

**Patch source:** `scripts/lib/patch-eliza-core-client-chat-eval.mjs`

---

### 1.5 `@elizaos/plugin-sql` — UUID Version 0 (HIGH PRIORITY)

**Problem:** `isValidUUID()` regex only allows versions 1-5 (`[1-5]`), but elizaOS generates version 0 UUIDs.

**Fix:** Change regex from `[1-5]` to `[0-5]`.

**Files to patch upstream:**
- `packages/plugin-sql/src/pg/manager.ts` (or wherever `isValidUUID` is defined): update regex

**Patch files:** `patches/@elizaos%2Fplugin-sql@2.0.0-alpha.17.patch` + inline in `patch-deps.mjs`

---

## Category 2: Patches That Should Go Upstream to `../plugins`

### 2.1 `@elizaos/plugin-agent-skills` — Catalog Fetch 429 Handling (HIGH PRIORITY)

**Problem:** Concurrent catalog fetch requests trigger duplicate warnings and 429 rate limits without retry-after handling.

**Fix:** Add:
- `catalogFetchInFlight` promise deduplication
- `catalogFetchCooldownUntil` absolute timestamp tracking
- `parseRetryAfterMs()` helper for Retry-After header (RFC 7231)
- Proper 429 backoff with cooldown

**Files to patch upstream:**
- `plugin-agent-skills/src/index.ts` (AgentSkillsService.getCatalog method)

**Patch files:** `patches/@elizaos%2Fplugin-agent-skills@2.0.0-alpha.70.patch` + `patchAgentSkillsCatalogFetch()` in `lib/patch-bun-exports.mjs`

---

### 2.2 `@elizaos/plugin-agent-orchestrator` — Broken Postinstall (HIGH PRIORITY)

**Problem:** `postinstall` script references `./scripts/ensure-node-pty.mjs` which doesn't exist in the npm tarball.

**Fix:** Remove the `postinstall` script from package.json, or include the script in the tarball.

**Files to patch upstream:**
- `plugin-agent-orchestrator/package.json`: remove or fix postinstall

**Patch files:** `patches/@elizaos%2Fplugin-agent-orchestrator@0.3.16.patch` (also 0.3.14) + `patchMissingLifecycleScript()` in `lib/patch-bun-exports.mjs`

---

### 2.3 `@elizaos/plugin-coding-agent` — Dead Bun Exports (HIGH PRIORITY)

**Problem:** `exports["."].bun` and `exports["."].default` point to `./src/index.ts` which doesn't exist in npm tarball. Bun picks these first and fails.

**Fix:** Remove `bun` and `default` export conditions, keep only `import` pointing to `dist/`.

**Files to patch upstream:**
- `plugin-coding-agent/package.json`: fix exports field

**Patch files:** `patches/@elizaos%2Fplugin-coding-agent@0.1.0-next.1.patch` + `patchBunExports()` in `lib/patch-bun-exports.mjs`

---

### 2.4 `@elizaos/plugin-pdf` — Broken Default Export (MEDIUM)

**Problem:** Published alpha.15 bundle exports `default3 as default` which is undefined.

**Fix:** Replace with `pdfPlugin as default`.

**Files to patch upstream:**
- `plugin-pdf/src/index.ts`: fix the default export

**Patch source:** `patchPluginPdfBrokenDefault()` inline in `patch-deps.mjs`

---

### 2.5 `@elizaos/plugin-vision` — Camera Permission Handling (LOW)

**Problem:** Default vision mode is CAMERA, which spam-logs on desktop when OS denies camera access. No permanent disable after denial.

**Fix:**
- Default mode → OFF
- Add `cameraPermissionDenied` flag to permanently disable after denial

**Files to patch upstream:**
- `plugin-vision/src/index.ts`: change default mode, add permission flag

**Patch source:** `patchPluginVisionPermissionHandling()` in `lib/patch-bun-exports.mjs`

---

## Category 3: Third-Party Patches (Cannot Go Upstream Easily)

### 3.1 `@noble/curves` + `@noble/hashes` — Extensionless Export Aliases

**Problem:** ethers v6 imports extensionless paths (`@noble/curves/secp256k1`), but these packages only export `.js` paths. Bun needs explicit aliases.

**Fix:** Add extensionless subpath export aliases in package.json.

**Likely permanent** until ethers or noble fix their import/export mismatch.

**Patch files:** `patches/@noble%2Fcurves@2.0.1.patch` + `patchExtensionlessJsExports()` + `patchNobleHashesCompat()` (legacy sha256/sha512/ripemd160 shims)

---

### 3.2 `proper-lockfile` — signal-exit v3/v4 Compat

**Problem:** v3 exports a function, v4 exports `{ onExit }`. Mixed dependency tree breaks.

**Fix:** Auto-detect export shape and adapt.

**Patch files:** `patches/proper-lockfile@4.1.2.patch` + `patchProperLockfileSignalExitCompat()`

---

### 3.3 `electrobun` — rmdirSync Deprecation + Version Override

**Problem:** Uses deprecated `rmdirSync`, no env var for version override.

**Fix:** Use `rmSync`, add `ELECTROBUN_VERSION` env support.

**Patch file:** `patches/electrobun@1.15.1.patch`

---

### 3.4 `@pixiv/three-vrm` — Three.js r182 Compat

**Problem:** References `THREE_WEBGPU.tslFn` which was removed in Three r182.

**Fix:** Use `THREE_TSL.Fn` instead.

**Patch file:** `patches/@pixiv%2Fthree-vrm@3.5.1.patch` + inline in `patch-deps.mjs`

---

## Category 4: Milady-Specific Patches (Not Upstream Candidates)

These patches customize upstream behavior for Milady specifically:

| Patch | Description |
|-------|-------------|
| `patchAutonomousMiladyOnboardingPresets()` | Replaces upstream presets with Milady's character roster |
| `patchAutonomousTypeError()` | TypeScript strict mode cast fix for @miladyai/agent |
| `patchBrowserServerIndexExtension()` | Adds `.js` extension to existsSync checks |
| `patchAutonomousResetAllowedSegments()` | Adds "milady"/".milady" to reset safety allowlist |
| `patchBrokenElizaCoreRuntimeDists()` | Repairs incomplete Bun cache installs |
| `warnStaleBunCache()` | Detects stale deduplicated cache entries |
| Vite cache cleanup | Clears `.vite/` after patching |

---

## Overlap / Redundancy Between Patch Layers

Several packages are patched by BOTH the .patch file AND the JS postinstall:

| Package | .patch file | JS postinstall | Notes |
|---------|-------------|----------------|-------|
| `@elizaos/core` | Yes (alpha.98) | Yes (5 functions) | .patch covers chat messages; JS covers TTS, retry, evaluate |
| `@elizaos/plugin-sql` | Yes (alpha.17) | Yes (UUID inline) | Exact same UUID fix in both |
| `@elizaos/plugin-agent-skills` | Yes (alpha.70) | Yes (catalog fetch) | Exact same 429 fix in both |
| `@elizaos/plugin-agent-orchestrator` | Yes (0.3.14 + 0.3.16) | Yes (lifecycle) | Same postinstall removal |
| `@elizaos/plugin-coding-agent` | Yes (0.1.0-next.1) | Yes (bun exports) | Same export fix |
| `@noble/curves` | Yes (2.0.1) | Yes (extensionless) | Overlapping export fixes |
| `proper-lockfile` | Yes (4.1.2) | Yes (signal-exit) | Same compat fix |

This redundancy means patches are applied twice — once by the package manager and once by postinstall. The JS postinstall also covers Bun's content-addressable cache (`.bun/` directories), which the .patch files cannot reach.

---

## Implementation Plan

### Phase 1: Upstream PRs to `../eliza`

1. **PR: Fix UUID validation regex** in plugin-sql (version 0 support)
2. **PR: Remove synthetic chat messages** in core (reply action + action memory)
3. **PR: Guard TTS calls** in core (check model availability)
4. **PR: Remove retry placeholder** in core streaming
5. **PR: Defer evaluate for client_chat** in core message service

### Phase 2: Upstream PRs to `../plugins`

6. **PR: Fix 429 rate limiting** in plugin-agent-skills (catalog fetch coalescing)
7. **PR: Remove broken postinstall** in plugin-agent-orchestrator
8. **PR: Fix exports field** in plugin-coding-agent (remove dead bun/default)
9. **PR: Fix default export** in plugin-pdf
10. **PR: Fix camera permission** in plugin-vision (optional — low priority)

### Phase 3: Publish + Update

11. Publish new versions of all patched packages to npm
12. Update milady's package.json to new versions
13. Run `bun install` and verify patches are no longer needed
14. Run full test suite
15. Remove corresponding .patch files and JS patch functions

### Phase 4: Clean Up

16. Remove stale .patch files from `patches/`
17. Simplify `patch-deps.mjs` (remove resolved patches)
18. Remove `lib/patch-bun-exports.mjs` functions for resolved patches
19. Update CLAUDE.md if any conventions changed

### Third-Party Patches (Keep)

These will likely remain as they target external packages we don't control:
- `@noble/curves` / `@noble/hashes` extensionless exports
- `proper-lockfile` signal-exit compat
- `electrobun` rmdirSync + version override
- `@pixiv/three-vrm` Three.js r182 compat

### Milady-Specific Patches (Keep)

These are intentional customizations, not upstream bugs:
- Onboarding presets override
- Reset allowed segments (milady namespace)
- Browser server index extension
- TypeScript cast fix
- Bun cache repair + Vite cache cleanup
