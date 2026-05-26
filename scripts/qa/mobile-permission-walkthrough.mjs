#!/usr/bin/env node
/**
 * Local-dev mobile permission cascade walkthrough.
 *
 * Drives an iOS sim or Android emulator through the lazy-permission flow
 * documented in eliza/packages/ui/src/platform/desktop-permissions-client.ts
 * (renderer-side) and eliza/packages/ui/src/platform/mobile-permissions-client.ts
 * (native bridge). On mobile, permissions are requested lazily — the user does
 * not see all prompts up front. Each cascade step (P1-P6) appears the first
 * time the app touches the relevant capability.
 *
 * This script is the report scaffolding for a computer-use-driven walkthrough.
 * The actual screen drives happen INSIDE the Claude Code session via
 * mcp__computer-use__* tools — this script cannot invoke MCP tools on its own.
 *
 * Operator workflow (in a Claude Code session with computer-use MCP):
 *   1. Boot the sim/emulator + Milady (use scripts/qa/ios-sim-smoke.sh or
 *      scripts/qa/android-emu-smoke.sh for the boot+launch).
 *   2. Run this script with --init to scaffold the per-surface report directory
 *      and the P1-P6 checklist.
 *   3. Drive the app to trigger each permission prompt in sequence (P1-P6).
 *   4. For each prompt, screenshot with mcp__computer-use__screenshot, then
 *      grant via mcp__computer-use__left_click or skip (and note which).
 *   5. Save PNGs to reports/qa/<date>/mobile-permissions/<surface>/<id>.png
 *      using the filenames listed in the generated CHECKLIST.md.
 *   6. Run this script with --finalize to validate the directory and emit
 *      SUMMARY.md with sizes + sha256s per prompt.
 *
 * Permission cascade documented:
 *   P1 — Notifications
 *   P2 — Photos / Files
 *   P3 — Camera
 *   P4 — Microphone
 *   P5 — Location (when in use)
 *   P6 — Bluetooth / Local Network (Android only)
 *
 * Usage:
 *   node scripts/qa/mobile-permission-walkthrough.mjs --init [--surface ios|android]
 *   node scripts/qa/mobile-permission-walkthrough.mjs --finalize [--surface ios|android]
 *
 * Exit codes:
 *   0 — success, or partial capture during --finalize (local dev is allowed to
 *       be incomplete; we only fail hard on usage / IO errors).
 *   non-zero — hard error (unknown flag, invalid surface, IO failure, or a
 *       --finalize run against a directory that does not exist).
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

/**
 * Permission cascade prompts. P1-P5 are universal; P6 is Android-only
 * (iOS surfaces Bluetooth/Local Network differently and the OS dialog is not
 * a distinct gateable prompt for our use cases).
 *
 * Each entry becomes a row in the generated CHECKLIST.md and an expected
 * screenshot filename for --finalize.
 */
const PROMPTS = [
  {
    id: "P1",
    file: "P1-notifications.png",
    title: "Notifications",
    trigger:
      "Drive the app to a point where it schedules a notification (e.g. open Reminders / push-notification setup flow).",
    notes:
      'iOS: "Milady" Would Like to Send You Notifications. Android: stock POST_NOTIFICATIONS prompt (API 33+).',
    androidOnly: false,
  },
  {
    id: "P2",
    file: "P2-photos.png",
    title: "Photos / Files",
    trigger:
      "Trigger an attach-photo / pick-file action (e.g. avatar picker, media generation upload).",
    notes:
      'iOS: photo library access prompt with "Limited Access" / "Allow Full Access". Android: READ_MEDIA_IMAGES / Storage Access Framework picker (no classic dialog on API 33+; capture the picker chrome).',
    androidOnly: false,
  },
  {
    id: "P3",
    file: "P3-camera.png",
    title: "Camera",
    trigger:
      "Open a camera-using surface (camsnap skill, profile photo capture, scan barcode).",
    notes:
      'iOS: "Milady" Would Like to Access the Camera. Android: stock CAMERA prompt.',
    androidOnly: false,
  },
  {
    id: "P4",
    file: "P4-microphone.png",
    title: "Microphone",
    trigger: "Trigger voice input (TTS demo, dictation, voice mode toggle).",
    notes:
      'iOS: "Milady" Would Like to Access the Microphone. Android: stock RECORD_AUDIO prompt.',
    androidOnly: false,
  },
  {
    id: "P5",
    file: "P5-location.png",
    title: "Location (when in use)",
    trigger:
      'Trigger a location-dependent action (weather skill, "near me" query).',
    notes:
      'iOS: choice between "Allow Once" / "Allow While Using App" / "Don\'t Allow". Android: foreground-location prompt (ACCESS_FINE_LOCATION).',
    androidOnly: false,
  },
  {
    id: "P6",
    file: "P6-bluetooth-localnet.png",
    title: "Bluetooth / Local Network",
    trigger:
      "Trigger any LAN / BLE-scanning flow (device pairing, local agent discovery on 127.0.0.1:31337 pre-seed).",
    notes:
      "Android-only step. Android 12+ surfaces NEARBY_DEVICES (BLUETOOTH_SCAN/BLUETOOTH_CONNECT). iOS treats Local Network as an opaque first-touch prompt that is captured implicitly by P2/P3 surfaces.",
    androidOnly: true,
  },
];

