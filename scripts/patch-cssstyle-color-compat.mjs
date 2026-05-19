#!/usr/bin/env node
/**
 * cssstyle@6.x is consumed through jsdom in package-mode test and release
 * checks. Its CommonJS parser cannot require the ESM-only 5.x
 * @asamuzakjp/css-color line under Node's forked Vitest workers.
 *
 * The root package declares @elizaos/css-color-cjs as a CJS-compatible alias
 * pinned to @asamuzakjp/css-color@4.1.2. Normalize every installed cssstyle
 * parser to that alias, including older Milady-local patched installs that
 * used @miladyai/css-color-cjs.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const relPath = path.join("lib", "parsers.js");
const replacement = 'require("@elizaos/css-color-cjs")';

try {
  require.resolve("@elizaos/css-color-cjs");
} catch (error) {
  throw new Error(
    "@elizaos/css-color-cjs is not installed; run bun install before patching cssstyle",
    { cause: error },
  );
}

function collectCssstyleDirs() {
  const dirs = [path.join(repoRoot, "node_modules", "cssstyle")];
  const bunStore = path.join(repoRoot, "node_modules", ".bun");
  if (!existsSync(bunStore)) {
    return dirs;
  }

  for (const entry of readdirSync(bunStore)) {
    if (entry.startsWith("cssstyle@")) {
      dirs.push(path.join(bunStore, entry, "node_modules", "cssstyle"));
    }
  }
  return dirs;
}

let patched = 0;
for (const dir of collectCssstyleDirs()) {
  const target = path.join(dir, relPath);
  if (!existsSync(target)) {
    continue;
  }

  const source = readFileSync(target, "utf8");
  const next = source
    .replaceAll('require("@asamuzakjp/css-color")', replacement)
    .replaceAll('require("@miladyai/css-color-cjs")', replacement);

  if (next === source) {
    continue;
  }
  writeFileSync(target, next, "utf8");
  patched++;
  console.log(`[patch-cssstyle-color-compat] patched ${target}`);
}

if (patched > 0) {
  console.log(
    `[patch-cssstyle-color-compat] normalized ${patched} cssstyle parser require path(s).`,
  );
}
