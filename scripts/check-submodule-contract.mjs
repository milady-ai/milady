#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { resolveRepoRoot } from "./lib/repo-root.mjs";

const repoRoot = resolveRepoRoot(import.meta.url);
const gitmodulesPath = resolve(repoRoot, ".gitmodules");

if (!existsSync(gitmodulesPath)) {
  console.log(
    "[submodule-contract] package-mode/local-source repo has no tracked eliza submodule.",
  );
  process.exit(0);
}

const gitmodules = readFileSync(gitmodulesPath, "utf8");

function readGitmodulesValue(sectionName, key) {
  let inSection = false;

  for (const line of gitmodules.split(/\r?\n/)) {
    const sectionMatch = /^\[submodule "(.+)"\]$/.exec(line.trim());
    if (sectionMatch) {
      inSection = sectionMatch[1] === sectionName;
      continue;
    }

    if (!inSection) {
      continue;
    }

    const keyMatch = /^\s*([^=]+?)\s*=\s*(.+?)\s*$/.exec(line);
    if (keyMatch?.[1] === key) {
      return keyMatch[2];
    }
  }

  return null;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(
      `${label} must be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.\n` +
        "Do not point Milady's eliza source checkout at contributor forks. Land eliza changes on elizaOS/eliza develop, then update the checkout target.",
    );
  }
}

assertEqual(
  readGitmodulesValue("eliza", "url"),
  "https://github.com/elizaOS/eliza.git",
  "submodule.eliza.url",
);
assertEqual(
  readGitmodulesValue("eliza", "branch"),
  "develop",
  "submodule.eliza.branch",
);

console.log(
  "[submodule-contract] eliza submodule points at elizaOS/eliza develop.",
);
