#!/usr/bin/env bash
set -euo pipefail

read_package_spec_from_manifest() {
  local package_name="$1"
  local manifest="$2"
  [[ -f "$manifest" ]] || return 1

  node -e '
    const fs = require("node:fs");
    const pkg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const packageName = process.argv[2];

    if (pkg.name === packageName && typeof pkg.version === "string") {
      process.stdout.write(pkg.version);
      process.exit(0);
    }

    const dependencyFields = [
      "dependencies",
      "devDependencies",
      "peerDependencies",
      "optionalDependencies",
    ];

    for (const field of dependencyFields) {
      const spec = pkg[field]?.[packageName];
      if (typeof spec === "string") {
        process.stdout.write(spec);
        process.exit(0);
      }
    }
  ' "$manifest" "$package_name"
}

# Reads the pinned spec for `dep_name` from a manifest's dependencies /
# devDependencies / peerDependencies. Used when the version we want is NOT
# the manifest's own `version` field (e.g. viem is a transitive third-party
# dep declared in eliza/packages/agent; reading the manifest's own version
# yields @elizaos's alpha version and produces a non-existent specifier like
# `viem@2.0.0-alpha.177`).
read_dependency_spec_from_manifest() {
  local manifest="$1"
  local dep_name="$2"
  [[ -f "$manifest" ]] || return 1

  node -e '
    const fs = require("node:fs");
    const pkg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const dep =
      pkg.dependencies?.[process.argv[2]] ??
      pkg.devDependencies?.[process.argv[2]] ??
      pkg.peerDependencies?.[process.argv[2]] ??
      pkg.optionalDependencies?.[process.argv[2]];
    if (typeof dep === "string" && dep.length > 0) {
      process.stdout.write(dep);
    }
  ' "$manifest" "$dep_name"
}

append_versioned_package() {
  local package_name="$1"
  shift

  local manifest spec
  for manifest in "$@"; do
    if spec="$(read_package_spec_from_manifest "$package_name" "$manifest" 2>/dev/null)" && [[ -n "$spec" ]]; then
      packages+=("${package_name}@${spec}")
      return 0
    fi
  done

  packages+=("$package_name")
}

# Like append_versioned_package, but reads the pinned spec for `package_name`
# from each manifest's dependencies section rather than the manifest's own
# `version` field. For transitive third-party deps (viem, pathe, etc.) that
# we want to install at whatever range the source manifest declared.
append_dependency_spec_package() {
  local package_name="$1"
  shift

  local manifest spec
  for manifest in "$@"; do
    if spec="$(read_dependency_spec_from_manifest "$manifest" "$package_name" 2>/dev/null)" && [[ -n "$spec" ]]; then
      packages+=("${package_name}@${spec}")
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
  "@elizaos/shared" \
  "eliza/packages/shared/package.json" \
  ".eliza.ci-disabled/packages/shared/package.json"
append_versioned_package \
  "@elizaos/ui" \
  "eliza/packages/ui/package.json" \
  ".eliza.ci-disabled/packages/ui/package.json"
append_versioned_package \
  "@elizaos/plugin-agent-orchestrator" \
  "eliza/plugins/plugin-agent-orchestrator/package.json" \
  ".eliza.ci-disabled/plugins/plugin-agent-orchestrator/package.json"

# coding-agent-adapters is a transitive dep of eliza/packages/agent's server.ts.
# After disable-local-eliza-workspace drops eliza/packages/agent from the
# workspace, its transitive deps don't get installed — but the Docker CI smoke
# still bundles eliza/packages/agent/src/api/server.ts via the apps/app alias,
# which fails with "Rolldown failed to resolve import coding-agent-adapters".
# Pin at the version eliza/packages/agent declares; falls back to latest if
# the manifest isn't available.
packages+=("coding-agent-adapters@0.16.3")

# viem is a transitive dep of eliza/packages/agent's cloud/cloud-wallet.ts
# (imports viem/accounts). Same pattern as coding-agent-adapters: dropped from
# the root install by disable-local-eliza-workspace but still bundled by the
# Docker CI smoke through the apps/app alias, producing "Rolldown failed to
# resolve import viem/accounts".
#
# Must read viem's pinned spec from eliza/packages/agent's `dependencies`,
# NOT the manifest's own `version` field — that field is @elizaos's alpha
# version (e.g. 2.0.0-alpha.177) and produces a non-existent `viem@...`
# specifier that fails `bun add` with ENOENT.
append_dependency_spec_package \
  "viem" \
  "eliza/packages/agent/package.json" \
  ".eliza.ci-disabled/packages/agent/package.json"

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
