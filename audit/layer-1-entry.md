# Layer 1 — Entry points

**Files: 21.**
**Audited: 21 / 21.**
**Refactored: 2 / 21.**

The first code each runtime sees. Three entry families:

1. **CLI / runtime / API** — `eliza/packages/app-core/src/{entry,index,App,…}` and `runtime/`
2. **Electrobun shell main** — `eliza/packages/app-core/platforms/electrobun/src/index.ts` and direct siblings
3. **Renderer** — `apps/app/src/main.tsx` and immediate boot helpers

## Why this layer right after scripts

- Layer 0 produces the artifacts; Layer 1 consumes them. Anything
  Layer 0 sets in env (NODE_PATH, ELIZA_DESKTOP_API_BASE,
  ELIZA_RENDERER_URL) is read here.
- The bug from MASTER.md §0 was a Layer 1 issue — `LOCAL_AGENT_API_BASE`
  hardcoded in `RuntimeGate.tsx` (Layer 7) ignoring what Layer 1
  injected. Until Layer 1 has a single canonical "current API base"
  source, downstream layers keep guessing.
- These files are the *outermost* layer per the architecture
  commandments: presentation → application → domain → infrastructure.
  They wire the shell, not the logic. They should be small.

## What to look for in this layer specifically

- **Entry points >100 LOC** — each one should mostly *delegate*. If
  it does work, that work belongs in a subsystem.
- **Multiple boot paths** that look similar (CLI, dev server, packaged
  runtime). Identify the canonical sequence and collapse.
- **Implicit env contracts** — every env var the entry reads should be
  documented in MASTER.md and CLAUDE.md.
- **Stub/optional re-exports** that exist because something downstream
  doesn't compile (e.g. `optional-eliza-app-stub.tsx`,
  `native-plugin-stubs.ts`). These mark broken boundaries.

---

### app-core CLI / runtime / API entry

