#!/usr/bin/env bash
set -euo pipefail
INPUT="$(cat || true)"
echo "$INPUT" | grep -E "(error:|Error:|TypeError|SyntaxError|ReferenceError|TS[0-9]{4}|bun test|Tests failed|Build failed|BUILD FAILED|electrobun.*failed|notariz|codesign|Cannot find module|Module not found)" | tail -n 60 || true
exit 0
