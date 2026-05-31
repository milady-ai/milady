#!/usr/bin/env bash
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"
echo "== Agentic Electrobun Validation =="
if [[ ! -f package.json ]]; then echo "WARN: package.json missing"; exit 0; fi
if grep -R "defineRPC\|Electroview\|BrowserView" -n src --include='*.ts' --include='*.tsx' >/dev/null 2>&1; then
  grep -R "maxRequestTime" -n src --include='*.ts' --include='*.tsx' >/dev/null 2>&1 || echo "WARN: RPC detected but no obvious maxRequestTime found."
fi
if grep -R "executeJavascript" -n src --include='*.ts' --include='*.tsx' >/dev/null 2>&1; then
  echo "WARN: executeJavascript detected. Verify it is not model-controlled and cannot execute untrusted strings."
fi
if grep -R "<electrobun-webview\|new BrowserView\|new BrowserWindow" -n src --include='*.ts' --include='*.tsx' --include='*.html' >/dev/null 2>&1; then
  grep -R "sandbox\|setNavigationRules" -n src --include='*.ts' --include='*.tsx' --include='*.html' >/dev/null 2>&1 || echo "INFO: webviews/windows detected; verify sandbox/navigation rules for remote content."
fi
if grep -R "openai\|anthropic\|gemini\|ollama\|model\|llm" -ni src --include='*.ts' --include='*.tsx' >/dev/null 2>&1; then
  grep -R "Bun.secrets\|secrets.get\|secrets.set" -n src --include='*.ts' >/dev/null 2>&1 || echo "WARN: model/provider references detected but no Bun.secrets usage found."
fi
exit 0
