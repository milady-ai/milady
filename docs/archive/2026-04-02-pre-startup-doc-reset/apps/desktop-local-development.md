---
title: Desktop local development
sidebarTitle: Local development
description: Why and how the Milady desktop dev orchestrator (scripts/dev-platform.mjs) runs Vite, the API, and Electrobun together — environment variables, signals, and shutdown behavior.
---

The **desktop dev stack** is not a single binary. `bun run dev:desktop` and `bun run dev:desktop:watch` run `scripts/dev-platform.mjs`, which **orchestrates** separate processes: optional one-off `vite build`, optional repo-root `tsdown`, then long-lived **Vite** (watch mode only), **`bun --watch` API**, and **Electrobun**.

**Why orchestrate?** Electrobun needs (a) a renderer URL, (b) often a running dashboard API, and (c) in dev, a root `dist/` bundle for the embedded Milady runtime. Doing that manually is error-prone; one script keeps ports, env vars, and shutdown consistent.

## Commands

| Command | What starts | Typical use |
|---------|-------------|-------------|
| `bun run dev:desktop` | API (unless `--no-api`) + Electrobun; **skips** `vite build` when `apps/app/dist` is fresher than sources | Fast iteration against **built** renderer assets |
| `bun run dev:desktop:watch` | Same, but **Vite dev server** + `MILADY_RENDERER_URL` for **HMR** | UI work; avoids `vite build --watch` (slow on large graphs) |

**Why two commands?** A full **production** Vite build is still useful when you want parity with shipped assets or when you are not touching the UI. **Watch** mode trades that for instant HMR by pointing Electrobun at the Vite dev server.

### Legacy: Rollup `vite build --watch`

If you explicitly need file output on every save (e.g. debugging Rollup behavior):

```bash
MILADY_DESKTOP_VITE_WATCH=1 MILADY_DESKTOP_VITE_BUILD_WATCH=1 bun scripts/dev-platform.mjs
```

**Why this is opt-in:** `vite build --watch` still runs Rollup production emits; “3 modules transformed” can still mean **seconds** rewriting multi‑MB chunks. The default watch path uses the **Vite dev server** instead.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `MILADY_DESKTOP_VITE_WATCH=1` | Enables watch workflow (dev server by default; see below) |
| `MILADY_DESKTOP_VITE_BUILD_WATCH=1` | With `VITE_WATCH`, use `vite build --watch` instead of `vite dev` |
| `MILADY_PORT` | Vite / expected UI port (default **2138**) |
| `MILADY_API_PORT` | API port (default **31337**); forwarded to Vite proxy env and Electrobun |
| `MILADY_RENDERER_URL` | Set **by the orchestrator** when using Vite dev — Electrobun’s `resolveRendererUrl()` prefers this over the built-in static server (**why:** HMR only works against the dev server) |
| `MILADY_DESKTOP_RENDERER_BUILD=always` | Force `vite build` even when `dist/` looks fresh |
| `--force-renderer` | Same as always rebuilding the renderer |
| `--no-api` | Electrobun only; no `dev-server.ts` child |
| `MILADY_DESKTOP_SCREENSHOT_SERVER` | **Default on** for `dev:desktop` / `dev:desktop:watch`: Electrobun listens on `127.0.0.1:MILADY_SCREENSHOT_SERVER_PORT` (default **31339**); the Milady API proxies **`GET /api/dev/cursor-screenshot`** (loopback) as a **full-screen PNG** for agents/tools (macOS needs Screen Recording permission). Set to **`0`**, **`false`**, **`no`**, or **`off`** to disable. |
| `MILADY_DESKTOP_DEV_LOG` | **Default on:** child logs (vite / api / electrobun) are mirrored to **`.milady/desktop-dev-console.log`** at the repo root. **`GET /api/dev/console-log`** on the API (loopback) returns a tail (`?maxLines=`, `?maxBytes=`). Set to **`0`** / **`false`** / **`no`** / **`off`** to disable. |

### When default ports are busy

`scripts/dev-platform.mjs` runs **`dev:desktop`** and **`dev:desktop:watch`**. Before starting long-lived children it **probes loopback TCP** starting at:

| Env | Role | Default |
|-----|------|--------|
| **`MILADY_API_PORT`** | Milady API (`dev-server.ts`) | **31337** |
| **`MILADY_PORT`** | Vite dev server (watch mode only) | **2138** |

If the preferred port is already bound, the orchestrator tries **preferred + 1**, then +2, … (capped), and passes the **resolved** values into **every** child (`MILADY_DESKTOP_API_BASE`, **`MILADY_RENDERER_URL`**, Vite’s **`MILADY_PORT`**, etc.).

