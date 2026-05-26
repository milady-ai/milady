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
  setup-upstreams.mjs   Initialize repo-local upstreams and link @elizaos packages
  patch-deps.mjs        Post-install patches for broken upstream exports
```

## elizaOS Architecture Map

This section is the mental model you need before touching anything. It maps how elizaOS (the framework) and Milady (this productized wrapper on top of it) fit together, and what concepts the runtime uses internally.

### The layer cake (who owns what)

```
┌──────────────────────────────────────────────────────────────────────┐
│  apps/app/                       desktop shell + web UI              │  ◄── Milady
│    electrobun/      native window + main process                     │     (product)
│    src/             Vite React renderer (CompanionShell, settings…)  │
│  apps/homepage/                  marketing site                      │
├──────────────────────────────────────────────────────────────────────┤
│  packages/app-core/              Milady runtime wrapper              │  ◄── Milady
│    entry.ts, cli/, dev-server, api/ (dashboard SSE chat),            │     (glue)
│    config/, connectors/, services/                                   │
├──────────────────────────────────────────────────────────────────────┤
│  packages/agent/                 elizaOS upstream "agent" layer      │  ◄── elizaOS
│    runtime/ (eliza.ts, plugin-resolver, core-plugins),               │     (framework
│    config/plugin-auto-enable.ts, api/chat-routes.ts                  │      shell)
├──────────────────────────────────────────────────────────────────────┤
│  @elizaos/core (eliza/packages/core/)                                │  ◄── elizaOS
│    runtime.ts (AgentRuntime), types/{plugin,components,service,…}    │     (framework
│    services/message.ts (DefaultMessageService), memory, models       │      core)
├──────────────────────────────────────────────────────────────────────┤
│  @elizaos/plugin-* and @miladyai/plugin-*                            │  ◄── both
│    discord, openrouter, anthropic, solana, wallet, vision …          │
│    miladyai/plugin-{pump-monitor, agent-reach, roles, …}             │
└──────────────────────────────────────────────────────────────────────┘
```

**Rule of thumb when changing things:**
- Need a new capability/action/data source? → write a plugin (own scope `@miladyai/plugin-*` or fork an upstream one under `plugins/`).
- Need to change runtime behavior (plugin loading, model routing, message flow)? → that's `@elizaos/core` — edit the eliza checkout under `./eliza/` if linked via `bun run setup:upstreams`.
- Need to change how Milady wires up plugins, CLI flags, dashboard API, dev server, or namespace? → `packages/app-core/`.
- Need to change Discord/Telegram/etc behavior? → the connector plugin under `plugins/plugin-<connector>/` (linked from `./eliza/plugins/` after `setup:upstreams`).

### elizaOS vs Milady — what each one actually is

| | elizaOS (framework) | Milady (product) |
|---|---|---|
| **npm scope** | `@elizaos/*` | `@miladyai/*` |
| **Repo** | github.com/elizaOS | this repo, `milady-fisbat` |
| **Owns** | runtime, plugin contracts, core plugins (discord, openrouter, etc.) | CLI (`milady`), desktop app (Electrobun), web dashboard, dev server, postinstall sequencer, plugin auto-enable map, project-specific plugins (pump-monitor, agent-reach, …) |
| **State dir default** | `~/.eliza/` | `~/.milady/` (because `ELIZA_NAMESPACE=milady`) |
| **Config file** | `eliza.json` | `milady.json` |
| **Runtime entry** | `eliza-start` (also used by Milady) | `milady` CLI → `scripts/run-node.mjs` → `packages/app-core/dist/entry.js` → eventually `eliza-start` |
| **Plugin loading** | `resolvePlugins()` in `packages/agent/src/runtime/plugin-resolver.ts` | Milady provides workspace-override hints, ejected-plugin paths, and the auto-enable wiring on top |
| **Char defaults** | None | `packages/app-core/src/config/characters/` and runtime config in `~/.milady/milady.json` |
| **Connectors** | implementations live in `@elizaos/plugin-discord`, `@elizaos/plugin-telegram`, etc. | configured via `milady.json → connectors.{discord, telegram, …}`. The presence of a connector key drives plugin auto-enable. |
| **What "ejecting" means** | n/a | A plugin source-fork copied into `~/.milady/plugins/ejected/<name>/` — wins over every other resolution path. Used when you need to patch an upstream plugin without forking the whole eliza repo. |

The boundary: **elizaOS is the framework; Milady is a curated install of elizaOS + extra UI + extra plugins + opinionated config.** When something "doesn't work in Milady but should in eliza", the bug is usually in `packages/app-core/` or `packages/agent/` (the auto-enable map). When something "doesn't work in either", it's in `@elizaos/core`.

### Runtime concepts (what gets registered with the agent)

A **Plugin** (`@elizaos/core/types/plugin.ts:360-464`) is a bundle. Each can declare any combination of:

| Concept | What it is | Lifetime | Where defined |
|---|---|---|---|
| **Service** | Long-lived singleton — Discord client, browser pool, task scheduler. One instance per `serviceType`. Created via `Service.start(runtime)`, accessed via `runtime.getService<T>("discord")`. | Process-lifetime | `@elizaos/core/types/service.ts:107` |
| **Action** | Stateless "thing the agent can do" — REPLY, SEND_TWEET, TRANSFER. Has `validate(runtime, message, state)` (gate) and `handler(...)` (does the work + calls `callback(response)`). Multiple actions can fire per turn. | Per-message-turn | `@elizaos/core/types/components.ts:160` |
| **Provider** | Context source — injects `{text, values, data}` into the prompt every turn via `composeState`. This is how the agent "knows" the time, recent memories, wallet balance, task list, etc. | Per-message-turn | `@elizaos/core/types/components.ts:326` |
| **Evaluator** | Post-response reflection. Same shape as Action but runs *after* `processActions`. `alwaysRun: true` for fact-extraction / reflection. | Per-message-turn (after actions) | `@elizaos/core/types/components.ts:244` |
| **Model handler** | LLM implementation. Registered under `plugin.models[ModelType.TEXT_LARGE]`. Called via `runtime.useModel(ModelType.X, params)`. Multiple plugins can register for the same model type — runtime picks by registration order or explicit provider hint. | Per-call | `@elizaos/core/types/model.ts` + `plugin.ts:410` |
| **Event handler / Route / Adapter** | Plugins can also register event handlers (`MESSAGE_RECEIVED`, etc.), HTTP routes, and DB adapters. Less common. | varies | `plugin.ts` |

**Action vs Service** is the most common confusion. Rule: if it has state or a connection or a timer, it's a Service. If it's a thing the LLM decides to do based on the message, it's an Action. A connector plugin typically has **both** — the Service holds the gateway connection, the Actions send messages through it.

### Message flow (Discord message → response)

```
Discord gateway message
        ↓
plugin-discord Service (the gateway listener) normalizes to Memory
        ↓
runtime.emitEvent("MESSAGE_RECEIVED", { runtime, message, callback, source })
        ↓
DefaultMessageService.handleMessage  (eliza/packages/core/src/services/message.ts:2967)
   ├─ shouldRespond gate (small LLM call — can be disabled with CHECK_SHOULD_RESPOND=false)
   ├─ composeState() — collects {text, values, data} from every Provider
   ├─ runtime.useModel(RESPONSE_HANDLER or TEXT_LARGE, { prompt, ... })
   │     ↓ returns XML/JSON with: thought, list of actions, reply text
   ├─ processActions() — for each action: validate, handler, threading ActionResult into State for the next
   │     │       each action's handler calls callback(response) → goes back to Discord
   │     │       Milady's dashboard SSE path replaces this callback with replaceCallbackText
   │     │       (see "Dashboard SSE" decision below)
   │     ↓
   └─ evaluate() — post-turn evaluators (reflection, facts)
        ↓
HandlerCallback resolves → Discord plugin posts the message
```

If you see "multiple LLM calls for one message" in logs, that's expected: shouldRespond + response + per-action validators + final reflection. The duplicate-message bug is *not* about multiple LLM calls inside one runtime — it's about multiple runtimes sharing one bot token (see "Botdick Deployment" → "Duplicate Discord responses" below).

### Plugin loading & resolution order

Entry: `packages/agent/src/runtime/plugin-resolver.ts:508` → `resolvePlugins()`. For each plugin name, `loadSinglePlugin` tries sources **in this order** and stops at the first that resolves:

1. **Ejected** — `~/.milady/plugins/ejected/<name>/` (always wins; local fork drop-in).
2. **Statically imported `@elizaos/*`** — for plugins in the `STATIC_ELIZA_PLUGINS` allowlist in `packages/agent/src/runtime/eliza.ts:221`. Avoids workspace symlink edge cases.
3. **Workspace override** — `<repo>/plugins/plugin-foo/` or `<repo>/eliza/plugins/plugin-foo/`. The regex is `@[^/]+/(plugin-[^/]+)$` so **any scope works** (e.g., `@miladyai/plugin-pump-monitor` resolves to `plugins/plugin-pump-monitor/`).
4. **Install record** — `milady.json → plugins.installs[name].installPath` (set by the plugin manager UI's npm install flow).
5. **Bare npm resolution** — `import("@elizaos/plugin-foo")` via Node's normal `node_modules` walk, helped along by `NODE_PATH`.

Every loaded plugin is wrapped with `wrapPluginWithErrorBoundary` — a single plugin's `init` or `provider.get` throw won't crash the runtime (core plugins re-throw though).

### Plugin auto-enable

`packages/agent/src/config/plugin-auto-enable.ts:307 applyPluginAutoEnable()` decides **which** plugins to load before resolution runs. Sources:

| Source | Trigger | Example |
|---|---|---|
| **Connectors** (`CONNECTOR_PLUGINS`) | `connectors.{discord,telegram,…}` present in milady.json | `connectors.discord` → loads `@elizaos/plugin-discord` |
| **Provider env keys** | env vars in milady.json `env.*` | `OPENROUTER_API_KEY` → `@elizaos/plugin-openrouter`, `ELIZAOS_CLOUD_API_KEY` → `@elizaos/plugin-elizacloud`, `SOLANA_PRIVATE_KEY` → `@elizaos/plugin-wallet` |
| **Feature flags** (`FEATURE_PLUGINS`) | `plugins.features.<name>` | `features.vision` → `@elizaos/plugin-vision` |
| **Custom entry keys** | `plugins.entries.<name>` boolean or object | `entries["pump-monitor"].enabled = true` → `@miladyai/plugin-pump-monitor`. **Required for plugins that don't have a connector or env-key trigger.** |
| **Plugin self-declared `autoEnable`** | `plugin.autoEnable.{envKeys, connectorKeys, shouldEnable}` (newer pattern) | declarative — newer plugins describe their own enable rules |

When adding a new Milady plugin, the bare minimum is:
1. An entry in `packages/agent/src/config/plugin-auto-enable.ts` (both the env-key map AND the `FEATURE_PLUGINS` map for the entry-key trigger), OR
2. Self-declared `autoEnable` rules on the plugin object, AND
3. The corresponding flip in milady.json (env var, connector config, or `plugins.entries.<name>`).

The `app-core/dist` bundle imports the auto-enable map from `@elizaos/agent`, so on the VPS only the `plugins.entries` route is reliable for adding new Milady plugins without rebuilding `@elizaos/agent`.

### `useModel` and the LLM_MODE override

`runtime.useModel(modelType, params, providerHint?)` (`@elizaos/core/runtime.ts:4841`):

1. Applies global `LLM_MODE` override — if set to `SMALL` or `LARGE`, **every** text-generation call gets rewritten to `TEXT_SMALL` or `TEXT_LARGE`. This is the easiest way to globally downgrade/upgrade model usage without touching code.
2. Looks up `resolveModelRegistration(modelKey, providerHint)` — plugins register handlers in `plugin.models[ModelType.X]`. Multiple registrations are kept in a map; the runtime picks by order or by `providerHint`.
3. Invokes handler. Handler is the actual provider call (Anthropic SDK, OpenRouter HTTP, ElizaCloud, Ollama, etc.) and returns text/JSON/embedding.
4. If no handler exists for the requested type but other text handlers do, the runtime picks a substitute. If zero text handlers exist, throws a typed "no LLM provider configured" error.

Streaming: the handler calls `onStreamChunk(chunk, messageId, accumulated)`. `accumulated` is the authoritative full text — important for TTS reassembly which had bugs assuming chunk-concat.

### Other framework knobs worth knowing

- **Core plugins always loaded** (in addition to whatever auto-enable selects): `packages/agent/src/runtime/core-plugins.ts` — `plugin-sql`, `plugin-local-embedding`, `plugin-form`, `plugin-agent-orchestrator`, `plugin-cron`, `plugin-shell`, `plugin-agent-skills`, `plugin-commands`, `plugin-plugin-manager`, `@miladyai/plugin-roles`.
- **CHECK_SHOULD_RESPOND=false** — disables the shouldRespond gate. Bot replies to everything. Useful for "ChatGPT mode" deployments.
- **`emitEvent`** — anything in the runtime can fire events. Plugins subscribe via `events: { MESSAGE_RECEIVED: [handler1, handler2] }`. This is the side-channel for logging, trajectories, telemetry.
- **`HandlerCallback`** — actions don't `return` text; they call `callback({ text, action, attachments })`. Milady's dashboard SSE replaces this with `replaceCallbackText` (see "Dashboard SSE" decision below).
- **Memories** — `runtime.createMemory(...)`, `runtime.searchMemories(...)`. Backed by `plugin-sql` adapter (PGlite locally).

### Mental-model traps

1. **"I'll just edit `@elizaos/core` to fix this"** — only useful if you've linked the eliza checkout via `bun run setup:upstreams`. Otherwise you're editing `node_modules` and it'll be wiped on next install. Verify with `ls -la node_modules/@elizaos/core` — should be a symlink to `eliza/packages/core/`.
2. **"My plugin loaded but the action isn't firing"** — check the plugin's `validate()` first. Then check it's in the LLM's prompt context (action descriptions are injected via `composeState`, which means the plugin's `actions[]` must contain it). Action names are case-sensitive.
3. **"The LLM keeps hallucinating an action that doesn't exist"** — too many actions in context; the model is mixing names. Reduce the action surface area for that character/turn, or sharpen `description`s.
4. **"Provider is registered but not appearing in prompts"** — check `dynamic: true` (skipped unless requested) and `private: true` (only injected when explicitly named). Also check `relevanceKeywords` and `contexts[]` if the router is filtering.
5. **"Service won't start, plugin won't load"** — wrap-in-error-boundary swallows the throw and logs it. Look for `plugin init failed:` in logs (without `--log-level=debug` it's still emitted as warn).
6. **"Adding new plugin to milady.json doesn't auto-load it"** — needs BOTH the entry in `plugin-auto-enable.ts` (or self-declared `autoEnable`) AND the `plugins.entries.<name>` flip. One alone won't trigger it.

### Cross-references

- **NODE_PATH details**: see "Key Architecture Decisions → NODE_PATH" below.
- **Dashboard streaming**: see "Dashboard SSE: action callbacks replace in place" below.
- **Plugin resolution edge cases**: `docs/plugin-resolution-and-node-path.md`.
- **Action callback streaming**: `docs/runtime/action-callback-streaming.md`.

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

**Pinned plugin exception — `@elizaos/plugin-agent-orchestrator`:** this package is pinned to an exact published version (currently `0.6.1`) in `packages/agent/package.json` rather than tracking `alpha`, because coordinator/orchestrator behavior is load-bearing for Parallax multi-agent work and we want reproducible builds against a vetted snapshot. To develop against a local checkout of the plugin, run `bun run setup:upstreams` to link the repo-local copy under `plugins/plugin-agent-orchestrator`; otherwise Bun will resolve the pinned npm version.

All official elizaOS plugin repos live under [https://github.com/elizaOS-plugins](https://github.com/elizaOS-plugins). For plugin work, prefer adding the relevant plugin repo as a git submodule under `plugins/` so we keep a local checkout we can patch when needed, and depend on it via `workspace:*` so Milady resolves the local package directly during development. Publish new versions to npm when ready.

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
| PGlite database | `~/.milady/workspace/.eliza/.elizadb` | Follows `MILADY_STATE_DIR` |
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

---

## Botdick Production Deployment (read this before touching prod)

Botdick is a downstream consumer of `milady-fisbat` running on a VPS. When work touches the live bot, every operational gotcha below has burned at least one session — don't relearn them.

### Where it lives
- **VPS**: `root@144.202.12.42`. Project root: `/opt/botdick/milady-fisbat-integration/`
- **Runtime config**: `/home/botdick/.milady/milady.json` (NOT `~/.eliza/eliza.json`)
- **User home**: `/home/botdick/` (state, n8n db at `/home/botdick/.eliza/n8n/database.sqlite`)
- **Discord owner / admin**: fishai = user id `1281434689910997084`, X handle `@binkyfishai`
- **Botdick on X**: `@bot_dick_` (verified). Cozydev community context (shaw `@shawmakesmagic`, dex `@dEXploarer`, etc.)

### Service control (the deactivating-forever trap)
`systemctl restart botdick` regularly hangs in "deactivating" because n8n child processes hold the cgroup. Always use:
```bash
ssh root@144.202.12.42 'systemctl kill botdick --signal=SIGKILL; sleep 2; systemctl reset-failed botdick 2>/dev/null; systemctl start botdick'
```

Other systemd units on the box that send Discord messages / generate content (check these when diagnosing "rogue process" behavior):
| Unit | What it does |
|---|---|
| `botdick.service` | The main Milady runtime |
| `botdick-middle-east-monitor.service` | RSS news polling → `botdick.com/api/events` |
| `botdick-runtime-event-mirror.service` | Mirrors runtime logs/events to `botdick.com/api/events` |
| ~~`botdick-x-draft-dm.timer`~~ | **DISABLED 2026-05-19** — hourly Twitter draft DM engine. Unit files renamed to `.disabled` under `/etc/systemd/system/`. Replaced by plugin-agent-reach's grok-driven post-gen. |
| `botdick-agents-status.timer` | Renders agents-status HTML |
| `botdick-image-heartbeat.timer` | Image-gen heartbeat |
| `launch-proxy.service` | pump.fun launch page backend |

n8n runs as a child of `botdick.service` (`npm exec n8n@1.100.0 start`) — workflows in `/home/botdick/.eliza/n8n/database.sqlite`. There's no `sqlite3` CLI on the box; use `python3` with the sqlite3 module.

### Duplicate Discord responses — the bot-token-sharing trap
**Symptom**: botdick sends 2–4 responses to one message, sometimes including a literal duplicate.

**Cause**: another process is connected to Discord with the same bot token. Discord allows multiple gateway connections per token; each instance receives every message event and runs its own response.

**Hot spot**: the user's Mac had `~/Library/LaunchAgents/com.botdick.runtime.plist` with `KeepAlive: true` running a second botdick. Now renamed to `.disabled`. If duplicates ever return:
1. `launchctl list | grep botdick` (on the Mac)
2. `ps auxww | grep -E "milady\.mjs|run-node\.mjs|start-botdick"` (on every machine that has the token)
3. Kill the agent: `launchctl bootout gui/$(id -u)/com.botdick.runtime`

**Don't trust "the VPS is the only one running"** — verify by checking `journalctl -u botdick --no-pager | grep "Message sent"` in the time window of the duplicate. If only one send is logged but multiple appeared in Discord, the other instance is elsewhere.

### Discord plugin specifics
- **Strict mode (mention-only)**: `DISCORD_MENTION_ONLY_GUILD_IDS` env var (CSV) in milady.json. Currently `1351701662066016330` (fishtank — has a bot named the same).
- Auto-enable behavior: each plugin needs (a) an entry in `packages/agent/src/config/plugin-auto-enable.ts` (`AGENT_REACH_ENABLED` → `@miladyai/plugin-agent-reach` style), AND (b) an entry under `plugins.entries.<name>` in milady.json (e.g. `"agent-reach": {"enabled": true}`). Without both it won't load.

### Workspace plugin override (how local plugins beat the npm version)
- Resolver in `packages/agent/src/runtime/plugin-resolver.ts` matches `@[scope]/plugin-foo` against `plugins/plugin-foo/package.json` (regex `@[^/]+/(plugin-[^/]+)$`). Any scope works.
- VPS plugin path: `/opt/botdick/milady-fisbat-integration/plugins/plugin-foo/`
- Plugins ship **dist-only**. `bun install` on the monorepo VPS fails (workspace:* deps unresolvable). To add a runtime dep to a VPS-installed plugin: `npm install pkg --prefix /path/to/plugin-foo/node_modules` (double-nested intentional)

### Local plugin build & deploy cycle (Mac → VPS)
- tsup binary lives at `/Users/binkyfishai/milady-fisbat/node_modules/.bun/tsup@8.4.0+938d278e164c598a/node_modules/.bin/tsup` — no symlink at the repo root `node_modules/.bin/tsup`
- Standard build: `tsup src/index.ts --format esm --dts --clean --external @elizaos/core` + `--external` for every other runtime dep (e.g. `@solana/web3.js`, `bs58`)
- Deploy: build locally → `scp dist/index.js root@144.202.12.42:/opt/botdick/.../plugin-foo/dist/index.js` → SIGKILL+start the service

### Pump.fun auto-deploy (plugin-pump-monitor)
- Deployer wallet: `34NMTyrFJjbL5KbcgtBNCd7dpA8bS3cSwFivKwofJdAd`. Funded with SOL via the user.
- **PumpPortal bug**: `action=create` with `amount > 0` triggers a server-side `.toBuffer()` crash. Workaround: create with `amount=0`, then a separate `buy` request after the create lands.
- **PumpPortal indexer lag**: ~minutes between create tx landing and `buy` finding the bonding curve. Buy retries with 10s/15s/20s/30s backoff. Detect the lag via response body containing "Failed to find pump.fun bonding curve".
- **`confirmTransaction()` ≠ succeeded**. It only means "included in a block". Always re-fetch with `getTransaction()` and check `meta.err === null` after. Otherwise you silently deploy nothing while logs say "SUCCESS".
- Current tuning: 0.001 SOL buy, 0.0001 priority fee, 0.009 SOL min-balance gate. Jito RPC first, Solana RPC fallback.
- Each successful deploy costs ~0.01 SOL (rent + tx fees + buy). Failed creates still burn the ~0.00051 SOL tx fee.

### Agent-Reach (Twitter/Reddit/YouTube/Web access — plugins/plugin-agent-reach)
- Wraps CLI tools installed on the VPS via `pip3 install --break-system-packages twitter-cli rdt-cli yt-dlp`. Jina Reader is `curl https://r.jina.ai/<url>` (zero-config).
- Twitter auth: cookies `TWITTER_AUTH_TOKEN` + `TWITTER_CT0` from a logged-in x.com browser session, stored in milady.json. Authed as `@binkyfishai`. To re-extract: DevTools → Application → Cookies → x.com.
- Actions exposed: `SEARCH_TWITTER`, `READ_TWEET`, `TWITTER_USER`, `READ_URL`, `SEARCH_YOUTUBE`, `SEARCH_REDDIT`.

### LLM provider state
- **Primary**: OpenRouter (`OPENROUTER_API_KEY`).
- **ElizaCloud**: `ELIZAOS_CLOUD_API_KEY` set, ~$100 budget. Plugin `@elizaos/plugin-elizacloud` auto-enables when key is present. Use for self-improvement / specialized post generation.
- **fal.ai**: balance exhausted as of 2026-05-19 — image gen returns 403 "User is locked. Reason: Exhausted balance." Auto-deploy works fine because it reuses parent token's image; standard alerts go imageless.

### Discord bot avatar keeps reverting to eliza default
**Two-field gotcha**: Discord stores the bot's **user avatar** (what shows in messages/DMs/left panels) and the **application icon** (what shows on the App Profile side panel when you click the bot's profile) on completely different endpoints:
- User avatar: `PATCH /users/@me` (bot token) — what elizaOS profileSync touches
- Application icon: `PATCH /applications/@me` (bot token) — elizaOS does NOT manage this

User-avatar reverting:
- `@elizaos/plugin-discord/profileSync.ts` runs `syncDiscordClientProfile` on every Discord client connect.
- Resolution order: `connectors.discord.profileAvatar` → `character.identity.avatar` → `character.avatar` → **`DEFAULT_DISCORD_PROFILE_AVATAR`** (= `/avatars/eliza.png`, eliza-bundled default).
- If none of the first three are set, every restart re-pushes the eliza default and clobbers whatever the user uploaded via the Dev Portal.
- **Fix:** set `connectors.discord.syncProfile: false` (disable the sync, user manages manually) OR set `connectors.discord.profileAvatar` to a hosted URL / `data:image/png;base64,...`. Botdick has `syncProfile: false` since 2026-05-19.
- A hash of the last-pushed avatar is persisted; the plugin won't push the same bytes twice. But any config change re-evaluates.

Application-icon reverting:
- This is a separate field that elizaOS never touches. If the App Profile side panel keeps showing an eliza-default character even though the bot user avatar is correct, the **application icon** is the culprit, not the user avatar.
- Set via Discord Dev Portal → App → General Information → APP ICON, OR via API:
  ```bash
  curl -X PATCH https://discord.com/api/v10/applications/@me \
    -H "Authorization: Bot $TOKEN" \
    -H "Content-Type: application/json" \
    -H "User-Agent: DiscordBot (https://botdick.com, 1.0)" \  # required — default UA gets cloudflare-1010-blocked
    --data '{"icon": "data:image/png;base64,..."}'
  ```
- Cloudflare blocks Python's `urllib` default UA. Always use curl OR set a proper `User-Agent` header on Discord API calls from Python.

### Local embedding timeout (botdick prod)
- `plugin-local-embedding` defaults to a **2000ms** timeout on `bge-small-en-v1.5` (CPU). on a busy VPS this is too short — embeddings take 2-5s under load, every call fails, memory recall returns nothing and surfaces as `Failed to recall memories: The operation was aborted due to timeout` to the user.
- Override env (any of these three): `LOCAL_EMBEDDING_TIMEOUT_MS`, `ELIZA_LOCAL_EMBEDDING_TIMEOUT_MS`, `MILADY_LOCAL_EMBEDDING_TIMEOUT_MS`. Botdick has it set to `15000`.

### Mac sandbox gotchas (working from this repo)
- `ssh` and `scp` to the VPS need `dangerouslyDisableSandbox: true` on Bash tool calls — `144.202.12.42` is not in the network allowlist.
- `ps`, `kill`, `pkill`, `lsof` often error with "operation not permitted" in the sandbox. Disable sandbox to use them.
- `find` and `grep` over the repo work fine, but searches into `/Library/`, `/Users/binkyfishai/Library/LaunchAgents/`, etc. need sandbox-disable.

### Voice
- Botdick's public voice is lowercase shitposter (cozydev community style). Match it in user-facing text from the agent.
- Replies in *this* CLI session should also lean lowercase / terse to save tokens, unless writing code/config where normal case is required.
- Internal log messages, error strings, source-code comments stay normal case.

---

## Debugging anti-patterns (learned the hard way, 2026-05-26)

When the user says **"this used to work, now it doesn't"**, the first move is NOT to start fixing visible symptoms. The first move is:

1. **Find a known-working snapshot** — backup files (`*.bak-*` on the VPS, milady.json.bak*), git history, journal entries from a successful run. Whatever proves the working state existed.
2. **Read the SUCCESS path end-to-end.** Every step from trigger (e.g. Discord message arriving) to deliverable (e.g. URL posted in chat, file written, screenshot sent). Not just the cosmetic detail that's easiest to spot.
3. **Diff working-state against current-state — byte-level, not narrative.** `diff` the two dist files. Compare env-var sets. Compare the exact contract text injected into the task. The actual differences are the candidates for what broke. Do not guess what changed.
4. **Only then write a patch.** And one patch. If you're on patch 3+ for the same class of failure, stop — you're chasing symptoms, restart with step 1.

### Specific failure modes to watch for in my own behavior

**Confabulating causation.** Seeing one piece of evidence (e.g. "codex auth failed at 23:51") and immediately building a narrative around it. The narrative is internally consistent with the evidence I happened to look at, AND completely wrong because I didn't check the OTHER evidence that contradicts it. (Codex auth failing is irrelevant if the workflow uses claude subagents. Always verify which code path is actually firing before claiming a cause.)

**Latching onto cosmetic differences.** User says "this used to work" and points at a working artifact. The first visible difference (e.g. "slug name vs UUID") is rarely the cause — it's a *secondary indicator* that some upstream thing was healthier. The user is pointing at the entire pipeline that produced the artifact, not the surface property.

**Apologizing for the small thing.** Apologizing for "noticing the env var late" when the actual failure is "I never built a model of what success looks like" is worse than silence — it signals I still don't understand the meta-pattern.

**The "twelve-patch smell".** If I'm on patch 5+ in a session, I'm not engineering, I'm firefighting. Each new patch reveals the next symptom because I never understood the system. A well-modeled bug needs one targeted fix, or zero (it's an env var / config).

**Reacting to tool output too fast.** Long-context sessions reward fast tool-use response. When user shows broken output, the instinct is to grep for a string and patch the matching line. Resist. Sit with the problem first. The right next action is usually to READ MORE — more of the journal, more of the dist diff, more of the contract — not to patch.

### Botdick-specific: the May 23 working pattern for Discord-triggered subagents

For `Discord ping → claude subagent → deployable artifact`:

- **Workspace** = `~/.eliza/workspaces/<slug>/` (set when `PARALLAX_CODING_DIRECTORY=/home/botdick/.eliza/workspaces` in milady.json env, OR cached in runtime.character.settings via a prior action)
- **Claude writes files directly** into that workspace
- **Caddy already serves** `projects.botdick.com/workspaces/*` from that dir → the workspace IS the deployed URL
- **"Deploy" and "build" are the same act** — no separate publish step needed for the simple case
- **Completion message** includes the workspace Browse URL as the deployed URL

The `publish-botdick-project.mjs` flow (added to the Discord contract after May 23) introduces a second copy step that has its own failure modes: leaks bot source if workdir is bot's repo, requires claude to remember an extra command, breaks the URL chain when skipped. The May 23 pattern is simpler.

When debugging "claude subagent doesn't complete" on botdick, the working trace pattern from May 23 09:22 (in `journalctl -u botdick`) is:
```
Title: <slug>
Wrote memory file for claude: <workspace>/CLAUDE.md
Spawned session pty-X (claude)
[task delivery retries — "0 new lines" noise is NORMAL, not a bug]
Hook event for pty-X: task_complete {"source":"hook"}
Turn complete: assessor LLM failed but turn output is non-empty, treating as complete
Trusting the subagent.
Stopping session
```

The "assessor LLM failed → trust the subagent" fallback is the path that successful completions take. If that fallback isn't firing for current sessions, that's a real regression worth investigating.