- [x] `eliza/packages/app-core/src/entry.ts` — 63 LOC. Slim. Reads `APP_CLI_NAME`, `--no-color`, `--debug`, `--verbose` to set `LOG_LEVEL` and `NODE_LLAMA_CPP_LOG_LEVEL` before any other import. Delegates to `cli/run-main`. *Minor*: log-level wiring duplicates between this file and the env-defaulting in `cli/run-main` — could be one helper, but inlining here is intentional (must run before lazy imports). Status: clean.
- [*] `eliza/packages/app-core/src/index.ts` — 85 LOC barrel. Dead wallet-shim re-exports removed (eliza commit 046820172d). dedup:re-exports overlap heavily with `browser.ts` (every `./components/index`, `./config/index`, `./hooks/*`, `./onboarding/*`, etc. is re-exported from both — see `browser.ts` audit). legacy:two `// TODO: remove once consumers import from @elizaos/app-wallet` shims (`BSC_GAS_READY_THRESHOLD`, `HEX_ADDRESS_RE`, `isAvaxChainName`, `isBscChainName`) — stale TODO with no tracking issue. boundaries:re-exports `./test-support/test-helpers` from a public production entry — test code should not be in the package's main barrel.
- [!] `eliza/packages/app-core/src/App.tsx` — **1325 LOC root component**. dead:huge import surface; the `lazyNamedView` helper at line 81 wraps `lazy()` but the file then comments at line 105 that "static import keeps the load path honest" and statically imports `CharacterEditor`, `DatabasePageView`, `InventoryView`, `LogsPageView`, `MemoryViewerView`, `PluginsPageView`, `RelationshipsView`, `RuntimeView`, `SkillsView`, `TasksPageView` — so the lazy helper appears dead-or-near-dead in this file. boundaries:routing shell *and* page-list owner; `AppShellPageRegistration` is read from this file's runtime (line 102) and from `./app-shell-components` — two registrations sources for the same concept (see also app-shell-components audit). slop:line 4 doc comment "Root App component — routing shell." understates the file's actual responsibilities (which include hot-keys, mobile-nav, conversations sidebar, custom actions panel, tasks panel, deferred setup checklist, secrets manager modal root, system warnings, …).
- [!] `eliza/packages/app-core/src/browser.ts` — 127 LOC barrel. dedup:exact same six `@elizaos/app-wallet/inventory/*` re-exports appear in `index.ts` and `browser.ts` with the same `// TODO: remove once consumers import directly from @elizaos/app-wallet` comment. dedup:30+ lines of re-exports duplicate `index.ts` (every `./hooks/*`, `./i18n/*`, `./navigation/*`, `./onboarding/*`, `./platform/*`, `./shell/*`, `./state/*`, `./types/*`, `./utils/*`, `./voice/*`, `./widgets/*` is in both). Two barrels diverge by what's safe in a renderer; the safer pattern is a single barrel + a separate `./node-only` entry. legacy:`@elizaos/app-wallet/inventory/*` re-exports are documented as transitional but no removal milestone is set.
- [!] `eliza/packages/app-core/src/capacitor-shell.ts` — 7 LOC of side-effect imports (`./styles/styles.css`, `./styles/brand-gold.css`, `./platform/native-plugin-entrypoints`). Status: clean. *Note*: `apps/app/src/main.tsx` lines 2-3 imports the same two style sheets directly via `@elizaos/app-core/styles/*`, then never imports `capacitor-shell.ts` — confirm this file is still wired in (renderer entry path appears bypassed; possible dead module).
- [!] `eliza/packages/app-core/src/onboarding-config.ts` — 286 LOC pure function. types:`buildOnboardingConnectionArgs` interface has 23 optional booleans and trim-strings — clear smell of "everything is optional because nothing is canonical." Should be replaced by a discriminated union per provider/runtime. boundaries:this file is *labeled* `onboarding-config.ts` and lives in `src/` (non-onboarding folder) but only the renderer onboarding flow uses it. Should move under `./onboarding/` next to `flow.ts`, `server-target.ts` etc. errors:no try/catch — clean here.
- [x] `eliza/packages/app-core/src/shell-params.ts` — 40 LOC. URL-search → `ShellRoute` discriminated union. Clean. The literal-list `if (tab === "browser" || tab === "chat" || …)` could be a `Set<DetachedShellTab>.has(tab)` to avoid duplicating the type union in code, but it's a one-line micro-improvement.
- [!] `eliza/packages/app-core/src/app-shell-components.ts` — 121 LOC. dedup:enforces "add page exports here AND in `./components/index.ts`" — two indices for the same concept. The runtime-registration path (`registerAppShellPage` / `listAppShellPages`) at lines 95-121 lives next to a static export list (lines 16-57) — two parallel mechanisms for the same concept. boundaries:the global registry at line 95 uses `Symbol.for("elizaos.app-core.app-shell-page-registry")` — a process-global cross-bundle escape hatch that should be on a service, not a module-level singleton.
- [*] `eliza/packages/app-core/src/character-catalog.ts` — 47 LOC. Dead `ELIZA_CHARACTER_ASSET_COUNT` + `ELIZA_INJECTED_CHARACTER_COUNT` constants removed (eliza commit 046820172d). Pure adapter over `boot-config.characterCatalog`. Status: clean. *Minor*: exports two const placeholders `ELIZA_CHARACTER_ASSET_COUNT = 0` and `ELIZA_INJECTED_CHARACTER_COUNT = 0` that are always 0 (real counts come from `getResolved()`); these look like leftovers from an earlier static-catalog era.

### app-core CLI program

- [x] `eliza/packages/app-core/src/cli/argv.ts` — 175 LOC. Pure argv helpers; well-typed; no `any`. Status: clean.
- [x] `eliza/packages/app-core/src/cli/banner.ts` — 51 LOC. Module-level `bannerEmitted` flag is a small singleton smell but correct for "print once per process." Clean.
- [x] `eliza/packages/app-core/src/cli/cli-name.ts` — 32 LOC. Clean.
- [x] `eliza/packages/app-core/src/cli/cli-utils.ts` — 16 LOC. `runCommandWithRuntime` thin wrapper. Clean.
- [x] `eliza/packages/app-core/src/cli/command-format.ts` — 33 LOC. Clean.
- [x] `eliza/packages/app-core/src/cli/git-commit.ts` — 111 LOC. Walks parents, reads `.git/HEAD`, falls back to `package.json` `gitHead` and `build-info.json`. Module-level `cachedCommit` cache is sensible. Three small `try/catch` blocks; each one filters by `code === "ENOENT"` before rethrowing — this is the correct pattern, not error-swallowing. Clean.
- [x] `eliza/packages/app-core/src/cli/parse-duration.ts` — 43 LOC. Clean.
- [!] `eliza/packages/app-core/src/cli/plugins-cli.ts` — **1219 LOC**. dead:single-file CLI subprogram should be split into `plugins/{install,remove,list,…}.ts` per command — too large for entry-layer. Out-of-layer review (Layer 1 only counts it as an entry; the file is really CLI-program implementation that belongs in a deeper sweep). Marked findings to surface size; defer detailed audit.
- [x] `eliza/packages/app-core/src/cli/profile-utils.ts` — 23 LOC. Clean.
- [x] `eliza/packages/app-core/src/cli/profile.ts` — 127 LOC. Clean. Note: hardcodes `19001` as default dev gateway port — see hardcoded-ports inventory below.
- [x] `eliza/packages/app-core/src/cli/program.ts` — 1 LOC re-export. Clean.
- [!] `eliza/packages/app-core/src/cli/run-main.ts` — 99 LOC. errors:`unhandledRejection` handler logs to `console` and `process.exit(1)` — no telemetry forward. legacy:env normalization at lines 44-53 (`Z_AI_API_KEY → ZAI_API_KEY`, `KIMI_API_KEY → MOONSHOT_API_KEY`) is tactical alias glue that probably belongs in `utils/env-aliases.ts` next to the brand-env module, not in CLI bootstrap. dedup:dotenv loading happens here AND in Electrobun `loadTheAppEnvFilesForMain()` — same `.env` files (`./.env` + `~/.eliza/.env`) get loaded by two different bootstraps with slightly different rules. One owner.
- [x] `eliza/packages/app-core/src/cli/version.ts` — 3 LOC. Clean.

