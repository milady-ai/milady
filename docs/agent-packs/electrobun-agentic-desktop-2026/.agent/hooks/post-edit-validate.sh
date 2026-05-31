#!/usr/bin/env bash
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"
changed="$(git diff --name-only || true)"
if echo "$changed" | grep -E '\.(ts|tsx|js|jsx)$' >/dev/null 2>&1; then
  echo "TypeScript/JavaScript changed. Run: bun test && bun run typecheck (if available)."
fi
if echo "$changed" | grep -E 'electrobun\.config\.ts|package\.json|bun\.lockb?$|tsconfig\.json' >/dev/null 2>&1; then
  echo "Build/config changed. Run: scripts/electrobun-agent-doctor.sh && scripts/electrobun-build-test.sh"
fi
if echo "$changed" | grep -E 'src/(bun|shared).*rpc|src/.*/.*view|webview|sandbox|navigation|secrets|model|tool|updater|release' >/dev/null 2>&1; then
  echo "Agent/security surface changed. Run: scripts/validate-agentic-electrobun.sh && scripts/security-audit.sh"
fi
exit 0
