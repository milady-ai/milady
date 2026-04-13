#!/usr/bin/env bash
# PostToolUse hook: verifies NODE_PATH guards stay intact in the three critical sites
# after any Edit/Write/MultiEdit. Runs after the tool already applied. On drift, exits
# with code 2 which signals the Claude Code hook system to surface the stderr message
# back to the model and block continuation — this is intentional: dropping NODE_PATH
# from any of the three sites silently breaks dynamic @elizaos/plugin-* imports under
# Bun, and we want the agent to see and fix it immediately.
#
# Triggered on: Edit | Write | MultiEdit
# Scope filter: only runs full check when one of the three NODE_PATH files was touched.

set -u

# Read JSON from stdin and extract file_path from tool_input
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

# Normalize — we only care about the three NODE_PATH sites
case "$file_path" in
  */eliza/packages/agent/src/runtime/eliza.ts|\
  */eliza/packages/app-core/scripts/run-node.mjs|\
  */apps/app/electrobun/src/native/agent.ts)
    ;;
  *)
    exit 0
    ;;
esac

# Find the repo root (script lives at <repo>/.claude/hooks/)
repo_root="$(cd "$(dirname "$0")/../.." && pwd)"

sites=(
  "eliza/packages/agent/src/runtime/eliza.ts"
  "eliza/packages/app-core/scripts/run-node.mjs"
  "apps/app/electrobun/src/native/agent.ts"
)

missing=()
for s in "${sites[@]}"; do
  f="$repo_root/$s"
  if [ ! -f "$f" ]; then
    missing+=("$s (file missing)")
    continue
  fi
  if ! grep -q "NODE_PATH" "$f"; then
    missing+=("$s (no NODE_PATH reference)")
  fi
done

if [ ${#missing[@]} -gt 0 ]; then
  {
    echo ""
    echo "⚠️  NODE_PATH guard drift detected — dynamic @elizaos/plugin-* imports will break:"
    for m in "${missing[@]}"; do
      echo "   - $m"
    done
    echo ""
    echo "   All three sites must set NODE_PATH before dynamic imports. See CLAUDE.md → 'NODE_PATH (do not remove)'."
    echo ""
  } >&2
  exit 2  # signals Claude to notice and act
fi

exit 0