**Why pre-allocate in the parent (not only inside the API process):** Vite reads `vite.config.ts` once at startup; the proxy’s **`target`** must match the API port **before** the first request. If only the API shifted ports after bind, the UI would still proxy to the old default until someone restarted Vite. Resolving ports **once** in `dev-platform.mjs` keeps **orchestrator logs, env, proxy, and Electrobun** on the same numbers.

**Packaged desktop (`local` embedded agent):** the Electrobun main process calls **`findFirstAvailableLoopbackPort`** (`apps/app/electrobun/src/native/loopback-port.ts`) from the preferred **`MILADY_PORT`** (default **2138**), passes that to the **`entry.js start`** child, and after a healthy start updates **`process.env.MILADY_PORT` / `MILADY_API_PORT` / `ELIZA_PORT`** in the shell. **Why we stopped default `lsof` + SIGKILL:** a second Milady (or any app) on the same default port is valid when state dirs differ; killing PIDs from the shell is surprising and can terminate unrelated work. **Opt-in reclaim:** **`MILADY_AGENT_RECLAIM_STALE_PORT=1`** runs the old **“free this port first”** behavior for developers who want single-instance takeover.

**Detached windows:** when the embedded API port is finalized or changes, **`injectApiBase`** runs for the main window and **all** `SurfaceWindowManager` windows (**why:** chat/settings/etc. must not keep polling a stale `http://127.0.0.1:…`).

