# Changelog

All notable changes to Milady are documented here. Format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Electron startup resilience:** The desktop app now keeps the API server running when the agent runtime fails to load (e.g. missing native module like `onnxruntime_binding.node`). The UI can still connect and show an error state instead of "Failed to fetch". See `docs/electron-startup.md` and code comments in `apps/app/electron/src/native/agent.ts` (WHY the try/catch and `.catch()` guards exist — do not remove as "excess" exception handling).

### Changed

- **CI / Mac binary build:** Plugin and dependency copy for the Electron bundle is derived from `package.json` via `scripts/copy-electron-plugins-and-deps.mjs` instead of a hardcoded list. macOS x64 builds run root and Electron installs under `arch -x86_64` so native modules (e.g. onnxruntime-node) get x64 binaries on Intel Macs. Whisper universal binary is built in release; electron test jobs no longer use `continue-on-error` on every step; Bun install cache and `verify-build.sh` arch detection added.

### Fixed

- **Intel Mac desktop app:** Packaged DMG could fail with "Cannot find module .../darwin/x64/onnxruntime_binding.node" because CI built on arm64 and shipped arm64 native binaries. Release workflow now runs install and Electron build under Rosetta for the macos-x64 artifact so the correct x64 `.node` files are included.
- **Electron agent startup:** If `eliza.js` failed to load (e.g. due to the above), the whole startup threw and the outer catch closed the API server, leaving the window with "Failed to fetch" and no error message. Startup now isolates failures (`.catch()` on eliza import, try/catch around `startEliza()`), keeps the API server up, and sets `state: "error"` with port preserved so the renderer can display the error.

---

## [2.0.0-alpha.71] and earlier

See [Releases](https://github.com/milady-ai/milady/releases) for version history.
