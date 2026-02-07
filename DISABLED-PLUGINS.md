# Disabled Plugins — Re-enable When Fixed

## Re-enabled on 2026-02-07

All 5 plugins that were disabled on 2026-02-06 have been **re-enabled**. They are now
published to npm with the `next` dist-tag and proper `dist/` contents.

| Plugin | npm Status | Action Taken |
|--------|-----------|--------------|
| `@elizaos/plugin-cli` | `2.0.0-alpha.3` (next) | Re-added to deps, CORE_PLUGINS, plugins-cli registry |
| `@elizaos/plugin-cron` | `2.0.0-alpha.3` (next) | Re-added to deps, CORE_PLUGINS, plugins-cli registry, FEATURE_PLUGINS |
| `@elizaos/plugin-local-embedding` | `2.0.0-alpha.3` (next) | Re-added to deps, CORE_PLUGINS |
| `@elizaos/plugin-trust` | `2.0.0-alpha.3` (next) | Re-added to deps, CORE_PLUGINS |
| `@elizaos/plugin-computeruse` | `2.0.0-alpha.4` (next) | Re-added to deps, CORE_PLUGINS |

---

## Re-enabled on 2026-02-07 (second batch)

6 additional plugins from the "still disabled" list have been resolved.

### Already working (no fix needed)

These 3 plugins were listed as disabled but were actually already enabled in
`CORE_PLUGINS` and import correctly at runtime:

| Plugin | Status | Notes |
|--------|--------|-------|
| `@elizaos/plugin-browser` | Working | `2.0.0-alpha.4` — `dist/index.js` present, imports OK |
| `@elizaos/plugin-code` | Working | `2.0.0-alpha.3` — `dist/index.js` present, imports OK |
| `@elizaos/plugin-vision` | Working | `2.0.0-alpha.3` — `dist/index.js` present, imports OK (tfjs falls back to cpu backend) |

### Fixed and re-published

These 3 plugins had genuine issues that were fixed, rebuilt, and published as
`2.0.0-alpha.5` (next):

| Plugin | Root Cause | Fix Applied |
|--------|-----------|-------------|
| `@elizaos/plugin-form` | Build used `runBuild` helper (unreachable `build-utils`) producing `dist/node/index.node.js` but `package.json` pointed to `dist/index.js` | Rewrote `build.ts` to use direct `Bun.build` → outputs `dist/index.js`; version bumped to `2.0.0-alpha.5` |
| `@elizaos/plugin-goals` | `requireProviderSpec("goals")` called with lowercase `"goals"` but spec defines `name: "GOALS"` — case-sensitive Map lookup fails | Changed to `requireProviderSpec("GOALS")` in `providers/goals.ts`; version bumped to `2.0.0-alpha.5` |
| `@elizaos/plugin-scheduling` | Build used `runBuild` with `outdir: "../dist"` writing JS to parent dir; only a `.d.ts` stub ended up in the published `dist/` | Rewrote `build.ts` to use direct `Bun.build` with `outdir: "dist"`; version bumped to `2.0.0-alpha.5` |

---

## Remaining overrides

### `@elizaos/plugin-cli` override (kept)

`@elizaos/plugin-cli` is a transitive dependency of `@elizaos/plugin-browser` and
`@elizaos/plugin-acp` (published with `"@elizaos/plugin-cli": "2.0.0-alpha.3"`).
The override ensures all transitive references resolve to the `next` tag:

```json
"@elizaos/plugin-cli": "next"
```

### `@elizaos/computeruse` override (resolved)

`@elizaos/computeruse` (the native napi-rs addon) is now published to npm on the `next`
dist-tag, aligned with the monorepo `2.0.0-alpha.x` versioning and managed by lerna.
On macOS ARM64, the native `@elizaos/computeruse-darwin-arm64` binary is installed
automatically. Other platforms fall back to MCP mode until their platform packages
are published via the `release-computeruse-npm` workflow in `eliza/.github/workflows/`.

```json
"@elizaos/computeruse": "next"
```

---

## Added on 2026-02-07

### `@elizaos/plugin-plugin-manager`

Added to `CORE_PLUGINS` and `package.json` dependencies. This plugin provides:
- Dynamic plugin discovery from the **next@registry** branch
- Runtime plugin installation (npm or git clone to `~/.milaidy/plugins/installed/`)
- Plugin search, load, unload, and clone actions
- Registry browsing via agent actions and API endpoints

New API endpoints:
- `GET  /api/registry/plugins`      — browse all plugins
- `GET  /api/registry/plugins/:name` — plugin details
- `GET  /api/registry/search?q=...`  — search
- `POST /api/registry/refresh`       — force registry cache refresh
- `POST /api/plugins/install`        — install from registry + restart
- `POST /api/plugins/uninstall`      — uninstall + restart
- `GET  /api/plugins/installed`      — list user-installed plugins

New CLI commands:
- `milaidy plugins list [-q <query>]` — browse / search
- `milaidy plugins search <query>`    — search
- `milaidy plugins info <name>`       — detailed info
- `milaidy plugins install <name>`    — install
- `milaidy plugins uninstall <name>`  — uninstall
- `milaidy plugins installed`         — list installed
- `milaidy plugins refresh`           — refresh cache

---

## Still disabled

**None.** All previously-disabled plugins have been resolved and re-enabled.
