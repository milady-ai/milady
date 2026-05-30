#!/usr/bin/env bash
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"
echo "== Electrobun Agentic Desktop Doctor =="
echo "Root: $ROOT"
command -v bun >/dev/null && bun --version | sed 's/^/bun: /' || echo "WARN: bun not found"
if [[ -f package.json ]]; then
  echo "package.json: present"
  bun -e 'const p=require("./package.json"); console.log("name:", p.name||"<none>"); console.log("scripts:", Object.keys(p.scripts||{}).join(", ")||"<none>"); console.log("electrobun:", (p.dependencies&&p.dependencies.electrobun)||(p.devDependencies&&p.devDependencies.electrobun)||"<not listed>")' || true
else
  echo "WARN: package.json not found"
fi
[[ -f electrobun.config.ts ]] && echo "electrobun.config.ts: present" || echo "WARN: electrobun.config.ts not found"
[[ -f tsconfig.json ]] && echo "tsconfig.json: present" || echo "WARN: tsconfig.json not found"
find . -maxdepth 3 \( -name 'bun.lock' -o -name 'bun.lockb' \) -print | sed 's#^./#lock: #'
find src -maxdepth 3 -type f 2>/dev/null | grep -E 'src/(bun|shared|.*view)/' | head -80 | sed 's#^#src: #'
exit 0
