#!/usr/bin/env node

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { applyUnpublishedPluginStubOverrides } from "./setup-upstreams.mjs";

const NESTED_ELIZA_SUBMODULE_SKIP_ARGS = [
  "-c",
  "submodule.plugin-openrouter.update=none",
];

function hasUninitializedNestedElizaSubmodules(
  elizaRoot,
  { errorLog = console.error } = {},
) {
  try {
    const status = execSync("git submodule status --recursive", {
      cwd: elizaRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return status
      .split("\n")
      .map((line) => line.trim())
      .some((line) => line.startsWith("-"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    errorLog(
      `restore-local-eliza-workspace: failed to inspect nested eliza submodules: ${detail}`,
    );
    throw error;
  }
}

export function ensureNestedElizaSubmodules(
  repoRoot = process.cwd(),
  { log = console.log, errorLog = console.error } = {},
) {
  const elizaRoot = path.join(repoRoot, "eliza");
  const nestedGitmodulesPath = path.join(elizaRoot, ".gitmodules");

  if (!fs.existsSync(elizaRoot) || !fs.existsSync(nestedGitmodulesPath)) {
    return false;
  }

  if (
    !hasUninitializedNestedElizaSubmodules(elizaRoot, {
      errorLog,
    })
  ) {
    log(
      "restore-local-eliza-workspace: nested eliza submodules already present.",
    );
    return false;
  }

  try {
    execSync("git submodule sync --recursive", {
      cwd: elizaRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    execSync(
      [
        "git",
        ...NESTED_ELIZA_SUBMODULE_SKIP_ARGS,
        "submodule",
        "update",
        "--init",
        "--recursive",
      ].join(" "),
      {
        cwd: elizaRoot,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    log("restore-local-eliza-workspace: initialized nested eliza submodules.");
    return true;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const message =
      "restore-local-eliza-workspace: failed to initialize nested eliza submodules: " +
      detail;
    errorLog(message);
    throw new Error(message, { cause: error });
  }
}

function restoreRootPackageJson(repoRoot, { log, errorLog }) {
  const backupPath = path.join(repoRoot, "package.json.pre-disable-backup");
  if (!fs.existsSync(backupPath)) {
    return false;
  }
  const packageJsonPath = path.join(repoRoot, "package.json");
  try {
    const original = fs.readFileSync(backupPath, "utf8");
    fs.writeFileSync(packageJsonPath, original);
    fs.unlinkSync(backupPath);
    log(
      "restore-local-eliza-workspace: restored root package.json from pre-disable backup.",
    );
    return true;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const message =
      "restore-local-eliza-workspace: failed to restore root package.json from backup: " +
      detail;
    errorLog(message);
    throw new Error(message, { cause: error });
  }
}

function restoreElizaPackageOverrides(repoRoot, { log, errorLog }) {
  const elizaRoot = path.join(repoRoot, "eliza");
  if (!fs.existsSync(path.join(elizaRoot, "package.json"))) {
    return 0;
  }

  try {
    const changed = applyUnpublishedPluginStubOverrides(elizaRoot);
    if (changed > 0) {
      log(
        "restore-local-eliza-workspace: restored unpublished plugin stub overrides in eliza/package.json.",
      );
    }
    return changed;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const message =
      "restore-local-eliza-workspace: failed to restore unpublished plugin stub overrides: " +
      detail;
    errorLog(message);
    throw new Error(message, { cause: error });
  }
}

export function restoreLocalElizaWorkspace(
  repoRoot = process.cwd(),
  { log = console.log, errorLog = console.error } = {},
) {
  const disabledElizaRoot = path.join(repoRoot, ".eliza.ci-disabled");
  const elizaRoot = path.join(repoRoot, "eliza");

  if (!fs.existsSync(disabledElizaRoot)) {
    if (!fs.existsSync(elizaRoot)) {
      log(
        "restore-local-eliza-workspace: .eliza.ci-disabled not present and eliza/ is missing; skipping restore.",
      );
      restoreRootPackageJson(repoRoot, { log, errorLog });
      return false;
    }
    ensureNestedElizaSubmodules(repoRoot, { log, errorLog });
    restoreRootPackageJson(repoRoot, { log, errorLog });
    restoreElizaPackageOverrides(repoRoot, { log, errorLog });
    log(
      "restore-local-eliza-workspace: eliza/ already present; nothing to restore.",
    );
    return false;
  }

  if (fs.existsSync(elizaRoot)) {
    ensureNestedElizaSubmodules(repoRoot, { log, errorLog });
    restoreRootPackageJson(repoRoot, { log, errorLog });
    restoreElizaPackageOverrides(repoRoot, { log, errorLog });
    log("restore-local-eliza-workspace: eliza/ already present; skipping.");
    return false;
  }

  try {
    fs.renameSync(disabledElizaRoot, elizaRoot);
    ensureNestedElizaSubmodules(repoRoot, { log, errorLog });
    restoreRootPackageJson(repoRoot, { log, errorLog });
    restoreElizaPackageOverrides(repoRoot, { log, errorLog });
    log(
      "restore-local-eliza-workspace: restored eliza/ from .eliza.ci-disabled/.",
    );
    return true;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const message =
      "restore-local-eliza-workspace: failed to rename .eliza.ci-disabled to eliza: " +
      detail;
    errorLog(message);
    throw new Error(message, { cause: error });
  }
}

export function isDirectRun(
  importMetaUrl = import.meta.url,
  argv1 = process.argv[1],
  pathResolve = path.resolve,
  toFileUrl = pathToFileURL,
) {
  return (
    typeof argv1 === "string" &&
    importMetaUrl === toFileUrl(pathResolve(argv1)).href
  );
}

if (isDirectRun()) {
  try {
    restoreLocalElizaWorkspace();
  } catch {
    process.exit(1);
  }
}
