#!/usr/bin/env node
// stage-into-xcode.mjs — Stages the first-light GGUF from .cache/ into the
// Xcode bundle resources directory, and verifies the file is registered as a
// Copy Bundle Resources entry in App.xcodeproj/project.pbxproj.
//
// What this script does:
//   1. Reads ./manifest.json for the expected filename, size, and SHA256.
//   2. Verifies the cache copy at .cache/first-light.gguf matches.
//   3. Copies it to apps/app/ios/App/App/agent/models/first-light.gguf.
//   4. Inspects App.xcodeproj/project.pbxproj for membership in:
//        - PBXFileReference (file declared)
//        - PBXResourcesBuildPhase (file in Copy Bundle Resources)
//        - PBXGroup containing the agent/models directory
//   5. If membership is missing, prints exact Xcode instructions to add the
//      file manually (we do NOT mutate project.pbxproj — surgery on that
//      file is brittle and easy to get wrong, and the cost of a manual step
//      once per project is small).
//
// Run from anywhere:
//   node native/ios-bun-port/models/stage-into-xcode.mjs
//   node native/ios-bun-port/models/stage-into-xcode.mjs --check-only
//   node native/ios-bun-port/models/stage-into-xcode.mjs --force

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Directory hierarchy:
//   <REPO_ROOT>/native/ios-bun-port/models/   ← SCRIPT_DIR
//   <REPO_ROOT>/native/ios-bun-port/          ← IOS_PORT_DIR
//   <REPO_ROOT>/native/                       ← NATIVE_DIR
//   <REPO_ROOT>/                              ← REPO_ROOT (where apps/app/ios/... lives)
const SCRIPT_DIR = __dirname;
const IOS_PORT_DIR = resolve(SCRIPT_DIR, "..");
const NATIVE_DIR = resolve(IOS_PORT_DIR, "..");
const REPO_ROOT = resolve(NATIVE_DIR, "..");

const MANIFEST_FILE = join(SCRIPT_DIR, "manifest.json");
const CACHE_DIR = join(SCRIPT_DIR, ".cache");
const XCODE_RESOURCE_DIR = join(REPO_ROOT, "apps/app/ios/App/App/agent/models");
const PBXPROJ_FILE = join(REPO_ROOT, "apps/app/ios/App/App.xcodeproj/project.pbxproj");

// ─── tiny CLI ────────────────────────────────────────────────────────────────

const args = new Set(process.argv.slice(2));
const CHECK_ONLY = args.has("--check-only");
const FORCE = args.has("--force");
const HELP = args.has("-h") || args.has("--help");

if (HELP) {
  process.stdout.write(`stage-into-xcode.mjs — stage first-light.gguf into Xcode dev bundle

Usage:
  node ${process.argv[1]}
  node ${process.argv[1]} --check-only   Verify cache + Xcode bundle membership; no copy
  node ${process.argv[1]} --force         Re-copy even if Xcode-dir copy already matches

Reads spec from:   ${MANIFEST_FILE}
Stages from:       ${CACHE_DIR}
Stages to:         ${XCODE_RESOURCE_DIR}
Verifies pbxproj:  ${PBXPROJ_FILE}
`);
  process.exit(0);
}

// ─── logging ─────────────────────────────────────────────────────────────────

const isTTY = process.stdout.isTTY;
const colors = {
  info: isTTY ? "\x1b[34m" : "",
  ok: isTTY ? "\x1b[32m" : "",
  warn: isTTY ? "\x1b[33m" : "",
  err: isTTY ? "\x1b[31m" : "",
  rst: isTTY ? "\x1b[0m" : "",
};

const log = (msg) => process.stdout.write(`${colors.info}[stage]${colors.rst} ${msg}\n`);
const ok = (msg) => process.stdout.write(`${colors.ok}[stage]${colors.rst} ${msg}\n`);
const warn = (msg) => process.stderr.write(`${colors.warn}[stage]${colors.rst} ${msg}\n`);
const fail = (msg) => {
  process.stderr.write(`${colors.err}[stage:err]${colors.rst} ${msg}\n`);
  process.exit(1);
};

// ─── load manifest ───────────────────────────────────────────────────────────

if (!existsSync(MANIFEST_FILE)) fail(`manifest.json not found at ${MANIFEST_FILE}`);

const manifest = JSON.parse(readFileSync(MANIFEST_FILE, "utf8"));
const spec = manifest["first-light"];
if (!spec) fail(`manifest.json is missing the "first-light" entry.`);

const { filename, sha256: expectedSha, size_bytes: expectedSize } = spec;
if (!filename || !expectedSha || !expectedSize) {
  fail(`manifest.json["first-light"] needs filename, sha256, and size_bytes.`);
}

const cacheFile = join(CACHE_DIR, filename);
const xcodeFile = join(XCODE_RESOURCE_DIR, filename);

// ─── verify helpers ──────────────────────────────────────────────────────────

