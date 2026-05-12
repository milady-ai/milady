# Layer 5a — Vault + shared package

**Files: 72.**
**Audited: 72 / 72.**
**Refactored: 0 / 72.**

This is the **5a** portion of Layer 5. Layer 5b (UI primitives at
`eliza/packages/ui/src/`, ~180 files) is deferred to a separate audit run
because it's larger and stylistic-heavy.

Two packages, one layer because they sit at the same dependency depth:

1. **`@elizaos/vault`** (16 files) — secrets/config store with two parallel
   backends (file + PGlite), three master-key paths (keychain / passphrase /
   in-memory), one inventory/profiles/routing meta-layer, and three external
   password-manager adapters (1Password / Bitwarden / Proton Pass).
2. **`@elizaos/shared`** (56 files) — browser-safe commons consumed by
   `app-core`, `agent`, and the renderer. Owns config types, contracts, the
   onboarding provider catalog, theme tokens, env-resolution, i18n keyword
   matching, and small leaf utilities.

## Why this layer right after Layer 4

- The vault is the canonical secrets store after the Phase 1 PGlite
  migration (MASTER.md §3 Phase 1). Layer 6 (agent runtime) and Layer 4
  (api server) both consume it — until 5a is mapped, dedup work in 4 and
  6 may move logic into vault that should live elsewhere.
- `@elizaos/shared` is the lowest non-vault dependency in the graph for
  `app-core`, `agent`, and the renderer. Nothing above can be canonical
  unless shared's types are.
- Phase 2 task 16 ("Derive `SECRET_SALT` from master key") explicitly
  needs a verdict on whether the master-key entropy is sufficient — that
  question can only be answered by reading `master-key.ts` + `crypto.ts`
  in this layer.

## What to look for in this layer specifically

- **Vault backend coexistence** — `vault.ts` (file) vs `pglite-vault.ts`
  (PGlite). What duplicates between them? What's genuinely backend-specific?
- **Master-key resolution paths** — every code path that can produce
  `MasterKeyUnavailableError`. AGENTS.md commandment 8: no `?? 0` fallbacks.
- **External-CLI shell-out surface** — `external-credentials.ts`,
  `password-managers.ts`, `install.ts`, `manager.ts`. Any unsafe argv
  composition? Command-injection risk?
- **Shared package boundary policing** — anything *not* used by 2+
  packages doesn't belong in `shared`. Pull it down to its single owner.
- **Type duplication** between shared and agent / app-core / ui.
- **Onboarding provider catalog** as source of truth — vs any parallel.

---

### Vault (16 files)

#### Core API + storage

