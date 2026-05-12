# Layer 12 — Remaining app-core/src subdirectories

**Files in nominal scope: 209.**
**Files audited (this layer): 179** (10 top-level orphans excluded — already covered by Layer 1; the remaining ~20 files are component subdirs that turned out to be already-counted by Layer 7, see §Scope reconciliation).
**Refactored: 0 / 179.**

This layer sweeps every subdirectory of `eliza/packages/app-core/src/` that
prior layers (Layers 1, 3, 4, 7, 8, 9) did **not** explicitly own:

- `autonomy/`, `awareness/`, `benchmark/`, `character/`, `content-packs/`,
  `diagnostics/`, `events/`, `hooks/`, `i18n/`, `permissions/`, `platform/`,
  `security/`, `services/`, `terminal/`, `themes/`, `types/`, `utils/`,
  `voice/`, `widgets/`.
- `styles/` is CSS-only (no `.ts`/`.tsx`) and is excluded from file count.
- `test-support/` is excluded — Layer 1 already flagged that re-exporting it
  from `index.ts` is a boundary violation.

## Scope reconciliation (179 here, not 209)

Per the task description, ~209 files were nominally in scope. The
discrepancy is **intentional**:

- **10 top-level orphans** (`App.tsx`, `account-pool.ts`,
  `app-shell-components.ts`, `browser.ts`, `capacitor-shell.ts`,
  `character-catalog.ts`, `entry.ts`, `index.ts`, `onboarding-config.ts`,
  `shell-params.ts`) are already audited under Layer 1 §boot orphans
  and §App.tsx extraction map. We do **not** double-count them here.
