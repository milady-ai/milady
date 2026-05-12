# M06 — Simulator hello-world

**Owner:** TBD
**Status:** Not started
**Predecessors:** M01, M02, M03, M04, M05
**Successors:** M07, M08

## Goal

A toy iOS app, running in the iPhone Simulator on an Apple Silicon Mac, embeds `libbun.a`, loads a tiny `hello.js` resource, runs `console.log("hello from bun on iOS")`, and prints output to the Xcode console.

This is the first proof-of-life. From here on, every milestone is incremental.

## Acceptance Criteria

- [ ] `build-scripts/build-bun-ios.sh aarch64-ios-simulator` produces `libbun.a` for the simulator slice.
- [ ] `ios-embed/HelloApp/HelloApp.xcodeproj` is a minimal iOS app that:
  - Links `libbun.a` + `libJavaScriptCore.a` + all M02 deps
  - Loads `hello.js` from `Bundle.main`
  - Calls `bun_embedded_run("bun", "hello.js")` from `AppDelegate.didFinishLaunching`
- [ ] `hello.js` contains:
  ```js
  console.log("hello from bun on iOS, ts=", Date.now());
  console.log("process.platform =", process.platform);
  console.log("process.arch =", process.arch);
  console.log("os.cpus().length =", require("node:os").cpus().length);
  console.log("fs.existsSync(__dirname) =", require("node:fs").existsSync(__dirname));
  process.exit(0);
  ```
- [ ] Xcode console shows all five lines, with `process.platform === "ios"` and `process.arch === "arm64"`.
- [ ] App launches in <2 seconds on iPhone 15 Pro Simulator (M3 host).
- [ ] No crashes, no `EXC_BAD_ACCESS`, no signal handler conflicts.
- [ ] `lipo -info libbun.a` shows the simulator slice flag.

## Diagnostic playbook

If `bun_embedded_run` doesn't return cleanly:

1. **`EXC_BAD_ACCESS` immediately after entry.** Likely JSC global init pulls in a static initializer that depends on a private API. Check `nm` output again; look for `_kMach...` or `_dyld_register_...` symbols.

2. **`SIGABRT` from atexit handler.** Bun's `process.on('exit')` glue isn't gated for embedded mode. Add `BUN_IOS` gates in `src/main.zig`.

3. **`console.log` doesn't appear.** The `console.log` implementation in Bun routes through `stdout` which on iOS is `/dev/null` by default. Implement `console.log` via `BunHostCallbacks.log` for embedded mode.

4. **`Date.now()` returns 0.** Bun's clock init may need `mach_timebase_info` for iOS. Check `src/output.zig` clock helpers.

5. **`require("node:os").cpus()` throws.** Bun's `os.cpus()` uses `sysctlbyname("hw.ncpu")` on Darwin — should work on iOS. If it doesn't, host_processor_info path.

## Effort estimate

- Nominal: 1 week
- With debugging surprises: 2 weeks

## Notes

Once this milestone is green, the iOS port is plausibly real. Until then it's all theoretical. Don't let M06 slip — if it slips past 3 weeks total elapsed from M03 completion, pause and reassess whether the JSC artifact from M01 is actually iOS-safe.
