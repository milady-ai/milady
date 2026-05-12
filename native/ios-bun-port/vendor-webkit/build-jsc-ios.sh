#!/usr/bin/env bash
# build-jsc-ios.sh — cross-build JavaScriptCore as a static library for iOS,
# with all JIT tiers disabled.
#
# Status: SKELETON. M01 acceptance criteria require this to actually produce
# `libJavaScriptCore.a` for both slices, with no JIT symbols and no private
# API usage. Today this script will fail until WebKit is checked out at
# `WebKit/` and the patches under `patches/` are applied.
#
# Usage:
#   ./build-jsc-ios.sh aarch64-ios            # iPhone arm64 (device)
#   ./build-jsc-ios.sh aarch64-ios-simulator  # iPhone arm64 simulator (Apple Silicon)
#
# Acceptance gates (see milestones/M01-jsc-no-jit-builds.md):
#   - nm libJavaScriptCore.a | grep -E '_jit|_FTL' returns empty
#   - lipo -info matches the requested slice
#   - JSContext smoke test (1+1) succeeds on Simulator + device

set -euo pipefail

usage() {
  echo "usage: $0 <aarch64-ios|aarch64-ios-simulator>" >&2
  exit 2
}

if [[ $# -ne 1 ]]; then
  usage
fi

case "$1" in
  aarch64-ios)
    SDK="iphoneos"
    PLATFORM_FLAG="-miphoneos-version-min=15.0"
    SLICE="aarch64-ios"
    IOS_PLATFORM="OS"
    ;;
  aarch64-ios-simulator)
    SDK="iphonesimulator"
    PLATFORM_FLAG="-mios-simulator-version-min=15.0"
    SLICE="aarch64-ios-simulator"
    IOS_PLATFORM="SIMULATOR"
    ;;
  *)
    usage
    ;;
esac

ROOT="$(cd "$(dirname "$0")" && pwd)"
WEBKIT_DIR="${WEBKIT_DIR:-$ROOT/WebKit}"
DIST="$ROOT/dist/$SLICE"

if [[ ! -d "$WEBKIT_DIR" ]]; then
  echo "FATAL: WebKit source not found at $WEBKIT_DIR" >&2
  echo "" >&2
  echo "Check out WebKit (or our pinned fork) at $WEBKIT_DIR before running." >&2
  echo "Recommended: lift from NativeScript/webkit or mceSystems/node-jsc/deps/." >&2
  echo "See milestones/M01-jsc-no-jit-builds.md for the full recipe." >&2
  exit 1
fi

if [[ ! -f "$ROOT/WEBKIT_VERSION" ]]; then
  echo "FATAL: $ROOT/WEBKIT_VERSION pin not present." >&2
  exit 1
fi
WEBKIT_PIN="$(cat "$ROOT/WEBKIT_VERSION")"
echo "[jsc] Pinned WebKit: $WEBKIT_PIN"

# Apply iOS patches
if [[ -d "$ROOT/patches" ]]; then
  cd "$WEBKIT_DIR"
  shopt -s nullglob
  for p in "$ROOT"/patches/*.patch; do
    echo "[jsc] applying patch: $(basename "$p")"
    git apply --check "$p" >/dev/null 2>&1 && git apply "$p" || true
  done
  shopt -u nullglob
fi

mkdir -p "$DIST"

SDKROOT="$(xcrun --sdk "$SDK" --show-sdk-path)"
export SDKROOT
export CFLAGS="-arch arm64 $PLATFORM_FLAG -isysroot $SDKROOT -fno-stack-check"
export CXXFLAGS="$CFLAGS -stdlib=libc++"
export OBJCXXFLAGS="$CXXFLAGS"

cd "$WEBKIT_DIR"

# Use WebKit's CMake-based JSCOnly port. JSC-only avoids pulling in
# WebCore/WebKit2 which require even more iOS patching.
cmake -B "WebKitBuild-$SLICE" -S . \
  -G Ninja \
  -DCMAKE_TOOLCHAIN_FILE="$ROOT/../toolchain/ios.cmake" \
  -DIOS_PLATFORM="$IOS_PLATFORM" \
  -DPORT=JSCOnly \
  -DENABLE_JIT=OFF \
  -DENABLE_DFG_JIT=OFF \
  -DENABLE_FTL_JIT=OFF \
  -DENABLE_YARR_JIT=OFF \
  -DENABLE_WEBASSEMBLY_BBQJIT=OFF \
  -DENABLE_WEBASSEMBLY_OMGJIT=OFF \
  -DENABLE_C_LOOP=OFF \
  -DENABLE_STATIC_JSC=ON \
  -DBUILD_SHARED_LIBS=OFF \
  -DCMAKE_BUILD_TYPE=Release

cmake --build "WebKitBuild-$SLICE" --target JavaScriptCore -j

# Stage the artifact
JSC_LIB="$WEBKIT_DIR/WebKitBuild-$SLICE/lib/libJavaScriptCore.a"
if [[ ! -f "$JSC_LIB" ]]; then
  echo "FATAL: libJavaScriptCore.a not produced at $JSC_LIB" >&2
  exit 1
fi
cp "$JSC_LIB" "$DIST/"

# Stage the headers
mkdir -p "$DIST/include"
cp -r "$WEBKIT_DIR/Source/JavaScriptCore/API/"*.h "$DIST/include/" 2>/dev/null || true
cp -r "$WEBKIT_DIR/WebKitBuild-$SLICE/JavaScriptCore/PrivateHeaders" "$DIST/include/" 2>/dev/null || true

# Verify no JIT symbols
echo "[jsc] verifying no JIT symbols..."
if nm -gj "$DIST/libJavaScriptCore.a" | grep -E '_jit|_FTL|_BBQ|_OMG' >/dev/null; then
  echo "FAIL: JIT symbols present in built library" >&2
  nm -gj "$DIST/libJavaScriptCore.a" | grep -E '_jit|_FTL|_BBQ|_OMG' | head -10 >&2
  exit 1
fi
echo "[jsc] OK — no JIT symbols"

echo "[jsc] Build complete: $DIST/libJavaScriptCore.a"
echo "[jsc]   $(stat -f '%z' "$DIST/libJavaScriptCore.a") bytes"
