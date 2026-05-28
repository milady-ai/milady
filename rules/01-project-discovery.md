# 01 — Project Discovery

Inspect before editing:

- `package.json`, `bun.lock`, `bun.lockb`, `.npmrc`, `tsconfig.json`.
- `electrobun.config.ts`: app metadata, entrypoints, views, copy assets, platform build options, `release.baseUrl`, signing/notarization, CEF/native renderer strategy, URL schemes.
- `src/bun/**`: main process, window creation, menus, tray, updater, lifecycle, model routes, tools.
- `src/shared/**`: RPC schemas, DTOs, validation, constants.
- `src/*view/**`: HTML/CSS/TS/React/Svelte/Vue/Solid view code.
- `tests/**`, `*.test.ts`, `eval_cases*.json`, CI/workflows.
- `scripts/**` and release/upload automation.
- Secrets handling, `.env.example`, and docs; never read or print real secret values.

Return a short discovery summary before any nontrivial change.
