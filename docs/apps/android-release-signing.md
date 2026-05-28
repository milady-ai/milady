# Android release signing for Milady

The `release` build type in `apps/app/android/app/build.gradle` is wired
for one-time keystore configuration via environment variables. When the
env vars are absent the release build falls back to debug signing so
local development is unaffected.

The Solana dApp Store and the Google Play Store **both reject debug-signed
APKs.** CI and submission flows MUST set the env vars below.

## How the Android tree is generated

`apps/app/android/` is **not source-tracked**. It is regenerated from the
Capacitor scaffolding template at
`eliza/packages/app-core/platforms/android/` every time you run:

```bash
cd apps/app
bun run build:android      # or: bun run cap:sync:android
```

This is the same pattern as `apps/app/ios/` — the platform-specific
project is a build artifact, not a checked-in source tree. The generator
lives at `eliza/packages/app-core/scripts/run-mobile-build.mjs` and is
invoked indirectly through the `build:android` and `cap:sync:android`
scripts in `apps/app/package.json`.

Run that step **before** invoking gradle directly — every command in
this document assumes `apps/app/android/` already exists.

## One-time setup

### 1. Generate the keystore

Pick a directory outside the repo. Never commit the keystore.

```bash
keytool -genkey -v \
  -keystore ~/.config/milady/milady-release.jks \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -alias milady \
  -storetype JKS
```

`keytool` will prompt for:

- a store password (used for the keystore file itself)
- a key password (used for the `milady` alias inside it; can match the
  store password)
- distinguished-name fields (CN, OU, O, L, ST, C) — these are baked into
  the certificate and visible to anyone who inspects the signature, so
  use values you're comfortable publishing.

`-validity 10000` is ~27 years. Pick a number large enough that you
will not have to migrate to a new signing identity during the
application's expected lifetime. **The Solana dApp Store and Play
Store both bind your app's package name to the signature; if you ever
need to rotate the key, callers cannot install an "update" — they
must uninstall and reinstall.**

### 2. Back up the keystore

The keystore is a one-time cryptographic artifact. Losing it means:

- No more updates to `ai.milady.milady` on any store using this key
- Possibly a new app listing under a fresh package name

Recommended:

- 1Password / Bitwarden secure note with the JKS file attached
- A second offline backup (encrypted USB / Yubikey-protected vault)

Never check the keystore into git, never store it in a shared
network drive without encryption, never embed it in the repo or CI
artefacts.

### 3. Wire the build

Export the four env vars read by `apps/app/android/app/build.gradle`
before invoking gradle:

```bash
export ELIZAOS_KEYSTORE_PATH=~/.config/milady/milady-release.jks
export ELIZAOS_KEYSTORE_PASSWORD='...'
export ELIZAOS_KEY_ALIAS=milady
export ELIZAOS_KEY_PASSWORD='...'
```

The `signingConfigs.release` block in the generated `build.gradle`
reads these via `System.getenv(...)`. If `ELIZAOS_KEYSTORE_PATH` is
unset, the conditional doesn't attach a signing config to the release
build type and the APK is debug-signed.

## Build commands

Make sure the Capacitor Android project exists first
(`bun run build:android` or `bun run cap:sync:android` — see [How the
Android tree is generated](#how-the-android-tree-is-generated)). The
gradle invocations below assume that step has already run.

### Slim cloud-only release (recommended first dApp Store submission)

Strips `assets/agent/` (bun runtime, libllama, agent-bundle, PGlite,
GGUF models). Result: ~50 MB release APK that talks to a hosted
backend rather than the on-device agent.

```bash
cd apps/app/android
./gradlew assembleRelease -PelizaCloudBuild=true
```

Output: `apps/app/android/app/build/outputs/apk/release/app-release.apk`.

### Full local-agent release (bigger; second-stage submission)

Keeps `assets/agent/` so the APK can run the bundled on-device agent
without network. Resulting APK is large (1.3–3 GB depending on which
GGUFs are bundled in `apps/app/android/app/src/main/assets/agent/models/`).

```bash
cd apps/app/android
./gradlew assembleRelease
```

## Verification

After the build:

```bash
apksigner verify --verbose --print-certs \
  apps/app/android/app/build/outputs/apk/release/app-release.apk
```

Look for `Verified using v3 scheme (APK Signature Scheme v3): true`
and the certificate fields you set during `keytool -genkey`.

For dApp Store submission, also confirm:

```bash
aapt dump badging app-release.apk | head -20
```

should show `package: name='ai.milady.milady'`, `versionCode=N`, and
the `targetSdkVersion` configured in `apps/app/android/variables.gradle`.

## CI hooks

For GitHub Actions (or whatever runner you wire up):

```yaml
- name: Decode keystore
  env:
    ANDROID_KEYSTORE_BASE64: ${{ secrets.ANDROID_KEYSTORE_BASE64 }}
  run: |
    echo "$ANDROID_KEYSTORE_BASE64" | base64 --decode \
      > $RUNNER_TEMP/milady-release.jks

- name: Build release APK
  working-directory: apps/app/android
  env:
    ELIZAOS_KEYSTORE_PATH: ${{ runner.temp }}/milady-release.jks
    ELIZAOS_KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
    ELIZAOS_KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
    ELIZAOS_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
  run: ./gradlew assembleRelease -PelizaCloudBuild=true
```

Keystore-as-secret pattern: store the JKS file as a base64 string in a
single `ANDROID_KEYSTORE_BASE64` secret. The decode step writes it to a
runner-temp path that goes away when the job finishes. The existing
`.github/workflows/android-release.yml` workflow follows the same
shape.

## When the env vars are absent

`release` builds fall back to debug signing. Useful for engineers who
need to test minify/proguard behavior locally without the production
keystore. The resulting APK is NOT submission-ready — it will be
rejected by the dApp Store and the Play Store.

The build.gradle's `signingConfigs.release` block guards on
`System.getenv("ELIZAOS_KEYSTORE_PATH")` — when the variable is unset
the conditional `signingConfig signingConfigs.release` simply isn't
attached to the release build type, and AGP falls back to debug
signing without any explicit log line.
