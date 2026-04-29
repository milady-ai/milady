# Local agent on Android — spike record + roadmap

The Milady mobile UI today (`MobileRuntimeMode = "remote-mac" | "cloud" | "cloud-hybrid"`) only
talks to remote agents — the desktop Eliza Cloud, a Mac running the runtime locally, or a
self-hosted gateway. The goal of this work is to add a fourth mode, **`local`**, where the full
`@elizaos/agent` runtime executes inside the phone itself with the WebView talking to it over
loopback HTTP, mirroring how Electrobun runs the agent on desktop.

This document records the spike that proved core viability, the artifacts kept in-repo so anyone
can reproduce it on a connected device, and the concrete blockers that remain before a real APK
ships with a working local agent.

## TL;DR

- **Bun runs on Android bionic.** A static `bun-linux-x64-musl` binary, paired with the matching
  `ld-musl-x86_64.so.1` loader and `libstdc++.so.6` / `libgcc_s.so.1` from Alpine, executes
  unmodified on the cuttlefish image and serves HTTP on `127.0.0.1:31337`. Same pattern works for
  arm64-v8a using the `bun-linux-aarch64-musl` + `ld-musl-aarch64.so.1` triple.
- **The agent boots far enough to hit plugin loading and PGlite init.** `bun build src/bin.ts` of
  `@elizaos/agent` produces a 43 MB bundle. With CJS stubs for native deps (`node-llama-cpp`,
  `sharp`, `onnxruntime-node`, `puppeteer-core`, `pty-manager`, `canvas`, `@huggingface/transformers`)
  it runs to the point of "Resolving 10 plugins... PGlite data dir created". It then dies on
  PGlite extension paths and on the 7-of-10 plugins the bundle did not include — both solvable.
- **Reproducible recipe** lives in `scripts/spike-android-agent/`. Pointed at any `adb`-attached
  device or a running cuttlefish, `bash scripts/spike-android-agent/bootstrap.sh` downloads the
  binaries, pushes them to `/data/local/tmp/`, and starts a stub HTTP server that responds to
  `GET /api/health` with `{"ok":true,"agent":"milady-spike","bun":"1.3.13",...}`.

## What the spike actually exercised

```
adb device → /data/local/tmp/
              bun                    (96 MB, x86_64-musl)
              ld-musl-x86_64.so.1    (663 KB)
              libstdc++.so.6.0.33    (2.7 MB)
              libgcc_s.so.1          (174 KB)
              server.js              (proven HTTP responder)
              launch-on-device.sh    (double-fork daemoniser)
```

Invocation:

```
LD_LIBRARY_PATH=/data/local/tmp PORT=31337 \
  /data/local/tmp/ld-musl-x86_64.so.1 \
  /data/local/tmp/bun \
  /data/local/tmp/server.js
```

Verified on a `milady_cf_x86_64_phone-trunk_staging-userdebug` cuttlefish. `/proc/net/tcp` shows
the listener on `0100007F:7A69` (`127.0.0.1:31337`). `nc 127.0.0.1 31337` from the device returns
valid JSON.

## Why this isn't done yet

A working APK that ships the bundled agent and serves chat through it requires four more pieces.

### 1. Asset shipping

Bun + the three musl shared objects must land in the APK. They cannot live under `lib/{abi}/`
because Android extracts those without the executable bit (and renames them `libfoo.so`). The
practical path is `apps/app/android/app/src/main/assets/agent/{bun,ld-musl-*.so.1,libstdc++*,
libgcc_s*,server.js}` plus a copy step at first launch that drops them into the app's writable
data dir (`/data/data/com.miladyai.milady/files/agent/`) and chmods them.

This adds ~100 MB to the APK per architecture. With both `x86_64` (cuttlefish) and `arm64-v8a`
(real phones) shipped, the APK grows ~200 MB. Acceptable for the on-device trade-off, possibly
worth a Play-Store-style ABI split if size matters.

### 2. `MiladyAgentService.java`

A new foreground service in `eliza/packages/app-core/platforms/android/app/src/main/java/...`
that:

1. On first launch, copies `assets/agent/` → app data dir, sets executable bits.
2. `Runtime.exec()`s `ld-musl <bun> <agent-bundle.js> serve` with
   `MILADY_STATE_DIR=/data/data/com.miladyai.milady/files/.milady`,
   `MILADY_API_PORT=31337`, `LD_LIBRARY_PATH=...`.
3. Forwards stdout/stderr to logcat for diagnostics.
4. Holds a foreground notification (`FOREGROUND_SERVICE_SPECIAL_USE`) so Android won't kill it.
5. `MiladyBootReceiver` already runs at `BOOT_COMPLETED`; have it `startForegroundService()`
   on the new service alongside the existing `GatewayConnectionService`.

This is parallel in shape to `GatewayConnectionService`, which today only holds a notification
for an externally-managed WebSocket. Differences: this one owns a child process and has to keep
it alive across pause/resume.

### 3. SELinux policy

