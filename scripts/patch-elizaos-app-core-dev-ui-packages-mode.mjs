#!/usr/bin/env node

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const LOG_PREFIX = "[patch-elizaos-app-core-dev-ui-packages-mode]";

function resolveAppCoreDir() {
  try {
    return path.dirname(require.resolve("@elizaos/app-core/package.json"));
  } catch {
    return null;
  }
}

function replaceIfPresent(text, before, after) {
  if (text.includes(after)) {
    return text;
  }
  if (!text.includes(before)) {
    return text;
  }
  return text.replace(before, after);
}

const appCoreDir = resolveAppCoreDir();
if (!appCoreDir) {
  console.warn(`${LOG_PREFIX} @elizaos/app-core is not installed; skipping.`);
  process.exit(0);
}

const devUiPath = path.join(appCoreDir, "scripts/dev-ui.mjs");
if (!fs.existsSync(devUiPath)) {
  console.warn(`${LOG_PREFIX} dev-ui.mjs not found; skipping.`);
  process.exit(0);
}

const createRequireImport = 'import { createRequire } from "node:module";\n';
const publishedDevServerFallback = `  try {
    const req = createRequire(import.meta.url);
    const pkgJson = req.resolve("@elizaos/app-core/package.json");
    const publishedEntry = path.join(
      path.dirname(pkgJson),
      "packages",
      "app-core",
      "src",
      "runtime",
      "dev-server.js",
    );
    if (existsSync(publishedEntry)) {
      return path.relative(devCwd, publishedEntry).replaceAll(path.sep, "/");
    }
  } catch {
    /* npm package layout only */
  }
  throw new Error(
    \`[dev-ui] dev-server.ts not found under \${devCwd}. Expected eliza/packages/app-core/... (Eliza-style checkout) or packages/app-core/... (eliza repo root).\`,
  );`;

const beforeThrow = `  throw new Error(
    \`[dev-ui] dev-server.ts not found under \${devCwd}. Expected eliza/packages/app-core/... (Eliza-style checkout) or packages/app-core/... (eliza repo root).\`,
  );`;

const brokenFallbackStart =
  '  const publishedDevServerCandidates = [\n    path.join(\n      devCwd,\n      "node_modules",';

let next = fs.readFileSync(devUiPath, "utf8");
const original = next;

if (next.includes(brokenFallbackStart)) {
  const brokenEnd = `  throw new Error(
    \`[dev-ui] dev-server.ts not found under \${devCwd}. Expected eliza/packages/app-core/... (Eliza-style checkout) or packages/app-core/... (eliza repo root).\`,
  );`;
  const startIdx = next.indexOf(brokenFallbackStart);
  const endIdx = next.indexOf(brokenEnd, startIdx);
  if (endIdx === -1) {
    throw new Error(`${LOG_PREFIX} could not locate broken fallback block end`);
  }
  next =
    next.slice(0, startIdx) +
    publishedDevServerFallback +
    next.slice(endIdx + brokenEnd.length);
}

next = replaceIfPresent(next, beforeThrow, publishedDevServerFallback);

if (!next.includes('import { createRequire } from "node:module";')) {
  next = next.replace(
    'import { execFileSync, execSync, spawn } from "node:child_process";',
    `${createRequireImport}import { execFileSync, execSync, spawn } from "node:child_process";`,
  );
}

if (next === original) {
  if (next.includes('req.resolve("@elizaos/app-core/package.json")')) {
    console.log(`${LOG_PREFIX} dev-ui.mjs already patched.`);
  } else {
    console.warn(
      `${LOG_PREFIX} expected dev-ui marker not found; upstream may have changed.`,
    );
  }
  process.exit(0);
}

fs.writeFileSync(devUiPath, next);
console.log(
  `${LOG_PREFIX} patched dev-ui.mjs for npm package-mode dev-server.`,
);
