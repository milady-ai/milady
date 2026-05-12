# `__MILADY_BRIDGE__` — Cross-Agent Bridge Contract

This is the canonical contract. The Swift JSContext host implements it. The JS polyfill consumes it. The agent code never sees it directly — it uses normal `node:fs` / `Bun.serve` / etc., and the polyfill routes those through `globalThis.__MILADY_BRIDGE__`.

**Versioning:** start at `v1`. Breaking changes bump the version. The Swift host injects `globalThis.__MILADY_BRIDGE_VERSION__ = "v1"`; the polyfill checks at load time.

## Shape

```ts
interface MiladyBridge {
  readonly version: "v1";

  // ─── Filesystem ───────────────────────────────────────────────
  // All paths are absolute strings. Relative paths are caller's job.
  // Returns null on error (file not found, no permission, etc.).
  // Errors do NOT throw — they're surfaced via null + the last_error() probe
  // because cross-boundary exception unwinding through JSC is unreliable.

  fs_read_text(path: string, encoding?: "utf8" | "ascii"): string | null;
  fs_read_bytes(path: string): Uint8Array | null;
  fs_write_text(path: string, data: string): boolean;
  fs_write_bytes(path: string, data: Uint8Array): boolean;
  fs_append_text(path: string, data: string): boolean;
  fs_exists(path: string): boolean;
  fs_mkdir(path: string, recursive: boolean): boolean;
  fs_readdir(path: string): string[] | null;
  fs_stat(path: string): {
    size: number;
    mtime_ms: number;
    is_directory: boolean;
    is_file: boolean;
  } | null;
  fs_remove(path: string, recursive?: boolean): boolean;
  fs_rename(from: string, to: string): boolean;
  fs_copy(from: string, to: string): boolean;
  fs_last_error(): string | null;

  // ─── Sandbox paths ────────────────────────────────────────────
  // All return absolute paths. Strings stable for process lifetime.
  paths_app_support(): string;   // ~/Library/Application Support/Milady
  paths_documents(): string;     // ~/Documents
  paths_caches(): string;        // ~/Library/Caches
  paths_tmp(): string;           // NSTemporaryDirectory()
  paths_bundle(): string;        // app .app bundle root (read-only)
  paths_bundle_resource(name: string, ext: string): string | null;

  // ─── Crypto ───────────────────────────────────────────────────
  // Wraps CryptoKit + CommonCrypto.
  crypto_random_bytes(len: number): Uint8Array;
  crypto_random_uuid(): string;
  crypto_hash(
    algo: "sha256" | "sha512" | "sha1" | "md5",
    data: Uint8Array,
  ): Uint8Array;
  crypto_hmac(
    algo: "sha256" | "sha512" | "sha1",
    key: Uint8Array,
    data: Uint8Array,
  ): Uint8Array;
  crypto_pbkdf2(
    password: Uint8Array,
    salt: Uint8Array,
    iterations: number,
    key_length: number,
    digest: "sha256" | "sha512" | "sha1",
  ): Uint8Array;
  crypto_aes_gcm_encrypt(
    key: Uint8Array, // 16 or 32 bytes
    nonce: Uint8Array, // 12 bytes
    plaintext: Uint8Array,
    aad?: Uint8Array,
  ): { ciphertext: Uint8Array; tag: Uint8Array } | null;
  crypto_aes_gcm_decrypt(
    key: Uint8Array,
    nonce: Uint8Array,
    ciphertext: Uint8Array,
    tag: Uint8Array,
    aad?: Uint8Array,
  ): Uint8Array | null;

  // ─── HTTP client ──────────────────────────────────────────────
  // Backed by URLSession. Async; resolves to a result object.
  http_fetch(opts: {
    url: string;
    method: string; // "GET" | "POST" | ...
    headers?: Record<string, string>;
    body?: Uint8Array;
    timeout_ms?: number;
  }): Promise<{
    status: number;
    headers: Record<string, string>;
    body: Uint8Array;
    error?: string;
  }>;

  // ─── HTTP server (Bun.serve) ──────────────────────────────────
  // Loopback-only on iOS. Bind to 127.0.0.1.
  // Handler is invoked synchronously from the Swift HTTP server's worker
  // thread back into JSContext via dispatch. The handler returns a response
  // object; if it returns a Promise, the server awaits it.
  http_serve_start(opts: {
    port: number;
    handler_token: string; // string ID; JS registers the handler via http_serve_register_handler
  }): { ok: boolean; port: number; error?: string };
  http_serve_register_handler(
    token: string,
    handler: (req: {
      method: string;
      url: string;
      headers: Record<string, string>;
      body: Uint8Array;
    }) => Promise<{
      status: number;
      headers?: Record<string, string>;
      body?: Uint8Array | string;
    }>,
  ): void;
  http_serve_stop(token: string): void;

  // ─── SQLite (PGlite replacement) ──────────────────────────────
  // CRITICAL: WebAssembly is disabled/unreliable in JSContext on iOS 16.4+.
  // PGlite (a WASM PostgreSQL fork) does not work. We provide a native
  // SQLite bridge via libsqlite3.tbd (system framework on every iOS device).
  //
  // The agent's plugin-sql is patched to use this bridge through a
  // PGlite-shaped wrapper exposed by the polyfill at
  // `polyfill/src/modules/pglite-shim.ts`. From the agent's point of view
  // it imports `@electric-sql/pglite` and gets a working SQLite-backed
  // adapter.
  //
  // For pgvector compatibility we link sqlite-vec (small, MIT) into the
  // host binary; queries against vector tables route through the same
  // bridge.

  sqlite_open(opts: {
    path: string;       // absolute path; ":memory:" for in-memory
    readonly?: boolean;
    timeout_ms?: number;
  }): { db_id: number } | { error: string };

  sqlite_close(db_id: number): boolean;

  sqlite_exec(db_id: number, sql: string): {
    rows_affected: number;
  } | { error: string };

  sqlite_query(
    db_id: number,
    sql: string,
    params?: Array<string | number | boolean | null | Uint8Array>,
  ): {
    columns: string[];
    rows: Array<Array<string | number | null | Uint8Array>>;
  } | { error: string };

  sqlite_prepare(db_id: number, sql: string): { stmt_id: number } | { error: string };
  sqlite_step(
    stmt_id: number,
    params?: Array<string | number | boolean | null | Uint8Array>,
  ): {
    done: boolean;
    row?: Array<string | number | null | Uint8Array>;
  } | { error: string };
  sqlite_finalize(stmt_id: number): boolean;

  sqlite_version(): { sqlite: string; sqlite_vec?: string };

  // ─── Llama inference ──────────────────────────────────────────
  // Backed by static-linked llama.cpp arm64-ios.
  // Promises because model load + generation are long-running.
  llama_load_model(opts: {
    path: string; // absolute path to GGUF in sandbox
    context_size?: number; // default 4096
    use_gpu?: boolean; // default true (Metal)
    threads?: number; // default min(4, ncpu)
  }): Promise<{ context_id: number } | { error: string }>;

  llama_generate(opts: {
    context_id: number;
    prompt: string;
    max_tokens?: number; // default 256
    temperature?: number; // default 0.7
    top_p?: number; // default 0.95
    stop?: string[];
    stream_callback_token?: string; // if set, on_token() fires per token
  }): Promise<{
    text: string;
    prompt_tokens: number;
    output_tokens: number;
    duration_ms: number;
  } | { error: string }>;

  llama_register_stream_callback(
    token: string,
    on_token: (token: string, is_last: boolean) => void,
  ): void;
  llama_cancel(context_id: number): void;
  llama_free(context_id: number): void;
  llama_hardware_info(): {
    backend: "metal" | "cpu";
    total_ram_gb: number;
    available_ram_gb: number;
    cpu_cores: number;
    is_simulator: boolean;
    metal_supported: boolean;
  };

  // ─── Logging ──────────────────────────────────────────────────
  log(level: "debug" | "info" | "warn" | "error", message: string): void;

  // ─── Process / env ────────────────────────────────────────────
  now_ns(): number; // monotonic, nanoseconds
  argv(): string[]; // ["bun", "agent-bundle-ios.js", ...]
  env_get(key: string): string | undefined;
  env_set(key: string, value: string): void;
  env_keys(): string[];
  exit(code: number): void;

  // ─── React UI bridge (Capacitor plugin side) ──────────────────
  // The plugin exposes a JS-side dispatcher. Use this to send events to
  // the WebView UI.
  ui_post_message(channel: string, payload: unknown): void;
  ui_register_handler(
    method: string,
    handler: (args: unknown) => Promise<unknown>,
  ): void;
}

declare global {
  // eslint-disable-next-line no-var
  var __MILADY_BRIDGE__: MiladyBridge | undefined;
  // eslint-disable-next-line no-var
  var __MILADY_BRIDGE_VERSION__: string | undefined;
}
```

