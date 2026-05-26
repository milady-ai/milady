#!/usr/bin/env node
/**
 * Local-dev desktop permission cascade walkthrough.
 *
 * Drives the Electrobun shell through the lazy-permission flow documented in
 * eliza/packages/ui/src/platform/desktop-permissions-client.ts
 * (`installDesktopPermissionsClientPatch`). On desktop, permissions are
 * requested lazily — the user does not see all prompts up front. Each cascade
 * step (D1-D7) appears the first time the app touches the relevant capability.
 *
 * This script is the report scaffolding for a computer-use-driven walkthrough.
 * The actual screen drives happen INSIDE the Claude Code session via
 * mcp__computer-use__* tools — this script cannot invoke MCP tools on its own.
 *
 * Operator workflow (in a Claude Code session with computer-use MCP):
 *   1. Reset any previously granted permissions so each run exercises a fresh
 *      prompt cascade (macOS):
 *
 *        tccutil reset Notifications ai.elizaos.app
 *        tccutil reset Camera ai.elizaos.app
 *        tccutil reset Microphone ai.elizaos.app
 *        tccutil reset MediaLibrary ai.elizaos.app   # Photos
 *        tccutil reset Accessibility ai.elizaos.app
 *        tccutil reset ScreenCapture ai.elizaos.app
 *
 *      Location does not have a `tccutil` service name on every macOS release;
 *      use System Settings > Privacy & Security > Location Services if needed.
 *      We deliberately do NOT shell out to `tccutil` from this script — the
 *      operator runs those commands so credentials/admin prompts stay in-band.
 *   2. Boot the desktop shell: `bun run dev:desktop` (or `bun run dev:desktop:watch`
 *      for HMR). Use `bun run desktop:stack-status -- --json` to confirm
 *      apiListening/uiListening before driving prompts.
 *   3. Run this script with --init to scaffold the report directory and the
 *      D1-D7 checklist.
 *   4. Drive the app to trigger each permission prompt in sequence (D1-D7).
 *   5. For each prompt, screenshot with mcp__computer-use__screenshot, then
 *      grant or skip (and note which).
 *   6. Save PNGs to reports/qa/<date>/desktop-permissions/<id>-<name>.png
 *      using the filenames listed in the generated CHECKLIST.md.
 *   7. Run this script with --finalize to validate the directory and emit
 *      SUMMARY.md with sizes + sha256s per prompt.
 *
 * Permission cascade documented (macOS):
 *   D1 — Notifications
 *   D2 — Camera
 *   D3 — Microphone
 *   D4 — Location (when in use)
 *   D5 — Photos
 *   D6 — Accessibility (window/process control)
 *   D7 — Screen Recording (for any feature that needs it)
 *
 * TODO(windows): Windows uses UAC + per-capability consent (Settings >
 *   Privacy & Security > <capability>). There is no `tccutil` equivalent;
 *   resets happen via the Settings UI or `Get-AppxPackage` consent-store
 *   editing. A Windows variant of this scaffold should swap the operator
 *   pre-flight section for those steps and rename D6/D7 (no direct analogs
 *   for Accessibility / Screen Recording in the macOS sense).
 *
 * TODO(linux): Linux uses XDG desktop portals (xdg-desktop-portal) for
 *   camera / microphone / location / screenshot capability gating. Resets
 *   happen through the portal backend (e.g. flatpak permissions for sandboxed
 *   builds, or polkit / dconf for desktop integrations). A Linux variant
 *   should document `flatpak permission-reset ai.elizaos.app` (when run as a
 *   flatpak) and the portal-specific prompts the operator should expect.
 *
 * Usage:
 *   node scripts/qa/desktop-permission-walkthrough.mjs --init
 *   node scripts/qa/desktop-permission-walkthrough.mjs --finalize
 *
 * Exit codes:
 *   0 — success, or partial capture during --finalize (local dev is allowed to
 *       be incomplete; we only fail hard on usage / IO errors).
 *   non-zero — hard error (unknown flag, IO failure, or a --finalize run
 *       against a directory that does not exist).
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

const BUNDLE_ID = "ai.elizaos.app";

/**
 * Permission cascade prompts. Order matches the lazy trigger order most users
 * hit first: notifications fire from the cold-launch toast, capture surfaces
 * (camera/mic) light up next, then ambient gates (location, photos), then the
 * "elevated" gates (accessibility, screen recording) that only some features
 * touch.
 *
 * Each entry becomes a row in the generated CHECKLIST.md and an expected
 * screenshot filename for --finalize.
 */
