# 10 — Testing, CI, and Performance

## Required test layers

- `bun test` for pure domain/tool/RPC contract logic.
- Runtime validation tests for model/tool/RPC schemas.
- Prompt/tool evals for AI features.
- UI smoke/manual checks for window creation, menu/tray actions, command palette, deep links, and sandboxed webviews.
- Release automation checks for config, signing env presence, artifacts, and updater settings.

## AI eval cases

- Happy path.
- Empty/invalid input.
- Sensitive input minimization.
- Tool permission denied.
- User confirmation declined.
- Tool timeout.
- Model unavailable.
- Malformed model JSON.
- Context too large.
- Cancellation.
- Localized input.

## Performance

- Keep startup lean; do not initialize heavy model/provider clients before first use.
- Prefer system webviews for bundle size unless CEF is justified.
- Budget memory for webviews and avoid unnecessary hidden windows.
- Use streaming/progress updates for long operations.
- Add lightweight timing around model/tool calls without logging content.
