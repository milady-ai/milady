const env = {
  NODE_ENV: "production",
};

// Native .node packages must stay external; rolldown cannot bundle shared libraries.
const nativeExternals = [
  "node-llama-cpp",
  "@reflink/reflink",
  "@reflink/reflink-darwin-arm64",
  "@reflink/reflink-darwin-x64",
  "@reflink/reflink-linux-arm64-gnu",
  "@reflink/reflink-linux-x64-gnu",
  "fsevents",
  // Keep React external for Node server builds; bundling it introduces incompatible wrappers.
  "react",
  "react-dom",
];

// Runtime-loaded @elizaos/plugin-* packages must stay external.
const pluginExternal = /^@elizaos\/plugin-/;
const optionalAppExternal = /^@elizaos\/app-/;
const allExternals = [...nativeExternals, pluginExternal, optionalAppExternal];

export default [
  {
    entry: "eliza/packages/app-core/src/index.ts",
    env,
    fixedExtension: false,
    platform: "node",
    inlineOnly: false,
    external: allExternals,
  },
  {
    entry: "eliza/packages/app-core/src/entry.ts",
    env,
    fixedExtension: false,
    platform: "node",
    unbundle: true,
    inlineOnly: false,
    external: allExternals,
  },
  {
    entry: "eliza/packages/app-core/src/runtime/eliza.ts",
    env,
    fixedExtension: false,
    platform: "node",
    inlineOnly: false,
    external: allExternals,
    outputOptions: { codeSplitting: false },
  },
  {
    entry: "eliza/packages/app-core/src/api/server.ts",
    env,
    fixedExtension: false,
    platform: "node",
    inlineOnly: false,
    external: allExternals,
    // Disable code splitting to avoid circular imports in server.js.
    outputOptions: { codeSplitting: false },
  },
];
