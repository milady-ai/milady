import fs from "node:fs";

const KEEP = [
  "eliza/packages/agent",
  "eliza/packages/app-core",
  "eliza/packages/shared",
  "eliza/packages/ui",
  "eliza/packages/app-core/platforms/electrobun",
  "eliza/packages/app-core/deploy/cloud-agent-template",
  "packages/app",
];
const ALLOW = new Set([
  "@elizaos/agent",
  "@elizaos/app-core",
  "@elizaos/shared",
  "@elizaos/ui",
]);
const PRUNE_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
  "overrides",
];
const STRIP_NAMES =
  /^@elizaos\/(app-|capacitor-|plugin-agent-orchestrator|plugin-app-control|plugin-cli|plugin-imessage|plugin-local-ai|plugin-pdf|plugin-wechat|steward-)/;
const VERSION_MANIFESTS = [
  "eliza/packages/core/package.json",
  "eliza/plugins/plugin-sql/package.json",
  "eliza/plugins/plugin-elizacloud/package.json",
];
const CLOUD_AGENT_RELEASE_DEPS = [
  "@elizaos/core",
  "@elizaos/plugin-sql",
  "@elizaos/plugin-elizacloud",
];
const CLOUD_SDK_PACKAGE_SPEC = "file:./eliza/cloud/packages/sdk";
const ELIZAOS_PACKAGE_SPECIFIER =
  process.env.MILADY_ELIZAOS_VERSION ??
  process.env.ELIZAOS_VERSION ??
  process.env.MILADY_ELIZAOS_DIST_TAG ??
  process.env.ELIZAOS_DIST_TAG ??
  process.env.MILADY_ELIZAOS_NPM_TAG ??
  process.env.ELIZAOS_NPM_TAG ??
  "alpha";
const PUBLISHED_RELEASE_DEPS = new Map([
  ["@elizaos/plugin-elizacloud", ELIZAOS_PACKAGE_SPECIFIER],
]);

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function writeJson(path, data) {
  fs.writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function requireRecord(target, key) {
  const value = target[key];
  if (value === undefined) {
    target[key] = {};
    return target[key];
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${key} must be an object`);
  }
  return value;
}

function collectVersions() {
  const versions = new Map();
  for (const manifest of VERSION_MANIFESTS) {
    const pkg = readJson(manifest);
    if (typeof pkg.name === "string" && typeof pkg.version === "string") {
      versions.set(pkg.name, pkg.version);
    }
  }
  return versions;
}

function materializeWorkspaceDeps(path, dependencyNames, versions) {
  const pkg = readJson(path);
  let changed = false;
  for (const name of dependencyNames) {
    const spec = pkg.dependencies?.[name];
    if (typeof spec !== "string" || !spec.startsWith("workspace:")) continue;
    const publishedSpec = PUBLISHED_RELEASE_DEPS.get(name);
    if (publishedSpec) {
      pkg.dependencies[name] = publishedSpec;
      changed = true;
      continue;
    }
    const version = versions.get(name);
    if (!version) throw new Error(`No local package version found for ${name}`);
    pkg.dependencies[name] = version;
    changed = true;
  }
  if (changed) writeJson(path, pkg);
}

function prune(path) {
  if (!fs.existsSync(path)) return;
  const pkg = readJson(path);
  for (const section of PRUNE_FIELDS) {
    const deps = pkg[section];
    if (!deps) continue;
    for (const [name, spec] of Object.entries(deps)) {
      const isWorkspace =
        typeof spec === "string" && spec.startsWith("workspace:");
      const isStripName = STRIP_NAMES.test(name);
      if ((isWorkspace && !ALLOW.has(name)) || isStripName) {
        delete deps[name];
      }
    }
  }
  writeJson(path, pkg);
}

materializeWorkspaceDeps(
  "eliza/packages/app-core/deploy/cloud-agent-template/package.json",
  CLOUD_AGENT_RELEASE_DEPS,
  collectVersions(),
);

const root = readJson("package.json");
root.workspaces = KEEP;
requireRecord(root, "dependencies")["@elizaos/cloud-sdk"] =
  CLOUD_SDK_PACKAGE_SPEC;
requireRecord(root, "overrides")["@elizaos/cloud-sdk"] = CLOUD_SDK_PACKAGE_SPEC;
writeJson("package.json", root);
[
  "package.json",
  "packages/app/package.json",
  "eliza/packages/agent/package.json",
  "eliza/packages/app-core/package.json",
  "eliza/packages/shared/package.json",
  "eliza/packages/ui/package.json",
  "eliza/packages/app-core/platforms/electrobun/package.json",
  "eliza/packages/app-core/deploy/cloud-agent-template/package.json",
].forEach(prune);
if (fs.existsSync("bun.lock")) fs.unlinkSync("bun.lock");
