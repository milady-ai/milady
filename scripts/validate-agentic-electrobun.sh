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
echo "== Agentic Electrobun Validation =="
if [[ ! -f package.json ]]; then echo "WARN: package.json missing"; exit 0; fi
if ((${#SEARCH_DIRS[@]} == 0)); then
  echo "WARN: no Electrobun or renderer source directories found"
  exit 0
fi
if grep -R "defineRPC\|Electroview\|BrowserView" -n "${SEARCH_DIRS[@]}" --include='*.ts' --include='*.tsx' >/dev/null 2>&1; then
  grep -R "maxRequestTime" -n "${SEARCH_DIRS[@]}" --include='*.ts' --include='*.tsx' >/dev/null 2>&1 || echo "WARN: RPC detected but no obvious maxRequestTime found."
fi
if grep -R "executeJavascript" -n "${SEARCH_DIRS[@]}" --include='*.ts' --include='*.tsx' >/dev/null 2>&1; then
  echo "WARN: executeJavascript detected. Verify it is not model-controlled and cannot execute untrusted strings."
fi
if grep -R "<electrobun-webview\|new BrowserView\|new BrowserWindow" -n "${SEARCH_DIRS[@]}" --include='*.ts' --include='*.tsx' --include='*.html' >/dev/null 2>&1; then
  grep -R "sandbox\|setNavigationRules" -n "${SEARCH_DIRS[@]}" --include='*.ts' --include='*.tsx' --include='*.html' >/dev/null 2>&1 || echo "INFO: webviews/windows detected; verify sandbox/navigation rules for remote content."
fi
if grep -R "openai\|anthropic\|gemini\|ollama\|model\|llm" -ni "${SEARCH_DIRS[@]}" --include='*.ts' --include='*.tsx' >/dev/null 2>&1; then
  grep -R "Bun.secrets\|secrets.get\|secrets.set\|SecureStore\|keychain\|credential" -n "${SEARCH_DIRS[@]}" --include='*.ts' --include='*.tsx' >/dev/null 2>&1 || echo "WARN: model/provider references detected but no credential store usage found."
fi
exit 0
