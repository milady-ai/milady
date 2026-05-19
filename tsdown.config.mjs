import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const configDir = path.dirname(fileURLToPath(import.meta.url));

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

function packageDistEntry(packageRoot, localRelativePath) {
  return path.join(
    packageRoot,
    localRelativePath
      .replace(/^src\//, "dist/")
      .replace(/\.[cm]?tsx?$/, ".js"),
  );
}

function appCoreEntry(subpath, localRelativePath) {
  const explicitEntry = explicitAppCoreEntry(localRelativePath);
  if (explicitEntry) {
    return explicitEntry;
  }

  const localPath = path.join(
    configDir,
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
    const packageEntry = packageDistEntry(packageRoot, localRelativePath);
    if (existsSync(packageEntry)) {
      return packageEntry;
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
  "jose",
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
const allExternals = [
  ...nativeExternals,
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
