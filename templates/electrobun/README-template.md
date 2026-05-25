# Agentic Electrobun App Template

This template shows a minimal structure for an agentic Electrobun app:

- Bun main process owns privileged APIs and RPC handlers.
- Main view owns UI and calls typed RPC through `Electroview`.
- Shared TypeScript modules define contracts and validators.
- Agent orchestration uses a model router, tool registry, safety policy, and permission gate.
- Secrets use `Bun.secrets` for local credentials; production/distribution builds should also support environment variables or a dedicated secret manager.
- Local data uses `bun:sqlite`.
- Updater and menu/tray/deep-link actions route through shared command dispatch.

Use as a reference, not a drop-in without verifying your installed Electrobun version.
