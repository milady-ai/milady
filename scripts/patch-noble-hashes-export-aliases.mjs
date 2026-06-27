#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LOG_PREFIX = "[patch-noble-hashes-export-aliases]";
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const DIRECT_EXPORT_ALIASES = [
  "hmac",
  "legacy",
  "sha2",
  "sha3",
  "utils",
  "hkdf",
  "pbkdf2",
  "scrypt",
  "blake2",
  "blake3",
  "argon2",
  "eskdf",
  "webcrypto",
];

const SHIM_FILES = {
  "ripemd160.js": "export { ripemd160 } from './legacy.js';\n",
  "sha1.js": "export { sha1 } from './legacy.js';\n",
  "md5.js": "export { md5 } from './legacy.js';\n",
  "sha256.js": "export { sha256 } from './sha2.js';\n",
  "sha512.js": "export { sha512 } from './sha2.js';\n",
};

function collectPackageDirs() {
  const dirs = new Set();
  const candidates = [
    path.join(repoRoot, "node_modules", "@noble", "hashes"),
    path.join(
      repoRoot,
      "node_modules",
      ".bun",
      "@noble+hashes@2.2.0",
      "node_modules",
      "@noble",
      "hashes",
    ),
  ];

  const bunStoreDir = path.join(repoRoot, "node_modules", ".bun");
  if (fs.existsSync(bunStoreDir)) {
    for (const entry of fs.readdirSync(bunStoreDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith("@noble+hashes@")) {
        continue;
      }
      candidates.push(
        path.join(bunStoreDir, entry.name, "node_modules", "@noble", "hashes"),
      );
    }
  }

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "package.json"))) {
      dirs.add(candidate);
    }
  }

  return [...dirs];
}

function patchPackageDir(packageDir) {
  const packageJsonPath = path.join(packageDir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const exportsField = pkg.exports;
  if (!exportsField || typeof exportsField !== "object") {
    return false;
  }

  let changed = false;

  for (const [fileName, contents] of Object.entries(SHIM_FILES)) {
    const filePath = path.join(packageDir, fileName);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, contents);
      changed = true;
    }
    const bareKey = `./${fileName.replace(/\.js$/, "")}`;
    if (!exportsField[bareKey]) {
      exportsField[bareKey] = `./${fileName}`;
      changed = true;
    }
  }

  for (const subpath of DIRECT_EXPORT_ALIASES) {
    const bareKey = `./${subpath}`;
    const fileKey = `./${subpath}.js`;
    if (exportsField[bareKey] || !exportsField[fileKey]) {
      continue;
    }
    exportsField[bareKey] = exportsField[fileKey];
    changed = true;
  }

  if (!changed) {
    return false;
  }

  fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
  return true;
}

let patched = 0;
for (const packageDir of collectPackageDirs()) {
  if (patchPackageDir(packageDir)) {
    patched += 1;
    console.log(`${LOG_PREFIX} patched ${path.relative(repoRoot, packageDir)}`);
  }
}

if (patched === 0) {
  console.log(`${LOG_PREFIX} @noble/hashes export aliases already compatible.`);
}
