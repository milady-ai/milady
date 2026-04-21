#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const skipLocalUpstreams =
  process.env.MILADY_SKIP_LOCAL_UPSTREAMS === "1" ||
  process.env.ELIZA_SKIP_LOCAL_UPSTREAMS === "1";

if (!skipLocalUpstreams || process.env.GITHUB_ACTIONS !== "true") {
  process.exit(0);
}

const repoRoot = process.cwd();
const elizaRoot = path.join(repoRoot, "eliza");
const disabledElizaRoot = path.join(repoRoot, ".eliza.ci-disabled");

function resolveLinkTarget(linkPath) {
  const raw = fs.readlinkSync(linkPath);
  return path.resolve(path.dirname(linkPath), raw);
}

function elizaAlreadyLinkedToDisabled() {
  try {
    const st = fs.lstatSync(elizaRoot);
    if (!st.isSymbolicLink()) {
      return false;
    }
    return resolveLinkTarget(elizaRoot) === disabledElizaRoot;
  } catch {
    return false;
  }
}

function linkElizaToDisabledTree() {
  if (process.platform === "win32") {
    // Directory junction: target must be an absolute path.
    fs.symlinkSync(disabledElizaRoot, elizaRoot, "junction");
  } else {
    // Relative link keeps the tree relocatable within the repo checkout.
    fs.symlinkSync(".eliza.ci-disabled", elizaRoot, "dir");
  }
}

if (!fs.existsSync(elizaRoot) && fs.existsSync(disabledElizaRoot)) {
  console.log(
    "[disable-local-eliza-workspace] Recreating eliza/ symlink to .eliza.ci-disabled",
  );
  linkElizaToDisabledTree();
  process.exit(0);
}

if (!fs.existsSync(elizaRoot)) {
  console.log(
    "[disable-local-eliza-workspace] Repo-local eliza workspace already absent",
  );
  process.exit(0);
}

if (elizaAlreadyLinkedToDisabled()) {
  console.log(
    "[disable-local-eliza-workspace] eliza/ already points at .eliza.ci-disabled",
  );
  process.exit(0);
}

fs.rmSync(disabledElizaRoot, { recursive: true, force: true });
fs.renameSync(elizaRoot, disabledElizaRoot);

console.log(
  `[disable-local-eliza-workspace] Moved eliza/ to ${disabledElizaRoot}`,
);

linkElizaToDisabledTree();
console.log(
  "[disable-local-eliza-workspace] Linked eliza/ -> .eliza.ci-disabled so workspace paths keep resolving for bun install",
);
