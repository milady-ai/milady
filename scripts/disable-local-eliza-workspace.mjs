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

// `bun install` resolves every workspace glob; paths under `eliza/` break once
// this directory is renamed away for docker-smoke (published @elizaos/* only).
const packageJsonPath = path.join(repoRoot, "package.json");
const rawPkg = fs.readFileSync(packageJsonPath, "utf8");
const pkg = JSON.parse(rawPkg);
if (Array.isArray(pkg.workspaces)) {
	const before = pkg.workspaces.length;
	pkg.workspaces = pkg.workspaces.filter(
		(entry) => typeof entry !== "string" || !entry.startsWith("eliza/"),
	);
	const removed = before - pkg.workspaces.length;
	if (removed > 0) {
		fs.writeFileSync(
			packageJsonPath,
			`${JSON.stringify(pkg, null, 2)}\n`,
			"utf8",
		);
		console.log(
			`[disable-local-eliza-workspace] Dropped ${removed} eliza/* workspace entr${removed === 1 ? "y" : "ies"} from package.json`,
		);
	}
}
