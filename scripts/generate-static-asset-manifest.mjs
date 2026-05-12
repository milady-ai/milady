#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveElizaAppCoreRoot } from "./lib/resolve-eliza-app-core-script.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const appCoreRoot = resolveElizaAppCoreRoot({ repoRoot, preferLocal: true });
const manifestModule = await import(
  pathToFileURL(
    path.join(appCoreRoot, "scripts", "lib", "static-asset-manifest.mjs"),
  ).href
);
const outputPath = manifestModule.writeStaticAssetManifest(repoRoot);

console.log(
  `static-asset-manifest: wrote ${path.relative(repoRoot, outputPath)}`,
);
