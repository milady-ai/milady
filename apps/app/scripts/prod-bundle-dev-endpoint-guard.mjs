#!/usr/bin/env node
/**
 * Prod-bundle dev-endpoint guard (L-7).
 *
 * Run after `vite build` against the dist directory. Fails the build if
 * any of the dev-stack endpoints leaks into the production bundle. These
 * endpoints are loopback-only at the server (`/api/dev/stack`,
 * `/api/dev/cursor-screenshot`, `/api/dev/console-log`) but the client
 * must not even reference them in shipped binaries — that closes the
 * attack surface that a forged Origin or a future proxy bug could open.
 *
 * Usage:
 *   node scripts/prod-bundle-dev-endpoint-guard.mjs dist
 *
 * SOC2 refs: CC6.1.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FORBIDDEN_PATTERNS = [
  "/api/dev/stack",
  "/api/dev/cursor-screenshot",
  "/api/dev/console-log",
  // Module-path imports that prove a dev-only module was bundled.
  "dev-stack",
  "dev-compat-routes",
];

async function walk(dir) {
  const fs = await import("node:fs/promises");
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (
      entry.isFile() &&
      /\.(js|mjs|cjs|html|css|map)$/.test(entry.name)
    ) {
      files.push(full);
    }
  }
  return files;
}

async function main() {
  const target = process.argv[2] ?? "dist";
  const root = path.resolve(target);
  const files = await walk(root);
  const violations = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    for (const needle of FORBIDDEN_PATTERNS) {
      if (text.includes(needle)) {
        violations.push({ file: path.relative(process.cwd(), file), needle });
      }
    }
  }
  if (violations.length > 0) {
    console.error(
      "[prod-bundle-dev-endpoint-guard] Forbidden dev-endpoint references in production bundle:",
    );
    for (const v of violations) {
      console.error(`  - ${v.file}: ${v.needle}`);
    }
    process.exit(1);
  }
  console.log(
    `[prod-bundle-dev-endpoint-guard] OK — scanned ${files.length} files in ${root}`,
  );
}

if (import.meta.url === `file://${fileURLToPath(import.meta.url)}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(2);
  });
}
