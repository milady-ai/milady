#!/usr/bin/env node

/**
 * Build the extension for Chrome (MV3) and/or Safari.
 *
 * Output:
 *   dist/chrome/  — loadable unpacked MV3 extension
 *   dist/safari/  — identical bundle staged into the ios-wrapper Xcode
 *                   project's Resources directory
 *
 * Usage:
 *   node scripts/build.mjs                  # builds both
 *   node scripts/build.mjs --target=chrome  # chrome only
 *   node scripts/build.mjs --target=safari  # safari only
 */

import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { build } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const srcDir = resolve(root, "src");

const args = new Set(process.argv.slice(2));
const onlyChrome = Array.from(args).some((a) => a === "--target=chrome");
const onlySafari = Array.from(args).some((a) => a === "--target=safari");
const targets = onlySafari
  ? ["safari"]
  : onlyChrome
    ? ["chrome"]
    : ["chrome", "safari"];

await Promise.all(targets.map((t) => buildTarget(t)));
console.log(`[build] targets=${targets.join(",")} complete`);

async function buildTarget(target) {
  const outDir = resolve(root, "dist", target);
  if (existsSync(outDir)) {
    await rm(outDir, { recursive: true, force: true });
  }
  await mkdir(outDir, { recursive: true });

  await build({
    root,
    plugins: [react()],
    resolve: { alias: { "@": srcDir } },
    build: {
      outDir,
      emptyOutDir: false,
      sourcemap: true,
      target: "es2022",
      modulePreload: false,
      rollupOptions: {
        input: {
          background: resolve(srcDir, "background.ts"),
          "content-script": resolve(srcDir, "content-script.ts"),
          "popup/index": resolve(srcDir, "popup/index.html"),
          "options/index": resolve(srcDir, "options/index.html"),
        },
        output: {
          entryFileNames: (info) => {
            if (info.name === "background") return "background.js";
            if (info.name === "content-script") return "content-script.js";
            return "assets/[name]-[hash].js";
          },
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },
    configFile: false,
  });

  const manifestSrc = resolve(root, "manifest.json");
  const manifestDst = resolve(outDir, "manifest.json");
  const raw = await readFile(manifestSrc, "utf8");
  const manifest = JSON.parse(raw);
  if (target === "safari") {
    // Safari ignores the `privacy` permission; strip it for cleanliness.
    manifest.permissions = manifest.permissions.filter((p) => p !== "privacy");
  }
  await writeFile(manifestDst, JSON.stringify(manifest, null, 2));

  const iconsSrc = resolve(root, "icons");
  if (existsSync(iconsSrc)) {
    await cp(iconsSrc, resolve(outDir, "icons"), { recursive: true });
  }
  // Normalize popup / options html paths so manifest references resolve.
  const popupHtml = resolve(outDir, "src/popup/index.html");
  const optionsHtml = resolve(outDir, "src/options/index.html");
  if (existsSync(popupHtml)) {
    await mkdir(resolve(outDir, "popup"), { recursive: true });
    await cp(popupHtml, resolve(outDir, "popup/index.html"));
  }
  if (existsSync(optionsHtml)) {
    await mkdir(resolve(outDir, "options"), { recursive: true });
    await cp(optionsHtml, resolve(outDir, "options/index.html"));
  }

  console.log(`[build] ${target}: wrote ${outDir}`);
}
