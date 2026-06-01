# Codex Entrypoint — Electrobun Agentic Desktop 2026

Use the root `AGENTS.md` as authoritative. For desktop-shell work, also read
`rules/`, `checklists/`, `hooks/README.md`, `commands/README.md`,
`docs/research-brief-2026.md`, and `docs/porting-map-from-apple-swift.md`.

Milady's primary Electrobun workspace is
`eliza/packages/app-core/platforms/electrobun`; the renderer app is `apps/app`.
Do not assume the generic template layout where `electrobun.config.ts`,
`src/bun`, and `src/shared` live at repo root. Use typed RPC, sandboxed
webviews, Bun tests, and Electrobun release/update rules. Do not port Apple-only
APIs literally.

The original source bundle is preserved at
`docs/agent-packs/electrobun-agentic-desktop-2026/`. Its GitHub workflow
examples are reference-only unless the user explicitly approves active CI/CD
changes.