function sha256File(path) {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return hash.digest("hex");
}

function verifyFile(path) {
  if (!existsSync(path)) return { ok: false, reason: "missing" };
  const size = statSync(path).size;
  if (size !== expectedSize) {
    return { ok: false, reason: `size mismatch (got ${size}, want ${expectedSize})` };
  }
  const sha = sha256File(path);
  if (sha !== expectedSha) {
    return { ok: false, reason: `sha mismatch (got ${sha}, want ${expectedSha})` };
  }
  return { ok: true };
}

// ─── verify cache ────────────────────────────────────────────────────────────

log(`Verifying cache copy: ${cacheFile}`);
const cacheCheck = verifyFile(cacheFile);
if (!cacheCheck.ok) {
  fail(
    `Cache copy is ${cacheCheck.reason}.\n` +
      `Run: ${SCRIPT_DIR}/download-first-light.sh --cache-only`,
  );
}
ok(`  cache: ok (${expectedSize} bytes, sha matches)`);

// ─── stage to Xcode bundle dir ───────────────────────────────────────────────

if (!CHECK_ONLY) {
  if (existsSync(xcodeFile) && !FORCE) {
    const xc = verifyFile(xcodeFile);
    if (xc.ok) {
      ok(`  xcode: already staged (skipping). Use --force to overwrite.`);
    } else {
      warn(`Existing Xcode-bundle copy is ${xc.reason}. Replacing.`);
      unlinkSync(xcodeFile);
    }
  }

  if (!existsSync(xcodeFile) || FORCE) {
    mkdirSync(XCODE_RESOURCE_DIR, { recursive: true });
    const tmp = `${xcodeFile}.partial`;
    log(`Copying ${cacheFile} → ${xcodeFile}`);
    copyFileSync(cacheFile, tmp);
    renameSync(tmp, xcodeFile);
    const post = verifyFile(xcodeFile);
    if (!post.ok) fail(`Post-copy verification failed: ${post.reason}`);
    ok(`  xcode: staged ok`);
  }
} else {
  log(`Verifying Xcode bundle copy: ${xcodeFile}`);
  const xc = verifyFile(xcodeFile);
  if (xc.ok) ok(`  xcode: ok`);
  else warn(`  xcode: ${xc.reason}`);
}

// ─── verify pbxproj membership ───────────────────────────────────────────────

if (!existsSync(PBXPROJ_FILE)) {
  warn("");
  warn(`No project.pbxproj at ${PBXPROJ_FILE}.`);
  warn(
    "This is normal before the first 'npx cap add ios' or 'bun run mobile:ios:scaffold'.",
  );
  warn(
    "After the iOS project exists, re-run this script and add the file via Xcode if needed.",
  );
  process.exit(0);
}

const pbx = readFileSync(PBXPROJ_FILE, "utf8");

// The exact pbxproj entries we expect look like:
//   <UUID> /* first-light.gguf */ = {isa = PBXFileReference; lastKnownFileType = file; path = "agent/models/first-light.gguf"; sourceTree = "<group>"; };
// and a matching PBXResourcesBuildPhase line:
//   <UUID> /* first-light.gguf in Resources */ = {isa = PBXBuildFile; fileRef = <UUID>; };
//
// We don't try to parse the file — we just check for the presence of the
// filename. False positives are not interesting here because the filename is
// unique to our project.
const hasFileRef =
  pbx.includes(`/* ${filename} */`) || pbx.includes(`/* ${filename} in Resources */`);
const hasResourcesPhase = pbx.includes(`/* ${filename} in Resources */`);

if (hasFileRef && hasResourcesPhase) {
  ok(`  pbxproj: ${filename} is registered as a Copy Bundle Resources entry.`);
} else {
  warn("");
  warn(`pbxproj does NOT include ${filename} as a bundle resource yet.`);
  warn(
    "Add it manually so Capacitor's iOS build copies it into the .app bundle:",
  );
  warn("");
  warn("  1. Open apps/app/ios/App/App.xcodeproj in Xcode.");
  warn("  2. In the Project navigator, expand the App target → App group.");
  warn("  3. Right-click the App group → Add Files to \"App\"…");
  warn(
    `  4. Navigate to apps/app/ios/App/App/agent/models/ and select ${filename}.`,
  );
  warn(
    '  5. In the dialog: uncheck "Copy items if needed" (file is already in tree),',
  );
  warn('     check the App target under "Add to targets",');
  warn('     and choose "Create groups" (NOT folder references).');
  warn("  6. Click Add.");
  warn(
    "  7. Verify by selecting the App target → Build Phases → Copy Bundle Resources;",
  );
  warn(`     ${filename} must appear in the list.`);
  warn("");
  warn(
    "After it's added once, future re-runs of this script just copy the bytes;",
  );
  warn("Xcode picks up the updated file on the next build.");
  process.exit(CHECK_ONLY ? 1 : 0);
}

ok("");
ok("Done.");
