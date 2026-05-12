# M04 — `bun_embedded_run()` C ABI

**Owner:** TBD
**Status:** Not started
**Predecessors:** M03
**Successors:** M05, M06

## Goal

Replace Bun's `main()` for iOS builds with a C ABI entry that the iOS Swift host (`ElizaBunRuntime.swift`) calls. Bun no longer owns the process; the iOS app does.

## C ABI

```c
// ios-embed/bun-embedded.h

#ifndef BUN_EMBEDDED_H
#define BUN_EMBEDDED_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    BUN_LOG_DEBUG = 0,
    BUN_LOG_INFO = 1,
    BUN_LOG_WARN = 2,
    BUN_LOG_ERROR = 3,
} BunLogLevel;

typedef struct BunHostCallbacks {
    /** Called by Bun for any structured log message. Host owns the buffer. */
    void (*log)(BunLogLevel level, const char *msg, size_t msg_len);

    /** Host's monotonic clock in nanoseconds. */
    uint64_t (*time_ns)(void);

    /** Async: host responds to Bun via bun_embedded_post_response. */
    void (*request_exit)(int code);

    /** App sandbox paths. Strings owned by host; returned pointers must outlive the call. */
    const char *(*get_sandbox_path)(const char *which); /* "home" | "tmp" | "documents" | "caches" */
} BunHostCallbacks;

/**
 * Run the embedded Bun runtime. Blocks the calling thread until exit.
 * Returns the exit code (0 = clean, non-zero = error).
 *
 * @param argc          arg count, must be >= 2
 * @param argv          [bun_program_name, agent_bundle_path, ...]
 * @param callbacks     non-null; host implements
 *
 * Threading: must be called from a non-main thread; Bun's event loop will block it.
 */
int bun_embedded_run(int argc, const char *const *argv, const BunHostCallbacks *callbacks);

/**
 * Request the embedded Bun runtime to exit gracefully. Thread-safe.
 * Returns true if the request was accepted.
 */
bool bun_embedded_request_exit(int code);

/**
 * Returns the version of the embedded Bun, e.g. "1.2.3+milady-ios".
 */
const char *bun_embedded_version(void);

#ifdef __cplusplus
}
#endif

#endif /* BUN_EMBEDDED_H */
```

## Acceptance Criteria

- [ ] `src-bun-fork/src/embedded.zig` exposes the above C ABI.
- [ ] `bun_embedded_run` initializes JSC global object, sets `JSC::Options::useJIT() = false`, registers host callbacks, then executes the agent bundle.
- [ ] `bun_embedded_request_exit` is thread-safe.
- [ ] `main()` for non-iOS builds is untouched.
- [ ] `bun_embedded_version()` returns a string with `+milady-ios` suffix so logs are unambiguous about which build is running.
- [ ] Host implements all callbacks; Bun never `printf`s directly or calls `exit(3)` — always routes through callbacks.
- [ ] iOS Swift host (`ios-embed/ElizaBunRuntime.swift`) implements the callbacks and successfully calls `bun_embedded_run` from a background thread.

## Non-goals

- We are not (yet) supporting multiple Bun VMs in one process. Single-runtime model only.
- We are not supporting hot-reload of the agent bundle. Process restart for now.
- `bun:repl` / interactive mode is not exposed via this ABI. iOS users don't get a REPL.

## Swift host sketch

```swift
// ios-embed/ElizaBunRuntime.swift

final class ElizaBunRuntime {
    static let shared = ElizaBunRuntime()
    private var workQueue = DispatchQueue(label: "ai.eliza.bun.runtime", qos: .userInitiated)

    private var hostCallbacks = BunHostCallbacks(
        log: { level, msg, len in
            let s = String(bytesNoCopy: UnsafeMutableRawPointer(mutating: msg!),
                           length: len, encoding: .utf8, freeWhenDone: false) ?? ""
            os_log("[bun:%{public}d] %{public}@", level.rawValue, s)
        },
        time_ns: { mach_absolute_time() /* TODO: convert to ns */ },
        request_exit: { code in
            // Bun is requesting shutdown.
            // For iOS we can't kill the host process, so just log + cleanup state.
            os_log("[bun] runtime exit requested with code %d", code)
        },
        get_sandbox_path: { which in
            switch String(cString: which!) {
            case "home":      return strdup(FileManager.default.homeDirectoryForCurrentUser.path)
            case "tmp":       return strdup(NSTemporaryDirectory())
            case "documents": return strdup(documentsURL().path)
            case "caches":    return strdup(cachesURL().path)
            default:          return nil
            }
        }
    )

    func start() {
        workQueue.async {
            let bundle = Bundle.main.url(forResource: "agent-bundle", withExtension: "js")!.path
            let argv: [String?] = ["bun", bundle, nil]
            let cArgv = argv.map { $0.flatMap { strdup($0) } }
            defer { cArgv.forEach { if let p = $0 { free(p) } } }

            let rc = bun_embedded_run(
                Int32(cArgv.count - 1),
                cArgv as [UnsafePointer<CChar>?],
                &self.hostCallbacks
            )

            os_log("[bun] runtime exited with code %d", rc)
        }
    }

    func stop(code: Int32 = 0) {
        _ = bun_embedded_request_exit(code)
    }
}
```

## Effort estimate

- Nominal: 1 week
- With host callback debugging: 2 weeks
