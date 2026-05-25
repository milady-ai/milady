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
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs as parseNodeArgs } from "node:util";
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
const knownWrapperOptions = new Set([
  "help",
  "profile",
  "profiles",
  "packages",
  "local",
  "all",
  "non-interactive",
  "yes",
]);
const PROFILE_VALUE_OPTIONS = ["profile", "profiles"];
const PROFILE_FLAG_OPTIONS = [
  ["packages", "packages"],
  ["local", "local"],
  ["all", "all"],
];

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

function splitBunInstallArgs(argv) {
  const marker = argv.indexOf("--");
  if (marker === -1) {
    return { wrapperArgs: argv, trailingBunArgs: [] };
  }
  return {
    wrapperArgs: argv.slice(0, marker),
    trailingBunArgs: argv.slice(marker + 1),
  };
}

function knownArgumentIndexes(tokens) {
  const indexes = new Set();
  for (const token of tokens) {
    if (token.kind !== "option" || !knownWrapperOptions.has(token.name)) {
      continue;
    }
    indexes.add(token.index);
    if (token.value !== undefined && !token.inlineValue) {
      indexes.add(token.index + 1);
    }
  }
  return indexes;
}

function collectProfileValues(values) {
  const profileValues = PROFILE_VALUE_OPTIONS.flatMap((option) =>
    (values[option] ?? []).flatMap((value) => parseInstallProfileList(value)),
  );
  const flagValues = PROFILE_FLAG_OPTIONS.filter(
    ([option]) => values[option],
  ).map(([, profile]) => profile);

  return [...profileValues, ...flagValues];
}

export function parseArgs(argv) {
  const { wrapperArgs, trailingBunArgs } = splitBunInstallArgs(argv);
  const parsed = parseNodeArgs({
    args: wrapperArgs,
    allowPositionals: true,
    strict: false,
    tokens: true,
    options: {
      help: { type: "boolean", short: "h" },
      profile: { type: "string", multiple: true },
      profiles: { type: "string", multiple: true },
      packages: { type: "boolean" },
      local: { type: "boolean" },
      all: { type: "boolean" },
      "non-interactive": { type: "boolean" },
      yes: { type: "boolean" },
    },
  });
  const consumed = knownArgumentIndexes(parsed.tokens);
  const bunInstallArgs = wrapperArgs.filter(
    (_arg, index) => !consumed.has(index),
  );

  return {
    help: Boolean(parsed.values.help),
    profiles: collectProfileValues(parsed.values),
    bunInstallArgs: [...bunInstallArgs, ...trailingBunArgs],
    interactive: !parsed.values["non-interactive"] && !parsed.values.yes,
  };
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

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main()
    .then((status) => {
      process.exit(status);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
