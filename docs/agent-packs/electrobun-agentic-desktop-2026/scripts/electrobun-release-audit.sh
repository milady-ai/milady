#!/usr/bin/env bash
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"
echo "== Electrobun Release Audit =="
[[ -f electrobun.config.ts ]] || { echo "WARN: electrobun.config.ts missing"; exit 0; }
grep -n "baseUrl" electrobun.config.ts || echo "WARN: release.baseUrl not found. Updater/distribution may be incomplete."
grep -n "codesign\|notarize" electrobun.config.ts || echo "INFO: no macOS codesign/notarize flags found. Dev-only may be fine; production should sign/notarize."
for v in ELECTROBUN_DEVELOPER_ID ELECTROBUN_TEAMID; do
  [[ -n "${!v:-}" ]] && echo "env: $v set" || echo "INFO: $v not set in this shell"
done
if [[ -n "${ELECTROBUN_APPLEIDPASS:-}" ]]; then echo "env: ELECTROBUN_APPLEIDPASS set"; fi
if [[ -n "${ELECTROBUN_APPLEAPIKEYPATH:-}" ]]; then echo "env: ELECTROBUN_APPLEAPIKEYPATH set"; fi
[[ -d artifacts ]] && find artifacts -maxdepth 1 -type f | head -30 | sed 's#^#artifact: #' || echo "INFO: no artifacts directory found yet."
exit 0
