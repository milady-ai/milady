#!/usr/bin/env bash
# ------------------------------------------------------------------------------
# Milady — iOS Simulator first-run smoke test (LOCAL DEV ONLY)
#
# This script is NOT wired into CI. It exists for engineers to verify the
# Capacitor iOS build boots to the BootstrapStep on a local iOS simulator and
# to capture a screenshot for QA evidence.
#
# Covers row M1 of docs/QA-first-run.md (mobile walkthrough).
#
# Requirements (script gracefully degrades and exits 0 if any are missing):
#   - macOS host
#   - Xcode + Command Line Tools (xcrun, xcodebuild)
#   - At least one iOS simulator runtime installed
#   - Capacitor CLI available via the workspace (npx cap ...)
#   - bun (for the web build step)
#
# Usage:
#   bash scripts/qa/ios-sim-smoke.sh [--device "iPhone 15"]
#
# Exit codes:
#   0  — smoke passed OR prerequisites missing (skip).
#   >0 — real failure (build error, install error, launch error).
# ------------------------------------------------------------------------------
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="$REPO_ROOT/apps/app"
BUNDLE_ID="ai.milady.milady"
DEVICE="iPhone 15"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --device)
      DEVICE="$2"
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

log() { printf '[ios-sim-smoke] %s\n' "$*"; }
skip() { echo "SKIPPED: $*"; exit 0; }
fail() { echo "FAIL: $*" >&2; exit 1; }

if [[ "$(uname -s)" != "Darwin" ]]; then
  skip "iOS simulator smoke requires macOS (uname=$(uname -s))"
fi

for tool in xcrun xcodebuild; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    skip "$tool not installed (Xcode CLT missing)"
  fi
done

if ! xcrun simctl help >/dev/null 2>&1; then
  skip "xcrun simctl not available (no iOS simulator runtime?)"
fi

if ! command -v bun >/dev/null 2>&1; then
  skip "bun not installed (cannot produce web bundle)"
fi

if ! command -v npx >/dev/null 2>&1; then
  skip "npx not installed (cannot run capacitor CLI)"
fi

if [[ ! -d "$APP_DIR/ios" ]]; then
  skip "Capacitor iOS platform not initialized at $APP_DIR/ios (run bun run --cwd apps/app cap:sync:ios first)"
fi

WORKSPACE="$APP_DIR/ios/App/App.xcworkspace"
if [[ ! -d "$WORKSPACE" ]]; then
  # Fall back to common location used by Capacitor's iOS template.
  WORKSPACE_ALT="$APP_DIR/ios/App.xcworkspace"
  if [[ -d "$WORKSPACE_ALT" ]]; then
    WORKSPACE="$WORKSPACE_ALT"
  else
    skip "Xcode workspace not found under $APP_DIR/ios (Capacitor iOS project missing)"
  fi
fi

log "Building web bundle (bun run --cwd $APP_DIR build:ios)"
if ! (cd "$REPO_ROOT" && bun run --cwd apps/app build:ios); then
  fail "build:ios failed (web bundle + cap sync ios)"
fi

# build:ios already runs cap sync; no need to re-run.

log "Booting simulator: $DEVICE"
BOOT_OUTPUT="$(xcrun simctl boot "$DEVICE" 2>&1 || true)"
if echo "$BOOT_OUTPUT" | grep -qi "Unable to find a device"; then
  skip "no simulator named '$DEVICE' found (install via Xcode > Settings > Platforms)"
fi
if echo "$BOOT_OUTPUT" | grep -qi "current state: Booted"; then
  log "Simulator already booted"
fi

# Give the device a moment to be ready before xcodebuild targets it.
xcrun simctl bootstatus "$DEVICE" -b >/dev/null 2>&1 || true

log "Building & installing app via xcodebuild"
DERIVED_DATA="$REPO_ROOT/.qa-derived-data/ios-sim-smoke"
mkdir -p "$DERIVED_DATA"

if ! xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme App \
  -configuration Debug \
  -destination "platform=iOS Simulator,name=$DEVICE" \
  -derivedDataPath "$DERIVED_DATA" \
  -quiet \
  build 2>&1 | tail -n 80; then
  fail "xcodebuild build failed (see output above)"
fi

APP_BUNDLE="$(find "$DERIVED_DATA/Build/Products" -name 'App.app' -type d -print -quit 2>/dev/null || true)"
if [[ -z "$APP_BUNDLE" || ! -d "$APP_BUNDLE" ]]; then
  fail "could not locate built App.app under $DERIVED_DATA"
fi

log "Installing $APP_BUNDLE to simulator"
xcrun simctl install "$DEVICE" "$APP_BUNDLE"

log "Launching $BUNDLE_ID"
xcrun simctl launch "$DEVICE" "$BUNDLE_ID" >/dev/null

log "Waiting 10s for native launch + first paint"
sleep 10

SCREENSHOT="/tmp/milady-ios-first-run-$(date +%s).png"
xcrun simctl io "$DEVICE" screenshot "$SCREENSHOT"

if [[ ! -s "$SCREENSHOT" ]]; then
  fail "screenshot was empty: $SCREENSHOT"
fi

echo "PASS: screenshot at $SCREENSHOT"
