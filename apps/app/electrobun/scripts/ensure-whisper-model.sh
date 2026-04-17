#!/usr/bin/env bash
#
# Ensure the requested whisper.cpp GGML model exists in the shared Milady cache
# and, when available, the whisper-node working tree. This script is intentionally
# separate from the native binary build so CI can prepare the model artifact once
# and fan it out to all desktop platform jobs.
#
# Usage:
#   bash apps/app/electrobun/scripts/ensure-whisper-model.sh [model]
#
# model: tiny.en | base.en (default) | small.en | medium.en | large-v3
#
# Environment:
#   MILADY_WHISPER_MODEL_CACHE_DIR   Override cache location
#                                    (default: $XDG_CACHE_HOME/milady/whisper
#                                     or $HOME/.cache/milady/whisper)
#   MILADY_WHISPER_DOWNLOAD_ATTEMPTS         Retry count (default: 4)
#   MILADY_WHISPER_DOWNLOAD_RETRY_DELAY_SECONDS  Delay between retries (default: 15)
#
set -euo pipefail

MODEL="${1:-base.en}"
WHISPER_MODEL_FILENAME="ggml-${MODEL}.bin"

# --- cache paths ---
WHISPER_MODEL_CACHE_DIR="${MILADY_WHISPER_MODEL_CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/milady/whisper}"
WHISPER_MODEL_CACHE_PATH="$WHISPER_MODEL_CACHE_DIR/$WHISPER_MODEL_FILENAME"

# --- optional whisper-node working tree (populated when node_modules exist) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
WHISPER_NODE_MODEL_DIR="$REPO_ROOT/node_modules/whisper-node/lib/whisper.cpp/models"

DOWNLOAD_ATTEMPTS="${MILADY_WHISPER_DOWNLOAD_ATTEMPTS:-4}"
RETRY_DELAY_SECONDS="${MILADY_WHISPER_DOWNLOAD_RETRY_DELAY_SECONDS:-15}"

# Hugging Face mirror (same URL whisper.cpp upstream uses)
HF_BASE_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main"

mkdir -p "$WHISPER_MODEL_CACHE_DIR"

# 1. Already in cache?
if [ -f "$WHISPER_MODEL_CACHE_PATH" ]; then
  echo "==> Whisper model already cached: $WHISPER_MODEL_CACHE_PATH"
else
  # 2. Check whisper-node working tree before downloading
  if [ -f "$WHISPER_NODE_MODEL_DIR/$WHISPER_MODEL_FILENAME" ]; then
    echo "==> Copying whisper model from working tree to cache"
    cp "$WHISPER_NODE_MODEL_DIR/$WHISPER_MODEL_FILENAME" "$WHISPER_MODEL_CACHE_PATH"
  else
    # 3. Download from Hugging Face with retries
    for attempt in $(seq 1 "$DOWNLOAD_ATTEMPTS"); do
      echo "==> Downloading model (attempt ${attempt}/${DOWNLOAD_ATTEMPTS}): $WHISPER_MODEL_FILENAME"
      rm -f "$WHISPER_MODEL_CACHE_PATH.tmp"

      if curl -fSL --retry 3 --retry-delay 5 \
           -o "$WHISPER_MODEL_CACHE_PATH.tmp" \
           "$HF_BASE_URL/ggml-${MODEL}.bin"; then
        mv "$WHISPER_MODEL_CACHE_PATH.tmp" "$WHISPER_MODEL_CACHE_PATH"
        break
      fi

      rm -f "$WHISPER_MODEL_CACHE_PATH.tmp"

      if [ "$attempt" -eq "$DOWNLOAD_ATTEMPTS" ]; then
        echo "Error: failed to download $WHISPER_MODEL_FILENAME after ${DOWNLOAD_ATTEMPTS} attempts" >&2
        exit 1
      fi

      echo "==> Download failed; retrying in ${RETRY_DELAY_SECONDS}s" >&2
      sleep "$RETRY_DELAY_SECONDS"
    done
  fi
fi

# Sanity check
if [ ! -f "$WHISPER_MODEL_CACHE_PATH" ]; then
  echo "Error: whisper model missing after restore/download: $WHISPER_MODEL_CACHE_PATH" >&2
  exit 1
fi

# Populate the whisper-node working tree if it exists (useful for local dev builds)
if [ -d "$WHISPER_NODE_MODEL_DIR" ] && [ ! -f "$WHISPER_NODE_MODEL_DIR/$WHISPER_MODEL_FILENAME" ]; then
  echo "==> Populating whisper-node working tree: $WHISPER_NODE_MODEL_DIR/$WHISPER_MODEL_FILENAME"
  cp "$WHISPER_MODEL_CACHE_PATH" "$WHISPER_NODE_MODEL_DIR/$WHISPER_MODEL_FILENAME"
fi

echo "==> Whisper model ready"
echo "    Cache: $WHISPER_MODEL_CACHE_PATH"
