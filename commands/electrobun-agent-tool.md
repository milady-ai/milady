# /electrobun-agent-tool

Implement or review one agent tool for an Electrobun desktop app.

Requirements:

- Narrow purpose and non-ambiguous name.
- Typed input/output and runtime validation.
- Explicit permissions and read/write classification.
- Timeout, cancellation, and confirmation behavior.
- No secrets or excessive user data in outputs.
- Model route/fallback behavior documented.
- Tests for success, validation, denial, confirmation declined, timeout, cancellation, and error mapping.
- If user-visible/repeatable, expose through typed RPC/command palette/menu/tray/deep link as appropriate.