const PROMPTS = [
  {
    id: "D1",
    file: "D1-notifications.png",
    title: "Notifications",
    tccService: "Notifications",
    trigger:
      "Drive the app to a point where it schedules a notification (cold-launch toast pipeline, reminders skill, deploy completion).",
    notes:
      'macOS: "Milady" Would Like to Send You Notifications. Reset with `tccutil reset Notifications ai.elizaos.app`.',
  },
  {
    id: "D2",
    file: "D2-camera.png",
    title: "Camera",
    tccService: "Camera",
    trigger:
      "Open a camera-using surface (camsnap skill, profile photo capture, scan barcode).",
    notes:
      'macOS: "Milady" Would Like to Access the Camera. Reset with `tccutil reset Camera ai.elizaos.app`.',
  },
  {
    id: "D3",
    file: "D3-microphone.png",
    title: "Microphone",
    tccService: "Microphone",
    trigger: "Trigger voice input (TTS demo, dictation, voice mode toggle).",
    notes:
      'macOS: "Milady" Would Like to Access the Microphone. Reset with `tccutil reset Microphone ai.elizaos.app`.',
  },
  {
    id: "D4",
    file: "D4-location.png",
    title: "Location (when in use)",
    tccService: null,
    trigger:
      'Trigger a location-dependent action (weather skill, "near me" query).',
    notes:
      'macOS: choice between "Allow Once" / "Allow While Using App" / "Don\'t Allow". Location has no stable `tccutil` service name across releases — reset via System Settings > Privacy & Security > Location Services if needed.',
  },
  {
    id: "D5",
    file: "D5-photos.png",
    title: "Photos",
    tccService: "MediaLibrary",
    trigger:
      "Trigger an attach-photo / pick-file action (avatar picker, media generation upload).",
    notes:
      'macOS: photo library access prompt with "Limited Access" / "Allow Full Access". Reset with `tccutil reset MediaLibrary ai.elizaos.app`.',
  },
  {
    id: "D6",
    file: "D6-accessibility.png",
    title: "Accessibility (window/process control)",
    tccService: "Accessibility",
    trigger:
      "Trigger any feature that drives other apps via the Accessibility API (window-control skills, system-wide hotkeys, computer-use bridge).",
    notes:
      "macOS: System Settings opens to Privacy & Security > Accessibility with Milady listed and disabled; operator toggles the switch. Reset with `tccutil reset Accessibility ai.elizaos.app`.",
  },
  {
    id: "D7",
    file: "D7-screen-recording.png",
    title: "Screen Recording",
    tccService: "ScreenCapture",
    trigger:
      "Trigger any feature that captures the desktop (cursor-screenshot endpoint exercised through a user-facing button, screen-share, screen-OCR).",
    notes:
      "macOS: System Settings opens to Privacy & Security > Screen & System Audio Recording with Milady listed and disabled; operator toggles the switch and acknowledges the relaunch prompt. Reset with `tccutil reset ScreenCapture ai.elizaos.app`.",
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

function reportDir() {
  return join(REPO_ROOT, "reports", "qa", today(), "desktop-permissions");
}

function resetCommandsBlock() {
  const lines = [];
  lines.push("```bash");
  lines.push("# Operator pre-flight (macOS) — reset granted permissions so");
  lines.push("# each run exercises a fresh prompt cascade.");
  for (const p of PROMPTS) {
    if (!p.tccService) continue;
    const comment = p.id === "D5" ? "  # Photos" : "";
    lines.push(`tccutil reset ${p.tccService} ${BUNDLE_ID}${comment}`);
  }
  lines.push(
    "# D4 (Location) has no stable `tccutil` service name across macOS",
  );
  lines.push(
    "# releases; reset via System Settings > Privacy & Security > Location",
  );
  lines.push("# Services if needed.");
  lines.push("```");
  return lines;
}

function writeChecklist(dir, prompts) {
  const lines = [];
  lines.push(`# Desktop permission cascade checklist`);
  lines.push("");
  lines.push(`Date: ${today()}`);
  lines.push(`Bundle: ${BUNDLE_ID}`);
  lines.push(`Prompts: ${prompts.length} (D1-D7)`);
  lines.push("");
  lines.push(
    "Source: docs/QA-first-run.md D-row table + eliza/packages/ui/src/platform/desktop-permissions-client.ts (`installDesktopPermissionsClientPatch`). Drive each prompt with the computer-use MCP from within a Claude Code session; this script only scaffolds and validates the report directory.",
  );
  lines.push("");
  lines.push("## Operator pre-flight (macOS)");
  lines.push("");
  lines.push(
    "Run these BEFORE launching the desktop shell so each run starts from a clean slate:",
  );
  lines.push("");
  for (const line of resetCommandsBlock()) lines.push(line);
  lines.push("");
  lines.push(
    "Then launch the shell: `bun run dev:desktop` (or `bun run dev:desktop:watch` for HMR). Confirm ports with `bun run desktop:stack-status -- --json`.",
  );
  lines.push("");
  lines.push("## Cascade");
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
  lines.push(`     ${dir}/<Dn-name>.png`);
  lines.push(
    "mcp__computer-use__left_click       (grant or dismiss the dialog)",
  );
  lines.push("```");
  lines.push("");
  lines.push("When done, run:");
  lines.push("");
  lines.push("```");
  lines.push(`node scripts/qa/desktop-permission-walkthrough.mjs --finalize`);
  lines.push("```");
  lines.push("");
  writeFileSync(join(dir, "CHECKLIST.md"), lines.join("\n"));
}

function init() {
  const dir = reportDir();
  mkdirSync(dir, { recursive: true });
  writeChecklist(dir, PROMPTS);
  process.stdout.write(
    `Scaffolded desktop permission walkthrough at:\n  ${dir}\n`,
  );
  process.stdout.write(`Checklist: ${join(dir, "CHECKLIST.md")}\n`);
  process.stdout.write(
    `Save ${PROMPTS.length} screenshots into that directory using the filenames listed in CHECKLIST.md.\n`,
  );
  for (const p of PROMPTS) {
    process.stdout.write(`  ${p.id}: ${join(dir, p.file)}\n`);
  }
  process.stdout.write("\nOperator pre-flight (macOS):\n");
  for (const line of resetCommandsBlock()) {
    process.stdout.write(`  ${line}\n`);
  }
}

function sha256Of(path) {
  const buf = readFileSync(path);
  return createHash("sha256").update(buf).digest("hex");
}

function finalize() {
  const dir = reportDir();
  if (!existsSync(dir)) {
    process.stderr.write(
      `No report directory found at ${dir}. Run --init first.\n`,
    );
    process.exit(2);
  }

  const present = [];
  const missing = [];
  for (const p of PROMPTS) {
    const path = join(dir, p.file);
    if (existsSync(path)) {
      const s = statSync(path);
      present.push({ prompt: p, path, size: s.size, sha256: sha256Of(path) });
    } else {
      missing.push(p);
    }
  }

  const lines = [];
  lines.push(`# Desktop permission cascade summary`);
  lines.push("");
  lines.push(`Date: ${today()}`);
  lines.push(`Bundle: ${BUNDLE_ID}`);
  lines.push(`Captured: ${present.length}/${PROMPTS.length}`);
  lines.push("");
  lines.push(
    "| ID | Expected file | Present | Size (bytes) | sha256 | Title |",
  );
  lines.push(
    "|----|---------------|---------|--------------|--------|-------|",
  );
  for (const p of PROMPTS) {
    const hit = present.find((entry) => entry.prompt.id === p.id);
    if (hit) {
      lines.push(
        `| ${p.id} | \`${p.file}\` | yes | ${hit.size} | \`${hit.sha256}\` | ${p.title} |`,
      );
    } else {
      lines.push(`| ${p.id} | \`${p.file}\` | no  | — | — | ${p.title} |`);
    }
  }

  const extras = [];
  try {
    const expected = new Set(
      PROMPTS.map((p) => p.file).concat(["CHECKLIST.md", "SUMMARY.md"]),
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
    return;
  }
  if (missing.length === 0) {
    process.stdout.write(
      `PASS: ${present.length}/${PROMPTS.length} prompts captured\n`,
    );
    return;
  }
  process.stdout.write(
    `INCOMPLETE: missing ${missing.map((p) => p.id).join(", ")} (${present.length}/${PROMPTS.length} captured)\n`,
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

  const wantsInit = args.flags.has("init");
  const wantsFinalize = args.flags.has("finalize");
  if (wantsInit === wantsFinalize) {
    process.stderr.write("Specify exactly one of --init or --finalize.\n");
    process.exit(2);
  }

  if (wantsInit) init();
  else finalize();
}

main();
