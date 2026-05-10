#!/usr/bin/env bash
set -euo pipefail

ELIZAOS_PACKAGE_SPECIFIER="${MILADY_ELIZAOS_VERSION:-${ELIZAOS_VERSION:-${MILADY_ELIZAOS_DIST_TAG:-${ELIZAOS_DIST_TAG:-${MILADY_ELIZAOS_NPM_TAG:-${ELIZAOS_NPM_TAG:-alpha}}}}}}"

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

  if [[ "$package_name" == @elizaos/* ]]; then
    packages+=("${package_name}@${ELIZAOS_PACKAGE_SPECIFIER}")
    return 0
  fi

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

ensure_eliza_submodule_manifest() {
  local manifest="$1"
  local submodule_path="$2"

  [[ -f "$manifest" ]] && return 0
  if [[ "${MILADY_SKIP_LOCAL_UPSTREAMS:-}" == "1" || "${ELIZA_SKIP_LOCAL_UPSTREAMS:-}" == "1" ]]; then
    echo "::notice::Using published package metadata for eliza/$submodule_path; local upstreams are disabled"
    return 0
  fi
  [[ -d eliza ]] || return 0
  command -v git >/dev/null 2>&1 || return 0

  if ! git -C eliza submodule update --init --depth=1 "$submodule_path" >/dev/null; then
    echo "::warning::Could not initialize eliza/$submodule_path before fallback dependency install"
    return 0
  fi

  if [[ ! -f "$manifest" ]]; then
    echo "::warning::Expected fallback dependency manifest is still missing: $manifest"
  fi
}

# Append every third-party dependency from a manifest's `dependencies` section,
# preserving the manifest's pinned spec. Used to keep package builds (e.g.
# eliza/packages/core) functional after disable-local-eliza-workspace
# drops them from the root workspace graph: their transitive third-party deps
# are no longer installed at root, but the build still bundles them.
#
# Skips any spec that starts with `workspace:` or `file:` since those only
# resolve in-workspace.
append_third_party_dependencies_from_manifest() {
  local manifest="$1"
  [[ -f "$manifest" ]] || return 0

  local entries
  entries="$(node -e '
    const fs = require("node:fs");
    const pkg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const deps = pkg.dependencies ?? {};
    for (const [name, spec] of Object.entries(deps)) {
      if (typeof spec !== "string" || spec.length === 0) continue;
      if (spec.startsWith("workspace:") || spec.startsWith("file:")) continue;
      process.stdout.write(name + "\t" + spec + "\n");
    }
  ' "$manifest")"

  while IFS=$'\t' read -r name spec; do
    [[ -z "$name" ]] && continue
    packages+=("${name}@${spec}")
  done <<< "$entries"
}

# Delegates manifest-scoped node_modules linking to a single Node process.
#
# The previous bash version iterated per package and on Windows spawned
# `cygpath` + `cmd.exe /C "rmdir"` + `cmd.exe /C "mklink /J"` per entry across
# multiple manifest passes. Hundreds of cygwin forks under load triggered
# `child_copy: cygheap read copy failed, ... Win32 error 299` and crashed bash
# mid-script, surfacing as a cancelled `website-blocker-startup-smoke` run.
# Doing the same work in one Node process eliminates the fork pressure and
# uses `fs.symlinkSync(..., "junction")` instead of cmd.exe on Windows.
#
# Bun can keep installed packages only in node_modules/.bun on every runner
# OS, so the helper also scans that store and links the highest-version copy
# of each package. With link_all_store_packages=1 it links every store package;
# otherwise it only links those declared in the manifest. The grep for
# "$package_name" against bun_store_entries is preserved inside the helper.
symlink_installed_packages_into_manifest_node_modules() {
  local manifest="$1"
  local link_all_store_packages="${2:-0}"
  [[ -f "$manifest" ]] || return 0
  node scripts/lib/symlink-store-packages.mjs "$manifest" "$link_all_store_packages"
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
  @xyflow/react
  cron-parser
  undici
  playwright-core
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

# Published @elizaos/agent eagerly imports static runtime plugins during live
# release validation. Keep those published plugins available when the root
# workspace graph has been rewritten away.
ensure_eliza_submodule_manifest \
  "eliza/plugins/plugin-agent-skills/package.json" \
  "plugins/plugin-agent-skills"
append_versioned_package \
  "@elizaos/plugin-agent-skills" \
  "eliza/plugins/plugin-agent-skills/package.json" \
  ".eliza.ci-disabled/plugins/plugin-agent-skills/package.json"
ensure_eliza_submodule_manifest \
  "eliza/plugins/plugin-local-embedding/package.json" \
  "plugins/plugin-local-embedding"
append_versioned_package \
  "@elizaos/plugin-local-embedding" \
  "eliza/plugins/plugin-local-embedding/package.json" \
  ".eliza.ci-disabled/plugins/plugin-local-embedding/package.json"
ensure_eliza_submodule_manifest \
  "eliza/plugins/plugin-pdf/package.json" \
  "plugins/plugin-pdf"
append_versioned_package \
  "@elizaos/plugin-pdf" \
  "eliza/plugins/plugin-pdf/package.json" \
  ".eliza.ci-disabled/plugins/plugin-pdf/package.json"
ensure_eliza_submodule_manifest \
  "eliza/plugins/plugin-sql/package.json" \
  "plugins/plugin-sql"
append_versioned_package \
  "@elizaos/plugin-sql" \
  "eliza/plugins/plugin-sql/package.json" \
  ".eliza.ci-disabled/plugins/plugin-sql/package.json"

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

# Unit coverage imports agent source through app workspaces after the local
# workspace graph is restored. Install the agent's third-party deps explicitly
# so transitive ESM imports such as viem/accounts and puppeteer-core do not rely
# on incidental root hoisting in published-only CI.
append_third_party_dependencies_from_manifest \
  "eliza/packages/agent/package.json"
append_third_party_dependencies_from_manifest \
  ".eliza.ci-disabled/packages/agent/package.json"

# eliza/packages/core (@elizaos/core) is rebuilt from source in the
# cloud-image and snap pipelines so the local agent-orchestrator override is
# included. After disable-local-eliza-workspace removes the package from the
# root workspace, its third-party dependencies (handlebars, dedent, @noble/*,
# @ai-sdk/*, etc.) are no longer installed at root, and the bundle fails with
# "Could not resolve: <pkg>. Maybe you need to bun install?".
append_third_party_dependencies_from_manifest \
  "eliza/packages/core/package.json"
# Fallback path used after disable-local-eliza-workspace renames the dir.
append_third_party_dependencies_from_manifest \
  ".eliza.ci-disabled/packages/core/package.json"

# eliza/packages/app-core is rebuilt from source in the cloud-image and
# Docker CI Smoke pipelines (Vite bundle). Its third-party deps — e.g.
# @xyflow/react, cron-parser, radix-ui, recharts — are dropped from the
# root install by disable-local-eliza-workspace, so the bundler fails with
# "Rolldown failed to resolve import <pkg>" when Vite walks its source.
append_third_party_dependencies_from_manifest \
  "eliza/packages/app-core/package.json"
append_third_party_dependencies_from_manifest \
  ".eliza.ci-disabled/packages/app-core/package.json"

# The release validation cloud live suite imports local plugin provider source
# before package builds have materialized plugin dist. Keep provider source
# dependencies available after the workspace graph is disabled; otherwise
# plugin-anthropic fails at import time on jsonrepair.
ensure_eliza_submodule_manifest \
  "eliza/plugins/plugin-anthropic/package.json" \
  "plugins/plugin-anthropic"
append_third_party_dependencies_from_manifest \
  "eliza/plugins/plugin-anthropic/package.json"
append_third_party_dependencies_from_manifest \
  ".eliza.ci-disabled/plugins/plugin-anthropic/package.json"
append_dependency_spec_package \
  "jsonrepair" \
  "eliza/plugins/plugin-anthropic/package.json" \
  ".eliza.ci-disabled/plugins/plugin-anthropic/package.json"

# @elizaos/core's declaration build expects the explicit `bun-types` ambient
# library named in tsconfig, plus the @types/bun package used by the source
# workspace. Both disappear when the local workspace is disabled.
append_dependency_spec_package \
  "bun-types" \
  "eliza/package.json" \
  ".eliza.ci-disabled/package.json" \
  "apps/app/package.json"
append_dependency_spec_package \
  "@types/bun" \
  "eliza/packages/core/package.json" \
  ".eliza.ci-disabled/packages/core/package.json"
append_dependency_spec_package \
  "@types/node" \
  "eliza/package.json" \
  ".eliza.ci-disabled/package.json" \
  "eliza/packages/core/package.json" \
  ".eliza.ci-disabled/packages/core/package.json" \
  "package.json"
append_dependency_spec_package \
  "@types/fast-redact" \
  "eliza/packages/core/package.json" \
  ".eliza.ci-disabled/packages/core/package.json"
append_dependency_spec_package \
  "@types/markdown-it" \
  "eliza/packages/core/package.json" \
  ".eliza.ci-disabled/packages/core/package.json"

for attempt in 1 2 3; do
  if bun add --no-save --dev --ignore-scripts "${packages[@]}"; then
    symlink_installed_packages_into_manifest_node_modules \
      "eliza/packages/core/package.json" \
      1
    symlink_installed_packages_into_manifest_node_modules \
      ".eliza.ci-disabled/packages/core/package.json" \
      1
    symlink_installed_packages_into_manifest_node_modules \
      "eliza/package.json"
    symlink_installed_packages_into_manifest_node_modules \
      ".eliza.ci-disabled/package.json"
    symlink_installed_packages_into_manifest_node_modules \
      "eliza/packages/app-core/package.json" \
      1
    symlink_installed_packages_into_manifest_node_modules \
      ".eliza.ci-disabled/packages/app-core/package.json" \
      1
    symlink_installed_packages_into_manifest_node_modules \
      "eliza/packages/agent/package.json" \
      1
    symlink_installed_packages_into_manifest_node_modules \
      ".eliza.ci-disabled/packages/agent/package.json" \
      1
    symlink_installed_packages_into_manifest_node_modules \
      "eliza/apps/app-lifeops/package.json" \
      1
    symlink_installed_packages_into_manifest_node_modules \
      "eliza/apps/app-vincent/package.json" \
      1
    symlink_installed_packages_into_manifest_node_modules \
      "eliza/plugins/plugin-anthropic/package.json" \
      1
    symlink_installed_packages_into_manifest_node_modules \
      ".eliza.ci-disabled/plugins/plugin-anthropic/package.json" \
      1

    # @types/uuid shadows uuid@13's bundled types and makes TS report that
    # v4/v5 do not exist. Remove the stale package anywhere the core build can
    # resolve it so the runtime package supplies its own declarations instead.
    for uuid_types_dir in \
      node_modules/@types/uuid \
      eliza/node_modules/@types/uuid \
      eliza/packages/core/node_modules/@types/uuid \
      .eliza.ci-disabled/node_modules/@types/uuid \
      .eliza.ci-disabled/packages/core/node_modules/@types/uuid; do
      rm -rf "$uuid_types_dir"
    done
    exit 0
  fi

  if [[ "$attempt" -eq 3 ]]; then
    echo "Published-workspace fallback dependency install failed after ${attempt} attempts" >&2
    exit 1
  fi

  echo "Published-workspace fallback dependency install failed on attempt ${attempt}; retrying in 15 seconds"
  sleep 15
done