Apps in the default `priv_app` / `system_app` domain on AOSP can `execve()` binaries from their
own data dir, but the shared-object dependencies (musl loader, libstdc++) are an unusual access
pattern that can trip avc denials. The current `os/android/vendor/milady/sepolicy/` is a
permissive-only stub. Production needs:

- A `milady_agent` type for the executables under `/data/data/com.miladyai.milady/files/agent/`.
- `allow milady_agent self:tcp_socket bind` for loopback listening.
- `allow milady_agent priv_app_data_file:file r_file_perms` for reading the bundle.
- `neverallow` rules ensuring the binary cannot escape the loopback/data-dir sandbox.

Validate by running `adb shell dmesg | grep avc` after `cvd reset` and tightening until clean.

### 4. Agent payload

The bundling spike showed the agent loads but dies on:

- **PGlite extension resolution.** `@electric-sql/pglite` resolves `vector.tar.gz`,
  `fuzzystrmatch.tar.gz`, and `pglite.data` via `import.meta.url` of its own bundled module —
  after `bun build`, that URL is the agent bundle's path, not the package's, and the `../`
  relative paths land in `/data/local/`. Fix: ship those files alongside the bundle and either
  patch PGlite's resolution or symlink `/data/local/{vector,fuzzystrmatch}.tar.gz` →
  `/data/data/.../files/agent/`.
- **Plugin resolution.** The 10 core plugins (`@elizaos/plugin-shell`, `@elizaos/plugin-cron`,
  `@elizaos/plugin-app-control`, `@elizaos/plugin-commands`, etc.) are looked up by package name
  at runtime, not bundled. They need to ship as a flattened `node_modules/@elizaos/plugin-*` tree
  next to the bundle, or the runtime needs a mobile-aware loader that imports plugins from a
  manifest.
- **`child_process.spawn` from inside the agent.** The agent shells out in ~20 places
  (signal-pairing QR, sandbox-engine, stream-manager, n8n sidecar, self-updater, desktop-control,
  /usr/bin/open, osascript, lsof). On Android, none of these exist. They need either platform
  guards (`if (process.platform === "android") return null`) at every site, or — better — a
  `MILADY_PLATFORM=android` env var the runtime checks centrally to short-circuit them. The
  existing `ELIZA_DISABLE_LOCAL_EMBEDDINGS=1` knob is the precedent.
- **No AI provider on-device.** Local LLM via `node-llama-cpp` is desktop-only; on mobile we
  already have `llama-cpp-capacitor` (JNI-bound llama.cpp) ready to host a local model. Wiring
  the agent to use it instead of `node-llama-cpp` is its own task. For first-light, the agent
  can run with `ANTHROPIC_API_KEY` from the user's onboarding and route inference through the
  cloud — the local agent then owns state, tool use, scheduling, and connector logic, which is
  most of what "local agent" buys us. Pure-on-device inference is a follow-on.

### 5. UI wiring

```ts
// eliza/packages/app-core/src/onboarding/mobile-runtime-mode.ts
type MobileRuntimeMode = "remote-mac" | "cloud" | "cloud-hybrid" | "local";
```

`RuntimeGate.tsx`'s `shouldShowLocalOption()` becomes:

```ts
function shouldShowLocalOption(isDesktop: boolean, isDev: boolean, isAndroid: boolean) {
  if (isDesktop || isDev) return true;
  if (!isAndroid) return false;
  return await probeLocalAgent("http://127.0.0.1:31337/api/health");
}
```

`finishAsLocal()` on Android sets `apiBase = http://127.0.0.1:31337`, persists
`MOBILE_RUNTIME_MODE_STORAGE_KEY = "local"`, and the chat path then talks to the on-device
agent the same way it talks to a remote one — same protocol, no UI changes.

## Reproducing the spike

```
# With a connected device or running cuttlefish:
bash scripts/spike-android-agent/bootstrap.sh

# Verify from another shell:
adb shell '(echo -e "GET /api/health HTTP/1.0\r\nHost: localhost\r\n\r"; sleep 1) | toybox nc 127.0.0.1 31337'
# {"ok":true,"agent":"milady-spike","bun":"1.3.13","uptime":...}
```

`bootstrap.sh` is idempotent (cached downloads in `/tmp/milady-android-spike/`) and
ABI-aware (reads `ro.product.cpu.abi` and picks `x86_64` or `aarch64` artifacts).

## Open questions for follow-up sessions

- Should the agent ship as a single `bun build --compile` binary (smaller, fewer files, but
  forfeits per-plugin `import` resolution), or as `bun + bundle + node_modules` (larger, but
  every plugin path works as on desktop)?
- Is `ANTHROPIC_API_KEY` over the user's WAN acceptable for first-light, or do we need
  `llama-cpp-capacitor`-based inference before "local agent" tile is shown to users?
- How does the local agent reconcile with Eliza Cloud sync — does picking "local" disable cloud
  sync entirely, or do we keep a one-way push to cloud for cross-device continuity?

These are product calls, not architecture ones.
