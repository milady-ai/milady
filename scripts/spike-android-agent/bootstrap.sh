#!/usr/bin/env bash
# scripts/spike-android-agent/bootstrap.sh — reproducible bring-up of a bun
# runtime on a connected Android device (real phone over adb, or a running
# cuttlefish image).
#
# What this proves:
#   - bun-linux-{x64,aarch64}-musl, dropped into a writable dir on the device
#     with the matching musl loader + libstdc++ + libgcc, runs on Android
#     bionic without modification (no glibc, no Termux, no shell environment).
#   - Bun.serve() binds to 127.0.0.1 and serves JSON.
#   - The whole runtime fits in ~100 MB of files (single-arch).
#
# What it does NOT do:
#   - Ship anything inside the Milady APK (this writes to /data/local/tmp/,
#     which is the adb-shell sandbox; an in-APK service uses a separate
#     mechanism — see docs/agent-on-mobile.md).
#   - Run the real @elizaos/agent bundle. The stub server.js exists to prove
#     the architecture; replacing it with the real agent requires solving
#     PGlite extension paths, plugin resolution, and connector sandboxing
#     (also documented in docs/agent-on-mobile.md).
#
# Usage:
#   bash scripts/spike-android-agent/bootstrap.sh                   # use $ADB
#   ADB=/path/to/adb bash scripts/spike-android-agent/bootstrap.sh
#   BUN_VERSION=1.3.13 bash scripts/spike-android-agent/bootstrap.sh
#
# After bootstrap completes, verify from another shell:
#   adb shell '(echo -e "GET /api/health HTTP/1.0\r\nHost: localhost\r\n\r"; sleep 1) | toybox nc 127.0.0.1 31337'

set -euo pipefail

ADB=${ADB:-${ANDROID_HOME:-$HOME/Android/Sdk}/platform-tools/adb}
BUN_VERSION=${BUN_VERSION:-1.3.13}
ALPINE_BRANCH=${ALPINE_BRANCH:-v3.21}
DEVICE_DIR=${DEVICE_DIR:-/data/local/tmp}
PORT=${PORT:-31337}

if ! command -v "$ADB" >/dev/null 2>&1; then
  echo "[spike] adb not found at $ADB" >&2
  exit 1
fi

if ! "$ADB" devices | tail -n +2 | grep -q "device$"; then
  echo "[spike] no device attached on adb" >&2
  exit 1
fi

abi=$("$ADB" shell getprop ro.product.cpu.abi | tr -d '\r')
case "$abi" in
  x86_64)         BUN_ARCH=x64; ALPINE_ARCH=x86_64; LD_NAME=ld-musl-x86_64.so.1 ;;
  arm64-v8a)      BUN_ARCH=aarch64; ALPINE_ARCH=aarch64; LD_NAME=ld-musl-aarch64.so.1 ;;
  *) echo "[spike] unsupported abi: $abi" >&2; exit 1 ;;
esac

stage=${STAGE_DIR:-/tmp/milady-android-spike}
mkdir -p "$stage"

# Bun binary (musl static-pie) — pinned by version for reproducibility.
if [ ! -x "$stage/bun" ]; then
  echo "[spike] downloading bun-${BUN_VERSION} for ${BUN_ARCH}-musl"
  curl -sL -o "$stage/bun.zip" "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-${BUN_ARCH}-musl.zip"
  (cd "$stage" && unzip -q -o bun.zip && mv "bun-linux-${BUN_ARCH}-musl/bun" bun && rm -rf "bun-linux-${BUN_ARCH}-musl" bun.zip)
  chmod +x "$stage/bun"
fi

# musl loader + libstdc++ + libgcc — bun is dynamically linked to all three.
fetch_apk() {
  local pkg=$1
  local out=$2
  if [ ! -f "$stage/$out" ]; then
    # Escape regex metacharacters in the package name (libstdc++ contains `+`).
    local escaped
    escaped=$(printf '%s' "$pkg" | sed -e 's/[.[\*^$()+?{|]/\\&/g')
    local url
    url=$(curl -s "https://dl-cdn.alpinelinux.org/alpine/${ALPINE_BRANCH}/main/${ALPINE_ARCH}/" \
      | grep -oE "${escaped}-[0-9][^\"<]*\\.apk" | head -1)
    [ -n "$url" ] || { echo "[spike] could not find ${pkg} apk in alpine ${ALPINE_BRANCH} ${ALPINE_ARCH}" >&2; exit 1; }
    curl -sL -o "$stage/$out" "https://dl-cdn.alpinelinux.org/alpine/${ALPINE_BRANCH}/main/${ALPINE_ARCH}/${url}"
  fi
}
fetch_apk musl musl.apk
fetch_apk libstdc++ libstdcxx.apk
fetch_apk libgcc libgcc.apk

mkdir -p "$stage/extract"
(cd "$stage/extract" && tar -xzf ../musl.apk 2>/dev/null && tar -xzf ../libstdcxx.apk 2>/dev/null && tar -xzf ../libgcc.apk 2>/dev/null)

# Push runtime + server to the device.
"$ADB" shell "mkdir -p $DEVICE_DIR"
"$ADB" push "$stage/bun" "$DEVICE_DIR/bun" >/dev/null
"$ADB" push "$stage/extract/lib/${LD_NAME}" "$DEVICE_DIR/${LD_NAME}" >/dev/null
"$ADB" push "$stage/extract/usr/lib/libstdc++.so.6.0.33" "$DEVICE_DIR/libstdc++.so.6.0.33" >/dev/null
"$ADB" push "$stage/extract/usr/lib/libgcc_s.so.1" "$DEVICE_DIR/libgcc_s.so.1" >/dev/null
"$ADB" shell "ln -sf libstdc++.so.6.0.33 ${DEVICE_DIR}/libstdc++.so.6"
"$ADB" shell "chmod +x ${DEVICE_DIR}/bun ${DEVICE_DIR}/${LD_NAME}"
"$ADB" push "$(dirname "$0")/server.js" "$DEVICE_DIR/server.js" >/dev/null

# Push the device-side daemoniser and run it. adb shell does not fully detach
# background processes (the shell session stays in adb's process group, so
# killing adb reaps the children even with setsid+nohup); launch-on-device.sh
# runs an explicit double-fork so bun survives.
"$ADB" push "$(dirname "$0")/launch-on-device.sh" "${DEVICE_DIR}/launch-on-device.sh" >/dev/null
"$ADB" shell "chmod +x ${DEVICE_DIR}/launch-on-device.sh"
"$ADB" shell "DEVICE_DIR=${DEVICE_DIR} LD_NAME=${LD_NAME} PORT=${PORT} ${DEVICE_DIR}/launch-on-device.sh"

sleep 2
echo
echo "[spike] server.log:"
"$ADB" shell "cat ${DEVICE_DIR}/server.log"
echo
echo "[spike] /api/health:"
"$ADB" shell "(echo -e 'GET /api/health HTTP/1.0\\r\\nHost: localhost\\r\\n\\r'; sleep 1) | toybox nc 127.0.0.1 ${PORT} 2>&1 | tail -3"
