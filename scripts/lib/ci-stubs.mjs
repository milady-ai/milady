/**
 * Single source of truth for Milady's CI stub registry.
 *
 * The repo ships stub packages under scripts/ci-stubs/ for a few
 * @elizaos/* names that (a) are referenced as `workspace:*` from the
 * eliza monorepo but (b) are not published to npm. When the local
 * eliza workspace is disabled (CI paths like MILADY_SKIP_LOCAL_UPSTREAMS
 * where we install without the eliza/ tree), those `workspace:*`
 * specifiers need a local substitute so bun install doesn't fail.
 *
 * Consumed by:
 *   scripts/setup-upstreams.mjs
 *     - injects overrides into eliza/package.json before
 *       `bun install --cwd eliza` so the in-eliza workspace:*
 *       specifiers resolve to the stubs.
 *   scripts/disable-local-eliza-workspace.mjs
 *     - rewrites root package.json `overrides` to file: specifiers
 *       pointing at these stubs during CI installs that omit eliza/.
 *
 * Adding a stub: create scripts/ci-stubs/<name>/ with package.json +
 * index.js + index.d.ts, then append an entry here. Both consumers
 * pick it up automatically.
 */

/**
 * @typedef {object} CiStub
 * @property {string} packageName - npm scope/name the stub satisfies.
 * @property {string} stubDirName - directory name under scripts/ci-stubs/.
 * @property {string} elizaWorkspaceEntry - path within eliza/ that the
 *   in-eliza workspace graph normally resolves this name from. Used by
 *   setup-upstreams to know which workspace entry to override.
 */

/** @type {ReadonlyArray<CiStub>} */
export const CI_STUBS = Object.freeze([
  {
    packageName: "@elizaos/plugin-app-control",
    stubDirName: "elizaos-plugin-app-control",
    elizaWorkspaceEntry: "plugins/plugin-app-control/typescript",
  },
  {
    packageName: "@elizaos/plugin-wechat",
    stubDirName: "elizaos-plugin-wechat",
    elizaWorkspaceEntry: "plugins/plugin-wechat",
  },
]);

/**
 * Stub specifier shape for scripts/setup-upstreams.mjs's
 * UNPUBLISHED_ELIZA_PLUGIN_CI_STUBS layout.
 */
export function asSetupUpstreamsCiStubs() {
  return CI_STUBS.map(({ packageName, stubDirName, elizaWorkspaceEntry }) => ({
    packageName,
    workspaceEntry: elizaWorkspaceEntry,
    // Relative from eliza/ to the CI stub directory.
    stubRelativePath: `../scripts/ci-stubs/${stubDirName}`,
  }));
}

/**
 * Root-package.json overrides shape used by
 * scripts/disable-local-eliza-workspace.mjs.
 */
export function asRootOverridesSpecifiers() {
  const specifiers = {};
  for (const { packageName, stubDirName } of CI_STUBS) {
    specifiers[packageName] = `file:./scripts/ci-stubs/${stubDirName}`;
  }
  return specifiers;
}

/**
 * eliza/package.json overrides shape (paths are relative to eliza/).
 */
export function asElizaOverridesSpecifiers() {
  const specifiers = {};
  for (const { packageName, stubDirName } of CI_STUBS) {
    specifiers[packageName] = `file:../scripts/ci-stubs/${stubDirName}`;
  }
  return specifiers;
}
