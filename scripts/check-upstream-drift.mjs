#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildVendoredPackageMap } from "./lib/read-package-json.mjs";
import {
  getElizaPackageLinks,
  getPluginPackageLinks,
  getPublishedElizaPackageSpecs,
} from "./setup-upstreams.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

function checkUpstreamDrift() {
  let hasDrift = false;

  const pinnedDeps = getPublishedElizaPackageSpecs(ROOT);

  if (pinnedDeps.length === 0) {
    console.log(
      "[check-upstream-drift] No explicitly pinned @elizaos/* dependency specs found. Everything uses workspace:*. No drift possible.",
    );
    return;
  }

  console.log(
    `[check-upstream-drift] Found ${pinnedDeps.length} pinned @elizaos/* dependency spec(s). Verifying against vendored sources...`,
  );

  const vendoredPackages = buildVendoredPackageMap([
    ...getElizaPackageLinks(ROOT),
    ...getPluginPackageLinks(ROOT),
  ]);

  for (const [packageName, specVersion] of pinnedDeps) {
    const localSource = vendoredPackages.get(packageName);
    if (!localSource) {
      console.warn(
        `[check-upstream-drift] WARNING: Pinned package ${packageName}@${specVersion} is not vendored locally.`,
      );
      continue;
    }

    if (localSource.version !== specVersion) {
      console.error(
        `[check-upstream-drift] ERROR: Drift detected in ${packageName}!`,
      );
      console.error(`  - Root dependency spec: ${specVersion}`);
      console.error(
        `  - Vendored source version: ${localSource.version} (at ${path.relative(ROOT, localSource.dir)})`,
      );
      hasDrift = true;
    } else {
      console.log(
        `[check-upstream-drift] OK: ${packageName} matches vendored version (${specVersion}).`,
      );
    }
  }

  if (hasDrift) {
    console.error(
      "\n[check-upstream-drift] FAILED: Upstream drift detected. Please align root package.json dependency specs with vendored package.json versions.",
    );
    process.exit(1);
  } else {
    console.log(
      "\n[check-upstream-drift] PASS: All vendored versions match dependency specs exactly.",
    );
  }
}

checkUpstreamDrift();