function promptsForSurface(surface) {
  return PROMPTS.filter((p) => !p.androidOnly || surface === "android");
}

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
  return join(
    REPO_ROOT,
    "reports",
    "qa",
    today(),
    "mobile-permissions",
    surface,
  );
}

function writeChecklist(surface, dir, prompts) {
  const lines = [];
  lines.push(`# Mobile permission cascade checklist — ${surface}`);
  lines.push("");
  lines.push(`Date: ${today()}`);
  lines.push(`Surface: ${surface}`);
  lines.push(
    `Prompts: ${prompts.length}${surface === "ios" ? " (P6 Bluetooth/LocalNet is Android-only)" : ""}`,
  );
  lines.push("");
  lines.push(
    "Source: docs/QA-first-run.md M5 row + eliza/packages/ui/src/platform/desktop-permissions-client.ts and mobile-permissions-client.ts. Drive each prompt with the computer-use MCP from within a Claude Code session; this script only scaffolds and validates the report directory.",
  );
  lines.push("");
  lines.push(
    "| ID | Status | Outcome | Expected screenshot | Title | Trigger | Notes |",
  );
  lines.push(
    "|----|--------|---------|---------------------|-------|---------|-------|",
  );
  for (const p of prompts) {
    lines.push(
      `| ${p.id} | [ ] | granted / skipped | \`${p.file}\` | ${p.title} | ${p.trigger} | ${p.notes} |`,
    );
  }
  lines.push("");
  lines.push("## Capture commands (operator)");
  lines.push("");
  lines.push(
    "For each prompt: drive the app to trigger the dialog, screenshot it before responding, then grant or skip. Record the outcome (granted/skipped) in the Outcome column above.",
  );
  lines.push("");
  lines.push("```");
  lines.push("mcp__computer-use__screenshot       (capture the OS prompt)");
  lines.push("  → save bytes to:");
  lines.push(`     ${dir}/<Pn-name>.png`);
  lines.push(
    "mcp__computer-use__left_click       (grant or dismiss the dialog)",
  );
  lines.push("```");
  lines.push("");
  lines.push("When done, run:");
  lines.push("");
  lines.push("```");
  lines.push(
    `node scripts/qa/mobile-permission-walkthrough.mjs --finalize --surface ${surface}`,
  );
  lines.push("```");
  lines.push("");
  writeFileSync(join(dir, "CHECKLIST.md"), lines.join("\n"));
}

function init(surface) {
  const dir = reportDir(surface);
  const prompts = promptsForSurface(surface);
  mkdirSync(dir, { recursive: true });
  writeChecklist(surface, dir, prompts);
  process.stdout.write(
    `Scaffolded ${surface} mobile permission walkthrough at:\n  ${dir}\n`,
  );
  process.stdout.write(`Checklist: ${join(dir, "CHECKLIST.md")}\n`);
  process.stdout.write(
    `Save ${prompts.length} screenshots into that directory using the filenames listed in CHECKLIST.md.\n`,
  );
  for (const p of prompts) {
    process.stdout.write(`  ${p.id}: ${join(dir, p.file)}\n`);
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

  const prompts = promptsForSurface(surface);
  const present = [];
  const missing = [];
  for (const p of prompts) {
    const path = join(dir, p.file);
    if (existsSync(path)) {
      const s = statSync(path);
      present.push({ prompt: p, path, size: s.size, sha256: sha256Of(path) });
    } else {
      missing.push(p);
    }
  }

  const lines = [];
  lines.push(`# Mobile permission cascade summary — ${surface}`);
  lines.push("");
  lines.push(`Date: ${today()}`);
  lines.push(`Surface: ${surface}`);
  lines.push(`Captured: ${present.length}/${prompts.length}`);
  lines.push("");
  lines.push(
    "| ID | Expected file | Present | Size (bytes) | sha256 | Title |",
  );
  lines.push(
    "|----|---------------|---------|--------------|--------|-------|",
  );
  for (const p of prompts) {
    const hit = present.find((entry) => entry.prompt.id === p.id);
    if (hit) {
      lines.push(
        `| ${p.id} | \`${p.file}\` | yes | ${hit.size} | \`${hit.sha256}\` | ${p.title} |`,
      );
    } else {
      lines.push(`| ${p.id} | \`${p.file}\` | no  | — | — | ${p.title} |`);
    }
  }

  // Surface any unexpected extras in the directory so operators notice typos.
  const extras = [];
  try {
    const expected = new Set(
      prompts.map((p) => p.file).concat(["CHECKLIST.md", "SUMMARY.md"]),
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
    const missingIds = missing.map((p) => p.id).join(", ");
    process.stdout.write(`INCOMPLETE: missing all (${missingIds})\n`);
    // Partial / empty is OK in local dev — exit 0 as long as the scaffold exists.
    return;
  }
  if (missing.length === 0) {
    process.stdout.write(
      `PASS: ${present.length}/${prompts.length} prompts captured\n`,
    );
    return;
  }
  process.stdout.write(
    `INCOMPLETE: missing ${missing.map((p) => p.id).join(", ")} (${present.length}/${prompts.length} captured)\n`,
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
