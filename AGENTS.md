# Milady — Project Codex Guidance

Milady is a local-first AI assistant built on [elizaOS](https://github.com/elizaOS). It wraps the elizaOS runtime with a CLI, desktop app (Electrobun), web dashboard, and platform connectors (Telegram, Discord, WeChat, etc.). Inherits `~/.codex/AGENTS.md`.

## elizaOS naming


- Write the framework name as **elizaOS** in prose, comments, user-facing strings, and docs — never `ElizaOS`. The npm scope remains **`@elizaos/*`** (lowercase).
## Wallet + trading architecture (locked)

The wallet and trading stack is governed by `docs/architecture/wallet-and-trading.md`. The non-negotiable shape:

- **Steward is cloud-only.** Eliza Cloud (web) and mobile (Capacitor) route signing through the multi-tenant Steward service. Desktop defaults to `LocalEoaBackend` (keys hydrated from the OS keychain). No Vincent, no Lit Protocol — Steward is the only custody primitive in cloud, full stop.
- **One canonical surface: action + provider + validate.** Roughly 9 canonical planner-visible actions (`TRADE`, `MANAGE_POSITION`, `QUERY_MARKET`, `QUERY_PORTFOLIO`, `LEND`, `MANAGE_LP`, `TRANSFER`, `SET_AUTOMATION`, `MANAGE_AUTOMATION`) plus 13 typed providers. Adding a new venue means adding a provider, **not** a new planner verb. Validate is a strict 6-step gate (zod parse → plugin enabled → provider health → wallet capability → policy → preconditions); handlers trust pre-validated input. Read-only `QUERY_*` actions skip wallet + policy.
- **No fallback sludge.** Silent autogen of EVM/Solana keys is removed. `POST /api/wallet/export` is removed. Steward unreachable = fail loud, not silent fallback to local. Local policy is absolute (no human approval loop) except the explicit `prompt_user_first` rule kind, which surfaces a chat-surface confirmation above a configurable USD threshold (default $50).
- **Hyperliquid live mainnet only**, agent-key delegation auto-registered on first use. **Polymarket** has both reads (lifted from otaku) and writes (CLOB place/cancel + on-chain `redeemPositions`). Geographic restrictions surface as `VENUE_GEO_RESTRICTED` at validate based on a client-supplied region.
- **Audit log is evidence-grade.** Append-only Postgres / PGLite table with row-chained sha256, verified at boot, 90-day rolling retention with checkpoint hashes every 1000 rows. Privacy filter is mandatory on every write.
- **Ships everywhere.** Desktop (Electrobun + LocalEoaBackend), Eliza Cloud (web + StewardBackend), mobile (Capacitor + cloud-routed StewardBackend).

Implementation order is `docs/architecture/wallet-and-trading.md` §I. Coordinator routes by phase; specialists implement against the spec, not against narrative.

### elizaOS naming (agents & editors)


## Quick start (dev)

```bash
bun install                # postinstall hooks run automatically
bun run dev                # API on :31337, UI on :2138 with hot reload (busy ports → next free + env sync)
bun run dev:desktop        # Electrobun; skips vite build when apps/app/dist is up to date
bun run dev:desktop:watch  # Vite dev server + Electrobun (HMR). Set MILADY_DESKTOP_VITE_BUILD_WATCH=1 for rollup watch.
```

Optional — link a local elizaOS source checkout:

```bash
bun run setup:upstreams    # clone ./eliza if needed and link local @elizaos/* packages
bun run eliza:packages     # switch back to published @elizaos/* packages
```

Desktop dev observability (Codex cannot see the native window):

- `GET /api/dev/stack` (or `bun run desktop:stack-status -- --json`) — running window/process state.
- `GET /api/dev/console-log` — loopback tail of `.milady/desktop-dev-console.log` (default-on aggregated log).
- `GET /api/dev/cursor-screenshot` — loopback full-screen OS capture (default-on).

See `eliza/docs/apps/desktop-local-development.md`.

## Build & test

```bash
bun run build       # tsdown + vite
bun run verify      # typecheck + lint  (alias: bun run check)
bun run test        # parallel test suite
bun run test:e2e    # end-to-end
bun run db:check    # database security + readonly tests
```

## Project layout

Milady defaults to published `@elizaos/*` packages. A repo-local `./eliza` checkout is optional, ignored by git, and used only when explicitly selected with `bun run setup:upstreams` / `bun run eliza:local`.

```
node_modules/@elizaos/*             Default runtime source: published elizaOS packages

eliza/                              Optional ignored local checkout (elizaOS/eliza)
  packages/
    app-core/                       Main runtime package
      src/
        entry.ts                    CLI bootstrap (env, log level)
        cli/                        Commander CLI (milady command)
        runtime/eliza.ts            Agent loader — sets NODE_PATH, loads plugins dynamically
        runtime/dev-server.ts       Dev mode entry point (started by dev-ui.mjs)
        api/                        Dashboard API (port 31337 in dev, 2138 in prod)
        config/                     Plugin auto-enable, config schemas
        services/                   Business logic
      scripts/
        dev-ui.mjs                  Dev orchestrator (API + Vite) — driven by `bun run dev`
        run-repo-setup.mjs          Postinstall sequencer
        setup-upstreams.mjs         Initialize repo-local upstreams and link @elizaos packages
        patch-deps.mjs              Post-install patches for broken upstream exports
    agent/                          Upstream elizaOS agent (core plugins, auto-enable maps)
    ui/                             Shared UI component library
    shared/                         Shared utilities
    skills/                         Bundled @elizaos/skills (source of truth for default knowledge)
  plugins/
    plugin-wechat/                  WeChat connector plugin (@elizaos/plugin-wechat)
    plugin-agent-orchestrator/      Sub-agent dispatch (workspace:* in dev)
    plugin-app-control/             APP action surface (modes: launch / relaunch / load_from_directory / list / create)
    plugin-plugin-manager/          PLUGIN action surface (modes: install / eject / sync / reinject / list / search / core_status / create)
    plugin-agent-skills/            USE_SKILL action + enabled_skills provider
  apps/
    app-companion/                  Companion app
    app-training/                   Training pipeline (privacy filter lives here)
    app-form/, app-knowledge/, ... (see eliza/apps/)
  templates/
    min-app/                        Minimal Eliza app scaffold (used by APP create)
    min-plugin/                     Minimal Eliza plugin scaffold (used by PLUGIN create)
  docs/apps/desktop-local-development.md

apps/                               Top-level Milady-specific apps
  app/                              Main web + desktop UI (Vite + React)
    electrobun/                     Electrobun desktop shell
  browser-bridge/, home/, homepage/

packages/                           Top-level Milady-specific packages
  vault/                            Secrets / wallet vault
  confidant/                        Confidant integration

scripts/                            Top-level Milady scripts
  milady-postinstall-repo-setup.mjs Top-level postinstall entry
  sync-workspace-default-skills.mjs Mirrors @elizaos/skills into skills/.defaults/
  ...                               (audit, drift checks, fixtures)
```

## Default agent knowledge

Two distinct skill systems live in this repo. Don't conflate them.

### 1. elizaOS runtime skills (knowledge base for the Eliza agent)

Bundled `@elizaos/skills` are the default knowledge base for the running Eliza agent and for any code agent working in this repo. Repo setup mirrors them into `skills/.defaults/` for workspace access.

- **Source of truth:** `eliza/packages/skills/skills/` (33 bundled skills).
- **Workspace mirror:** `skills/.defaults/` — refreshed by `scripts/sync-workspace-default-skills.mjs` during setup; do not hand-edit.
- **Managed store seed:** `eliza/packages/app-core/scripts/ensure-skills.mjs` seeds the bundled skills on first run.
- **Runtime knowledge seed:** `eliza/packages/agent/src/runtime/default-knowledge.ts` seeds baseline runtime knowledge (including Eliza Cloud guidance).
- **Repo-local custom skills:** put workspace-specific skills in visible subdirectories under `skills/` (e.g. `skills/plan-my-day/`).

Open the `SKILL.md` of any of these from the workspace mirror when relevant:

**Core eliza/cloud (read first when touching app, runtime, or Cloud work):**
- `eliza-app-development` — this repo as an elizaOS app; layout; local/remote/cloud routing.
- `elizaos` — runtime concepts, plugin abstractions, AgentRuntime, actions/providers/evaluators/services.
- `eliza-cloud` — Cloud as managed backend, app registration, hosted APIs, billing, monetization, container deploys.
- `build-monetized-app` — building a Cloud app that earns via inference markup; pairs with `eliza-cloud`.
- `eliza-cloud-buy-domain` — registering a confirmed custom domain for an Eliza Cloud app.
- `eliza-cloud-manage-domain` — listing, verifying, syncing, detaching, and editing DNS for app domains.

**Agent-orchestration / authoring:**
- `coding-agent` — spawning Codex / Claude Code / OpenCode / Pi via PTY-backed bash for sub-agent work.
- `task-agent-eliza-bridge` — loopback endpoints exposing parent runtime context to a spawned coding task agent.
- `skill-creator` — authoring new SKILL.md packages (frontmatter, scripts, references, progressive disclosure).

**Connectors / OS / SaaS integrations** (use when the task touches that surface):
- iMessage / macOS: `imsg`, `bluebubbles`, `apple-notes`, `apple-reminders`, `things-mac`, `camsnap`
- Productivity: `obsidian`, `notion`, `slack`, `discord`, `github`, `trello`, `canvas`, `spotify-player`
- CLI tools: `blucli`, `wacli`, `ordercli`, `tmux`, `1password`
- Media / generation: `nano-banana-pro`, `nano-pdf`
- Misc: `weather`, `healthcheck`, `yara-authoring`

When Eliza Cloud is enabled or requested, prefer it as the managed backend (app registration, auth, hosted APIs, usage tracking, billing, app domains, creator monetization, Docker container deployments) before inventing custom infrastructure. Cloud monetization (inference markups, purchase-share, redeemable earnings) is a first-class product constraint. If docs disagree with the current schema/UI/API in this repo, the repo wins.

### 2. Claude Code project skills (out-of-band for Codex)

`.claude/skills/<name>/SKILL.md` files exist in this repo (currently `phase-review`) but they are **Claude Code slash commands** — they only fire when the user is running Claude Code, not Codex. Codex agents can ignore them. Documented here so you don't mistake them for elizaOS runtime skills if you encounter them in a directory listing.

## Dependencies on elizaOS

- Milady defaults to published `@elizaos/*` packages. The dist tag defaults to `alpha`; override with `MILADY_ELIZAOS_DIST_TAG`, `ELIZAOS_NPM_TAG`, or `bun run eliza:packages -- --tag <alpha|beta|main>`.
- Local source mode is opt-in: `bun run setup:upstreams` / `bun run eliza:local -- --install` clones `https://github.com/elizaOS/eliza.git` into ignored `./eliza` if missing, then links local packages.
- Return to standalone package mode with `bun run eliza:packages -- --install`. Do not add `./eliza` as a submodule or workspace dependency.
- The elizaOS source checkout is hosted at **elizaOS/eliza**, not the personal `Dexploarer` fork. Pushes and PRs for elizaOS source changes go to `elizaOS/eliza`.

## Environment variables (commonly touched)

- `MILADY_STATE_DIR` / `ELIZA_STATE_DIR` — per-user state root (default `~/.milady`).
- `MILADY_CONFIG_PATH` / `ELIZA_CONFIG_PATH` — config file resolution.
- `ELIZA_DISABLE_TRAJECTORY_LOGGING=1` (or `NODE_ENV=test`) — opt out of trajectory persistence.
- `MILADY_DISABLE_AUTO_BOOTSTRAP=1` — skip the runtime native-optimization bootstrap.
- `MILADY_ENABLE_CHILD_SKILL_CALLBACK=0` — disable the child→parent `USE_SKILL` bridge for spawned coding agents.
- `EXECUTECODE_TIMEOUT_MS` (default `30000`), `EXECUTECODE_DISABLE` — `EXECUTE_CODE` action knobs.
- `MILADY_APP_VERIFICATION_MAX_RETRIES` (default `3`) — `APP create` / `PLUGIN create` verification retry cap.
- `MILADY_PROTECTED_APPS` — comma-separated names that cannot be overridden via `APP load_from_directory`. First-party apps under `eliza/apps/` are always implicitly included.
- `MILADY_BROWSER_VERIFY_OPTIONAL=1` — explicit opt-out for the headless-browser check when `puppeteer-core` is absent.

Model defaults (sub-agents inherit unless overridden):
- Anthropic large: `claude-opus-4-7` (override: `ANTHROPIC_LARGE_MODEL`). Small: `claude-haiku-4-5-20251001`.
- OpenAI large/small: `gpt-5.5` / `gpt-5.5-mini` (override: `OPENAI_LARGE_MODEL` / `OPENAI_SMALL_MODEL`).

Port env vars (never hardcoded — the dev orchestrator auto-shifts to the next free port and syncs env): `MILADY_API_PORT` (31337), `MILADY_PORT` (2138), `ELIZA_GATEWAY_PORT` (18789), `ELIZA_HOME_PORT` (2142), `MILADY_WECHAT_WEBHOOK_PORT` (18790).

## Skills + training

- `USE_SKILL` is the only canonical entry point for invoking an enabled skill. Legacy `RUN_SKILL_SCRIPT` / `GET_SKILL_GUIDANCE` are removed; `RUN_SKILL` / `INVOKE_SKILL` remain as similes.
- The `enabled_skills` provider runs at position `-10` and surfaces eligible skills to the planner each turn.
- Trajectory persistence is on by default. Every turn lands in the `trajectories` table unless `ELIZA_DISABLE_TRAJECTORY_LOGGING=1`.
- Native optimization (`--backend native`) is the default training backend (MIPRO / GEPA / bootstrap-fewshot). Outputs land under `~/.milady/optimized-prompts/<task>/` and `OptimizedPromptService` auto-loads at boot.
- Auto-training defaults: 100 trajectories per task, 12h cooldown. Adjust via `/api/training/auto/config` or Settings → Auto-Training.
- The privacy filter at `eliza/apps/app-training/src/core/privacy-filter.ts` is mandatory on every write path that touches real user trajectories — both the nightly export cron and the on-demand training orchestrator run it before any JSONL is written.

## App and plugin primitives

The runtime exposes two unified action surfaces — `APP` and `PLUGIN` — that replace the older single-purpose actions. New code MUST call `APP` / `PLUGIN`. Legacy actions (`LAUNCH_APP`, `RELAUNCH_APP`, `LIST_APPS`, `INSTALL_PLUGIN`, `UNINSTALL_PLUGIN`, `EJECT_PLUGIN`, `SYNC_PLUGINS`, `REINJECT_PLUGINS`, `LIST_PLUGINS`, `SEARCH_PLUGINS`, `CORE_STATUS`, etc.) remain as similes but are no longer canonical.

`APP` modes: `launch`, `relaunch`, `load_from_directory`, `list`, `create`.
`PLUGIN` modes: `install`, `eject`, `sync`, `reinject`, `list`, `search`, `core_status`, `create`.

### Sub-agent invocation and loopback bridge

Coding sub-agents spawned by the orchestrator (Claude Code, Codex, etc.) live in sealed PTY workspaces with no direct access to the parent Milady runtime. They have two channels back to the parent:

**1. PTY stdout — `USE_SKILL` (write channel).** Emit `USE_SKILL <slug> <json>` lines on stdout; the orchestrator parses them and dispatches the matching skill in the parent runtime. This is how a sub-agent invokes `APP`, `PLUGIN`, or any other parent skill. Enabled by default; disable with `MILADY_ENABLE_CHILD_SKILL_CALLBACK=0`.

**2. Loopback HTTP bridge (read channel).** Three endpoints on `127.0.0.1:31337` (or whatever `MILADY_API_PORT` resolves to). Loopback-only, agent-authed via the `:sessionId` path segment (must match an active task in the orchestrator's `tasks` map; unknown sessions 404, completed/stopped sessions 410):

- `GET /api/coding-agents/:sessionId/parent-context` — parent character, world/room context, the human user's identity. Use this to resolve pronouns the task brief left unresolved.
- `GET /api/coding-agents/:sessionId/memory?q=<query>&limit=<N>` — query the parent agent's memory.
- `GET /api/coding-agents/:sessionId/active-workspaces` — list the parent's currently-active workspaces.

All bridge responses are read-only. Mutations stay with the orchestrator — sub-agents cannot write parent state through the bridge. The `task-agent-eliza-bridge` skill (in `skills/.defaults/`) documents the calling pattern in detail.

### Mandatory verification loop for `create` modes

Any sub-agent writing an app or plugin MUST run, in order, before signaling completion:

1. `bun run typecheck`
2. `bun run lint`
3. `bun run test`

Then emit exactly one structured completion line on stdout:

```
APP_CREATE_DONE {"appName":"...","files":[...],"tests":{"passed":N,"failed":0},"lint":"ok","typecheck":"ok"}
```

(or `PLUGIN_CREATE_DONE {...}`). The parent does not trust the line — it cross-checks every claim against disk and the verification log:

- Every file in `files` must exist and be non-empty.
- `tests.passed` must match the parsed vitest report.
- `lint` and `typecheck` claims are verified against recorded exit codes.
- No remaining `__APP_NAME__` / `__PLUGIN_NAME__` / `__APP_DISPLAY_NAME__` / `__PLUGIN_DISPLAY_NAME__` placeholders are allowed.

If any claim fails verification, the parent issues a structured failure prompt and the sub-agent fixes and re-emits. Retry cap: `MILADY_APP_VERIFICATION_MAX_RETRIES` (default `3`). After the cap, the failure surfaces verbatim — no silent fallback.

### Templates

- `@elizaos/app-core` package templates — minimal Eliza app/project scaffolds.
- `@elizaos/agent` / `@elizaos/app-core` package templates — minimal runtime plugin scaffolds.

Both use placeholders (`__APP_NAME__`, `__APP_DISPLAY_NAME__`, `__PLUGIN_NAME__`, `__PLUGIN_DISPLAY_NAME__`) replaced by the scaffold copy step. Read each template's `SCAFFOLD.md` before customizing.

## Architecture rules (non-negotiable)

These govern every change. If existing code conflicts, fix the code.

1. **Dependencies point inward only.** Presentation → Application → Domain → Infrastructure. Never import from an outer layer.
2. **Computation lives in domain code, not presentation.** Derived values are computed in services / actions / use cases and returned as named fields. Clients format DTO fields for display; they do not aggregate, compute, or branch on raw data.
3. **API routes are auth + dispatch.** Route handlers validate input, resolve the caller, and dispatch to a service / action. No business logic, no transformations, no calculations in route bodies.
4. **No runtime type-tag branching where separate flows belong.** Distinct content kinds (apps, plugins, providers, actions) get separate handlers, not `if (kind === ...)` chains.
5. **CQRS.** Readers read and return domain objects. Writers return `void` or an ID. Mappers handle DB↔domain translation.
6. **Single source of truth for validation.** Route-layer schemas validate and transform input. Services / actions trust pre-validated input and perform presence/invariant checks only. No duplicate inline regex.
7. **DTO fields are required by default.** Optional only when genuinely nullable. No `as` casts to skip missing fields. No `?? 0` to hide broken pipelines. If TypeScript says a field is missing, fix the pipeline.
8. **Logger only, never console.** Server logging uses the structured logger only (`Logger.info/warn/error/debug`). Prefix `[ClassName]`. Include structured context on errors.
9. **Every action and endpoint needs a real caller.** Every POST/PUT/DELETE has a UI invocation path. Every GET has a consuming component/hook. Every action has a planner trigger or programmatic caller. Anything else is dead code.

## Quality bar

What good changes look like: fewer codepaths, fewer special cases, fewer fallback branches, stronger types, cleaner layer boundaries, easier traceability from input → use case → DTO → UI, no dead abstractions, no defensive code that obscures failures.

Remove on sight: unused code, near-duplicate types, legacy / migration leftovers, AI slop and fake TODO implementations, comments describing churn, "temporary" fallbacks that became permanent, broad `try/catch` that just swallows or replaces errors with defaults, `any` / `unknown` / unsafe casts used to avoid thinking.

Constraints: do not preserve bad patterns "for compat" without a documented, verified live caller. Do not add abstractions unless they reduce total complexity. Do not DRY code that should remain separate because the domains differ. Do not centralize unlike concepts. Do not hide uncertainty with fallback values. Do not keep both old and new paths unless a live migration explicitly requires it.

## Git workflow

**Motto: move fast, but never lose work to dangling branches or stashes.**

- **Never `git stash`.** Commit instead — WIP commits are fine and can be amended or squashed later.
- **Always commit to the current branch in the current worktree.** Do not `git checkout`/`git switch` to another branch as part of "cleanup." If a task seems to need a different branch, ask first.
- **Prefer many small commits over uncommitted changes.** Push proactively when work is meaningful.
- **Never `--no-verify`, `--no-gpg-sign`, force-push to main/master, or amend a published commit** unless explicitly asked. After a hook failure, fix the issue and create a NEW commit (`--amend` modifies the wrong commit).
- **Never blanket-discard uncommitted edits as "dev-env churn."** `git checkout -- <file>` on uncommitted edits is destructive — confirm per-file, especially for binaries.
- Stage by name. Avoid `git add -A` / `git add .`.

The principle: every change ends up as a commit on the current branch in the current worktree, and ideally pushed.
