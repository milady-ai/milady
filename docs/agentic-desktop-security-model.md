# Agentic Desktop Security Model

## Trust zones

| Zone | Examples | Trust level | Policy |
|---|---|---|---|
| Bun main process | RPC handlers, tools, storage, updater | Privileged | Minimal exposed surface, strict validation, logging redaction |
| App-owned view | `views://mainview/index.html` | Trusted UI, not privileged | Use typed RPC; no secrets; no direct filesystem/database/model keys |
| Sandboxed remote view | third-party/user URLs | Untrusted | `sandbox`, no RPC, navigation allowlist, partition isolation |
| Model output | local/cloud model response | Untrusted | Validate, constrain, never execute directly |
| Deep links/menus/tray | user/system-triggered actions | Semi-trusted input | Parse and route through command validation/confirmation |

## Mandatory controls

- RPC input validation.
- Tool permission gating.
- Confirmation for external/destructive writes.
- Secret storage through OS credential store.
- HTTPS/network allowlists for remote content.
- Sandboxing for third-party webviews.
- Redacted logs and eval fixtures.
- Update safety: no forced relaunch with unsaved user work.
