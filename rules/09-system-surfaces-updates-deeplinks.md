# 09 — System Surfaces, Deep Links, and Updates

## System surfaces

- Use `ApplicationMenu` for stable app commands and platform-native keyboard shortcuts.
- Use `ContextMenu` for selection- or view-specific actions.
- Use `Tray` for background/status workflows and user-invoked quick actions.
- Use a command palette in the main view for discoverable agent actions.
- Use URL schemes/deep links where supported; macOS support is first-class, Windows/Linux support may be limited.

## Deep links

- Parse deep links with `new URL()`.
- Validate scheme, path, query parameters, and auth state.
- Never execute privileged actions directly from a deep link without confirmation.
- Route links into the same typed command/action system as menus and RPC.

## Updates

- Set `release.baseUrl` for non-dev builds.
- Use `Updater.checkForUpdate`, `downloadUpdate`, and `applyUpdate` intentionally.
- Never force an update while user work is unsaved.
- Keep old patch files available so older clients can step through patches.
- Validate update metadata and show user-safe errors.
