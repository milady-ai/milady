# AGENTS.md — Electrobun Agentic Desktop 2026

You are coding in an Electrobun/Bun/TypeScript desktop repository.

## Operating contract

1. **Inspect before editing.** Read `package.json`, `bun.lock`/`bun.lockb`, `electrobun.config.ts`, `tsconfig.json`, `src/bun`, `src/shared`, view folders, tests, scripts, release config, and CI before changes.
2. **Make small compiling changes.** Preserve TypeScript strictness, package manager choice, existing UI framework, project structure, and release workflow unless explicitly asked to refactor.
3. **Use Electrobun-native APIs first.** Prefer `BrowserWindow`, `BrowserView`, `Electroview`, typed RPC, `views://` bundled assets, `Tray`, `ApplicationMenu`, `ContextMenu`, `Updater`, `Events`, `BuildConfig`, Bun test/bundler/runtime APIs, `Bun.secrets`, and `bun:sqlite` when appropriate.
4. **Type all agent boundaries.** Model inputs/outputs, tool schemas, RPC request/response contracts, persistence DTOs, network DTOs, eval fixtures, and UI events must be explicitly typed and runtime-validated where data crosses trust boundaries.
5. **Treat agent tools as privileged.** Every tool needs a narrow name, typed input/output, explicit permission/read-write class, timeout, cancellation, error mapping, logging policy, tests, and privacy impact.
6. **Typed RPC is the system surface.** Stable repeatable actions should be reachable through RPC, command palette, application menu, tray menu, context menu, and deep links where platform support exists.
7. **Sandbox untrusted content.** Any third-party/user-provided URL must use `sandbox: true` or the `sandbox` attribute, no RPC, navigation rules, HTTPS-only allowlists, isolated partitions, and host-message validation.
8. **Use the Apple port only where real equivalents exist.** Do not create fake App Intents, fake widgets, fake App Clips, or fake Foundation Models APIs. Port the *pattern* to Electrobun equivalents.
9. **Bun async safety is mandatory.** Use `AbortSignal`, timeouts, structured promises, worker/subprocess boundaries where needed, and cleanup via Electrobun lifecycle events. Do not block the UI view or Bun worker with long synchronous work.
10. **Tests and automations are part of the feature.** Add/update `bun test`, RPC contract tests, tool evals, security checks, and CI workflow steps.
11. **Privacy/release must stay aligned.** Update privacy docs, signing/notarization guidance, release host config, updater behavior, permission entitlements, and review notes when data flows or distribution behavior changes.
12. **Accessibility/localization ship with the feature.** Add semantic HTML, ARIA where needed, keyboard support, focus management, reduced-motion behavior, locale-aware formatting, and user-visible strings separated from model prompts.

## Required discovery summary before implementation

- Electrobun/Bun/TypeScript versions and package scripts.
- `electrobun.config.ts` app identifier, version, entrypoints, views, copy assets, platform build options, renderer strategy, release base URL, signing/notarization flags.
- Main process architecture in `src/bun`.
- View architecture and UI framework in `src/*view` or equivalent.
- Shared RPC/types location and contract health.
- Persistence and secret storage model.
- Network hosts, model providers, AI data flows, and logging policy.
- Sandboxed webviews, navigation rules, partitions, and external content surfaces.
- Existing tests/evals/CI commands.
- Distribution/update implications.

## Forbidden unless explicitly approved

- Secrets in source, `.env`, prompts, logs, localStorage, IndexedDB, SQLite, release artifacts, screenshots, or test fixtures.
- Broad tools such as `runShell`, `queryDatabase`, `fetchAnyURL`, `writeAnyFile`, or `executeJavascript` exposed to model control.
- RPC on untrusted remote content.
- Unsandboxed `<electrobun-webview>` for user-provided or third-party URLs.
- `curl ... | sh`, unpinned install scripts, broad dependency upgrades, or deleting lockfiles as a fix.
- Hidden cloud AI, telemetry, crash uploading, prompt logging, transcript persistence, or analytics.
- Destructive file, account, purchase, payment, network-posting, or system actions without explicit user confirmation.
- Disabling signing/notarization/security checks in release paths to “get it working.”

## Done means

- Code compiles or the exact unresolved toolchain issue is documented.
- Relevant `bun test` / build / validation command is run or provided.
- RPC/tool contracts are typed and tested.
- Security/privacy impact is stated.
- Accessibility/localization impact is stated.
- Distribution/update impact is stated if release code changed.
