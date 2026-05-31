# 12 — Distribution, Code Signing, and Release

## Release checklist

- `bun install --frozen-lockfile` passes in CI.
- `bun test` and typecheck pass.
- `electrobun.config.ts` app name, identifier, version, views, copied assets, release base URL, and platform build settings are correct.
- macOS production releases use code signing and notarization.
- Release artifacts are generated for each target OS/arch on appropriate runners.
- Updater metadata and patch files are uploaded to a static host.
- Old patch files are retained.
- Secrets for signing/notarization are provided through CI secret storage, not repo files.
- Unsigned dev builds are not distributed as production builds.

## Review notes

Document AI behavior, model provider/location, data retention, network hosts, permissions/entitlements, auto-update behavior, and how to test premium/account-gated features.
