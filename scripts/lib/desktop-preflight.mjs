const EACCES_VIEW_PATTERN =
  /electrobun[\\/](?:node_modules[\\/])?view|electrobun[\\/](?:node_modules[\\/])?electrobun[\\/]view/i;

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

export function parseBunVersion(rawVersion) {
  const raw = String(rawVersion ?? "").trim();
  const versionToken = raw.split(/\s+/)[0] ?? "";
  const match = /^(\d+)\.(\d+)\.(\d+)(.*)$/.exec(versionToken);
  if (!match) {
    return {
      raw,
      major: null,
      minor: null,
      patch: null,
      channel: "unknown",
    };
  }
  const suffix = match[4] ?? "";
  const channel = /canary/i.test(suffix) ? "canary" : "stable";
  return {
    raw,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    channel,
  };
}

export function isSupportedBunVersion(rawVersion) {
  const parsed = parseBunVersion(rawVersion);
  if (
    parsed.major == null ||
    parsed.minor == null ||
    parsed.channel !== "stable"
  ) {
    return false;
  }
  if (parsed.major > 1) return true;
  return parsed.major === 1 && parsed.minor >= 3;
}

export function hasElectrobunViewExport(manifest) {
  if (!manifest || typeof manifest !== "object") return false;
  const exportsField = manifest.exports;
  if (!exportsField || typeof exportsField !== "object") return false;
  return Object.hasOwn(exportsField, "./view");
}

export function classifyElectrobunViewFailure(stderrText) {
  const text = String(stderrText ?? "");
  if (/EACCES/i.test(text) && EACCES_VIEW_PATTERN.test(text)) {
    return { code: "EACCES_ELECTROBUN_VIEW", actionable: true };
  }
  if (/Cannot read directory/i.test(text) && EACCES_VIEW_PATTERN.test(text)) {
    return { code: "EACCES_ELECTROBUN_VIEW", actionable: true };
  }
  return { code: "GENERIC_RESOLUTION_ERROR", actionable: false };
}

export function buildWindowsRepairSteps() {
  return [
    "Repair steps (Windows):",
    "1. Stop all Bun/Electrobun/Milady processes.",
    "2. Delete apps/app/electrobun/node_modules.",
    "3. Delete node_modules/.bun from the repo root.",
    "4. From repo root, run: bun install --frozen-lockfile",
    "5. Retry: bun run start:desktop",
  ];
}

export function resolveWorkspacePackageManifestPath(workspaceDir, packageName) {
  const req = createRequire(path.join(workspaceDir, "package.json"));
  let resolvedEntry;
  try {
    resolvedEntry = req.resolve(packageName);
  } catch {
    return null;
  }

  let dir = path.dirname(resolvedEntry);
  while (dir !== path.dirname(dir)) {
    const manifestPath = path.join(dir, "package.json");
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        if (manifest?.name === packageName) {
          return manifestPath;
        }
      } catch {
        return manifestPath;
      }
    }
    dir = path.dirname(dir);
  }

  return null;
}
