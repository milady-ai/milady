// Builds dist/polyfill-prefix.js — a single self-executing module that gets
// prepended to the agent bundle at iOS app build time.

import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outdir = `${__dirname}/dist`;

if (!existsSync(outdir)) await mkdir(outdir, { recursive: true });

const isBun = typeof globalThis.Bun !== "undefined";

if (isBun) {
  const result = await globalThis.Bun.build({
    entrypoints: [`${__dirname}/src/index.ts`],
    outdir,
    target: "browser",
    format: "iife",
    minify: false,
    sourcemap: "none",
    naming: "polyfill-prefix.js",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
  console.log(`[polyfill] built ${result.outputs.length} file(s) -> ${outdir}/polyfill-prefix.js`);
} else {
  // esbuild fallback if invoked under Node.
  const esbuild = await import("esbuild").catch(() => null);
  if (!esbuild) {
    console.error("[polyfill] need Bun or esbuild to build");
    process.exit(1);
  }
  await esbuild.build({
    entryPoints: [`${__dirname}/src/index.ts`],
    outfile: `${outdir}/polyfill-prefix.js`,
    bundle: true,
    format: "iife",
    target: ["es2020"],
    platform: "neutral",
    minify: false,
    sourcemap: false,
    define: {
      "process.env.NODE_ENV": '"production"',
    },
  });
  console.log(`[polyfill] built (esbuild) -> ${outdir}/polyfill-prefix.js`);
}
