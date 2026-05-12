# iOS Bun Port — Current Status

Last updated: 2026-05-11
Phase: **M00 — Foundation** (scaffolding + plan; no working build yet)

## CRITICAL FINDING (research validated, blocks unmodified PGlite path)

**WebAssembly is disabled or unreliable in `JSContext` on iOS 16.4+.** Confirmed via:
- `oven-sh/bun#7232` (closed "not planned" — WebKit upstream dropped Wasm from JSC in macOS Sonoma, same in iOS)
- WebKit bug `191064` (iOS simulator does not support WebAssembly)
- `react-native-wasm` (archived Nov 2023, recommends WebView fallback)

Consequence: PGlite (which is WASM-PG) **cannot be the on-device database** in the JSContext architecture. WebKit-the-browser still has Wasm (BrowserEngineKit JIT carve-out), but our `JSContext` host does not get that.

**Mitigation (already wired into the contract):** native SQLite bridge in `BRIDGE_CONTRACT.md`. iOS ships `libsqlite3.tbd` system-wide. The polyfill exposes a PGlite-shaped wrapper at `polyfill/src/modules/pglite-shim.ts` so `@electric-sql/pglite` imports in the agent resolve to a working SQLite backend. Add `sqlite-vec` (MIT, ~150 KB static) for pgvector compatibility.

This swap is invisible to the rest of the agent code — same import path (`@electric-sql/pglite`), same SQL surface (Postgres-flavored). Anything using extensions like `vector` or `fuzzystrmatch` needs explicit re-implementation against sqlite-vec.

## What's done (this session)

- Audit doc: `eliza/docs/audits/mobile-2026-05-11/REPORT.md` — full mobile gap report, App Store entitlement matrix, three-tier distribution plan.
- Port plan doc: `eliza/docs/audits/mobile-2026-05-11/IOS_BUN_PORT.md` — 12 milestones with acceptance criteria, risk register, total estimate (4–12 months).
- Directory scaffold under `native/ios-bun-port/` — toolchain, vendor-webkit, vendor-deps, stubs, ios-embed, build-scripts, tests, milestones.
- Per-milestone acceptance docs under `native/ios-bun-port/milestones/M01-M12.md`.
- CMake toolchain files for `aarch64-ios` + `aarch64-ios-simulator` at `toolchain/`.
- iOS-specific runtime stubs added to `eliza/packages/agent/scripts/mobile-stubs/`:
  - `ios-child-process.cjs` — throws `ENOTSUP` for spawn/fork/exec
  - `ios-bun-spawn.cjs` — throws for `Bun.spawn`/`Bun.spawnSync`
  - `ios-os.cjs` — routes `os.homedir`/`os.tmpdir` through env vars set by Swift host
  - `ios-ffi.cjs` — gates `bun:ffi.dlopen` to `null` + system framework paths only; `cc()` throws
- `build-mobile-bundle.mjs` extended with `--target=ios` flag. Smoke-verified the stubs work.
- C ABI header `ios-embed/bun-embedded.h` defining `bun_embedded_run()` contract.
- Swift host skeleton `ios-embed/ElizaBunRuntime.swift` that would call `bun_embedded_run()` once `libbun.a` exists.
- Build scripts: `build-all-deps.sh` orchestrator, `verify-no-jit.sh` post-build verifier.
- `vendor-webkit/build-jsc-ios.sh` — JSC no-JIT cross-build script (requires WebKit checkout, not yet present).
- Version pin files (`WEBKIT_VERSION`, `vendor-deps/VERSIONS`) with placeholders pending M01/M02.
- Updated MEMORY.md and saved a feedback memory recording the architectural choice.

## What's NOT done

Everything else.

- M01 — WebKit/JSC iOS no-JIT static lib not built.
- M02 — Native deps not cross-built.
- M03 — Bun fork not branched or iOS-targeted.
- M04 — `bun_embedded_run()` C ABI implementation missing.
- M05 — Bun fork syscall audit not started.
- M06 — Simulator hello-world not built.
- M07 — Device hello-world not built.
- M08 — Agent bundle iOS variant not exercised end-to-end.
- M09 — `libllama.a` not cross-built for iOS.
- M10 — End-to-end iOS simulator chat not working.
- M11 — Device perf/battery not characterized.
- M12 — App Store submission not made.

## Next concrete step (M01 start)

1. Pick a WebKit fork to lift from (recommend `NativeScript/webkit`).
2. Check it out at `native/ios-bun-port/vendor-webkit/WebKit`.
3. Populate `vendor-webkit/WEBKIT_VERSION` with the SHA.
4. Run `vendor-webkit/build-jsc-ios.sh aarch64-ios-simulator` and iterate until it produces a clean `libJavaScriptCore.a`.
5. Smoke-test with a JSContext "1+1" sample app on Simulator.
6. Mark M01 complete in `milestones/M01-jsc-no-jit-builds.md`.

## Open questions

- **Bun upstream direction.** Anthropic's Zig→Rust rewrite of Bun is in flight. Do we track the Zig branch (current) or wait for Rust to land? Recommendation: track Zig until Rust ships and stabilizes, then make a fork decision.
- **WebKit fork choice.** NativeScript's fork is most active; node-jsc's is most thoroughly documented for app embedding but is dormant. Pick one or do a hybrid (NativeScript revision + node-jsc patches).
- **`bun:ffi` allow-list policy.** Whitelist all `llama_*` symbols up front, or generate the allow-list from llama.cpp's header? Recommendation: header-derived, regenerated per llama.cpp version bump.
- **Eliza-1 model bundling for App Store.** A 0.6B Q4_K_M model is ~400 MB. Below the 200 MB cellular install limit means ODR or download-on-first-launch. For dev/Xcode-install builds, bundle directly. Decision pending.

## Hand-off contract

The next engineer working on this should:

1. Read `eliza/docs/audits/mobile-2026-05-11/IOS_BUN_PORT.md` start to finish.
2. Read this `STATUS.md`.
3. Start at M01.
4. Update this `STATUS.md` at every milestone boundary.
5. Don't claim a milestone "done" without all acceptance criteria green.
6. When in doubt, follow `eliza/AGENTS.md` — same engineering standards.
