#!/usr/bin/env bash
# download-first-light.sh — Fetches the first-light GGUF model into both:
#   1. apps/app/ios/App/App/agent/models/first-light.gguf  (Xcode dev bundle)
#   2. native/ios-bun-port/models/.cache/first-light.gguf  (local cache; used
#      as the source for the App Store download-on-first-launch flow's
#      test fixture, and as the staging copy for stage-into-xcode.mjs)
#
# Reads the model spec from ./manifest.json. Verifies SHA256 after download.
# Idempotent: skips when the target file already matches the expected SHA.
#
# Usage:
#   ./download-first-light.sh                      # download + stage both targets
#   ./download-first-light.sh --cache-only         # only stage to .cache, skip Xcode dir
#   ./download-first-light.sh --xcode-only         # only stage to Xcode dir (assumes cache exists)
#   ./download-first-light.sh --verify             # verify existing files, no download
#   ./download-first-light.sh --clean              # remove staged copies (keeps .cache)
#   ./download-first-light.sh --clean-all          # also remove .cache
#   ./download-first-light.sh --force              # re-download even if sha matches

set -euo pipefail

# ─── Locate paths ─────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Directory hierarchy:
#   <REPO_ROOT>/native/ios-bun-port/models/   ← SCRIPT_DIR
#   <REPO_ROOT>/native/ios-bun-port/          ← IOS_PORT_DIR
#   <REPO_ROOT>/native/                       ← NATIVE_DIR
#   <REPO_ROOT>/                              ← REPO_ROOT (where apps/app/ios/... lives)
IOS_PORT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
NATIVE_DIR="$(cd "$IOS_PORT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$NATIVE_DIR/.." && pwd)"

MANIFEST_FILE="$SCRIPT_DIR/manifest.json"
CACHE_DIR="$SCRIPT_DIR/.cache"
XCODE_DIR="$REPO_ROOT/apps/app/ios/App/App/agent/models"

# ─── Helpers ──────────────────────────────────────────────────────────────────

# Color output only when stdout is a TTY.
if [[ -t 1 ]]; then
  C_INFO="\033[34m"; C_OK="\033[32m"; C_WARN="\033[33m"; C_ERR="\033[31m"; C_RST="\033[0m"
else
  C_INFO=""; C_OK=""; C_WARN=""; C_ERR=""; C_RST=""
fi

log()  { printf "${C_INFO}[first-light]${C_RST} %s\n" "$*"; }
ok()   { printf "${C_OK}[first-light]${C_RST} %s\n" "$*"; }
warn() { printf "${C_WARN}[first-light]${C_RST} %s\n" "$*" >&2; }
err()  { printf "${C_ERR}[first-light:err]${C_RST} %s\n" "$*" >&2; }

sha256_of() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    err "no shasum or sha256sum on PATH"
    return 1
  fi
}

size_of() {
  wc -c < "$1" | tr -d ' '
}

# Read a string field from manifest.json using a small Python script if python3
# is available, else fall back to a portable JSON extraction. We avoid jq because
# it is not preinstalled on macOS by default.
#
# Args: $1 = json key path like "first-light.url"
manifest_get() {
  local key="$1"
  if command -v python3 >/dev/null 2>&1; then
    python3 -c "
import json, sys
with open('$MANIFEST_FILE') as f:
    d = json.load(f)
for part in '$key'.split('.'):
    d = d[part]
print(d)
"
  else
    # Last-ditch portable parser using node, which is required anyway by stage-into-xcode.mjs.
    if command -v node >/dev/null 2>&1; then
      node -e "
const d = require('$MANIFEST_FILE');
let v = d;
for (const p of '$key'.split('.')) v = v[p];
process.stdout.write(String(v));
"
    else
      err "need python3 or node to parse manifest.json"
      return 1
    fi
  fi
}

# ─── Argument parsing ─────────────────────────────────────────────────────────

MODE="all"
FORCE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --cache-only) MODE="cache-only"; shift ;;
    --xcode-only) MODE="xcode-only"; shift ;;
    --verify)     MODE="verify"; shift ;;
    --clean)      MODE="clean"; shift ;;
    --clean-all)  MODE="clean-all"; shift ;;
    --force)      FORCE=1; shift ;;
    -h|--help)
      cat <<EOF
