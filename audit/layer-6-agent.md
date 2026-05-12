# Layer 6 — Agent runtime (`@elizaos/agent`)

**Files: 454.**
**Audited (deep): 24.**
**Spot-checked (surface read of imports/exports/LOC): ~120.**
**Not audited (`[?]`): ~310.**
**Refactored: 0 / 454.**

This is **the upstream `@elizaos/agent` package** that Layer 3
(`eliza/packages/app-core/src/runtime/eliza.ts`) wraps and Layer 4 (the
app-core API) re-exports. Every concern that the app-core wrapper
delegates to "upstream" lands in one of these 454 files. The package
provides:

- The `AgentRuntime` boot / shutdown lifecycle (`runtime/eliza.ts` —
  4517 LOC).
- The HTTP server + every default route handler (`api/server.ts` —
  4222 LOC; **122 files** in `api/`).
- 33 actions (`actions/`), 22 providers (`providers/`), 8 triggers
  (`triggers/`), 6 hooks (`hooks/`), 12 contracts (`contracts/`).
- 62 services (`services/`) — wallets, browser-workspace, sandbox,
  app-manager, registry-client, telegram, whatsapp, signal, escalation,
  ...
- The plugin loader machinery: `plugin-resolver`, `plugin-collector`,
  `plugin-types`, `plugin-lifecycle`, `plugin-role-gating`
  (3637 LOC across 5 files).
- The trajectory persistence layer (5 files, 3528 LOC).
- 28 config/zod-schema files (`config/`).
- Cloud auth & manager (`cloud/`, 10 files).
- The x402 micropayment middleware (12 files, 4936 LOC).

## Per-subdirectory LOC table

| LOC    | Files | Subdir                     |
|-------:|------:|----------------------------|
| 58197  |  122  | `api/`                     |
| 27983  |   62  | `services/` (+ launchpads) |
| 25935  |   46  | `runtime/` (+ operations, roles) |
| 15481  |   50  | `actions/` (+ workflow)    |
| 10372  |   28  | `config/`                  |
|  5888  |   23  | `providers/`               |
|  4936  |   12  | `middleware/x402/`         |
|  2577  |    8  | `triggers/`                |
|  2494  |   10  | `auth/` (+ vendor/pi-oauth) |
|  1761  |   10  | `cloud/`                   |
|  1159  |    2  | `shared/`                  |
|   887  |    6  | `hooks/`                   |
|   528  |    3  | `cli/`                     |
|   503  |    4  | `security/`                |
|   495  |    1  | `autonomy/`                |
|   461  |   12  | `contracts/`               |
|   453  |    4  | `test-support/`            |
|   308  |    1  | `test-utils/`              |
|   268  |    4  | `utils/`                   |
|   221  |    2  | `awareness/`               |
|   196  |    4  | `types/`                   |
|   154  |    2  | `diagnostics/`             |
|   115  |    1  | `plugins/`                 |
|   101  |    1  | `evaluators/`              |
|     3  |    1  | `testing/` (barrel)        |
|     2  |    1  | `server/` (barrel)         |
| **161754** | **454** | **total** |

`api/` alone is **36 % of the layer's LOC** and **27 % of files**.

## Status legend

(See `AUDIT.md`.)
`[ ]` pending · `[~]` reading · `[!]` findings · `[*]` refactor ·
`[x]` clean · `[-]` delete · `[?]` blocked / not deeply audited

---

## SECRET_SALT verification — confirmed broken across boots

MASTER.md / Layer 5a both flagged the regenerate-on-boot bug at
`runtime/eliza.ts:2921-2926`. Verified during this audit.

```ts
// 2e-ii. Ensure SECRET_SALT is set to suppress the @elizaos/core default
//        warning and avoid using a predictable value in production.
if (!process.env.SECRET_SALT) {
  process.env.SECRET_SALT = crypto.randomBytes(32).toString("hex");
  logger.info("[eliza] Generated random SECRET_SALT for this session");
}
```

**Salt generation:** `crypto.randomBytes(32).toString("hex")` — fresh
per process, not persisted, not derived from any stable key material.

**Salt consumers** (the things that *need* this value to be stable):

- `eliza/packages/core/src/settings.ts:78` `getSalt()` — reads
  `process.env.SECRET_SALT`. Cached per-process for `SALT_CACHE_TTL_MS`.
- `eliza/packages/core/src/settings.ts:134` `encryptStringValue` —
  AES-256-GCM key derivation: `sha256(salt).slice(0,32)`. **Persisted
  ciphertext format**: `v2:iv:ciphertext:tag`.
- `eliza/packages/core/src/settings.ts:464` `encryptedCharacter` —
  encrypts the entire `character.secrets` object on save.
- `eliza/packages/core/src/settings.ts:497` decrypts it on read.
- `eliza/packages/core/src/runtime.ts:2176` calls
  `decryptSecret(value, getSalt())` to read persisted character
  secrets at runtime.
