#!/usr/bin/env bash
set -euo pipefail
INPUT="$(cat || true)"
cmd="$INPUT"
blocked=(
  "rm -rf /"
  "sudo rm -rf"
  "chmod -R 777"
  "cat .env"
  "cat .*env"
  "grep -R .*SECRET"
  "grep -R .*TOKEN"
  "grep -R .*API_KEY"
  "curl .*\|.*sh"
  "wget .*\|.*sh"
  "bun pm cache rm"
  "rm -rf node_modules"
  "rm -f bun.lock"
  "rm -f bun.lockb"
  "rm -rf artifacts"
  "rm -rf build"
  "xattr -cr /Applications"
  "security find-generic-password"
  "ELECTROBUN_APPLEIDPASS"
  "ELECTROBUN_APPLEAPIKEYPATH"
)
for pattern in "${blocked[@]}"; do
  if echo "$cmd" | grep -Eiq "$pattern"; then
    echo "BLOCKED by electrobun-agentic-desktop hook: dangerous or secret-exposing command: $pattern" >&2
    exit 2
  fi
done
exit 0
