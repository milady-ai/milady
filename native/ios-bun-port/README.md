# native/ios-bun-port

Bun, ported to iOS, statically linked into the Milady app.

This is the home of the iOS-Bun-port project. See `eliza/docs/audits/mobile-2026-05-11/IOS_BUN_PORT.md` for the full plan, sequencing, and risk register. See `eliza/docs/audits/mobile-2026-05-11/REPORT.md` for the audit that led to this work.

**Status:** Foundation phase (M00). Scaffolding, milestone docs, and stubs only — no working build yet.

## Layout

| Subdir            | Purpose                                                            |
|-------------------|--------------------------------------------------------------------|
| `toolchain/`      | CMake toolchain files for `aarch64-ios` and `aarch64-ios-simulator`; Zig build target additions |
| `vendor-webkit/`  | WebKit/JSC fork pin + patches + cross-build script for no-JIT JSC iOS static lib |
| `vendor-deps/`    | Cross-build scripts for BoringSSL, c-ares, lolhtml, mimalloc, zstd |
| `src-bun-fork/`   | Git submodule → our fork of `oven-sh/bun` (not yet checked out)    |
| `stubs/`          | iOS-specific runtime stubs (`child_process` → ENOTSUP, FFI allow-list, `os.homedir` → sandbox) |
| `ios-embed/`      | Swift host code that calls `bun_embedded_run()` from `AppDelegate` |
| `build-scripts/`  | End-to-end build orchestration                                     |
| `tests/`          | Smoke tests + policy-grep CI hooks                                 |
| `milestones/`     | M01–M12 acceptance-criteria docs                                   |

## Quick links

- Plan: `eliza/docs/audits/mobile-2026-05-11/IOS_BUN_PORT.md`
- Audit: `eliza/docs/audits/mobile-2026-05-11/REPORT.md`
- Bun upstream: https://github.com/oven-sh/bun
- WebKit / JSC: https://github.com/WebKit/WebKit
- Prior art: `mceSystems/node-jsc` (dormant), `NativeScript/webkit` (active)

## What "done" looks like

End-to-end: iPhone Simulator on an Apple Silicon Mac runs `bun run ios:simulator`, app boots in <30s, user types "hello" in the chat UI, on-device Eliza-1 0.6B Q4_K_M generates a response.

Until then this directory is scaffolding + plans. Don't expect a working build during M00.

## Contributing

Each milestone has an acceptance-criteria doc under `milestones/`. Work proceeds gated by those criteria — don't claim a milestone "done" until the doc's checklist is green.

When in doubt about scope, the rule is: the same agent runtime that ships on desktop and Android-AOSP ships here. We are not building an iOS-specific agent; we are porting the runtime to iOS.
