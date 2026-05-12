# Android release signing for Milady

The `release` build type in `apps/app/android/app/build.gradle` is wired
for one-time keystore configuration via env vars or gradle `-P` properties.
When the env vars are absent the release build falls back to debug signing
so local development is unaffected.

The Solana dApp Store and the Google Play Store **both reject debug-signed
APKs.** CI and submission flows MUST set the env vars below.

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

Either export env vars before invoking gradle:

```bash
export MILADY_RELEASE_KEYSTORE_PATH=~/.config/milady/milady-release.jks
export MILADY_RELEASE_STORE_PASSWORD='...'
export MILADY_RELEASE_KEY_ALIAS=milady
export MILADY_RELEASE_KEY_PASSWORD='...'
```

…or pass them as gradle properties:

```bash
./gradlew assembleRelease \
  -PmiladyReleaseKeystorePath=$HOME/.config/milady/milady-release.jks \
  -PmiladyReleaseStorePassword='...' \
  -PmiladyReleaseKeyAlias=milady \
  -PmiladyReleaseKeyPassword='...'
```

Either source works; pick the one that fits your CI's secret-management.

## Build commands

### Slim cloud-only release (recommended first dApp Store submission)

Strips `assets/agent/` (bun runtime, libllama, agent-bundle, PGlite,
GGUF models). Result: ~50 MB release APK that talks to a hosted
backend rather than the on-device agent.

```bash
cd apps/app/android
./gradlew assembleRelease \
  -PelizaCloudBuild=true \
  -PmiladyReleaseKeystorePath=$HOME/.config/milady/milady-release.jks \
  -PmiladyReleaseStorePassword=$MILADY_RELEASE_STORE_PASSWORD \
  -PmiladyReleaseKeyPassword=$MILADY_RELEASE_KEY_PASSWORD
```

Output: `apps/app/android/app/build/outputs/apk/release/app-release.apk`.

### Full local-agent release (bigger; second-stage submission)

Keeps `assets/agent/` so the APK can run the bundled on-device agent
without network. Resulting APK is large (1.3–3 GB depending on which
GGUFs are bundled in `apps/app/android/app/src/main/assets/agent/models/`).

```bash
cd apps/app/android
./gradlew assembleRelease \
  -PmiladyReleaseKeystorePath=$HOME/.config/milady/milady-release.jks \
  -PmiladyReleaseStorePassword=$MILADY_RELEASE_STORE_PASSWORD \
  -PmiladyReleaseKeyPassword=$MILADY_RELEASE_KEY_PASSWORD
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

should show `package: name='ai.milady.milady'`, `versionCode=N`,
`targetSdkVersion=36`.

## CI hooks

For GitHub Actions (or whatever runner you wire up):

```yaml
- name: Decode keystore
  run: |
    echo "$MILADY_RELEASE_KEYSTORE_BASE64" | base64 --decode \
      > $RUNNER_TEMP/milady-release.jks

- name: Build release APK
  env:
    MILADY_RELEASE_KEYSTORE_PATH: ${{ runner.temp }}/milady-release.jks
    MILADY_RELEASE_STORE_PASSWORD: ${{ secrets.MILADY_RELEASE_STORE_PASSWORD }}
    MILADY_RELEASE_KEY_ALIAS: milady
    MILADY_RELEASE_KEY_PASSWORD: ${{ secrets.MILADY_RELEASE_KEY_PASSWORD }}
  run: bun run build:android -- assembleRelease -PelizaCloudBuild=true
```

Keystore-as-secret pattern: store the JKS file as a base64 string in a
single `MILADY_RELEASE_KEYSTORE_BASE64` secret. The decode step writes
it to a runner-temp path that goes away when the job finishes.

## When the env vars are absent

`release` builds fall back to debug signing. Useful for engineers who
need to test minify/proguard behavior locally without the production
keystore. The resulting APK is NOT submission-ready — it will be
rejected by the dApp Store and the Play Store. Log line to look for
during the build:

```
WARNING: Release build is debug-signed. Set MILADY_RELEASE_KEYSTORE_PATH
to produce a signed APK for distribution.
```

(Note: the warning line is gradle's own — there's no extra logging
because the conditional `signingConfig signingConfigs.release` simply
isn't attached when the env vars are absent.)
