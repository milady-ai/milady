#!/usr/bin/env bash
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"
ELECTROBUN_DIR="${MILADY_ELECTROBUN_DIR:-}"
if [[ -z "$ELECTROBUN_DIR" ]]; then
  for candidate in "eliza/packages/app-core/platforms/electrobun" "apps/app/electrobun" "."; do
    if [[ -f "$ROOT/$candidate/electrobun.config.ts" ]]; then
      ELECTROBUN_DIR="$ROOT/$candidate"
      break
    fi
  done
fi
ELECTROBUN_DIR="${ELECTROBUN_DIR:-$ROOT}"
[[ "$ELECTROBUN_DIR" = /* ]] || ELECTROBUN_DIR="$ROOT/$ELECTROBUN_DIR"
CONFIG="$ELECTROBUN_DIR/electrobun.config.ts"
echo "== Electrobun Release Audit =="
echo "Electrobun workspace: $ELECTROBUN_DIR"
[[ -f "$CONFIG" ]] || { echo "WARN: electrobun.config.ts missing"; exit 0; }
grep -n "baseUrl" "$CONFIG" || echo "WARN: release.baseUrl not found. Updater/distribution may be incomplete."
grep -n "codesign\|notarize" "$CONFIG" || echo "INFO: no macOS codesign/notarize flags found. Dev-only may be fine; production should sign/notarize."
for v in ELECTROBUN_DEVELOPER_ID ELECTROBUN_TEAMID; do
  [[ -n "${!v:-}" ]] && echo "env: $v set" || echo "INFO: $v not set in this shell"
done
if [[ -n "${ELECTROBUN_APPLEIDPASS:-}" ]]; then echo "env: ELECTROBUN_APPLEIDPASS set"; fi
if [[ -n "${ELECTROBUN_APPLEAPIKEYPATH:-}" ]]; then echo "env: ELECTROBUN_APPLEAPIKEYPATH set"; fi
[[ -d "$ELECTROBUN_DIR/artifacts" ]] && find "$ELECTROBUN_DIR/artifacts" -maxdepth 1 -type f | head -30 | sed "s#^$ROOT/##; s#^#artifact: #" || echo "INFO: no artifacts directory found yet."
exit 0
