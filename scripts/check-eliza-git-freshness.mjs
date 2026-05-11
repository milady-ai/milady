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
 * Network: a single `git fetch origin develop --quiet --depth=300`.
 * Skipped if `MILADY_SKIP_FETCH=1` so it's offline-friendly.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MILADY_ROOT = path.resolve(__dirname, "..");
const ELIZA_ROOT = path.join(MILADY_ROOT, "eliza");

const HARD_FAIL_THRESHOLD = 50;

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
	const out = gitInEliza([
		"rev-list",
		"--count",
		"HEAD..origin/develop",
	]);
	if (out.status !== 0) return null;
	const n = Number.parseInt(out.stdout.trim(), 10);
	return Number.isFinite(n) ? n : null;
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

	if (process.env.MILADY_SKIP_FETCH !== "1") {
		const fetch = gitInEliza([
			"fetch",
			"origin",
			"develop",
			"--quiet",
			"--depth=300",
		]);
		if (fetch.status !== 0) {
			// Network down / offline / auth — warn but proceed. The
			// comparison still works against the last cached origin ref.
			log(
				`could not refresh origin/develop (offline?); using cached ref`,
				"warn",
			);
		}
	}

	const branch = currentBranch();
	const behind = commitsBehindOriginDevelop();

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
		log(
			`eliza/ is ${behind} commits behind origin/develop — too stale to dev against reliably.`,
			"error",
		);
		console.error(
			"\n  Most 'develop-baseline bugs' encountered with a stale checkout were already fixed upstream.\n" +
				"  Sync it before continuing:\n\n" +
				"      cd eliza && git fetch origin develop && git pull --ff-only origin develop\n\n" +
				`  Bypass for this one run with MILADY_SKIP_FRESHNESS_CHECK=1.\n`,
		);
		process.exit(1);
	}

	log(
		`eliza/ is ${behind} commits behind origin/develop. Consider 'cd eliza && git pull --ff-only origin develop'.`,
		"warn",
	);
}

main().catch((error) => {
	// Never fail dev on the freshness check infrastructure itself.
	log(`internal error: ${error?.stack ?? error}`, "warn");
	process.exit(0);
});