download-first-light.sh — first-light GGUF model fetcher

Reads ./manifest.json for the model URL, expected SHA256, and target
filename. Stages the model into the Xcode dev bundle directory and a
local cache.

Usage:
  $0                     Download + stage both Xcode dev bundle and .cache
  $0 --cache-only        Only fetch into .cache (skip Xcode dir)
  $0 --xcode-only        Only copy from .cache → Xcode dir
  $0 --verify            Verify existing copies against manifest SHA
  $0 --clean             Remove Xcode-bundle copy (keep .cache)
  $0 --clean-all         Remove both copies
  $0 --force             Re-download even if SHA matches

Manifest:
  $MANIFEST_FILE
Cache:
  $CACHE_DIR
Xcode bundle:
  $XCODE_DIR
EOF
      exit 0
      ;;
    *) err "unknown arg: $1"; exit 2 ;;
  esac
done

# ─── Load manifest ────────────────────────────────────────────────────────────

if [[ ! -f "$MANIFEST_FILE" ]]; then
  err "manifest.json not found at $MANIFEST_FILE"
  exit 1
fi

MODEL_NAME="$(manifest_get first-light.filename)"
MODEL_URL="$(manifest_get first-light.url)"
EXPECTED_SHA="$(manifest_get first-light.sha256)"
EXPECTED_SIZE="$(manifest_get first-light.size_bytes)"
DISPLAY_NAME="$(manifest_get first-light.name)"

if [[ -z "$MODEL_NAME" || -z "$MODEL_URL" || -z "$EXPECTED_SHA" ]]; then
  err "manifest.json is missing one of: first-light.filename, .url, .sha256"
  exit 1
fi

CACHE_FILE="$CACHE_DIR/$MODEL_NAME"
XCODE_FILE="$XCODE_DIR/$MODEL_NAME"

log "Model:   $DISPLAY_NAME"
log "File:    $MODEL_NAME"
log "Size:    $EXPECTED_SIZE bytes (~$(( EXPECTED_SIZE / 1024 / 1024 )) MB)"
log "SHA256:  $EXPECTED_SHA"

# ─── verify_file <path> ───────────────────────────────────────────────────────
# Echoes "ok" if file matches both expected size and sha. Echoes a description
# of the mismatch otherwise. Never prints to stderr.
verify_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    echo "missing"
    return
  fi
  local actual_size; actual_size="$(size_of "$path")"
  if [[ "$actual_size" != "$EXPECTED_SIZE" ]]; then
    echo "size-mismatch (got $actual_size, want $EXPECTED_SIZE)"
    return
  fi
  local actual_sha; actual_sha="$(sha256_of "$path")"
  if [[ "$actual_sha" != "$EXPECTED_SHA" ]]; then
    echo "sha-mismatch (got $actual_sha, want $EXPECTED_SHA)"
    return
  fi
  echo "ok"
}

# ─── Mode dispatch ────────────────────────────────────────────────────────────

case "$MODE" in
  verify)
    log "Verifying cache:  $CACHE_FILE"
    rc=0
    cache_status="$(verify_file "$CACHE_FILE")"
    if [[ "$cache_status" == "ok" ]]; then ok "  cache: ok"; else warn "  cache: $cache_status"; rc=1; fi
    log "Verifying Xcode:  $XCODE_FILE"
    xcode_status="$(verify_file "$XCODE_FILE")"
    if [[ "$xcode_status" == "ok" ]]; then ok "  xcode: ok"; else warn "  xcode: $xcode_status"; rc=1; fi
    exit $rc
    ;;

  clean)
    [[ -f "$XCODE_FILE" ]] && { log "Removing $XCODE_FILE"; rm -f "$XCODE_FILE"; } || log "No Xcode-bundle copy to remove."
    exit 0
    ;;

  clean-all)
    [[ -f "$XCODE_FILE" ]] && { log "Removing $XCODE_FILE"; rm -f "$XCODE_FILE"; } || log "No Xcode-bundle copy to remove."
    [[ -f "$CACHE_FILE" ]] && { log "Removing $CACHE_FILE"; rm -f "$CACHE_FILE"; } || log "No cache copy to remove."
    exit 0
    ;;

  cache-only|xcode-only|all)
    : # fall through
    ;;