**Related:** [Desktop app — Port configuration](./desktop#port-configuration); **`GET /api/dev/stack`** overwrites **`api.listenPort`** from the **accepted socket** when possible (**why:** truth beats env if something else retargets the server).

## macOS: frameless window chrome (native dylib)

On **macOS**, Electrobun only copies **`libMacWindowEffects.dylib`** into the dev bundle when that file exists (see `apps/app/electrobun/electrobun.config.ts`). Without it, **traffic-light layout, drag regions, and inner-edge resize** can be missing or wrong — easy to mistake for a generic Electrobun bug.

After cloning the repo, or whenever you change `native/macos/window-effects.mm`, build the dylib from the Electrobun package:

```bash
cd apps/app/electrobun && bun run build:native-effects
```

More detail: [Electrobun shell package](https://github.com/milady-ai/milady/tree/main/apps/app/electrobun) (README: *macOS window chrome*), and [Electrobun macOS window chrome](../guides/electrobun-mac-window-chrome.md).

## macOS: Local Network permission (gateway discovery)

The desktop shell uses **Bonjour/mDNS** to discover Milady gateways on your LAN. macOS may show a **Local Network** privacy dialog — choose **Allow** if you rely on local discovery.

Milady’s pinned **Electrobun** config types (as of the version in this repo) do **not** expose an `Info.plist` merge for **`NSLocalNetworkUsageDescription`**, so the OS may show a generic prompt. If upstream adds that hook later, we can set clearer copy; behavior does not depend on it.

## Why `vite build` is sometimes skipped

Before starting services, the script checks `viteRendererBuildNeeded()` (`scripts/lib/vite-renderer-dist-stale.mjs`): compare `apps/app/dist/index.html` mtime against `apps/app/src`, `vite.config.ts`, shared packages (`packages/ui`, `packages/app-core`), etc.

**Why mtime, not a full dependency graph?** It is a **cheap, local-first** heuristic so restarts do not pay 10–30s for a redundant production build when sources did not change. Override when you need a clean bundle.

## Signals, Ctrl-C, and `detached` children (Unix)

On **macOS/Linux**, long-lived children are spawned with `detached: true` so they live in a **separate session** from the orchestrator.

**Why:** A TTY **Ctrl-C** is delivered to the **foreground process group**. Without `detached`, Electrobun, Vite, and the API all receive **SIGINT** together. Electrobun then handles the first interrupt (“press Ctrl+C again…”) while **Vite and the API keep running**; the parent stays alive because **stdio pipes** are still open — it feels like the first Ctrl-C “did nothing.”

With `detached`, **only the orchestrator** gets TTY **SIGINT**; it runs a single shutdown path: **SIGTERM** each known subtree, short grace, then **SIGKILL**, then `process.exit`.

**Second Ctrl-C** while shutting down **force-exits** immediately (`exit 1`) so you are never stuck behind a grace timer.

**Windows:** `detached` is **not** used the same way (stdio + process model differ); port cleanup uses `netstat`/`taskkill` instead of only `lsof`.

## Quitting from the app (Electrobun exits)

If you **Quit** from the native menu, Electrobun exits with code 0 while **Vite and the API may still be running**. The orchestrator watches the **electrobun** child: on exit, it **stops the remaining services** and exits.

**Why:** Otherwise the terminal session hangs after “App quitting…” because the parent process is still holding pipes to Vite/API — same underlying issue as an incomplete Ctrl-C shutdown.

## Port cleanup before Vite (`killUiListenPort`)

Before binding the UI port, the script tries to kill whatever is already listening (**why:** stale Vite or a crashed run leaves `EADDRINUSE`). Implementation: `scripts/lib/kill-ui-listen-port.mjs` (Unix: `lsof`; Windows: `netstat` + `taskkill`).

## Process trees and `kill-process-tree`

Shutdown uses `signalSpawnedProcessTree` — **only** the PID tree rooted at each **spawned** child (**why:** avoid `pkill bun` style nukes that would kill unrelated Bun workspaces on the machine).

## Seeing many `bun` processes

**Expected.** You typically have: the orchestrator, `bun run vite`, `bun --watch` API, `bun run dev` under Electrobun (preload build + `bunx electrobun dev`), plus Bun/Vite/Electrobun internals. Worry if counts **grow without bound** or processes **survive** after the dev session fully exits.

## IDE and agent observability (Cursor, scripts)

Editors and coding agents **do not** see the native Electrobun window, hear audio, or auto-discover localhost. Milady adds **explicit, machine-readable hooks** so tools can still reason about “what is running” and approximate “what the user sees.”

**Why this exists**

1. **Multi-process truth** — Health is not one PID. Vite, the API, and Electrobun can disagree on ports; logs are interleaved. A single JSON endpoint and one log file avoid “grep five terminals.”
2. **Security vs convenience** — Screenshot and log tail endpoints are **loopback-only**; the screenshot path uses a **session token** between Electrobun and the API proxy; the log API only tails a file named **`desktop-dev-console.log`**. **Why:** local-first does not mean “any process on the LAN may pull your screen.”
3. **Opt-out defaults** — Screenshot and aggregated logging are **on** for `dev:desktop` / `dev:desktop:watch` because agents and humans debugging together benefit; both disable with **`MILADY_DESKTOP_SCREENSHOT_SERVER=0`** and **`MILADY_DESKTOP_DEV_LOG=0`** so you can shrink attack surface or disk I/O.
4. **Cursor does not auto-poll** — Discovery is **documentation + `.cursor/rules`** (see repo) plus you asking the agent to run `curl` or read a file. **Why:** the product does not silently scan your machine; hooks are there when instructed.

### `GET /api/dev/stack` (Milady API)

Returns stable JSON (`schema: milady.dev.stack/v1`): API **listen port** (from the **socket** when available), **desktop** URLs/ports from env (`MILADY_RENDERER_URL`, `MILADY_PORT`, …), **`cursorScreenshot`** / **`desktopDevLog`** availability and paths, and short **hints** (e.g. Electrobun’s internal RPC port in launcher logs).

**Why on the API:** agents often already probe `/api/health`; one extra GET reuses the same host and avoids parsing Electrobun’s ephemeral port.

### `bun run desktop:stack-status -- --json`

Script: `scripts/desktop-stack-status.mjs` (with `scripts/lib/desktop-stack-status.mjs`). Probes UI/API ports, fetches `/api/dev/stack`, `/api/health`, and `/api/status`.

**Why a CLI:** agents and CI can run it without loading the dashboard; JSON exit code reflects API health for simple automation.

### Full-screen PNG — `GET /api/dev/cursor-screenshot`

**Loopback only.** Proxies Electrobun’s dev server (default **`127.0.0.1:31339`**) which uses the same **OS-level capture** as `ScreenCaptureManager.takeScreenshot()` (e.g. macOS `screencapture`). **Not** webview-only pixels.

**Why proxy through the API:** one URL on the familiar API port; token stays in env between orchestrator-spawned children. **Why full screen first:** window-ID capture is platform-specific; this path reuses existing, tested code.

### Aggregated console — file + `GET /api/dev/console-log`

Prefixed **vite / api / electrobun** lines are mirrored to **`.milady/desktop-dev-console.log`** (session banner on each orchestrator start). **`GET /api/dev/console-log`** (loopback) returns a **text tail**; query **`maxLines`** (default 400, cap 5000) and **`maxBytes`** (default 256000).

**Why a file:** agents can `read_file` the path from `desktopDevLog.filePath` without HTTP. **Why HTTP tail:** avoids reading multi-megabyte logs into context; caps prevent OOM. **Why basename allow-list:** `MILADY_DESKTOP_DEV_LOG_PATH` could otherwise be pointed at arbitrary files.

## UI E2E (TestCafe, Bun-only)

Browser smoke tests target the **same renderer URL** Electrobun loads in watch mode (`http://localhost:<MILADY_PORT>`, default **2138**). They do **not** drive the native Electrobun webview; tray, native menus, and packaged-only behaviors stay covered by **`bun run test:desktop:packaged`** (where applicable) and the [release regression checklist](./release-regression-checklist.md).

**Why TestCafe + Bun:** `bunx testcafe` runs the CLI under Bun. Postinstall patches in `scripts/patch-deps.mjs` adjust TestCafe for Bun (`module` / callsite compatibility). Use **`bun run …`** / **`bunx`** only for this suite — do not rely on `npx` for the runner.

**Dependency:** `testcafe` is a **devDependency of `@miladyai/app`** (next to `apps/app/test/testcafe/`), not the monorepo root, so UI E2E tooling stays with the Vite app. A normal root `bun install` still hoists workspace packages; the TestCafe tree is only needed for opt-in `test:ui:testcafe*` runs.

**Browser auto-pick:** `scripts/run-testcafe.mjs` tries **macOS `.app` paths** first; on **Linux / Windows** nothing matches and it falls back to **`bunx testcafe --list-browsers`** (preferred order: chrome, opera, edge, firefox, safari).

| Command | Purpose |
|---------|---------|
| `bun run test:ui:testcafe` | Run [`apps/app/test/testcafe/smoke.testcafe.js`](../../apps/app/test/testcafe/smoke.testcafe.js); expects dev UI already on **:2138** (e.g. `ELIZA_DEV_ONCHAIN=0 bun run dev`). Auto-picks an installed browser (Chrome, Opera GX, Firefox, Edge, Safari). |
| `bun run test:ui:testcafe:with-dev` | Same, but runs `bun run dev` first if the UI port is closed (`--spawn-dev` / `MILADY_TESTCAFE_SPAWN_DEV=1`). |
| `bun run test:ui:testcafe:packaged` | Optional **`file://` + hash** check for packaged-style routing; needs `apps/app/dist/` from `cd apps/app && bun run build`. Skips if `dist` is missing. |
| `bun run test:ui:testcafe -- opera` | Force a browser alias TestCafe recognizes. |

**Full test matrix:** `bun run test` does **not** run TestCafe by default. Set **`MILADY_TEST_UI_TESTCAFE=1`** to append the UI suite to `test/scripts/test-parallel.mjs` (serial, after Vitest e2e). Use only on machines or CI images with a supported browser.

**Path A vs native webview (Phase B):** Automating the **embedded** Electrobun surface without Node on the host is unresolved; options are TestCafe remote/browser targets, or running automation **inside Docker** while the host only runs `bun` / `docker`. Legacy Playwright **web-views** config (`apps/app/playwright.web-views.config.ts`) still expects a **Node**-driven Playwright CLI for `.ts` config.

## Related source

| Piece | Role |
|-------|------|
| `.cursor/rules/milady-desktop-dev-observability.mdc` | Cursor: when to use stack / screenshot / console hooks (**why:** product does not auto-scan localhost) |
| `scripts/dev-platform.mjs` | Orchestrator; sets env for stack / screenshot / log path |
| `scripts/lib/vite-renderer-dist-stale.mjs` | When `vite build` is needed |
| `scripts/lib/kill-ui-listen-port.mjs` | Free UI port |
| `scripts/lib/kill-process-tree.mjs` | Scoped tree kill |
| `scripts/lib/desktop-stack-status.mjs` | Port + HTTP probes for `desktop:stack-status` |
| `scripts/desktop-stack-status.mjs` | CLI entry for agents (`--json`) |
| `packages/app-core/src/api/dev-stack.ts` | Payload for `GET /api/dev/stack` |
| `packages/app-core/src/api/dev-console-log.ts` | Safe tail read for `GET /api/dev/console-log` |
| `apps/app/electrobun/src/index.ts` | `resolveRendererUrl()`; starts screenshot dev server when enabled |
| `apps/app/electrobun/src/screenshot-dev-server.ts` | Loopback PNG server (proxied as `/api/dev/cursor-screenshot`) |
| `scripts/run-testcafe.mjs` | TestCafe runner (browser detect, optional `--spawn-dev`, `--fixture`) |
| `apps/app/test/testcafe/smoke.testcafe.js` | Main UI traversal + `TAB_PATHS` parity (e.g. `/apps` disabled) |

## See also

- [Desktop app (Electrobun)](/apps/desktop) — runtime modes, IPC, downloads
- [Electrobun startup and exception handling](../electrobun-startup.md) — why main-process try/catch stays
