#!/usr/bin/env node

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  hasShippedSkillTree,
  REPO_ROOT,
  resolveRepoBundledSkillsAssetsDir,
  resolveShippedSkillsAssetsDir,
} from "../eliza/packages/app-core/scripts/ensure-skills.mjs";
import { resolveRepoRoot } from "./lib/repo-root.mjs";

const __filename = fileURLToPath(import.meta.url);
const DEFAULT_REPO_ROOT = resolveRepoRoot(import.meta.url);

export function listBundledSkillIds(sourceDir) {
  return readdirSync(sourceDir)
    .filter((entry) => {
      if (entry.startsWith(".")) {
        return false;
      }
      const entryPath = path.join(sourceDir, entry);
      try {
        return (
          statSync(entryPath).isDirectory() &&
          existsSync(path.join(entryPath, "SKILL.md"))
        );
      } catch {
        return false;
      }
    })
    .sort();
}

export function resolveWorkspaceDefaultSkillsSourceDir(
  repoRoot = DEFAULT_REPO_ROOT,
) {
  const repoSourceDir = path.join(
    repoRoot,
    "eliza",
    "packages",
    "skills",
    "skills",
  );
  if (hasShippedSkillTree(repoSourceDir)) {
    return resolveRepoBundledSkillsAssetsDir(repoRoot);
  }
  return resolveShippedSkillsAssetsDir();
}

export function syncWorkspaceDefaultSkills({
  repoRoot = DEFAULT_REPO_ROOT,
  sourceDir = resolveWorkspaceDefaultSkillsSourceDir(repoRoot),
  targetDir = path.join(repoRoot, "skills", ".defaults"),
} = {}) {
  if (!hasShippedSkillTree(sourceDir)) {
    throw new Error(`Bundled skills source is invalid: ${sourceDir}`);
  }

  mkdirSync(path.dirname(targetDir), { recursive: true });
  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(targetDir, { recursive: true });

  const syncedSkillIds = listBundledSkillIds(sourceDir);
  for (const skillId of syncedSkillIds) {
    cpSync(path.join(sourceDir, skillId), path.join(targetDir, skillId), {
      recursive: true,
      force: true,
    });
  }

  return {
    repoRoot,
    sourceDir,
    targetDir,
    syncedSkillIds,
  };
}

function main() {
  const result = syncWorkspaceDefaultSkills({ repoRoot: REPO_ROOT });
  console.log(
    `[sync-workspace-default-skills] Synced ${result.syncedSkillIds.length} skill(s) from ${result.sourceDir} to ${result.targetDir}`,
  );
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  main();
}
