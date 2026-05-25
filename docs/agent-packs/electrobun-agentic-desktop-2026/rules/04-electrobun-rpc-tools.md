# 04 — Electrobun Typed RPC and Tools

Use typed RPC as the desktop equivalent of App Intents/system actions.

## RPC practices

- Keep shared contract types in `src/shared/rpc.ts` or an equivalent shared module.
- Define Bun-side handlers with `BrowserView.defineRPC<SharedRPC>()`.
- Define browser-side handlers with `Electroview.defineRPC<SharedRPC>()`.
- Prefer request/response for actions that need results; use messages for fire-and-forget events.
- Set `maxRequestTime` for all RPC handlers.
- Validate all input from the view or nested webviews.
- Never expose privileged RPC handlers to sandboxed or untrusted content.

## Tool practices

- Treat every agent tool as a privileged RPC-adjacent capability.
- Keep names narrow and boring: `readWorkspaceSummary`, `searchNotes`, `draftReply`, `openSettingsWindow`.
- Define explicit `ToolInput`, `ToolOutput`, `ToolError`, `Permission`, and `AuditEvent` types.
- Require confirmation for destructive/external side effects.
- Add tests for success, invalid input, permission denied, timeout, cancellation, model unavailable, and error mapping.
