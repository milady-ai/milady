#!/usr/bin/env bash
# PostToolUse hook: runs actionlint on edited GitHub Actions workflows.
# Blocking-with-acknowledgment on findings — exits with code 2 when actionlint
# reports issues, which in the Claude Code hook system requires the agent to
# see and acknowledge the stderr output before continuing. Workflow syntax
# errors must not ship silently, so this is intentional.
#
# Triggered on: Edit | Write | MultiEdit
# Scope filter: only runs when the touched file is under .github/workflows/ or .github/actions/.
# Gracefully skips if actionlint is not installed.

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
  */.github/workflows/*.yml|*/.github/workflows/*.yaml|\
  */.github/actions/*.yml|*/.github/actions/*.yaml)
    ;;
  *)
    exit 0
    ;;
esac

if ! command -v actionlint >/dev/null 2>&1; then
  # actionlint not installed — soft notice once, no block
  {
    echo ""
    echo "ℹ️  actionlint not found on PATH; skipping workflow lint for $file_path"
    echo "   Install: brew install actionlint  (or see https://github.com/rhysd/actionlint)"
    echo ""
  } >&2
  exit 0
fi

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
config="$repo_root/.github/actionlint.yaml"

if [ -f "$config" ]; then
  output="$(actionlint -config-file "$config" "$file_path" 2>&1 || true)"
else
  output="$(actionlint "$file_path" 2>&1 || true)"
fi

if [ -n "$output" ]; then
  {
    echo ""
    echo "⚠️  actionlint findings in $(basename "$file_path"):"
    echo "$output" | sed 's/^/   /'
    echo ""
  } >&2
  exit 2
fi

exit 0
