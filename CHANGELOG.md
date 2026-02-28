# Changelog

All notable changes to Milady are documented here. Format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Electron startup resilience:** The desktop app now keeps the API server running when the agent runtime fails to load (e.g. missing native module like `onnxruntime_binding.node`). **Why:** Without this, a single load failure would throw, the outer catch would tear down the API server, and the renderer would get no port and show only "Failed to fetch" with no error message. Keeping the server up and setting `state: "error"` with port preserved lets the UI connect and show "Agent unavailable: …" with the actual error. See `docs/electron-startup.md` and WHY comments in `apps/app/electron/src/native/agent.ts` — do not remove the try/catch and `.catch()` guards as "excess" exception handling.
- **Regression tests for startup resilience:** `apps/app/test/electron-ui/electron-startup-failure.e2e.spec.ts` now has two tests: (1) failed runtime keeps API server alive and recovery on retry, (2) failed `eliza.js` load (e.g. missing native binding) preserves port and no server teardown. **Why:** A failing test is strictly stronger than documentation for preventing regressions; if someone removes the guards, CI fails.

### Changed

- **CI / Mac binary build:** Plugin and dependency copy for the Electron bundle is now **derived automatically** from each copied `@elizaos` package's `package.json` dependencies (see `scripts/copy-electron-plugins-and-deps.mjs`). **Why:** A curated list was a maintenance burden and caused silent failures when new plugin runtime deps were added. Walking the dependency graph ensures we copy everything plugins need; we skip known dev/renderer-only packages (e.g. typescript, lucide-react) to avoid bloat. macOS x64 builds run root and Electron installs under `arch -x86_64` so native modules get x64 binaries on Intel Macs. Whisper universal binary is built in release; electron test jobs no longer use `continue-on-error` on every step; Bun install cache and `verify-build.sh` arch detection added.

### Fixed

- **Intel Mac desktop app:** Packaged DMG could fail with "Cannot find module .../darwin/x64/onnxruntime_binding.node" because CI runs on arm64 runners and was shipping arm64 native binaries. **Why:** Native Node addons (e.g. onnxruntime-node) are built for the install host's arch; installing and building under `arch -x86_64` (Rosetta) produces x64 `.node` files so the Intel DMG works.
- **Electron agent startup:** If `eliza.js` failed to load (e.g. due to the above), the whole startup threw and the outer catch closed the API server. **Why:** We now isolate failures (`.catch()` on eliza import, try/catch around `startEliza()`), keep the API server up, and set `state: "error"` with port preserved so the renderer can display the error instead of "Failed to fetch".

---

## [2.0.0-alpha.71] and earlier

See [Releases](https://github.com/milady-ai/milady/releases) for version history.
