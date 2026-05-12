// ElizaBunRuntime.swift
//
// iOS Swift host for the embedded Bun runtime. Calls into libbun.a via the
// bun_embedded_run() C ABI (see bun-embedded.h).
//
// Status: skeleton. Will not link until M04 lands. See
// ../milestones/M04-bun-embedded-c-abi.md.
//
// Usage from AppDelegate:
//
//   func application(_:didFinishLaunchingWithOptions:) -> Bool {
//       ElizaBunRuntime.shared.start()
//       return true
//   }
//
// The runtime runs on a background DispatchQueue; the main thread continues
// to host the WKWebView UI.

import Foundation
import os

private let log = OSLog(subsystem: "ai.eliza.milady", category: "bun-runtime")

public final class ElizaBunRuntime {
    public static let shared = ElizaBunRuntime()

    private let workQueue = DispatchQueue(
        label: "ai.eliza.bun.runtime",
        qos: .userInitiated
    )

    private var isRunning = false
    private let stateLock = NSLock()

    private init() {}

    public func start() {
        stateLock.lock()
        guard !isRunning else { stateLock.unlock(); return }
        isRunning = true
        stateLock.unlock()

        os_log("starting embedded bun runtime", log: log, type: .info)

        workQueue.async { [weak self] in
            guard let self = self else { return }
            self.runBlocking()
        }
    }

    public func stop(code: Int32 = 0) {
        stateLock.lock()
        defer { stateLock.unlock() }
        guard isRunning else { return }
        _ = bun_embedded_request_exit(code)
    }

    private func runBlocking() {
        guard let bundleURL = Bundle.main.url(
            forResource: "agent-bundle",
            withExtension: "js"
        ) else {
            os_log("agent-bundle.js not found in app bundle", log: log, type: .error)
            return
        }
        let bundlePath = bundleURL.path

        var callbacks = BunHostCallbacks(
            log: { level, msg, len in
                guard let msg = msg else { return }
                let buf = UnsafeBufferPointer(start: msg, count: len)
                let str = String(bytes: buf, encoding: .utf8) ?? ""
                let type: OSLogType
                switch level {
                case BUN_LOG_DEBUG: type = .debug
                case BUN_LOG_INFO:  type = .info
                case BUN_LOG_WARN:  type = .default
                case BUN_LOG_ERROR: type = .error
                default:            type = .info
                }
                os_log("[bun] %{public}@", log: log, type: type, str)
            },
            time_ns: {
                // mach_absolute_time -> ns. timebase is conventionally 1:1 on
                // arm64 iOS, but we should respect mach_timebase_info().
                var timebase = mach_timebase_info_data_t()
                mach_timebase_info(&timebase)
                let raw = mach_absolute_time()
                return raw * UInt64(timebase.numer) / UInt64(timebase.denom)
            },
            request_exit: { code in
                os_log("bun requested exit with code %d", log: log, type: .info, code)
                ElizaBunRuntime.shared.stateLock.lock()
                ElizaBunRuntime.shared.isRunning = false
                ElizaBunRuntime.shared.stateLock.unlock()
            },
            get_sandbox_path: { which in
                guard let which = which else { return nil }
                let key = String(cString: which)
                let fm = FileManager.default
                let path: String?
                switch key {
                case "home":
                    path = NSHomeDirectory()
                case "tmp":
                    path = NSTemporaryDirectory()
                case "documents":
                    path = (try? fm.url(
                        for: .documentDirectory,
                        in: .userDomainMask,
                        appropriateFor: nil,
                        create: true
                    ))?.path
                case "caches":
                    path = (try? fm.url(
                        for: .cachesDirectory,
                        in: .userDomainMask,
                        appropriateFor: nil,
                        create: true
                    ))?.path
                case "application_support":
                    path = (try? fm.url(
                        for: .applicationSupportDirectory,
                        in: .userDomainMask,
                        appropriateFor: nil,
                        create: true
                    ))?.path
                default:
                    return nil
                }
                guard let p = path else { return nil }
                // Caller copies before next call; safe to return strdup'd
                // pointer that the host owns. For simplicity here we leak;
                // production needs a cache.
                return strdup(p)
            }
        )

        // argv layout: ["bun", "<agent-bundle-path>"]
        let argv: [UnsafePointer<CChar>?] = [
            strdup("bun"),
            strdup(bundlePath),
            nil
        ]
        defer { argv.forEach { if let p = $0 { free(UnsafeMutablePointer(mutating: p)) } } }

        let rc = bun_embedded_run(
            Int32(2),
            argv,
            &callbacks
        )

        os_log("bun runtime exited with code %d", log: log, type: .info, rc)

        stateLock.lock()
        isRunning = false
        stateLock.unlock()
    }
}
