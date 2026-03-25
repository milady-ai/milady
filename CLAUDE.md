# Milady — Agent Conventions

## What This Is

Milady is a local-first AI assistant built on [elizaOS](https://github.com/elizaOS). It wraps the Eliza runtime with a CLI, desktop app (Electrobun), web dashboard, and platform connectors (Telegram, Discord, etc.).

## Quick Start (Dev)

```bash
bun install          # runs postinstall hooks automatically
bun run dev          # API on :31337, UI on :2138 with hot reload (defaults; busy ports → next free + env sync)
bun run dev:desktop  # Electrobun; skips vite build when apps/app/dist is up to date
bun run dev:desktop:watch  # Vite **dev** server + Electrobun `MILADY_RENDERER_URL` (HMR). Orchestrator pre-picks free API/UI loopback ports when defaults are in use so proxy + env match. Rollup watch: also set MILADY_DESKTOP_VITE_BUILD_WATCH=1

Desktop dev observability (agents cannot see the native window; Cursor does not auto-poll localhost): `GET /api/dev/stack` on the API; `bun run desktop:stack-status -- --json`; default-on aggregated log (`.milady/desktop-dev-console.log`) + `GET /api/dev/console-log` (loopback tail); default-on screenshot proxy `GET /api/dev/cursor-screenshot` (loopback, full-screen OS capture). Opt-out: `MILADY_DESKTOP_SCREENSHOT_SERVER=0`, `MILADY_DESKTOP_DEV_LOG=0`. See `docs/apps/desktop-local-development.md` and `.cursor/rules/milady-desktop-dev-observability.mdc`.
```

Desktop dev rationale (signals, Quit, `detached` children): `docs/apps/desktop-local-development.md`.

Optional — link a local Eliza checkout for live package development:
```bash
bun run setup:eliza-workspace   # clones ../eliza if missing, symlinks all @elizaos/* packages
```

## Build & Test

```bash
bun run build        # tsdown + vite
bun run check        # typecheck + lint
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
  plugin-wechat/        WeChat connector plugin (@miladyai/plugin-wechat)
  ui/                   Shared UI component library
  shared/               Shared utilities
  vrm-utils/            VRM avatar utilities
apps/
  app/                  Main web + desktop UI (Vite + React)
    electrobun/         Electrobun desktop shell
  homepage/             Marketing site
scripts/
  dev-ui.mjs            Dev orchestrator (API + Vite)
  run-node.mjs          CLI runner (spawns entry.js with NODE_PATH)
  run-repo-setup.mjs    Postinstall sequencer
  setup-eliza-workspace.mjs   Clone + link ../eliza packages
  patch-deps.mjs        Post-install patches for broken upstream exports
```

## Key Architecture Decisions

### NODE_PATH (do not remove)
Dynamic plugin imports (`import("@elizaos/plugin-foo")`) need NODE_PATH set to the repo root's `node_modules`. This is set in three places — all three are required:
1. `packages/agent/src/runtime/eliza.ts` — module-level, before dynamic imports
2. `scripts/run-node.mjs` — child process env
3. `apps/app/electrobun/src/native/agent.ts` — Electrobun main process

See `docs/plugin-resolution-and-node-path.md`.

### Bun exports patch (do not remove)
`scripts/patch-deps.mjs` removes dead `exports["."].bun` entries from `@elizaos` packages that point to missing `src/` paths. Without this, Bun fails to resolve plugins at runtime.

### Electrobun startup guards (do not remove)
The try/catch blocks in `apps/app/electrobun/src/native/agent.ts` keep the desktop window usable when the runtime fails.

## Config

- **Runtime config**: `~/.milady/milady.json` (override with `MILADY_CONFIG_PATH` or `MILADY_STATE_DIR`; falls back to `ELIZA_CONFIG_PATH` / `ELIZA_STATE_DIR`)
- **Env secrets**: `~/.milady/.env` or project `.env`
- **Namespace**: The CLI sets `ELIZA_NAMESPACE=milady` (via `run-node.mjs` and `dev-ui.mjs`), so the state dir is `~/.milady/` and the config file is `milady.json`

## Code Standards

- TypeScript strict mode. No `any` without explanation.
- Biome for lint + format: `bun run lint:fix && bun run format:fix`
- Tests required for bug fixes and features. Coverage floor: 25% lines, 15% branches.
- Files under ~500 LOC. Split when it improves clarity.
- No secrets in code. No real credentials.
- Minimal dependencies — only add if `src/` directly imports them.
- Commit messages: concise, action-oriented (e.g., `fix telegram reconnect on rate limit`)

## Dependencies on Eliza

All `@elizaos/*` packages use the `alpha` dist-tag. When developing locally, `bun run setup:eliza-workspace` symlinks packages from `../eliza` so changes are picked up immediately. Set `ELIZA_SKIP_LOCAL_ELIZA=1` to use only npm-published versions.

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

## Common Pitfalls

- **`bun install` fails on native deps**: TensorFlow, canvas, whisper-node require native build tools. On macOS install Xcode CLI tools (`xcode-select --install`). On Linux install `build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev`. Set `MILADY_NO_VISION_DEPS=1` to skip optional vision deps (camera, etc.).
- **Avatar assets missing**: `bun install` clones VRM models from GitHub. On restricted networks set `SKIP_AVATAR_CLONE=1` and manually copy avatars to `apps/app/public/vrms/`.
- **Plugin not found at runtime**: Ensure NODE_PATH is set. Run `bun run repair` to re-run postinstall.
- **Stale Vite cache after patching deps**: run `MILADY_VITE_FORCE=1 bun run dev` (or delete `apps/app/.vite/`). Dev no longer passes `--force` by default so dependency pre-bundling can cache between runs.
- **Cold rebuild / stuck artifacts**: `bun run clean` removes root `dist`, UI + Capacitor plugin `dist`, `apps/app/.vite`, Turbo, Foundry test `out/`/`cache`, Playwright output, and `node_modules/.cache` under main workspaces. `bun run clean:deep` also removes Electrobun `build/`/`artifacts/` and generated `preload.js`, plus Electron pack dirs. For a global Bun store wipe (affects all projects): `MILADY_CLEAN_GLOBAL_TOOL_CACHE=1 bun run clean`.
- **Config file not found**: The actual path is `~/.milady/milady.json` (because `ELIZA_NAMESPACE=milady`). The generic eliza default `~/.eliza/eliza.json` does not apply when running as Milady.
- **Lock file blocking install**: If postinstall times out with a lock error, delete `.eliza-repo-setup.lock` in the repo root.

## Setup Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `MILADY_NO_VISION_DEPS` | Skip vision dep install (camera/fswebcam) | `0` |
| `SKIP_AVATAR_CLONE` | Skip VRM avatar download during install | `0` |
| `ELIZA_SKIP_LOCAL_ELIZA` | Use npm packages instead of `../eliza` workspace | `0` |
| `MILADY_PROMPT_TRACE` | Log prompt compaction stats to console | `0` |
| `MILADY_CAPTURE_PROMPTS` | Dump raw prompts to `.tmp/prompt-captures/` (dev-only, contains user messages) | `0` |
| `MILADY_ACTION_COMPACTION` | Context-aware action param stripping | `1` (enabled) |
| `MILADY_SKIP_SECURITY_EVAL` | Skip LLM security eval, use keyword heuristic instead (for personal/DM deployments) | `0` (disabled) |
| `MILADY_SOCIAL_EVAL_EVERY_N` | Run relationship extraction every N messages | `3` |
| `MILADY_PROMPT_OPT_MODE` | Prompt optimization mode (`baseline` or `compact`) | `baseline` |
