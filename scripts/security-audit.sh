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
SEARCH_DIRS=()
[[ -d "$ELECTROBUN_DIR/src" ]] && SEARCH_DIRS+=("$ELECTROBUN_DIR/src")
[[ -d "$ROOT/apps/app/src" ]] && SEARCH_DIRS+=("$ROOT/apps/app/src")
[[ -f "$ELECTROBUN_DIR/electrobun.config.ts" ]] && SEARCH_DIRS+=("$ELECTROBUN_DIR/electrobun.config.ts")
echo "== Electrobun Security / Privacy Audit =="
for f in .env .env.local .env.production secrets.json credentials.json; do
  [[ -f "$f" ]] && echo "WARN: $f exists. Verify it is gitignored and never read by agent/logged."
done
if ((${#SEARCH_DIRS[@]} == 0)); then
  echo "WARN: no Electrobun or renderer source directories found"
  exit 0
fi
if grep -R "api[_-]*key\|secret\|token\|password" -ni "${SEARCH_DIRS[@]}" --include='*.ts' --include='*.tsx' --include='*.json' | grep -Ev "Bun\.secrets|placeholder|example|redact|process\.env|SECRET|TOKEN|API_KEY|keychain|SecureStore"; then
  echo "WARN: Possible hardcoded secret-like strings above. Review manually."
fi
if grep -R "http://" -n "${SEARCH_DIRS[@]}" package.json 2>/dev/null; then
  echo "WARN: plaintext http:// references found. Verify they are local/dev-only or blocked."
fi
if grep -R "<electrobun-webview" -n "${SEARCH_DIRS[@]}" --include='*.html' --include='*.tsx' 2>/dev/null | grep -v "sandbox"; then
  echo "WARN: electrobun-webview without sandbox on same line. Verify untrusted content is sandboxed."
fi
exit 0