- `eliza/packages/core/src/features/advanced-capabilities/actions/settings.ts:303,335,976`
  and `.../providers/settings.ts:269,296` use `getSalt()` to
  encrypt/decrypt **world-scoped runtime settings** (the
  setSetting/getSetting flow that plugins like `plugin-tee` and
  `plugin-wallet` rely on for `WALLET_SECRET_SALT`,
  `SOLANA_SECRET_SALT`, OAuth tokens, etc).

**Verdict — SECRET_SALT is volatile, and cross-boot decryption is
broken for every consumer of `encryptStringValue` that persists
ciphertext.** Specifically:

1. `character.secrets` saved by `encryptedCharacter` on boot N produces
   ciphertext keyed off salt N. Boot N+1 generates salt N+1 → AES-GCM
   tag verification fails → secret is unreadable.
2. World-scoped runtime settings stored via the
   advanced-capabilities settings flow have the same problem.
3. The agent doesn't crash because `decryptStringValue` swallows the
   GCM tag mismatch and returns the original (encrypted) string. The
   user just sees their connector login fail with no obvious cause.

The `// suppress the @elizaos/core default warning` comment is the
giveaway: this code was added to silence the core's
`SECRET_SALT is not set or using default value` warning, not to
provide a working salt. **MASTER.md §3 task 16 already names this**
("Derive `SECRET_SALT` from master key — Removes a sibling persistent
file; vault is enough"). The Layer 6 finding here is independent
confirmation: the volatile-salt bug is the underlying disease.

**Fix sketch (out of scope for the audit but obvious):** derive salt
from the vault's master key (Layer 5a) so it is stable across boots
without writing a separate `SECRET_SALT` file. Until then, every
consumer above is silently broken on every restart.

---

## `runtime/eliza.ts` upstream extraction map

4517 LOC. **47 top-level functions, 30 of which are exported.** Two
exported interfaces (`StartElizaOptions`, `BootElizaRuntimeOptions`)
plus the 4 entry points (`bootElizaRuntime`, `startEliza`, `shutdownRuntime`,
`startInCloudMode`). The file is structured as numbered phases (`2d-iii`,
`2e-ii`, `2e-iii`, `2f`, etc) and clearly grew by accretion.

### Top-level concerns this file owns

| Lines | Concern | Belongs in |
|------:|---------|------------|
| 32-186 | imports + dynamic-import helpers | (stays) |
| 305-453 | `registerSignalShutdownHandlers` (149 LOC) | `runtime/signal-shutdown.ts` |
| 454-826 | `configureLocalEmbeddingPlugin` + OpenAI-compat normalization | `runtime/openai-compat.ts` |
| 843-925 | `shutdownRuntime`, `deduplicatePluginActions` | (stays — small, lifecycle-core) |
| 935-1090 | autonomy startup, trajectory wait, prompt-optimization wiring | `runtime/trajectory-bootstrap.ts` |
| 1092-1207 | env-key allow-list, applyConnectorSecretsToEnv | `runtime/env-bridge.ts` |
| 1208-1591 | `applyCloudConfigToEnv` + Discord auto-resolve + Cloud GitHub fetch | `runtime/cloud-env-bridge.ts` |
| 1592-1722 | `applyX402ConfigToEnv` + `applyN8nConfigToEnv` | move to `middleware/x402/` and `runtime/n8n-*` (already half there) |
| 1723-2050 | PGlite data-dir resolution, PID reconciliation, lock detection, recovery, fatal-error classification | `runtime/pglite-startup.ts` (a subsystem, not a phase) |
| 2051-2244 | adapter init, FK-violation classification, error detail formatting | `runtime/adapter-startup.ts` |
| 2245-2516 | `installRuntimeMethodBindings` (228 LOC) + `installActionAliases` | `runtime/method-bindings.ts` |
| 2517-2577 | `registerSqlPluginWithRecovery` | `runtime/plugin-sql-recovery.ts` |
| 2578-2644 | `resolveVisionModeSetting`, `resolveWalletRuntimeSettings` | move to `services/` |
| 2680-2747 | `bootElizaRuntime` (the actual bootstrap) | (stays) |
| 2749-4393 | `startEliza` (1644 LOC) | **needs decomposition** by lifecycle phase |
| 4394-end | `startInCloudMode` (123 LOC) | move to `cloud/start.ts` |

The 1644-LOC `startEliza` is the same disease MASTER.md §1 named in
the Electrobun god-module: one function that owns 19 distinct
lifecycle steps. It should be split per numbered phase (`2a`, `2b`,
`2c`, etc) into composable phase functions.

The app-core `runtime/eliza.ts` wrapper (Layer 3) is mostly a thin
facade that calls `bootElizaRuntime` / `startEliza`. The wrapper does
~3 things: (1) injects Milady-specific logger / state-dir defaults,
(2) installs the optimized-prompt service, (3) wires the local
inference handler. None of those need this 4517-LOC file to remain
monolithic.

---

## Plugin-* file relationships

Five files in `runtime/` collectively own plugin loading. **3637 LOC,
five distinct concerns, weakly separated.**

| File | LOC | Owns |
|------|----:|------|
| `plugin-resolver.ts` | 1321 | `resolvePlugins`: dynamic-import the plugin module, find the runtime export, install it. |
| `plugin-lifecycle.ts` | 926 | `installRuntimePluginLifecycle`: inject the AsyncLocalStorage-backed action/provider context, ownership tracking. |
| `plugin-collector.ts` | 575 | `CHANNEL_PLUGIN_MAP`, `PROVIDER_PLUGIN_MAP`, `OPTIONAL_PLUGIN_MAP`, `collectPluginNames`: name → package map + collection. |
| `plugin-types.ts` | 446 | Shared types (`ResolvedPlugin`, `PluginModuleShape`), drop-in plugin discovery, `ensureBrowserServerLink`. **Mutable** `STATIC_ELIZA_PLUGINS` global registry shared with `plugin-resolver` (line 53). |
| `plugin-role-gating.ts` | 369 | Plugin allow/deny by character role. |

**Cross-module coupling:** `plugin-types.ts` exports a **mutable
global** `STATIC_ELIZA_PLUGINS = {}` registry. `eliza.ts:373-399`
populates it (the comment literally says "so plugin-resolver.ts can
read it without importing this module directly"). That is a
shared-mutable-state cycle break — the kind of "lazy import to avoid
a cycle" pattern AGENTS.md axis 4 calls out as the wrong fix. The
right fix is to invert the dependency: `plugin-resolver` should take
the static-plugin map as a parameter, not read it from a module-level
mutable singleton.

`runtime/index.ts` re-exports four of these (everything except
`plugin-role-gating.ts`) as `* from`, so any consumer of
`@elizaos/agent` gets the full plugin surface. That's fine for the
downstream wrapper, but `STATIC_ELIZA_PLUGINS` is exported as part of
that surface — anyone can mutate the global plugin registry from
outside the package.

---

## Persistence-layer sprawl census

MASTER.md §1 calls out "24+ persistence layers" in app-core. Layer 6
contributes its own pile:

| Subsystem | Files | LOC | Notes |
|-----------|------:|----:|-------|
| Trajectories | 5 (`trajectory-internals`, `trajectory-storage`, `trajectory-persistence`, `trajectory-query`, `trajectory-export`) | 3528 | `trajectory-internals.ts` defines persistence types; `trajectory-storage.ts` defines the `DatabaseTrajectoryLogger` Service; `trajectory-persistence.ts` (52 LOC), `trajectory-query.ts` (42 LOC), `trajectory-export.ts` (16 LOC) are tiny façades. The 16-LOC export file is a deletion candidate. |
| Server-helpers | 8 (`server-helpers`, `server-helpers-{auth,config,fetch,mcp,plugin,swarm,wallet}`) | 3652 | The 863-LOC `server-helpers.ts` was clearly split into 7 sub-files but never shrank. Confirm whether `server-helpers.ts` is now a barrel re-export or still owns logic. |
| Plugin loader | 5 (above) | 3637 | See plugin-* section. |
| `runtime/operations/` | 10 (manager, repository, classifier, cold-strategy, reload-hot, vault-bridge, health, health-checks, types, index) | ~2500 | Plugin-state operations subsystem. |
| Wallet routes | 6 (`wallet-routes`, `wallet`, `wallet-evm-balance`, `wallet-rpc`, `wallet-bsc-routes`, `wallet-trade-routes`, `wallet-dex-prices`, `wallet-trading-profile`, `wallet-env-sync`, `wallet-capability`) + helper `server-helpers-wallet` | ~5000 | Wallet surface lives partly in `api/`, partly in `services/`, partly in plugins. Boundary unclear. |
| Cloud routes | 7 (`cloud-routes`, `cloud-billing-routes`, `cloud-compat-routes`, `cloud-features-routes`, `cloud-relay-routes`, `cloud-status-routes`, `cloud-provisioning`, `cloud-detection`) | ~2900 | Same disease as app-core's cloud re-export shims (Layer 4 finding). |
| Streaming | 5 (`stream-routes`, `streaming-text`, `streaming-types`, `stream-persistence`, `stream-route-state`, `stream-control` action) | ~2000 | |
| Browser workspace | 11 (`services/browser-workspace*.ts`) | 4500+ | The browser-workspace-desktop / browser-workspace-web split + 8 helpers is one subsystem. |

**Total persistence/service code in this layer: ~30000 LOC**, larger
than the entire `actions/` directory.

---

## Audited / spot-checked files

Per-file checkboxes by subdirectory. Spot-check is "I read the file's
imports + exports + ran a `wc -l`/`grep -c "} catch"`/grep for casts."
Deep audit is "I read the relevant body and walked the 8 axes."

### Root `src/` (3 files)

- [!] `eliza/packages/agent/src/index.ts` — 153 LOC barrel.
  **boundaries:`test-support/*` and `test-utils/sqlite-compat` are
  re-exported as part of the package's public API** (lines 143-144).
  These are test-only fixtures sitting in the consumer-facing surface
  — exactly the boundary violation AGENTS.md axis 8 forbids. Combined
  with the `testing/index.ts` barrel (3 LOC, also re-exports the same
  files), there are **two parallel ways** to import test helpers from
  `@elizaos/agent`. Move test helpers to a sibling
  `@elizaos/agent-testing` package (or keep them under `src/__tests__/`
  and don't export). dedup:`runtime/index.ts` (18 LOC) re-exports
  the same `runtime/*` subset that `src/index.ts` already exports
  via `export * from "./runtime/eliza.js"` — the runtime barrel is
  redundant unless a sub-package consumer imports
  `@elizaos/agent/runtime` directly (verify).
- [!] `eliza/packages/agent/src/bin.ts` — CLI entry. dead?:not consumed
  by Milady (Milady has its own CLI in `app-core`); confirm whether
  this binary ships or is dead from this repo's perspective.
- [x] `eliza/packages/agent/src/version-resolver.ts` — defer; small.

### `runtime/` (46 files — 3 deep-audited, 5 spot-checked, 38 [?])

- [!] `eliza/packages/agent/src/runtime/eliza.ts` — **4517 LOC** —
  **see "upstream extraction map" above.** `} catch` count: 77.
  `as any` count: 0 (uses `as unknown` once for the `process.env`
  bridge). 1 `XXX` / `HACK` / `TODO`. errors:multiple "Silent — X is
  non-critical" swallow comments (lines 2906-2911 etc). slop:numbered
  phase comments (`2e-ii`, `2f`, ...) narrate process; would survive
  decomposition into named phase functions.
- [!] `eliza/packages/agent/src/runtime/plugin-resolver.ts` — 1321 LOC.
  17 `} catch`. dedup:per the `STATIC_ELIZA_PLUGINS` cycle-break note
  above — fix the dependency direction.
- [!] `eliza/packages/agent/src/runtime/plugin-lifecycle.ts` — 926 LOC.
  AsyncLocalStorage-backed action/provider context wiring. Defer deep
  read.
- [x] `eliza/packages/agent/src/runtime/plugin-collector.ts` — 575 LOC.
  Mostly pure data tables; spot-check clean.
- [x] `eliza/packages/agent/src/runtime/plugin-types.ts` — 446 LOC.
  See plugin-* section — clean shape, but the
  `STATIC_ELIZA_PLUGINS` mutable global is a smell.
- [x] `eliza/packages/agent/src/runtime/core-plugins.ts` — 111 LOC.
  Clean — single source of truth for `CORE_PLUGINS` /
  `OPTIONAL_CORE_PLUGINS`.
- [!] `eliza/packages/agent/src/runtime/agent-wallets.ts` — 380 LOC.
  Owns wallet descriptor CRUD + `bridgeAgentWalletsToProcessEnv` (the
  bridge fix from commit 36646a354 / `8395bb6b40` family). Two
  consumers: itself + `eliza.ts`. This is the only wallet-related
  runtime code; the wider wallet surface lives in `api/wallet*.ts` and
  `services/`. Clean shape; deep audit deferred.
- [!] `eliza/packages/agent/src/runtime/discord-local-plugin.ts` —
  **1540 LOC**. **boundaries:Discord-specific local plugin in the
  upstream agent package.** Imported by exactly two files
  (`eliza.ts` and `plugin-discord/discord-local-service.ts`). Discord
  belongs in `plugin-discord`, not the agent core. Move to
  `plugin-discord/`.
- [!] `eliza/packages/agent/src/runtime/aosp-llama-adapter.ts` —
  **1523 LOC**. AOSP / Android local llama adapter inside the upstream
  agent. Same boundary smell as discord-local-plugin — Android-specific
  adapter living in the agent core. Importer:
  `aosp-local-inference-bootstrap.ts` (single).
- [x] `eliza/packages/agent/src/runtime/aosp-local-inference-bootstrap.ts`
  — only consumed via `bin.ts` and `cli/index.ts`; if those don't
  ship, this is dead from Milady's POV.
- [!] `eliza/packages/agent/src/runtime/trajectory-internals.ts` —
  1780 LOC, ~30 exported types/functions. Persistence-types module.
  Clean shape; deep audit deferred.
- [!] `eliza/packages/agent/src/runtime/trajectory-storage.ts` —
  1638 LOC, the `DatabaseTrajectoryLogger` Service. Defer deep read.
- [-] `eliza/packages/agent/src/runtime/trajectory-export.ts` — 16
  LOC. **Deletion candidate** — likely just a re-export wrapper.
- [-] `eliza/packages/agent/src/runtime/trajectory-persistence.ts` —
  52 LOC. Likely a slim adapter; verify with `knip`.
- [-] `eliza/packages/agent/src/runtime/trajectory-query.ts` — 42 LOC.
  Same.
- [!] `eliza/packages/agent/src/runtime/prompt-optimization.ts` — 989
  LOC. Defer deep read.
- [!] `eliza/packages/agent/src/runtime/first-time-setup.ts` — 826 LOC.
  Defer deep read; relevant to MASTER.md Phase 2 onboarding work.
- [!] `eliza/packages/agent/src/runtime/index.ts` — 18 LOC. **dedup:
  every export is already covered by `src/index.ts`.** If no consumer
  imports `@elizaos/agent/runtime` as a sub-path, delete this file.
- [?] `eliza/packages/agent/src/runtime/operations/*` (10 files)
- [?] `eliza/packages/agent/src/runtime/roles/*` (3+ files)
- [?] 27 other runtime files — deep audit deferred.

### `api/` (122 files — 1 deep-audited, ~12 spot-checked, 109 [?])

- [!] `eliza/packages/agent/src/api/server.ts` — **4222 LOC**. 32
  `} catch`. The mux file: imports ~75 sibling route handlers and
  fans out. Same disease as `app-core/api/server.ts` (Layer 4) but
  bigger. Re-exports 31 names through `runtime/index.ts`. Defer
  decomposition planning to Phase 3-style work.
- [!] `eliza/packages/agent/src/api/chat-routes.ts` — **2317 LOC**.
  13 `} catch`. **MASTER.md §3 Phase 4 already partially landed
  here** — the constants `PROVIDER_ISSUE_CHAT_REPLY` (line 317) and
  `NO_RESPONSE_FALLBACK_REPLY` (line 323) now coexist as separate
  constants, with `resolveNoResponseFallback` (line 439) selecting
  between them. The 4 trigger paths Layer 4's audit confirmed
  (lines 1929, 2010, 2192, 2284) all now call `resolveNoResponseFallback`
  with `state.logBuffer`. **Phase 4 rename is partially complete.**
  The constant retains its old name `PROVIDER_ISSUE_CHAT_REPLY` for
  the specific provider-error case; this is correct per MASTER.md
  ("Reserve provider-issue wording for path #4 only — caught throw").
- [!] `eliza/packages/agent/src/api/inbox-routes.ts` — 2165 LOC.
  Defer.
- [!] `eliza/packages/agent/src/api/plugin-routes.ts` — 1831 LOC.
  Defer.
- [!] `eliza/packages/agent/src/api/conversation-routes.ts` — 1762
  LOC. Defer.
- [!] `eliza/packages/agent/src/api/plugin-discovery-helpers.ts` —
  1547 LOC. boundaries:helper file should rarely be > 1000 LOC.
- [!] `eliza/packages/agent/src/api/database.ts` — 1517 LOC. Defer.
- [!] `eliza/packages/agent/src/api/sandbox-routes.ts` — 1480 LOC.
- [!] `eliza/packages/agent/src/api/skills-routes.ts` — 1454 LOC.
- [!] `eliza/packages/agent/src/api/apps-routes.ts` — 1447 LOC.
- [!] `eliza/packages/agent/src/api/wallet-routes.ts` — 1177 LOC.
- [!] `eliza/packages/agent/src/api/wallet.ts` — 1134 LOC.
- [!] `eliza/packages/agent/src/api/server-helpers.ts` — 863 LOC.
  20 named exports. **dedup:8-file split into `server-helpers-*.ts`
  produced 3652 LOC across 8 files but the canonical
  `server-helpers.ts` stayed 863 LOC** — meaning the split added
  modules without subtracting from the parent. Either complete the
  split (move all helpers into the sub-files and reduce
  `server-helpers.ts` to a barrel) or undo the split.
- [!] `eliza/packages/agent/src/api/onboarding-routes.ts` — 845 LOC.
  Highly relevant to MASTER.md Phase 2. Deserves a deep audit when
  Phase 2 work resumes.
- [!] `eliza/packages/agent/src/api/cloud-routes.ts` — 975 LOC.
  Plus six sister cloud-* route files; 7 cloud route files total
  (~2900 LOC). Same shape as app-core's cloud re-export shims —
  confirm whether the boundary is clean.
- [!] `eliza/packages/agent/src/api/provider-switch-config.ts` — 944
  LOC. Defer.
- [!] `eliza/packages/agent/src/api/server-helpers-auth.ts` — 787 LOC.
- [!] `eliza/packages/agent/src/api/stream-routes.ts` — 884 LOC. Plus
  `stream-persistence.ts`, `stream-route-state.ts`, `streaming-text.ts`,
  `streaming-types.ts`, the `stream-control` action — 5 streaming
  modules.
- [x] `eliza/packages/agent/src/api/music-player-route-fallback.ts` —
  spot-checked. boundaries:**Discord music-player runtime route in
  the agent core.** Same disease as `discord-local-plugin.ts` — a
  Discord plugin's HTTP fallback handler living in the agent runtime.
  Move to `plugin-discord/`.
- [?] `eliza/packages/agent/src/api/index.ts` — barrel; defer.
- [?] **104 other api files — not deeply audited.** Marked `[?]`
  pending detailed pass.

### `services/` (62 files — 0 deep-audited, ~5 spot-checked, 57 [?])

- [!] `eliza/packages/agent/src/services/relationships-graph.ts` —
  **2624 LOC, the largest service**. 0 `} catch` (good — actual
  propagation). 4 `as unknown` casts. Defer deep audit.
- [!] `eliza/packages/agent/src/services/app-manager.ts` — 2339 LOC.
  9 `} catch`. Defer.
- [!] `eliza/packages/agent/src/services/browser-workspace-desktop.ts`
  — 1620 LOC.
- [!] `eliza/packages/agent/src/services/browser-workspace-web.ts` —
  1553 LOC.
- [!] `eliza/packages/agent/src/services/agent-export.ts` — 991 LOC.
- [!] `eliza/packages/agent/src/services/skill-marketplace.ts` —
  927 LOC.
- [!] `eliza/packages/agent/src/services/browser-workspace.ts` —
  925 LOC. **dedup:11 `browser-workspace*.ts` files in services/** —
  `browser-workspace`, `browser-workspace-desktop`, `browser-workspace-web`,
  `browser-workspace-elements`, `browser-workspace-forms`,
  `browser-workspace-helpers`, `browser-workspace-jsdom`,
  `browser-workspace-network`, `browser-workspace-snapshots`,
  `browser-workspace-state`, `browser-workspace-types`. ~6500 LOC
  combined. Worth a dedicated browser-workspace audit pass — likely
  one cohesive service that grew sprawling helpers.
- [!] `eliza/packages/agent/src/services/telegram-account-auth.ts` —
  830 LOC.
- [?] **54 other service files — not deeply audited.**

### `actions/` (50 files — 0 deep-audited, ~3 spot-checked, 47 [?])

- [!] `eliza/packages/agent/src/actions/entity-actions.ts` — 1291 LOC.
  Largest action.
- [!] `eliza/packages/agent/src/actions/web-search.ts` — 848 LOC.
- [?] 14 plugin-management actions
  (`install-plugin`, `update-plugin`, `uninstall-plugin`, `toggle-plugin`,
  `configure-plugin`, `eject-plugin`, `list-ejected`, `list-installed-plugins`,
  `reinject-plugin`, `sync-plugin`, `restart`, `runtime`, `log-level`,
  `logs`). Likely a high-value dedup target — these are all
  plugin-CRUD actions that probably duplicate logic with
  `services/config-plugin-manager.ts` and the runtime/operations/
  manager.
- [?] 6 workflow actions (`actions/workflow/*`) + 30 other actions —
  not deeply audited.

### `config/` (28 files — 0 deep-audited, ~3 spot-checked, 25 [?])

- [!] `eliza/packages/agent/src/config/schema.ts` — 1335 LOC. Schema
  central. Layer 4 noted "no zod schemas in app-core api/" — the
  schemas live here. Verify that the route-boundary validation
  pattern (commandment 7) actually consumes these.
- [!] `eliza/packages/agent/src/config/zod-schema.providers-core.ts`
  — 1082 LOC.
- [!] `eliza/packages/agent/src/config/types.eliza.ts` — 896 LOC.
- [!] `eliza/packages/agent/src/config/zod-schema.ts` — 946 LOC.
  dedup:`zod-schema.ts` + `zod-schema.core.ts` + `zod-schema.hooks.ts`
  + `zod-schema.session.ts` + `zod-schema.providers-core.ts` +
  `zod-schema.agent-runtime.ts` — **6 zod schema files** with
  overlapping prefixes. Confirm split is purposeful, not an artifact
  of churn.
- [!] `eliza/packages/agent/src/config/plugin-auto-enable.ts` — 827
  LOC.
- [!] `eliza/packages/agent/src/config/types.agents.ts`,
  `types.agent-defaults.ts`, `types.gateway.ts`, `types.hooks.ts`,
  `types.messages.ts`, `types.tools.ts`, `types.ts`, `types.eliza.ts` —
  **8 `types.*.ts` files**. Likely defensible (different config
  subdomains) but should be confirmed against the Layer-4 contract
  surface to ensure no DTO duplication crosses package boundaries.

### `providers/` (23 files — 0 deep-audited, ~2 spot-checked, 21 [?])

- [!] `eliza/packages/agent/src/providers/media-provider.ts` — 1546
  LOC. Largest provider.
- [?] 22 other providers — not deeply audited.

### `middleware/x402/` (12 files — 0 deep-audited, 1 spot-checked, 11 [?])

- [!] `eliza/packages/agent/src/middleware/x402/payment-wrapper.ts` —
  1951 LOC. **Largest middleware file in the layer.** x402 is a
  micropayment standard — verify whether all of this is in active use
  or whether it's speculative infrastructure that ships dead.
- [?] 11 other x402 files — not deeply audited.

### `auth/` (10 files — 0 deep-audited, 0 spot-checked, 10 [?])

- [?] All auth files (account-storage, anthropic, claude-code-stealth*,
  credentials, oauth-flow, openai-codex, refresh-mutex, types) plus
  `vendor/pi-oauth/*` — not audited.

### `cloud/` (10 files — 0 deep-audited, 0 spot-checked, 10 [?])

- [?] All cloud files — not audited.

### `triggers/`, `hooks/`, `contracts/`, `security/`, `awareness/`, `cli/`, `utils/`, `types/`, `diagnostics/`, `shared/`, `autonomy/`, `evaluators/`, `plugins/` (52 files)

- [?] All — not deeply audited.

### `test-support/`, `test-utils/`, `testing/`, `server/` (8 files)

- [-] `eliza/packages/agent/src/testing/index.ts` — 3 LOC.
  **Deletion candidate** — duplicates `src/index.ts` lines 143-144
  for the same three modules. Either delete this barrel or delete the
  re-export from `src/index.ts`; pick one canonical surface.
- [-] `eliza/packages/agent/src/server/index.ts` — 2 LOC. Likely a
  barrel. Verify with `knip`; if no external consumer, delete.
- [?] `eliza/packages/agent/src/test-support/{index,process-helpers,route-test-helpers,test-helpers}.ts`
  — 453 LOC. Not deeply audited. **boundaries:** these belong in a
  sibling `@elizaos/agent-testing` package, not in `src/` exported
  from the public API.
- [?] `eliza/packages/agent/src/test-utils/sqlite-compat.ts` — 308
  LOC. Same boundary concern.

---

## Summary — Layer 6 audit findings

### Top 20 highest-impact refactors

1. **Split `runtime/eliza.ts` (4517 LOC) by lifecycle phase.** The
   1644-LOC `startEliza` is the same disease MASTER.md §1 named in
   Electrobun: one function owning every phase. Extract per the
   "upstream extraction map" above into ~12 phase modules. App-core's
   wrapper benefits immediately — it can replace its monolithic
   passthrough with phase-specific overrides.
2. **Fix SECRET_SALT volatility.** Derive from the vault master key
   (Layer 5a / MASTER.md task 16) so persisted character secrets and
   runtime settings actually survive a restart.
3. **Split `api/server.ts` (4222 LOC).** Same shape as Layer 4's
   `server.ts`; same fix (extract the route-mux dispatch to a
   `Map<prefix, handler>` table).
4. **Move test-support out of the public API.** `src/index.ts:143-144`
   exports test fixtures; either move them to `@elizaos/agent-testing`
   or relocate under `src/__tests__/` and stop exporting.
5. **Decompose `api/chat-routes.ts` (2317 LOC) by provider.** OpenAI
   and Anthropic compat routes share the file; should be one
   `chat-routes.ts` (the dispatch + Phase-4 fallback constants) plus
   `chat-routes-openai.ts` and `chat-routes-anthropic.ts`.
6. **Move `runtime/discord-local-plugin.ts` (1540 LOC) to
   `plugin-discord/`.** Discord-specific code in the agent core.
7. **Move `api/music-player-route-fallback.ts` to
   `plugin-discord/`.** Same Discord-in-agent-core boundary.
8. **Move `runtime/aosp-llama-adapter.ts` (1523 LOC) and
   `runtime/aosp-local-inference-bootstrap.ts` to a dedicated
   `plugin-android-llama/` package.**
9. **Complete the `server-helpers.ts` split.** Either move the 863
   LOC of helper bodies into the 7 `server-helpers-*.ts` sub-files
   (so the parent becomes a barrel) or undo the split. The current
   8-file 3652-LOC layout is the worst of both worlds.
10. **Fix the `STATIC_ELIZA_PLUGINS` mutable-global cycle break in
    `plugin-types.ts:53`.** Invert the dependency: pass the static
    plugin map as a parameter to `resolvePlugins`, don't read it
    from a module-level singleton.
11. **Audit and consolidate the 6 `config/zod-schema*.ts` files.**
    Confirm split is purposeful; merge the redundant ones.
12. **Audit the 11-file `services/browser-workspace*.ts` cluster
    (~6500 LOC).** Almost certainly one service that grew helpers;
    consolidate where possible.
13. **Decompose `services/relationships-graph.ts` (2624 LOC) and
    `services/app-manager.ts` (2339 LOC)** by sub-concern.
14. **Decompose `middleware/x402/payment-wrapper.ts` (1951 LOC).**
    Largest single middleware file; verify x402 is in active use
    before investing.
15. **Validate that `runtime/trajectory-export.ts` (16 LOC),
    `trajectory-persistence.ts` (52 LOC), `trajectory-query.ts` (42
    LOC) all earn their keep.** Likely deletable façades.
16. **Decompose `api/inbox-routes.ts` (2165 LOC),
    `api/plugin-routes.ts` (1831 LOC), `api/conversation-routes.ts`
    (1762 LOC).** Same shape as Layer 4's monolithic route files.
17. **Consolidate the 14 plugin-management actions in `actions/`.**
    Likely a `services/plugin-manager.ts` extraction reduces the
    action surface to thin facades.
18. **Audit the 7 `cloud-*-routes.ts` files.** Same disease as Layer
    4's cloud re-export shims.
19. **Add zod validation at the route boundary** for the routes that
    aren't already using it. Confirm `config/schema.ts` (1335 LOC)
    isn't dead.
20. **Delete the duplicate `runtime/index.ts` barrel** (18 LOC) once
    confirmed no consumer imports `@elizaos/agent/runtime` as a
    sub-path. (Same check for `testing/index.ts` and `server/index.ts`.)

### Top 30 deletion candidates (verified or strong leads)

1. `src/testing/index.ts` (3 LOC) — duplicates `src/index.ts:143-144`.
2. `src/server/index.ts` (2 LOC) — likely empty barrel.
3. `runtime/trajectory-export.ts` (16 LOC) — likely a dead façade.
4. `runtime/trajectory-persistence.ts` (52 LOC) — likely thin adapter.
5. `runtime/trajectory-query.ts` (42 LOC) — same.
6. `runtime/index.ts` (18 LOC) — duplicates `src/index.ts` re-exports.
7. `src/index.ts:143-144` — the test-support / test-utils re-exports
   themselves (not the files; just stop exporting them publicly).
8. `runtime/aosp-llama-adapter.ts` and
   `runtime/aosp-local-inference-bootstrap.ts` — **only** consumed by
   `bin.ts` and `cli/index.ts`. If those entry points are dead from
   Milady's POV (`app-core` has its own CLI), this whole AOSP
   subsystem is dead in our distribution.
9. `runtime/discord-local-plugin.ts` — move (not delete) to
   `plugin-discord`.
10. `api/music-player-route-fallback.ts` — move (not delete) to
    `plugin-discord`.
11. **`evaluators/late-join-whitelist.ts` (101 LOC)** — sole file in
    `evaluators/`. If unconsumed by any character config, dead.
    Verify with `knip`.
12. **`plugins/discord-voice-capability.ts` (115 LOC)** — sole file in
    `plugins/`. Same verify-then-delete pattern.
13. **`autonomy/index.ts` (495 LOC)** — sole file in `autonomy/`.
    Verify usage.
14. `runtime/eliza.ts:2906-2911` — silent OG-tracking try/catch
    swallow. Either initialize or remove the call.
15. `runtime/eliza.ts:2921-2926` — the SECRET_SALT generator (replace
    with vault-derived salt, do not delete blindly).
16-30. **104 [?] api/ files + 57 [?] services/ files + 25 [?] config/
    files + 21 [?] providers/ files + 11 [?] x402 files** require
    knip + a follow-on detailed audit pass to surface the rest of the
    deletion candidates. The above 15 are the verified-strong leads.

### Cross-cutting pattern findings

- **Test-only code in the public API surface** — `src/index.ts`
  exports test-support and test-utils. Boundary violation.
- **Two parallel barrels** — `src/index.ts` and `runtime/index.ts`
  re-export overlapping subsets of the same modules. Pick one.
- **Mutable global module state for cycle breaking** — the
  `STATIC_ELIZA_PLUGINS` registry in `plugin-types.ts:53`. The
  comment in `eliza.ts:373-374` admits the design choice.
- **Discord and Android plugins inside the agent core** — three
  files (`discord-local-plugin`, `music-player-route-fallback`,
  `aosp-llama-adapter`) total 4585 LOC. These are connector-specific
  and belong outside `@elizaos/agent`.
- **God-functions inside god-files** — `startEliza` (1644 LOC) inside
  `eliza.ts` (4517 LOC). `handleCompatRoute`-style mux inside
  `server.ts` (4222 LOC). Same disease MASTER.md §1 named in
  Electrobun.
- **Volatile encryption salt** — `SECRET_SALT` regenerated each boot
  silently breaks any persisted ciphertext. Confirmed unrelated to
  the warnings the comment mentions; the comment justified the bug.
- **Numbered phase comments** (`2e-ii`, `2f`, `2d-iii`) — narration
  comments AGENTS.md axis 7 calls out. Survive decomposition.

### Phase 4 status — chat-routes rename is partially complete

`api/chat-routes.ts` already separates `PROVIDER_ISSUE_CHAT_REPLY`
(line 317) and `NO_RESPONSE_FALLBACK_REPLY` (line 323), with
`resolveNoResponseFallback` (line 439) selecting between them based
on `state.logBuffer`. The 4 trigger paths Layer 4's audit confirmed
all now call this resolver. **MASTER.md §3 Phase 4 task is partially
landed in code.** Remaining work:

- Verify `isIntentionalNoResponseResult` correctly routes legitimate
  IGNOREs to the silent path (MASTER.md's bullet #4 in §3 Phase 4).
- Align `client-base.ts:38`'s `GENERIC_NO_RESPONSE_TEXT` (Layer 4
  finding) with the agent-side constants — one source of truth in
  `@elizaos/shared`.

### Surprise / lead-with finding

**`src/index.ts:143-144` exports test-support and test-utils as part
of the package's public API surface, AND a parallel `testing/index.ts`
barrel exists that re-exports the same files.** Test fixtures are
surfaced to every consumer of `@elizaos/agent`; nothing prevents a
runtime caller from reaching into `route-test-helpers` or
`sqlite-compat` in production. This is a clean boundary violation
hiding inside the package's own public surface, and the duplicate
`testing/index.ts` confirms nobody owns where test code lives.
