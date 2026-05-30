# Topology baseline

Plumber baseline for the `apps/app` ↔ `@elizaos/*` boundary. Enforced by
`.dependency-cruiser.cjs` via `bun run check:flow` (+ `bun run check:cycles`),
wired into the CI **Lint & Format** job.

## Canonical lane

```
apps/app (client surface + bundler config)
  -> @elizaos/<pkg>/<subpath>        public package specifier
       (npm dist in packages mode, the default;
        alias-redirected to eliza/packages/* in local mode)
  -> @elizaos/app-core runtime
```

`apps/app/vite.config.ts` is itself a boundary artifact: it is bundled by Vite's
esbuild config loader **before** any `resolve.alias` exists, so its own imports
resolve purely by Node/esbuild module resolution. It must therefore use package
specifiers — or `createRequire.resolve("@elizaos/<pkg>/<subpath>")` (honors the
package `exports` map, ignores tsconfig `paths`, lands on compiled `dist/*.js`) —
never a relative reach into the clone.

## Forbidden edge (enforced)

`apps/app/**` (runtime + bundler code) importing by **relative path** into the
gitignored `eliza/` clone source — e.g. `../../eliza/packages/shared/src/*.ts`.
That edge resolves only in local mode and breaks the default packages mode / CI,
where `eliza/` is absent. This is the recurring CI Build break (vite.config
relative imports; reverted commits `b3060bf16` / `aa579b7fd`). Use
`@elizaos/<pkg>/<subpath>` instead.

`check:flow` rule: `no-reach-into-eliza-clone` — `from ^apps/app/` → `to /eliza/`.

## Documented exceptions

- **`apps/app/src/app-core-browser-compat.js`** — a latent local-mode-only source
  redirect, referenced solely via the `vite.config.ts` local-mode alias
  (`appCoreBrowserEntry`) and dead code in packages mode. Excluded in
  `.dependency-cruiser.cjs`.
- **`apps/app/test/**`** — NOT scanned. Packaged-Electrobun test helpers (e.g.
  `live-api.ts`) are local-mode-only by design and legitimately import eliza
  source; running that suite requires `bun run eliza:local`.

## Cycles

`madge --circular --extensions ts,tsx apps/app/src` → none. `check:cycles` guards
against regressions.

## Not yet machine-verified

Broader layer-direction rules (the full Clean-Architecture inward-only checks in
`AGENTS.md`) are NOT yet encoded here — only the one high-value forbidden edge +
cycles. Extend `.dependency-cruiser.cjs` when adding more.
