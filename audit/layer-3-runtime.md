# Layer 3 — app-core runtime

**Files: 20.**
**Audited: 20 / 20.**
**Refactored: 0 / 20.**

The boot/load layer that sits between Layer 1 (entry points) and Layer 4
(API server). Owns: agent loader (`eliza.ts`), dev server entry
(`dev-server.ts`), embedding warmup, local-inference handler
registration, runtime boot/retry policy, startup overlays, and a couple
of misplaced things.

## Why this layer right after entry / before API

- Layer 1's `entry.ts` and `dev-ui.mjs` orchestrator delegate here
  (`startEliza`, `bootElizaRuntime`). Anything Layer 1 sets in env
  arrives here and is consumed by the wrappers in `eliza.ts` /
  `dev-server.ts`.
- Layer 4 (`api/server.ts`) imports from this layer
  (`buildCharacterFromConfig`, `getStartupEmbeddingAugmentation`,
  `ensureTextToSpeechHandler`). Every weak boundary here leaks upward.
- The MASTER.md §0 chat bug (provider-issue misnamed) reaches *into*
  this layer through `repairRuntimeAfterBoot` →
  `ensureLocalInferenceHandler` (which talks to local-inference
  `routing-policy`). If routing returns "no handler" the chat fallback
  in `agent/api/chat-routes.ts` fires the rename target string.
- This layer is **mostly an upstream-wrapper layer** — every "core"
  concept (`startEliza`, `bootElizaRuntime`, `applyCloudConfigToEnv`,
  `applyN8nConfigToEnv`, `collectPluginNames`, `CHANNEL_PLUGIN_MAP`,
  `EMBEDDING_PRESETS`, `buildCharacterFromConfig`, `shutdownRuntime`)
  is re-exported from `@elizaos/agent/runtime/...` with a thin
  app-core overlay. The audit needs to call out which overlays earn
  their keep and which are pure pass-through.

## What to look for in this layer specifically

- **Spec drift in the task brief.** The brief says `eliza.ts`
  "persists SECRET_SALT (recently — at line ~3198)." Verified: this
  file is **1508 LOC** with **no SECRET_SALT logic**. The
  SECRET_SALT write lives upstream at
  `eliza/packages/agent/src/runtime/eliza.ts:2921-2925`. MASTER.md
  task 16 (derive SECRET_SALT from master key) lands in the upstream
  agent file, **not** this wrapper.
- **Dead wrapper modules.** Several files exist as polished wrappers
  with no live caller (verified by grep).
- **Duplication between `eliza.ts` and the standalone wrapper files.**
  `eliza.ts` re-defines `CHANNEL_PLUGIN_MAP` byte-for-byte even though
  `channel-plugin-map.ts` exists as the canonical wrapper.
- **Defensive `syncBrandEnvAliases()` calls** sprinkled before/after
  every upstream call (14 sites in `eliza.ts`).
- **Boundary smells:** `telegram-standalone-{handler,policy}.ts` live
  in `runtime/` but Telegram is a connector. Their presence here is
  cycle/scope debt.
