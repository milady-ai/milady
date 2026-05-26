#!/usr/bin/env node
/**
 * Local-dev mobile first-run screenshot walkthrough.
 *
 * This script is the report scaffolding for a computer-use-driven walkthrough
 * of the iOS simulator or Android emulator. The actual screen drives happen
 * INSIDE the Claude Code session via mcp__computer-use__* tools — this script
 * cannot invoke MCP tools on its own.
 *
 * Operator workflow (in a Claude Code session with computer-use MCP):
 *   1. Boot the sim/emulator (scripts/qa/ios-sim-smoke.sh handles the boot+launch).
 *   2. Run this script with --init to scaffold the per-surface report directory
 *      and the M1–M5 checklist (see docs/QA-first-run.md, Mobile section).
 *   3. At each step, call `mcp__computer-use__screenshot` and save the PNG into
 *      reports/qa/<date>/mobile/<surface>/<step>.png using the filenames listed
 *      in the generated CHECKLIST.md.
 *   4. Run this script with --finalize to validate the directory and emit
 *      reports/qa/<date>/mobile/<surface>/SUMMARY.md with sizes and sha256s.
 *
 * Usage:
 *   node scripts/qa/mobile-screenshot-walkthrough.mjs --init [--surface ios|android]
 *   node scripts/qa/mobile-screenshot-walkthrough.mjs --finalize [--surface ios|android]
 *
 * Exit codes:
 *   0 — success, or partial capture during --finalize (local dev is allowed to
 *       be incomplete; we only fail hard on usage / IO errors).
 *   non-zero — hard error (unknown flag, invalid surface, IO failure, or a
 *       --finalize run against a directory that has neither captures nor the
 *       expected scaffold).
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..", "..");

const SURFACES = new Set(["ios", "android"]);

// The five mobile steps from docs/QA-first-run.md. Each one becomes a row in
// the generated CHECKLIST.md and an expected screenshot filename for --finalize.
const STEPS = [
  {
    id: "M1",
    file: "M1-cold-launch.png",
    title: "Cold launch — BootstrapStep renders",
    notes:
      "iOS: open apps/app/ios/App.xcworkspace, run on iPhone 15 sim. Android: `npx cap run android`.",
  },
  {
    id: "M2",
    file: "M2-bootstrap-step.png",
    title: "BootstrapStep visible after boot",
    notes: "Confirm Local vs Cloud choice is rendered before any tap.",
  },
  {
    id: "M3",
    file: "M3-pre-seed.png",
    title: "Android pre-seed (or iOS equivalent state)",
    notes:
      "See packages/ui/src/first-run/mobile-runtime-mode.ts. Android pre-seeds a local agent before first-run target selection.",
  },
  {
    id: "M4",
    file: "M4-deep-link-provider.png",
    title: "Deep link entry — milady://first-run/runtime/local",
    notes:
      "Trigger the deep link from the sim/emu shell, then screenshot the local first-run target.",
  },
  {
    id: "M5",
    file: "M5-permission-prompt.png",
    title: "Native permission prompt (notifications / file access)",
    notes:
      "Playwright cannot reach native dialogs — this is the reason computer-use MCP is required.",
  },
];

function parseArgs(argv) {
  const out = { flags: new Set(), values: {} };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }
    const body = arg.slice(2);
    const eq = body.indexOf("=");
    if (eq >= 0) {
      out.values[body.slice(0, eq)] = body.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out.values[body] = next;
        i++;
      } else {
        out.flags.add(body);
      }
    }
  }
  return out;
}

function today() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function reportDir(surface) {
  return join(REPO_ROOT, "reports", "qa", today(), "mobile", surface);
}

function writeChecklist(surface, dir) {
  const lines = [];
  lines.push(`# Mobile first-run screenshot checklist — ${surface}`);
  lines.push("");
  lines.push(`Date: ${today()}`);
  lines.push(`Surface: ${surface}`);
  lines.push("");
  lines.push(
    "Source: docs/QA-first-run.md (Mobile section). Drive each step with the computer-use MCP from within a Claude Code session; this script only scaffolds and validates the report directory.",
  );
  lines.push("");
  lines.push("| Step | Status | Expected screenshot | Title | Notes |");
  lines.push("|------|--------|---------------------|-------|-------|");
  for (const step of STEPS) {
    lines.push(
      `| ${step.id} | [ ] | \`${step.file}\` | ${step.title} | ${step.notes} |`,
    );
  }
  lines.push("");
  lines.push("## Capture commands (operator)");
  lines.push("");
  lines.push(
    "Each PNG must be saved to this directory with the filename listed above. Example MCP call:",
  );
  lines.push("");
  lines.push("```");
  lines.push("mcp__computer-use__screenshot  →  save bytes to");
  lines.push(`  ${dir}/M1-cold-launch.png`);
  lines.push("```");
  lines.push("");
  lines.push("When done, run:");
  lines.push("");
  lines.push("```");
  lines.push(
    `node scripts/qa/mobile-screenshot-walkthrough.mjs --finalize --surface ${surface}`,
  );
  lines.push("```");
  lines.push("");
  writeFileSync(join(dir, "CHECKLIST.md"), lines.join("\n"));
}

function init(surface) {
  const dir = reportDir(surface);
  mkdirSync(dir, { recursive: true });
  writeChecklist(surface, dir);
  process.stdout.write(
    `Scaffolded ${surface} mobile walkthrough at:\n  ${dir}\n`,
  );
  process.stdout.write(`Checklist: ${join(dir, "CHECKLIST.md")}\n`);
  process.stdout.write(
    "Save screenshots into that directory using the filenames listed in CHECKLIST.md.\n",
  );
  for (const step of STEPS) {
    process.stdout.write(`  ${step.id}: ${join(dir, step.file)}\n`);
  }
}

function sha256Of(path) {
  const buf = readFileSync(path);
  return createHash("sha256").update(buf).digest("hex");
}

function finalize(surface) {
  const dir = reportDir(surface);
  if (!existsSync(dir)) {
    process.stderr.write(
      `No report directory found at ${dir}. Run --init first.\n`,
    );
    process.exit(2);
  }

  const present = [];
  const missing = [];
  for (const step of STEPS) {
    const p = join(dir, step.file);
    if (existsSync(p)) {
      const s = statSync(p);
      present.push({ step, path: p, size: s.size, sha256: sha256Of(p) });
    } else {
      missing.push(step);
    }
  }

  const lines = [];
  lines.push(`# Mobile first-run screenshot summary — ${surface}`);
  lines.push("");
  lines.push(`Date: ${today()}`);
  lines.push(`Surface: ${surface}`);
  lines.push(`Captured: ${present.length}/${STEPS.length}`);
  lines.push("");
  lines.push(
    "| Step | Expected file | Present | Size (bytes) | sha256 | Notes |",
  );
  lines.push(
    "|------|---------------|---------|--------------|--------|-------|",
  );
  for (const step of STEPS) {
    const hit = present.find((p) => p.step.id === step.id);
    if (hit) {
      lines.push(
        `| ${step.id} | \`${step.file}\` | yes | ${hit.size} | \`${hit.sha256}\` | ${step.title} |`,
      );
    } else {
      lines.push(
        `| ${step.id} | \`${step.file}\` | no  | — | — | ${step.title} |`,
      );
    }
  }

  // Surface any unexpected extras in the directory so operators notice typos.
  const extras = [];
  try {
    const expected = new Set(
      STEPS.map((s) => s.file).concat(["CHECKLIST.md", "SUMMARY.md"]),
    );
    for (const entry of readdirSync(dir)) {
      if (!expected.has(entry)) extras.push(entry);
    }
  } catch {
    // directory was just verified to exist; ignore
  }
  if (extras.length > 0) {
    lines.push("");
    lines.push("## Unexpected files");
    lines.push("");
    for (const e of extras) lines.push(`- \`${e}\``);
  }

  lines.push("");
  writeFileSync(join(dir, "SUMMARY.md"), lines.join("\n"));

  if (present.length === 0) {
    const missingIds = missing.map((s) => s.id).join(", ");
    process.stdout.write(`INCOMPLETE: missing all (${missingIds})\n`);
    // Partial / empty is OK in local dev — exit 0 as long as the scaffold exists.
    return;
  }
  if (missing.length === 0) {
    process.stdout.write(
      `PASS: ${present.length}/${STEPS.length} steps captured\n`,
    );
    return;
  }
  process.stdout.write(
    `INCOMPLETE: missing steps ${missing.map((s) => s.id).join(", ")} (${present.length}/${STEPS.length} captured)\n`,
  );
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(2);
  }

  const surface = args.values.surface ?? "ios";
  if (!SURFACES.has(surface)) {
    process.stderr.write(
      `Invalid --surface: ${surface}. Expected one of: ${[...SURFACES].join(", ")}\n`,
    );
    process.exit(2);
  }

  const wantsInit = args.flags.has("init");
  const wantsFinalize = args.flags.has("finalize");
  if (wantsInit === wantsFinalize) {
    process.stderr.write("Specify exactly one of --init or --finalize.\n");
    process.exit(2);
  }

  if (wantsInit) init(surface);
  else finalize(surface);
}

main();
