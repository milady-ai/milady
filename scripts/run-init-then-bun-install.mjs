#!/usr/bin/env node
/**
 * First-line installer.
 *
 * Milady defaults to published elizaOS packages, so a fresh clone can install
 * without a repo-local eliza checkout. Use `bun run eliza:local` when you
 * explicitly want to clone and link local elizaOS source.
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveInstallEnvironment } from "./lib/install-env.mjs";
import {
  buildInstallPlan,
  defaultInstallProfileIds,
  parseInstallProfileList,
  promptInstallProfiles,
} from "./lib/install-profiles.mjs";

const scriptFile = fileURLToPath(import.meta.url);
const __dirname = dirname(scriptFile);
const rootDir = resolve(__dirname, "..");

function usage() {
  console.log(`usage:
  ./install [--profile packages|local|all] [-- <bun install args>]

With no arguments in an interactive terminal, ./install opens a multi-select
profile picker. Use Space to select profiles and Enter to install.

Profiles:
  packages   Install against published @elizaos/* packages
  local      Clone or restore ./eliza and link local elizaOS source
  all        Run packages first, then local source mode`);
}

function parseArgs(argv) {
  const profiles = [];
  const bunInstallArgs = [];
  let interactive = true;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      return { help: true, profiles, bunInstallArgs, interactive };
    }
    if (arg === "--") {
      bunInstallArgs.push(...argv.slice(index + 1));
      break;
    }
    if (arg === "--profile" || arg === "--profiles") {
      profiles.push(...parseInstallProfileList(argv[++index] ?? ""));
      continue;
    }
    if (arg.startsWith("--profile=")) {
      profiles.push(...parseInstallProfileList(arg.slice("--profile=".length)));
      continue;
    }
    if (arg.startsWith("--profiles=")) {
      profiles.push(
        ...parseInstallProfileList(arg.slice("--profiles=".length)),
      );
      continue;
    }
    if (arg === "--packages") {
      profiles.push("packages");
      continue;
    }
    if (arg === "--local") {
      profiles.push("local");
      continue;
    }
    if (arg === "--all") {
      profiles.push("all");
      continue;
    }
    if (arg === "--non-interactive" || arg === "--yes") {
      interactive = false;
      continue;
    }
    bunInstallArgs.push(arg);
  }

  return { help: false, profiles, bunInstallArgs, interactive };
}

function canPrompt({ profiles, bunInstallArgs, interactive }) {
  return (
    interactive &&
    profiles.length === 0 &&
    bunInstallArgs.length === 0 &&
    process.env.CI !== "true" &&
    process.env.MILADY_NONINTERACTIVE !== "1" &&
    process.stdin.isTTY &&
    process.stdout.isTTY
  );
}

async function selectProfiles(parsed) {
  const envProfiles = parseInstallProfileList(
    process.env.MILADY_INSTALL_PROFILES ?? "",
  );
  if (parsed.profiles.length > 0) {
    return parsed.profiles;
  }
  if (envProfiles.length > 0) {
    return envProfiles;
  }
  if (canPrompt(parsed)) {
    return await promptInstallProfiles();
  }
  return defaultInstallProfileIds();
}

function runStep(step) {
  console.log(
    `[milady-install] ${step.id}: ${step.command} ${step.args.join(" ")}`,
  );
  const result = spawnSync(step.command, step.args, {
    cwd: rootDir,
    stdio: "inherit",
    env: step.env,
    shell: false,
  });

  if (result.signal) {
    console.error(`[milady-install] ${step.id} exited due to ${result.signal}`);
    return 1;
  }

  return result.status ?? 1;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    usage();
    return 0;
  }

  const profiles = await selectProfiles(parsed);
  const installEnvironment = resolveInstallEnvironment({ rootDir });
  for (const diagnostic of installEnvironment.diagnostics) {
    console.log(`[milady-install] ${diagnostic}`);
  }
  if (!installEnvironment.ok) {
    console.error(`[milady-install] ${installEnvironment.error}`);
    return 1;
  }

  const plan = buildInstallPlan(
    profiles,
    parsed.bunInstallArgs,
    installEnvironment.env,
  );
  for (const step of plan) {
    const status = runStep(step);
    if (status !== 0) {
      return status;
    }
  }

  return 0;
}

main()
  .then((status) => {
    process.exit(status);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
