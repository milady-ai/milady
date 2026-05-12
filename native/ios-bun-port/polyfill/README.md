# @milady/ios-jsc-polyfill

Bun + Node.js API polyfill that runs inside iOS `JSContext` and routes
runtime calls through a host-function bridge (`globalThis.__MILADY_BRIDGE__`).

The polyfill is bundled to a single self-executing IIFE
(`dist/polyfill-prefix.js`) that the iOS app prepends to the agent bundle at
build time. After the prefix evaluates, the agent code can use the standard
Bun and Node surfaces (`Bun.serve`, `node:fs`, `crypto.createHash`, etc.) as
if it were running on the real runtime.

## Architecture

```
agent code  ── import "node:fs" ──┐
                                  │
                                  ▼
              ┌──── @milady/ios-jsc-polyfill ────┐
              │  Bun.*  process.*  Buffer        │
              │  node:fs/path/os/crypto/http ... │
              └────────────┬─────────────────────┘
                           │ host functions
                           ▼
                  globalThis.__MILADY_BRIDGE__
                           │
                           ▼
                  Swift host (JavaScriptCore)
                  CryptoKit, FileManager, URLSession,
                  llama.cpp (Metal), os_log, ...
```

The bridge contract lives at
`../BRIDGE_CONTRACT.md`. The polyfill checks
`__MILADY_BRIDGE_VERSION__` at install time and refuses to start on mismatch.

## What's covered

### `globalThis.Bun`
- `Bun.serve({ port, fetch })` — loopback HTTP server backed by the Swift
  HTTP server worker. Returns `{ stop, reload, port, hostname, url }`.
- `Bun.file(path)` — `.text()`, `.json()`, `.arrayBuffer()`, `.bytes()`,
  `.exists()`, `.size`, `.stream()`, `.writer()`.
- `Bun.write(path, data)` — string, Uint8Array, ArrayBuffer, Blob, or Bun.file.
- `Bun.env` — proxy over `env_get` / `env_set` / `env_keys`.
- `Bun.argv`, `Bun.version`, `Bun.main`.
- `Bun.sleep`, `Bun.nanoseconds`, `Bun.hash` (FNV-1a 32-bit).
- `Bun.deepEquals`, `Bun.inspect`.
- `Bun.readableStreamTo{Text,ArrayBuffer,JSON,Blob}`.
- `Bun.spawn` / `Bun.spawnSync` — throw with a clear "not on iOS" message.

### Node built-ins (`node:*` and bare `fs`, etc.)
- **`node:fs`** — sync (`readFileSync`, `writeFileSync`, `mkdirSync`,
  `readdirSync`, `statSync`, `rmSync`, `renameSync`, `copyFileSync`,
  `appendFileSync`), async callback variants, and the full
  `fs.promises` / `node:fs/promises` surface. Minimal `createReadStream` /
  `createWriteStream` (buffered, not chunked).
- **`node:path`** — full POSIX implementation (`resolve`, `normalize`,
  `join`, `relative`, `dirname`, `basename`, `extname`, `parse`, `format`).
- **`node:os`** — `homedir()` → app support, `tmpdir()` → NSTemporaryDirectory,
  `cpus()` / `totalmem()` / `freemem()` derived from
  `bridge.llama_hardware_info()`.
- **`node:crypto`** — `createHash`, `createHmac`, `randomBytes`,
  `randomUUID`, `pbkdf2`, `createCipheriv` / `createDecipheriv` for
  AES-128-GCM and AES-256-GCM, `timingSafeEqual`, a WebCrypto `subtle`
  subset (`digest`, `importKey`, `sign`, `verify`, `encrypt`, `decrypt`).
  `scrypt` approximated via pbkdf2 (NOT cryptographically equivalent — only
  for caches). Asymmetric primitives throw.
- **`node:http` / `node:https`** — `request()` / `get()` backed by
  `bridge.http_fetch`; `createServer()` backed by `http_serve_*`. TLS is
  handled inside URLSession so `node:https` reuses the same code path.
- **`node:net`** — TCP not in bridge v1; `connect()` / `createServer()`
  throw. `isIP` / `isIPv4` / `isIPv6` work.
