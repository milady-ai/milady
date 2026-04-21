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

if (!fs.existsSync(elizaRoot)) {
  console.log(
    "[disable-local-eliza-workspace] Repo-local eliza workspace already absent",
  );
  process.exit(0);
}

fs.rmSync(disabledElizaRoot, { recursive: true, force: true });
fs.renameSync(elizaRoot, disabledElizaRoot);

console.log(
  `[disable-local-eliza-workspace] Disabled repo-local eliza workspace at ${elizaRoot}`,
);