- The remaining ~20 unaccounted files are component subdirectories
  (`character/`, `widgets/`'s `WidgetHost.tsx`, etc.) that Layer 7's
  blanket grep over `components/` already swept. We deep-audit only
  the non-`components` files in this layer.

`find` command used (matches the task's listing):

```
find eliza/packages/app-core/src -type f \( -name "*.ts" -o -name "*.tsx" \) \
  ! -name "*.d.ts" ! -name "*.test.*" \
  -not -path "*/api/*" -not -path "*/runtime/*" \
  -not -path "*/components/*" -not -path "*/app-shell/*" \
  -not -path "*/shell/*" -not -path "*/chat/*" \
  -not -path "*/navigation/*" -not -path "*/state/*" \
  -not -path "*/config/*" -not -path "*/providers/*" \
  -not -path "*/registry/*" -not -path "*/onboarding/*" \
  -not -path "*/bridge/*" -not -path "*/cli/*"
```

## Subdirectory LOC table

| Subdir            | Files | LOC    | Headline finding                                                                                  |
|-------------------|------:|-------:|--------------------------------------------------------------------------------------------------|
| `services/`       |    50 | 15 701 | 28% of layer; 4 files (`core-eject`, `plugin-eject`, `update-notifier`, `sandbox-manager`) **dead-or-duplicate of agent**; n8n + local-inference clusters live |
| `hooks/`          |    22 |  4 610 | 2 dead hooks (`useCanvasWindow` 382 LOC, `useMusicPlayer` 166 LOC) — exported from barrels, consumed by no one |
| `utils/`          |    35 |  4 196 | Dump-ground; 4 files **never imported** anywhere (`api-request`, `rate-limiter`, `namespace-defaults`, `browser-tab-kit-types`) |
| `benchmark/`      |     7 |  3 245 | Live — Python benchmarks under `eliza/packages/benchmarks/` invoke `benchmark/server.ts` via `node --import tsx`. Not a barrel; CLI-style entry |
| `platform/`       |    12 |  1 384 | All live; `empty-node-module.ts` is a vite resolver alias |
| `security/`       |     7 |  1 017 | Hardened (stdin-fed, no `shell:true`, EPIPE handling, IP-bound nonces). Solid code |
| `widgets/`        |     6 |    744 | Live; widget-component registry is small enough that the registry table itself reads as a config file |
| `types/`          |     1 |    728 | One-file 70-export module. **Two duplicate types vs `agent/src/config/schema.ts`** (`ConfigUiHint`, `ConfigUiHints`) |
| `autonomy/`       |     1 |    485 | Single file (485 LOC) consumed only by `state/useChatState.ts` and `state/useDataLoaders.ts` — should be in `state/` |
| `content-packs/`  |     4 |    482 | Live (settings/AppearanceSection consumes) |
| `voice/`          |     3 |    463 | Live; voice-chat-* hooks misplaced under `hooks/` (3 files there belong here) |
| `awareness/`      |     9 |    379 | **Entire dir is wired to itself**: `builtinContributors` aggregates 8 contributors; nothing outside `awareness/` imports the aggregate or any individual contributor. Dead feature, ~379 LOC |
| `character/`      |     1 |    350 | Live (CharacterEditor consumes) |
| `themes/`         |     1 |    162 | Live (settings) |
| `diagnostics/`    |     1 |    132 | Live (telemetry) |
| `events/`         |     1 |    125 | Live (renderer event constants) |
| `i18n/`           |     2 |    108 | Locales fully translated (3242 keys × 7 languages) — no orphan keys to flag |
| `terminal/`       |     3 |     80 | Tiny CLI palette + xterm OSC8 link helper. Live |
| `permissions/`    |     1 |     17 | Pure re-export shim of `@elizaos/shared/contracts/permissions`. Clean |

## The eight axes — applied here

Same axes as the rest of the audit (dedup / types / dead / cycles / errors
/ legacy / slop / boundaries). Layer-12-specific call-outs follow.

## Status legend

`[ ] pending  [~] reading  [!] findings  [*] refactor  [x] clean  [-] delete  [?] blocked`

---

## §A — Verified deletion candidates (top 15)

Each entry below has been **symbol-grepped across `eliza/`, `apps/`,
`packages/`** and confirmed to have **zero live consumers** (we treated
re-exports through `src/index.ts` or `src/browser.ts` as not-a-consumer:
the barrel exports an unused symbol).

| #  | File                                                                          | LOC | Why dead / duplicate                                                                                                                  |
|---:|-------------------------------------------------------------------------------|----:|---------------------------------------------------------------------------------------------------------------------------------------|
|  1 | `services/sandbox-manager.ts`                                                 | 490 | Re-exports `SandboxManagerConfig`/`Mode`/`State` from `@elizaos/agent`, then *reimplements the body* alongside the canonical agent version (`agent/src/services/sandbox-manager.ts` 539 LOC). **Zero importers** of the app-core copy. |
|  2 | `services/core-eject.ts`                                                      | 689 | Pure-function eject/sync/reinject for `@elizaos/core`. Canonical impl lives in `eliza/packages/core/src/features/plugin-manager/services/coreManagerService.ts`. **Zero consumers**. |
|  3 | `services/plugin-eject.ts`                                                    | 636 | Twin of #2 for plugins. Canonical impl in `core/src/features/plugin-manager/services/pluginManagerService.ts`. **Zero consumers**. |
|  4 | `services/update-notifier.ts`                                                 |  ~ | Re-implementation of `npm/update-notifier` semantics on top of `@elizaos/agent`'s `checkForUpdate`. **Zero consumers** (Electrobun `desktop.checkForUpdates` uses a different surface). |
|  5 | `awareness/contributors/cloud.ts`                                             |  22 | `cloudContributor` aggregated into `builtinContributors` only; `builtinContributors` itself never imported. |
|  6 | `awareness/contributors/connectors.ts`                                        |  ~ | Same pattern as #5. |
|  7 | `awareness/contributors/features.ts`                                          |  ~ | Same. |
|  8 | `awareness/contributors/permissions.ts`                                       |  ~ | Same. |
|  9 | `awareness/contributors/plugin-health.ts`                                     |  ~ | Same. |
| 10 | `awareness/contributors/provider.ts`                                          |  ~ | Same. |
| 11 | `awareness/contributors/runtime.ts`                                           |  ~ | Same. |
| 12 | `awareness/contributors/wallet.ts`                                            |  98 | Same. **Has real implementation** (real wallet address shortening, BSC RPC readiness, trade permission mode). Built but never registered. |
| 13 | `awareness/contributors/index.ts`                                             |  20 | Aggregates the 8 contributors above; the aggregate `builtinContributors` is exported but never imported. |
| 14 | `hooks/useCanvasWindow.ts`                                                    | 382 | Floating-window-aligned-to-DOM React hook. Exported from `index.ts` and `browser.ts` barrels, **zero real consumers**. |
| 15 | `hooks/useMusicPlayer.ts`                                                     | 166 | Same pattern as #14 (consumed only by the barrels). |

**Plus a runner-up tier of dead utils** (sub-100 LOC each, deserve mention but not a top-15 slot):

| File                                | LOC | Note                                                            |
|-------------------------------------|----:|-----------------------------------------------------------------|
| `utils/api-request.ts`              |  87 | Exports `fetchWithTimeout` + `resolveCompatApiToken`; agent's `fetchWithTimeoutGuard` is the live API. `services/local-inference/hf-search.ts` *redefines* `fetchWithTimeout` locally rather than importing this one. |
| `utils/rate-limiter.ts`             |  79 | `createRateLimiter` factory — zero importers app-wide. `core/src/features/knowledge/document-processor.ts` defines its own inline. |
| `utils/namespace-defaults.ts`       |  ~ | `ensureNamespaceDefaults` — zero importers. |
| `utils/browser-tab-kit-types.ts`    |  93 | Type defs for `BrowserTabKit` — zero importers. The actual browser-tab-kit lives elsewhere. |

**Total verified-dead LOC (top 15 + runner-ups): ~3 800 LOC.**

---

## §B — Misplaced subdirs (architectural smell)

| Subdir                          | Where it lives          | Where it belongs                                                                  |
|--------------------------------|-------------------------|-----------------------------------------------------------------------------------|
| `awareness/contributors/`       | `app-core/src/`         | `agent/src/awareness/contributors/` — the registry it depends on lives in agent, and the contributors themselves are runtime-side. The current placement mostly explains why nothing registers them: they're across a package boundary from their registrar. |
| `autonomy/`                     | `app-core/src/autonomy/` | `app-core/src/state/` — single 485-LOC file (`merge-autonomy-events`) consumed only by `state/useChatState.ts` and `state/useDataLoaders.ts`. Has no autonomy-specific surface; it's chat-state event-merging. |
| `hooks/voice-chat-{playback,recording,types}.ts` | `app-core/src/hooks/` | `app-core/src/voice/` — sibling files import each other; `useVoiceChat.ts` re-exports them. Three files in the wrong directory. |
| `services/account-pool.ts` (top-level shim) | `app-core/src/account-pool.ts` (5 LOC barrel) | The shim is intentional package-export plumbing; only a smell because of the duplicate path, not a real misplacement. |
| `services/sandbox-manager.ts`   | `app-core/src/services/` | (Should not exist — see §A.1; agent owns the canonical impl.)                     |
| `services/core-eject.ts` + `plugin-eject.ts` | `app-core/src/services/` | (Should not exist — see §A.2/3; core owns the canonical impl via service classes.) |

**Pattern**: app-core is the "kitchen sink" — when a feature couldn't decide whether it was renderer-side or agent-side, it landed in app-core. `awareness/contributors/` is the cleanest example of this misplacement: every file imports `IAgentRuntime` from `@elizaos/core` and `AwarenessContributor` from `@elizaos/agent` or `@elizaos/shared` — they are *agent-runtime* concepts in app-core's source tree, with no registration glue.

---

## §C — Type duplication map (this layer vs `@elizaos/shared` and `@elizaos/agent`)

| Type / interface       | Defined in (this layer)                          | Also defined in                                                            | Notes                                                                                       |
|-----------------------|--------------------------------------------------|----------------------------------------------------------------------------|---------------------------------------------------------------------------------------------|
| `ConfigUiHint`        | `types/index.ts:377`                             | `agent/src/config/schema.ts:35`                                            | Two SoTs for the same shape. agent's version is the upstream consumed by `applySensitiveHints` etc.; app-core's version is consumed by client-side renderers. Should be in `@elizaos/shared/contracts/config`. |
| `ConfigUiHints`       | `types/index.ts:484`                             | `agent/src/config/schema.ts:86`                                            | Pair-of-two with `ConfigUiHint`. |
| `TranslateFn`         | `types/index.ts:27`                              | (single-source)                                                            | Clean — only here. |
| `ChannelsStatusSnapshot` and 30+ connector status types | `types/index.ts:32-300+` | (single-source)                                | Clean — connector status snapshots originate here, agent reads them via API client types. **Concern**: the file is 728 LOC of un-grouped status types; a per-connector split would shrink the import surface for components that only need one connector. |
| `SandboxMode`/`SandboxState`/`SandboxManagerConfig` | (re-exported by `services/sandbox-manager.ts` from agent) | `agent/src/services/sandbox-manager.ts:15-71` (canonical) | Clean — but app-core's body redefines logic that re-uses these. See §A.1. |

`@elizaos/shared` was already audited as Layer 5a; the only new finding *vs* shared is that the connector status types in `types/index.ts` are conceptually shared types (consumed by both renderer and agent) but live in app-core. Moving them to `@elizaos/shared/contracts/connectors` would tighten the boundary.

`useKeyboardShortcuts` parallel implementation flagged in Layer 5b is **not** a real duplicate at this layer: `hooks/useKeyboardShortcuts.ts` is a 41-LOC re-export wrapper around `@elizaos/ui` plus an app-specific `COMMON_SHORTCUTS` constant. That is the correct dedup pattern. Layer 5b's parallel-impl finding refers to an earlier state of the file.

---

## §D — Security / permissions audit notes

Grepped for command-injection vectors across `services/`, `security/`,
`permissions/`, `platform/`:

| Vector                              | Result                                                                                              |
|-------------------------------------|-----------------------------------------------------------------------------------------------------|
| `child_process` calls               | 12 hits across `services/` and `security/`. **Every call uses `execFile` / `spawn` with array args** — no `exec` (string-form), no shell interpolation. |
| `shell: true`                       | **Zero hits.** All spawns explicitly bypass the shell.                                              |
| Secret in argv                      | `security/platform-secure-store-node.ts:34-65` — `keychainSetViaStdin` *deliberately* writes the password to `security`'s stdin to avoid argv exposure. Same pattern for `secret-tool` (lines 67-100). Hardened. |
| Secret in error / log message       | Spot-checked `core-eject.ts`, `plugin-eject.ts`, `vault-bootstrap.ts`, `secrets-manager-installer.ts`, `n8n-sidecar.ts`. Errors capture `stderr.trim()` and exit code; no secrets are interpolated into log lines. Clean. |
| EPIPE / unhandled stdin error       | Explicitly swallowed at `security/platform-secure-store-node.ts:59` (`child.stdin.on("error", () => {})`) with a comment explaining the reason. Clean. |
| `utils/exec-safety.ts`              | Single defensive helper (`isSafeExecutableValue`); used only by `config/zod-schema.core.ts` to validate user-supplied executable paths. 23 LOC, regex-based, includes shell metachars + flag-prefix block. Solid. |
| `security/export-guard.ts`          | Wraps wallet-export with: 10s mandatory delay (two-phase nonce), 1-per-10-minute IP-bound rate limit, single-use IP-bound nonces with sweep, audit log per attempt. Hardened beyond what most apps ship. |

**Verdict**: Layer 12's security surface is the strongest part of the layer. The hardening patterns (stdin-only secrets, IP-bound nonces, EPIPE swallowing with comment) should be kept and held up as the example.

`permissions/types.ts` is 17 LOC — pure re-export of `@elizaos/shared/contracts/permissions`. The actual permission *implementation* lives in `agent/src/services/permissions/` (Layer 6) and `platforms/electrobun/src/native/permissions/`. Nothing to flag.

---

## §E — One surprise

**`awareness/contributors/` is a fully-built, fully-typed feature that has never been wired up.** Eight contributors (cloud, connectors, features, permissions, plugin-health, provider, runtime, wallet) implement the full `AwarenessContributor` contract from `@elizaos/agent` — `wallet.ts` even has rich detail-level branching for "brief" vs "full" output, real wallet address shortening, BSC RPC readiness probes, and trade permission mode resolution. They're aggregated into `builtinContributors` in `awareness/contributors/index.ts`, and **`builtinContributors` is never imported by anything in the workspace**. The agent's `AwarenessRegistry` (`agent/src/awareness/registry.ts`) exposes `register(contributor)`; nothing calls `register` with any of these contributors. The whole subdirectory is dead-on-arrival.

---

## Per-file index

Status per file. Files are listed in subdirectory order. `[!]` = audited, findings recorded; `[x]` = audited, no changes warranted; `[-]` = audited, slated for deletion (see §A); `[?]` = audited but blocked.

### autonomy/

- [!] `autonomy/index.ts` — 485 LOC. boundaries:single file in its own subdirectory, consumed only by `state/useChatState.ts` + `state/useDataLoaders.ts`; should be `state/autonomy-event-merger.ts`. Otherwise clean — typed merge logic for stream-event envelopes. types:no `any`, no `unknown` that should be narrowed.

### awareness/contributors/ — 9 files, all dead

- [-] `awareness/contributors/index.ts` — 20 LOC. Aggregates 8 contributors into `builtinContributors`; nothing imports the aggregate. Dead.
- [-] `awareness/contributors/cloud.ts` — 22 LOC. Real impl, never registered.
- [-] `awareness/contributors/connectors.ts` — Real impl, never registered.
- [-] `awareness/contributors/features.ts` — Real impl, never registered.
- [-] `awareness/contributors/permissions.ts` — Real impl, never registered.
- [-] `awareness/contributors/plugin-health.ts` — Real impl, never registered.
- [-] `awareness/contributors/provider.ts` — Real impl, never registered.
- [-] `awareness/contributors/runtime.ts` — Real impl, never registered.
- [-] `awareness/contributors/wallet.ts` — 98 LOC, the most-complete contributor. Real wallet+trade-mode reporting. Dead because the registry never calls `register(walletContributor)` from anywhere.

### benchmark/ — 7 files, all live

- [x] `benchmark/server.ts` — Python benchmark runners (`packages/benchmarks/{terminal,vending,rlm}-bench`) invoke this via `node --import tsx`. CLI-style entry, not a barrel.
- [x] `benchmark/cua-routes.ts`, `mock-plugin-base.ts`, `mock-plugin.ts`, `plugin.ts`, `replay-capture.ts`, `server-utils.ts` — internals of `benchmark/server.ts`. Live.

### character/

- [x] `character/character-draft-helpers.ts` — 350 LOC. CRUD + draft management for character actions; consumed by `CharacterEditor.tsx`.

### content-packs/ — 4 files, all live

- [x] `content-packs/index.ts`, `apply-pack.ts`, `bundled-packs.ts`, `load-pack.ts` — consumed by `components/settings/AppearanceSettingsSection.tsx`.

### diagnostics/

- [x] `diagnostics/integration-observability.ts` — 132 LOC. Telemetry span helper for cross-boundary calls (`cloud`/`wallet`/`marketplace`/`mcp`). Used widely.

### events/

- [x] `events/index.ts` — 125 LOC of typed `eliza:*` event constants + dispatcher helpers. Replaces stringly-typed `dispatchEvent` calls. Solid.

### hooks/ — 22 files

- [-] `hooks/useCanvasWindow.ts` — 382 LOC dead. (See §A.14.)
- [-] `hooks/useMusicPlayer.ts` — 166 LOC dead. (See §A.15.)
- [x] `hooks/useKeyboardShortcuts.ts` — 41 LOC. Re-export wrapper around `@elizaos/ui` + app-specific `COMMON_SHORTCUTS`. Correct dedup pattern (NOT a parallel impl as Layer 5b suggested for an earlier state).
- [x] `hooks/useMediaQuery.ts` — 49 LOC. `useSyncExternalStore`-based; not in `@elizaos/ui`. Live (11 hits).
- [!] `hooks/useContextMenu.ts` — 183 LOC. Live. Could be in `@elizaos/ui` but is app-specific (5 hits).
- [x] `hooks/useAccounts.ts` — 337 LOC. Live (consumed by `AccountList.tsx`).
- [x] `hooks/useActivityEvents.ts` — Live (9 hits).
- [x] `hooks/useAuthStatus.ts` — Live.
- [x] `hooks/useBugReport.tsx` — Live (8 hits). The `.tsx` extension is correct: contains JSX in the dialog markup.
- [x] `hooks/useChatAvatarVoiceBridge.ts` — Live (6 hits).
- [x] `hooks/useRenderGuard.ts`, `useSecretsManagerModal.ts`, `useSecretsManagerShortcut.ts`, `useSignalPairing.ts`, `useStreamPopoutNavigation.ts`, `useVoiceChat.ts`, `useWhatsAppPairing.ts`, `useWorkflowGenerationState.ts` — all live.
- [!] `hooks/voice-chat-playback.ts`, `voice-chat-recording.ts`, `voice-chat-types.ts` — boundaries:**misplaced**, belong under `voice/`. The three files import each other; `useVoiceChat.ts` re-exports them. Move + rename leaves no consumer surface change.
- [x] `hooks/index.ts` — 13 LOC barrel.

### i18n/

- [x] `i18n/index.ts` — 76 LOC. `t()` + `createTranslator()` + `normalizeLanguage()`. Clean.
- [x] `i18n/messages.ts` — 33 LOC. Loads 7 JSON locale files. **All 7 locales fully translated (3 242 keys each)** — no orphan keys.

### permissions/

- [x] `permissions/types.ts` — 17 LOC re-export of `@elizaos/shared/contracts/permissions`. Clean.

### platform/ — 12 files, all live

- [x] `platform/empty-node-module.ts` — vite resolver alias for browser builds (referenced by `apps/app/vite.config.ts:83-84` and `eliza/packages/app/vite.config.ts`). Live.
- [x] `platform/browser-launch.ts`, `cloud-preference-patch.ts`, `desktop-permissions-client.ts`, `index.ts`, `init.ts`, `ios-runtime.ts`, `is-native-server.ts`, `native-plugin-entrypoints.ts`, `onboarding-reset.ts`, `types.ts`, `window-shell.ts` — all live.

### security/ — 7 files, all live, hardened

- [x] `security/agent-vault-id.ts` — 42 LOC. Keychain account name builder; deterministic per secret-kind.
- [x] `security/cloud-secret-store.ts` — 73 LOC. Vault-backed cloud-secret read/write thin wrapper.
- [x] `security/export-guard.ts` — 191 LOC. Two-phase nonce + IP-bound rate limit. (See §D.)
- [x] `security/hydrate-wallet-keys-from-platform-store.ts` — 130 LOC. Boot-time hydration of wallet keys from OS keychain into runtime memory.
- [x] `security/platform-secure-store-node.ts` — 361 LOC. Stdin-fed Keychain / `secret-tool` writes; PATH-walking `secretToolOnPath`. Hardened. (See §D.)
- [x] `security/platform-secure-store.ts` — 70 LOC. Browser-side facade over `electrobun-rpc`.
- [x] `security/wallet-os-store-actions.ts` — 150 LOC. UI-level RPC actions for OS-keychain-backed wallets.

### services/ — 50 files

#### Top-level services (live)

- [x] `services/account-pool.ts` (997 LOC), `account-usage.ts` (273), `auth-store.ts` (656) — auth/account orchestration; live.
- [x] `services/cloud-jwks-store.ts` (3 hits) — JWKS cache for cloud auth.
- [x] `services/connector-target-catalog.ts`, `discord-target-source.ts` — consumed by `runtime/eliza.ts:742, 795`. Live.
- [x] `services/github-credentials.ts`, `steward-credentials.ts` — credential resolvers; live.
- [x] `services/n8n-auth-bridge.ts`, `n8n-autostart.ts`, `n8n-dispatch.ts`, `n8n-mode.ts`, `n8n-runtime-context-provider.ts`, `n8n-sidecar.ts` — n8n cluster (~3 700 LOC). All consumed via dynamic imports from `runtime/eliza.ts:543, 557, 661, 728, 746, 1428`. Live.
- [x] `services/plugin-installer.ts` (872 LOC), `secrets-manager-installer.ts` (602), `steward-sidecar.ts` (539), `trigger-event-bridge.ts` (283), `vault-bootstrap.ts` (331), `vault-mirror.ts` — all live (some via dynamic import using package-export paths like `@elizaos/app-core/services/vault-bootstrap`).

#### Top-level services (dead / duplicate)

- [-] `services/sandbox-manager.ts` — 490 LOC duplicate of agent's. (§A.1)
- [-] `services/core-eject.ts` — 689 LOC duplicate of core's `coreManagerService`. (§A.2)
- [-] `services/plugin-eject.ts` — 636 LOC duplicate of core's `pluginManagerService`. (§A.3)
- [-] `services/update-notifier.ts` — duplicate of `npm/update-notifier` semantics on top of `@elizaos/agent`. (§A.4)

#### `services/local-inference/` — 18 files, all live

- [x] All 18 files in `services/local-inference/` are consumed by `runtime/ensure-local-inference-handler.ts`, `components/local-inference/hub-utils.ts`, `api/client-local-inference.ts`. The cluster reads end-to-end (catalog → downloader → engine → registry → router-handler → handler-registry → service). **No overlap with `agent/src/services/`**: agent does not own a local-inference subsystem.

#### `services/steward-sidecar/` — 5 files, all live

- [x] `health-check.ts`, `helpers.ts`, `process-management.ts`, `types.ts`, `wallet-setup.ts` — split-out of the steward-sidecar boot lifecycle. Consumed by the top-level `services/steward-sidecar.ts`. Live.

### terminal/

- [x] `terminal/links.ts` — 28 LOC OSC8 hyperlink helper.
- [x] `terminal/palette.ts` — 11 LOC color tokens.
- [x] `terminal/theme.ts` — 41 LOC chalk facade. Clean.

### themes/

- [x] `themes/apply-theme.ts` — 162 LOC. Applies `ThemeDefinition` from `@elizaos/shared` to document root via CSS custom properties. Live.

### types/

- [!] `types/index.ts` — 728 LOC, 70 exports. dedup:`ConfigUiHint`/`ConfigUiHints` duplicated in `agent/src/config/schema.ts:35` and :86. boundaries:30+ connector-status types belong in `@elizaos/shared/contracts/connectors` so both renderer and agent import the same shape (currently agent reads them via the API client types, which is an indirection). types:no weak unions, no `any`.

### utils/ — 35 files

#### Dead utils (zero live consumers)

- [-] `utils/api-request.ts` — 87 LOC. `fetchWithTimeout` + `resolveCompatApiToken` — never imported.
- [-] `utils/rate-limiter.ts` — 79 LOC. `createRateLimiter` factory — never imported.
- [-] `utils/namespace-defaults.ts` — `ensureNamespaceDefaults` — never imported.
- [-] `utils/browser-tab-kit-types.ts` — 93 LOC. `BrowserTabKit*` interfaces — never imported.

#### Live utils

- [x] `utils/format.ts` (18 hits), `env.ts` (6), `tts-debug.ts` (4), `streaming-text.ts` (4), `name-tokens.ts` (4), `trajectory-format.ts` (3), `sql-compat.ts` (3), `serialise.ts` (3), `labels.ts` (3), `number-parsing.ts` (2), `knowledge-upload-image.ts` (2), `character-message-examples.ts` (2), `assistant-text.ts` (2), `subscription-auth.ts`, `owner-name.ts`, `errors.ts`, `desktop-bug-report.ts`, `cloud-status.ts`, `clipboard.ts`, `eliza-cloud-model-route.ts`, `eliza-globals.ts`, `eliza-root.ts` (1 — dynamic import in `cli/program/register.dashboard.ts`), `exec-safety.ts` (used by `config/zod-schema.core.ts`), `globals.ts` (1 — `cli/program/preaction.ts`), `log-prefix.ts` (6), `openExternalUrl.ts`, `asset-url.ts`, `desktop-dialogs.ts`, `desktop-workspace.ts`, `browser-tabs-renderer-registry.ts` — all live.
- [!] `utils/index.ts` — 14 LOC barrel. **Does not export 21 of the 35 utils** (selective barrel; e.g. `globals.ts`, `errors.ts`, `log-prefix.ts`, `exec-safety.ts`, `eliza-root.ts`, `serialise.ts`, `sql-compat.ts`, `name-tokens.ts`, `trajectory-format.ts`, `subscription-auth.ts`, `streaming-text.ts`, `rate-limiter.ts`, `api-request.ts`, `namespace-defaults.ts`, `owner-name.ts`, `knowledge-upload-image.ts`, `labels.ts`, `desktop-bug-report.ts`, `desktop-workspace.ts`, `browser-tab-kit-types.ts`, `browser-tabs-renderer-registry.ts` are intentionally not in the barrel). slop:two utility filenames collide on the word "globals" (`globals.ts` = CLI verbose state; `eliza-globals.ts` = `window.__ELIZA_*`) — different concepts, same prefix.

### voice/

- [x] `voice/character-voice-config.ts`, `index.ts`, `types.ts` — live. (See §B for the misplaced `hooks/voice-chat-*` files that should join this subdir.)

### widgets/

- [x] `widgets/WidgetHost.tsx`, `index.ts`, `registry.ts`, `types.ts`, `useChatSidebarVisibility.ts`, `visibility.ts` — chat-sidebar widget registry + visibility-override layer. All live; `visibility.ts` adds a 60th `localStorage` key (`eliza:chat-sidebar:visibility`) to the persistence-sprawl tally already opened by Layer 8.

---

## Cross-layer consequences

- **Layer 6 (agent)** — `awareness/contributors/` should be moved into `agent/src/awareness/contributors/` *and* registered with `getGlobalAwarenessRegistry()` at agent boot, OR the entire subdirectory should be deleted. Either decision unblocks ~379 LOC.
- **Layer 8 (state)** — `autonomy/index.ts` should fold into `state/`. `widgets/visibility.ts` adds one more `localStorage` key to Layer 8's headline "60 unique storage keys" — bumping that to 61.
- **Layer 5a (shared)** — `types/index.ts` connector-status types should migrate into `@elizaos/shared/contracts/connectors`. The `ConfigUiHint`/`ConfigUiHints` duplication should resolve to one canonical owner in `@elizaos/shared/contracts/config`.
- **Layer 5b (`@elizaos/ui`)** — Layer 5b's "parallel `useKeyboardShortcuts` impl" finding does not apply to the current state of `hooks/useKeyboardShortcuts.ts`; the file is already a re-export wrapper. Layer 5b's notes should be updated.
- **Layer 7 (UI)** — moving the dead hooks (#14/#15) is invisible to Layer 7.

## Verification commands run

```bash
# Inventory
find eliza/packages/app-core/src -type f \( -name "*.ts" -o -name "*.tsx" \) \
  ! -name "*.d.ts" ! -name "*.test.*" \
  -not -path "*/api/*" -not -path "*/runtime/*" \
  -not -path "*/components/*" -not -path "*/app-shell/*" \
  -not -path "*/shell/*" -not -path "*/chat/*" \
  -not -path "*/navigation/*" -not -path "*/state/*" \
  -not -path "*/config/*" -not -path "*/providers/*" \
  -not -path "*/registry/*" -not -path "*/onboarding/*" \
  -not -path "*/bridge/*" -not -path "*/cli/*" | sort
# → 179 files

# Subdir LOC profile
for d in autonomy awareness benchmark character content-packs diagnostics \
         events hooks i18n permissions platform security services styles \
         terminal themes types utils voice widgets; do …; done

# Dead-code verification (per top-15 candidate, symbol-grepped across
# eliza/, apps/, packages/ minus the file's own definition)
grep -rnE 'symbol-name' --include="*.ts" --include="*.tsx" eliza apps packages
# → results above

# Security: child_process, shell:true, secret-in-argv
grep -rnE "child_process|spawn\(|exec\(|execSync" services/ security/ permissions/ platform/
grep -rnE "shell\s*:\s*true|shell:true" services/ security/ permissions/ platform/
# → 12 hits (all execFile/spawn-with-array); 0 hits

# Type duplication
grep -nE "ConfigUiHint" agent/src/config/schema.ts app-core/src/types/index.ts
# → both
```

No tests run (this audit pass touches no source).
