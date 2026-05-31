# /electrobun-release

Prepare an Electrobun desktop release.

Verify:

- `bun install --frozen-lockfile`, typecheck, and `bun test` pass.
- `electrobun.config.ts` version/app identifier/release base URL/build platform settings are correct.
- macOS codesign/notarize env is configured for production.
- `build:canary` and/or `build:stable` scripts exist and work.
- Artifacts generated and uploaded to static host.
- Updater metadata and old patches retained.
- No debug secrets, logging, telemetry surprises, or broad sandbox bypasses.
- AI/model/provider/data retention notes ready.
- Manual smoke tests for window launch, menu/tray/context actions, command palette, update check, and settings.