- [!] `eliza/packages/vault/src/index.ts` — 153 LOC barrel. Clean per-export. *Note*: re-exports `emptyStore` only via `./vault.js` — `pglite-vault.ts` line 443 also re-exports it via the same hop. No dead exports — every named export is consumed somewhere in app-core or agent.
- [!] `eliza/packages/vault/src/types.ts` — 64 LOC. Clean. `StoredEntry` is the canonical discriminated union for the file-backed store; the PGlite backend translates rows back into the same shape only inside `insertLegacyEntry`. Note: `PasswordManagerReference["source"]` is `"1password" | "protonpass"` — does NOT include `"bitwarden"`. Bitwarden goes through `external-credentials.ts` only, never as a stored reference. That's intentional (no `op://` analog for bw items) but worth documenting.
- [!] `eliza/packages/vault/src/vault.ts` — 411 LOC. **Dual responsibility:** `createVault()` is a backend selector (env-flag dispatch to `VaultImpl` or `PgliteVaultImpl`) AND `VaultImpl` is the file-backed implementation in the same module. dedup:`assertKey` is duplicated verbatim with `pglite-vault.ts:429`. dedup:`optsCaller` is duplicated verbatim with `pglite-vault.ts:438`. dedup:`cachedKey` + `loadMasterKey()` is duplicated (vault.ts:305 vs pglite-vault.ts:308). dedup:`setReference` source/path validation duplicated (vault.ts:184 vs pglite-vault.ts:134). dedup:`describe()` source-mapping duplicated. dedup:`stats()` aggregation duplicated. dead:`MILADY_VAULT_BACKEND=file` / `ELIZA_VAULT_BACKEND=file` opt-out is documented as "legacy file-backed VaultImpl" — once Phase 1 cutover is complete and one release has shipped (per the migration safety-net comment at lines 116-120 + pglite-vault.ts:339-340), `VaultImpl` and the `acquireFsLock` / `withStoreMutationLock` / `PROCESS_STORE_LOCKS` machinery (lines 359-411) become dead code. types:clean, no `any`.
- [!] `eliza/packages/vault/src/pglite-vault.ts` — 443 LOC. Mirrors `VaultImpl` operation-for-operation against a single-table SQL schema. dedup:see `vault.ts` finding above — every per-op handler has a parallel here. legacy:`maybeMigrateFromFile` (lines 341-386) + `insertLegacyEntry` (lines 389-415) are the only PGlite-only paths that should disappear once migration is complete. errors:`readValue` (lines 273-306) throws `Error("vault: corrupt entry...")` directly — three distinct corrupt-row checks. These are correctly NOT swallowed. *Surprise*: PGlite's data dir is `<stateDir>/.vault-pglite/` — separate from the runtime DB (`.elizadb/`). The doc comment (lines 32-39) explains the choice well. boundaries:`maybeMigrateFromFile` reaches into `./store.ts` (`readStore`, `StoreData`) — that's correct because the migration is intentionally a one-way file→PGlite read.
- [x] `eliza/packages/vault/src/store.ts` — 161 LOC. File-backed `vault.json` reader/writer with atomic temp+rename. Three tiny `try/catch` blocks: each filters by `code === "ENOENT"` or rethrows; correct. Per-pid + 8-random-bytes tmp filename for concurrent-process collision avoidance is sensible. legacy:becomes dead (modulo migration import) once `VaultImpl` is removed.
- [x] `eliza/packages/vault/src/audit.ts` — 31 LOC. Append-only JSONL audit log. Single `try/catch` that *logs and continues* — the comment says "audit failure must not block the caller" which is the correct call here (the caller is doing the actual mutation; an audit-write failure to disk shouldn't poison the operation). Clean.

#### Crypto + master key

- [x] `eliza/packages/vault/src/crypto.ts` — 83 LOC. AES-256-GCM with key-as-AAD. Wire format `v1:<nonce_b64>:<tag_b64>:<ct_b64>`. Single `try/catch` only around `decipher.final()` to wrap as `CryptoError`. Clean. `KEY_BYTES = 32` (256-bit key) — confirms Phase 2 task 16 feasibility (HKDF over 32 strong bytes is well-studied).
- [!] `eliza/packages/vault/src/master-key.ts` — 350 LOC. **Three resolvers** (`osKeychainMasterKey`, `passphraseMasterKey`, `inMemoryMasterKey`) + a chained `defaultMasterKey()` that walks 1→2 with diagnostic error composition. The `isKeychainUnsafe()` heuristic at lines 194-201 (Linux + no D-Bus signal) is defensive against `@napi-rs/keyring` segfaulting at the C level — that's a legitimate "refuse before invoking" pattern, not error-swallowing. errors:`describe()` at lines 262-275 calls `passphraseMasterKeyFromEnv(...)` which reads `process.env.ELIZA_VAULT_PASSPHRASE` on every describe call — minor, but means describe is not a pure function. dedup:passphrase scrypt parameters (`N=2^15, r=8, p=1, maxmem=64MB`) are reasonable defaults but undocumented in the env-var registry; CLAUDE.md doesn't list `ELIZA_VAULT_PASSPHRASE` or `ELIZA_VAULT_DISABLE_KEYCHAIN`. types:clean. **Phase 2 task 16 feasibility** — see Summary.
- [!] `eliza/packages/vault/src/password-managers.ts` — 73 LOC. Resolves `op://` references via `op read` (1Password). Proton Pass throws "scaffolded; vendor CLI not stable yet" — correctly fails loud, doesn't return a sentinel. Uses `promisify(execFile)` with argv array — no shell interpolation. The user-controlled `path` is concatenated into a `op://` URI then passed as a single argv element to `op read`, which is safe. Dead path: `resolveProtonPass` body never returns — could be a one-liner `throw new PasswordManagerError(...)` without the unused `_path` param.

#### External credentials + manager

- [!] `eliza/packages/vault/src/external-credentials.ts` — 495 LOC. 1Password (`op`) + Bitwarden (`bw`) CLI adapters with injected `ExecFn` for testability. Argv-array-only invocations everywhere — no shell. dedup:1Password account-list / desktop-active probe at lines 348-405 is duplicated almost verbatim in `manager.ts:579-625`; the two implementations diverge slightly — `manager.ts` uses `promisify(execFile)` directly while this file uses the injected `ExecFn`. They should converge. legacy:`OnePasswordListItem.additional_information` enrichment (lines 116-122) is explicitly to dodge a per-item `op item get -` enrichment round-trip; well-documented. types:`OnePasswordListItem.urls` and `.fields` are `ReadonlyArray<{...optional}>` — correct narrowing pattern. errors:`safeListExternal` wrapper in `manager.ts` is the correct boundary for treating per-CLI failures as "show what worked, surface the rest as failures"; this file throws and lets the manager wrap. boundaries:`defaultExecFn()` at lines 465-495 lazy-imports `node:child_process` — the doc comment says "so the test environment doesn't accidentally run real subprocesses if a test forgets to inject a stub" but `import("node:child_process")` is always available in Node — the lazy import doesn't actually prevent that. The defense-in-depth is in tests injecting a stub at the call site, not in lazy importing.
- [!] `eliza/packages/vault/src/manager.ts` — 738 LOC. **Largest file in the package**. Owns four backends (`in-house`, `1password`, `bitwarden`, `protonpass`), preferences storage, unified saved-login listing across backends, and per-backend detection probes. dedup:`readDefaultOpAccount` at lines 579-602 is a duplicate of `external-credentials.ts:361-386` (both probe `op account list --format=json` and pick the first shorthand) — they should share. dedup:`isOnePasswordDesktopActive` at lines 611-625 vs `external-credentials.ts:388-405` — same probe (`op vault list --account=<sh>`), one uses raw `exec` and one uses `ExecFn`. dedup:`isCommandAvailable` at lines 726-738 vs `install.ts:163-170` (`isCommandRunnable`) — same `which` / `where.exe` probe with different timeouts (3s vs 5s). One helper. errors:`getPreferences()` at lines 215-226 catches `VaultMissError` to return `DEFAULT_PREFERENCES` — correct (a missing preferences key is a legitimate "first run" condition, not a failure). errors:`detectOnePassword`/`detectBitwarden` use bare `try { ... } catch { return {...status: false} }` blocks — these are appropriate boundary catches because the detection probes must always return a `BackendStatus` even when the CLI is missing or hung. legacy:`protonpass` is wired through every detection/preference path but the actual write path throws — the four-backend abstraction has a dead arm. boundaries:`createManager()` is the only entry; clean. types:clean.

#### Inventory + profiles + credentials + install + testing

- [!] `eliza/packages/vault/src/inventory.ts` — 446 LOC. Meta-layer over Vault: `_meta.<key>` non-sensitive JSON blobs hold category/label/profiles/activeProfile per stored key; `_routing.config` holds cross-key routing rules. Reserved-prefix discipline (`_meta.`, `_manager.`, `_routing.`) is correctly enforced in `listVaultInventory` and re-enforced in `manager.list` (manager.ts:279-285) — *two* filters for the same concept. The two filters should be one (the inventory-internal filter is the source of truth). dead:`PROVIDER_KEY_PATTERNS` (lines 156-169) and `PROVIDER_EXACT_KEYS` (lines 152-153) and `PROVIDER_KEY_TO_ID` (lines 134-149) overlap — `PROVIDER_EXACT_KEYS` is a `Set` of the keys of `PROVIDER_KEY_TO_ID`; `PROVIDER_KEY_PATTERNS` is a parallel regex list of mostly the same keys. One source of truth. dedup:`Z_AI_API_KEY` and `ZAI_API_KEY` both map to `"zai"`; `MOONSHOT_API_KEY` and `KIMI_API_KEY` both map to `"moonshot"` — same env-alias pattern as Layer 1's `cli/run-main.ts` (`Z_AI_API_KEY → ZAI_API_KEY`, `KIMI_API_KEY → MOONSHOT_API_KEY`). Three places encode the same alias map. types:clean. errors:`parseMetaRecord` at lines 378-435 throws on non-object JSON — caller catches via the implicit `JSON.parse` failure path. Could be tighter.
- [!] `eliza/packages/vault/src/profiles.ts` — 252 LOC. Per-key activeProfile + per-context routing rules (agent/app/skill scoped). Pure read/write/normalize layer over Vault. Clean per-function. legacy:`pickRule` at line 134 walks an unindexed `rules[]` looking for `keyPattern === key && matchesScope` — for users with hundreds of routing rules this is O(n) per `getActive()` call. Won't matter in practice (rule counts will be ≤ ~10) but worth noting. boundaries:correctly stays a thin overlay; `vault.get/has` is the only read path.
- [!] `eliza/packages/vault/src/credentials.ts` — 223 LOC. Saved-login storage at `creds.<domain>.<account>` with autoallow flag at `creds.<domain>.:autoallow`. `parseLoginKey` at line 187 splits on the **last** dot — correct because domains contain dots (`github.com.<account>`). dedup:URL-encoded account segment (`encodeURIComponent` at line 52) shares semantics with the autoallow sentinel collision-avoidance comment at lines 24-27 — the sentinel `:autoallow` survives `encodeURIComponent` as `%3Aautoallow` so a literal user `:autoallow` cannot collide. Smart. dead:`failures: string[]` array at line 128 is initialized, only ever read via `if (failures.length > 0)` at line 143, but **never written** — that whole branch is dead. errors:`parseLogin` at line 203 throws on malformed JSON — correct (a corrupt credential entry should NOT silently degrade to "missing").
- [!] `eliza/packages/vault/src/install.ts` — 218 LOC. Per-OS install specs (brew/npm/manual) for `1password-cli`, `bitwarden-cli`. Pure data + small detection helper. dedup:`isCommandRunnable` at lines 163-170 (`which` / `where.exe` probe with `--version`) overlaps `manager.ts:726-738` (`isCommandAvailable` with bare `which`/`where.exe`) — same idea, one says `cmd --version` and the other says `which cmd`. Consolidate. types:clean. legacy:`protonpass` install spec is "manual; closed beta" on every platform — the entry exists for typing completeness, no real install path.
- [x] `eliza/packages/vault/src/testing.ts` — 92 LOC. `createTestVault()` factory using `inMemoryMasterKey(generateMasterKey())` + auto-cleanup tmpdir. Clean; this is the canonical test fixture. *Note*: only ever creates the **file** backend (it calls `createVault({...})` without setting `MILADY_VAULT_BACKEND` — but the default is now PGlite per `vault.ts:124`). So tests calling `createTestVault()` actually exercise the PGlite path now. Worth a header note.

---

### Shared package (56 files)

#### Top-level barrel + small leaf modules

- [!] `eliza/packages/shared/src/index.ts` — 195 LOC barrel. dedup:lines 13-162 are an inline `export type { ... } from "./config/types.js"` enumeration spanning 130+ named types — instead of `export * from`. The reason at line 92-94 is the documented `InboxAutoReplyConfig` / `InboxTriageRules` collision with `contracts/inbox`, which forces the alias `InboxAutoReplyConfig as AgentDefaultsInboxAutoReplyConfig`. Two type families with the same name — the canonical owner is the contract; the config shape is "what's stored in eliza.json". Either rename one or scope through subpath (`@elizaos/shared/config`). boundaries:line 173-177 explicitly excludes `eliza-core-roles.ts` from the barrel because importing it pulls `@elizaos/core` (and therefore plugin-sql / transformers / onnxruntime) into every consumer of `@elizaos/shared`. That's a **legitimate boundary marker** — leave the explanation in place.
- [-] `eliza/packages/shared/src/types.ts` — 27 LOC. **DEAD FILE.** Defines `StylePreset` with optional `voicePresetId` / `greetingAnimation` / `topics`. The canonical `StylePreset` (with these fields **required**) lives in `contracts/onboarding.ts:31`. The barrel `index.ts` does NOT re-export `./types.js`, and no file in the workspace imports `@elizaos/shared/types` or `shared/src/types` (verified — zero hits). Slated for deletion.
- [!] `eliza/packages/shared/src/validation-keywords.ts` — 1 LOC re-export to `./i18n/validation-keywords.js`. dedup:`./i18n/validation-keywords.js` is itself a 22-LOC re-export-only barrel that re-exports from `./keyword-matching.js`. **Triple indirection**: `validation-keywords.ts` → `i18n/validation-keywords.ts` → `i18n/keyword-matching.ts`. The middle hop adds nothing (no aliasing, no narrowing). Delete the top-level `validation-keywords.ts` shim, or merge the `i18n/validation-keywords.ts` barrel into `keyword-matching.ts`.
- [!] `eliza/packages/shared/src/connector-cred-types.ts` — 72 LOC. Three parallel maps (`CONNECTOR_CRED_TYPES`, `CRED_TYPE_TO_PROVIDER`, `PROVIDER_LABELS`) with hand-maintained alignment. dedup:`gmailOAuth2` and `gmailOAuth2Api` both map to `"gmail"` etc. — would be cleaner as a single source-of-truth array with derived maps. Keep — the file is small and the doc warns about alignment.
- [!] `eliza/packages/shared/src/connectors.ts` — 118 LOC. `CONNECTOR_SOURCE_ALIASES` + a runtime-mutable `_registeredAliases` registry with a `_rebuildRawToCanonical()` rebuild on every register. Module-level mutable singleton (`RAW_TO_CANONICAL: Map`) that gets rebuilt on registration — same anti-pattern as `app-shell-components.ts:95` (Layer 1 finding). For a process-wide registry of canonical names this is OK; for cross-bundle-boundary registration it's a smell. Note dead:lines 99-103 the `_getMergedAliases(canonical).length > 0 ? _getMergedAliases(canonical) : [canonical]` ternary calls the same getter twice and falls through to `[canonical]` only when both maps are empty for the canonical — but `normalizeConnectorSource` already returns `""` for unknown sources. So the `[canonical]` branch is unreachable when the input was a known canonical name. Either dead or a cheap defense.
- [!] `eliza/packages/shared/src/format-error.ts` — 19 LOC. `formatError` + `formatErrorWithStack`. Good. *Note*: same logic appears inline in many call-sites (`err instanceof Error ? err.message : String(err)`) — Layer 6+ audits should flag those for migration.
- [!] `eliza/packages/shared/src/type-guards.ts` — 51 LOC. `asRecord` / `asRecordOrUndefined` / `asObjectArray` / `asNonEmptyString`. Solid. Actively used (e.g. `eliza-core-roles.ts:11` and `service-routing.ts:1`). Status: clean.
- [x] `eliza/packages/shared/src/spoken-text.ts` — 65 LOC. `sanitizeSpeechText` for TTS pre-processing. Pure function, no env reads. Clean.
- [x] `eliza/packages/shared/src/recent-messages-state.ts` — 14 LOC. One thin getter for `state.data.providers.RECENT_MESSAGES.data.recentMessages`. The doc comment explains why the helper exists (canonical access path). Clean.
- [x] `eliza/packages/shared/src/restart.ts` — 38 LOC. Browser-safe `setRestartHandler` / `requestRestart` — host (CLI / desktop / dev-server) registers the real implementation. `RESTART_EXIT_CODE = 75` documented as "must stay in sync with run-node.mjs". Simple and correct. Clean.
- [!] `eliza/packages/shared/src/self-edit.ts` — 146 LOC. `isSelfEditEnabled` (env gate) + `isSelfEditPathDenied` (denylist). The denylist explicitly includes `packages/shared/src/restart.ts` and `packages/shared/src/self-edit.ts` — defense in depth so a self-editing agent can't disable its own gate. Good. Status: clean. *Surprise*: the env vars (`MILADY_ENABLE_SELF_EDIT`, `MILADY_DEV_MODE`) are not in the CLAUDE.md env registry.
- [!] `eliza/packages/shared/src/settings-debug.ts` — 119 LOC. `isElizaSettingsDebugEnabled` reads three sources (Vite `import.meta.env`, an explicit env arg, `process.env`) — sensible for a logger that runs in both Vite browser bundles and Node. Status: clean. boundaries:`SENSITIVE_KEY_RE` regex at line 9-10 partially overlaps with `awareness/registry.ts:21-30`'s `SANITIZE_PATTERNS` — different concerns (key-name pattern vs value-content pattern) so no consolidation.
- [!] `eliza/packages/shared/src/eliza-core-roles.ts` — 967 LOC. **Vendored elizaOS roles helpers** (file comment line 13-14). Imports from `@elizaos/core` so it's intentionally NOT in the barrel (`index.ts:173-177`). Used by `@elizaos/shared/eliza-core-roles` subpath consumers (e.g. `plugins/app-phone`, `plugins/app-wifi`). Boundaries:correct — keep. Out-of-layer review (the 967 LOC body is roles-domain logic; deeper sweep belongs in Layer 6).

#### Env / runtime / config resolution

- [!] `eliza/packages/shared/src/env-utils.ts` — 5 LOC re-export shim around `./env-utils.impl.js`. dedup:the impl is 8 LOC; merging removes one indirection. The split exists because `./env-utils.impl.js` is also imported directly by `contracts/onboarding.ts:5` and `self-edit.ts:26` and `runtime-env.ts:1` and `settings-debug.ts:6` — they all want to bypass the public barrel. The pattern works but two-files-for-one-helper smells.
- [x] `eliza/packages/shared/src/env-utils.impl.ts` — 8 LOC. `isTruthyEnvValue` with a fixed truthy set. Clean.
- [!] `eliza/packages/shared/src/runtime-env.ts` — 391 LOC. **Large, well-organized port + API-security resolver.** Three port families (`serverOnly`, `desktopApi`, `desktopUi`), three security knobs (`bindHost`, `apiToken`, `disableAutoApiToken`), CSV `allowedOrigins` / `allowedHosts`, loopback/wildcard host classification. dedup:`resolveServerOnlyPort`, `resolveSingleProcessPort`, `resolveUiPort`, `resolveDesktopUiPort`, `resolveAllowedOrigins`, `resolveApiAllowedOrigins`, `resolveAllowedHosts`, `resolveApiAllowedHosts`, `isNullOriginAllowed`, `resolveAllowNullOrigin` — at least **5 alias-pair functions** that re-export the same value through differently-named wrappers. Looks like incremental rename without callsite cleanup. Boundary:`resolveDesktopApiPortPreference` returns `{port, sourceLabel, changeLabel, winningKey}` — the `sourceLabel` / `changeLabel` strings are user-facing dev-banner copy embedded in the resolver. UI copy in a runtime resolver is a boundary smell; either move strings to the printer (dev-settings-table) or accept that the resolver's diagnostic output is a first-class part of its contract.
- [!] `eliza/packages/shared/src/awareness/index.ts` — 1 LOC re-export to `./registry.js`. Same triple-indirection issue as `validation-keywords.ts`.
- [!] `eliza/packages/shared/src/awareness/registry.ts` — 220 LOC. `AwarenessRegistry` — Self-Awareness System orchestration. errors:per-contributor `try { ... } catch { line = "[id: unavailable]" }` is a deliberate "registry MUST NOT throw" contract (file comment line 8-10). That's a defensible exception to AGENTS.md "no swallow" — but the `catch { ... }` swallows the error type entirely; switching to `catch (err) { logger.warn(...); line = ... }` preserves the contract while making failures observable. dedup:two near-identical detail paths — `composeAllDetails` (line 197) and the single-contributor branch in `getDetail` (line 122) — same try/catch + sanitize logic. types:clean. Module-level singleton `_globalRegistry` (line 45) — same anti-pattern as Layer 1 `app-shell-components.ts:95` and `connectors.ts:43`.

#### Onboarding presets

- [!] `eliza/packages/shared/src/onboarding-presets.ts` — 268 LOC. Style-preset resolution + character catalog. Three lookup maps (`CHARACTER_DEFINITION_BY_ID`, `BY_NAME`, `BY_AVATAR_INDEX`) built once at module load — fine. legacy:`STYLE_PRESETS` (line 142) is an unparameterized export, kept "for back-compat" alongside `getStylePresets(language)`. Old callers can migrate. boundaries:`buildElizaCharacterCatalog()` at line 237 returns a structured catalog — used by `apps/app/src/character-catalog.ts` (Layer 1 audit noted the cast smell there).
- [!] `eliza/packages/shared/src/onboarding-presets.shared.ts` — 8 LOC. `SHARED_STYLE_RULES` const tuple. **Inline candidate** — only ever imported from `onboarding-presets.ts:10`; merging removes one file.
- [!] `eliza/packages/shared/src/onboarding-presets.characters.ts` — 2648 LOC. The actual character definitions data file. Out-of-layer review — file is data, not logic. Note: `wc -l` reports it twice in the listing (likely deduped at filesystem level), so 56 files reflect the actual unique count.

#### Dev banner / logging

- [x] `eliza/packages/shared/src/dev-settings-banner-style.ts` — 53 LOC. ANSI styling helpers for orchestrator/Vite/API/Electrobun startup banners. Clean; pure functions, NO_COLOR / FORCE_COLOR / TTY-aware.
- [x] `eliza/packages/shared/src/dev-settings-figlet-heading.ts` — 86 LOC. Figlet-rendered subsystem headings with a graceful no-figlet fallback. boundary:lazy-requires `figlet` via `createRequire` so the package stays browser-safe — well-handled. Clean.
- [!] `eliza/packages/shared/src/dev-settings-table.ts` — 235 LOC. Dev settings table rendering (Unicode box, narrow / wide layouts). Pure rendering. Status: clean, modulo the boundary note in `runtime-env.ts` about `sourceLabel`/`changeLabel` strings being baked into the resolver.

#### App hero art (data)

- [!] `eliza/packages/shared/src/app-hero-art.ts` — 419 LOC. Per-app hero-art metadata (background colors, gradients, accents) keyed by app slug. Pure data + small lookup. Out-of-layer review (data).

#### Themes

- [x] `eliza/packages/shared/src/themes/index.ts` — 28 LOC barrel. Re-exports theme types + presets from `contracts/theme.ts` and `presets.ts`. Clean.
- [!] `eliza/packages/shared/src/themes/presets.ts` — 807 LOC. Built-in theme definitions (`BSC_GOLD_THEME`, `COMIC_POP_THEME`, `HACKER_TERMINAL_THEME`, `NEON_CYBER_THEME`, `RETRO_90S_THEME`). Out-of-layer review (data + design tokens). The shape consumes `ThemeColorSet` from `contracts/theme.ts`.

#### Contracts (15 files)

- [x] `eliza/packages/shared/src/contracts/index.ts` — 14 LOC barrel. Re-exports every contract module **except** `theme.ts` (themes barrel handles theme). Clean.
- [!] `eliza/packages/shared/src/contracts/apps.ts` — 561 LOC. App manager DTOs (RegistryAppInfo, AppSessionState, AppRunHealth, etc.). Imports `IAgentRuntime` from `@elizaos/core` — same tree-shake risk as `eliza-core-roles.ts` BUT this one IS in the public barrel via `contracts/index.ts`. boundaries:every consumer of `@elizaos/shared` now drags `@elizaos/core` because of this one type import. Either drop the `IAgentRuntime` use here (it's only referenced for a callback signature, replaceable with a structural type) or split this file.
- [!] `eliza/packages/shared/src/contracts/awareness.ts` — 56 LOC. Awareness contributor contract. Imports `IAgentRuntime` from `@elizaos/core` — same boundary issue as `apps.ts`. The `IAgentRuntime` is used in `summary` / `detail` callback signatures — a structural alias would untangle.
- [x] `eliza/packages/shared/src/contracts/cloud-topology.ts` — 126 LOC. Topology resolver derived from `onboarding.ts` helpers. Clean.
- [!] `eliza/packages/shared/src/contracts/config.ts` — 184 LOC. Out-of-layer review.
- [!] `eliza/packages/shared/src/contracts/content-pack.ts` — 248 LOC. Out-of-layer review.
- [!] `eliza/packages/shared/src/contracts/drop.ts` — small, clean.
- [!] `eliza/packages/shared/src/contracts/inbox.ts` — 28 LOC. Defines `InboxAutoReplyConfig` and `InboxTriageRules` — the two names that collide with `config/types.agent-defaults.ts`. The collision is the reason the `index.ts` barrel can't `export * from "./config/types"` cleanly. Pick one as canonical and rename the other (the contract version should win — it's the runtime DTO; the agent-defaults one is "what's stored in eliza.json defaults"). Status: findings flagged.
- [!] `eliza/packages/shared/src/contracts/lifeops.ts` — 3752 LOC. **Largest file in the repo by far** for this layer. Out-of-layer review — domain-specific to LifeOps.
- [!] `eliza/packages/shared/src/contracts/lifeops-connector-degradation.ts` — 50ish LOC. Out-of-layer review.
- [!] `eliza/packages/shared/src/contracts/lifeops-extensions.ts` — 450 LOC. Out-of-layer review.
- [!] `eliza/packages/shared/src/contracts/onboarding.ts` — 1619 LOC. **The onboarding source of truth.** `ONBOARDING_PROVIDER_CATALOG` (line 210) is the catalog. dedup:no parallel catalog in app-core (verified: app-core's 4 references at `providers/index.ts`, `state/startup-phase-restore.ts`, `components/settings/ProviderSwitcher.tsx` all import this catalog as the source). Good. dead:`OnboardingProviderFamily` and `OnboardingProviderId` are union types of fixed strings BUT include `(string & {})` to keep the union open — this defeats type narrowing on every consumer. The catalog declares concrete ids; the union should be the literal union of those ids only. legacy:`migrateLegacyRuntimeConfig` (line 1061) + `pruneLegacyCloudRoutingFields` (line 1029) + `inferCompatibilityOnboardingConnection` (line 1454) + `resolveLegacyServiceRoutingInConfig` (line 944) + `resolveLegacyDeploymentTargetInConfig` (line 909) — substantial legacy-shape migration code. Phase 2 task 14 ("collapse reset cascade") may benefit from these eventually being removed once the legacy-config window has passed. types:`OnboardingProviderAuthMode` and `OnboardingProviderGroup` also use the `(string & {})` open-union trick. Same fix. boundaries:lots of `Record<string, unknown>` walking via `asConfigRecord` + `readConfigString` — the right approach for parsing untrusted JSON, but it pushes type discipline into every reader.
- [x] `eliza/packages/shared/src/contracts/permissions.ts` — 58 LOC. System permission contracts. Clean discriminated union over OS permission states.
- [!] `eliza/packages/shared/src/contracts/scratchpad.ts` — 145 LOC. Out-of-layer review.
- [!] `eliza/packages/shared/src/contracts/service-routing.ts` — 693 LOC. **Linked-account + service-routing canonical types** + normalizers. legacy:`normalizeLinkedAccountConfig` and `normalizeLinkedAccountsConfig` at lines 374-380 are explicit `@deprecated` re-exports of `normalizeLinkedAccountFlagConfig` / `normalizeLinkedAccountFlagsConfig` "during the WS1→WS3 migration; will be removed once all callers move to the flag-typed helpers (still WS3)". These should be deletable. dedup:`normalizeServiceRouteConfig` at lines 552-637 manually destructures and re-emits 16 fields with the spread-truthy pattern (`...(field ? { field } : {})`) — for 16 fields this is 32 lines of mechanical code. Helper would help. types:`ServiceRouteConfig.accountId` is back-compat shorthand for `accountIds: [accountId]` — the comment at lines 119-122 documents the runtime treats both equivalently. Two ways to say one thing. legacy.
- [!] `eliza/packages/shared/src/contracts/theme.ts` — 300 LOC. ThemeDefinition + CSS-var-name maps. Out-of-layer review.
- [!] `eliza/packages/shared/src/contracts/verification.ts` — small. Out-of-layer review.
- [!] `eliza/packages/shared/src/contracts/wallet.ts` — 766 LOC. Wallet API contracts (balances, NFTs, EVM/Solana). Out-of-layer review.

#### Config types (8 files under `config/`)

- [x] `eliza/packages/shared/src/config/types.ts` — 8 LOC barrel re-exporting the seven sub-modules. Clean.
- [!] `eliza/packages/shared/src/config/types.eliza.ts` — 891 LOC. The big eliza.json shape. Out-of-layer review; the InboxAutoReplyConfig/InboxTriageRules collision (with `contracts/inbox.ts`) is documented here.
- [!] `eliza/packages/shared/src/config/types.agents.ts` — 116 LOC. Out-of-layer review.
- [!] `eliza/packages/shared/src/config/types.agent-defaults.ts` — 401 LOC. Source of the `InboxAutoReplyConfig` / `InboxTriageRules` re-export collision; defines those names with subtly different shapes than `contracts/inbox.ts`. Out-of-layer review.
- [!] `eliza/packages/shared/src/config/types.gateway.ts` — 243 LOC. Out-of-layer review.
- [!] `eliza/packages/shared/src/config/types.hooks.ts` — 124 LOC. Out-of-layer review.
- [!] `eliza/packages/shared/src/config/types.messages.ts` — 201 LOC. Out-of-layer review.
- [!] `eliza/packages/shared/src/config/types.tools.ts` — 416 LOC. Out-of-layer review.

#### i18n (3 files)

- [x] `eliza/packages/shared/src/i18n/keyword-matching.ts` — 159 LOC. Keyword matching + per-locale lookup. Pure functions; ASCII word-boundary detection + Unicode normalization. Clean.
- [-] `eliza/packages/shared/src/i18n/validation-keywords.ts` — 22 LOC. Pure re-export barrel from `./keyword-matching.js`. Triple-indirection middle hop. Delete (or merge with keyword-matching.ts).
- [x] `eliza/packages/shared/src/i18n/generated/validation-keyword-data.ts` — 1107 LOC. **Auto-generated** from `keywords/*.keywords.json` per the file header. Locale coverage: en, zh-CN, ko, es, pt, vi, tl. Clean structure.

---

## Summary — Layer 5a audit findings

### A. Vault backend dedup opportunities (file vs PGlite)

The `VaultImpl` (vault.ts) and `PgliteVaultImpl` (pglite-vault.ts) implementations are almost line-for-line parallel, with only the storage layer differing. Concrete dedup map:

| Concern | `VaultImpl` location | `PgliteVaultImpl` location | Resolution |
|---------|----------------------|----------------------------|------------|
| `assertKey(key)` | vault.ts:343 | pglite-vault.ts:429 | Move to `vault-shared.ts` (or top of `types.ts`); both backends import. |
| `optsCaller(opts)` | vault.ts:352 | pglite-vault.ts:438 | Same file, same deal. |
| `cachedKey: Buffer | null` + `loadMasterKey()` | vault.ts:139 + 305 | pglite-vault.ts:82 + 308 | Move into a `BaseVault` mixin / abstract class with the master-key cache; both implementations subclass. |
| `setReference()` source/path validation (3 lines) | vault.ts:184-189 | pglite-vault.ts:134-139 | Validation lives in a pure helper `validateReference(ref)` taking `PasswordManagerReference`. |
| `set()` sensitive-vs-value branching | vault.ts:152-177 | pglite-vault.ts:90-127 | Split `encryptIfSensitive(masterKey, value, key, sensitive)` returning `{ kind, ...payload }`; backend persists the resulting record. |
| `describe()` source-mapping | vault.ts:240-267 | pglite-vault.ts:209-239 | Pure helper `descriptorFromEntry(key, kind, source, lastModified)` mapping to `VaultDescriptor`. |
| `stats()` aggregation | vault.ts:269-285 | pglite-vault.ts:241-261 | Pure reducer `tallyEntries(rows)` taking `Iterable<{kind: string}>`. |
| `readValue()` decrypt-or-resolve | vault.ts:289-299 | pglite-vault.ts:273-306 | After per-backend row fetch, both call the same `materializeEntry(masterKey, entry, key)` helper that handles secret/value/reference dispatch. |
| `audit.record()` wiring | vault.ts every method | pglite-vault.ts every method | Already uses shared `AuditLog` class — no duplication, just call-site noise. |
| `emptyStore` re-export | vault.ts:357 | pglite-vault.ts:443 | Both re-export from `./store.js`. Consumers should import from `./store.js` directly; remove both re-exports.

After consolidation, `VaultImpl` and `PgliteVaultImpl` should each be ~150-200 LOC of strictly storage-specific code (file IO + locking, vs SQL + connection management). The shared base + helpers absorb the rest.

**One genuine difference** that should NOT be abstracted: file-backed `VaultImpl` needs `withStoreMutationLock` + `acquireFsLock` + `PROCESS_STORE_LOCKS` for its "read whole file → mutate → write whole file" model. PGlite handles concurrency at the connection level. Don't unify the locking primitives; they solve different problems.

**Once the Phase 1 cutover is complete and `MILADY_VAULT_BACKEND=file` is removed (the safety-net release window per `vault.ts:116-120`):**
- Delete `VaultImpl` and the `vault.ts` file-store dispatcher branch.
- Delete `withStoreMutationLock`, `acquireFsLock`, `PROCESS_STORE_LOCKS`.
- Delete `store.ts` (modulo the `StoreData` shape used by `maybeMigrateFromFile`'s read).
- Delete `maybeMigrateFromFile` + `insertLegacyEntry` from `pglite-vault.ts`.
- Net delete: ~250 LOC across `vault.ts`, `pglite-vault.ts`, `store.ts`.

### B. Master-key + SECRET_SALT analysis (Phase 2 task 16 verdict)

**Verdict: feasible. Recommend implementing.**

Master-key entropy is sufficient:
- **Keychain mode:** 32 bytes from `crypto.randomBytes(32)` (`crypto.ts:25` `generateMasterKey`, used at `master-key.ts:334` when no entry exists). Cryptographically uniform.
- **Passphrase mode:** scrypt with N=2^15 (32768), r=8, p=1, 32-byte output (`master-key.ts:124-130`). Strong KDF — within an order of magnitude of 1Password's documented master-password derivation, well above PBKDF2 norms.
- **In-memory mode:** 32-byte buffer the caller provides; tests only.

**Current SECRET_SALT lifecycle** (verified via grep):
- Generated at runtime boot in `eliza/packages/agent/src/runtime/eliza.ts:2921-2924`:
  ```ts
  if (!process.env.SECRET_SALT) {
    process.env.SECRET_SALT = crypto.randomBytes(32).toString("hex");
  }
  ```
- Consumed by `eliza/packages/core/src/settings.ts:80` (`getEnv("SECRET_SALT", "secretsalt")`) and the production-mode validator at `core/src/settings.ts:97-106` which throws when the salt is the default literal `"secretsalt"`.
- Wallet plugins (`plugins/plugin-tee/`, `plugins/plugin-wallet/`) consume `WALLET_SECRET_SALT` and `SOLANA_SECRET_SALT` independently — those are separate env vars that the Phase 2 task should NOT conflate.

**Recommended implementation:**
```ts
// eliza/packages/vault/src/secret-salt.ts (new)
import { hkdfSync } from "node:crypto";

const SECRET_SALT_INFO = "elizaos.secret-salt.v1";
const SECRET_SALT_BYTES = 32;

/**
 * Derive a deterministic SECRET_SALT from the vault master key via HKDF
 * (RFC 5869). Bound to the install via the master key's randomness.
 */
export function deriveSecretSalt(masterKey: Buffer): string {
  const derived = hkdfSync(
    "sha256",
    masterKey,
    Buffer.alloc(0),
    Buffer.from(SECRET_SALT_INFO, "utf8"),
    SECRET_SALT_BYTES,
  );
  return Buffer.from(derived).toString("hex");
}
```

Wire-up: `runtime/eliza.ts:2921-2924` becomes `process.env.SECRET_SALT ??= deriveSecretSalt(await masterKey.load())`. The salt is now stable across restarts (current code regenerates a fresh random salt every boot — meaning any agent-side encryption keyed off SECRET_SALT is **already broken across restarts** unless something else is persisting it. Worth confirming during implementation).

**Migration cost:**
- If any consumer of `SECRET_SALT` writes durable encrypted data keyed off it, that data must be re-encrypted with the new derived salt OR the operator's existing salt must be migrated into the vault as `_secret_salt.v1` and read from there in preference. The fact that the current code regenerates randomly every boot suggests no consumer relies on cross-restart stability — so migration may be a no-op. Verify before shipping.

**Caveat:** wallet plugins use `WALLET_SECRET_SALT` and `SOLANA_SECRET_SALT` (`plugin-tee/src/index.ts:41`, `plugin-wallet/src/chains/solana/environment.ts`). These are independent env vars, not the same SECRET_SALT. Phase 2 task 16 should explicitly NOT touch those — they have user-supplied semantics tied to wallet derivation.

### C. Type duplication between shared and agent / app-core / electrobun

| Type / shape | Shared definition | Other definition | Action |
|--------------|-------------------|------------------|--------|
| `StylePreset` | `contracts/onboarding.ts:31` (canonical, fields required) | `shared/src/types.ts:1` (stale, fields optional) | Delete `shared/src/types.ts` (file is dead — verified zero imports). |
| `InboxAutoReplyConfig` | `contracts/inbox.ts:1` (canonical, runtime DTO) | `config/types.agent-defaults.ts` (re-aliased as `AgentDefaultsInboxAutoReplyConfig` in barrel due to collision) | Pick one as canonical. The contract is the runtime DTO; the agent-defaults entry is "what the user set in eliza.json defaults". Rename the agent-defaults one. |
| `InboxTriageRules` | `contracts/inbox.ts:9` | `config/types.agent-defaults.ts` (same alias dance) | Same. |
| `PasswordManagerReference["source"]` | `vault/src/types.ts:14` (`"1password" | "protonpass"`) | `manager.ts` `BackendId` (`"in-house" | "1password" | "protonpass" | "bitwarden"`) | **Intentional** — references are stored only for `op://` and `pass://` URIs; bitwarden has no analog. Document the rationale. |
| `RuntimeMode` / `DesktopRuntimeMode` | (none in shared) | `electrobun/src/api-base.ts:10` defines `DesktopRuntimeMode = "local" | "external" | "disabled"` | NOT duplicated — `DesktopRuntimeMode` is electrobun-specific and shared has no parallel. Keep. |
| `BackendStatus.authMode` | `vault/manager.ts:71` (`"desktop-app" | "session-token" | null`) | (no duplicate) | OK. |
| `OnboardingProviderId` (open union via `(string & {})`) | `contracts/onboarding.ts:74` | (no duplicate, but defeats narrowing for every consumer) | Tighten to literal union; remove the open-union escape. |

### D. Top 10 deletion candidates from the shared package

Ranked by deletion safety (high to low confidence):

1. **`shared/src/types.ts`** — 27 LOC. Stale `StylePreset` definition, NOT in barrel, zero imports anywhere in the workspace. Safe delete. (`grep` verified: no `from "@elizaos/shared/types"` and no `from ".../shared/src/types"` matches in the entire repo.)
2. **`shared/src/validation-keywords.ts`** (the top-level shim) — 1 LOC re-export to `./i18n/validation-keywords.js`. Triple-indirection middle hop. Either delete and have callers import from the i18n subpath, or move the keyword-matching content up and delete the i18n folder shim.
3. **`shared/src/i18n/validation-keywords.ts`** — 22 LOC. Pure re-export barrel from `./keyword-matching.js`. Same triple-indirection. Pick one of #2 or #3 to delete (depending on which import shape callers actually use).
4. **`shared/src/awareness/index.ts`** — 1 LOC barrel. Delete; callers import `./registry.js` directly.
5. **`shared/src/onboarding-presets.shared.ts`** — 8 LOC. `SHARED_STYLE_RULES` const tuple. Single consumer (`onboarding-presets.ts:10`). Inline candidate.
6. **`shared/src/env-utils.ts`** — 5 LOC re-export shim. Most internal callers already bypass to `./env-utils.impl.js`. Delete the shim, rename `env-utils.impl.ts` to `env-utils.ts`.
7. **Deprecated `normalizeLinkedAccountConfig` / `normalizeLinkedAccountsConfig` re-exports** in `contracts/service-routing.ts:374-380` — explicitly marked `@deprecated` "will be removed once all callers move to the flag-typed helpers (still WS3)". Find call-sites, migrate, delete.
8. **`PROVIDER_KEY_PATTERNS` + `PROVIDER_EXACT_KEYS`** in `vault/inventory.ts:151-169` — both are derived from the third map `PROVIDER_KEY_TO_ID`. Three sources of truth for the same concept. Keep `PROVIDER_KEY_TO_ID`, derive the other two on demand or delete them.
9. **`Z_AI_API_KEY → ZAI_API_KEY` and `KIMI_API_KEY → MOONSHOT_API_KEY` aliases** — appear in three places: `vault/inventory.ts:140-143`, `app-core/cli/run-main.ts:44-53` (Layer 1 finding), and `apps/app/src/brand-env.ts`. Pick one source of truth (`shared/src/provider-env-aliases.ts` would be a new home that's correctly cross-package); delete the two duplicates.
10. **`shared/src/index.ts` lines 13-162** — the 130+ explicit `export type {...}` enumeration. If the `InboxAutoReplyConfig` collision is fixed by renaming the agent-defaults version, the whole block collapses to `export * from "./config/types.js"`.

### E. Command-injection / shell-quote risks in `external-credentials.ts` etc.

**Risk level: LOW.** Audit-positive finding.

Every CLI invocation in the vault package goes through one of:
- `node:child_process.execFile` (argv array) — used in `external-credentials.ts:defaultExecFn`, `password-managers.ts:38`, `manager.ts:22`, `install.ts:13-16`.
- An injected `ExecFn` that the production default (`defaultExecFn`) wires to `execFile` with the same argv-array contract.

There is **no shell** between the caller's strings and the OS process. The user-controllable surfaces are:

| Surface | User input | Sink | Safety |
|---------|-----------|------|--------|
| `password-managers.ts:37` | `path` (user-supplied 1Password reference path) | `exec("op", ["read", `op://${path}`])` — single argv element | Safe; argv element is not interpreted by a shell. The `op://` prefix concat is a URL-scheme string, not shell-special. |
| `external-credentials.ts:151` | `externalId` (1Password item id) | `exec("op", [...sessionArgs, "item", "get", externalId, "--format=json"])` | Safe; argv element. |
| `external-credentials.ts:281` | `externalId` (Bitwarden item id) | `exec("bw", ["get", "item", externalId])` | Safe; argv element. |
| `external-credentials.ts:281` BW_SESSION env | session token from vault | `env: { ...process.env, BW_SESSION: session }` | Safe; passed via env, not argv. |
| `manager.ts:556` | session token from vault | `exec("op", [..., `--session=${session}`])` | Safe; argv element with token concatenated into a single `--session=` flag value. The `=` is parsed by `op` itself, not a shell. |
| `install.ts:165` | command name (`"brew"`, `"npm"`) | `exec(cmd, ["--version"])` | Safe; argv. |
| `install.ts:208-217` (`buildInstallCommand`) | install method package name (from BACKEND_INSTALL_SPECS, hardcoded) | `{command, args}` returned to caller | Safe; the spec is hardcoded data, no user injection. |
| `manager.ts:728-733` (`isCommandAvailable`) | command name | `exec("which", [cmd])` / `exec("where.exe", [cmd])` | Safe; argv. |

**One nuance worth flagging:** `external-credentials.ts:476-487` (`defaultExecFn`) sets `maxBuffer: 16 * 1024 * 1024` (16 MB). A vault containing 1000+ Login items in 1Password could in principle return more than 16 MB of JSON for `op item list --format=json` — the call would then fail with `MAXBUFFER` rather than degrade. That's the right failure mode (no silent truncation), but the limit could be documented or made configurable.

**No user-supplied content reaches a shell metacharacter context.** No `child_process.exec` (with shell), no template-string interpolation into a `bash -c` argument, no `popen`-style pipe construction. The vault package is shell-injection-clean.

### F. Other surfaced findings

- **5 alias-pair functions in `runtime-env.ts`** (`resolveServerOnlyPort` ↔ `resolveSingleProcessPort`, `resolveDesktopUiPort` ↔ `resolveUiPort`, `resolveAllowedOrigins` ↔ `resolveApiAllowedOrigins`, `resolveAllowedHosts` ↔ `resolveApiAllowedHosts`, `isNullOriginAllowed` ↔ `resolveAllowNullOrigin`) — incremental rename without callsite cleanup. Pick canonical names and migrate.
- **Module-level mutable singletons** in shared: `_globalRegistry` in `awareness/registry.ts:45`, `_registeredAliases` + `RAW_TO_CANONICAL` in `connectors.ts:17,43`, `_registeredProviderOptions` in `contracts/onboarding.ts:1588`, `_packageManagerCache` in `vault/install.ts:142`. Same anti-pattern as Layer 1 `app-shell-components.ts:95` (Symbol-keyed singleton). Most are defensible for process-wide registries; a sweep should consolidate the registry idiom.
- **`@elizaos/core` import surface in shared** — `eliza-core-roles.ts` (intentionally excluded from barrel) AND `contracts/apps.ts` AND `contracts/awareness.ts` (both in the public barrel). The latter two drag `@elizaos/core` into every consumer. Either replace `IAgentRuntime` with structural callback signatures or split those types into a `shared/src/contracts-with-runtime/` subpath that's NOT in the public barrel.
- **CLAUDE.md env-var registry gaps** — none of `ELIZA_VAULT_PASSPHRASE`, `ELIZA_VAULT_DISABLE_KEYCHAIN`, `MILADY_VAULT_BACKEND` / `ELIZA_VAULT_BACKEND`, `MILADY_ENABLE_SELF_EDIT`, `MILADY_DEV_MODE`, `ELIZA_SETTINGS_DEBUG` / `VITE_ELIZA_SETTINGS_DEBUG`, `ELIZA_VAULT_BACKEND` are in the env-var section. Should be added during the Phase 2 cleanup.

### G. Top 5 highest-impact refactors for this layer

1. **Extract a vault `BaseVault` mixin / set of shared helpers** (`assertKey`, `optsCaller`, `cachedKey`/`loadMasterKey`, `descriptorFromEntry`, `tallyEntries`, `materializeEntry`). Net: ~150 LOC removed, second backend implementations become ~200 LOC each. Aligns with Phase 1 already-shipped state.
2. **Implement Phase 2 task 16: `deriveSecretSalt(masterKey)` in vault, called from `runtime/eliza.ts`.** Removes the boot-time `crypto.randomBytes(32)` SECRET_SALT generation; the vault becomes the single source of secret-salt entropy. Verify no consumer relies on the (currently broken) cross-restart instability before shipping.
3. **Delete `shared/src/types.ts`.** Verified dead. Net: -27 LOC, removes the conflicting `StylePreset` shape.
4. **Tighten `OnboardingProviderId` / `OnboardingProviderFamily` / `OnboardingProviderAuthMode` / `OnboardingProviderGroup`** — drop the `(string & {})` open-union trick. Every consumer regains exhaustiveness checking. The catalog is the source of truth; the type union should reflect it.
5. **Resolve `InboxAutoReplyConfig` + `InboxTriageRules` collision** between `contracts/inbox.ts` and `config/types.agent-defaults.ts`. Pick the contract version as canonical; rename the agent-defaults one to `AgentDefaultsInboxAutoReplyOverrides` (or similar). Removes the 130-line explicit `export type {...}` enumeration in `shared/src/index.ts`.

### H. Boundary violations (work in shared files that belongs deeper)

| File | Violating concern | Belongs in |
|------|-------------------|------------|
| `shared/src/contracts/apps.ts` | `IAgentRuntime` import drags `@elizaos/core` into every shared consumer | Either replace with structural type, or move to `contracts-with-runtime/` (not in public barrel) |
| `shared/src/contracts/awareness.ts` | Same `IAgentRuntime` issue | Same |
| `shared/src/runtime-env.ts` | Embedded user-facing dev-banner copy strings (`sourceLabel`, `changeLabel`) inside the resolver | Move strings to `dev-settings-table.ts` printer; resolver returns structural data only |
| `vault/src/manager.ts` | Duplicates `op` CLI account/desktop probes from `external-credentials.ts` (lines 579-625) | Both files share a `op-cli-helpers.ts` module |
| `vault/src/install.ts` | `isCommandRunnable` duplicates `manager.ts:isCommandAvailable` | Single helper, both files import |
| `vault/src/inventory.ts` + `vault/src/manager.ts` | Reserved-prefix filtering applied in two places (inventory's `listVaultInventory` AND manager's `list`) | Inventory is the source of truth; manager.list defers |

### I. One surprise

**The default test fixture in `vault/src/testing.ts:48` actually exercises the PGlite backend now** — not the file backend. After Phase 1 flipped the default in `vault.ts:121-125` to PGlite, `createTestVault()` calls `createVault({...})` without setting `MILADY_VAULT_BACKEND`, so every test that previously asserted file-backend semantics is now asserting PGlite-backend semantics. This is probably what you want (test what production runs), but it's worth noting in the file header AND verifying that the 17 parity tests MASTER.md references actually run on both backends rather than just the new default.
