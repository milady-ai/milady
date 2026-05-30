# GitHub Copilot Instructions — Electrobun Agentic Desktop

This repo builds Milady: an elizaOS app with an Electrobun desktop shell, Bun,
and TypeScript.

Follow `AGENTS.md` and `rules/`:

- Prefer Electrobun APIs: `BrowserWindow`, `BrowserView`, `Electroview`, typed RPC, `views://`, `Tray`, `ApplicationMenu`, `ContextMenu`, `Updater`, `Events`.
- Milady's Electrobun workspace is `eliza/packages/app-core/platforms/electrobun`; the renderer app is `apps/app`.
- Keep RPC/tool/model boundaries typed and runtime-validated.
- Use `Bun.secrets` for credentials and `bun:sqlite`/Bun SQL for local structured data when suitable.
- Sandbox untrusted content and apply navigation allowlists.
- Add/update `bun test` tests for tool and RPC contracts.
- Do not introduce hidden cloud AI, telemetry, broad shell/database/file tools, or secret logging.
- The archived workflow examples in `docs/agent-packs/electrobun-agentic-desktop-2026/.github/workflows/` are not active CI without explicit approval.
