#!/usr/bin/env node
/**
 * iOS App Store readiness pre-flight for the Milady Capacitor app.
 *
 * Checks structural prerequisites that block App Store submission:
 *   - PrivacyInfo.xcprivacy declares every required key Apple expects.
 *   - App.entitlements declares the entitlements the app actually uses.
 *   - The generated Podfile does not include `LlamaCppCapacitor` unless
 *     MILADY_IOS_INCLUDE_LLAMA=1 (the default App Store binary is the
 *     thin-client cloud build with no on-device inference).
 *
 * This is the milady-side analogue of
 * `eliza/scripts/launch-qa/check-store-security.mjs` — the eliza version
 * checks paths inside the eliza repo (`packages/app/ios/...`); this version
 * checks the milady-host iOS bundle at `apps/app/ios/App/App/`.
 *
 * Exits 0 on pass, 1 on failure.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const REQUIRED_PRIVACY_KEYS = [
  "NSPrivacyAccessedAPITypes",
  "NSPrivacyAccessedAPICategoryUserDefaults",
  "NSPrivacyCollectedDataTypes",
  "NSPrivacyTracking",
  "NSPrivacyTrackingDomains",
];

const REQUIRED_ENTITLEMENT_KEYS = [
  "aps-environment",
  "com.apple.developer.family-controls",
  "com.apple.developer.healthkit",
  "com.apple.developer.healthkit.background-delivery",
  "com.apple.security.application-groups",
];

const PRIVACY_INFO_PATHS = [
  "apps/app/ios/App/App/PrivacyInfo.xcprivacy",
  "eliza/packages/app-core/platforms/ios/App/App/PrivacyInfo.xcprivacy",
];

const ENTITLEMENTS_PATHS = [
  "apps/app/ios/App/App/App.entitlements",
  "eliza/packages/app-core/platforms/ios/App/App/App.entitlements",
];

const PODFILE_PATH = "apps/app/ios/App/Podfile";

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function checkFileContains(absPath, relPath, requiredKeys) {
  const content = readText(absPath);
  if (content === null) {
    return {
      ok: false,
      file: relPath,
      reason: "missing",
      missing: requiredKeys,
    };
  }
  const missing = requiredKeys.filter((key) => !content.includes(key));
  return {
    ok: missing.length === 0,
    file: relPath,
    reason: missing.length === 0 ? "ok" : "incomplete",
    missing,
  };
}

function checkPodfileLlamaGate() {
  const absPath = path.join(repoRoot, PODFILE_PATH);
  const content = readText(absPath);
  if (content === null) {
    // If the Podfile hasn't been generated yet, this is not an error per
    // se — `bun run build:ios:cloud` will generate it. Surface as a
    // soft-info note instead of a hard failure.
    return {
      ok: true,
      file: PODFILE_PATH,
      reason: "podfile-not-generated",
    };
  }
  const includeLlama =
    /^(1|true|yes|on)$/i.test(
      String(process.env.MILADY_IOS_INCLUDE_LLAMA ?? "").trim(),
    ) ||
    /^(1|true|yes|on)$/i.test(
      String(process.env.ELIZA_IOS_INCLUDE_LLAMA ?? "").trim(),
    );
  const podPresent = /pod\s+'LlamaCppCapacitor'/.test(content);
  if (includeLlama && !podPresent) {
    return {
      ok: false,
      file: PODFILE_PATH,
      reason: "llama-flag-set-but-pod-missing",
    };
  }
  if (!includeLlama && podPresent) {
    return {
      ok: false,
      file: PODFILE_PATH,
      reason: "llama-flag-unset-but-pod-present",
    };
  }
  return { ok: true, file: PODFILE_PATH, reason: "ok" };
}

function main() {
  const errors = [];
  const checks = [];

  for (const rel of PRIVACY_INFO_PATHS) {
    const result = checkFileContains(
      path.join(repoRoot, rel),
      rel,
      REQUIRED_PRIVACY_KEYS,
    );
    checks.push({ id: `ios-privacy:${rel}`, ...result });
    if (!result.ok) errors.push(result);
  }

  for (const rel of ENTITLEMENTS_PATHS) {
    const result = checkFileContains(
      path.join(repoRoot, rel),
      rel,
      REQUIRED_ENTITLEMENT_KEYS,
    );
    checks.push({ id: `ios-entitlements:${rel}`, ...result });
    if (!result.ok) errors.push(result);
  }

  const podCheck = checkPodfileLlamaGate();
  checks.push({ id: "ios-podfile-llama-gate", ...podCheck });
  if (!podCheck.ok) errors.push(podCheck);

  const wantJson = process.argv.includes("--json");
  const result = {
    ok: errors.length === 0,
    repoRoot,
    checkedAt: new Date().toISOString(),
    summary: { checkCount: checks.length, errorCount: errors.length },
    checks,
    errors,
  };
  if (wantJson) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.ok) {
    console.log(
      `[ios-store-readiness] PASS ${result.summary.checkCount} static check(s)`,
    );
  } else {
    console.error(
      `[ios-store-readiness] FAIL ${result.summary.errorCount} issue(s) across ${result.summary.checkCount} static check(s)`,
    );
    for (const err of errors) {
      const detail = err.missing?.length
        ? ` missing: ${err.missing.join(", ")}`
        : "";
      console.error(`- ${err.file} (${err.reason})${detail}`);
    }
  }
  process.exit(result.ok ? 0 : 1);
}

main();
