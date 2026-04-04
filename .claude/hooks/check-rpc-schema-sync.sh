#!/usr/bin/env bash
# PostToolUse hook: detects drift between Electrobun rpc-schema.ts and electrobun-bridge.ts.
# Non-blocking — prints unresolved method names to stderr if either file changed.
#
# Triggered on: Edit | Write | MultiEdit
# Scope filter: only runs when rpc-schema.ts or electrobun-bridge.ts was touched.

set -u

payload="$(cat)"
file_path=""
if command -v python3 >/dev/null 2>&1; then
  file_path="$(printf '%s' "$payload" | python3 -c 'import json,sys
try:
  d=json.load(sys.stdin)
  ti=d.get("tool_input",{}) or {}
  print(ti.get("file_path") or ti.get("path") or "")
except Exception:
  pass' 2>/dev/null || true)"
fi

case "$file_path" in
  */apps/app/electrobun/src/rpc-schema.ts|\
  */apps/app/electrobun/src/bridge/electrobun-bridge.ts)
    ;;
  *)
    exit 0
    ;;
esac

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
schema="$repo_root/apps/app/electrobun/src/rpc-schema.ts"
bridge="$repo_root/apps/app/electrobun/src/bridge/electrobun-bridge.ts"

if [ ! -f "$schema" ] || [ ! -f "$bridge" ]; then
  exit 0
fi

# Extract method-like identifiers from the schema — conservative regex, looks for
# `methodName:` or `methodName(` inside the schema file.
schema_methods="$(grep -oE '^[[:space:]]*[a-zA-Z_][a-zA-Z0-9_]*[[:space:]]*[:(]' "$schema" \
  | grep -oE '[a-zA-Z_][a-zA-Z0-9_]*' \
  | sort -u)"

missing=()
while IFS= read -r m; do
  [ -z "$m" ] && continue
  # Skip TS keywords and common noise
  case "$m" in
    type|interface|export|import|const|let|var|function|return|if|else|from|as|of|in|new|this|void|null|undefined|true|false|string|number|boolean|any|Promise|Record|Array|Partial|Required|Pick|Omit)
      continue
      ;;
  esac
  if ! grep -q "\b$m\b" "$bridge"; then
    missing+=("$m")
  fi
done <<<"$schema_methods"

if [ ${#missing[@]} -gt 0 ]; then
  {
    echo ""
    echo "⚠️  RPC schema ↔ bridge drift — identifiers in rpc-schema.ts not referenced in electrobun-bridge.ts:"
    for m in "${missing[@]}"; do
      echo "   - $m"
    done
    echo ""
    echo "   (Heuristic check. Confirm by reading both files — false positives possible on type aliases.)"
    echo "   Fix: sync electrobun-bridge.ts and any bun-side handler in the same change."
    echo ""
  } >&2
  # Exit 0 — this is a heuristic, not a blocker. Claude will see the stderr.
fi

exit 0