- **`node:events`** — full `EventEmitter` (10-listener default, `once`,
  `prependListener`, `eventNames`, etc.) plus top-level `once(emitter, evt)`.
- **`node:stream`** — `Readable`, `Writable`, `Duplex`, `Transform`,
  `PassThrough`, `pipeline`, `finished`. Async iteration on Readable works.
- **`node:buffer`** — `Buffer.from`, `Buffer.alloc`, `Buffer.allocUnsafe`,
  `Buffer.concat`, `Buffer.byteLength`, plus `.toString(encoding)`,
  `.write()`, `.equals()`, `.compare()`, `.copy()`, `.indexOf()`,
  `.includes()`, and all `read*` / `write*` numeric variants. Encodings:
  utf8, ascii, hex, base64, base64url, binary/latin1, ucs2/utf16le.
  `instanceof Buffer` works via `Symbol.hasInstance`.
- **`node:util`** — `promisify`, `callbackify`, `format`, `inspect`,
  `types.*`, `inherits`, `deprecate`, `TextEncoder` / `TextDecoder`.
- **`node:url`** — global `URL` / `URLSearchParams`, plus `fileURLToPath`,
  `pathToFileURL`, legacy `parse` / `format` / `resolve`.
- **`node:querystring`** — `parse`, `stringify`, `escape`, `unescape`.
- **`node:assert`** — `ok`, `equal`, `strictEqual`, `deepEqual`, `throws`,
  `rejects`.
- **`node:process`** — `env` proxy, `argv`, `argv0`, `cwd`, `chdir`,
  `platform = "ios"`, `arch = "arm64"`, `nextTick`, `hrtime`,
  `exit`, `stdout` / `stderr` that pipe to `bridge.log`.
- **`node:perf_hooks`** — minimal `performance.now()`.
- **`node:timers` / `node:timers/promises`** — wrappers over
  `setTimeout` / `setInterval`.

### Global standard library
- `console.{log,info,warn,error,debug}` routed through `bridge.log` so
  output reaches `os_log`.
- `fetch`, `Headers`, `Request`, `Response` — installed unconditionally
  over `bridge.http_fetch`.
- `Buffer`, `process`, `EventEmitter` exposed on `globalThis`.
- `setImmediate`, `clearImmediate`, `queueMicrotask` if missing.

### `loadLlama` (for `@elizaos/plugin-ios-bun-bridge`)
- `loadLlama({ modelPath, contextSize?, useGpu?, threads? })` →
  `{ contextId, generate({ prompt, ... }), cancel(), free() }`.
- `llamaHardwareInfo()` — reshapes `bridge.llama_hardware_info()`.
- `createAppCoreEngine(modelPath, opts)` returns an `AppCoreEngine` that
  matches the `LocalInferenceLoader` shape `@elizaos/app-core` expects.

## What is NOT covered

- `worker_threads.Worker` — single-threaded agent in v1.
- `child_process.spawn` / `Bun.spawn` — sandbox forbids it. Helpful throw.
- `bun:ffi.dlopen` of arbitrary paths — only the llama bridge.
- `fs.watch` / `fs.watchFile` — no fsevents bridge in v1.
- `net.connect` / `net.createServer` — no TCP-client primitives in v1.
- Asymmetric crypto (`createSign`, RSA/EC keypair gen).
- Streaming HTTP bodies — both client and server buffer.

## Threading model

The polyfill runs on the agent's dedicated worker thread
(`DispatchQueue ai.eliza.bun.runtime`). All bridge calls happen on that
thread. HTTP-server request handlers are marshalled back onto it via
JSContext invoke semantics. Don't share state between handler invocations
without consideration for re-entrance.

## Error semantics

The bridge returns `null` / `false` and surfaces a thread-local error string
via `fs_last_error()` rather than throwing across the JSC boundary. The
polyfill consults that string and constructs proper JS `Error` instances.
Async bridge calls return `{ error: string }` instead of throwing; the
polyfill converts that into a thrown `Error` on the JS side.

## Build

```bash
bun run build      # produces dist/polyfill-prefix.js
bun run typecheck  # strict TS check
```

The bundle is intentionally not minified — the iOS bundler will minify the
combined agent + polyfill bundle once at the end.
