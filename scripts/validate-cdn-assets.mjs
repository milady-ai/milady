#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  buildReleaseValidationAssetUrl,
  resolveMiladyAssetRepository,
  resolveMiladyReleaseTag,
} from "./lib/asset-cdn.mjs";
import {
  readStaticAssetManifest,
  validateStaticAssetManifest,
} from "./lib/static-asset-manifest.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const CI_RETRYABLE_STATUSES = new Set([0, 429, 500, 502, 503, 504]);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getValidationRetryPolicy({ env = process.env } = {}) {
  const explicitAttempts = Number.parseInt(
    env.MILADY_CDN_VALIDATE_ATTEMPTS ?? "",
    10,
  );
  const explicitDelayMs = Number.parseInt(
    env.MILADY_CDN_VALIDATE_DELAY_MS ?? "",
    10,
  );
  const inCi = String(env.CI ?? "").toLowerCase() === "true";

  return {
    attempts:
      Number.isFinite(explicitAttempts) && explicitAttempts > 0
        ? explicitAttempts
        : inCi
          ? 3
          : 1,
    delayMs:
      Number.isFinite(explicitDelayMs) && explicitDelayMs >= 0
        ? explicitDelayMs
        : inCi
          ? 5000
          : 0,
  };
}

async function headManagedAssetUrl(url) {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return {
      ok: response.ok,
      status: response.status,
      url,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      url,
    };
  }
}

async function probeManagedAssetUrl(url, retryPolicy) {
  let result = await headManagedAssetUrl(url);
  if (result.ok) {
    return result;
  }

  const isRetryable =
    CI_RETRYABLE_STATUSES.has(result.status) && retryPolicy.attempts > 1;
  if (!isRetryable) {
    return result;
  }

  for (let attempt = 2; attempt <= retryPolicy.attempts; attempt += 1) {
    if (retryPolicy.delayMs > 0) {
      await delay(retryPolicy.delayMs);
    }
    result = await headManagedAssetUrl(url);
    if (result.ok) {
      return result;
    }
  }

  return result;
}

async function validateGroup(
  files,
  { repository, releaseTag, assetRoot, retryPolicy },
) {
  let pending = files.map((file) => {
    const suffix = file.split("/").slice(3).join("/");
    return buildReleaseValidationAssetUrl({
      repository,
      releaseTag,
      assetRoot,
      assetPath: suffix,
    });
  });
  let lastMissing = [];

  for (let attempt = 1; attempt <= retryPolicy.attempts; attempt += 1) {
    const responses = await Promise.all(
      pending.map(async (url) => ({
        url,
        response:
          attempt === 1
            ? await headManagedAssetUrl(url)
            : await probeManagedAssetUrl(url, { attempts: 1, delayMs: 0 }),
      })),
    );

    const missing = [];
    const retryable = [];
    for (const { url, response } of responses) {
      if (response.ok) {
        continue;
      }

      if (
        attempt < retryPolicy.attempts &&
        CI_RETRYABLE_STATUSES.has(response.status)
      ) {
        retryable.push(url);
        continue;
      }

      missing.push(`${response.status} ${url}`);
    }
    lastMissing = missing;

    if (missing.length > 0 && retryable.length === 0) {
      return missing;
    }

    if (retryable.length === 0) {
      return [];
    }

    pending = retryable;
    if (retryPolicy.delayMs > 0) {
      await delay(retryPolicy.delayMs);
    }
  }

  return lastMissing;
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
  const retryPolicy = getValidationRetryPolicy();
  const [missingApp, missingHomepage] = await Promise.all([
    validateGroup(manifest.app, {
      repository,
      releaseTag,
      assetRoot: "apps/app/public",
      retryPolicy,
    }),
    validateGroup(manifest.homepage, {
      repository,
      releaseTag,
      assetRoot: "apps/homepage/public",
      retryPolicy,
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
