#!/usr/bin/env bash
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"
echo "== Dependency Audit =="
[[ -f package.json ]] || { echo "No package.json"; exit 0; }
bun pm ls || true
bun audit || echo "INFO: bun audit unavailable or reported issues; review manually."