- **Commandment 9 violations:** `dev-server.ts` has 17 `console.*`
  calls; the file even comments that this is intentional ("bypass
  logger filtering" line 437).

## Status legend

| Status         | Meaning |
|----------------|---------|
| `[ ] pending`  | Not yet read |
| `[~] reading`  | Being audited |
| `[!] findings` | Audited, findings recorded, no edit yet |
| `[*] refactor` | Audited and edited (commit hash appended) |
| `[x] clean`    | Audited, no changes warranted |
| `[-] delete`   | Audited and slated for deletion |
| `[?] blocked`  | Audited but blocked on a lower-layer dep |

---

### The agent loader and its direct deps

- [!] `eliza/packages/app-core/src/runtime/eliza.ts` — **1508 LOC.** The agent loader and the source-of-truth for app-core's overlay over `@elizaos/agent/runtime/eliza`. dedup:`CHANNEL_PLUGIN_MAP` is redefined byte-for-byte at lines 80-127 with the same `INTERNAL_CHANNEL_PLUGIN_OVERRIDES` shape that `channel-plugin-map.ts` already exports — `eliza.ts` should `import { CHANNEL_PLUGIN_MAP } from "./channel-plugin-map.js"` and stop re-merging. dedup:14× `syncBrandEnvAliases()` calls (lines 197-248, 1009, 1027, 1302, 1461) wrap every upstream call ("just in case env drifted") — a single boundary owner (likely upstream's `bootElizaRuntime`) should sync once. types:7× `as never` casts on `runtime.services.set/get/delete` (lines 193, 678, 705, 767, 814, 815, 821) — commandment-7 violation; the upstream services-map type is too narrow and the wrapper is escaping rather than fixing the upstream signature. errors:every `ensure*` helper (`ensureN8nAuthBridge`, `ensureN8nAutoStart`, `ensureN8nDispatchService`, `ensureTriggerEventBridge`, `ensureN8nRuntimeContextProvider`, `ensureConnectorTargetCatalog`, `ensureTelegramBotPolling`) wraps in `try { ... } catch (err) { logger.warn(...) }` and continues — six "best effort" boundaries that mask first-boot failures. legacy:the `RuntimeAutonomyCompat` / `RuntimeAdapterAutonomyCompat` interfaces (lines 132-179) are duck-typed shims for an in-flight upstream refactor — TODO-or-rename. boundaries:`telegram` polling / handler wiring (lines 535, 853-901) lives in a runtime module; Telegram is a platform connector and belongs in `connectors/telegram/` (see `telegram-standalone-handler.ts` audit). slop:line 86 `/** Swarm / PTY paths call TEXT_TO_SPEECH; Edge TTS supplies that model with no API key. */` and similar narrative comments describe past work, not current invariants. **Highest-value extractions** (smaller than electrobun's 11+; this file is large but coherent): (a) **n8n bridges cluster** (~217 LOC: `_n8nAuthBridge`, `_n8nAutoStart`, `_n8nDispatch`, `_triggerEventBridge`, `_n8nRuntimeContextProvider`, `_connectorTargetCatalog`, `_discordEnumerationCache` + their `ensure*` setters, lines 575-836) → `runtime/n8n-bridges.ts`; (b) **PGlite recovery cluster** (~250 LOC: `collectErrorObjects`, `getPgliteErrorCode`, `collectErrorMessages`, `isManualResetPgliteError`, `getPgliteDataDirFromError`, `resolveManagedPgliteDataDir`, `isAutoResettablePgliteDir`, `resetPluginSqlPgliteSingleton`, `quarantinePgliteDataDir`, `normalizePgliteStartupError`, `upstreamStartElizaWithPgliteCompat`, `attemptPgliteAutoReset`, `getPgliteRecoveryRetrySkipPlugins`, lines 1036-1297) → `runtime/pglite-recovery.ts`; (c) **autonomy bootstrap** (~88 LOC: `AUTONOMY_*` consts, `getAutonomyService`, `startAndRegisterAutonomyService`, `RuntimeAutonomyCompat`, `ensureAutonomyBootstrapContext`) → `runtime/autonomy-bootstrap.ts`. After splits, `eliza.ts` target ≤900 LOC: env-sync overlays + `bootElizaRuntime` / `startEliza` / `repairRuntimeAfterBoot` only.
- [!] `eliza/packages/app-core/src/runtime/dev-server.ts` — **516 LOC.** Dev-mode entry point. errors:17× `console.*` calls (lines 12, 44, 56, 423, 437-466, 477, 485, 491, 498, 507, 513) — commandment-9 violation; the file's own comment at line 437 admits "Use console.log for startup timing to bypass logger filtering" — **intentional but still a violation; resolve by configuring the logger to honor a `STARTUP_TIMING=1` flag, not by bypassing it**. dedup:dotenv-load at lines 49-54 duplicates `cli/run-main.ts`'s `loadDotEnv` — same `.env` files via two bootstraps (Layer 1 audit already flagged this; reaffirm). dedup:`shouldIgnoreUnhandledRejection` is shared with `run-main.ts` (good — already extracted to `error-handlers.ts`). types:`apiUpdateStartup` (lines 67-83) is typed inline — should reuse the published API server type, not redefine the union. errors:the `try { dotenv.config() } catch { /* non-fatal */ }` at lines 49-54 is the canonical "swallow and continue" pattern flagged across Layer 0/1; here it's defensible because dotenv is genuinely optional. boundaries:dev-server **does** the right thing — it draws its env contract from `@elizaos/shared` (`resolveDesktopApiPort`, `resolveApiToken`, `syncResolvedApiPort`, `colorizeDevSettingsStartupBanner`) and not from raw `process.env` lookups. slop:the boxed startup banner (lines 446-463) belongs in `cli/banner.ts`, not inline.
- [!] `eliza/packages/app-core/src/runtime/build-character-from-config.ts` — 96 LOC. dedup:`syncBrandEnvAliases` defined locally at line 12 — IDENTICAL three-line function as `eliza.ts:197-200`. Promote to `utils/env.js` or a shared `runtime/env-sync.ts`. types:`Parameters<typeof upstreamBuildCharacterFromConfig>[0]` indirection at line 18 — fine, but `(config.ui ?? {}) as { presetId?: string; avatarIndex?: number; language?: unknown; }` (lines 21-25) is a weak cast where the upstream `Character["ui"]` should be the typed source. legacy:`uiConfig.language as unknown` then immediately `normalizeCharacterLanguage(uiConfig.language)` — the normalization helper accepts unknown, so the cast is for show. boundaries:this is a real overlay (style-preset resolution + message-example normalization), not a pass-through wrapper. Keep, but tighten `uiConfig` typing.
- [!] `eliza/packages/app-core/src/runtime/channel-plugin-map.ts` — 12 LOC. **Duplicated by `eliza.ts:80-127`.** dedup:both files declare the exact same `INTERNAL_CHANNEL_PLUGIN_OVERRIDES = { signal, whatsapp, wechat }` const and merge it into `upstreamChannelPluginMap`. `index.ts:63` re-exports `CHANNEL_PLUGIN_MAP` from this file; `eliza.ts:124-127` re-exports its own copy. **Action:** delete the redefinition in `eliza.ts`, import from this file instead.
- [-] `eliza/packages/app-core/src/runtime/embedding-manager.ts` — **413 LOC. Dead code.** Defines `ElizaEmbeddingManager` class. Verified zero callers across `/Users/home/milady/eliza`, `/Users/home/milady/apps`, `/Users/home/milady/scripts` (only self-references and a doc comment). The actual warmup path (`eliza.ts:warmupEmbeddingModel`) imports `ensureModel`, `findExistingEmbeddingModelForWarmupReuse`, etc. **directly from `embedding-manager-support.ts`**. The class wrapper, plus its idle-timer / dispose / dimension-migration plumbing, is unused. **Action:** delete the file. Re-export shim at lines 397-413 (re-exports from `-support.ts`) is also dead — confirmed no consumer imports them through the wrapper.
- [!] `eliza/packages/app-core/src/runtime/embedding-manager-support.ts` — 474 LOC. **Live.** Used by `eliza.ts:warmupEmbeddingModel`. Holds `ensureModel`, `downloadFile`, `sanitizeModelRepo/Filename`, `EMBEDDING_PRESETS`-aware reuse logic, `EmbeddingMeta`. errors:`getLogger()` at line 75-89 falls back to `console` after a `try { require("@elizaos/core") } catch {}` — commandment-9 violation in the fallback, justified ONLY because the helpers are designed to be importable from a node context where the runtime hasn't booted; **prefer accepting an injected logger** rather than reaching for global console. legacy:the `// best-effort cleanup` `safeUnlink` (line 140-146) and `// non-fatal: …will retry` `readEmbeddingMeta` (line 97-106) swallow errors but each is at a clear boundary (filesystem cleanup) — keep but document with the boundary in mind. types:`writeEmbeddingMeta` returns void on failure with only a logger.warn — fine for a metadata write that retry-on-next-boot can recover. boundaries:owns its own download host allowlist (lines 180-208) — stricter than other downloaders in the repo; the allowlist (`huggingface.co`, `hf.co`) should be a shared constant from `@elizaos/shared`, not a local function.
- [x] `eliza/packages/app-core/src/runtime/embedding-presets.ts` — 27 LOC. Live. Re-exports `EMBEDDING_PRESETS` from `@elizaos/agent` and overrides the `performance` preset's `label`/`description` to clarify the embedding model is for memory vectors, not chat. Status: clean. The override is the entire reason this wrapper exists; it earns its keep.
- [x] `eliza/packages/app-core/src/runtime/embedding-warmup-policy.ts` — 41 LOC. Live. `shouldWarmupLocalEmbeddingModel()` consumed by `eliza.ts:warmupEmbeddingModel`. Pure env policy; clean.
- [-] `eliza/packages/app-core/src/runtime/local-model-resolver.ts` — **247 LOC. Dead code.** `MILADY_MODEL` env-var resolver for picking the right Eliza-1 quant + backend per host. Verified zero callers across `/Users/home/milady/eliza`, `/Users/home/milady/apps`, `/Users/home/milady/scripts`. Only references are: documentation in `eliza/packages/training/{cloud/README,AGENTS,CLAUDE}.md` (docs ASSUME this file is wired in but it isn't), a Python comment in `model_registry.py:208` referring to it, and the `local-ai.json` plugin registry entry that names `MILADY_MODEL` as an env var. **The runtime never actually reads `MILADY_MODEL` to pick a quant** — `local-ai.json` declares it as user-configurable but no TS code consumes the resolver. **Action:** either wire the resolver into `services/local-inference/active-model.ts` (matching the docs) or delete it. Pending product decision; until then mark `[-] delete` candidate.
- [-] `eliza/packages/app-core/src/runtime/boot-progress.ts` — **123 LOC. Dead code.** `BootProgressReporter` extends `EventEmitter`; defines `BOOT_PHASES` (config / plugins / database / embeddings / runtime / skills / ready) and emits weighted `progress` events. Verified zero callers across the entire monorepo (`grep -rn "boot-progress\|BootProgressReporter\|BOOT_PHASES"`). The actual live startup-progress surface is `startup-overlay.ts` (consumed by `api/server.ts:469`); `boot-progress.ts` is the unused alternative. The doc comment at line 4 says "Used by the TUI loading screen" — TUI loading screen is not currently wired. **Action:** delete the file; if the TUI ever lands, build it on the `startup-overlay.ts` surface that's already live.
- [x] `eliza/packages/app-core/src/runtime/startup-overlay.ts` — 78 LOC. Live. `updateStartupEmbeddingProgress` is called from `eliza.ts:978` (warmup progress callback); `getStartupEmbeddingAugmentation` is read from `api/server.ts:469`. Module-level `snapshot` singleton with 120s staleness check. Status: clean. *Minor*: pure functions on top of a single mutable; could be a class but the singleton-per-process model fits the consumer pattern.
- [x] `eliza/packages/app-core/src/runtime/runtime-bootstrap-policy.ts` — 59 LOC. Live. `resolveRuntimeBootstrapFailure` consumed by `dev-server.ts:238` to decide retry vs. error-state on each boot attempt. Owns: fatal PGlite codes set, exponential backoff (`nextRuntimeBootRetryDelayMs`), error-attempt threshold (3), error-duration threshold (2 min). Pure policy file; clean. Decision logic is enforced by `dev-server.ts`'s `bootstrapRuntime` loop — single owner.
- [x] `eliza/packages/app-core/src/runtime/api-dev-settings-banner.ts` — 132 LOC. Live. `formatApiDevSettingsBannerText` consumed by `dev-server.ts:467` to render the post-listen settings table. Pure formatter; uses `@elizaos/shared` helpers (`resolveApiSecurityConfig`, `formatDevSettingsTable`, `prependDevSubsystemFigletHeading`). Clean. *Minor*: rows array hardcodes 9 settings; if the API server gains a 10th env knob, both `resolveApiSecurityConfig` and this banner need to learn about it. Acceptable: the settings table is end-user-facing curated content, not auto-generated.

### Local-inference subsystem

- [!] `eliza/packages/app-core/src/runtime/ensure-local-inference-handler.ts` — 471 LOC. The runtime-side handler-registration entry point for local inference. types:`RuntimeWithModelRegistration` cast at line 58-68 is a structural type pretending to be the upstream `AgentRuntime` — should land in `@elizaos/core` typed properly so wrappers stop re-typing it. errors:`tryRegisterAospLlamaLoader` and `tryRegisterCapacitorLoader` use `try/catch` that demote import failures to `logger.error` / `logger.debug` and return `false` — for AOSP this is correct (the module is build-conditional and the user opted in via env), for Capacitor this is correct (the module is platform-conditional). The comments document the trade-offs explicitly; **error handling is justified here**. errors:the loader-precedence comment at lines 335-349 is excellent documentation of an inherently-stateful subsystem. boundaries:this file owns the priority-0 registration of `TEXT_SMALL` / `TEXT_LARGE` / `TEXT_EMBEDDING` against the runtime model registry. **It is the bridge from the routing-policy subsystem (`services/local-inference/router-handler`, `routing-policy`) into the agent runtime — directly load-bearing for the MASTER.md §0 chat fallback.** When this returns without registering a handler, the runtime's `getModel(TEXT_SMALL)` returns undefined → upstream fires the chat fallback string. legacy:the `LOCAL_INFERENCE_PRIORITY = 0` comment at lines 74-87 is durable history (the historical bug + fix), keep. slop:none.
- [x] `eliza/packages/app-core/src/runtime/mobile-local-inference-gate.ts` — 27 LOC. Live. Consumed by `eliza.ts:485` to decide whether to register the local-inference handler on mobile platforms. Pure env policy; clean.
- [x] `eliza/packages/app-core/src/runtime/capacitor-llama.d.ts` — 13 LOC. **Skipped per task brief (.d.ts).** Note: provides minimal ambient module decl for `@elizaos/capacitor-llama` so `ensure-local-inference-handler.ts:299`'s dynamic import compiles cleanly when the package isn't installed. Legitimate boundary marker, like `apps/app/src/native-plugin-stubs.ts` from Layer 1.
- [!] `eliza/packages/app-core/src/runtime/ensure-text-to-speech-handler.ts` — 109 LOC. Live. Consumed by `eliza.ts:494` and `api/server.ts:152` (lazy import). dedup:**parallel structure to `ensure-local-inference-handler.ts`** — same `RuntimeWithModelRegistration` cast, same `getModel` / `registerModel` shape, same env-disabled guard, same dynamic import-or-throw. The two files share enough structure that a `runtime/handler-registration-base.ts` helper (`ensureModelHandler({ modelType, provider, importer, isDisabled })`) would let both shrink to ~30 LOC each. **Recommended** but only after the local-inference variant stabilizes — its loader-precedence is tightly coupled. errors:line 102-107 the `try { import("@elizaos/plugin-edge-tts/node") } catch (error) { throw new Error(...) }` is a wrap-and-rethrow with context, **good error handling**. types:`EdgeTtsPluginModule` shape (line 44-47) accepts both `default.models` and `edgeTTSPlugin.models` — legacy dual-export support? If only one export form is current, drop the other.

### Misplaced — Telegram in runtime/

- [!] `eliza/packages/app-core/src/runtime/telegram-standalone-handler.ts` — **308 LOC. Misplaced.** Telegram is a platform connector, not core runtime. The file owns: chat-allowlist parsing, channel-type mapping, message chunking, full Telegraf message-receive → `runtime.ensureConnection` → `messageService.handleMessage` → reply-callback flow. boundaries:lives in `runtime/` but every other connector lives under `connectors/` or its own plugin package. **Action: move to `connectors/telegram/standalone-handler.ts`** (matching the file's name). errors:outer `try/catch` at line 110-307 logs and replies "Sorry, I encountered an error processing your message" — that user-facing string is exactly the chat-fallback class flagged in MASTER.md Phase 4; reword once Phase 4 lands. types:`TelegramStandaloneUser`/`Chat`/`Message` partial structural types (lines 12-35) duplicate Telegraf's actual types — `import type { Update } from "telegraf"` would be stronger. types:`RuntimeMessageServiceCompat` (lines 44-53) is another duck-typed shim hinting that `AgentRuntime.messageService` should be in the upstream type.
- [!] `eliza/packages/app-core/src/runtime/telegram-standalone-policy.ts` — 19 LOC. Live. Consumed by `eliza.ts:535` (`shouldStartTelegramStandaloneBot`). boundaries:same as above — should move alongside its handler under `connectors/telegram/`. dedup:the `isExplicitTrue` helper (lines 3-9) is a private duplicate of the same env-truthy parsing in `embedding-warmup-policy.ts:13-19` and `mobile-local-inference-gate.ts:23-25`. Three files, three identical helpers. Promote to `utils/env-truthy.ts`.

### Plumbing wrappers

- [x] `eliza/packages/app-core/src/runtime/app-route-plugin-registry.ts` — 45 LOC. Live. `registerAppRoutePluginLoader` consumed by 5+ plugins (`app-polymarket`, `plugin-computeruse`, `plugin-elizacloud`, `app-shopify`, `app-hyperliquid`); `listAppRoutePluginLoaders` consumed by `eliza.ts:407`. Module-singleton via `Symbol.for("elizaos.app.route-plugin-registry")` — same global-registry pattern as Layer 1's `app-shell-components.ts`. boundaries:cross-bundle global; matches the established pattern in this repo. Status: clean.
- [x] `eliza/packages/app-core/src/runtime/error-handlers.ts` — 66 LOC. Live. Consumed by `dev-server.ts:483` and `cli/run-main.ts`. Pure utility; clean. **Honors commandment 9** (no console; only string operations). The `shouldIgnoreUnhandledRejection` recursion + 402-status / "insufficient credits" / `responseBody` / `errors[]` / `cause` traversal is the right shape to detect provider-credit exhaustion deep in the SDK error chain.

---

## Summary — Layer 3 audit findings

### Spec-brief correction

The audit task brief said `eliza.ts` "persists SECRET_SALT (recently — at line ~3198 per MASTER.md context)." This is false:

| Claim | Truth |
|-------|-------|
| `eliza.ts` is ~3200 LOC | **1508 LOC** |
| Line ~3198 contains SECRET_SALT logic | **No SECRET_SALT logic in this file at all** |
| MASTER.md task 16 lands here | **Lands upstream at `eliza/packages/agent/src/runtime/eliza.ts:2921-2925`** |

MASTER.md task 16 ("Derive `SECRET_SALT` from master key") will need to land in the upstream `@elizaos/agent` package, not in this app-core wrapper. The Layer 6 audit (agent runtime) should pick that up.

### `eliza.ts` extraction map (1508 LOC → ≤900 LOC)

This file is **large but coherent** — it is not the 19-concern god module that `electrobun/src/index.ts` is. Three high-value seams should be extracted; the rest is the thin overlay on top of `@elizaos/agent`'s exports and earns its keep.

| # | Concern | LOC range | Owns | Target module |
|---|---------|-----------|------|---------------|
| 1 | **n8n bridges cluster** | 575-836 (~262 LOC) | `_n8nAuthBridge`, `_n8nAutoStart`, `_n8nDispatch`, `_triggerEventBridge`, `_n8nRuntimeContextProvider`, `_connectorTargetCatalog`, `_discordEnumerationCache` + each `ensure*` setter | **`runtime/n8n-bridges.ts`** |
| 2 | **PGlite recovery cluster** | 1036-1297 (~262 LOC) | error-chain walk, manual-reset detection, data-dir resolution, singleton close+reset, dir quarantine, error normalization, `attemptPgliteAutoReset`, `getPgliteRecoveryRetrySkipPlugins` | **`runtime/pglite-recovery.ts`** |
| 3 | **Autonomy bootstrap** | 77-79, 111-122, 132-179, 181-195, 251-338 (~120 LOC) | `AUTONOMY_*` consts, `RuntimeAutonomyCompat`, `RuntimeAdapterAutonomyCompat`, `getAutonomyService`, `startAndRegisterAutonomyService`, `ensureAutonomyBootstrapContext` | **`runtime/autonomy-bootstrap.ts`** |
| — | **Telegram bot polling** | 535, 838-901 | `_telegramBot`, `stopTelegramBotPolling`, `ensureTelegramBotPolling` | move to **`connectors/telegram/`** along with the existing handler/policy |

Everything else is rightful overlay: `bootElizaRuntime` / `startEliza` (env-sync + warmup + plugin-collector overlay + boot-error normalization + retry orchestration), `repairRuntimeAfterBoot` (one-shot post-boot wiring), `applyCloudConfigToEnv` / `applyN8nConfigToEnv` overlays, `collectPluginNames` overlay (auto-add Edge TTS when orchestrator is enabled), and the shim casts.

### Local-inference subsystem call graph

The brief asks how the six local-inference files relate. Drawn:

```
   eliza.ts:warmupEmbeddingModel
            │
            ├─→ embedding-warmup-policy.shouldWarmupLocalEmbeddingModel  (env policy)
            ├─→ embedding-presets.detectEmbeddingPreset                  (hardware → preset)
            └─→ embedding-manager-support.ensureModel                    (download + sanitize)
                          ↑
                          │  (also reused via:)
                          │
                  embedding-manager-support.findExistingEmbeddingModelForWarmupReuse
                  embedding-manager-support.embeddingGgufFilePresent

   eliza.ts:repairRuntimeAfterBoot
            │
            ├─→ mobile-local-inference-gate.shouldEnableMobileLocalInference  (env policy)
            └─→ ensure-local-inference-handler.ensureLocalInferenceHandler
                          │
                          ├─→ services/local-inference/handler-registry
                          ├─→ services/local-inference/{engine,device-bridge,registry,assignments}
                          ├─→ services/local-inference/router-handler          (top-priority dispatcher)
                          ├─→ try import "@elizaos/agent/runtime/aosp-llama-adapter"  (AOSP, dyn)
                          └─→ try import "@elizaos/capacitor-llama"             (mobile, dyn — typed by capacitor-llama.d.ts)

   ── DEAD ──
   embedding-manager.ts (ElizaEmbeddingManager class, 413 LOC)  — zero callers
   local-model-resolver.ts (MILADY_MODEL Eliza-1 resolver, 247 LOC) — zero callers
   boot-progress.ts (BootProgressReporter, 123 LOC) — zero callers
```

**Live files: 6.** `embedding-presets.ts`, `embedding-warmup-policy.ts`, `embedding-manager-support.ts`, `mobile-local-inference-gate.ts`, `ensure-local-inference-handler.ts`, `capacitor-llama.d.ts`.

**Dead files: 3.** `embedding-manager.ts`, `local-model-resolver.ts`, `boot-progress.ts`. Combined LOC: **783 LOC removable** (verified: zero importers in `eliza/`, `apps/`, `scripts/`).

### Files that are misplaced

| File | Should live in | Reason |
|------|----------------|--------|
| `runtime/telegram-standalone-handler.ts` (308 LOC) | `connectors/telegram/standalone-handler.ts` | Telegram is a connector; only the runtime startup gate (`ensureTelegramBotPolling`) belongs here, and that should call into the connector module. |
| `runtime/telegram-standalone-policy.ts` (19 LOC) | `connectors/telegram/standalone-policy.ts` | Sibling to the above. |
| `runtime/local-model-resolver.ts` (247 LOC) | (delete OR `services/local-inference/eliza-one-resolver.ts`) | Currently dead; if wired in, it belongs next to the local-inference loader, not in `runtime/`. |
| `runtime/boot-progress.ts` (123 LOC) | (delete) | Unused alternative to `startup-overlay.ts` which IS wired in. |

### `startup-overlay.ts` vs `boot-progress.ts`

The brief asks if these are different surfaces. Verdict: **no — they're competing surfaces for the same concept and `boot-progress.ts` lost.**

- `startup-overlay.ts` (78 LOC) — module-level `snapshot: Snapshot | null`, mutated by `updateStartupEmbeddingProgress(phase, detail?)` from inside the warmup callback. Read by `api/server.ts:469` via `getStartupEmbeddingAugmentation()` to merge into `GET /api/status`. **Live: this is what the renderer polls.**
- `boot-progress.ts` (123 LOC) — `BootProgressReporter extends EventEmitter`, weighted phase model with `phase("config" | "plugins" | "database" | "embeddings" | "runtime" | "skills" | "ready")` and `subProgress(phase, fraction, detail)`. Doc comment claims "Used by the TUI loading screen." **Dead: no caller.**

The `BootProgressReporter` is the more sophisticated design; `startup-overlay.ts` is the one that's wired. Either replace the wired one with the better design (a real refactor), or **delete `boot-progress.ts`**. Choose deletion until a concrete TUI/UI consumer wants the EventEmitter shape.

### `error-handlers.ts` and commandment 9

`error-handlers.ts` itself **honors commandment 9**: zero `console.*`, only string operations and recursion through error chains. It exists precisely so the global handlers in `dev-server.ts` and `cli/run-main.ts` share the same provider-credits-exhaustion classifier.

The commandment-9 violations are in **`dev-server.ts` itself** (17 `console.*` calls, line 437 admits this is intentional):

```
dev-server.ts:12, 44, 56, 423, 437-466, 477, 485, 491, 498, 507, 513
```

Plus `eliza.ts:1379-1380` ("Control UI: http://localhost:..." / "Server running. Press Ctrl+C to stop.") and `eliza.ts:1474` (the `printDirectRuntimeHelp` block) and `eliza.ts:1490` (`printDirectRuntimeVersion`) — these are user-facing CLI output, the standard exception to commandment 9.

The dev-server boxed banner (lines 446-463) and "Imports complete (Xms)" timing logs are the real violations. Resolve by either (a) configuring the logger to emit unfiltered when `STARTUP_TIMING=1`, or (b) extracting the banner to `cli/banner.ts` (which already exists and uses `console.log`-but-as-CLI-output, so it's the right home).

### `runtime-bootstrap-policy.ts` — what does it own?

The brief asks. Owns three policy decisions:

1. **Fatal vs. retryable PGlite errors** — `FATAL_PGLITE_CODES` set (`ELIZA_PGLITE_DATA_DIR_IN_USE`, `ELIZA_PGLITE_CORRUPT_DATA`, `ELIZA_PGLITE_MANUAL_RESET_REQUIRED`). Fatal codes return `shouldRetry: false` and surface as `state: "error"`.
2. **Exponential backoff** — `nextRuntimeBootRetryDelayMs(attempt)` = `1000 * 2 ** clamp(attempt-1, 0, 5)`, capped at 30s.
3. **When to surface the error to the UI** — `RUNTIME_BOOT_ERROR_ATTEMPT_THRESHOLD = 3` attempts OR `RUNTIME_BOOT_ERROR_DURATION_MS = 2 minutes` of failures, whichever comes first, flips state from `starting` → `error` (UI shows error UI).

**Enforced exclusively by `dev-server.ts`'s `bootstrapRuntime` loop (lines 195-261).** Single owner. Pure policy file with no IO. Status: clean.

### Top 5 highest-impact refactors for this layer

1. **Delete the three dead files** (`embedding-manager.ts` 413 LOC, `local-model-resolver.ts` 247 LOC, `boot-progress.ts` 123 LOC = **783 LOC removed**). Each verified zero importers across the monorepo. Highest impact-per-effort in the entire layer.
2. **Extract the n8n bridges cluster from `eliza.ts`** (~262 LOC → `runtime/n8n-bridges.ts`). Six `ensure*` functions with six module-level `_n8n*` singletons that all share the same lifecycle (start-or-reset on boot, stop on shutdown). One module gives them one owner.
3. **Extract the PGlite recovery cluster from `eliza.ts`** (~262 LOC → `runtime/pglite-recovery.ts`). Includes the `quarantinePgliteDataDir` flow, the `plugin-sql` singleton reset, and the error-message parser. Self-contained; testable in isolation.
4. **Move `telegram-standalone-{handler,policy}.ts` under `connectors/telegram/`** (~327 LOC moved + slim wrapper in `runtime/`). Boundary fix; reduces `eliza.ts`'s `import` set.
5. **Delete the `CHANNEL_PLUGIN_MAP` redefinition in `eliza.ts:80-127`** and import from the existing `channel-plugin-map.ts`. Trivial dedup — the wrapper file exists for exactly this purpose.

After 1+5 (purely deletions/dedup, no behavior change): layer drops from ~5,300 LOC to ~4,500 LOC and the `eliza.ts` import-set shrinks. After 2+3 (extractions, behavior-preserving): `eliza.ts` drops to ~900 LOC and each extracted module is independently testable.

### Boundary violations (commandments)

| File / lines | Commandment | Violation |
|--------------|-------------|-----------|
| `eliza.ts` 193, 678, 705, 767, 814-821 | **7** (DTO fields required by default; no `as` to skip type errors) | 7× `as never` casts on `runtime.services.set/get/delete` to escape an upstream services-map signature that's too narrow. Fix upstream type, not the wrapper. |
| `eliza.ts` 6× `ensure*` helpers | **8** (logger only, never console) — actually fine for log channel. Real violation: each has `try { ... } catch (err) { logger.warn(...) }` and continues. The boot-time bridges that fail silently mean a feature is "armed" but doesn't work. | Should fail boot or surface to `apiUpdateStartup` as a `degraded` state, not log-and-continue. |
| `dev-server.ts` 17× `console.*` | **9** (logger only, never console) | Self-admitted intentional bypass at line 437. Either configure logger to honor a startup-timing flag, or move the boxed banner to `cli/banner.ts`. |
| `runtime/telegram-standalone-handler.ts`, `runtime/telegram-standalone-policy.ts` | **1** (dependencies point inward only — runtime is the inner layer; connectors are outer) | Telegram-specific code lives in the runtime layer instead of in connectors. The `runtime/eliza.ts:ensureTelegramBotPolling` should call into a connector module, not own the Telegraf import. |
| `embedding-manager-support.ts:75-89` `getLogger()` | **9** | Falls back to `console` when `@elizaos/core` can't be required. Justified at the boundary, but **should accept an injected logger** and let the caller decide. |
| `eliza.ts` 14× `syncBrandEnvAliases()` | (housekeeping) | Defensive sludge: every upstream call is bracketed by env-syncs "in case" the brand env drifted between calls. The env should be synced once, at boot, by the canonical owner. |

### Cross-layer notes

- `runtime/eliza.ts` and `runtime/dev-server.ts` are the two consumers of `@elizaos/shared`'s `resolveDesktopApiPort` / `syncResolvedApiPort`. **They both correctly resolve the port through the shared helper rather than reading `process.env.ELIZA_API_PORT` directly.** This is the layer that gets the API-base contract right (compare to Layer 7's `RuntimeGate.tsx`, the source of MASTER.md §0's bug).
- `runtime/dev-server.ts:421-428` has a CRITICAL log if the bound port differs from the requested port — exactly the diagnostic that would have surfaced MASTER.md §0's port-shift earlier. This is good. The disconnect was at the **renderer** side (Layer 7), not the API side.
- `runtime/ensure-local-inference-handler.ts:74-87` historical comment about `LOCAL_INFERENCE_PRIORITY` going from -1 to 0 is **directly load-bearing for the chat fallback bug class**: when this returns without registering a priority-0 handler, the runtime's `getModel(TEXT_SMALL)` returns `undefined` → upstream `chat-routes.ts` fires the `PROVIDER_ISSUE_CHAT_REPLY` string. Phase 4 of MASTER.md (chat-fallback rename) cannot be considered complete without auditing the routing-policy + handler-registry path that flows through this file.
