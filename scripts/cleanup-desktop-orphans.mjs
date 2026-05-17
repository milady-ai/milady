#!/usr/bin/env node
/**
 * Pre-flight cleanup that runs before every `bun run dev:desktop` so
 * stale state from a previous run doesn't crash the new boot.
 *
 * Two failure modes this handles:
 *
 * 1. **Orphan dev-server.ts / Milady-dev processes.** The Electrobun
 *    orchestrator spawns `bun --watch eliza/packages/app-core/src/runtime/dev-server.ts`
 *    plus a Milady-dev launcher. If the parent terminal closed
 *    ungracefully (Ctrl-Z, `pkill -9 dev-platform`, IDE crash), the
 *    children survive — they still hold port 31337, the PGlite WAL,
 *    and the `eliza-pglite.lock` file. A fresh `dev:desktop` then
 *    crash-loops: "API exited with code 1 — relaunching".
 *
 * 2. **Stale PGlite lock with no holder.** Crash-killed Bun processes
 *    leave `.eliza/.elizadb/eliza-pglite.lock` behind. PGlite refuses
 *    to open the data dir even though nothing is actually using it.
 *
 * Safety: lock removal is gated on `lsof` showing zero open handles
 * against the data directory. We never `rm` a lock whose holder is
 * still alive — that would risk DB corruption.
 *
 * Idempotent. Fast (~150ms when there's nothing to clean).
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HOME = os.homedir();

// PGlite data dir resolution mirrors `eliza/packages/core/src/utils/paths.ts`:
//   PGLITE_DATA_DIR (full path) → ELIZA_DATABASE_DIR (full path)
//   → (ELIZA_DATA_DIR || process.cwd() + "/.eliza") + "/.elizadb"
// We collect every candidate we can derive so a stale lock from any
// previous data-dir layout (project-relative cwd, ~/.eliza legacy)
// gets swept on preflight.
function resolveCandidateDataDirs() {
  const candidates = new Set();
  if (process.env.PGLITE_DATA_DIR) candidates.add(process.env.PGLITE_DATA_DIR);
  if (process.env.ELIZA_DATABASE_DIR) {
    candidates.add(process.env.ELIZA_DATABASE_DIR);
  }
  const baseDataDir =
    process.env.ELIZA_DATA_DIR || path.join(process.cwd(), ".eliza");
  candidates.add(path.join(baseDataDir, ".elizadb"));
  // Legacy fallback — older builds wrote into the user-home `.eliza`.
  candidates.add(path.join(HOME, ".eliza", ".elizadb"));
  return [...candidates];
}

const CANDIDATE_DATA_DIRS = resolveCandidateDataDirs();

// Process patterns the dev orchestrator can leave behind. Each entry is
// a substring `pgrep -f` will match against the full command line.
// Strict prefixes so we don't kill anything unrelated.
const ORPHAN_PATTERNS = [
  // Bun --watch on the dev-server.ts runtime entry.
  "bun --watch eliza/packages/app-core/src/runtime/dev-server.ts",
  // Bun executing dev-server.ts without --watch (release-style dev).
  "eliza/packages/app-core/src/runtime/dev-server.ts",
  // Milady-dev.app launcher binary and its bun child.
  "Milady-dev.app/Contents/MacOS/launcher",
  "Milady-dev.app/Contents/MacOS/../Resources/main.js",
  // Linux Electrobun dev bundle launcher and packaged Bun child.
  "build/dev-linux-x64/Milady-dev/bin/launcher",
  "build/dev-linux-x64/Milady-dev/bin/../Resources/main.js",
  // The dev-platform orchestrator itself.
  "eliza/packages/app-core/scripts/dev-platform.mjs",
  // The Milady-side wrapper that delegates to dev-platform.mjs.
  "scripts/run-eliza-app-core-script.mjs dev-platform.mjs",
];

function log(message) {
  console.log(`[cleanup-desktop-orphans] ${message}`);
}

function listMatchingPids(pattern) {
  const result = spawnSync("pgrep", ["-f", pattern], { encoding: "utf8" });
  if (result.status !== 0) return [];
  return result.stdout
    .split("\n")
    .map((line) => Number.parseInt(line.trim(), 10))
    .filter((pid) => Number.isFinite(pid) && pid > 0);
}

function killPid(pid, signal = "SIGTERM") {
  try {
    // Bun's process.kill requires the full `SIG*` name; bare "TERM"
    // throws "Unknown signal: TERM". Node accepts both, Bun is strict.
    process.kill(pid, signal);
    return true;
  } catch (error) {
    // ESRCH = process already gone, no-op success.
    if (error?.code === "ESRCH") return true;
    log(`failed to ${signal} pid ${pid}: ${error?.message ?? error}`);
    return false;
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function lockIsHeld(pgliteDir, lockFile) {
  if (!fs.existsSync(lockFile)) return false;
  // `lsof +D` recursively lists open files under the directory. Exit 0
  // = at least one file open, exit 1 = none. Either way we get a clean
  // signal without a long-lived process.
  const result = spawnSync("lsof", ["+D", pgliteDir], { encoding: "utf8" });
  if (result.status === 0 && result.stdout.trim().length > 0) {
    const openFiles = result.stdout
      .split("\n")
      .slice(1) // header
      .filter((line) => line.trim().length > 0);
    return openFiles.length > 0;
  }
  return false;
}

function lockPidIsAlive(lockFile) {
  try {
    const raw = fs.readFileSync(lockFile, "utf8");
    const parsed = JSON.parse(raw);
    const pid = Number(parsed?.pid);
    if (!Number.isFinite(pid) || pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  } catch {
    // Malformed lock file → treat as stale.
    return false;
  }
}

async function killOrphans() {
  const collected = new Set();
  for (const pattern of ORPHAN_PATTERNS) {
    for (const pid of listMatchingPids(pattern)) {
      if (pid === process.pid) continue;
      collected.add(pid);
    }
  }

  if (collected.size === 0) return 0;

  log(
    `killing ${collected.size} orphan process(es): ${[...collected].join(", ")}`,
  );

  // First a polite SIGTERM so bun can flush PGlite. Then escalate.
  for (const pid of collected) killPid(pid, "SIGTERM");
  await sleep(500);

  const survivors = [];
  for (const pid of collected) {
    try {
      process.kill(pid, 0); // probe
      survivors.push(pid);
    } catch {
      /* gone */
    }
  }

  if (survivors.length > 0) {
    log(`SIGTERM didn't take ${survivors.length}; sending SIGKILL`);
    for (const pid of survivors) killPid(pid, "SIGKILL");
    await sleep(300);
  }

  return collected.size;
}

