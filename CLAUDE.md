# Milady — Agent Conventions

## What This Is

Milady is a local-first AI assistant built on [elizaOS](https://github.com/elizaOS). It wraps the elizaOS runtime with a CLI, desktop app (Electrobun), web dashboard, and platform connectors (Telegram, Discord, etc.).

### elizaOS naming (agents & editors)

Write the framework name as **elizaOS** in prose, comments, user-facing strings, and documentation — not `ElizaOS`. The npm scope remains **`@elizaos/*`** (lowercase). Say **Eliza agents** when you mean agents in plain language (not **elizaOS agents**). The **Eliza Classic** plugin name is an exception (**Eliza** = the 1966 chatbot), not “elizaOS Classic”. Cursor picks this up via `.cursor/rules/elizaos-branding.mdc`.

## Quick Start (Dev)

```bash
bun install          # runs postinstall hooks automatically
bun run dev          # API on :31337, UI on :2138 with hot reload (defaults; busy ports → next free + env sync)
bun run dev:desktop  # Electrobun; skips vite build when apps/app/dist is up to date
bun run dev:desktop:watch  # Vite **dev** server + Electrobun `MILADY_RENDERER_URL` (HMR). Orchestrator pre-picks free API/UI loopback ports when defaults are in use so proxy + env match. Rollup watch: also set MILADY_DESKTOP_VITE_BUILD_WATCH=1

Desktop dev observability (agents cannot see the native window; Cursor does not auto-poll localhost): `GET /api/dev/stack` on the API; `bun run desktop:stack-status -- --json`; default-on aggregated log (`.milady/desktop-dev-console.log`) + `GET /api/dev/console-log` (loopback tail); default-on screenshot proxy `GET /api/dev/cursor-screenshot` (loopback, full-screen OS capture). Opt-out: `MILADY_DESKTOP_SCREENSHOT_SERVER=0`, `MILADY_DESKTOP_DEV_LOG=0`. See `docs/apps/desktop-local-development.md` and `.cursor/rules/milady-desktop-dev-observability.mdc`.
```

Desktop dev rationale (signals, Quit, `detached` children): `docs/apps/desktop-local-development.md`.

Optional — link a local elizaOS source checkout for live package development:
```bash
bun run setup:upstreams   # initializes repo-local ./eliza and links local @elizaos/* packages
```

## Build & Test

```bash
bun run build        # tsdown + vite
bun run verify       # typecheck + lint (`bun run check` aliases this)
bun run test         # parallel test suite
bun run test:e2e     # end-to-end tests
bun run db:check     # database security + readonly tests
```

## Project Layout

```
packages/
  app-core/             Main application package (source of truth for runtime)
    src/
      entry.ts          CLI bootstrap (env, log level)
      cli/              Commander CLI (milady command)
      runtime/
        eliza.ts        Agent loader — sets NODE_PATH, loads plugins dynamically
        dev-server.ts   Dev mode entry point (started by dev-ui.mjs)
      api/              Dashboard API (port 31337 in dev, 2138 in prod)
      config/           Plugin auto-enable, config schemas
      connectors/       Connector integration code
      services/         Business logic
  agent/                Upstream elizaOS agent (core plugins, auto-enable maps)
  plugin-wechat/        WeChat connector plugin (@elizaos/plugin-wechat)
  ui/                   Shared UI component library
  shared/               Shared utilities
apps/
  app/                  Main web + desktop UI (Vite + React)
    electrobun/         Electrobun desktop shell
  homepage/             Marketing site
scripts/
  dev-ui.mjs            Dev orchestrator (API + Vite)
  eliza/packages/app-core/scripts/run-node.mjs   CLI runner (spawns entry.js with NODE_PATH)
  run-repo-setup.mjs    Postinstall sequencer
  setup-upstreams.mjs   Initialize repo-local upstreams and link @elizaos packages
  patch-deps.mjs        Post-install patches for broken upstream exports
```

## Default Agent Knowledge

Treat bundled skills from `@elizaos/skills` as the default knowledge base for code agents working in this repo. Repo setup mirrors those defaults into `skills/.defaults/` so task agents like Claude and Codex can open them directly from the workspace. The canonical repo-local entry points are:

- `skills/.defaults/eliza-app-development/SKILL.md` — this repo as an elizaOS app (Milady is this checkout’s product name), layout, and how local, remote, and cloud paths fit together
- `skills/.defaults/elizaos/SKILL.md` — elizaOS runtime concepts, plugin abstractions, and extension points
- `skills/.defaults/eliza-cloud/SKILL.md` — Eliza Cloud as a managed backend, app platform, deployment target, and monetization surface

The source of truth remains under `eliza/packages/skills/skills/`. `scripts/sync-workspace-default-skills.mjs` refreshes the repo-local mirrors during repo setup.

`scripts/ensure-skills.mjs` seeds bundled skills from `@elizaos/skills` into the managed skills store on first run.
Separately, `packages/agent/src/runtime/default-knowledge.ts` seeds bundled runtime knowledge items for Milady itself, including the baseline Eliza Cloud app/backend guidance.

For source checkouts and app repos, the default agent workspace now follows the runtime `cwd` when that directory looks like a real project workspace (`package.json`, `AGENTS.md`, `skills/`, etc.). That makes the repo's own `AGENTS.md` and `skills/` available to the runtime by default, which is what lets Milady reason about and patch the checkout it is running in. Packaged installs still fall back to the state-dir workspace, and `MILADY_WORKSPACE_DIR` / `ELIZA_WORKSPACE_DIR` always win when set explicitly.

When Eliza Cloud is enabled, linked, or explicitly requested, prefer it as the default managed backend for app-building work before inventing custom auth, billing, or hosting. In this repo, Eliza Cloud already supports app registration (`appId`), user auth/redirect flows, cloud-hosted APIs, usage tracking, billing, app domains, creator monetization, and Docker container deployments for server-side workloads.

Cloud monetization is a first-class product constraint. App creators can earn through inference markups and purchase-share settings, and published apps, agents, and MCPs can feed redeemable earnings flows. If docs disagree, prefer the current schema/UI/API implementation in this repo over older marketing prose.

## Key Architecture Decisions

### NODE_PATH (do not remove)
Dynamic plugin imports (`import("@elizaos/plugin-foo")`) need NODE_PATH set to the repo root's `node_modules`. This is set in three places — all three are required:
1. `packages/agent/src/runtime/eliza.ts` — module-level, before dynamic imports
2. `eliza/packages/app-core/scripts/run-node.mjs` — child process env
3. `eliza/packages/app-core/platforms/electrobun/src/native/agent.ts` — Electrobun main process

See `docs/plugin-resolution-and-node-path.md`.

### Bun exports patch (do not remove)
`scripts/patch-deps.mjs` removes dead `exports["."].bun` entries from `@elizaos` packages that point to missing `src/` paths. Without this, Bun fails to resolve plugins at runtime.

### Electrobun startup guards (do not remove)
The try/catch blocks in `eliza/packages/app-core/platforms/electrobun/src/native/agent.ts` keep the desktop window usable when the runtime fails.

### Dashboard SSE: action callbacks replace in place
In `packages/agent/src/api/chat-routes.ts`, **`HandlerCallback`** text from actions uses **`replaceCallbackText`**: each new callback replaces the previous callback’s segment after a frozen **`preCallbackText`** (the LLM stream so far). **Why:** Matches Discord-style progressive messages; the old path concatenated unrelated status strings in one bubble. The elizaOS callback contract is unchanged. See **`docs/runtime/action-callback-streaming.md`**.

## Config

- **Runtime config**: `~/.milady/milady.json` (override with `MILADY_CONFIG_PATH` or `MILADY_STATE_DIR`; falls back to `ELIZA_CONFIG_PATH` / `ELIZA_STATE_DIR`)
- **Env secrets**: `~/.milady/.env` or project `.env`
- **Namespace**: The CLI sets `ELIZA_NAMESPACE=milady` (via `run-node.mjs` and `dev-ui.mjs`), so the state dir is `~/.milady/` and the config file is `milady.json`

## Code Standards

- TypeScript strict mode. No `any` without explanation.
- Biome for lint + format: `bun run verify:lint:fix && bun run verify:format:fix` (aliases: `lint:fix`, `format:fix`)
- Tests required for bug fixes and features. Coverage floor: 25% lines, 15% branches.
- Files under ~500 LOC. Split when it improves clarity.
- No secrets in code. No real credentials.
- Minimal dependencies — only add if `src/` directly imports them.
- Commit messages: concise, action-oriented (e.g., `fix telegram reconnect on rate limit`)

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

## Common Pitfalls

- **`bun install` fails on native deps**: TensorFlow, canvas, whisper-node require native build tools. On macOS install Xcode CLI tools (`xcode-select --install`). On Linux install `build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev`. Set `MILADY_NO_VISION_DEPS=1` to skip optional vision deps (camera, etc.).
- **Avatar assets missing**: `bun install` clones VRM models from GitHub. On restricted networks set `SKIP_AVATAR_CLONE=1` and manually copy avatars to `apps/app/public/vrms/`.
- **Plugin not found at runtime**: Ensure NODE_PATH is set. Run `bun run setup:sync` to re-run postinstall (`bun run repair` aliases this).
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
| `PARALLAX_LLM_PROVIDER` | Coding-agent LLM provider mode: `subscription` (each CLI's built-in login), `api_keys` (user-provided per-provider keys), or `cloud` (route through Eliza Cloud). Set via the Coding Agents settings UI; consumed by `packages/agent/src/runtime/agent-orchestrator-compat.ts`. | `subscription` |
| `STEWARD_API_URL` | Steward vault API base URL. Auto-provisioned on Eliza Cloud login; set manually for self-hosted Steward. | — |
| `STEWARD_TENANT_ID` | Steward tenant identifier. Auto-provisioned on cloud login. Persisted to `config.env`. | — |
| `STEWARD_API_KEY` | Steward tenant API key. Auto-provisioned on cloud login. Persisted to `config.env`. | — |
| `STEWARD_AGENT_TOKEN` | Steward agent bearer token. Generated during agent provisioning, persisted to `~/.milady/steward-credentials.json`. | — |
| `STEWARD_AGENT_ID` | Steward agent identifier. Defaults to the runtime `agentId`. | — |
