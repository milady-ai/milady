# Local Application Notes

This pack was applied to Milady as a non-destructive local overlay.

Active local entrypoints:

- Root `AGENTS.md` and `CLAUDE.md` now reference the pack for Electrobun desktop work.
- `.codex/AGENTS.md`, `.cursor/rules/electrobun-agentic-desktop-2026.mdc`, `.github/copilot-instructions.md`, and `.windsurfrules` point agents at Milady's actual desktop layout.
- `.claude/commands/` contains the Electrobun slash commands.
- `.claude/hooks/` and `.agent/hooks/` contain the guard and checklist hooks.
- `rules/`, `checklists/`, `commands/`, `hooks/`, `automations/`, `templates/`, `docs/`, and `scripts/` contain the pack's working guidance and helper files.

Milady-specific path assumptions:

- Electrobun workspace: `eliza/packages/app-core/platforms/electrobun`
- Renderer app: `apps/app`
- Full original pack archive: `docs/agent-packs/electrobun-agentic-desktop-2026/`

The bundled GitHub Actions examples remain archived under `.github/workflows/`
inside this directory. They were not copied into the active project
`.github/workflows/` directory because this repository requires explicit
approval before CI/CD changes.
