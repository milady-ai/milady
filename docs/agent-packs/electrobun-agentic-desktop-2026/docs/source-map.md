# Source Map

This port was built from the previous `apple-agentic-swift-coding-agent-plugin.zip` structure and current Electrobun/Bun documentation.

## Ported package concepts

- `AGENTS.md` → Electrobun operating contract.
- `CLAUDE.md`, `.codex/AGENTS.md`, `.cursor/rules`, `.github/copilot-instructions.md`, `.windsurfrules` → agent-specific entrypoints.
- `rules/` → Electrobun/Bun/TypeScript rules.
- `commands/` and `.claude/commands/` → Electrobun slash commands.
- `.claude/hooks`, `.agent/hooks`, `hooks/README.md` → deterministic guardrails.
- `automations/`, `scripts/`, `.github/workflows/` → Bun/Electrobun automation.
- `templates/` → TypeScript/Electrobun app skeletons.

## External docs used

- Electrobun documentation and GitHub repository.
- Bun documentation for TypeScript, test runner, secrets, SQLite, runtime/bundler behavior.
- Existing Apple plugin only as a structural and conceptual source.
