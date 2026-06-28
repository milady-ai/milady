#!/usr/bin/env node
/**
 * Pre-flight check that gates `bun run dev:desktop` (and any other
 * script that depends on the local eliza checkout being fresh).
 *
 * The 240-commit drift problem: we lose hours debugging "develop-
 * baseline bugs" that were already fixed upstream because the local
 * `eliza/` checkout sat at a SHA from days ago. This script catches
 * that at preflight, not three rebuilds in.
 *
 * Behavior:
 *   - Packages mode (no eliza/ dir, or `MILADY_ELIZA_SOURCE=packages`)
 *       → exit 0 silently
 *   - Local mode, eliza checkout on `develop`:
 *       0 commits behind  → silent ok
 *       1-50 commits      → warn loudly, proceed (exit 0)
 *       >50 commits       → hard fail (exit 1)
 *   - Local mode, on a `wip/*` or feature branch:
 *       info-only, never fail (intentional dev work)
 *   - `MILADY_SKIP_FRESHNESS_CHECK=1` → bypass entirely (CI, scripts)
 *
 * Network: a single `git fetch origin develop --progress --depth=300`
 * with live stderr progress (and a heartbeat if fetch stalls).
 * Skipped if `MILADY_SKIP_FETCH=1` so it's offline-friendly.
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MILADY_ROOT = path.resolve(__dirname, "..");
const ELIZA_ROOT = path.join(MILADY_ROOT, "eliza");

const HARD_FAIL_THRESHOLD = 50;
const FETCH_HEARTBEAT_MS = 5_000;

const SOURCE_MODE = (
  process.env.MILADY_ELIZA_SOURCE ??
  process.env.ELIZA_SOURCE ??
  ""
).toLowerCase();

function isLocalMode() {
  if (["local", "source", "workspace"].includes(SOURCE_MODE)) return true;
  if (["package", "packages", "published", "npm"].includes(SOURCE_MODE)) {
    return false;
  }
  if (
    process.env.MILADY_FORCE_LOCAL_UPSTREAMS === "1" ||
    process.env.ELIZA_FORCE_LOCAL_UPSTREAMS === "1"
  ) {
    return true;
  }
  // Auto-detect: if eliza/ checkout exists with a real workspace, treat
  // as local mode (matches what shouldUseLocalElizaSource() does in
  // apps/app/vite.config.ts).
  return fs.existsSync(path.join(ELIZA_ROOT, "package.json"));
}

function log(message, level = "info") {
  const prefix =
    level === "error"
      ? "\x1b[31m[freshness][ERROR]\x1b[0m"
      : level === "warn"
        ? "\x1b[33m[freshness]\x1b[0m"
        : "[freshness]";
  console.log(`${prefix} ${message}`);
}

function gitInEliza(args) {
  return spawnSync("git", ["-C", ELIZA_ROOT, ...args], { encoding: "utf8" });
}

function currentBranch() {
  const out = gitInEliza(["symbolic-ref", "--short", "-q", "HEAD"]);
  if (out.status !== 0) return null;
  return out.stdout.trim() || null;
}

function commitsBehindOriginDevelop() {
  // `git rev-list --count HEAD..origin/develop` — number of commits
  // reachable from origin/develop that aren't on HEAD.
  const out = gitInEliza(["rev-list", "--count", "HEAD..origin/develop"]);
  if (out.status !== 0) return null;
  const n = Number.parseInt(out.stdout.trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function commitsAheadOfOriginDevelop() {
  const out = gitInEliza(["rev-list", "--count", "origin/develop..HEAD"]);
  if (out.status !== 0) return null;
  const n = Number.parseInt(out.stdout.trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function hasUncommittedChanges() {
  const out = gitInEliza(["status", "--porcelain"]);
  return out.status === 0 && out.stdout.trim().length > 0;
}

function formatSyncInstructions({ behind, ahead, dirty }) {
  const lines = [
    "",
    "  Most 'develop-baseline bugs' encountered with a stale checkout were already fixed upstream.",
    "  Sync eliza/ before continuing:",
    "",
  ];

  if (ahead > 0) {
    lines.push(
      `  Local develop has diverged (${ahead} commit(s) ahead, ${behind} behind origin/develop).`,
      "  Fast-forward won't work — use rebase:",
      "",
      "      cd eliza",
      ...(dirty
        ? ['      git stash push -u -m "wip before develop rebase"']
        : []),
      "      git fetch origin develop",
      "      git rebase origin/develop",
      ...(dirty ? ["      git stash pop"] : []),
      "",
      "  To discard local commits and match upstream exactly (keeps uncommitted edits via stash):",
      "",
      "      cd eliza",
      '      git stash push -u -m "wip before develop reset"',
      "      git fetch origin develop",
      "      git reset --hard origin/develop",
      "      git stash pop",
    );
  } else {
    lines.push(
      ...(dirty
        ? [
            "  You have uncommitted changes — stash first:",
            "",
            "      cd eliza",
            '      git stash push -u -m "wip before develop sync"',
            "      git fetch origin develop",
            "      git pull --ff-only origin develop",
            "      git stash pop",
          ]
        : [
            "      cd eliza",
            "      git fetch origin develop",
            "      git pull --ff-only origin develop",
          ]),
    );
  }

  lines.push(
    "",
    "  Bypass for this one run with MILADY_SKIP_FRESHNESS_CHECK=1.",
    "",
  );
  return lines.join("\n");
}

function formatElapsedMs(startedAt) {
  return `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
}

/**
 * Fetch origin/develop with visible progress. Git writes transfer stats to
 * stderr when --progress is set; stdio is inherited so the user sees them
 * in a TTY. A heartbeat covers non-TTY / slow-network stalls.
 */
