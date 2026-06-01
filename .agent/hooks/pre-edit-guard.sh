#!/usr/bin/env bash
set -euo pipefail
INPUT="$(cat || true)"
protected_patterns=(
  "\.env$"
  "\.env\.local"
  "\.env\.production"
  "AuthKey_.*\.p8"
  "\.p12"
  "\.mobileprovision"
  "secrets?\.json"
  "credentials?\.json"
  "artifacts/"
  "build/"
  "node_modules/"
  "\.electrobun-cache"
  "release-keys"
  "ELECTROBUN_APPLEIDPASS"
  "ELECTROBUN_APPLEAPIKEYPATH"
)
for pat in "${protected_patterns[@]}"; do
  if echo "$INPUT" | grep -Eiq "$pat"; then
    echo "BLOCKED by electrobun-agentic-desktop hook: attempted edit may touch protected pattern: $pat" >&2
    exit 2
  fi
done
exit 0
