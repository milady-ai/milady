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
has_root_script() {
  bun -e 'const p=require("./package.json"); process.exit(p.scripts?.[process.argv[1]] ? 0 : 1)' "$1"
}
has_desktop_script() {
  (cd "$ELECTROBUN_DIR" && bun -e 'const p=require("./package.json"); process.exit(p.scripts?.[process.argv[1]] ? 0 : 1)' "$1")
}
echo "== Electrobun Build/Test =="
if [[ ! -f package.json ]]; then echo "No package.json found."; exit 0; fi
if [[ -f bun.lock || -f bun.lockb ]]; then
  bun install --frozen-lockfile
fi
if has_root_script typecheck; then bun run typecheck; else echo "INFO: no root typecheck script found."; fi
if [[ -f "$ELECTROBUN_DIR/package.json" ]] && has_desktop_script typecheck; then
  (cd "$ELECTROBUN_DIR" && bun run typecheck)
fi
if [[ -f "$ELECTROBUN_DIR/package.json" ]] && has_desktop_script test; then
  (cd "$ELECTROBUN_DIR" && bun run test)
elif has_root_script test; then
  bun run test
else
  echo "INFO: no test script found."
fi
if has_root_script desktop:preflight; then
  bun run desktop:preflight
elif has_root_script build:desktop; then
  echo "INFO: run bun run build:desktop for a full packaged desktop build."
elif has_root_script dev:desktop; then
  echo "INFO: run bun run dev:desktop manually for GUI smoke test."
fi
exit 0
