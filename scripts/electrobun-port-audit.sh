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
echo "== Apple-to-Electrobun Port Audit =="
if ((${#SEARCH_DIRS[@]} == 0)); then
  echo "WARN: no Electrobun or renderer source directories found"
  exit 0
fi
grep -R "FoundationModels\|LanguageModelSession\|AppIntent\|AppEntity\|WidgetKit\|ActivityKit\|AppClip\|SwiftUI\|StoreKit\|PassKit" -n "${SEARCH_DIRS[@]}" --include='*.ts' --include='*.tsx' || true
echo "Review any hits above. Docs may mention non-equivalents; implementation code should not fake Apple APIs."
