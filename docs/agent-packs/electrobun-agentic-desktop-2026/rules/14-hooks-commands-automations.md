# 14 — Hooks, Slash Commands, and Automations

Use prompt rules for judgment; use hooks and automations for deterministic enforcement.

## Hooks

- PreToolUse: block dangerous shell commands, secret exfiltration, broad dependency churn, and protected file writes.
- PostToolUse: run fast validation hints after edits touching Electrobun config, TypeScript, package files, sandbox/security files, or release settings.
- Stop: print a deterministic completion checklist.
- Notification: optional desktop notification when an agent needs user input.

## Slash commands

Use `/electrobun-plan` before large work, `/electrobun-rpc` when crossing Bun/view boundaries, `/electrobun-agent-tool` for model-callable tools, `/electrobun-security-review` when data flows or webviews change, `/electrobun-test` after implementation, and `/electrobun-release` before distribution.

## Automations

- Run `scripts/electrobun-agent-doctor.sh` at session start or before major edits.
- Run `scripts/validate-agentic-electrobun.sh` before committing.
- Run `scripts/security-audit.sh` before release or when webview/model/network code changes.
- Run GitHub Actions workflow in `.github/workflows/electrobun-agentic-ci.yml` on pull requests.
- Keep hooks fast; move platform build matrices to CI.
