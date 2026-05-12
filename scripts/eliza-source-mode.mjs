#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_ELIZAOS_PACKAGE_DIST_TAG,
  getElizaGitBranch,
  getElizaGitUrl,
  getElizaosPackageSpecifier,
} from "./lib/eliza-package-mode.mjs";
import { restoreLocalElizaWorkspace } from "./restore-local-eliza-workspace.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function usage() {
  console.log(`usage:
  node scripts/eliza-source-mode.mjs local [--install]
  node scripts/eliza-source-mode.mjs packages [--tag <dist-tag>] [--version <exact>] [--rename] [--install]

Modes:
  local      Restore or clone repo-local elizaOS source and link workspace packages.
  packages   Rewrite the workspace for installed @elizaos/* packages. Defaults to ${DEFAULT_ELIZAOS_PACKAGE_DIST_TAG}; use --tag beta or --tag main when those dist-tags are ready.

Environment:
  MILADY_ELIZA_SOURCE=local|packages
  MILADY_ELIZAOS_DIST_TAG=alpha|beta|main|latest|...
  MILADY_ELIZAOS_VERSION=2.0.0-beta.1
  MILADY_ELIZA_BRANCH=<branch-for-local-clone>
  MILADY_ELIZA_GIT_URL=<repo-for-local-clone>`);
}

function parseArgs(argv) {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    return { help: true };
  }

  const [mode, ...rest] = argv;
  const options = {
    mode,
    install: false,
    rename: false,
    tag: null,
    version: null,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--install") {
      options.install = true;
      continue;
    }
    if (arg === "--rename") {
      options.rename = true;
      continue;
    }
    if (arg === "--tag") {
      options.tag = rest[++index] ?? null;
      continue;
    }
    if (arg === "--version") {
      options.version = rest[++index] ?? null;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function runNode(script, args, env) {
  return run(process.execPath, [script, ...args], env);
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} exited due to signal ${signal}`));
        return;
      }
      if ((code ?? 1) !== 0) {
        reject(new Error(`${command} exited with code ${code ?? 1}`));
        return;
      }
      resolve();
    });
  });
}

async function cloneLocalElizaIfMissing(env) {
  const elizaRoot = path.join(repoRoot, "eliza");
  if (fs.existsSync(elizaRoot)) {
    return;
  }

  const gitUrl = getElizaGitUrl(env);
  const branch = getElizaGitBranch(env);
  console.log(`[eliza-source-mode] cloning ${gitUrl}#${branch} into eliza/`);
  await run(
    "git",
    ["clone", "--branch", branch, "--single-branch", gitUrl, "eliza"],
    env,
  );
}

async function runLocalMode(options) {
  const env = {
    ...process.env,
    MILADY_ELIZA_SOURCE: "local",
    MILADY_SKIP_LOCAL_UPSTREAMS: "",
    ELIZA_SKIP_LOCAL_UPSTREAMS: "",
  };

  restoreLocalElizaWorkspace(repoRoot);
  await cloneLocalElizaIfMissing(env);
  await runNode("scripts/setup-upstreams.mjs", [], env);

  if (options.install) {
    await run("bun", ["install"], env);
  }

  console.log("[eliza-source-mode] local elizaOS source mode is ready.");
}

async function runPackageMode(options) {
  const env = {
    ...process.env,
    MILADY_ELIZA_SOURCE: "packages",
    MILADY_SKIP_LOCAL_UPSTREAMS: "1",
    MILADY_DISABLE_LOCAL_UPSTREAMS: "force",
  };

  if (options.tag) {
    env.MILADY_ELIZAOS_DIST_TAG = options.tag;
  }
  if (options.version) {
    env.MILADY_ELIZAOS_VERSION = options.version;
  }
  if (options.rename) {
    env.MILADY_DISABLE_LOCAL_UPSTREAMS_RENAME = "1";
  }

  await runNode("scripts/disable-local-eliza-workspace.mjs", [], env);

  if (options.install) {
    await run("bun", ["install", "--no-frozen-lockfile"], env);
  }

  console.log(
    `[eliza-source-mode] package elizaOS mode is ready using ${getElizaosPackageSpecifier(env)}.`,
  );
  if (!options.rename && fs.existsSync(path.join(repoRoot, "eliza"))) {
    console.log(
      "[eliza-source-mode] eliza/ was left on disk in rewrite-only mode; set MILADY_SKIP_LOCAL_UPSTREAMS=1 or MILADY_ELIZA_SOURCE=packages when running package-mode commands.",
    );
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.mode) {
    usage();
    return;
  }

  if (options.mode === "local") {
    await runLocalMode(options);
    return;
  }
  if (
    ["packages", "package", "npm", "registry", "published"].includes(
      options.mode,
    )
  ) {
    await runPackageMode(options);
    return;
  }

  throw new Error(`Unsupported mode: ${options.mode}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
