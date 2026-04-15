// @ts-check

import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * @typedef {import("./package-types.d.ts").JsonObject} JsonObject
 * @typedef {import("./package-types.d.ts").PackageJsonRecord} PackageJsonRecord
 * @typedef {import("./package-types.d.ts").PackageLinkDescriptor} PackageLinkDescriptor
 * @typedef {import("./package-types.d.ts").PackageStringMap} PackageStringMap
 * @typedef {import("./package-types.d.ts").VendoredPackageRecord} VendoredPackageRecord
 * @typedef {import("./package-types.d.ts").PackageWorkspaceSpec} PackageWorkspaceSpec
 */

/**
 * @param {unknown} value
 * @returns {value is JsonObject}
 */
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {value is string[]}
 */
function isStringArray(value) {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

/**
 * @param {unknown} value
 * @returns {value is PackageStringMap}
 */
function isStringMap(value) {
  return (
    isPlainObject(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

/**
 * @param {unknown} value
 * @returns {value is PackageWorkspaceSpec}
 */
function isWorkspaceSpec(value) {
  return (
    isStringArray(value) ||
    (isPlainObject(value) &&
      (value.packages === undefined || isStringArray(value.packages)))
  );
}

/**
 * @param {unknown} value
 * @returns {value is PackageJsonRecord}
 */
function isPackageJsonRecord(value) {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    (value.name === undefined || typeof value.name === "string") &&
    (value.version === undefined || typeof value.version === "string") &&
    (value.bin === undefined ||
      typeof value.bin === "string" ||
      isStringMap(value.bin)) &&
    (value.dependencies === undefined || isStringMap(value.dependencies)) &&
    (value.devDependencies === undefined ||
      isStringMap(value.devDependencies)) &&
    (value.optionalDependencies === undefined ||
      isStringMap(value.optionalDependencies)) &&
    (value.peerDependencies === undefined ||
      isStringMap(value.peerDependencies)) &&
    (value.overrides === undefined || isStringMap(value.overrides)) &&
    (value.bundleDependencies === undefined ||
      typeof value.bundleDependencies === "boolean" ||
      isStringArray(value.bundleDependencies)) &&
    (value.workspaces === undefined || isWorkspaceSpec(value.workspaces))
  );
}

function parsePackageJson(rawJson) {
  try {
    const parsed = JSON.parse(rawJson);
    return isPackageJsonRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Read and parse a package.json from the given directory.
 * Returns the parsed object, or `null` if the file is missing or malformed.
 *
 * @param {string} dir — directory containing the package.json
 * @returns {PackageJsonRecord | null}
 */
export function readPackageJson(dir) {
  try {
    return parsePackageJson(
      readFileSync(path.join(dir, "package.json"), "utf8"),
    );
  } catch {
    return null;
  }
}

/**
 * Build a Map of vendored @elizaos/* package names to their local directory and version.
 * Combines results from `getElizaPackageLinks` and `getPluginPackageLinks`.
 *
 * @param {ReadonlyArray<PackageLinkDescriptor>} links - package link descriptors from setup-upstreams
 * @returns {Map<string, VendoredPackageRecord>}
 */
export function buildVendoredPackageMap(links) {
  /** @type {Map<string, VendoredPackageRecord>} */
  const vendored = new Map();
  for (const link of links) {
    const pkg = readPackageJson(link.targetPath);
    if (pkg?.name && typeof pkg.version === "string") {
      vendored.set(pkg.name, { dir: link.targetPath, version: pkg.version });
    }
  }
  return vendored;
}
