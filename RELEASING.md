# Releasing Milady

How to cut releases, what happens automatically, and how to fix things when they break.

## Prerequisites

Before cutting a release you need:

- Push access to the `milady-ai/milady` repository (to create tags)
- The following GitHub Secrets configured on the repo:

| Secret | Purpose |
|--------|---------|
| `NPM_TOKEN` | Publish to npm |
| `PYPI_API_TOKEN` | Publish to PyPI |
| `CSC_LINK` | macOS code signing certificate (.p12, base64) |
| `CSC_KEY_PASSWORD` | Password for the .p12 certificate |
| `APPLE_ID` | Apple ID email for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password from appleid.apple.com |
| `APPLE_TEAM_ID` | 10-char Apple Developer Team ID |
| `WINDOWS_SIGN_CERT_BASE64` | Windows code signing certificate |
| `WINDOWS_SIGN_CERT_PASSWORD` | Password for Windows signing cert |
| `SNAP_STORE_CREDENTIALS` | Snap Store upload credentials |
| `HOMEBREW_TAP_TOKEN` | PAT for `milady-ai/homebrew-tap` repo |
| `RELEASE_UPLOAD_KEY` | SSH key for uploading update files to milady.ai |
| `RELEASE_HOST_FINGERPRINT` | SSH host key for milady.ai |

## Version Bumping

The root `package.json` holds the canonical version (currently uses semver with pre-release identifiers like `2.0.0-alpha.116`).

**Scripts:**

| Script | What it does |
|--------|-------------|
| `eliza/packages/app-core/scripts/set-package-version.mjs` | Sets version in root `package.json`. Reads `RELEASE_VERSION` env var. |
| `eliza/packages/app-core/scripts/align-electrobun-version.mjs` | Syncs version across `package.json`, `apps/app/package.json`, `apps/app/electrobun/package.json`, and `electrobun.config.ts`. Also reads `RELEASE_VERSION` env var. |

Both scripts are called automatically by CI during the release workflow. You don't need to run them manually unless doing a local dry-run.

**Version format determines the release channel:**

| Version pattern | npm dist-tag | Build env |
|----------------|-------------|-----------|
| `2.0.0` | `latest` | `stable` |
| `2.0.0-beta.1` | `beta` | `canary` |
| `2.0.0-alpha.7` | `next` | `canary` |
| `2.0.0-rc.1` | `next` | `canary` |
| `2.0.0-nightly.20260320` | `nightly` | `canary` |

## Cutting a Release

### Step 1: Validate locally (optional but recommended)

```bash
bun run build
bun run release:check    # validates dist contents, forbidden paths, package integrity
```

### Step 2: Tag and push

```bash
git tag v2.0.0-alpha.117
git push origin v2.0.0-alpha.117
```

That's it. Pushing a `v*` tag triggers the entire release pipeline.

### Alternative: Manual dispatch

Go to **Actions > Build & Release (Electrobun)** and click "Run workflow". You can specify a tag and optionally create as a draft release.

## What Happens Automatically

Pushing a `v*` tag triggers this pipeline:

```
v* tag push
  │
  ├─ release-electrobun.yml
  │   ├─ prepare          ─── Determine version, channel (stable/canary)
  │   ├─ validate-release ─── bun run release:check
  │   ├─ build            ─── Build desktop apps (4 platforms in parallel)
  │   │   ├─ macOS ARM64   (signed + notarized)
  │   │   ├─ macOS Intel   (signed + notarized)
  │   │   ├─ Windows x64   (signed, Inno Setup installer, smoke tested)
  │   │   └─ Linux x64
  │   ├─ release          ─── Create GitHub Release with installers + checksums
  │   ├─ publish-docker   ─── Build + push ghcr.io/milady-ai/agent
  │   └─ (upload update channel files to milady.ai/releases/)
  │
  └─ On GitHub Release "published" event:
      ├─ publish-npm.yml           ─── Publish to npm with auto-detected dist-tag
      ├─ publish-packages.yml      ─── Publish to all package managers
      │   ├─ PyPI
      │   ├─ Homebrew tap (stable releases only)
      │   ├─ Snap Store
      │   ├─ Debian .deb (+ trigger APT repo update)
      │   └─ Flatpak (stable releases only)
      ├─ apple-store-release.yml   ─── iOS (TestFlight/App Store) + macOS (MAS)
      └─ android-release.yml       ─── Android AAB → Play Store
```

