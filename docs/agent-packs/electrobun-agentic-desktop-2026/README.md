# Electrobun Agentic Desktop 2026 Coding-Agent Plugin

A portable **coding-agent plugin / rules pack** for building agentic desktop apps with **Electrobun**, **Bun**, and **TypeScript**.

This is a port of the Apple Agentic Swift plugin where the concepts map cleanly to Electrobun:

| Apple/Swift concept | Electrobun port |
|---|---|
| SwiftUI app boundary | HTML/CSS/TS view boundary loaded by `views://` into native webviews |
| Foundation Models session | Model adapter abstraction: local model, BYOK cloud model, or deterministic fallback |
| App Intents | Typed RPC actions, deep links, command palette, application menu, tray menu, context menu |
| App Clip / widget surfaces | Small focused windows, tray/floating windows, sandboxed `<electrobun-webview>` surfaces |
| SwiftData/Core Data | `bun:sqlite`, Bun SQL, Drizzle/Prisma where justified |
| Keychain | `Bun.secrets` / OS credential store |
| Xcode build/test | `bun install`, `bun test`, `electrobun dev`, `electrobun build` |
| App Store/TestFlight release | Electrobun artifacts, macOS signing/notarization, static release host, updater |

## Install

Copy this folder into an Electrobun repository root. Then use the entrypoint your agent understands.

| Agent / IDE | Entry file |
|---|---|
| Generic coding agent | `AGENTS.md` |
| Claude Code | `CLAUDE.md`, `.claude/settings.json`, `.claude/commands/` |
| Cursor | `.cursor/rules/electrobun-agentic-desktop-2026.mdc` |
| GitHub Copilot | `.github/copilot-instructions.md` |
| Codex-style agents | `.codex/AGENTS.md` |
| Windsurf | `.windsurfrules` |

## First prompt to run

```text
Read AGENTS.md, rules/, hooks/README.md, commands/README.md, docs/research-brief-2026.md, and docs/porting-map-from-apple-swift.md. Inspect package.json, bun.lock, electrobun.config.ts, src/bun, src/shared, src/*view, tests, scripts, release configuration, and any signing/update settings. Produce a brief plan before editing. Port Apple-agentic patterns only where Electrobun has a real equivalent: typed RPC, sandboxed BrowserViews, command palette, tray/menu/deep-link actions, Bun.secrets, bun:sqlite, updater, and distribution automation.
```

## Included slash commands

- `/electrobun-plan` — inspect and plan an Electrobun task.
- `/electrobun-agent-tool` — implement a bounded agent tool in TypeScript.
- `/electrobun-rpc` — add or review a typed Bun ↔ view RPC contract.
- `/electrobun-view` — build or refactor a BrowserWindow/BrowserView UI surface.
- `/electrobun-port-apple` — port an Apple/Swift pattern into the nearest Electrobun equivalent.
- `/electrobun-menu-tray` — expose actions through application menu, context menu, tray, and command palette.
- `/electrobun-update` — wire or audit the Electrobun updater and release host.
- `/electrobun-security-review` — audit sandboxing, navigation rules, secrets, logging, and AI data flows.
- `/electrobun-test` — run or create Bun tests, RPC contract tests, UI smoke tests, and prompt/tool evals.
- `/electrobun-build-fix` — diagnose Bun/Electrobun build failures.
- `/electrobun-release` — prepare signed/notarized/distributed desktop releases.

## Included hooks

- Pre-bash guard for destructive commands, secret exfiltration, unsafe network shell pipes, and broad dependency churn.
- Pre-edit guard for secrets, release credentials, generated artifacts, and lockfile-only edits.
- Post-edit validator for Electrobun config, package scripts, TypeScript, RPC contracts, sandbox/security-sensitive files, and release settings.
- Post-bash summarizer for Bun/Electrobun/TypeScript build failures.
- Stop checklist for build, test, security, privacy, accessibility, and release readiness.

## Design stance

- Electrobun-native desktop first.
- TypeScript everywhere with explicit runtime validation at agent/tool/RPC boundaries.
- Typed RPC over ad hoc global variables or untyped `postMessage`.
- Sandbox every untrusted URL and combine sandboxing with navigation allowlists.
- Local-first by default; cloud AI only with explicit user consent, secure secret storage, and clear data handling.
- Use Bun’s batteries-included tooling before adding build/test/runtime dependencies.
- Treat distribution, update safety, code signing, privacy, and accessibility as part of the feature.
