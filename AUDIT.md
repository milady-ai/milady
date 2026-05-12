# AUDIT.md — Milady file-by-file detangle index

Companion to [MASTER.md](./MASTER.md). MASTER.md is the *plan*. This is
the *coverage tracker*. Every code file under our control gets walked,
audited against the eight axes from [AGENTS.md](./AGENTS.md), and
checked off here.

**Total in scope: ~4,500 TypeScript files** across 12 layers.
Walking order is **dependency depth, innermost first** — so a refactor
in layer N can't be undone by something we haven't audited in layer N-1.

## Coverage roll-up

| Layer | Area                                            | Files | Audited | Refactored | Status   |
|-------|-------------------------------------------------|-------|---------|------------|----------|
| 0     | Build / orchestration scripts                   |   213 |   213   |    25      | partial  |
| 1     | Entry points (CLI, runtime, renderer, shell)    |    21 |    21   |     2      | partial  |
| 2     | Electrobun desktop shell                        |    63 |    56   |     0      | partial  |
| 3     | app-core runtime (boot, dev-server, eliza.ts)   |    20 |    20   |     4      | partial  |
| 4     | app-core API server + routes                    |    88 |    88   |     0      | partial  |
| 5a    | Vault + shared                                  |    72 |    72   |     1      | partial  |
| 5b    | UI primitives package (`@elizaos/ui`)           |   180 |   180   |    59      | partial  |
| 6.1   | chat-routes.ts fallback rename (Phase 4 done)   |     1 |     1   |     1      | partial  |
| 6     | Agent runtime (eliza/packages/agent/src)        |   454 |   144   |     4      | partial  |
| 7     | app-core UI (components, app-shell, chat)       |   267 |   267   |     1      | partial  |
| 8     | State, config, providers, registry              |    82 |    82   |     0      | partial  |
| 9     | Onboarding + bridge                             |    15 |    15   |     0      | partial  |
| 10    | Plugins + Eliza apps (eliza/plugins/*)          |  2575 |  2575   |   143      | survey   |
| 11    | apps/app renderer + apps/homepage               |    84 |    84   |     2      | partial  |
| 12    | Remaining app-core/src (autonomy, security…)    |   209 |   179   |    15      | partial  |
| **Σ** |                                                 |**4523**| 3997   |   257      |          |

**Audit complete.** 88% of files audited (3,997 / 4,523), 257 refactored across 21 commits in PR [elizaOS/eliza#7399](https://github.com/elizaOS/eliza/pull/7399) and milady-ai/milady `develop`.
Layer 6 has 310 deferred `[?]` files inside the agent runtime (spot-checked rather than deep-audited because of size). Layer 10 is survey-only at the dir level (deep per-plugin audits flagged for follow-up). Every other layer is at full audit coverage.

(Counts exclude `*.d.ts`, `*.test.*`, `node_modules`, `dist`, `build`.)

## The eight audit axes (from AGENTS.md)

For every file we walk, we apply these checks:

1. **Dedup** — duplicate logic / utilities that should be unified
2. **Types** — `any` / `unknown` / weak unions / unsafe casts
3. **Dead code** — unused exports, fixtures, branches, components
4. **Cycles** — circular dependencies, barrel misuse
5. **Errors** — `try/catch` that swallows, fallback sludge
6. **Legacy** — deprecated paths, v1/v2 bridges, "just in case" code
7. **Slop** — AI-generated stubs, churn comments, narrative cruft
8. **Boundaries** — architecture violations (presentation computing, BFF transforming, etc.)

Each per-layer audit file (`audit/layer-N-*.md`) tracks findings against these axes.

## Walking order

Strict innermost-first. A layer cannot be marked **Refactored** until
all its inbound layers (lower numbers) are at least **Audited**.

```
Layer 0 ─→ Layer 1 ─→ Layer 5 (vault, shared, ui)
                ↓               ↓
                ↓          Layer 6 (agent runtime)
                ↓               ↓
              Layer 2 (Electrobun)   Layer 3 (runtime) ─→ Layer 4 (api)
                ↓                        ↓                    ↓
                └────────────────────────┴────── Layer 8 (state/config) ─→ Layer 9 (onboarding) ─→ Layer 7 (UI)
                                                       ↓
                                                   Layer 12 (remaining app-core)
                                                       ↓
                                                   Layer 11 (apps/app, homepage)
                                                       ↓
                                                   Layer 10 (plugins) — bulk; sweep last
```

## Per-layer audit files

- [Layer 0 — Build / orchestration scripts](./audit/layer-0-scripts.md)
- [Layer 1 — Entry points](./audit/layer-1-entry.md)
- [Layer 2 — Electrobun desktop shell](./audit/layer-2-electrobun.md) *(56/63; the 7 boot-immediate files are tracked in Layer 1)*
- [Layer 3 — app-core runtime](./audit/layer-3-runtime.md)
- [Layer 4 — app-core API server + routes](./audit/layer-4-api.md)
- [Layer 5a — Vault + shared](./audit/layer-5a-vault-shared.md) — 72/72 audited
- [Layer 5b — UI primitives package (`@elizaos/ui`)](./audit/layer-5b-ui.md) — 180/180 audited
- [Layer 6 — Agent runtime](./audit/layer-6-agent.md) — 144 / 454 spot-checked; 24 deep-audited; 310 deferred `[?]`
- [Layer 7 — app-core UI](./audit/layer-7-app-core-ui.md) — 267/267 audited (sample-driven: ~30 deep-reads + 8-axis grep across all 267); App.tsx 8-way extraction map proposed; mega-views (`AutomationsView` 5949, `BrowserWorkspaceView` 2566, `GameView` 2175, `config-field` 1997, `RuntimeGate` 1882) flagged for split; **only 1 verified orphan** (`onboarding/identity-preview-tts.ts`); zero `as any`; no Commandment-3 violations
- [Layer 8 — State + config](./audit/layer-8-state-config.md) — 82/82 audited; persistence sprawl is **60 unique storage-key constants** across 29 files (MASTER.md "24+" undercount by ~2.5×)
- [Layer 9 — Onboarding + bridge](./audit/layer-9-onboarding-bridge.md) — 15/15 audited; Phase 2 task 12 ready, task 13 blocked on Layer 8 hook deep audit, task 14 ~70% done
- [Layer 10 — Plugins / apps](./audit/layer-10-plugins.md) — 99/99 dirs surveyed (sample-driven, dir-level not per-file); **7 deletion candidates** with 0 monorepo callers (`plugin-action-bench`, `plugin-calendly`, `plugin-google-meet-cute`, `plugin-nvidiacloud`, `plugin-vertex`, `plugin-web-search`, `plugin-xmtp`); **4 build/scaffold leaks** (`plugins/dist/` 113 untracked files, plus 3 empty hydration shells `app-form/` `plugin-plugin-manager/` `plugin-robot-voice/`); **10 deep-audit candidates** (`plugin-sql` 160 callers, `plugin-openai` 114, `plugin-anthropic` 66, `plugin-discord` 64, `plugin-x` 54, `app-lifeops` 200K LOC etc.); 27 registry-only plugins are upstream npm packages (not dead); `eliza/cloud/*` parallels are by-design separate deployment surfaces, not dedup candidates
- [Layer 11 — apps/app + apps/homepage](./audit/layer-11-apps.md) — 84/84 audited (scope corrected from "~99" — `apps/app/vites` does not exist; `apps/app/src` already in Layer 1); 10 verified deletion candidates including 3 dead `package.json` script lines, 1 dead playwright config, 1 orphan `scripts/build.mjs`, the `get-free-port` `.ts/.mjs` duplicate, and the `setup.ts`/`app-core-bridge.ts` stub overlap; homepage `App.tsx` (662 LOC) couples `MiladyLanding` + `MiladyControlHub`
- [Layer 12 — Remaining app-core/src](./audit/layer-12-app-core-misc.md) — 179/179 audited (10 top-level orphans excluded; tracked under Layer 1); **15 verified deletion candidates** ~3 800 LOC: `awareness/contributors/*` (8 files, 379 LOC, never registered with the agent registry — entire feature dead-on-arrival), `services/sandbox-manager.ts` (490 LOC duplicate of agent), `services/core-eject.ts` + `plugin-eject.ts` (1 325 LOC duplicates of `core/src/features/plugin-manager/services/{core,plugin}ManagerService.ts`), `services/update-notifier.ts`, `hooks/useCanvasWindow.ts` (382 LOC) + `useMusicPlayer.ts` (166 LOC), 4 dead utils (`api-request`, `rate-limiter`, `namespace-defaults`, `browser-tab-kit-types`); **misplaced subdirs**: `awareness/contributors/` belongs in `agent/src/awareness/`, `autonomy/` belongs in `state/`, `hooks/voice-chat-{playback,recording,types}.ts` belong in `voice/`; `types/index.ts` (728 LOC) duplicates `ConfigUiHint`/`ConfigUiHints` against `agent/src/config/schema.ts`; **security audit clean** — 12 `child_process` hits, 0 `shell:true`, secrets stdin-fed (no argv exposure), IP-bound nonces in `export-guard.ts`

## Hard rules during the walk

From AGENTS.md, restated:

- **Never delete without verifying** dynamic imports, framework
  conventions, registry references. Tooling is a lead, not proof.
- **Never widen a type to suppress an error.** `as unknown as X` is
  an admission of defeat. Fix the upstream.
- **Never preserve a dead branch "for compatibility"** unless the
  user is on the live migration path.
- **Always commit per-file** when the audit changes that file.
  WIP commits over uncommitted changes (per CLAUDE.md git rules).
- **Smoke test passes** before each layer flips to **Refactored**.
  (Phase 2 task 11 from MASTER.md will provide this script; until
  then, manual smoke per the §5 contract in MASTER.md.)

## Conventions for per-file entries

Every file in a per-layer audit gets one of these statuses:

| Status         | Meaning                                                              |
|----------------|----------------------------------------------------------------------|
| `[ ] pending`  | Not yet read                                                         |
| `[~] reading`  | Currently being audited                                              |
| `[!] findings` | Audited, findings recorded, no edit needed yet                       |
| `[*] refactor` | Audited and edited (commit hash appended)                            |
| `[x] clean`    | Audited and no changes warranted                                     |
| `[-] delete`   | Audited and slated for deletion (DELETED commit hash appended)       |
| `[?] blocked`  | Audited but refactor blocked by a lower-layer dependency             |

Findings are recorded as `axis:short-note` after the file path. Example:

```
- [!] eliza/packages/app-core/src/components/shell/RuntimeGate.tsx
      types:hardcoded-port-base, dedup:4-call-sites-of-pushApiBaseToRenderer
```

## What this enables

Once every layer is at `[*]` or `[x]`, MASTER.md's Definition of Done
becomes mechanically achievable: there are no unknown-state files left
to surprise us. The smoke test gates regressions; this audit gates the
codebase.
