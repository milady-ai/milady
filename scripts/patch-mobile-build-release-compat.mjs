#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

export const GRADLE_DISTRIBUTION =
  "https\\://services.gradle.org/distributions/gradle-9.4.1-all.zip";

const androidGradleWrappers = [
  "eliza/packages/app-core/platforms/android/gradle/wrapper/gradle-wrapper.properties",
  "node_modules/@capacitor/android/capacitor/gradle/wrapper/gradle-wrapper.properties",
  "apps/app/node_modules/@capacitor/android/capacitor/gradle/wrapper/gradle-wrapper.properties",
  "apps/app/android/gradle/wrapper/gradle-wrapper.properties",
];

const runMobileBuildPath =
  "eliza/packages/app-core/scripts/run-mobile-build.mjs";
const runMobileBuildPatchMarker =
  "function patchAndroidGradleWrapperForReleaseCompat()";

export function patchGradleWrapperText(source) {
  return source.replace(
    /^distributionUrl=.*$/m,
    `distributionUrl=${GRADLE_DISTRIBUTION}`,
  );
}

export function patchLlamaBuildGradleText(source) {
  return source
    .replaceAll(
      'namespace "ai.annadata.plugin.capacitor"',
      'namespace = "ai.annadata.plugin.capacitor"',
    )
    .replaceAll('version "3.22.1"', 'version = "3.22.1"')
    .replaceAll('ndkVersion "29.0.13113456"', 'ndkVersion = "29.0.13113456"')
    .replaceAll("abortOnError false", "abortOnError = false")
    .replaceAll(
      "getDefaultProguardFile('proguard-android.txt')",
      "getDefaultProguardFile('proguard-android-optimize.txt')",
    )
    .replace(
      /\n\s*\/\/ Disable clean tasks[^\n]*\n\s*tasks\.whenTaskAdded\s*\{\s*task\s*->\s*\n\s*if\s*\(\s*task\.name\.contains\(["']Clean["']\)\s*&&\s*task\.name\.contains\(["']Debug["']\)\s*\)\s*\{\s*\n\s*task\.enabled\s*=\s*false\s*\n\s*}\s*\n\s*}\s*/g,
      "\n",
    );
}

export function patchRunMobileBuildText(source) {
  if (source.includes(runMobileBuildPatchMarker)) {
    return source;
  }

  const anchor = "function patchAndroidGradle() {\n";
  if (!source.includes(anchor)) {
    throw new Error(
      "Unable to patch run-mobile-build.mjs: patchAndroidGradle anchor not found.",
    );
  }

  const distributionLiteral = JSON.stringify(
    `distributionUrl=${GRADLE_DISTRIBUTION}`,
  );

  return source.replace(
    anchor,
    `function patchAndroidGradleWrapperForReleaseCompat() {
  const wrapperPath = path.join(
    androidDir,
    "gradle",
    "wrapper",
    "gradle-wrapper.properties",
  );
  if (!fs.existsSync(wrapperPath)) return;
  const current = fs.readFileSync(wrapperPath, "utf8");
  const patched = current.replace(
    /^distributionUrl=.*$/m,
    ${distributionLiteral},
  );
  if (patched !== current) {
    fs.writeFileSync(wrapperPath, patched, "utf8");
    console.log("[mobile-build] Patched Android Gradle wrapper for AGP 9.");
  }
}

function patchAndroidGradle() {
  patchAndroidGradleWrapperForReleaseCompat();
`,
  );
}

function collectBunPackageGradlePaths(root, packageName) {
  const packageDirs = new Set();
  const directDirs = [
    path.join(root, "node_modules", packageName),
    path.join(root, "apps", "app", "node_modules", packageName),
  ];

  for (const packageDir of directDirs) {
    packageDirs.add(packageDir);
    try {
      packageDirs.add(fs.realpathSync(packageDir));
    } catch {
      // Package may not be installed for this job.
    }
  }

  for (const bunStore of [
    path.join(root, "node_modules", ".bun"),
    path.join(root, "apps", "app", "node_modules", ".bun"),
  ]) {
    if (!fs.existsSync(bunStore)) {
      continue;
    }
    for (const entry of fs.readdirSync(bunStore, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith(`${packageName}@`)) {
        continue;
      }
      packageDirs.add(
        path.join(bunStore, entry.name, "node_modules", packageName),
      );
    }
  }

  return [...packageDirs]
    .map((packageDir) => path.join(packageDir, "android", "build.gradle"))
    .filter((filePath, index, paths) => paths.indexOf(filePath) === index);
}

export function patchReleaseMobileBuildCompat({
  root = repoRoot,
  log = console.log,
  warn = console.warn,
} = {}) {
  let wrapperCount = 0;
  for (const relPath of androidGradleWrappers) {
    const wrapperPath = path.join(root, relPath);
    if (!fs.existsSync(wrapperPath)) {
      continue;
    }
    const current = fs.readFileSync(wrapperPath, "utf8");
    const patched = patchGradleWrapperText(current);
    if (patched !== current) {
      fs.writeFileSync(wrapperPath, patched, "utf8");
      log(`[mobile-release-compat] Aligned ${relPath}`);
    }
    wrapperCount += 1;
  }

  if (wrapperCount === 0) {
    throw new Error("Missing Android Gradle wrapper templates.");
  }

  const llamaGradlePaths = collectBunPackageGradlePaths(
    root,
    "llama-cpp-capacitor",
  );
  let llamaCount = 0;
  for (const gradlePath of llamaGradlePaths) {
    if (!fs.existsSync(gradlePath)) {
      continue;
    }
    const current = fs.readFileSync(gradlePath, "utf8");
    const patched = patchLlamaBuildGradleText(current);
    if (patched !== current) {
      fs.writeFileSync(gradlePath, patched, "utf8");
      log(`[mobile-release-compat] Patched ${path.relative(root, gradlePath)}`);
    }
    llamaCount += 1;
  }

  if (llamaCount === 0) {
    warn(
      "[mobile-release-compat] llama-cpp-capacitor Gradle file was not installed; skipped package patch.",
    );
  }

  const mobileBuildScriptPath = path.join(root, runMobileBuildPath);
  if (!fs.existsSync(mobileBuildScriptPath)) {
    warn(
      `[mobile-release-compat] ${runMobileBuildPath} was not present; skipped generated Android wrapper hook.`,
    );
    return;
  }

  const currentMobileBuildScript = fs.readFileSync(
    mobileBuildScriptPath,
    "utf8",
  );
  const patchedMobileBuildScript = patchRunMobileBuildText(
    currentMobileBuildScript,
  );
  if (patchedMobileBuildScript !== currentMobileBuildScript) {
    fs.writeFileSync(mobileBuildScriptPath, patchedMobileBuildScript, "utf8");
    log(
      `[mobile-release-compat] Patched ${runMobileBuildPath} to re-align generated Android Gradle wrappers`,
    );
  }
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  patchReleaseMobileBuildCompat();
}
