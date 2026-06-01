#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const args = process.argv.slice(2);

function flag(name, fallback = "") {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] ?? fallback;
}

function requireValue(name, value) {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function readScenarioEnv(filePath) {
  const secrets = new Map();
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Z0-9_]+)="(.*)"$/.exec(line);
    if (!match) continue;
    const value = match[2].replace(/\\n/g, "\n").replace(/\\"/g, '"');
    secrets.set(match[1], value);
  }
  return secrets;
}

function run(command, commandArgs, options = {}) {
  return execFileSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
  });
}

const repo = requireValue(
  "--repo",
  flag("--repo", process.env.GITHUB_REPOSITORY ?? ""),
);
const vault = flag("--vault", "milady-e2e");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-e2e-secrets-"));

try {
  const envFile = path.join(tempDir, "scenario.env");
  run(
    process.execPath,
    ["scripts/scenario-creds-pull.mjs", "--vault", vault, "--out", envFile],
    { stdio: "inherit" },
  );

  const secrets = readScenarioEnv(envFile);
  if (secrets.size === 0) {
    throw new Error(
      `No scenario credentials were read from 1Password vault ${vault}`,
    );
  }

  for (const [name, value] of secrets) {
    run("gh", ["secret", "set", name, "--repo", repo, "--body", value]);
    console.log(`[rotate-e2e-secrets] synced ${name}`);
  }

  console.log(
    `[rotate-e2e-secrets] synced ${secrets.size} GitHub Actions secrets`,
  );
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
