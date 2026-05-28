# Claude Code Entrypoint

Read `AGENTS.md` and the `rules/` directory before editing. Prefer the slash commands in `.claude/commands/` for repeatable workflows.

Highest-priority reminders:

- Inspect `package.json`, `electrobun.config.ts`, `src/bun`, `src/shared`, view code, tests, scripts, and CI first.
- Use Electrobun/Bun/TypeScript APIs; do not invent Apple-only APIs.
- Keep BrowserView RPC typed and bounded.
- Sandbox untrusted webviews and apply navigation rules.
- Store secrets through `Bun.secrets` or an approved OS credential abstraction; never in source or logs.
- Run or specify `bun test`, `bun run typecheck`, `bun run build:dev`, or focused scripts after edits.
