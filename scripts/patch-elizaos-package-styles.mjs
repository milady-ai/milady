#!/usr/bin/env node

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const LOG_PREFIX = "[patch-elizaos-package-styles]";

function resolvePackageDir(packageName) {
  try {
    return path.dirname(require.resolve(`${packageName}/package.json`));
  } catch {
    return null;
  }
}

const appCoreDir = resolvePackageDir("@elizaos/app-core");
if (!appCoreDir) {
  console.warn(`${LOG_PREFIX} @elizaos/app-core is not installed; skipping.`);
  process.exit(0);
}

const stylesPath = path.join(appCoreDir, "styles/styles.css");
if (!fs.existsSync(stylesPath)) {
  console.warn(`${LOG_PREFIX} ${stylesPath} does not exist; skipping.`);
  process.exit(0);
}

const original = fs.readFileSync(stylesPath, "utf8");
const next = original
  .replace(
    '@import "../../../ui/src/styles/electrobun-mac-window-drag.css";',
    '@import "./electrobun-mac-window-drag.css";',
  )
  .replace('@source "../../../ui/src";', '@source "../packages/ui/src";')
  .replace('@source "../../../../apps/app-lifeops/src";\n', "");

if (next === original) {
  console.log(`${LOG_PREFIX} package stylesheet already compatible.`);
  process.exit(0);
}

fs.writeFileSync(stylesPath, next);
console.log(
  `${LOG_PREFIX} patched ${path.relative(process.cwd(), stylesPath)}`,
);
