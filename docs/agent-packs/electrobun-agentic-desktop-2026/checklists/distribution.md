# Distribution Checklist

- App name/identifier/version correct.
- Build scripts present: dev/canary/stable.
- Release base URL set for distribution.
- macOS signing/notarization configured for production.
- Artifacts uploaded to static host.
- Old patches retained.
- Updater does not force-restart with unsaved work.
- Unsigned builds marked dev-only.
