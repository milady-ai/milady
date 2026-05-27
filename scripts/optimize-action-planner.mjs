#!/usr/bin/env node
/**
 * optimize-action-planner.mjs
 *
 * Kicks the native instruction-search optimizer against the
 * benchmark-derived action_planner dataset, then reports
 * before/after scores from the artifact written to
 * ~/.local/state/milady/optimized-prompts/action_planner/.
 *
 * Usage:
 *   node scripts/optimize-action-planner.mjs               # uses defaults
 *   node scripts/optimize-action-planner.mjs --optimizer prompt-evolution
 *
 * Flags forwarded to `bun run train`:
 *   --optimizer  instruction-search | prompt-evolution | bootstrap-fewshot
 *                (default: instruction-search)
 *   --dataset    override dataset path (default: datasets/action_planner_from_benchmark.jsonl)
 *   --baseline   baseline prompt file
 *
 * Prerequisites:
 *   1. Run the action benchmark (bun run test:benchmark:actions:mocked)
 *      so that action-benchmark-report/cases/*.json exists.
 *   2. Run `node scripts/benchmark-to-training-dataset.mjs` to build the JSONL.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { syncElizaEnvAliases } from "./lib/sync-eliza-env-aliases.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

syncElizaEnvAliases({ defaultNamespace: "milady" });

const DEFAULT_DATASET = join(
  REPO_ROOT,
  "eliza",
  "apps",
  "app-training",
  "datasets",
  "action_planner_from_benchmark.jsonl",
);
function resolveMiladyStateDir(env = process.env) {
  const explicit = env.ELIZA_STATE_DIR?.trim() || env.MILADY_STATE_DIR?.trim();
  if (explicit) return resolve(explicit.replace(/^~(?=$|[\\/])/, homedir()));
  const xdgStateHome = env.XDG_STATE_HOME?.trim();
  const stateHome = xdgStateHome
    ? resolve(
        xdgStateHome.startsWith("~")
          ? xdgStateHome.replace(/^~(?=$|[\\/])/, homedir())
          : isAbsolute(xdgStateHome)
            ? xdgStateHome
            : join(homedir(), xdgStateHome),
      )
    : join(homedir(), ".local", "state");
  return join(stateHome, env.ELIZA_NAMESPACE?.trim() || "milady");
}

const ARTIFACT_DIR = join(
  resolveMiladyStateDir(),
  "optimized-prompts",
  "action_planner",
);

function parseFlags(argv) {
  const out = { optimizer: "instruction-search", dataset: DEFAULT_DATASET };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--optimizer") out.optimizer = argv[++i];
    else if (arg === "--dataset") out.dataset = argv[++i];
    else if (arg === "--baseline") out.baseline = argv[++i];
    else if (arg === "--help" || arg === "-h") out.help = true;
  }
  return out;
}

function latestArtifact() {
  if (!existsSync(ARTIFACT_DIR)) return null;
  const entries = readdirSync(ARTIFACT_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const full = join(ARTIFACT_DIR, f);
      return { full, mtime: statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return entries[0]?.full ?? null;
}

function printArtifact(before, after) {
  if (!after) {
    console.log(
      `[optimize-action-planner] no artifact found under ${ARTIFACT_DIR}`,
    );
    return;
  }
  const artifact = JSON.parse(readFileSync(after, "utf-8"));
  const baseline = artifact.baselineScore ?? artifact.baseline ?? null;
  const score = artifact.score ?? null;
  console.log(`[optimize-action-planner] artifact: ${after}`);
  if (baseline != null && score != null) {
    const delta = (score - baseline).toFixed(3);
    console.log(
      `[optimize-action-planner] baseline=${Number(baseline).toFixed(3)} optimized=${Number(score).toFixed(3)} delta=${delta}`,
    );
  } else {
    console.log(
      `[optimize-action-planner] artifact missing baseline/score fields; dumping keys: ${Object.keys(
        artifact,
      ).join(", ")}`,
    );
  }
  if (before && before === after) {
    console.log(
      `[optimize-action-planner] WARNING: artifact path unchanged from before training — optimizer may not have written a new file`,
    );
  }
}

function main() {
  const flags = parseFlags(process.argv.slice(2));
  if (flags.help) {
    console.log(
      `Usage: node scripts/optimize-action-planner.mjs [--optimizer NAME] [--dataset PATH] [--baseline PATH]`,
    );
    return;
  }

  if (!existsSync(flags.dataset)) {
    console.error(
      `[optimize-action-planner] dataset missing: ${flags.dataset}\nRun: node scripts/benchmark-to-training-dataset.mjs`,
    );
    process.exit(1);
  }

  const before = latestArtifact();

  const trainArgs = [
    "run",
    "train",
    "--",
    "--backend",
    "native",
    "--optimizer",
    flags.optimizer,
    "--task",
    "action_planner",
    "--dataset",
    flags.dataset,
  ];
  if (flags.baseline) {
    trainArgs.push("--baseline", flags.baseline);
  }

  console.log(`[optimize-action-planner] bun ${trainArgs.join(" ")}\n`);
  const child = spawnSync("bun", trainArgs, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (child.status !== 0) {
    console.error(
      `[optimize-action-planner] training exited with code ${child.status}`,
    );
    process.exit(child.status ?? 1);
  }

  const after = latestArtifact();
  printArtifact(before, after);
}

main();
