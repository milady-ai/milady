# Milady roadmap

High-level direction and rationale. Not exhaustive; see [CHANGELOG](../CHANGELOG.md) for shipped changes.

## Done (this cycle)

- **Electron startup resilience** — Keep API server up when runtime fails to load so the UI can show an error instead of "Failed to fetch". **Why:** A single missing native module (e.g. onnxruntime on Intel Mac) used to make the whole window dead with no explanation.
- **Intel Mac x64 DMG** — Release workflow runs install and Electron build under `arch -x86_64` for the macos-x64 artifact so native `.node` binaries are x64. **Why:** CI runs on arm64; without Rosetta we shipped arm64 binaries and Intel users got "Cannot find module .../darwin/x64/...".
- **Auto-derived plugin deps** — `copy-electron-plugins-and-deps.mjs` walks each @elizaos package's `package.json` dependencies instead of a curated list. **Why:** Curated lists missed new plugin deps and caused silent failures in packaged app; auto-walk stays correct as plugins change.
- **Regression tests for startup** — E2E tests assert keep-server-alive and eliza.js load-failure behavior. **Why:** A failing test prevents removal of the exception-handling guards better than docs alone.

## Short-term / follow-ups

- **Upstream plugin hygiene** — Some plugins (e.g. `@elizaos/plugin-discord`) list `typescript` in `dependencies` instead of `devDependencies`; we skip it via `DEP_SKIP` to avoid bundle bloat. **Why:** Fixing upstream would reduce our skip list and keep plugin package.json correct.
- **Optional: filter bundled deps** — We intentionally copy all transitive deps (including ones tsdown may have inlined) because plugins can dynamic-require at runtime. **Why:** Excluding "likely bundled" deps would risk "Cannot find module" in packaged app. If we ever get static analysis of plugin dist/ to know what is never required at runtime, we could shrink the copy; not a priority.

## Longer-term

- **Desktop:** Universal/fat macOS binary (single .app with arm64+x64) is possible via `lipo` or electron-builder targets but adds build time and complexity; separate DMGs are acceptable for now.
- **CI:** Consider caching Electron/Node native rebuilds per arch to speed up release matrix.
