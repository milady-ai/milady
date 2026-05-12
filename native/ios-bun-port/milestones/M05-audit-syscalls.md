# M05 — Audit and stub forbidden syscalls

**Owner:** TBD
**Status:** Not started
**Predecessors:** M03, M04
**Successors:** M06

## Goal

Make `libbun.a` for iOS never reach a forbidden syscall. Audit every `posix_spawn`, `fork`, `execve`, `dlopen` of arbitrary paths, and TinyCC-`mmap`-PROT_EXEC site in the Bun fork; gate it on `BUN_IOS` and either remove or stub to `ENOTSUP`.

## The long pole. Plan for 3–4 weeks.

## Acceptance Criteria

- [ ] `tests/ios-policy-grep.sh` passes:
  ```bash
  # Should output ZERO matches in iOS-built object code
  grep -rE 'posix_spawn|vfork|^fork\(|execve|execv\(' src-bun-fork/src/ \
    | grep -v 'BUN_IOS' \
    | grep -v '// ENOTSUP-on-ios'
  ```
- [ ] `nm libbun.a | grep -E '_posix_spawn|_fork|_execve' ` returns empty on iOS builds.
- [ ] `nm libbun.a | grep -E '_tcc_' ` returns empty (TinyCC fully excluded).
- [ ] `bun:ffi` `dlopen`:
  - `dlopen(NULL, ...)` → works (in-binary symbols)
  - `dlopen("/usr/lib/system/libSystem.B.dylib", ...)` → works (system framework)
  - `dlopen("/anything/else", ...)` → throws `BunError: UnsupportedOnIOS: ...`
- [ ] `child_process` Node-shape module:
  - `import('node:child_process')` returns a module where every export throws helpful errors
  - The throw includes the iOS sandbox reason and a pointer to docs
- [ ] `Bun.spawn`, `Bun.spawnSync`, `Bun.$ shell template`, `Bun.which` (for executables) all throw consistent errors
- [ ] `worker_threads.Worker`: if it can create a second JSC VM without JIT, **keep it but cap at 2 workers**. If it can't (technical block discovered), stub.

## Audit sites (initial list, will grow)

Run this grep before starting:

```bash
cd src-bun-fork/src
grep -nE '(posix_spawn|vfork|fork\(|execve\(|execv\(|execvp\(|system\(|popen\()' \
  -r --include='*.zig' --include='*.cpp' --include='*.c' --include='*.h'
```

Expected sites (from initial reconnaissance):
- `bun.js/api/bun.zig` — `Bun.spawn`, `Bun.spawnSync`
- `bun.js/api/JSChildProcess.zig` — `child_process` module
- `bun.js/api/JSWorkerThread.zig` — worker threads (may stay)
- `bun_js/builtins/codegen/Bun_spawn.ts` — JS-side bindings
- `js_parser/js_parser.zig` — only references inside comments, ignore
- `cli/build_command.zig` — `bun build` invokes child processes for transpilation? Audit.
- `cli/install_command.zig` — `bun install` shells out to git, etc. **EXCLUDE bun install on iOS entirely.**
- `cli/run_command.zig` — `bun run <script>` shells out to the package manager script. Audit.
- `crash_handler.zig` — installs SIGSEGV/SIGABRT handlers; iOS will rewrite these.

## Stub patterns

### Pattern A: Module throws on import
```zig
// src/bun.js/api/JSChildProcess.zig
pub fn JSChildProcess_create(_: *JSC.JSGlobalObject) JSC.JSValue {
    if (comptime BUN_IOS) {
        return throwUnsupportedOnIOS("child_process is not available on iOS");
    }
    // ... existing implementation
}
```

### Pattern B: Single function throws
```zig
// src/bun.js/api/bun.zig
pub fn Bun_spawn(globalThis: *JSC.JSGlobalObject, _: *JSC.CallFrame) JSC.JSValue {
    if (comptime BUN_IOS) {
        return globalThis.throwError(error.UnsupportedOnIOS,
            "Bun.spawn is not available on iOS — iOS sandbox forbids subprocess creation"
        );
    }
    // ... existing implementation
}
```

### Pattern C: Build excludes entirely (TinyCC, bun install)
```cmake
if (NOT BUN_IOS)
  target_sources(bun PRIVATE
    ${CMAKE_SOURCE_DIR}/vendor/tinycc/libtcc.c
    # ... more TinyCC sources
  )
endif()
```

## `bun:ffi` allow-list

```zig
// stubs/ios-ffi-allowlist.zig (lives in our port, not in Bun fork)

const std = @import("std");

pub const AllowedSymbol = struct {
    symbol: []const u8,
    notes: ?[]const u8 = null,
};

pub const ALLOWED_SYMBOLS: []const AllowedSymbol = &.{
    // llama.cpp (static linked into libbun.a)
    .{ .symbol = "llama_backend_init" },
    .{ .symbol = "llama_load_model_from_file" },
    .{ .symbol = "llama_free_model" },
    .{ .symbol = "llama_new_context_with_model" },
    .{ .symbol = "llama_free" },
    .{ .symbol = "llama_n_ctx" },
    .{ .symbol = "llama_token_eos" },
    .{ .symbol = "llama_token_bos" },
    .{ .symbol = "llama_decode" },
    .{ .symbol = "llama_sample_token" },
    // ... full list TBD when M09 lands

    // libSystem.B.dylib (Apple-provided)
    .{ .symbol = "malloc", .notes = "libSystem.B.dylib" },
    .{ .symbol = "free", .notes = "libSystem.B.dylib" },
};

pub fn isAllowed(symbol: []const u8) bool {
    for (ALLOWED_SYMBOLS) |entry| {
        if (std.mem.eql(u8, entry.symbol, symbol)) return true;
    }
    return false;
}
```

Then in Bun's FFI module's `dlopen` path:
- `dlopen(NULL, RTLD_LAZY)` → returns a handle that only resolves allow-listed symbols.
- `dlopen("/some/path", ...)` → throws.

## CI hooks

`tests/ios-policy-grep.sh` runs on every PR. It:
1. Greps for forbidden syscalls.
2. Greps for `dlopen("/` patterns (string literal absolute paths).
3. Greps for `mmap(..., PROT_EXEC, ...)` patterns.
4. Fails the PR if any new instances appear without `BUN_IOS` gates.

## Effort estimate

- Nominal: 3 weeks
- With "discovered" extra sites: 4 weeks

## Notes

This is the milestone that determines whether the App Review will even let the build through. Don't skip the symbol scans.