## Release Artifacts

| Artifact | Where | Install command |
|----------|-------|-----------------|
| npm package (`miladyai`) | npmjs.com | `npm install -g miladyai@latest` |
| PyPI package (`milady`) | pypi.org | `pip install milady` |
| Homebrew formula | `milady-ai/homebrew-tap` | `brew install milady-ai/tap/milady` |
| Snap | Snap Store | `sudo snap install milady --classic` |
| Debian .deb | GitHub Release + APT repo | `sudo dpkg -i milady_*.deb` |
| Flatpak | GitHub Release | `flatpak install milady.flatpak` |
| Docker image | `ghcr.io/milady-ai/agent` | `docker pull ghcr.io/milady-ai/agent:latest` |
| macOS app (.dmg) | GitHub Release | Download from release page |
| Windows installer (.exe) | GitHub Release | Download from release page |
| Linux desktop (.tar.zst) | GitHub Release | Download from release page |
| iOS app (.ipa) | TestFlight / App Store | Via TestFlight app or App Store |
| Android app (.aab) | Play Store | Via Google Play (internal/beta/production) |

**Docker tags:**
- `:v{version}` — exact version
- `:latest` — latest tagged release
- `:dev` — latest `develop` branch push

## Nightly Builds

**Schedule:** Daily at 04:00 UTC, from the `main` branch.

**Behavior:**
- Skips if no new commits since the last nightly tag
- Runs build + unit tests before publishing
- Version format: `{base}-nightly.{YYYYMMDD}` (e.g. `2.0.0-nightly.20260320`)
- Published to npm with `nightly` dist-tag
- Creates a GitHub pre-release with auto-generated release notes
- Old nightly releases are cleaned up (keeps last 14)

**Force a nightly:** Actions > Nightly Build > Run workflow > check "Force nightly build"

**Install nightly:**
```bash
npm install -g miladyai@nightly
```

## Mobile Releases (iOS & Android)

Mobile releases are triggered alongside desktop releases when a GitHub Release is published, or manually via workflow dispatch.

### Pipeline

```
GitHub Release "published" event (or manual dispatch)
  ├─ apple-store-release.yml
  │   ├─ prepare          ─── Determine version, build number (Unix timestamp)
  │   ├─ build-ios        ─── Build IPA → Fastlane match certs → TestFlight or App Store
  │   └─ build-macos      ─── Build MAS pkg → Code sign → App Store Connect
  │
  └─ android-release.yml
      ├─ build-aab        ─── Build signed AAB via Gradle
      └─ publish-play-store ─── Fastlane supply → Play Store
```

### Bundle Identifiers

| Platform | ID |
|----------|----|
| iOS | `com.miladyai.milady` |
| Android | `ai.milady.app` |
| macOS (Electrobun) | `com.miladyai.milady` |

### Mobile Secrets

These secrets must be configured on the GitHub repository in addition to the desktop secrets above.

**iOS / App Store:**

| Secret | Purpose |
|--------|---------|
| `ITC_TEAM_ID` | iTunes Connect team ID |
| `APP_STORE_APP_ID` | App Store app identifier |
| `MATCH_PASSWORD` | Password for Fastlane match certificate repo |
| `MATCH_GIT_URL` | Git repository URL for certificates/provisioning profiles |
| `MATCH_GIT_BASIC_AUTHORIZATION` | Base64-encoded `user:token` for match Git repo |

**macOS App Store (in addition to iOS):**

| Secret | Purpose |
|--------|---------|
| `MAS_CSC_LINK` | Mac App Store code signing certificate (.p12, base64) |
| `MAS_CSC_KEY_PASSWORD` | Password for MAS signing certificate |
| `MAS_INSTALLER_CERT` | Mac App Store installer certificate (.p12, base64) |
| `MAS_INSTALLER_KEY_PASSWORD` | Password for MAS installer certificate |
| `APP_STORE_API_KEY_ID` | App Store Connect API key ID |
| `APP_STORE_API_ISSUER_ID` | App Store Connect API issuer ID |

**Android / Play Store:**

| Secret | Purpose |
|--------|---------|
| `ANDROID_KEYSTORE_BASE64` | Upload keystore (.jks, base64-encoded) |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Key alias inside the keystore |
| `ANDROID_KEY_PASSWORD` | Key password |
| `PLAY_STORE_SERVICE_ACCOUNT_JSON` | Google Play service account JSON (base64) |

