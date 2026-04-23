#!/usr/bin/env node

import {
  ensureRequiredElizaPluginBuilds,
  linkUpstreamPackages,
} from "./setup-upstreams.mjs";

const repoRoot = process.cwd();
await ensureRequiredElizaPluginBuilds(repoRoot);

const linkedEntries = linkUpstreamPackages(repoRoot);

if (linkedEntries === 0) {
  console.log(
    "[link-local-eliza-workspace] Local eliza workspace links already current.",
  );
} else {
  console.log(
    `[link-local-eliza-workspace] Linked ${linkedEntries} local eliza workspace ${linkedEntries === 1 ? "entry" : "entries"}.`,
  );
}
