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
echo "== Electrobun Agentic Desktop Doctor =="
echo "Root: $ROOT"
echo "Electrobun workspace: $ELECTROBUN_DIR"
command -v bun >/dev/null && bun --version | sed 's/^/bun: /' || echo "WARN: bun not found"
if [[ -f package.json ]]; then
  echo "package.json: present"
  bun -e 'const p=require("./package.json"); console.log("name:", p.name||"<none>"); console.log("scripts:", Object.keys(p.scripts||{}).join(", ")||"<none>"); console.log("electrobun:", (p.dependencies&&p.dependencies.electrobun)||(p.devDependencies&&p.devDependencies.electrobun)||"<not listed>")' || true
else
  echo "WARN: package.json not found"
fi
if [[ -f "$ELECTROBUN_DIR/package.json" ]]; then
  (cd "$ELECTROBUN_DIR" && bun -e 'const p=require("./package.json"); console.log("desktop package:", p.name||"<none>"); console.log("desktop scripts:", Object.keys(p.scripts||{}).join(", ")||"<none>"); console.log("desktop electrobun:", (p.dependencies&&p.dependencies.electrobun)||(p.devDependencies&&p.devDependencies.electrobun)||"<not listed>")') || true
fi
[[ -f "$ELECTROBUN_DIR/electrobun.config.ts" ]] && echo "electrobun.config.ts: present" || echo "WARN: electrobun.config.ts not found"
[[ -f "$ELECTROBUN_DIR/tsconfig.json" ]] && echo "desktop tsconfig.json: present" || echo "WARN: desktop tsconfig.json not found"
find . -maxdepth 3 \( -name 'bun.lock' -o -name 'bun.lockb' \) -print | sed 's#^./#lock: #'
if [[ -d "$ELECTROBUN_DIR/src" ]]; then
  find "$ELECTROBUN_DIR/src" -maxdepth 3 -type f 2>/dev/null | head -80 | sed "s#^$ROOT/##; s#^#desktop src: #"
fi
if [[ -d apps/app/src ]]; then
  find apps/app/src -maxdepth 2 -type f 2>/dev/null | head -40 | sed 's#^#renderer src: #'
fi
exit 0
