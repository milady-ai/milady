# iOS Bun Platform Matrix

What works, what throws, what is forbidden, on the iOS Bun port.

| API / surface                          | iOS verdict                                     | Implementation site            |
|----------------------------------------|-------------------------------------------------|--------------------------------|
| `process.env`                          | Works (read-only env from host)                 | Bun built-in                   |
| `process.cwd()`                        | Returns app sandbox root                        | `stubs/ios-os.zig`             |
| `process.argv`                         | Returns `[bun_path, bundle_path]`               | `bun_embedded_run` entry       |
| `process.platform`                     | Returns `"ios"`                                 | Bun fork patch                 |
| `process.arch`                         | Returns `"arm64"` (device) or `"arm64"` (sim)   | Bun fork patch                 |
| `process.exit(code)`                   | Routes through `BunHostCallbacks.request_exit`  | `bun_embedded_run`             |
| `os.homedir()`                         | `~/Library/Application Support/Milady`          | `stubs/ios-os.zig`             |
| `os.tmpdir()`                          | `NSTemporaryDirectory()`                        | `stubs/ios-os.zig`             |
| `os.cpus()`                            | Works (sysctl)                                  | Bun built-in                   |
| `os.totalmem()` / `os.freemem()`       | Works (host_statistics64)                       | Bun built-in                   |
| `os.platform()`                        | Returns `"ios"`                                 | Bun fork patch                 |
| `fs.readFile/writeFile/promises.*`     | Works inside sandbox; throws `EACCES` outside   | Bun built-in (kqueue allowed)  |
| `fs.mkdir/readdir/stat`                | Works                                           | Bun built-in                   |
| `fs.watch`                             | Works (kqueue)                                  | Bun built-in                   |
| `fs.createReadStream/WriteStream`      | Works                                           | Bun built-in                   |
| `path.*`                               | Works (pure JS)                                 | Bun built-in                   |
| `url.*`, `URL`                         | Works                                           | Bun built-in                   |
| `crypto` (Node-style)                  | Works (BoringSSL)                               | Linked static                  |
| `crypto.randomUUID()`                  | Works                                           | Bun built-in                   |
| `crypto.subtle` (WebCrypto)            | Works                                           | Bun built-in                   |
| `net.createServer()`                   | Works (loopback ok; non-loopback needs `NSLocalNetworkUsageDescription`) | Bun built-in |
| `net.connect()`                        | Works                                           | Bun built-in                   |
| `http`, `https`                        | Works (built on `net` + BoringSSL)              | Bun built-in                   |
| `dns.lookup/resolve`                   | Works (c-ares)                                  | Linked static                  |
| `tls`                                  | Works (BoringSSL)                               | Linked static                  |
| `zlib`                                 | Works                                           | Bun built-in                   |
| `util.promisify/inspect/format`        | Works                                           | Bun built-in                   |
| `events.EventEmitter`                  | Works                                           | Bun built-in                   |
| `Buffer`                               | Works                                           | Bun built-in                   |
| `stream.*`                             | Works                                           | Bun built-in                   |
| `vm.runInNewContext/Script`            | Works (LLInt-slow; no JIT)                      | JSC                            |
| `WebAssembly.*`                        | Works (IPInt interpreter; no BBQ/OMG)           | JSC                            |
| `worker_threads.Worker`                | **Limited:** 1–2 max on iOS due to per-VM mem  | Bun built-in + cap             |
| `cluster.*`                            | **Throws** `ENOTSUP`                            | `stubs/ios-child-process.zig`  |
| `child_process.spawn/exec/fork`        | **Throws** `ENOTSUP`                            | `stubs/ios-child-process.zig`  |
| `child_process.execFileSync` etc.      | **Throws** `ENOTSUP`                            | `stubs/ios-child-process.zig`  |
| `Bun.serve()`                          | Works (HTTP loopback)                           | Bun built-in                   |
| `Bun.file(path)`                       | Works                                           | Bun built-in                   |
| `Bun.write(path, data)`                | Works                                           | Bun built-in                   |
| `Bun.spawn()` / `Bun.spawnSync()`      | **Throws** `ENOTSUP`                            | `stubs/ios-child-process.zig`  |
| `Bun.env`                              | Works                                           | Bun built-in                   |
| `Bun.gc()`                             | Works                                           | Bun built-in                   |
| `Bun.password.hash/verify`             | Works (Argon2id via BoringSSL or libsodium-static) | Bun built-in               |
| `Bun.sql`                              | Works (pglite via WASM IPInt; slow)             | PGlite WASM                    |
| `Bun.build` (runtime)                  | **Throws** `ENOTSUP` (build is a desktop tool)  | `stubs/ios-child-process.zig`  |
| `bun:ffi` — `dlopen(null/system path)` | Works                                           | Bun fork iOS patch             |
| `bun:ffi` — `dlopen("/arbitrary/path")`| **Throws** `UnsupportedOnIOS`                   | `stubs/ios-ffi-allowlist.zig`  |
| `bun:ffi` — `cc` (TinyCC)              | **Removed** at build time (not stubbed)         | `vendor-deps` excludes TinyCC  |
| `bun:ffi` — call statically linked sym | Works                                           | `stubs/ios-ffi-allowlist.zig`  |
| `bun:jsc` — internal                   | Works (no-JIT options pre-set)                  | Bun fork iOS patch             |

## Storage paths

| Logical              | iOS path                                                  | Notes                              |
|----------------------|-----------------------------------------------------------|------------------------------------|
| Agent state          | `Documents/.milady/state/`                                | Backed up to iCloud unless excluded |
| PGlite database      | `Documents/.milady/db.pglite`                             | DB file marked NOT-excluded from backup |
| Trajectories         | `Application Support/Milady/trajectories/`                | Excluded from backup                |
| Optimized prompts    | `Application Support/Milady/optimized-prompts/`           | Excluded from backup                |
| Models (bundled)     | `<.app>/agent/models/`                                    | Read-only, ships with app           |
| Models (downloaded)  | `Application Support/Milady/models/`                      | Excluded from backup                |
| Temp                 | `NSTemporaryDirectory()`                                  | OS may purge                        |
| Logs                 | `Library/Caches/Milady/logs/`                             | Purgeable                           |

## JIT and execution

| Code path                                            | JIT? |
|------------------------------------------------------|------|
| Bun (libbun.a)                                       | No   |
| JSC inside Bun                                       | No (LLInt only) |
| WebAssembly inside Bun                               | No (IPInt only) |
| WKWebView (React UI side)                            | **Yes** (Apple's WebKit JIT entitlement) |
| Communication: UI ↔ agent                            | Loopback HTTP + JSON, or postMessage via Capacitor plugin |

The agent doesn't need WebView JIT for its own work — but if you have a CPU-bound JS task that is provably user-impacting, you can run it in the WebView (which gets JIT) and call back into the agent via the loopback.
