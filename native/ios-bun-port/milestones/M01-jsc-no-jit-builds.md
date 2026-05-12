# M01 — JSC no-JIT builds for iOS

**Owner:** TBD
**Status:** Not started
**Predecessors:** None (parallelizable with M02)
**Successors:** M03 (Bun fork needs JSC artifact to link against)

## Goal

Produce `libJavaScriptCore.a` for `aarch64-ios` and `aarch64-ios-simulator`, with JIT compiled out, no private iOS API usage, suitable for static linking into an iOS app.

## Acceptance Criteria

- [ ] `vendor-webkit/build-jsc-ios.sh aarch64-ios` produces `dist/aarch64-ios/libJavaScriptCore.a`.
- [ ] Same for `aarch64-ios-simulator`.
- [ ] Build flags include all of:
  - `ENABLE_JIT=0`
  - `ENABLE_DFG_JIT=0`
  - `ENABLE_FTL_JIT=0`
  - `ENABLE_YARR_JIT=0`
  - `ENABLE_WEBASSEMBLY_BBQJIT=0`
  - `ENABLE_WEBASSEMBLY_OMGJIT=0`
  - `ENABLE_C_LOOP=0` (we want LLInt-asm, not CLoop fallback)
  - `USE_SYSTEM_MALLOC=0` (bmalloc is fine; just be explicit)
- [ ] `nm libJavaScriptCore.a | grep -E '_jit|_FTL|_BBQ|_OMG'` returns **empty**.
- [ ] `otool -L` on the linked output shows only public iOS frameworks (`Foundation`, `CoreFoundation`, `libSystem.B.dylib`, `libobjc.A.dylib`).
- [ ] Static-link smoke test:
  ```bash
  vendor-webkit/test-jsc-static-link.sh
  ```
  Builds a tiny iOS Console app that links against the .a, creates a `JSContext`, runs `JSON.stringify({result: 1+1})`, prints the result. Must succeed on Simulator + device.
- [ ] WebKit fork version pinned at `vendor-webkit/WEBKIT_VERSION` (commit SHA).
- [ ] All patches in `vendor-webkit/patches/*.patch` applied cleanly to that revision.
- [ ] Build takes <30 min on M3 Pro / 32GB Mac with empty cache.

## Approach

Two viable starting points:

### Option A: Lift from `mceSystems/node-jsc`

`mceSystems/node-jsc/deps/jscshim/docs/webkit_fork_and_compilation.md` is the most thorough public guide to building JSC iOS as a static lib for app embedding. Last meaningful commit is 2019 so we'll need to:

1. Take their WebKit fork SHA, identify what's been patched.
2. Re-apply each patch against current upstream WebKit (`https://github.com/WebKit/WebKit`).
3. Drop their `jscshim` (the V8-API shim — we don't need V8 compat).
4. Drop their Node-specific patches.
5. Keep their iOS toolchain + no-JIT + no-private-API patches.

### Option B: Adapt NativeScript's WebKit fork

`NativeScript/webkit` is an active fork that builds JSC for iOS app embedding. They keep up with upstream WebKit better. Risk: their patches may be NativeScript-specific (V8 compat layer, telemetry hooks).

**Recommendation:** Start with B for the build recipe, cross-reference A for sandbox-safety patches.

### Build script structure

```bash
# vendor-webkit/build-jsc-ios.sh
#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:?usage: build-jsc-ios.sh <aarch64-ios|aarch64-ios-simulator>}"
WEBKIT_DIR="${WEBKIT_DIR:-./WebKit}"
DIST="$(pwd)/dist/${TARGET}"

case "${TARGET}" in
  aarch64-ios)
    SDK="iphoneos"
    PLATFORM_FLAGS="-arch arm64 -mios-version-min=15.0"
    ;;
  aarch64-ios-simulator)
    SDK="iphonesimulator"
    PLATFORM_FLAGS="-arch arm64 -mios-simulator-version-min=15.0"
    ;;
  *)
    echo "unknown target: ${TARGET}" >&2; exit 1 ;;
esac

SDKROOT="$(xcrun -sdk "${SDK}" --show-sdk-path)"
export SDKROOT
export CFLAGS="${PLATFORM_FLAGS} -isysroot ${SDKROOT}"
export CXXFLAGS="${CFLAGS}"

cd "${WEBKIT_DIR}"
Tools/Scripts/build-jsc \
  --no-jit \
  --no-dfg-jit \
  --no-ftl-jit \
  --no-yarr-jit \
  --no-webassembly-bbq-jit \
  --no-webassembly-omg-jit \
  --release \
  --static \
  --jsc-only \
  --release \
  CMAKE_TOOLCHAIN_FILE=../../toolchain/ios.cmake

mkdir -p "${DIST}"
cp WebKitBuild/Release/lib/libJavaScriptCore.a "${DIST}/"
cp -r WebKitBuild/Release/include "${DIST}/"

echo "✅ JSC built for ${TARGET}: ${DIST}/libJavaScriptCore.a"
```

Note: WebKit's `build-jsc` doesn't accept all those flags directly — some need to go through `CMakeArgs` env var. Treat the above as a sketch.

## Long-pole risk

WebKit private-API leakage. JSC pulls in symbols that are private API on iOS. Detection requires actual link runs against the iOS SDK. NativeScript hit this. Plan for 2–4 weeks of "fix this symbol, rebuild, repeat" beyond the nominal estimate.

## Effort estimate

- Nominal: 2 weeks
- With private-API patching: 3–4 weeks
- Total realistic: **3 weeks**

## References

- `mceSystems/node-jsc/deps/jscshim/docs/webkit_fork_and_compilation.md`
- `NativeScript/webkit` (https://github.com/NativeScript/webkit)
- `phoboslab/JavaScriptCore-iOS` (https://github.com/phoboslab/JavaScriptCore-iOS)
- WebKit JSCOnly port (https://trac.webkit.org/wiki/JSCOnly)
- Zon8 Research: "JSC LLInt internals" (https://zon8.re/posts/jsc-internals-part2-the-llint-and-baseline-jit/)
