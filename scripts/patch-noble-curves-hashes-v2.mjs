#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LOG_PREFIX = "[patch-noble-curves-hashes-v2]";
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const bunStoreDir = path.join(repoRoot, "node_modules", ".bun");

function listCurvesPackageDirs() {
  if (!fs.existsSync(bunStoreDir)) return [];

  return fs
    .readdirSync(bunStoreDir, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && entry.name.startsWith("@noble+curves@"),
    )
    .map((entry) =>
      path.join(bunStoreDir, entry.name, "node_modules", "@noble", "curves"),
    )
    .filter((dir) => fs.existsSync(path.join(dir, "package.json")));
}

function shouldPatch(curvesDir) {
  const hashesUtilsPath = path.resolve(curvesDir, "..", "hashes", "utils.js");
  if (!fs.existsSync(hashesUtilsPath)) return false;
  const hashesUtils = fs.readFileSync(hashesUtilsPath, "utf8");
  return !/\bbytesToUtf8\b/.test(hashesUtils);
}

function patchFile(filePath, replacements) {
  if (!fs.existsSync(filePath)) return false;

  const original = fs.readFileSync(filePath, "utf8");
  let next = original;
  for (const [from, to] of replacements) {
    next = next.replace(from, to);
  }

  if (next === original) return false;
  fs.writeFileSync(filePath, next);
  return true;
}

function patchEsmUtils(curvesDir) {
  return patchFile(path.join(curvesDir, "esm", "utils.js"), [
    [
      /export \{ abytes, anumber, bytesToHex, bytesToUtf8, concatBytes, hexToBytes, isBytes, randomBytes, utf8ToBytes, \} from '@noble\/hashes\/utils\.js';/,
      "export { abytes, anumber, bytesToHex, concatBytes, hexToBytes, isBytes, randomBytes, utf8ToBytes, } from '@noble/hashes/utils.js';\nexport const bytesToUtf8 = (bytes) => new TextDecoder().decode(bytes);",
    ],
  ]);
}

function patchCjsUtils(curvesDir) {
  return patchFile(path.join(curvesDir, "utils.js"), [
    [
      /Object\.defineProperty\(exports, "bytesToUtf8", \{ enumerable: true, get: function \(\) \{ return utils_js_2\.bytesToUtf8; \} \}\);/,
      "const bytesToUtf8 = (bytes) => new TextDecoder().decode(bytes);\nexports.bytesToUtf8 = bytesToUtf8;",
    ],
  ]);
}

let patchedFiles = 0;

for (const curvesDir of listCurvesPackageDirs()) {
  if (!shouldPatch(curvesDir)) continue;
  if (patchEsmUtils(curvesDir)) patchedFiles += 1;
  if (patchCjsUtils(curvesDir)) patchedFiles += 1;
}

if (patchedFiles === 0) {
  console.log(`${LOG_PREFIX} noble curves packages already compatible.`);
} else {
  console.log(`${LOG_PREFIX} patched ${patchedFiles} file(s).`);
}