async function cleanupStaleLock() {
  let removedAny = false;
  for (const pgliteDir of CANDIDATE_DATA_DIRS) {
    const lockFile = path.join(pgliteDir, "eliza-pglite.lock");
    if (!fs.existsSync(lockFile)) continue;
    // Two signals must both say "stale": no open files in the data dir
    // AND no live process matches the PID stamped in the lock file.
    // Either signal alone has been wrong in the past (lsof misses
    // PGlite's mmap on some macOS builds; the PID can be the dying
    // parent of a still-running child).
    if (lockIsHeld(pgliteDir, lockFile) || lockPidIsAlive(lockFile)) {
      log(`PGlite lock still held at ${lockFile} — leaving it alone`);
      continue;
    }
    try {
      fs.unlinkSync(lockFile);
      log(`removed stale PGlite lock at ${lockFile}`);
      removedAny = true;
    } catch (error) {
      log(`failed to remove stale lock: ${error?.message ?? error}`);
    }
  }
  return removedAny;
}

async function main() {
  const killed = await killOrphans();
  const removedLock = await cleanupStaleLock();
  if (killed === 0 && !removedLock) {
    // Quiet path — fast preflight, no noise on the common case.
    return;
  }
  log(
    `done — killed=${killed}, removedStaleLock=${removedLock ? "yes" : "no"}`,
  );
}

main().catch((error) => {
  log(`unexpected error: ${error?.stack ?? error}`);
  // Don't fail the dev command on cleanup hiccups — the user can still
  // proceed; worst case they see the original "data dir in use" error.
  process.exit(0);
});
