#!/usr/bin/env bash
# ------------------------------------------------------------------------------
# Milady — Android Emulator first-run smoke test (LOCAL DEV ONLY)
#
# This script is NOT wired into CI. It exists for engineers to verify the
# Capacitor Android build boots to the BootstrapStep on a local Android
# emulator and to capture a screenshot for QA evidence.
#
# Covers row M2 of docs/QA-first-run.md (mobile walkthrough).
#
# Requirements (script gracefully degrades and exits 0 if any are missing):
#   - Android SDK platform-tools (adb)
#   - Android SDK emulator binary (emulator)
#   - At least one configured AVD
#   - Gradle wrapper at apps/app/android/gradlew
#   - bun (for the web build step)
#   - Capacitor CLI available via the workspace (npx cap ...)
#
# Usage:
#   bash scripts/qa/android-emu-smoke.sh [--avd Pixel_7_API_34]
#
# Exit codes:
#   0  — smoke passed OR prerequisites missing (skip).
#   >0 — real failure (build error, install error, launch error).
# ------------------------------------------------------------------------------
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="$REPO_ROOT/apps/app"
PKG_ID="ai.milady.milady"
AVD=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --avd)
      AVD="$2"
      shift 2
      ;;
    -h|--help)
      sed -n '2,25p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *)
      echo "FAIL: unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

log() { printf '[android-emu-smoke] %s\n' "$*"; }
skip() { echo "SKIPPED: $*"; exit 0; }
fail() { echo "FAIL: $*" >&2; exit 1; }

# Try to locate adb/emulator. Use PATH first, fall back to ANDROID_HOME.
ADB_BIN="$(command -v adb 2>/dev/null || true)"
EMU_BIN="$(command -v emulator 2>/dev/null || true)"

if [[ -z "$ADB_BIN" && -n "${ANDROID_HOME:-}" && -x "$ANDROID_HOME/platform-tools/adb" ]]; then
  ADB_BIN="$ANDROID_HOME/platform-tools/adb"
fi
if [[ -z "$EMU_BIN" && -n "${ANDROID_HOME:-}" && -x "$ANDROID_HOME/emulator/emulator" ]]; then
  EMU_BIN="$ANDROID_HOME/emulator/emulator"
fi

if [[ -z "$ADB_BIN" ]]; then
  skip "adb not installed (set ANDROID_HOME or install Android platform-tools)"
fi
if [[ -z "$EMU_BIN" ]]; then
  skip "emulator binary not installed (install Android SDK emulator)"
fi
if ! command -v bun >/dev/null 2>&1; then
  skip "bun not installed (cannot produce web bundle)"
fi
if ! command -v npx >/dev/null 2>&1; then
  skip "npx not installed (cannot run capacitor CLI)"
fi
if [[ ! -d "$APP_DIR/android" ]]; then
  skip "Capacitor Android platform not initialized at $APP_DIR/android (run bun run --cwd apps/app cap:sync:android first)"
fi
if [[ ! -x "$APP_DIR/android/gradlew" ]]; then
  skip "gradlew not executable at $APP_DIR/android/gradlew"
fi

# Pick an AVD if none specified. Prefer one that looks like a Pixel.
if [[ -z "$AVD" ]]; then
  AVAILABLE_AVDS="$("$EMU_BIN" -list-avds 2>/dev/null || true)"
  if [[ -z "$AVAILABLE_AVDS" ]]; then
    skip "no Android AVD configured (create one via Android Studio > Device Manager)"
  fi
  AVD="$(echo "$AVAILABLE_AVDS" | grep -i '^Pixel_' | head -n 1 || true)"
  if [[ -z "$AVD" ]]; then
    AVD="$(echo "$AVAILABLE_AVDS" | head -n 1)"
  fi
  log "Auto-selected AVD: $AVD"
fi

log "Building web bundle (bun run --cwd $APP_DIR build:android)"
if ! (cd "$REPO_ROOT" && bun run --cwd apps/app build:android); then
  fail "build:android failed (web bundle + cap sync android)"
fi

# Boot emulator if no device is already attached.
DEVICES="$("$ADB_BIN" devices | awk 'NR>1 && $2=="device" {print $1}')"
if [[ -z "$DEVICES" ]]; then
  log "Starting emulator: $AVD"
  EMU_LOG="/tmp/milady-android-emu-$(date +%s).log"
  "$EMU_BIN" -avd "$AVD" -no-snapshot-save -no-boot-anim -netdelay none -netspeed full \
    >"$EMU_LOG" 2>&1 &
  EMU_PID=$!
  log "Emulator PID $EMU_PID, log $EMU_LOG"

  # Wait up to 180s for device to register.
  log "Waiting for device to appear (up to 180s)"
  WAITED=0
  until [[ -n "$("$ADB_BIN" devices | awk 'NR>1 && $2=="device" {print $1}')" ]]; do
    sleep 3
    WAITED=$((WAITED + 3))
    if (( WAITED >= 180 )); then
      kill "$EMU_PID" 2>/dev/null || true
      fail "emulator did not register with adb within 180s (see $EMU_LOG)"
    fi
  done

  log "Waiting for boot completion"
  "$ADB_BIN" wait-for-device
  WAITED=0
  until [[ "$("$ADB_BIN" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]]; do
    sleep 3
    WAITED=$((WAITED + 3))
    if (( WAITED >= 180 )); then
      fail "emulator boot did not complete within 180s"
    fi
  done
else
  log "Reusing already-attached device(s): $DEVICES"
fi

log "Building debug APK via Gradle"
GRADLE_LOG="/tmp/milady-android-gradle-$(date +%s).log"
if ! (cd "$APP_DIR/android" && ./gradlew assembleDebug --console=plain) >"$GRADLE_LOG" 2>&1; then
  tail -n 80 "$GRADLE_LOG" >&2
  fail "gradle assembleDebug failed (full log: $GRADLE_LOG)"
fi

APK="$(find "$APP_DIR/android/app/build/outputs/apk/debug" -name '*.apk' -print -quit 2>/dev/null || true)"
if [[ -z "$APK" || ! -f "$APK" ]]; then
  fail "could not locate built debug APK under apps/app/android/app/build/outputs/apk/debug"
fi

log "Installing $APK"
"$ADB_BIN" install -r "$APK" >/dev/null

log "Launching $PKG_ID"
"$ADB_BIN" shell monkey -p "$PKG_ID" -c android.intent.category.LAUNCHER 1 >/dev/null

log "Waiting 10s for native launch + first paint"
sleep 10

SCREENSHOT="/tmp/milady-android-first-run-$(date +%s).png"
"$ADB_BIN" exec-out screencap -p > "$SCREENSHOT"

if [[ ! -s "$SCREENSHOT" ]]; then
  fail "screenshot was empty: $SCREENSHOT"
fi

echo "PASS: screenshot at $SCREENSHOT"
