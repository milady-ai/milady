#!/usr/bin/env bash
# Build whisper.cpp binary and download the base.en model.
# Run once after `bun install`, and again after upgrading whisper-node.
#
# Usage:
#   bash apps/app/electrobun/scripts/build-whisper.sh [model]
#
# model: tiny.en | base.en (default) | small.en | medium.en | large-v3
#
set -euo pipefail

MODEL="${1:-base.en}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WHISPER_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)/node_modules/whisper-node/lib/whisper.cpp"
WHISPER_MODEL_DIR="$WHISPER_DIR/models"
WHISPER_MODEL_FILENAME="ggml-${MODEL}.bin"
WHISPER_MODEL_PATH="$WHISPER_MODEL_DIR/$WHISPER_MODEL_FILENAME"
WHISPER_MODEL_CACHE_DIR="${MILADY_WHISPER_MODEL_CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/milady/whisper}"
WHISPER_MODEL_CACHE_PATH="$WHISPER_MODEL_CACHE_DIR/$WHISPER_MODEL_FILENAME"

patch_whisper_makefile() {
  local makefile_path="$WHISPER_DIR/Makefile"

  if [ ! -f "$makefile_path" ]; then
    return
  fi

  # Use Bun explicitly — `node <<'EOF'` fails with Bun's node shim ("does not support a repl").
  bun "$SCRIPT_DIR/patch-whisper-makefile.mjs" "$makefile_path"
}

if [ ! -d "$WHISPER_DIR" ]; then
  echo "Error: whisper.cpp not found at $WHISPER_DIR" >&2
  echo "Run 'bun install' first." >&2
  exit 1
fi

echo "==> Building whisper.cpp in $WHISPER_DIR"
cd "$WHISPER_DIR"
patch_whisper_makefile
make main -j"$(nproc 2>/dev/null || sysctl -n hw.logicalcpu 2>/dev/null || echo 4)"

bash "$SCRIPT_DIR/ensure-whisper-model.sh" "$MODEL"

echo "==> Done. Binary: $WHISPER_DIR/main"
echo "    Model:  $WHISPER_MODEL_PATH"
echo "    Cache:  $WHISPER_MODEL_CACHE_PATH"
