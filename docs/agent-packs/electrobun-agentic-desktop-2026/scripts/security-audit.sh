#!/usr/bin/env bash
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"
echo "== Electrobun Security / Privacy Audit =="
for f in .env .env.local .env.production secrets.json credentials.json; do
  [[ -f "$f" ]] && echo "WARN: $f exists. Verify it is gitignored and never read by agent/logged."
done
if grep -R "api[_-]*key\|secret\|token\|password" -ni . --include='*.ts' --include='*.tsx' --include='*.json' --exclude='package-lock.json' --exclude='bun.lock' --exclude='bun.lockb' --exclude-dir=node_modules --exclude-dir=artifacts --exclude-dir=build | grep -Ev "Bun\.secrets|placeholder|example|redact|process\.env|SECRET|TOKEN|API_KEY"; then
  echo "WARN: Possible hardcoded secret-like strings above. Review manually."
fi
if grep -R "http://" -n src electrobun.config.ts package.json 2>/dev/null; then
  echo "WARN: plaintext http:// references found. Verify they are local/dev-only or blocked."
fi
if grep -R "<electrobun-webview" -n src --include='*.html' --include='*.tsx' 2>/dev/null | grep -v "sandbox"; then
  echo "WARN: electrobun-webview without sandbox on same line. Verify untrusted content is sandboxed."
fi
exit 0