esac

# ─── Download into .cache ─────────────────────────────────────────────────────

download_to_cache() {
  mkdir -p "$CACHE_DIR"

  if [[ -f "$CACHE_FILE" && "$FORCE" -eq 0 ]]; then
    local status; status="$(verify_file "$CACHE_FILE")"
    if [[ "$status" == "ok" ]]; then
      ok "Cache already has a valid copy: $CACHE_FILE"
      return 0
    else
      warn "Existing cache file is invalid ($status). Re-downloading."
      rm -f "$CACHE_FILE"
    fi
  fi

  log "Downloading $MODEL_URL"
  log "  → $CACHE_FILE.partial"
  # --location: follow CDN redirects. --fail: non-2xx is a hard error.
  # --progress-bar: simple progress (no fancy multi-line output).
  # -C -: resume a partial download if curl was interrupted.
  curl --location --fail --progress-bar \
       --output "$CACHE_FILE.partial" \
       --continue-at - \
       "$MODEL_URL"

  log "Verifying download."
  local actual_size; actual_size="$(size_of "$CACHE_FILE.partial")"
  if [[ "$actual_size" != "$EXPECTED_SIZE" ]]; then
    err "Download size mismatch: got $actual_size bytes, expected $EXPECTED_SIZE."
    err "Leaving partial file in place for inspection: $CACHE_FILE.partial"
    return 1
  fi

  local actual_sha; actual_sha="$(sha256_of "$CACHE_FILE.partial")"
  if [[ "$actual_sha" != "$EXPECTED_SHA" ]]; then
    err "SHA256 mismatch:"
    err "  got:    $actual_sha"
    err "  expect: $EXPECTED_SHA"
    err "Leaving partial file in place for inspection: $CACHE_FILE.partial"
    return 1
  fi

  mv "$CACHE_FILE.partial" "$CACHE_FILE"
  ok "Cache populated: $CACHE_FILE ($actual_size bytes, sha matches)"
}

stage_to_xcode() {
  # Verify cache before staging.
  local cache_status; cache_status="$(verify_file "$CACHE_FILE")"
  if [[ "$cache_status" != "ok" ]]; then
    err "Cannot stage to Xcode: cache file is $cache_status."
    err "Run without --xcode-only to (re)download into the cache first."
    return 1
  fi

  # If the Xcode-bundle file already exists and is valid, skip the copy.
  if [[ -f "$XCODE_FILE" && "$FORCE" -eq 0 ]]; then
    local xcode_status; xcode_status="$(verify_file "$XCODE_FILE")"
    if [[ "$xcode_status" == "ok" ]]; then
      ok "Xcode-bundle copy already valid: $XCODE_FILE"
      return 0
    else
      warn "Existing Xcode-bundle copy is invalid ($xcode_status). Replacing."
      rm -f "$XCODE_FILE"
    fi
  fi

  mkdir -p "$XCODE_DIR"
  log "Copying $CACHE_FILE → $XCODE_FILE"
  cp "$CACHE_FILE" "$XCODE_FILE.partial"
  mv "$XCODE_FILE.partial" "$XCODE_FILE"

  local final_status; final_status="$(verify_file "$XCODE_FILE")"
  if [[ "$final_status" != "ok" ]]; then
    err "Post-copy verification failed: $final_status"
    return 1
  fi
  ok "Xcode-bundle staged: $XCODE_FILE"
}

case "$MODE" in
  cache-only)
    download_to_cache
    ;;
  xcode-only)
    stage_to_xcode
    ;;
  all)
    download_to_cache
    stage_to_xcode
    ;;
esac

ok ""
ok "Done. Next steps:"
ok "  • Open apps/app/ios/App/App.xcodeproj in Xcode and confirm"
ok "    agent/models/first-light.gguf is in the App target's Copy Bundle Resources."
ok "    If not, run: node $SCRIPT_DIR/stage-into-xcode.mjs"
ok "  • For App Store builds, do NOT bundle: see ./FIRST_LAUNCH_DOWNLOAD.md"
