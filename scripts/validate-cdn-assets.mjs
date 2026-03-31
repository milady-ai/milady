#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  buildManagedAssetUrl,
  resolveMiladyAssetRepository,
  resolveMiladyReleaseTag,
} from "./lib/asset-cdn.mjs";
import {
  readStaticAssetManifest,
  validateStaticAssetManifest,
} from "./lib/static-asset-manifest.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

async function validateGroup(files, { repository, releaseTag, assetRoot }) {
  const missing = [];
  for (const file of files) {
    const suffix = file.split("/").slice(3).join("/");
    const url = buildManagedAssetUrl({
      repository,
      releaseTag,
      assetRoot,
      assetPath: suffix,
    });
    const response = await fetch(url, { method: "HEAD" });
    if (!response.ok) {
      missing.push(`${response.status} ${url}`);
    }
  }
  return missing;
}

async function main() {
  const releaseTag = resolveMiladyReleaseTag();
  const repository = resolveMiladyAssetRepository();
  if (!releaseTag) {
    throw new Error(
      "Could not resolve release tag for CDN validation. Set MILADY_RELEASE_TAG or RELEASE_TAG.",
    );
  }

  const manifestValidation = validateStaticAssetManifest(repoRoot);
  if (!manifestValidation.ok) {
    throw new Error(
      `Static asset manifest is ${manifestValidation.reason}. Run node scripts/generate-static-asset-manifest.mjs.`,
    );
  }

  const manifest = readStaticAssetManifest(repoRoot);
  if (!manifest) {
    throw new Error("Static asset manifest is missing.");
  }
  const [missingApp, missingHomepage] = await Promise.all([
    validateGroup(manifest.app, {
      repository,
      releaseTag,
      assetRoot: "apps/app/public",
    }),
    validateGroup(manifest.homepage, {
      repository,
      releaseTag,
      assetRoot: "apps/homepage/public",
    }),
  ]);

  const missing = [...missingApp, ...missingHomepage];
  if (missing.length > 0) {
    console.error("validate-cdn-assets: missing CDN files:");
    for (const entry of missing) {
      console.error(`  - ${entry}`);
    }
    process.exit(1);
  }

  console.log(
    `validate-cdn-assets: verified ${manifest.app.length + manifest.homepage.length} managed asset URLs for ${releaseTag}.`,
  );
}

await main();
