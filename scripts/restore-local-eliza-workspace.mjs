#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function restoreLocalElizaWorkspace(
  repoRoot = process.cwd(),
  { log = console.log, errorLog = console.error } = {},
) {
  const disabledElizaRoot = path.join(repoRoot, ".eliza.ci-disabled");
  const elizaRoot = path.join(repoRoot, "eliza");

  if (!fs.existsSync(disabledElizaRoot)) {
    log(
      "restore-local-eliza-workspace: .eliza.ci-disabled not present; skipping restore.",
    );
    return false;
  }

  if (fs.existsSync(elizaRoot)) {
    log("restore-local-eliza-workspace: eliza/ already present; skipping.");
    return false;
  }

  try {
    fs.renameSync(disabledElizaRoot, elizaRoot);
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
