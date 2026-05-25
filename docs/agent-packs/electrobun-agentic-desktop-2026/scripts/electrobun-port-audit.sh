#!/usr/bin/env bash
set -euo pipefail
echo "== Apple-to-Electrobun Port Audit =="
grep -R "FoundationModels\|LanguageModelSession\|AppIntent\|AppEntity\|WidgetKit\|ActivityKit\|AppClip\|SwiftUI\|StoreKit\|PassKit" -n . --include='*.ts' --include='*.tsx' --include='*.md' --exclude-dir=node_modules --exclude-dir=.git || true
echo "Review any hits above. Docs may mention non-equivalents; implementation code should not fake Apple APIs."
