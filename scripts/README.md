# `scripts/` — build, dev orchestration, tooling

Most scripts here are invoked from **root `package.json`** (`bun run …`). This README highlights the **desktop dev orchestrator**; deeper rationale lives in the docs site.

## Desktop: `dev-platform.mjs`

| npm script | Entry |
|------------|--------|
| `bun run dev:desktop` | `bun scripts/dev-platform.mjs` |
| `bun run dev:desktop:watch` | `MILADY_DESKTOP_VITE_WATCH=1` + same |

**Why a dedicated script:** Electrobun needs a renderer URL, often a running API, and (in dev) a root `dist/` bundle. Starting each piece by hand drifts on ports and env vars; one orchestrator keeps **startup and shutdown** symmetric.

**Full guide (WHYs for signals, `detached`, HMR vs Rollup watch, multiple `bun` PIDs):** [Desktop local development](../docs/apps/desktop-local-development.md)

### Supporting modules (`scripts/lib/`)

| Module | Why it exists |
|--------|----------------|
| `vite-renderer-dist-stale.mjs` | Cheap mtime check so `vite build` is skipped when `apps/app/dist` is still fresh — avoids redundant multi‑minute production builds on restart. |
| `kill-ui-listen-port.mjs` | Clears the UI port before Vite binds; Unix uses `lsof`, Windows uses `netstat` + `taskkill` because `lsof` is not standard there. |
| `kill-process-tree.mjs` | Kills **only** the PID tree rooted at each spawned child — avoids `pkill bun` style collateral damage to other workspaces. |
