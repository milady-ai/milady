/**
 * Plumber flow guard - keeps the apps/app (client surface + bundler config) ->
 * @elizaos/* (runtime/shared) boundary clean.
 *
 * The recurring CI break is apps/app reaching by relative path into the
 * gitignored eliza/ clone source (e.g. ../../eliza/packages/shared/src/*.ts).
 * That edge resolves only in local mode and fails in the default packages mode /
 * CI, where eliza/ is absent. Cross-package access must go through
 * @elizaos/<pkg>/<subpath> package specifiers (npm dist in packages mode,
 * alias-redirected to the clone in local mode).
 *
 * Scope: the production bundler + runtime surface only (apps/app/src +
 * vite.config.ts). apps/app/test is intentionally not guarded - packaged
 * Electrobun test helpers (e.g. live-api.ts) are local-mode-only by design and
 * legitimately import eliza source. See .claude/topology.md.
 *
 * Run: bun run check:flow      Cycles: bun run check:cycles
 */
module.exports = {
  forbidden: [
    {
      name: "no-reach-into-eliza-clone",
      comment:
        "apps/app runtime + bundler code must consume @elizaos/* via package " +
        "specifiers, never by a relative path into the gitignored eliza/ clone " +
        "source. Use @elizaos/<pkg>/<subpath> instead of ../../eliza/packages/...",
      severity: "error",
      from: { path: "^apps/app/" },
      to: { path: "(^|/)eliza/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: {
      path: ["node_modules", "apps/app/src/app-core-browser-compat\\.js$"],
    },
    tsPreCompilationDeps: true,
  },
};
