# GitHub Copilot Instructions — Electrobun Agentic Desktop

This repo builds Electrobun desktop apps with Bun and TypeScript.

Follow `AGENTS.md` and `rules/`:

- Prefer Electrobun APIs: `BrowserWindow`, `BrowserView`, `Electroview`, typed RPC, `views://`, `Tray`, `ApplicationMenu`, `ContextMenu`, `Updater`, `Events`.
- Keep RPC/tool/model boundaries typed and runtime-validated.
- Use `Bun.secrets` for credentials and `bun:sqlite`/Bun SQL for local structured data when suitable.
- Sandbox untrusted content and apply navigation allowlists.
- Add/update `bun test` tests for tool and RPC contracts.
- Do not introduce hidden cloud AI, telemetry, broad shell/database/file tools, or secret logging.