### Electrobun shell main (the god module)

- [!] `eliza/packages/app-core/platforms/electrobun/src/index.ts` — **2587 LOC god module**. dedup, dead, errors, legacy, slop, boundaries — all eight axes apply. **Detailed extraction map in §Summary below.** Top concerns: 5 distinct API-base push surfaces (4 RPC + 1 HTML inject), 14+ module-level mutable singletons (`currentWindow`, `currentSendToWebview`, `surfaceWindowManager`, `rendererUrlPromise`, `backgroundWindowPromise`, `isQuitting`, `cleanupFns`, `lastFocusedWindow`, `macOpenedDevtoolsWindowIds`, `heartbeatMenuSnapshot`, `heartbeatMenuRefreshTimer`, `heartbeatRefreshInProgress`, `desktopSessionPrimed`, `saveTimer`), giant 200+ LOC menu-action `handleApplicationMenuAction` switch (lines 1735-1871), inline 200 LOC HTTP server (`startRendererServer`, lines 786-986).
- [x] `eliza/packages/app-core/platforms/electrobun/src/api-base.ts` — 166 LOC. Clean per-function. *Critical*: `pushApiBaseToRenderer` is the canonical RPC push (the function MASTER.md says is called from 4 sites). The owning lifecycle for "current API base" should live next to this function.
- [x] `eliza/packages/app-core/platforms/electrobun/src/agent-ready-state.ts` — 35 LOC. Already extracted from `index.ts` to break a cycle (see file's own comment). The model — module-level state + listener Set — is what the four MASTER.md extractions should mirror. Clean.
- [x] `eliza/packages/app-core/platforms/electrobun/src/constants.ts` — 2 LOC. `DEFAULT_API_PORT = 31337`. The one legitimate hardcoded port (it IS the default). Clean.
- [x] `eliza/packages/app-core/platforms/electrobun/src/types.ts` — 18 LOC. Clean.
- [x] `eliza/packages/app-core/platforms/electrobun/src/main-window-runtime.ts` — 117 LOC. Module-level mutable `currentWindow` + `currentWindowMeta` singletons used by `index.ts` to share state with rpc-handlers. Pattern is cycle-breaking only; does what it says. Clean.
- [x] `eliza/packages/app-core/platforms/electrobun/src/main-window-session.ts` — 88 LOC. Pure functions resolving partition + bootstrap renderer per env. Clean.

### Renderer entry (apps/app)

- [!] `apps/app/src/main.tsx` — **982 LOC renderer bootstrap**. boundaries:does too much for an entry — should delegate. Concerns visible inline: branded `__ELIZA_APP_*` window globals (lines 151-193), self-hosted token hash bootstrap (lines 320-367), platform routing (Capacitor/iOS/Android/Electrobun/Web), keyboard listeners, app-lifecycle listeners (background/foreground), deep-link handler (lines 492-596), desktop-shell init (603-646), iOS device-bridge init (lines 833-908), runtime-mode change listener, status-bar init, build-time iOS connection wiring, popout-window apiBase injection, detached-shell apiBase injection. slop:line 21 `const PhoneCompanionApp = () => null;` with the comment admitting this is a fork-leftover stub; it should either be in `optional-eliza-app-stub.tsx` (the dedicated stub file) or the underlying export should be added to `elizaOS/eliza`. legacy:`isMiladyOS()` / `registerMiladyOsSystemApps()` is dead on every non-MiladyOS device but lives in the main bundle. types:`AppCompatWindow` (line 165) intersection of `Window & Record<string, unknown>` is a wide-open escape hatch.
- [x] `apps/app/src/app-config.ts` — 10 LOC. Clean.
- [x] `apps/app/src/brand-env.ts` — 55 LOC. Clean.
- [x] `apps/app/src/character-catalog.ts` — 5 LOC. types:single `as CharacterCatalogData` cast at line 4 (`buildElizaCharacterCatalog() as CharacterCatalogData`) — the source returns the same shape; remove the cast or fix the upstream return type. Otherwise clean.
- [-] `apps/app/src/native-plugin-stubs.ts` — 49 LOC. **Mobile-only stub. Used by `vite.config.ts` alias when no mobile build target is set.** This is legitimate (web/desktop bundles cannot include the Capacitor native plugins) but the file content (`Agent.getStatus → 'unavailable'`, `Desktop.getVersion → 'N/A'`) is also exactly what the renderer treats as "no native runtime present" elsewhere. Status: keep, but document the alias contract in the file header (currently no header).
- [-] `apps/app/src/optional-eliza-app-stub.tsx` — 211 LOC. **Vite-alias stub for upstream packages that aren't in the npm `@elizaos/*` set yet.** Per file content + `vite.config.ts` aliasing logic, this stubs at minimum: `@elizaos/app-companion` (CompanionShell, GlobalEmoteOverlay, InferenceCloudAlertButton, …), `@elizaos/app-lifeops/components/LifeOpsActivitySignalsEffect`, `@elizaos/app-steward/ui` (ApprovalQueue, StewardLogo, TransactionHistory), `@elizaos/app-task-coordinator` (CodingAgentControlChip, …), `@elizaos/app-training/ui` (FineTuningView), `@elizaos/app-vincent/ui` (useVincentState), and `@elizaos/app-wallet/wallet-rpc` (`buildWalletRpcUpdateRequest`, `normalizeWalletRpcSelections`, `collectSelectedCredentialKeys`). The wallet-rpc stubs at lines 197-211 are explicitly documented as "milady is in npm-package mode, with `bun run eliza:local` the alias auto-detect routes through the real package." So this file is a **boundary marker for the entire packages-vs-local mode contract**. Keep, but each stub family should probably move into its own file under `apps/app/src/stubs/` so a missing upstream is visible by file name (e.g. `apps/app/src/stubs/app-companion.ts`).
- [!] `apps/app/vite.config.ts` — **2143 LOC**. boundaries:vite config doing far more than config — file-system probing for local-vs-packages mode (lines 58-120+), 200+ LOC of alias scaffolding for every `@elizaos/*` and `@capacitor/*` package, custom server middleware for `colorizeDevSettingsStartupBanner`, port resolution, dev-server runtime detection, and figlet headings. This is a build-orchestration program living in a config file. dedup:port resolution duplicates what dev-orchestrator and Electrobun main both do (each computes "what port is the agent listening on"). Out-of-layer review: the code in this file is a Layer 0 build script in disguise.
- [x] `apps/app/capacitor.config.ts` — 64 LOC. Allow-list literals for navigation domains (`localhost`, `127.0.0.1`, `*.elizacloud.ai`, `*.milady.ai`, `*.fly.dev`, `hyperscape.gg`, etc.) plus env-driven extension. Clean.

---

## Summary — Layer 1 audit findings

### Electrobun `index.ts` extraction map

The file is 2587 LOC, 56 top-level functions, 14+ module-level mutable singletons. MASTER.md §1 names 4 extractions; the file actually contains **at least 11 distinct subsystems** that should each become their own module under `platforms/electrobun/src/bridge/` (or a sibling folder):

| # | Concern | LOC range | Owns | Target module |
|---|---------|-----------|------|---------------|
| 1 | Heartbeat menu refresh + snapshot fetch | 110-117, 175-177, 363-473, 2189 (status-tick refresh) | timer, snapshot fetch from `/api/triggers` + `/api/triggers/health`, error formatting | **`bridge/heartbeat-menu.ts`** (MASTER.md #2) |
| 2 | Application-menu reset (resetTheAppFromApplicationMenu + reachability) | 217-361 | reachable-API-base picker, native confirm dialog, embedded vs external restart, push reset to renderer | **`bridge/menu-reset.ts`** (new, sibling of heartbeat-menu) |
| 3 | macOS window effects + native chrome alignment | 475-554 | vibrancy, shadow, traffic-light position, drag region, restack on dom-ready | `bridge/mac-window-effects.ts` |
| 4 | Window-state persistence (main window) | 556-638 | load/save `window-state.json`, fresh-install maximize sentinel, debounced save | `bridge/window-state.ts` |
| 5 | App-window bounds store (per-slug) | 640-712 | `app-window-bounds.json` blob, per-slug load/save | `bridge/app-window-bounds.ts` |
| 6 | Static renderer HTTP server + API proxy + HTML inject | 786-986 | Bun.serve, mime types, cache-control, `/api/*` + `/ws` + `/music-player` proxy, `injectApiBaseIntoHtml` writing `__ELIZA_API_BASE__` / `__ELIZA_API_TOKEN__` / `__ELIZAOS_APP_BOOT_CONFIG__` | `bridge/renderer-static-server.ts` (the `injectApiBaseIntoHtml` write **must move into api-base-owner**, see §"5th surface" below) |
| 7 | Main-window lifecycle (create, attach, restore, ensure-background) | 1011-1240 | `createMainWindow`, `attachMainWindow`, `ensureBackgroundWindow`, `restoreWindow`, `showBackgroundRunNoticeOnce` | `bridge/main-window-lifecycle.ts` |
| 8 | Config import/export from menu | 1262-1360 | dialog, fetch `/api/config`, write/read JSON to disk | `bridge/menu-config-io.ts` |
| 9 | RPC wiring + API-base injection | 1421-1525 + 4 push sites at 330, 1504, 1516, 1648 + status-tick at 2168-2191 | RPC plumbing, `injectApiBase` per window, `pushApiBaseToRenderer` orchestration | **`bridge/api-base-owner.ts`** (MASTER.md #1) |
| 10 | Desktop session priming + cookie install | 1550-1610 + 1646 + 2181 | `loadOrCreateDesktopSession`, install cookies on partitioned session, `desktopSessionPrimed` flag | **`bridge/desktop-session.ts`** (MASTER.md #3) |
| 11 | Embedded agent supervisor | 1612-1659 + 2168-2191 + 2371-2386 + 2389 (cleanup) | `_startAgent`, port from agentManager, status-onChange watcher that re-prime cookies + re-push API base + sync permissions | **`bridge/agent-supervisor.ts`** (MASTER.md #4) |
| 12 | OS-permission sync to REST API | 1531-1548 | `mergeRuntimePermissionStates` + PUT `/api/permissions/state` | `bridge/permissions-sync.ts` |
| 13 | Updater + giant menu-action handler | 1661-1909 | update check, status notifications, **200 LOC `handleApplicationMenuAction` switch** that owns: check-for-updates, open-about, export/import config, toggle-devtools, refresh-heartbeats, relaunch, reset-app, open-secrets-manager, open-settings, new-window, focus-window, show-main, focus/hide/maximize/restore main window, desktop-notify, restart/reset-steward, apps:/tray-app- routing, restart-agent, quit, show, navigate-* | `bridge/updater.ts` + `bridge/menu-action-router.ts` (split the switch) |
| 14 | Deep-link handling | 1921-1967 | `handleDeepLink`, dock reopen | `bridge/deep-links.ts` |
| 15 | Shutdown cleanup | 1975-1989 | `runShutdownCleanup`, before-quit | `bridge/shutdown.ts` |
| 16 | Env loading + dev/packaged detection | 2002-2029 | `loadTheAppEnvFilesForMain` (dotenv) | merge with `cli/run-main`'s `loadDotEnv` — single env-loader module |
| 17 | WebGPU init + browser support check | 2031-2074 | `initializeBundledWebGPU`, `checkWebGpuBrowserSupport` (renderer push) | `bridge/webgpu-init.ts` |
| 18 | Startup crash report | 2393-2540 | crash report build, persist primary or fallback path, prompt next-launch dialog | `bridge/startup-crash-report.ts` |
| 19 | Tray creation | 2289-2323 | tray icon menu literal | `bridge/tray.ts` |

After these splits, `index.ts` should be ≤300 LOC: env load → main() that wires modules → fatal handler. The 11→19 expansion isn't gold-plating; each block is a coherent lifecycle that already has internal state.

#### The 5th API-base surface MASTER.md §1 doesn't mention

`injectApiBaseIntoHtml` at lines 843-861 of `index.ts` writes **three globals** directly into the HTML before the renderer JS runs:
- `window.__ELIZA_API_BASE__` (the legacy global RuntimeGate read)
- `window.__ELIZA_API_TOKEN__` (defineProperty, non-enumerable)
- `window.__ELIZAOS_APP_BOOT_CONFIG__` + `window.__ELIZA_APP_BOOT_CONFIG__` + `window[Symbol.for("elizaos.app.boot-config")].current` (typed boot config the SettingsView reads)

This is a **parallel push surface to the four `pushApiBaseToRenderer` RPC call sites** identified in MASTER.md §1. Same disease (no owner), different code path. The api-base-owner module must own *both* the HTML inject path *and* the RPC push path or the renderer will keep getting two sources of truth. Total push sites = **5**, not 4: `index.ts:330`, `index.ts:843` (HTML inject), `index.ts:1504`, `index.ts:1516`, `index.ts:1648`.

### Stub re-exports

Three classes of stub exist in this layer; they are **not** all the same kind of debt.

| File | LOC | Type | Upstream issue | Action |
|------|-----|------|----------------|--------|
| `apps/app/src/optional-eliza-app-stub.tsx` | 211 | **Vite-alias stub** for ~9 upstream packages (`@elizaos/app-companion`, `@elizaos/app-lifeops/components/LifeOpsActivitySignalsEffect`, `@elizaos/app-steward/ui`, `@elizaos/app-task-coordinator`, `@elizaos/app-training/ui`, `@elizaos/app-vincent/ui`, `@elizaos/app-wallet/wallet-rpc`) | These packages exist in **`local` mode** but not in **`packages` mode** (the npm `@elizaos/*` set hasn't published these yet, or the wallet-rpc submodule is local-only). The vite alias auto-detects mode and routes to real or stub. | **Keep, but split per upstream:** create `apps/app/src/stubs/{app-companion,app-lifeops,app-steward,app-task-coordinator,app-training,app-vincent,wallet-rpc}.ts` so a missing upstream is visible by file name. Then add a CI gate that fails when any stub has been imported in production builds for a package that *should* have published. |
| `apps/app/src/native-plugin-stubs.ts` | 49 | **Mobile-only stub** (`@capacitor/agent`, `@capacitor/desktop`, `@capacitor/llama`) | Real Capacitor plugins only resolve in mobile build targets. Web/desktop builds need a no-op so types compile. | **Keep, document the contract in a file header.** Status: legitimate boundary. |
| `apps/app/src/main.tsx` line 21 — `const PhoneCompanionApp = () => null;` | 1 | **Inline fork-leftover stub.** Comment (lines 17-21) admits "PhoneCompanionApp is mobile-companion-only and not exported by the current `@elizaos/app-core` surface." | The upstream `@elizaos/app-core` in `elizaOS/eliza` doesn't export `PhoneCompanionApp`; no equivalent exists upstream. | **Decide:** either land the export upstream (preferred), or move the stub to `apps/app/src/stubs/phone-companion.tsx` so it's visible alongside the others. Inline `() => null` in the entry file is the worst location. |
| `eliza/packages/app-core/src/index.ts` lines 13-18 + `browser.ts` lines 13-37 — `@elizaos/app-wallet/inventory/*` | ~6 + ~10 | **Compatibility re-export.** Comment: `// TODO: remove once consumers import from @elizaos/app-wallet`. | Some downstream consumer still imports inventory constants from `@elizaos/app-core` instead of `@elizaos/app-wallet`. | **Find the consumers** (search for `BSC_GAS_READY_THRESHOLD`, `HEX_ADDRESS_RE`, `isAvaxChainName`, `isBscChainName`, `CHAIN_CONFIGS`, `useInventoryData`, `TokenLogo`, `ChainIcon`, `getStablecoinAddress`, etc. across the repo), update them to import directly, then delete these re-exports. |

### Hardcoded ports / globals inventory

#### Hardcoded port literals

| File:line | Literal | Status |
|-----------|---------|--------|
| `eliza/packages/app-core/platforms/electrobun/src/constants.ts:2` | `31337` (DEFAULT_API_PORT) | **Legitimate** — this IS the brand default, used as final fallback in `resolveDesktopApiPort`. |
| `eliza/packages/app-core/src/cli/profile.ts:125` | `19001` (dev gateway port) | Hardcoded literal in `applyCliProfileEnv` for `ELIZA_GATEWAY_PORT`. CLAUDE.md notes the gateway default is `18789`; this `19001` is the dev-profile shift. **Should** call into the same port-resolution helper everything else uses. |
| `eliza/packages/app-core/platforms/electrobun/src/index.ts:204` | `http://127.0.0.1:${port}` | Computed from agent status. OK. |
| `eliza/packages/app-core/platforms/electrobun/src/index.ts:797` | `127.0.0.1` (renderer static server bind) | OK (loopback bind). |
| `eliza/packages/app-core/platforms/electrobun/src/index.ts:899` | `127.0.0.1` (Bun.serve hostname) | OK. |
| `eliza/packages/app-core/platforms/electrobun/src/index.ts:984-985` | `http://127.0.0.1:${port}` | OK. |
| `eliza/packages/app-core/platforms/electrobun/src/index.ts:1540` | `http://127.0.0.1:${port}/api/permissions/state` | OK (computed). |
| `eliza/packages/app-core/platforms/electrobun/src/index.ts:1636, 2176` | `http://127.0.0.1:${status.port}` | OK. |
| `eliza/packages/app-core/platforms/electrobun/src/api-base.ts:96, 140` | `http://127.0.0.1:${port}` | OK (computed). |
| `eliza/packages/app-core/platforms/electrobun/src/index.ts:786 (comment)` | `http://localhost:5174` | Doc comment + actual server starts at `5174` and walks free. Walking-from-5174 should be a named const. |
| `eliza/packages/app-core/platforms/electrobun/src/index.ts:804` | `getPort(5174)` (start port) | Magic number — should be `RENDERER_STATIC_SERVER_START_PORT = 5174` next to `DEFAULT_API_PORT`. |
| `apps/app/vite.config.ts:751 (comment)` | `default to 31337 for standalone vite dev` | Comment is informational; actual value comes from `resolveDesktopApiPort`. OK. |
| `apps/app/vite.config.ts:2096, 2108, 2118` | `http://127.0.0.1:${apiPort}` proxy targets | OK (computed). |
| `apps/app/vite.config.ts:464` | `127.0.0.1` in viteAllowedHosts | OK (loopback). |
| `apps/app/src/main.tsx:754` | `host === "127.0.0.1"` | OK (validation). |
| `apps/app/capacitor.config.ts:13-14` | `localhost`, `127.0.0.1` | OK (allow-nav list). |

**Verdict:** No production-incorrect port literals in this layer. All non-default literals are loopback hosts in computed strings. The `5174` start port for the renderer static server should be promoted to a constant. The `19001` dev-gateway port in `profile.ts` should resolve through the shared port resolver instead of being a literal.

#### `window.__*` and `globalThis.__*` reads/writes in entry files

| Symbol | Defined / written | Read | Notes |
|--------|-------------------|------|-------|
| `window.__ELIZA_API_BASE__` | `electrobun/src/index.ts:843, 853` (HTML inject) | `apps/app/src/main.tsx:190` (`getInjectedAppApiBase`); reader is `RuntimeGate.tsx` (Layer 7, the bug source per MASTER.md §0) | **The bug.** Two writers (HTML inject + RPC push), one renderer-side reader that locked. |
| `window.__ELIZA_API_TOKEN__` | `electrobun/src/index.ts:850` (HTML inject, defineProperty non-enumerable) | Renderer client (Layer 7) | Same family as above. |
| `window.__ELIZAOS_APP_BOOT_CONFIG__` | `electrobun/src/index.ts:852` (HTML inject) | SettingsView (Layer 7); also assigned through `setBootConfig` in `apps/app/src/main.tsx` (multiple sites) | Boot config has *three* parallel storage targets in HTML inject: legacy global, branded global, and `Symbol.for(...)` slot. Single owner needed. |
| `window.__ELIZA_APP_BOOT_CONFIG__` | `electrobun/src/index.ts:852` (HTML inject) | Same readers as above | Branded duplicate of `__ELIZAOS_APP_BOOT_CONFIG__`. |
| `globalThis[Symbol.for("elizaos.app.boot-config")]` | `electrobun/src/index.ts:852` (HTML inject) | `boot-config-store` (Layer 8) | Symbol-keyed registry; redundant with the two named globals. |
| `window.__ELIZA_APP_SHARE_QUEUE__` / `appWindow[BRANDED_WINDOW_KEYS.shareQueue]` | `apps/app/src/main.tsx:154, 263, 369-385` | `apps/app/src/main.tsx:373` and downstream share-target consumers | Two parallel keys (`__ELIZA_APP_SHARE_QUEUE__` + branded-prefix variant) for the same queue. |
| `window.__ELIZA_APP_CHARACTER_EDITOR__` / `appWindow[BRANDED_WINDOW_KEYS.characterEditor]` | `apps/app/src/main.tsx:154, 263-264` | `app-core` ViewRouter (Layer 7) | Two parallel keys for the same component. |
| `window.__ELIZA_APP_API_BASE__` / `appWindow[BRANDED_WINDOW_KEYS.apiBase]` | declared in `apps/app/src/main.tsx:155` (write target unclear; reader at line 188-192) | `getInjectedAppApiBase` | Branded variant of `__ELIZA_API_BASE__`. Uses both keys, again. |
| `globalThis[Symbol.for("elizaos.app-core.app-shell-page-registry")]` | `eliza/packages/app-core/src/app-shell-components.ts:95-110` | Same file's `listAppShellPages()` | Module-singleton smuggled across bundle boundaries via `Symbol.for`. Should be a service injected into the shell. |

**Pattern:** every "branded" window key has both an `__ELIZA_*` and `__APP_PREFIX_*` variant being written/read in parallel — three storage targets per concept (legacy, branded, Symbol.for). One owner per concept.

### Top 5 highest-impact refactors for this layer

1. **Extract Electrobun `index.ts` into 11+ modules** per the table above. The 4 in MASTER.md §1 are the highest-leverage; landing them first unblocks the chat-bug regression class. Total target: `index.ts` ≤300 LOC (currently 2587).
2. **Consolidate the 5 API-base push surfaces into a single `bridge/api-base-owner.ts`** that owns: (a) HTML inject (b) RPC push to main window (c) RPC push to detached/surface windows (d) re-push on agent status-onChange (e) re-push after menu reset. Single source of truth, single push path. This is the direct fix for MASTER.md §0's bug class.
3. **Collapse the 9 `__ELIZA_*` / branded / Symbol.for boot-config storage targets** to one. Pick one storage (the Symbol.for slot is the least leakable) and make `setBootConfig` / `getBootConfig` the only write/read API. Delete all `window.__ELIZA_APP_*` and `__ELIZAOS_APP_BOOT_CONFIG__` parallels.
4. **Split `apps/app/src/optional-eliza-app-stub.tsx` per upstream package** into `apps/app/src/stubs/{app-companion,app-lifeops,app-steward,...}.ts` and add a CI check that fails when `MILADY_ELIZA_SOURCE=packages` builds still resolve to a stub. Land the missing upstream exports (notably `PhoneCompanionApp`) so `apps/app/src/main.tsx:21` can stop being an inline fork-leftover.
5. **Move `eliza/packages/app-core/src/onboarding-config.ts` under `./onboarding/`** and replace its 23-optional-field interface with a discriminated union per provider/runtime target. Currently it's both mislocated (entry-layer-adjacent file with deep onboarding logic) and weakly-typed.

### Boundary violations (work in entry files that belongs in deeper layers)

| File | Violating concern | Belongs in |
|------|-------------------|------------|
| `electrobun/src/index.ts:786-986` | 200-LOC HTTP server (Bun.serve with mime types, cache-control, /api proxy, HTML inject) | Layer 4 (api server) — this is a server, not a shell concern |
| `electrobun/src/index.ts:1262-1360` | Config import/export business logic (read JSON from disk, validate, PUT /api/config) | Layer 4 (config endpoint should accept the file path or a multipart upload; main process should only show the dialog) |
| `electrobun/src/index.ts:1531-1548` | Permission state merge + PUT /api/permissions/state | Layer 4 / native-permissions Layer 12 |
| `electrobun/src/index.ts:2393-2540` | Startup crash report build / persist / prompt | Layer 12 (security/diagnostics) — entry file should call into it once |
| `apps/app/src/main.tsx:492-596` | Deep-link router (handleDeepLink with 6+ named routes + share-target dispatch + GitHub-callback dispatch) | Layer 9 / a dedicated routing module |
| `apps/app/src/main.tsx:603-646` | Desktop-shell init (registerShortcut, addListener for shortcutPressed/trayMenuClick, setTrayMenu, subscribeDesktopBridgeEvent) | Layer 2 (electrobun renderer side) — entry should call `desktopShell.init()` once |
| `apps/app/src/main.tsx:833-908` | iOS device-bridge init (preference store, UUID gen, startDeviceBridgeClient, mode-change listener) | Layer 8 / a dedicated runtime-mode module |
| `apps/app/src/main.tsx:320-367` | Self-hosted token hash bootstrap (URL fragment parse, localStorage migration of stale keys, history.replaceState) | Layer 8 (bootstrap layer) — entry file shouldn't touch localStorage |
| `apps/app/vite.config.ts` | Local-vs-packages mode detection, alias scaffolding for every upstream package, port resolution, dev-banner formatting | Layer 0 build scripts — config file is doing a Layer 0 program's job |
| `eliza/packages/app-core/src/App.tsx` | Mobile-nav surface state, hot-keys, conversations sidebar mount/unmount, custom-actions panel state, tasks-events panel, deferred setup checklist visibility, secrets-manager modal, system-warning banners (1325 LOC root) | Layer 7 — root component should be a pure layout + a few providers; the page-level state should live in feature modules |
| `eliza/packages/app-core/src/cli/run-main.ts:44-53` | `Z_AI_API_KEY → ZAI_API_KEY` and `KIMI_API_KEY → MOONSHOT_API_KEY` aliasing | Layer 12 / `utils/env-aliases.ts` (and shared with the brand-env `apps/app/src/brand-env.ts` aliasing) |
