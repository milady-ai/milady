#!/usr/bin/env node
/**
 * Moves the eliza checkout and every nested submodule (cloud, plugins, …) to
 * the latest commit on each entry’s remote branch from .gitmodules, then
 * prints how to commit the new gitlinks in eliza and in Milady.
 *
 * Run from anywhere inside the Milady worktree: resolves the repo root first.
 *
 * Flags:
 *   --skip-eliza-pull   Only run nested `submodule update --remote` (skip
 *                       fetch/checkout/pull of eliza itself).
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptFile = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptFile);

function findMiladyRoot() {
  let dir = resolve(scriptDir, "..");
  for (;;) {
    const gitmodules = resolve(dir, ".gitmodules");
    const elizaDir = resolve(dir, "eliza");
    if (existsSync(gitmodules) && existsSync(elizaDir)) {
      const txt = readFileSync(gitmodules, "utf8");
      if (txt.includes('[submodule "eliza"]')) {
        return dir;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        "Could not find Milady repo root (expected .gitmodules with eliza submodule and eliza/).",
      );
    }
    dir = parent;
  }
}

function readElizaBranchFromMiladyGitmodules(repoRoot) {
  try {
    const branch = execSync(
      "git config -f .gitmodules submodule.eliza.branch",
      {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
    if (branch) {
      return branch;
    }
  } catch {
    // fall through
  }
  return "develop";
}

function run(cmd, cwd) {
  execSync(cmd, { cwd, stdio: "inherit", shell: true });
}

const args = new Set(process.argv.slice(2));
const skipElizaPull = args.has("--skip-eliza-pull");

const miladyRoot = findMiladyRoot();
const elizaRoot = resolve(miladyRoot, "eliza");

if (!existsSync(resolve(elizaRoot, ".git"))) {
  console.error(
    `[update-eliza-submodules] No git metadata at ${elizaRoot}. Run: node scripts/init-submodules.mjs`,
  );
  process.exit(1);
}

const elizaBranch = readElizaBranchFromMiladyGitmodules(miladyRoot);

if (!skipElizaPull) {
  console.log(
    `[update-eliza-submodules] Syncing parent → eliza, then ${elizaBranch} @ origin…`,
  );
  run("git submodule sync eliza", miladyRoot);
  run('git submodule update --init "eliza"', miladyRoot);
  run(`git -C "${elizaRoot}" fetch origin`, miladyRoot);
  run(`git -C "${elizaRoot}" checkout ${elizaBranch}`, miladyRoot);
  run(`git -C "${elizaRoot}" pull --ff-only origin ${elizaBranch}`, miladyRoot);
} else {
  console.log(
    "[update-eliza-submodules] Skipping eliza fetch/pull (--skip-eliza-pull).",
  );
}

console.log(
  "[update-eliza-submodules] Updating nested submodules to remote branch tips (.gitmodules branch=…)…",
);
run("git submodule sync --recursive", elizaRoot);
run("git submodule update --init --recursive", elizaRoot);
run("git submodule update --remote --merge --recursive", elizaRoot);

console.log(`
[update-eliza-submodules] Done. Review:

  cd eliza && git status

If submodule paths show new commits, record them in **eliza** first:

  git add -u
  git commit -m "chore: bump nested submodule pointers"

Then point **Milady** at the new eliza commit (from Milady repo root):

  cd ..
  git add eliza
  git status
  git commit -m "chore: bump eliza submodule"

If eliza is a fork, push the eliza branch before bumping Milady’s pointer.
`);
