#!/usr/bin/env node
/**
 * Pre-flight check that scans `eliza/plugins/*\/dist/*.js` for static
 * imports of workspace source paths that no longer exist. Catches the
 * common Wave-A-style breakage: a package moves a module
 * (`@elizaos/agent/api/http-helpers` → `@elizaos/shared/api/http-helpers`)
 * but a dependent plugin's compiled dist still has the old path baked in.
 * The renderer build then crashes mid-bundling with "Could not load …"
 * for paths that resolve through tsconfig aliases to non-existent files.
 *
 * What we scan for:
 *   - `import … from "@elizaos/<pkg>/<subpath>"` in any plugin dist .js
 *   - For each such reference, check that the source file the path
 *     would resolve to (via tsconfig path map) actually exists.
 *   - If not, list the stale reference and the plugin that owns it.
 *
 * What we don't fix:
 *   - Anything. This is a warning. The user (or `bun run build:plugins`)
 *     has to rebuild the offending plugin.
 *
 * Exit codes:
 *   - 0: no stale references (or in packages mode, where we skip).
 *   - 0: stale references found, but only WARN — we never block dev
 *        on this because the orchestrator + stub plugin can sometimes
 *        paper over the stale ref. The diagnostic is the value.
 *
 * Idempotent. Fast (~300ms across the whole plugin tree).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MILADY_ROOT = path.resolve(__dirname, "..");
const ELIZA_ROOT = path.join(MILADY_ROOT, "eliza");
const PLUGINS_DIR = path.join(ELIZA_ROOT, "plugins");
const PACKAGES_DIR = path.join(ELIZA_ROOT, "packages");

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
	return fs.existsSync(path.join(ELIZA_ROOT, "package.json"));
}

function log(message, level = "info") {
	const prefix =
		level === "error"
			? "\x1b[31m[dist-staleness][ERROR]\x1b[0m"
			: level === "warn"
				? "\x1b[33m[dist-staleness]\x1b[0m"
				: "[dist-staleness]";
	console.log(`${prefix} ${message}`);
}

/**
 * Map a bare specifier like `@elizaos/agent/api/http-helpers` to the
 * filesystem path it would resolve to under tsconfig path aliases.
 * Returns null for non-workspace specifiers we shouldn't try to resolve.
 */
function resolveBareSpecifier(specifier) {
	const match = specifier.match(/^@elizaos\/([^/]+)\/(.+)$/);
	if (!match) return null;
	const [, pkgName, subpath] = match;
	// `eliza/packages/<pkg>/src/<subpath>.{ts,tsx}` is what local mode
	// aliases consume. The build chain emits `.js` references in dist
	// but the resolver maps back to source.
	const pkgRoot = path.join(PACKAGES_DIR, pkgName);
	if (!fs.existsSync(pkgRoot)) return null;
	const srcRoot = path.join(pkgRoot, "src");
	const candidates = [
		`${subpath}.ts`,
		`${subpath}.tsx`,
		`${subpath}/index.ts`,
		`${subpath}/index.tsx`,
		// Some dists keep the `.js` extension; the source has it stripped.
		subpath.endsWith(".js") ? `${subpath.slice(0, -3)}.ts` : null,
		subpath.endsWith(".js") ? `${subpath.slice(0, -3)}.tsx` : null,
	].filter(Boolean);
	for (const c of candidates) {
		const full = path.join(srcRoot, c);
		if (fs.existsSync(full)) return { ok: true, path: full };
	}
	return {
		ok: false,
		searched: candidates.map((c) => path.join(srcRoot, c)),
		pkgName,
		subpath,
	};
}

const SPECIFIER_RE = /from\s+["']([^"']+)["']/g;

function scanJsFile(filePath) {
	let content;
	try {
		content = fs.readFileSync(filePath, "utf8");
	} catch {
		return [];
	}
	const findings = [];
	for (const match of content.matchAll(SPECIFIER_RE)) {
		const specifier = match[1];
		if (!specifier.startsWith("@elizaos/")) continue;
		const resolved = resolveBareSpecifier(specifier);
		if (!resolved) continue; // not a workspace import or no pkg root
		if (resolved.ok === false) {
			findings.push({ specifier, file: filePath, ...resolved });
		}
	}
	return findings;
}

function* walkDir(dir, depth = 0, maxDepth = 8) {
	if (depth > maxDepth) return;
	let entries;
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name === ".git") continue;
			yield* walkDir(full, depth + 1, maxDepth);
			continue;
		}
		if (entry.isFile() && entry.name.endsWith(".js")) yield full;
	}
}

async function main() {
	if (!isLocalMode()) return;
	if (!fs.existsSync(PLUGINS_DIR)) return;

	const stale = [];
	let scannedFiles = 0;

	for (const pluginEntry of fs.readdirSync(PLUGINS_DIR, {
		withFileTypes: true,
	})) {
		if (!pluginEntry.isDirectory()) continue;
		const distDir = path.join(PLUGINS_DIR, pluginEntry.name, "dist");
		if (!fs.existsSync(distDir)) continue;
		for (const file of walkDir(distDir)) {
			scannedFiles++;
			const findings = scanJsFile(file);
			for (const finding of findings) {
				stale.push({ plugin: pluginEntry.name, ...finding });
			}
		}
	}

	if (stale.length === 0) {
		// Quiet happy path.
		return;
	}

	// Group by plugin for readability.
	const byPlugin = new Map();
	for (const finding of stale) {
		if (!byPlugin.has(finding.plugin)) byPlugin.set(finding.plugin, []);
		byPlugin.get(finding.plugin).push(finding);
	}

	log(
		`scanned ${scannedFiles} dist files; ${stale.length} stale workspace reference(s) across ${byPlugin.size} plugin(s):`,
		"warn",
	);

	for (const [plugin, findings] of byPlugin) {
		console.log(`  • ${plugin}`);
		const seen = new Set();
		for (const finding of findings) {
			const key = `${finding.specifier}`;
			if (seen.has(key)) continue;
			seen.add(key);
			console.log(
				`      ${finding.specifier}  ← source moved or removed`,
			);
		}
		console.log(
			`      fix: cd eliza/plugins/${plugin} && bun run build`,
		);
	}

	console.log(
		"\n  This is a warning, not an error — the renderer may still build via stub plugins,\n" +
			"  but plugin code paths that touch the stale references will fail at runtime.\n" +
			"  Bypass entirely with MILADY_SKIP_DIST_STALENESS_CHECK=1.\n",
	);
}

if (process.env.MILADY_SKIP_DIST_STALENESS_CHECK === "1") {
	process.exit(0);
}

main().catch((error) => {
	log(`internal error: ${error?.stack ?? error}`, "warn");
	process.exit(0);
});