### Android Version Code

The version code is calculated from the semver tag:

```
MAJOR * 1000000 + MINOR * 10000 + PATCH * 100 + PRERELEASE
Example: 2.0.0-alpha.82 → 2000082
Example: 2.1.3 → 2010300
```

### Play Store Track Selection

| Version pattern | Track |
|----------------|-------|
| Contains `alpha`, `beta`, or `rc` | `internal` |
| Stable release (e.g. `2.1.0`) | `production` |
| Manual dispatch | Chosen at dispatch time |

### Manual Mobile Dispatch

- **Android:** Actions > Android Release > Run workflow. Choose track (`internal`, `beta`, `production`).
- **iOS:** Actions > Apple Store Release > Run workflow. Choose platform (`ios`, `macos`, `both`) and track (`testflight`, `app-store`).

### Local Mobile Builds

```bash
# iOS (requires macOS + Xcode)
bun run dev:ios          # Build + open in Xcode
bun run build:ios        # CI-style simulator build

# Android (requires Android SDK + JDK 21)
bun run dev:android      # Build + open in Android Studio
bun run build:android    # CI-style debug build
```

### Certificate Renewal

**iOS (Fastlane match):** Certificates are stored in a private Git repository. When they expire:
1. Run `bundle exec fastlane match nuke appstore` to revoke old certs
2. Run `bundle exec fastlane match appstore` to generate new ones
3. Update `MATCH_PASSWORD` in GitHub Secrets if changed

**Android:** The upload keystore never expires (Google re-signs with their key). If you need a new keystore, you must contact Google Play support.

## Troubleshooting

### `release:check` fails

The script (`eliza/packages/app-core/scripts/release-check.ts`) validates that required files exist in `dist/` and forbidden paths (like `dist/Milady.app/`) are absent. Fix whatever it complains about and re-tag.

### npm publish fails

- Check that `NPM_TOKEN` is valid and has publish access to `miladyai`
- Verify the version doesn't already exist: `npm view miladyai@{version}`
- You can re-run the publish manually: Actions > Publish npm > Run workflow

### macOS signing/notarization fails

- Verify `CSC_LINK` contains a valid, non-expired Developer ID Application certificate
- Check `APPLE_APP_SPECIFIC_PASSWORD` hasn't been revoked at appleid.apple.com
- If `APPLE_TEAM_ID` is wrong, notarization silently fails

### Windows build fails on tar extraction

The workflow pre-extracts the Electrobun CLI using `C:\Windows\System32\tar.exe` (BSD tar) because GNU tar misinterprets `C:` drive letters as `user@host`. If this step fails, check the Electrobun release exists for the expected version.

### Docker build exceeds timeout

The Docker build has a 90-minute timeout. If it's timing out, check for cache misses on the `bun-store` or Docker layer caches.

### Homebrew/Flatpak not updated

These only run for stable releases (no `alpha`, `beta`, or `rc` in the version). This is intentional.

### Re-running a failed release

If a release partially failed:
1. Fix the issue
2. Delete the GitHub Release (if created) and the tag
3. Re-tag and push, or use manual dispatch with the same tag

### Version mismatch after publish

The `publish-npm.yml` verify step warns (not errors) if the registry hasn't propagated yet. Wait a few minutes and check manually: `npm view miladyai@{dist-tag} version`.

### iOS build fails with "No signing certificate"

Fastlane match needs a valid certificate repo. Verify `MATCH_GIT_URL` is accessible and `MATCH_GIT_BASIC_AUTHORIZATION` has read access. You can test locally: `cd apps/app/ios && bundle exec fastlane certs`.

### Android AAB signing fails

- Check `ANDROID_KEYSTORE_BASE64` is valid base64: `echo $SECRET | base64 -d > /tmp/test.jks && keytool -list -keystore /tmp/test.jks`
- Verify `ANDROID_KEY_ALIAS` matches an alias in the keystore

### CocoaPods fails with encoding error

Set `LANG=en_US.UTF-8` in the environment. This is required on systems with Ruby 4.0+.

### Capacitor sync fails with "platform not added"

Ensure you're running from the `apps/app` directory, not the repo root. Capacitor looks for `ios/` and `android/` relative to the working directory.
