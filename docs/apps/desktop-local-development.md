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

## Related source

| Piece | Role |
|-------|------|
| `scripts/dev-platform.mjs` | Orchestrator |
| `scripts/lib/vite-renderer-dist-stale.mjs` | When `vite build` is needed |
| `scripts/lib/kill-ui-listen-port.mjs` | Free UI port |
| `scripts/lib/kill-process-tree.mjs` | Scoped tree kill |
| `apps/app/electrobun/src/index.ts` | `resolveRendererUrl()` — env vs static server |

## See also

- [Desktop app (Electrobun)](/apps/desktop) — runtime modes, IPC, downloads
- [Electrobun startup and exception handling](../electrobun-startup.md) — why main-process try/catch stays
