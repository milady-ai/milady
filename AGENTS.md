# Repository Guidelines

> **This is an agents-only codebase.** All PRs are reviewed and merged by agents. Humans contribute as QA testers. See [CONTRIBUTING.md](./CONTRIBUTING.md).
>
> This file should carry the same repo-level engineering guidance as `CLAUDE.md` for agent tooling that only reads `AGENTS.md`. Keep the two files in sync.

- Monorepo: `milady-ai/milady` — core logic in `packages/app-core`, upstream agent in `packages/agent`
- Runtime baseline: Node **22+** (keep Node + Bun paths working)

## What This Is

Milady is a local-first AI assistant built on [elizaOS](https://github.com/elizaOS). It wraps the elizaOS runtime with a CLI, desktop app (Electrobun), web dashboard, and platform connectors (Telegram, Discord, etc.).

### elizaOS naming (agents & editors)

Write the framework name as **elizaOS** in prose, comments, user-facing strings, and documentation — not `ElizaOS`. The npm scope remains **`@elizaos/*`** (lowercase). Say **Eliza agents** when you mean agents in plain language (not **elizaOS agents**). The **Eliza Classic** plugin name is an exception (**Eliza** = the 1966 chatbot), not “elizaOS Classic”. Cursor picks this up via `.cursor/rules/elizaos-branding.mdc`.

## Contribution Scope

**Accept:** bug fixes, security fixes, test coverage, documentation accuracy, performance improvements (with benchmarks).

**Deep review required:** new features, plugins, architectural changes, memory/context improvements. Must include tests and benchmarks proving value.

**Reject:** aesthetic/UI redesigns, theme changes, visual "improvements" that don't enhance agent capability. This project prioritizes agent quality over human-facing aesthetics. De-emphasize and decline these firmly.

## Review Priorities

1. Does it stay in scope?
2. Does it break anything?
3. Is it secure? (assume adversarial intent)
4. Is it tested?
5. Is it necessary?

## Project Structure

- **Source code:** `packages/app-core/src/` — runtime in `src/runtime/`, CLI wiring in `src/cli/`, config in `src/config/`, API in `src/api/`, connectors in `src/connectors/`, providers in `src/providers/`, hooks in `src/hooks/`, utils in `src/utils/`, types in `src/types/`
- **Agent upstream:** `packages/agent/` — elizaOS agent runtime, core plugins, plugin auto-enable maps
- **Tests:** colocated `*.test.ts` alongside source files
- **Build output:** `dist/` (via `tsdown`)
- **Entry points:** `packages/app-core/src/entry.ts` (CLI), `packages/app-core/src/index.ts` (library), `packages/agent/src/runtime/eliza.ts` (elizaOS runtime)
- **Apps:** `apps/app/` (Capacitor mobile/desktop, includes React UI). The browser relay extension is not part of this release checkout.
- **Internal packages:** `packages/ui/`, `packages/shared/`, `packages/plugin-wechat/`
- **Deployment:** `deploy/` (Docker configs)
- **Scripts:** `scripts/` (build, dev, release tooling)
- **Tests:** `test/` (setup, helpers, mocks, e2e scripts)
- **Bundled skills package:** `eliza/packages/skills/` (`@elizaos/skills`; managed copy under state dir)

## Default Agent Knowledge

Treat bundled skills from `@elizaos/skills` as the default knowledge base for code agents working in this repo. The canonical entry points are:

- `eliza/packages/skills/skills/eliza-app-development/SKILL.md` — this repo as an elizaOS app (Milady is this checkout’s product name), layout, and how local, remote, and cloud paths fit together
- `eliza/packages/skills/skills/elizaos/SKILL.md` — elizaOS runtime concepts, plugin abstractions, and extension points
- `eliza/packages/skills/skills/eliza-cloud/SKILL.md` — Eliza Cloud as a managed backend, app platform, deployment target, and monetization surface

`scripts/ensure-skills.mjs` seeds bundled skills from `@elizaos/skills` into the managed skills store on first run.
Separately, `packages/agent/src/runtime/default-knowledge.ts` seeds bundled runtime knowledge items for Milady itself, including the baseline Eliza Cloud app/backend guidance.

For source checkouts and app repos, the default agent workspace now follows the runtime `cwd` when that directory looks like a real project workspace (`package.json`, `AGENTS.md`, `skills/`, etc.). That makes the repo's own `AGENTS.md` and `skills/` available to the runtime by default, which is what lets Milady reason about and patch the checkout it is running in. Packaged installs still fall back to the state-dir workspace, and `MILADY_WORKSPACE_DIR` / `ELIZA_WORKSPACE_DIR` always win when set explicitly.

When Eliza Cloud is enabled, linked, or explicitly requested, prefer it as the default managed backend for app-building work before inventing custom auth, billing, or hosting. In this repo, Eliza Cloud already supports app registration (`appId`), user auth/redirect flows, cloud-hosted APIs, usage tracking, billing, app domains, creator monetization, and Docker container deployments for server-side workloads.

Cloud monetization is a first-class product constraint. App creators can earn through inference markups and purchase-share settings, and published apps, agents, and MCPs can feed redeemable earnings flows. If docs disagree, prefer the current schema/UI/API implementation in this repo over older marketing prose.

## Build, Test, and Development Commands

- Install deps: `bun install`
- Type-check/build: `bun run build` (runs tsdown + UI build)
- Lint/format: `bun run verify` (alias: `bun run check`)
- Run CLI in dev: `bun run milady ...`
- Browser dashboard stack: `bun run dev` or `bun run dev:web:ui`
- Desktop (Electrobun): `bun run dev:desktop` skips a full Vite build when `apps/app/dist` is fresh; `bun run dev:desktop:watch` runs the Vite dev server and sets `MILADY_RENDERER_URL` for HMR (Rollup `vite build --watch`: add `MILADY_DESKTOP_VITE_BUILD_WATCH=1`). **Busy default ports:** orchestrator and embedded runtime probe loopback for the next free API/UI ports and sync `MILADY_API_PORT` / `ELIZA_PORT` / `MILADY_PORT` so proxies and the UI agree (**why:** fixed defaults collide with other stacks or tools). Rationale: `docs/apps/desktop-local-development.md`. **Observability for agents:** same doc describes `GET /api/dev/stack`, `desktop:stack-status`, aggregated console + screenshot hooks (**why:** multi-process dev is opaque without them); `.cursor/rules/milady-desktop-dev-observability.mdc` nudges Cursor to use them.
- Tests: `bun run test` (parallel unit + playwright), `bun run test:e2e`, `bun run test:live`
- Coverage: `bun run test:coverage`

Optional — link a local elizaOS source checkout for live package development:

```bash
bun run setup:upstreams   # initializes repo-local ./eliza and links local @elizaos/* packages
```

## Coding Style & Naming Conventions

- Language: TypeScript (ESM). Prefer strict typing; avoid `any` and `unknown` unless absolutely necessary.
- Formatting/linting via Biome; run `bun run verify` before commits (`bun run check` is an alias).
- Add brief code comments for tricky or non-obvious logic.
- Aim to keep files under ~500 LOC; split/refactor when it improves clarity or testability.
- **Do not remove exception-handling guards** in `apps/app/electrobun/src/native/agent.ts` as "excess" or during deslop/cleanup. The try/catch and `.catch()` there keep the desktop app usable when the runtime fails to load (API server stays up, UI can show error). See `docs/electrobun-startup.md`.
- **Do not remove NODE_PATH setup code** in `packages/agent/src/runtime/eliza.ts`, `eliza/packages/app-core/scripts/run-node.mjs`, or `apps/app/electrobun/src/native/agent.ts`. Without it, dynamic plugin imports fail with "Cannot find module". See `docs/plugin-resolution-and-node-path.md`.
- **Do not remove the Bun exports patch** in `scripts/patch-deps.mjs` (patchBunExports). It fixes "Cannot find module" for plugins whose published package.json points `exports["."].bun` at missing `./src/index.ts`. See "Bun and published package exports" in `docs/plugin-resolution-and-node-path.md`.
- Naming: use **Milady** for product/app/docs headings; use `milady` for CLI command, package/binary, paths, and config keys.

## Key Architecture Decisions

### NODE_PATH (do not remove)

Dynamic plugin imports (`import("@elizaos/plugin-foo")`) need `NODE_PATH` set to the repo root's `node_modules`. This is set in three places — all three are required:

1. `packages/agent/src/runtime/eliza.ts` — module-level, before dynamic imports
2. `eliza/packages/app-core/scripts/run-node.mjs` — child process env
3. `apps/app/electrobun/src/native/agent.ts` — Electrobun main process

See `docs/plugin-resolution-and-node-path.md`.

### Bun exports patch (do not remove)

`scripts/patch-deps.mjs` removes dead `exports["."].bun` entries from `@elizaos` packages that point to missing `src/` paths. Without this, Bun fails to resolve plugins at runtime.

### Electrobun startup guards (do not remove)

The try/catch blocks in `apps/app/electrobun/src/native/agent.ts` keep the desktop window usable when the runtime fails.

## Dependencies

- Direct imports in `src/`: `@elizaos/core`, `@clack/prompts`, `chalk`, `commander`, `dotenv`, `json5`, `zod`
- Workspace plugins (`@elizaos/plugin-*`): loaded at runtime, each with their own `package.json`
- Do not add dependencies unless `src/` code directly imports them

## Config

- **Runtime config**: `~/.milady/milady.json` (override with `MILADY_CONFIG_PATH` or `MILADY_STATE_DIR`; falls back to `ELIZA_CONFIG_PATH` / `ELIZA_STATE_DIR`)
- **Env secrets**: `~/.milady/.env` or project `.env`
- **Namespace**: The CLI sets `ELIZA_NAMESPACE=milady` (via `run-node.mjs` and `dev-ui.mjs`), so the state dir is `~/.milady/` and the config file is `milady.json`

## Dependencies on elizaOS

All `@elizaos/*` packages use the `alpha` dist-tag. When developing locally, `bun run setup:upstreams` links packages from repo-local `./eliza` and `./plugins` so changes are picked up immediately. Set `MILADY_SKIP_LOCAL_UPSTREAMS=1` to use only npm-published versions.

**`@elizaos/plugin-agent-orchestrator`:** Milady currently resolves this plugin from the repo-local `eliza/plugins/plugin-agent-orchestrator` submodule (nested under the `eliza/` submodule) via `workspace:*`. That submodule tracks upstream `alpha`, so updating the submodule updates the orchestrator used in local development checkouts. Set `MILADY_SKIP_LOCAL_UPSTREAMS=1` to force npm-published packages instead.

All official elizaOS plugin repos live under [https://github.com/elizaOS-plugins](https://github.com/elizaOS-plugins). For plugin work, prefer adding the relevant plugin repo as a git submodule under `eliza/plugins/` (tracked in `eliza/.gitmodules`) so we keep a local checkout we can patch when needed, and depend on it via `workspace:*` so Milady resolves the local package directly during development. Publish new versions to npm when ready.

## Ports

| Service | Dev Port | Env Override |
|---------|----------|--------------|
| API + WebSocket | 31337 | `MILADY_API_PORT` |
| Dashboard UI | 2138 | `MILADY_PORT` |
| Gateway | 18789 | `MILADY_GATEWAY_PORT` |
| Home Dashboard | 2142 | `MILADY_HOME_PORT` |
| WeChat Webhook | 18790 | `MILADY_WECHAT_WEBHOOK_PORT` |

## Testing Guidelines

- Framework: Vitest with V8 coverage thresholds (25% lines/functions/statements, 15% branches; canonical policy in `scripts/coverage-policy.mjs`)
- Naming: match source names with `*.test.ts`; e2e in `*.e2e.test.ts`; live in `*.live.test.ts`
- Run `bun run test` before pushing when you touch logic

## Commit & Pull Request Guidelines

- Follow concise, action-oriented commit messages (e.g., `milady: add verbose flag to send`)
- Group related changes; avoid bundling unrelated refactors
- PRs should summarize scope, note testing performed, and mention any user-facing changes

## Git Workflow

- **Never stash, switch branches, or create worktrees** unless the user explicitly asks for it.
- When asked to merge, merge **onto the current branch** (e.g., `git merge <source>` while staying on the current branch).
- Do not create worktrees unless the user specifically requests one.

## Worktree / Multi-Instance Development

Each worktree (or parallel dev session) needs **isolated ports and state** to avoid conflicts.

### Quick setup

```bash
# In your worktree, generate isolated env (slot 1 = +100 port offset):
bash scripts/worktree-env.sh 1    # .env.worktree: API=31437, UI=2238, state=~/.milady-wt-1
bash scripts/worktree-env.sh 2    # second worktree: API=31537, UI=2338, state=~/.milady-wt-2

# All dev entry points auto-load .env.worktree when present:
bun run dev                       # dev-ui.mjs
bun run dev:desktop               # dev-platform.mjs
bun run milady start              # run-node.mjs
```

### What gets isolated

| Resource | Default (shared) | Worktree override |
|----------|------------------|-------------------|
| API port | 31337 | `MILADY_API_PORT` |
| UI port | 2138 | `MILADY_PORT` |
| Home port | 2142 | `MILADY_HOME_PORT` |
| Gateway port | 18789 | `MILADY_GATEWAY_PORT` |
| State dir (DB, config, creds) | `~/.milady/` | `MILADY_STATE_DIR` |
| PGlite database | `<default workspace>/.eliza/.elizadb` | Follows `MILADY_WORKSPACE_DIR` / `MILADY_STATE_DIR` |
| Config file | `~/.milady/milady.json` | Follows `MILADY_STATE_DIR` |

### Key rules

- **Always isolate `MILADY_STATE_DIR`** — the PGlite database uses a process lock (`postmaster.pid`). Two instances hitting the same DB will fail.
- **Port auto-allocation still works** — even without `.env.worktree`, the orchestrator probes for free ports. But explicit offsets are more predictable.
- **`bun install`** — run in the main worktree first. Git worktrees share `node_modules` via the repo root. The `.eliza-repo-setup.lock` prevents concurrent postinstall runs.
- **`.env.worktree` is gitignored** — each worktree generates its own.
- **Scripts that load `.env.worktree`**: `dev-ui.mjs`, `dev-platform.mjs`, `run-node.mjs`. Values never override already-set env vars.

## Security & Configuration

- Never commit real secrets, phone numbers, or live configuration values
- Use obviously fake placeholders in docs, tests, and examples
- Configuration lives at `~/.milady/milady.json`; the default workspace follows the runtime `cwd` for project checkouts and otherwise falls back to `~/.milady/workspace/`

## Common Pitfalls

- **`bun install` fails on native deps**: TensorFlow, canvas, whisper-node require native build tools. On macOS install Xcode CLI tools (`xcode-select --install`). On Linux install `build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev`. Set `MILADY_NO_VISION_DEPS=1` to skip optional vision deps (camera, etc.).
- **Avatar assets missing**: `bun install` clones VRM models from GitHub. On restricted networks set `SKIP_AVATAR_CLONE=1` and manually copy avatars to `apps/app/public/vrms/`.
- **Plugin not found at runtime**: Ensure `NODE_PATH` is set. Run `bun run setup:sync` to re-run postinstall (`bun run repair` is an alias).
- **Stale Vite cache after patching deps**: run `MILADY_VITE_FORCE=1 bun run dev` (or delete `apps/app/.vite/`). Dev no longer passes `--force` by default so dependency pre-bundling can cache between runs.
- **Cold rebuild / stuck artifacts**: `bun run clean` removes root `dist`, UI + Capacitor plugin `dist`, `apps/app/.vite`, Turbo, Foundry test `out/`/`cache`, Playwright output, and `node_modules/.cache` under main workspaces. `bun run clean:deep` also removes Electrobun `build/`/`artifacts/` and generated `preload.js`, plus Electron pack dirs. For a global Bun store wipe (affects all projects): `MILADY_CLEAN_GLOBAL_TOOL_CACHE=1 bun run clean`.
- **Config file not found**: The actual path is `~/.milady/milady.json` (because `ELIZA_NAMESPACE=milady`). The generic eliza default `~/.eliza/eliza.json` does not apply when running as Milady.
- **Lock file blocking install**: If postinstall times out with a lock error, delete `.eliza-repo-setup.lock` in the repo root.

## Setup Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `MILADY_NO_VISION_DEPS` | Skip vision dep install (camera/fswebcam) | `0` |
| `SKIP_AVATAR_CLONE` | Skip VRM avatar download during install | `0` |
| `MILADY_SKIP_LOCAL_UPSTREAMS` | Use npm packages instead of repo-local `./eliza` and `./plugins` sources | `0` |
| `MILADY_PROMPT_TRACE` | Log prompt compaction stats to console | `0` |
| `MILADY_TTS_DEBUG` | Log TTS pipeline traces (`[milady][tts]`): queue/proxy plus **playback** (`play:web-audio:*`, `play:browser:*`, `play:talkmode:*`) with a short `preview` of spoken text. When `/api/tts/cloud` is used, debug also adds `x-milady-tts-*` request headers for clip/full-line correlation, and those headers may include spoken-text previews. UI picks this up via Vite `define` in dev/build; for client-only, `VITE_MILADY_TTS_DEBUG` also works | `0` |
| `MILADY_CAPTURE_PROMPTS` | Dump raw prompts to `.tmp/prompt-captures/` (dev-only, contains user messages) | `0` |
| `MILADY_ACTION_COMPACTION` | Context-aware action param stripping | `1` (enabled) |
| `MILADY_PROMPT_OPT_MODE` | Prompt optimization mode (`baseline` or `compact`) | `baseline` |
