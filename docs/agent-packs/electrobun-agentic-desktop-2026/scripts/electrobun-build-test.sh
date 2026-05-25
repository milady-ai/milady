#!/usr/bin/env bash
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"
echo "== Electrobun Build/Test =="
if [[ ! -f package.json ]]; then echo "No package.json found."; exit 0; fi
bun install --frozen-lockfile || bun install
if bun run | grep -q "typecheck"; then bun run typecheck; else echo "INFO: no typecheck script found."; fi
bun test
if bun run | grep -q "build:dev"; then bun run build:dev; elif bun run | grep -q "dev"; then echo "INFO: run bun run dev manually for GUI smoke test."; fi
exit 0
