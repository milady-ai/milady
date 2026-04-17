#!/usr/bin/env bash
# Milady iOS companion — build + Xcode open.
#
# Prerequisites (see README):
#   - Xcode 15+
#   - CocoaPods
#   - Apple Developer team ID exported as MILADY_E2E_APPLE_TEAM_ID
#
# Steps:
#   1. Build the web bundle into ./dist
#   2. Sync Capacitor iOS plugins and copy web assets
#   3. Open the Xcode workspace for signing + simulator/device run
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -z "${MILADY_E2E_APPLE_TEAM_ID:-}" ]; then
  echo "[build-ios] WARNING: MILADY_E2E_APPLE_TEAM_ID not set — Xcode will need manual team selection." >&2
fi

echo "[build-ios] Running vite build..."
bun run build

echo "[build-ios] Running capacitor sync ios..."
bunx cap sync ios

echo "[build-ios] Opening Xcode workspace..."
bunx cap open ios
