#!/usr/bin/env bash
set -euo pipefail

read_version_from_manifest() {
  local manifest="$1"
  [[ -f "$manifest" ]] || return 1

  node -e '
    const fs = require("node:fs");
    const pkg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (typeof pkg.version === "string") {
      process.stdout.write(pkg.version);
    }
  ' "$manifest"
}

append_versioned_package() {
  local package_name="$1"
  shift

  local manifest version
  for manifest in "$@"; do
    if version="$(read_version_from_manifest "$manifest" 2>/dev/null)" && [[ -n "$version" ]]; then
      packages+=("${package_name}@${version}")
      return 0
    fi
  done

  packages+=("$package_name")
}

packages=(
  react
  react-dom
  vite
  electrobun
  @types/react
  @types/react-dom
  @types/three
  tailwindcss
  three
  clsx
  class-variance-authority
  tailwind-merge
  sonner
  @radix-ui/react-checkbox
  @radix-ui/react-dialog
  @radix-ui/react-dropdown-menu
  @radix-ui/react-label
  @radix-ui/react-popover
  @radix-ui/react-select
  @radix-ui/react-separator
  @radix-ui/react-slider
  @radix-ui/react-slot
  @radix-ui/react-switch
  @radix-ui/react-tabs
  @radix-ui/react-tooltip
  @capacitor/core
  @capacitor/haptics
  @capacitor/keyboard
  @capacitor/preferences
  @xterm/xterm
  @xterm/addon-fit
)

# Published-only CI rewrites the workspace graph before install, which can leave
# pack/build-time packages absent from root node_modules even though app-core
# still imports/bundles them during release checks.
append_versioned_package \
  "@elizaos/ui" \
  "eliza/packages/ui/package.json" \
  ".eliza.ci-disabled/packages/ui/package.json"
append_versioned_package \
  "@elizaos/plugin-agent-orchestrator" \
  "eliza/plugins/plugin-agent-orchestrator/package.json" \
  ".eliza.ci-disabled/plugins/plugin-agent-orchestrator/package.json"

for attempt in 1 2 3; do
  if bun add --no-save --dev --ignore-scripts "${packages[@]}"; then
    exit 0
  fi

  if [[ "$attempt" -eq 3 ]]; then
    echo "Published-workspace fallback dependency install failed after ${attempt} attempts" >&2
    exit 1
  fi

  echo "Published-workspace fallback dependency install failed on attempt ${attempt}; retrying in 15 seconds"
  sleep 15
done
