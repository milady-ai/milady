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

ensure_eliza_submodule_manifest() {
  local manifest="$1"
  local submodule_path="$2"

  [[ -f "$manifest" ]] && return 0
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
# eliza/packages/typescript) functional after disable-local-eliza-workspace
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

symlink_installed_packages_into_manifest_node_modules() {
  local manifest="$1"
  local link_all_store_packages="${2:-0}"
  [[ -f "$manifest" ]] || return 0

  local package_dir target_node_modules entries
  package_dir="$(dirname "$manifest")"
  target_node_modules="$package_dir/node_modules"
  mkdir -p "$target_node_modules"

  entries="$(node -e '
    const fs = require("node:fs");
    const pkg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const dependencyFields = ["dependencies", "devDependencies"];
    const seen = new Set();

    for (const field of dependencyFields) {
      for (const [name, spec] of Object.entries(pkg[field] ?? {})) {
        if (typeof spec !== "string" || spec.length === 0) continue;
        if (seen.has(name)) continue;
        seen.add(name);
        process.stdout.write(name + "\n");
      }
    }
  ' "$manifest")"

  link_package_into_target_node_modules() {
    local package_name="$1"
    local source_path="$2"
    local target_path="$target_node_modules/$package_name"
    [[ -e "$source_path" ]] || return 0

    mkdir -p "$(dirname "$target_path")"
    case "$(uname -s)" in
      MINGW*|MSYS*|CYGWIN*)
        if [[ -e "$target_path" || -L "$target_path" ]]; then
          if command -v cygpath >/dev/null 2>&1; then
            MSYS2_ARG_CONV_EXCL="*" cmd.exe /C "rmdir \"$(cygpath -w "$target_path")\"" >/dev/null 2>&1 || rm -rf "$target_path"
          else
            rm -rf "$target_path"
          fi
        fi
        if [[ -d "$source_path" && ! -L "$source_path" ]] && command -v cygpath >/dev/null 2>&1; then
          if MSYS2_ARG_CONV_EXCL="*" cmd.exe /C "mklink /J \"$(cygpath -w "$target_path")\" \"$(cygpath -w "$(pwd)/$source_path")\"" >/dev/null 2>&1; then
            continue
          fi
        fi
        cp -LR "$source_path" "$target_path"
        ;;
      *)
        rm -rf "$target_path"
        ln -sfn "$(pwd)/$source_path" "$target_path"
        ;;
    esac
  }

  while IFS= read -r package_name; do
    [[ -z "$package_name" ]] && continue
    link_package_into_target_node_modules "$package_name" "node_modules/$package_name"
  done <<< "$entries"

  # Bun can keep installed packages only in node_modules/.bun on every runner
  # OS. Link those store packages too so restored source workspaces resolve
  # runtime deps like @elizaos/plugin-local-embedding from their own package dir.
  local bun_store_entries
  bun_store_entries="$(node -e '
    const fs = require("node:fs");
    const path = require("node:path");
    const root = process.cwd();
    const store = path.join(root, "node_modules", ".bun");
    const packages = new Map();
    if (!fs.existsSync(store)) process.exit(0);

    function compareVersions(left, right) {
      const leftParts = String(left).split(/[^0-9]+/).filter(Boolean).map(Number);
      const rightParts = String(right).split(/[^0-9]+/).filter(Boolean).map(Number);
      const length = Math.max(leftParts.length, rightParts.length, 3);
      for (let index = 0; index < length; index += 1) {
        const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
        if (diff !== 0) return diff;
      }
      return String(left).localeCompare(String(right));
    }

    for (const entry of fs.readdirSync(store).sort()) {
      const modulesDir = path.join(store, entry, "node_modules");
      if (!fs.existsSync(modulesDir)) continue;
      for (const topLevel of fs.readdirSync(modulesDir).sort()) {
        if (topLevel.startsWith(".")) continue;
        const topLevelPath = path.join(modulesDir, topLevel);
        const packageDirs = topLevel.startsWith("@")
          ? fs.readdirSync(topLevelPath).sort().map((name) => path.join(topLevelPath, name))
          : [topLevelPath];
        for (const packageDir of packageDirs) {
          try {
            const stat = fs.lstatSync(packageDir);
            if (!stat.isDirectory() || stat.isSymbolicLink()) continue;
            const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf8"));
            if (typeof pkg.name !== "string") continue;
            const version = typeof pkg.version === "string" ? pkg.version : "0.0.0";
            const current = packages.get(pkg.name);
            if (!current || compareVersions(version, current.version) > 0) {
              packages.set(pkg.name, { version, packageDir });
            }
          } catch {}
        }
      }
    }

    for (const [name, { packageDir }] of [...packages.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      process.stdout.write(`${name}\t${path.relative(root, packageDir)}\n`);
    }
  ')"

  while IFS=$'\t' read -r package_name source_path; do
    [[ -z "$package_name" || -z "$source_path" ]] && continue
    if [[ "$link_all_store_packages" != "1" ]]; then
      grep -Fxq -- "$package_name" <<< "$entries" || continue
    fi
    [[ -e "$target_node_modules/$package_name" || -L "$target_node_modules/$package_name" ]] && continue
    link_package_into_target_node_modules "$package_name" "$source_path"
  done <<< "$bun_store_entries"
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
  "eliza/plugins/plugin-agent-skills/typescript/package.json" \
  "plugins/plugin-agent-skills"
append_versioned_package \
  "@elizaos/plugin-agent-skills" \
  "eliza/plugins/plugin-agent-skills/typescript/package.json" \
  ".eliza.ci-disabled/plugins/plugin-agent-skills/typescript/package.json"
ensure_eliza_submodule_manifest \
  "eliza/plugins/plugin-local-embedding/typescript/package.json" \
  "plugins/plugin-local-embedding"
append_versioned_package \
  "@elizaos/plugin-local-embedding" \
  "eliza/plugins/plugin-local-embedding/typescript/package.json" \
  ".eliza.ci-disabled/plugins/plugin-local-embedding/typescript/package.json"
ensure_eliza_submodule_manifest \
  "eliza/plugins/plugin-pdf/typescript/package.json" \
  "plugins/plugin-pdf"
append_versioned_package \
  "@elizaos/plugin-pdf" \
  "eliza/plugins/plugin-pdf/typescript/package.json" \
  ".eliza.ci-disabled/plugins/plugin-pdf/typescript/package.json"
ensure_eliza_submodule_manifest \
  "eliza/plugins/plugin-sql/typescript/package.json" \
  "plugins/plugin-sql"
append_versioned_package \
  "@elizaos/plugin-sql" \
  "eliza/plugins/plugin-sql/typescript/package.json" \
  ".eliza.ci-disabled/plugins/plugin-sql/typescript/package.json"

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

# eliza/packages/typescript (@elizaos/core) is rebuilt from source in the
# cloud-image and snap pipelines so the local agent-orchestrator override is
# included. After disable-local-eliza-workspace removes the package from the
# root workspace, its third-party dependencies (handlebars, dedent, @noble/*,
# @ai-sdk/*, etc.) are no longer installed at root, and the bundle fails with
# "Could not resolve: <pkg>. Maybe you need to bun install?".
append_third_party_dependencies_from_manifest \
  "eliza/packages/typescript/package.json"
# Fallback path used after disable-local-eliza-workspace renames the dir.
append_third_party_dependencies_from_manifest \
  ".eliza.ci-disabled/packages/typescript/package.json"

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
  "eliza/plugins/plugin-anthropic/typescript/package.json" \
  "plugins/plugin-anthropic"
append_third_party_dependencies_from_manifest \
  "eliza/plugins/plugin-anthropic/typescript/package.json"
append_third_party_dependencies_from_manifest \
  ".eliza.ci-disabled/plugins/plugin-anthropic/typescript/package.json"
append_dependency_spec_package \
  "jsonrepair" \
  "eliza/plugins/plugin-anthropic/typescript/package.json" \
  ".eliza.ci-disabled/plugins/plugin-anthropic/typescript/package.json"

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
  "eliza/packages/typescript/package.json" \
  ".eliza.ci-disabled/packages/typescript/package.json"
append_dependency_spec_package \
  "@types/fast-redact" \
  "eliza/packages/typescript/package.json" \
  ".eliza.ci-disabled/packages/typescript/package.json"
append_dependency_spec_package \
  "@types/markdown-it" \
  "eliza/packages/typescript/package.json" \
  ".eliza.ci-disabled/packages/typescript/package.json"

for attempt in 1 2 3; do
  if bun add --no-save --dev --ignore-scripts "${packages[@]}"; then
    symlink_installed_packages_into_manifest_node_modules \
      "eliza/packages/typescript/package.json" \
      1
    symlink_installed_packages_into_manifest_node_modules \
      ".eliza.ci-disabled/packages/typescript/package.json" \
      1
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
      "eliza/plugins/plugin-anthropic/typescript/package.json" \
      1
    symlink_installed_packages_into_manifest_node_modules \
      ".eliza.ci-disabled/plugins/plugin-anthropic/typescript/package.json" \
      1

    # @types/uuid shadows uuid@13's bundled types and makes TS report that
    # v4/v5 do not exist. Remove the stale package anywhere the core build can
    # resolve it so the runtime package supplies its own declarations instead.
    for uuid_types_dir in \
      node_modules/@types/uuid \
      eliza/node_modules/@types/uuid \
      eliza/packages/typescript/node_modules/@types/uuid \
      .eliza.ci-disabled/node_modules/@types/uuid \
      .eliza.ci-disabled/packages/typescript/node_modules/@types/uuid; do
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
