# Hooks

Hooks provide deterministic guardrails for Electrobun/Bun/TypeScript agent work.

Mirrored locations:

- `.claude/hooks/` for Claude Code-style hooks.
- `.agent/hooks/` for generic agents.

## Included hooks

- `pre-bash-guard.sh`: blocks destructive commands, unsafe install pipes, secret exfiltration, protected release artifacts, and high-risk dependency churn.
- `pre-edit-guard.sh`: blocks edits to secret files, signing credentials, generated artifacts, and protected lock/release files unless explicitly handled.
- `post-edit-validate.sh`: prints focused validation commands after TypeScript/Electrobun/security/release edits.
- `post-bash-summary.sh`: extracts likely Bun/Electrobun/TypeScript errors from noisy command output.
- `stop-checklist.sh`: prints a completion checklist.

Hooks are not a substitute for code review. They catch common failures fast.
