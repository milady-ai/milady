import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

const env = {
  NODE_ENV: "production",
};

function localUpstreamsDisabled() {
  const sourceMode = (
    process.env.MILADY_ELIZA_SOURCE ??
    process.env.ELIZA_SOURCE ??
    "packages"
  ).toLowerCase();
  return (
    ["package", "packages", "published", "npm", "registry", "global"].includes(
      sourceMode,
    ) ||
    process.env.MILADY_SKIP_LOCAL_UPSTREAMS === "1" ||
    process.env.ELIZA_SKIP_LOCAL_UPSTREAMS === "1"
  );
}

function explicitAppCoreEntry(localRelativePath) {
  const rawRoot =
    process.env.MILADY_ELIZA_APP_CORE_ROOT ?? process.env.ELIZA_APP_CORE_ROOT;
  if (!rawRoot) {
    return null;
  }
  const entry = path.join(rawRoot, localRelativePath);
  if (!existsSync(entry)) {
    throw new Error(
      `MILADY_ELIZA_APP_CORE_ROOT is missing ${localRelativePath}`,
    );
  }
  return entry;
}

function appCoreEntry(subpath, localRelativePath) {
  const explicitEntry = explicitAppCoreEntry(localRelativePath);
  if (explicitEntry) {
    return explicitEntry;
  }

  const localPath = path.join(
    "eliza",
    "packages",
    "app-core",
    localRelativePath,
  );
  if (!localUpstreamsDisabled() && existsSync(localPath)) {
    return localPath;
  }

  const packageSubpath =
    subpath === "." ? "@elizaos/app-core" : `@elizaos/app-core/${subpath}`;
  try {
    return require.resolve(packageSubpath);
  } catch (error) {
    const packageJsonPath = require.resolve("@elizaos/app-core/package.json");
    const packageRoot = path.dirname(packageJsonPath);
    const jsRelativePath = localRelativePath.replace(/\.[cm]?tsx?$/, ".js");
    const packageEntryCandidates = [
      path.join(packageRoot, localRelativePath),
      path.join(packageRoot, jsRelativePath),
      path.join(packageRoot, "dist", jsRelativePath.replace(/^src\//, "")),
      path.join(packageRoot, "packages/app-core", jsRelativePath),
    ];
    for (const packageEntry of packageEntryCandidates) {
      if (existsSync(packageEntry)) {
        return packageEntry;
      }
    }
    throw error;
  }
}

// Native .node packages must stay external; rolldown cannot bundle shared libraries.
const nativeExternals = [
  "node-llama-cpp",
  "@reflink/reflink",
  "@reflink/reflink-darwin-arm64",
  "@reflink/reflink-darwin-x64",
  "@reflink/reflink-linux-arm64-gnu",
  "@reflink/reflink-linux-x64-gnu",
  "fsevents",
  // jose is intentionally NOT external. It is pure-ESM JavaScript (no native
  // bindings), so rolldown bundles it inline. Keeping it external left it as a
  // bare `import "jose"` in dist/entry.js that Node-style resolution couldn't
  // find when the dep wasn't hoisted to the top-level node_modules, surfacing
  // as ERR_MODULE_NOT_FOUND outside Bun's workspace loader (elizaOS/eliza#8142).
  // Bun 1.3.13 fails evaluating Rolldown's unbundled ESM init wrappers for adze.
  // Keep the package external so the desktop runtime loads its published ESM files.
  "adze",
  // Keep React external for Node server builds; bundling it introduces incompatible wrappers.
  "react",
  "react-dom",
];

// Runtime-loaded @elizaos/plugin-* packages must stay external.
const pluginExternal = /^@elizaos\/plugin-/;
const optionalAppExternal = /^@elizaos\/app-/;
// @node-rs/* ships native .node bindings per platform (argon2 + arch
// variants like @node-rs/argon2-darwin-arm64). Single regex covers all
// of them — always external; rolldown can't bundle the .node binary.
const nodeRsExternal = /^@node-rs\//;
const napiRsExternal = /^@napi-rs\//;
// @elizaos/vault is a runtime-loaded workspace service (secrets manager),
// declared as a workspace:* dependency and resolved from node_modules at
// runtime. Unlike @elizaos/core / @elizaos/shared (intentionally inlined into
// the node bundle), rolldown cannot cleanly bundle it, so it was being
// implicitly externalized with an UNRESOLVED_IMPORT warning. List it explicitly
// so the externalization is intentional and the warning goes away.
const vaultExternal = "@elizaos/vault";
const allExternals = [
  ...nativeExternals,
  vaultExternal,
  pluginExternal,
  optionalAppExternal,
  nodeRsExternal,
  napiRsExternal,
];

export default [
  {
    entry: appCoreEntry(".", "src/index.ts"),
    env,
    fixedExtension: false,
    platform: "node",
    inlineOnly: false,
    external: allExternals,
  },
  {
    entry: appCoreEntry("entry", "src/entry.ts"),
    env,
    fixedExtension: false,
    platform: "node",
    inlineOnly: false,
    external: allExternals,
    outputOptions: { codeSplitting: false },
  },
  {
    entry: appCoreEntry("runtime/eliza", "src/runtime/eliza.ts"),
    env,
    fixedExtension: false,
    platform: "node",
    inlineOnly: false,
    external: allExternals,
    outputOptions: { codeSplitting: false },
  },
  {
    entry: appCoreEntry("api/server", "src/api/server.ts"),
    env,
    fixedExtension: false,
    platform: "node",
    inlineOnly: false,
    external: allExternals,
    // Disable code splitting to avoid circular imports in server.js.
    outputOptions: { codeSplitting: false },
  },
];
