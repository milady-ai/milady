#!/usr/bin/env node
/**
 * Bridge patch — strip `--tools <list>` from coding-agent-adapters' Claude
 * autonomous preset. The hardcoded list (Bash, Edit, Write, etc.) only
 * matches Claude Code's dev-tier tool registry; on the claude.ai OAuth tier
 * Milady's bot user runs under, those names are not in the registry, so
 * passing them via --tools FILTERS the model down to a tiny read-only set
 * (Read, Grep, Glob, AskUserQuestion, TodoWrite). Skipping the flag entirely
 * lets claude expose its actual default toolset (Monitor, ScheduleWakeup,
 * etc.) and --dangerously-skip-permissions still bypasses approval.
 *
 * Pinned to coding-agent-adapters@0.16.3 — refuses to apply to other
 * versions because the patch context lines may shift.
 *
 * Patches BOTH index.js (ESM) and index.cjs (CJS) in the project's
 * node_modules copy. Idempotent — re-running after the patch is already
 * applied is a no-op.
 *
 * Remove this script once the upstream package exposes a config knob to
 * disable the --tools cliFlag (or the claude.ai tier ships dev-tier tool
 * names — whichever comes first). Upstream PR adding the
 * `disableToolsFlag` config option:
 *   https://github.com/HaruHunab1320/parallax/pull/43
 * Once that PR lands and a new alpha of coding-agent-adapters is published,
 * switch Milady to set `disableToolsFlag: true` on the Claude preset
 * options and delete this script.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isLocalElizaDisabled } from "./lib/eliza-package-mode.mjs";

const PINNED_VERSION = "0.16.3";
const OLD = `    const allTools = Object.keys(CLAUDE_TOOL_CATEGORIES);\n    cliFlags.push("--tools", allTools.join(","));`;
const NEW = `    // milady patch: --tools <list> filters out tools claude.ai OAuth tier exposes\n    // (Monitor, ScheduleWakeup, etc.) because they are not in CLAUDE_TOOL_CATEGORIES.\n    // Skipping --tools entirely lets claude expose its full default toolset;\n    // --dangerously-skip-permissions still bypasses approval. See\n    // scripts/patch-coding-agent-adapters-tools-flag.mjs for context.\n    void CLAUDE_TOOL_CATEGORIES;`;

export function resolveRepoRootFromScriptUrl(scriptUrl = import.meta.url) {
  return path.resolve(path.dirname(fileURLToPath(scriptUrl)), "..");
}

function candidatePaths(repoRoot = resolveRepoRootFromScriptUrl()) {
  const distDirs = new Set();
  const addDistDir = (dir) => {
    if (dir && fs.existsSync(dir)) {
      distDirs.add(fs.realpathSync(dir));
    }
  };

  const roots = isLocalElizaDisabled()
    ? [repoRoot]
    : [repoRoot, path.join(repoRoot, "eliza")];

  for (const root of roots) {
    const requireFromRoot = createRequire(path.join(root, "package.json"));
    try {
      const entry = requireFromRoot.resolve("coding-agent-adapters");
      addDistDir(path.dirname(entry));
    } catch {
      // Package is not installed from this workspace root.
    }

    const bunCacheDir = path.join(root, "node_modules", ".bun");
    if (!fs.existsSync(bunCacheDir)) continue;
    for (const entry of fs.readdirSync(bunCacheDir)) {
      if (!entry.startsWith(`coding-agent-adapters@${PINNED_VERSION}`)) {
        continue;
      }
      addDistDir(
        path.join(
          bunCacheDir,
          entry,
          "node_modules",
          "coding-agent-adapters",
          "dist",
        ),
      );
    }
  }

  return [...distDirs].flatMap((dir) =>
    ["index.js", "index.cjs"].map((f) => ({
      file: path.join(dir, f),
      required: true,
    })),
  );
}

function patchOne({ file, required }) {
  if (!fs.existsSync(file)) return { file, status: "missing" };
  const src = fs.readFileSync(file, "utf-8");
  if (src.includes("milady patch: --tools"))
    return { file, required, status: "already-applied" };
  if (!src.includes(OLD)) {
    return { file, required, status: "marker-not-found" };
  }
  fs.writeFileSync(file, src.replace(OLD, NEW), "utf-8");
  return { file, required, status: "patched" };
}

export function main() {
  let exitCode = 0;
  const results = [];
  for (const file of candidatePaths()) {
    const r = patchOne(file);
    results.push(r);
    if (r.status === "marker-not-found") {
      exitCode = 1;
    }
  }

  const tag = "[patch-coding-agent-adapters-tools-flag]";
  if (results.length === 0) {
    console.log(`${tag} coding-agent-adapters not installed; skipping.`);
    return 0;
  }
  for (const r of results) {
    console.log(`${tag} ${r.status}: ${r.file}`);
  }

  const requiredTargetReady = results.some(
    (r) =>
      r.required && (r.status === "patched" || r.status === "already-applied"),
  );
  if (!requiredTargetReady) {
    exitCode = 1;
    console.error(`${tag} aborting — no project-installed target was patched.`);
  }

  if (exitCode !== 0) {
    console.error(
      `${tag} aborting — context lines have shifted; review the script.`,
    );
  }
  return exitCode;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exit(main());
}
