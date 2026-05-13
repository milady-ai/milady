#!/usr/bin/env node
/**
 * Bridge patch — strip `--full-auto` from coding-agent-adapters' Codex
 * autonomous preset. Codex CLI 0.128.0 removed `--full-auto` as a top-level
 * flag (it now only exists under the `exec` subcommand), so the spawn
 * `codex --full-auto` exits immediately with exit code 2 and the parent's
 * coding sub-agent flow appears to silently never start.
 *
 * Removing the flag lets codex launch its interactive TUI normally; the
 * autonomous semantics (`approval_policy = "never"`,
 * `sandbox_mode = "workspace-write"`) are already covered by the workspace
 * `.codex/config.json` the same preset writes, plus the user's
 * `~/.codex/config.toml`. The PTY worker's auto-response rules cover any
 * remaining trust/approval prompts.
 *
 * Pinned to coding-agent-adapters@0.16.3 — refuses to apply to other
 * versions because the patch context lines may shift.
 *
 * Patches BOTH index.js (ESM) and index.cjs (CJS) in the project's
 * node_modules copy. Idempotent — re-running after the patch is already
 * applied is a no-op.
 *
 * Remove this script once the upstream package drops `--full-auto` itself
 * (or codex re-introduces it as a top-level flag — whichever comes first).
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PINNED_VERSION = "0.16.3";
const OLD = `      cliFlags.push("--full-auto");`;
const NEW = `      // milady patch: codex 0.128 dropped top-level --full-auto;\n      // autonomous semantics come from .codex/config.json + ~/.codex/config.toml.\n      // See scripts/patch-coding-agent-adapters-codex-full-auto.mjs.`;

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

  for (const root of [repoRoot, path.join(repoRoot, "eliza")]) {
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
  if (src.includes("milady patch: codex 0.128 dropped top-level --full-auto"))
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

  const tag = "[patch-coding-agent-adapters-codex-full-auto]";
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
