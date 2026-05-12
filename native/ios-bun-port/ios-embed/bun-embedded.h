/*
 * bun-embedded.h — C ABI for the embedded Bun runtime on iOS.
 *
 * The iOS Swift host (ElizaBunRuntime.swift) calls bun_embedded_run() to
 * launch the Bun runtime inside the app process. Bun no longer owns the
 * process; the iOS app does.
 *
 * Status: ABI sketch only. Not yet implemented in the Bun fork.
 * See ../milestones/M04-bun-embedded-c-abi.md for acceptance criteria.
 */

#ifndef MILADY_BUN_EMBEDDED_H
#define MILADY_BUN_EMBEDDED_H

#include <stddef.h>
#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum BunLogLevel {
    BUN_LOG_DEBUG = 0,
    BUN_LOG_INFO  = 1,
    BUN_LOG_WARN  = 2,
    BUN_LOG_ERROR = 3,
} BunLogLevel;

typedef struct BunHostCallbacks {
    /* Bun emits log messages; host writes them to os_log / Console. */
    void (*log)(BunLogLevel level, const char *msg, size_t msg_len);

    /* Monotonic clock in nanoseconds (mach_absolute_time -> ns). */
    uint64_t (*time_ns)(void);

    /* Bun requests host to terminate the runtime. Host may ignore on iOS
     * since we cannot exit() the host process; called for cleanup signal. */
    void (*request_exit)(int code);

    /* Returns an app-sandbox path for a logical name.
     *   which ∈ {"home", "tmp", "documents", "caches", "application_support"}
     * Pointer must remain valid for the duration of the call.
     * Returns NULL on unknown name. */
    const char *(*get_sandbox_path)(const char *which);
} BunHostCallbacks;

/*
 * Run the embedded Bun runtime. Blocks the calling thread.
 *
 * @param argc       arg count; must be >= 2 (program name + bundle path)
 * @param argv       NULL-terminated argument vector
 * @param callbacks  host callbacks; must be non-NULL
 *
 * Threading: call from a background thread; Bun's event loop blocks the
 * caller.
 *
 * @return exit code (0 = clean)
 */
int bun_embedded_run(int argc, const char *const *argv,
                     const BunHostCallbacks *callbacks);

/* Request graceful exit from any thread. Returns true if accepted. */
bool bun_embedded_request_exit(int code);

/* Version string, e.g. "1.2.3+milady-ios". Valid for the process lifetime. */
const char *bun_embedded_version(void);

#ifdef __cplusplus
}
#endif

#endif /* MILADY_BUN_EMBEDDED_H */