## Threading rules

- The bridge is called from the agent JS, which runs on a dedicated worker thread (`DispatchQueue` `ai.eliza.bun.runtime`).
- All host functions execute on that thread unless they are Promise-returning, in which case they may dispatch work to other queues.
- HTTP-server handlers fire on the server's worker thread; the polyfill marshals them onto the agent thread via JSContext's invoke semantics. Don't call back into the bridge from a different thread than the one JSContext is bound to.
- The React UI runs in its own WKWebView process; communication is only through `ui_post_message` / `ui_register_handler`, which round-trip through the Capacitor plugin's standard call mechanism.

## Error semantics

- Sync calls return `null` / `false` on error. Use `fs_last_error()` (and equivalents) to fetch a thread-local error string.
- Async calls return `{ error: string }` instead of throwing.
- Logging errors via `bridge.log("error", ...)` is encouraged at the call site.

## Lifecycle

1. Swift host creates `JSContext`.
2. Swift host installs `__MILADY_BRIDGE__` and `__MILADY_BRIDGE_VERSION__` globals.
3. Swift host evaluates the polyfill prefix (which sets up `Bun`, `node:*`, etc.).
4. Swift host evaluates `agent-bundle-ios.js`.
5. Agent calls `startEliza()` (default exported function).
6. Agent registers UI handlers via `bridge.ui_register_handler`.
7. React UI calls the Capacitor plugin's `call(method, args)`, which dispatches to the registered handler.
8. Bridge stays alive for the life of the app process.

## Memory ownership

- All `Uint8Array` arguments are owned by the JS side; the Swift host copies them on call.
- All `Uint8Array` return values are owned by the JS side after return; Swift allocates fresh.
- Strings: same — copy at the boundary.
- This is slower than zero-copy but avoids JSC lifetime traps.

## What's NOT in v1

- `worker_threads.Worker` — implementation parked. Single-threaded agent for now.
- `child_process.spawn` — never. Sandboxed out.
- `bun:ffi.dlopen` of arbitrary paths — never. The Llama bridge is the only "FFI"; new FFI sites require adding to this contract.
- WebSocket server (only client via `http_fetch`). Add in v2 if needed.
- Streaming HTTP request bodies (we buffer). Add in v2 if it bites.

## Test surface

A reference test bundle at `native/ios-bun-port/tests/bridge-conformance.js` exercises every host function. Both the Swift host and a Node.js-side mock (for polyfill development) implement the same contract; the conformance bundle passes against both.
