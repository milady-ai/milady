#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const elizaDir = path.join(repoRoot, "eliza");
const patchPath = path.join(
  repoRoot,
  "patches",
  "eliza",
  "ci-release-contracts.patch",
);

function runGit(args, { allowFailure = false } = {}) {
  const result = spawnSync("git", ["-C", elizaDir, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (!allowFailure && result.status !== 0) {
    const stderr = result.stderr.trim();
    throw new Error(
      stderr || `git ${args.join(" ")} failed with ${result.status}`,
    );
  }

  return result;
}

function main() {
  if (!fs.existsSync(path.join(elizaDir, "package.json"))) {
    throw new Error(
      "eliza submodule is not initialized; run scripts/init-submodules.mjs first",
    );
  }
  if (!fs.existsSync(patchPath)) {
    throw new Error(
      `missing eliza CI patch file: ${path.relative(repoRoot, patchPath)}`,
    );
  }

  const alreadyApplied = runGit(
    ["apply", "--unidiff-zero", "--reverse", "--check", patchPath],
    {
      allowFailure: true,
    },
  );
  if (alreadyApplied.status === 0) {
    console.log("[apply-eliza-ci-patches] eliza CI patches already applied");
    return;
  }

  const canApply = runGit(["apply", "--unidiff-zero", "--check", patchPath], {
    allowFailure: true,
  });
  if (canApply.status !== 0) {
    const stderr = canApply.stderr.trim();
    throw new Error(`eliza CI patch no longer applies cleanly:\n${stderr}`);
  }

  runGit(["apply", "--unidiff-zero", patchPath]);
  console.log("[apply-eliza-ci-patches] applied eliza CI patches");
}

try {
  main();
} catch (error) {
  console.error(
    `[apply-eliza-ci-patches] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