function fetchOriginDevelop() {
  log(
    "step 1/2 — fetching origin/develop (depth=300); may take a minute on slow networks…",
  );

  const startedAt = Date.now();
  const heartbeat = setInterval(() => {
    log(
      `still fetching origin/develop… (${formatElapsedMs(startedAt)} elapsed)`,
    );
  }, FETCH_HEARTBEAT_MS);

  return new Promise((resolve) => {
    const child = spawn(
      "git",
      [
        "-C",
        ELIZA_ROOT,
        "fetch",
        "origin",
        "develop",
        "--progress",
        "--depth=300",
      ],
      { stdio: ["ignore", "inherit", "inherit"] },
    );

    child.on("error", (error) => {
      clearInterval(heartbeat);
      log(
        `fetch failed to start after ${formatElapsedMs(startedAt)}: ${error.message}`,
        "warn",
      );
      resolve(1);
    });

    child.on("exit", (code, signal) => {
      clearInterval(heartbeat);
      const elapsed = formatElapsedMs(startedAt);
      if (signal) {
        log(`fetch interrupted (${signal}) after ${elapsed}`, "warn");
        resolve(1);
        return;
      }
      if ((code ?? 1) === 0) {
        log(`step 1/2 — fetch complete (${elapsed})`);
        resolve(0);
        return;
      }
      log(
        `step 1/2 — fetch failed after ${elapsed} (offline? auth?); using cached origin/develop ref`,
        "warn",
      );
      resolve(code ?? 1);
    });
  });
}

async function main() {
  if (process.env.MILADY_SKIP_FRESHNESS_CHECK === "1") return;

  if (!isLocalMode()) {
    // Packages mode — nothing to check.
    return;
  }

  if (!fs.existsSync(path.join(ELIZA_ROOT, ".git"))) {
    // Local mode declared but no git repo (probably a tarball drop-in).
    // Nothing reliable to compare against; skip.
    return;
  }

  log("checking eliza/ checkout freshness against origin/develop…");

  if (process.env.MILADY_SKIP_FETCH !== "1") {
    await fetchOriginDevelop();
  } else {
    log("step 1/2 — skipped fetch (MILADY_SKIP_FETCH=1); using cached ref");
  }

  log("step 2/2 — comparing local HEAD to origin/develop…");
  const branch = currentBranch();
  const behind = commitsBehindOriginDevelop();
  const ahead = commitsAheadOfOriginDevelop() ?? 0;
  const dirty = hasUncommittedChanges();

  if (behind === null) {
    log(
      `could not compute commits-behind (missing origin/develop ref?). Skipping.`,
      "warn",
    );
    return;
  }

  if (branch && branch !== "develop") {
    // On a feature/wip branch. The number is informational — being
    // behind develop on a wip branch is normal and intentional.
    if (behind > 0) {
      log(
        `on '${branch}', ${behind} commits behind origin/develop. (Use 'cd eliza && git fetch && git rebase origin/develop' before opening a PR.)`,
        "info",
      );
    }
    return;
  }

  if (behind === 0) return; // silent happy path

  if (behind > HARD_FAIL_THRESHOLD) {
    const divergence = ahead > 0 ? ` (${ahead} ahead, branches diverged)` : "";
    log(
      `eliza/ is ${behind} commits behind origin/develop${divergence} — too stale to dev against reliably.`,
      "error",
    );
    console.error(formatSyncInstructions({ behind, ahead, dirty }));
    process.exit(1);
  }

  if (behind > 0) {
    const syncHint =
      ahead > 0
        ? "git rebase origin/develop"
        : dirty
          ? "git stash && git pull --ff-only origin develop && git stash pop"
          : "git pull --ff-only origin develop";
    log(
      `eliza/ is ${behind} commits behind origin/develop${ahead > 0 ? ` (${ahead} ahead — rebase required)` : ""}. Consider 'cd eliza && ${syncHint}'.`,
      "warn",
    );
    return;
  }
}

main().catch((error) => {
  // Never fail dev on the freshness check infrastructure itself.
  log(`internal error: ${error?.stack ?? error}`, "warn");
  process.exit(0);
});
