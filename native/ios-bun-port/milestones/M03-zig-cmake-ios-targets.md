# M03 — Zig + CMake iOS targets in Bun fork

**Owner:** TBD
**Status:** Not started
**Predecessors:** M01 (JSC), M02 (deps)
**Successors:** M04

## Goal

Make `oven-sh/bun` (our fork) build for `aarch64-ios` and `aarch64-ios-simulator`. At end of this milestone, `bun --version` cross-compiles to an iOS object (it does not yet run — that's M06).

## Acceptance Criteria

- [ ] `src-bun-fork/build.zig` has `aarch64-ios` and `aarch64-ios-simulator` targets explicitly listed and tested.
- [ ] `src-bun-fork/CMakeLists.txt` splits `if (APPLE)` into `if (APPLE_MACOS)` and `if (APPLE_IOS)` everywhere.
- [ ] New top-level CMake var `BUN_IOS` triggers:
  - JSC sourced from `../vendor-webkit/dist/<target>/libJavaScriptCore.a` instead of upstream Bun's prebuilt WebKit download
  - All deps sourced from `../vendor-deps/dist/<target>/`
  - TinyCC excluded
  - `posix_spawn` paths gated (M05 work, but the flag exists here)
- [ ] `BUN_TARGET=aarch64-ios build-scripts/build-bun-ios.sh` runs from scratch, downloads/uses cached deps, produces a `bun-ios.o` or partial-link object (no main yet).
- [ ] CI runs a "cross-compile passes" check on PRs that touch `src-bun-fork/cmake/` or `build.zig`.

## Approach

### Zig target additions

`build.zig` currently constructs `target = b.standardTargetOptions(.{})`. Bun's `build.zig` adds custom logic per-target. For iOS we need:

```zig
const ios_target = b.resolveTargetQuery(.{
    .cpu_arch = .aarch64,
    .os_tag = .ios,
    .abi = .none,
});

const ios_sim_target = b.resolveTargetQuery(.{
    .cpu_arch = .aarch64,
    .os_tag = .ios,
    .abi = .simulator,
});
```

Then route the rest of the build (sources, includes, linker flags) through whichever target was selected. Zig's iOS support has known sharp edges (#22836 — aarch64-ios-simulator sometimes produces device-flagged output) — verify with `lipo -info`.

### CMake split

Today Bun's CMake has many `if (APPLE)` branches that assume macOS:
- `posix_spawn` linkage
- Mach-specific calls (`host_statistics64`, `mach_absolute_time`)
- `dyld` / `_dyld_register_func_for_add_image` for symbol enumeration
- `clock_gettime_nsec_np`
- `unifiedwait` (kqueue userland)

Each needs a per-platform branch:

```cmake
if (APPLE)
  if (BUN_IOS)
    # iOS-specific: stubbed where forbidden, native where allowed
    target_compile_definitions(bun PRIVATE BUN_IOS=1)
    target_link_libraries(bun PRIVATE
      ${VENDOR_WEBKIT}/libJavaScriptCore.a
      "-framework Foundation"
      "-framework CoreFoundation"
    )
  else()
    # macOS desktop
    target_link_libraries(bun PRIVATE
      ${UPSTREAM_WEBKIT}/lib/libJavaScriptCore.a
    )
  endif()
endif()
```

### Bun source touchpoints

Every file that does `@cImport({ @cInclude("spawn.h") })` or `@cImport({ @cInclude("sys/wait.h") })` needs a `BUN_IOS` branch. List from initial grep:

- `src/bun.js/api/bun.zig` (Bun.spawn, Bun.spawnSync)
- `src/bun.js/api/JSChildProcess.zig`
- `src/bun.js/process.zig` (process.binding('spawn_sync'))
- `src/bun.js/api/JSWorkerThread.zig`
- `src/output.zig` (signal handling for `--bun-debug-mute`)
- `src/cli.zig` (signal install on startup)
- `src/main.zig` (process entry, atexit)

Estimated touched files: ~40–60.

## Effort estimate

- Nominal: 2 weeks
- With "discovered" platform-isms: 3 weeks

## Notes

This milestone is where the fork divergence from upstream becomes structural. Upstream `oven-sh/bun` will not accept our patches without iOS being an officially supported target. Plan to maintain the fork indefinitely. Rebase cadence: weekly during active development, monthly after we ship.
