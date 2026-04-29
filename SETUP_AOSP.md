# MiladyOS AOSP + Cuttlefish Setup

This is the migration runbook for taking the current `develop` branch onto a Linux builder and validating the hard-path MiladyOS build: a real AOSP/Cuttlefish product image where Milady is installed as a privileged system app and owns the phone UI surface.

This is not kiosk mode, managed-device mode, or an emulator-only wrapper. The target is an AOSP product build named `milady_cf_x86_64_phone-trunk_staging-userdebug`.

## Current Repository State

Use `develop` from both repositories:

- Milady root repo: `https://github.com/milady-ai/milady.git`
- `eliza` submodule: `https://github.com/elizaOS/eliza.git`

The parent repo pins the submodule SHA, so the normal submodule command is enough:

```bash
git clone https://github.com/milady-ai/milady.git
cd milady
git checkout develop
git submodule update --init --recursive
```

Sanity check:

```bash
git status --short --branch
git -C eliza status --short --branch
```

Expected clean checkout shape:

```text
## develop...origin/develop
## develop...origin/develop
```

## Builder Requirements

Use a Linux x86_64 machine with KVM. The MiladyOS build script enforces this because the current Cuttlefish target is `milady_cf_x86_64_phone-trunk_staging-userdebug`.

Recommended machine:

- Ubuntu 22.04 or 24.04 x86_64.
- 64 GB RAM.
- 500 GB free disk minimum; 1 TB is safer.
- Hardware virtualization enabled in BIOS/UEFI.
- `/dev/kvm` available to your user.
- Fast SSD. AOSP source and build outputs are large.

Verify CPU virtualization:

```bash
grep -c -w 'vmx\|svm' /proc/cpuinfo
find /dev -name kvm
```

`grep` should print a nonzero number, and `/dev/kvm` should exist.

Official references:

- AOSP setup requirements: https://source.android.com/docs/setup/requirements
- AOSP source download: https://source.android.com/docs/setup/download
- AOSP build flow: https://source.android.com/docs/setup/build/building
- Cuttlefish get started: https://source.android.com/docs/devices/cuttlefish/get-started
- Cuttlefish WebRTC: https://source.android.com/docs/devices/cuttlefish/webrtc

## Host Packages

Install AOSP build dependencies:

```bash
sudo apt update
sudo apt install -y \
  git-core gnupg flex bison build-essential zip curl \
  zlib1g-dev libc6-dev-i386 x11proto-core-dev libx11-dev \
  lib32z1-dev libgl1-mesa-dev libxml2-utils xsltproc unzip \
  fontconfig repo
```

Install Cuttlefish host packages:

```bash
sudo apt install -y git devscripts equivs config-package-dev debhelper-compat golang curl
git clone https://github.com/google/android-cuttlefish ~/android-cuttlefish
cd ~/android-cuttlefish
tools/buildutils/build_packages.sh
sudo dpkg -i ./cuttlefish-base_*_*64.deb || sudo apt-get install -f
sudo dpkg -i ./cuttlefish-user_*_*64.deb || sudo apt-get install -f
sudo usermod -aG kvm,cvdnetwork,render "$USER"
sudo reboot
```

After reboot:

```bash
groups
find /dev -name kvm
```

Your user should be in `kvm`, `cvdnetwork`, and `render`.

## Install Milady Dependencies

From the Milady checkout:

```bash
cd ~/milady
bun install
```

If `bun` is missing, install it first:

```bash
curl -fsSL https://bun.sh/install | bash
exec "$SHELL"
bun --version
```

### Native llama.cpp build prerequisites

The AOSP-bound APK ships an in-process llama.cpp loaded by the bun agent
process via `bun:ffi` (see `eliza/packages/agent/src/runtime/aosp-llama-adapter.ts`).
That requires a **musl-linked** `libllama.so` per ABI, which we cross-compile
from llama.cpp upstream tag **`b3490`** (commit
`6e2b6000e5fe808954a7dcef8225b5b7f2c1b9e9`).

We use `zig` for the cross-compile because zig bundles a complete musl libc
and cross-toolchain for both `aarch64-linux-musl` and `x86_64-linux-musl`. The
regular Android NDK clang produces bionic-linked binaries that the in-APK
musl loader cannot dlopen.

Install zig (>= 0.13.0):

```bash
# Linux — pick whichever installs zig 0.13+ on your distro
sudo snap install zig --classic --beta
# or, vendor-provided tarball:
ZIG_VERSION=0.13.0
curl -L -o /tmp/zig.tar.xz \
  "https://ziglang.org/download/${ZIG_VERSION}/zig-linux-x86_64-${ZIG_VERSION}.tar.xz"
sudo tar -xJf /tmp/zig.tar.xz -C /opt
sudo ln -sf "/opt/zig-linux-x86_64-${ZIG_VERSION}/zig" /usr/local/bin/zig
zig version  # expect 0.13.0 or newer
```

Cross-compile + stage `libllama.so` for both ABIs (idempotent — re-running
re-uses the cached llama.cpp clone and per-ABI cmake build dirs):

```bash
node scripts/miladyos/compile-libllama.mjs --skip-if-present
```

Output paths:

```text
apps/app/android/app/src/main/assets/agent/arm64-v8a/libllama.so   (real phones)
apps/app/android/app/src/main/assets/agent/x86_64/libllama.so      (cuttlefish + emulators)
```

Approximate cost on a 16-core Linux x86_64 builder: ~2-3 minutes per ABI;
the resulting `libllama.so` is ~5-10 MB stripped per ABI, depending on the
zig-selected baseline ISA.

### Build the privileged Capacitor APK with AOSP flags

`scripts/miladyos/build-aosp.mjs` runs `compile-libllama.mjs` automatically
during the AOSP path, so the only thing the operator needs to do is rebuild
the privileged APK with the AOSP-only env so `BuildConfig.AOSP_BUILD=true`
gets baked in:

```bash
MILADY_AOSP_BUILD=1 MILADY_GRADLE_AOSP_BUILD=true bun run build:android:system
```

This:

1. Builds the agent bundle with `MILADY_AOSP_BUILD=1` (which keeps
   `node-llama-cpp` real instead of stub-replaced — see
   `eliza/packages/agent/scripts/build-mobile-bundle.mjs`).
2. Patches `apps/app/android/app/build.gradle` to enable `BuildConfig`
   generation and adds the `AOSP_BUILD` boolean buildConfigField.
3. Forwards `-PmiladyAospBuild=true` to gradle, which sets
   `BuildConfig.AOSP_BUILD=true` so `MiladyAgentService` exports
   `MILADY_LOCAL_LLAMA=1` to the bun process at startup.
4. Stages the APK to `os/android/vendor/milady/apps/Milady/Milady.apk`.

Without these flags, `bun run build:android:system` produces a normal
Capacitor APK (DeviceBridge inference path, `BuildConfig.AOSP_BUILD=false`).
That's correct for the Play Store / sideload distribution; the AOSP product
build is the only path that needs `MILADY_LOCAL_LLAMA=1`.

This produces and stages:

```text
os/android/vendor/milady/apps/Milady/Milady.apk
```

Run static MiladyOS validation:

```bash
bun run miladyos:validate
```

This checks:

- Milady privileged APK package metadata.
- Launcher, dialer, SMS, phone-service, boot, and deep-link manifest entries.
- Default privileged permissions XML.
- Product makefile and Soong prebuilt wiring.
- Stock launcher/dialer/SMS/contact app override declarations.

## Download AOSP

Keep AOSP outside the Milady repo:

```bash
mkdir -p ~/aosp
cd ~/aosp
repo init --partial-clone -b android-latest-release \
  -u https://android.googlesource.com/platform/manifest
repo sync -c -j8
```

Notes:

- `android-latest-release` is a moving target. The product makefile inherits `device/google/cuttlefish/vsoc_x86_64_only/phone/aosp_cf.mk`, and Google has renamed the Cuttlefish device tree twice in the last 18 months. If `lunch milady_cf_x86_64_phone-trunk_staging-userdebug` ever errors with `Cannot locate config for milady_cf_x86_64_phone`, the inherit-product path in `os/android/vendor/milady/products/milady_cf_x86_64_phone.mk` likely needs an update — bisect by `repo init -b <tag>` against an older release tag (e.g. `android-15.0.0_r10`) until the inherit-product path resolves, then update the makefile + `validate.mjs` reference together.
- `repo sync` can take more than an hour and can fail on flaky networks. Re-run the same command if it fails.
- Do not put AOSP under the Milady checkout.

## One-Command Hard Path

From the Milady checkout:

```bash
cd ~/milady
node scripts/miladyos/build-aosp.mjs \
  --aosp-root ~/aosp \
  --rebuild-privileged-apk \
  --launch \
  --boot-validate
```

What this command does:

1. Confirms the host is Linux x86_64 and `/dev/kvm` exists.
2. Confirms `~/aosp/build/envsetup.sh` exists.
3. Cross-compiles `libllama.so` for `arm64-v8a` + `x86_64` from llama.cpp
   `b3490` and stages it under
   `apps/app/android/app/src/main/assets/agent/{abi}/libllama.so`.
   Skipped when both `.so` files already exist; pass `--skip-libllama` to
   skip even when missing (only useful for non-inference smoke iteration).
4. Stages the default chat model (SmolLM2 360M Instruct, ~270 MB) and the
   default embedding model (BGE small en v1.5, ~130 MB) into
   `apps/app/android/app/src/main/assets/agent/models/` along with a
   `manifest.json` describing each file. The on-device runtime's
   bundled-models bootstrap registers these in the local-inference
   registry on first launch so the auto-assign pass picks them up
   without any download UX. Total APK growth: ~400 MB. Pass
   `--skip-bundled-models` (or set `MILADY_SKIP_BUNDLED_MODELS=1`) to
   opt out and rely on runtime download instead. Idempotent: existing
   files of the expected size are left alone.
6. With `--rebuild-privileged-apk`: re-runs `bun run build:android:system`
   under `MILADY_AOSP_BUILD=1` + `MILADY_GRADLE_AOSP_BUILD=true` so the
   APK staged into `os/android/vendor/milady/apps/Milady/Milady.apk`
   carries `BuildConfig.AOSP_BUILD=true` and the AOSP-keyed agent bundle.
7. Copies `os/android/vendor/milady` into `~/aosp/vendor/milady`.
8. Validates the MiladyOS product layer against the AOSP checkout.
9. Runs:

   ```bash
   source build/envsetup.sh
   lunch milady_cf_x86_64_phone-trunk_staging-userdebug
   m -j$(nproc)
   ```

10. Launches Cuttlefish:

    ```bash
    launch_cvd --daemon
    ```

11. Runs boot validation:

   ```bash
   node scripts/miladyos/boot-validate.mjs
   ```

## End-to-End Smoke Test

After the AOSP build finishes and `cvd start` is up, verify the on-device
agent actually serves chat requests with a single command:

```bash
node scripts/miladyos/smoke-cuttlefish.mjs
```

The smoke script runs eight phases:

1. Verifies cvd / device is reachable via adb.
2. Confirms `com.miladyai.milady` is installed; reports the device's
   primary ABI (`getprop ro.product.cpu.abi`).
3. Starts `MiladyAgentService` via `am start-foreground-service`.
4. Polls `http://127.0.0.1:31337/api/health` (over `adb forward`) up to
   30s for a 200.
5. Reads the per-boot bearer token via `adb shell run-as <pkg> cat
   /data/data/<pkg>/files/auth/local-agent-token`.
6. POSTs a chat message to `/v1/chat/completions` with the bearer token.
7. Asserts the response has a non-empty `choices[0].message.content`.
8. Hits `/api/local-inference/active` and asserts a local model is
   loaded (`status: "ready"`, non-null `modelId`) — fails loudly if the
   chat response was cloud-routed.

Pass `--json` for a machine-readable result array. Exit code is 0 on
all-pass, 1 on any failure.

## Manual Build Flow

Use this if you want to isolate the stages.

### 1. Build Milady Android System APK

```bash
cd ~/milady
bun run build:android:system
bun run miladyos:validate
```

### 2. Sync Product Layer Into AOSP

```bash
cd ~/milady
bun run miladyos:sync -- ~/aosp
```

Validate against the AOSP checkout:

```bash
bun run miladyos:validate -- --aosp-root ~/aosp
```

### 3. Build AOSP Product

```bash
cd ~/aosp
source build/envsetup.sh
lunch milady_cf_x86_64_phone-trunk_staging-userdebug
m -j"$(nproc)"
```

### 4. Launch Cuttlefish

```bash
cd ~/aosp
source build/envsetup.sh
lunch milady_cf_x86_64_phone-trunk_staging-userdebug
launch_cvd --daemon
```

By default, Cuttlefish starts WebRTC. On the Linux builder, open:

```text
https://localhost:8443
```

If connecting from another machine, forward or open the relevant WebRTC ports. The primary browser URL is `TCP:8443`; WebRTC also uses `TCP:15550..15599` and `UDP:15550..15599`.

### 5. Runtime Validate

From Milady:

```bash
cd ~/milady
node scripts/miladyos/boot-validate.mjs
```

If multiple Android devices are visible:

```bash
adb devices
node scripts/miladyos/boot-validate.mjs --serial <SERIAL>
```

If `adb` is not on `PATH`:

```bash
node scripts/miladyos/boot-validate.mjs --adb ~/aosp/out/host/linux-x86/bin/adb
```

The boot validator checks:

- Device boot completed.
- `ro.miladyos.product=milady_cf_x86_64_phone`.
- Milady package is installed from `/system/priv-app/Milady/`.
- HOME resolves to `com.miladyai.milady`.
- Role holders include Milady for:
  - `android.app.role.HOME`
  - `android.app.role.DIALER`
  - `android.app.role.SMS`
  - `android.app.role.ASSISTANT`
- Dangerous/default permissions are granted.
- `GET_USAGE_STATS` app-op is allowed.
- Stock browser/calendar/camera/contact/launcher/dialer/messaging packages are absent.
- Logcat does not contain immediate fatal/security/priv-app denial patterns.

## Direct Runtime Checks

These are useful when the validator fails and you need to inspect state:

```bash
adb shell getprop ro.miladyos.product
adb shell pm path com.miladyai.milady
adb shell dumpsys package com.miladyai.milady | less
adb shell cmd package resolve-activity --brief \
  -a android.intent.action.MAIN \
  -c android.intent.category.HOME
adb shell cmd role get-role-holders android.app.role.HOME
adb shell cmd role get-role-holders android.app.role.DIALER
adb shell cmd role get-role-holders android.app.role.SMS
adb shell cmd role get-role-holders android.app.role.ASSISTANT
adb shell appops get com.miladyai.milady GET_USAGE_STATS
adb shell pm list packages | grep -E 'milady|launcher|dialer|messaging|contacts|trebuchet'
adb logcat -d | grep -Ei 'FATAL EXCEPTION|SecurityException|avc: denied|privapp-permissions'
```

Verify the native llama.cpp loader landed (AOSP build only — the Capacitor
APK ships without it and uses the DeviceBridge path instead):

```bash
# Each ABI dir on the device should expose libllama.so alongside bun + musl.
adb shell ls -l /data/data/com.miladyai.milady/files/agent/arm64-v8a/libllama.so
# (or x86_64 on cuttlefish — pick whichever matches `getprop ro.product.cpu.abi`).

# Confirm the agent process exported MILADY_LOCAL_LLAMA=1 at startup.
adb shell ps -A | grep milady
adb shell logcat -d | grep -E '\[aosp-llama\]|MILADY_LOCAL_LLAMA'
```

Expected logcat lines on a healthy AOSP boot:

```
I aosp-llama: Loaded /data/.../<model>.gguf (n_ctx=...)
I aosp-llama: Registered native libllama.so loader (MILADY_LOCAL_LLAMA=1)
```

If `libllama.so` is missing on the device but the gate is on, the runtime
logs `[aosp-llama] MILADY_LOCAL_LLAMA=1 but libllama.so missing at <path>`
and refuses to register the loader (no silent fallback).

Expected high-level results:

- `pm path` contains `/system/priv-app/Milady/`.
- HOME/DIALER/SMS/ASSISTANT holders include `com.miladyai.milady`.
- Stock launcher/dialer/messaging/contact packages should not be installed.
- No priv-app permission denial should appear in logcat.

## Stop And Reset Cuttlefish

Stop:

```bash
cd ~/aosp
stop_cvd
```

If stale state causes weird boot behavior:

```bash
cd ~/aosp
stop_cvd || true
launch_cvd --daemon --resume=false
```

Or use the one-command path again from Milady:

```bash
cd ~/milady
node scripts/miladyos/build-aosp.mjs --aosp-root ~/aosp --launch --boot-validate
```

## Rebuild After Milady Changes

When the Milady app/native plugins change:

```bash
cd ~/milady
git pull --recurse-submodules
git submodule update --init --recursive
bun install
bun run build:android:system
bun run miladyos:validate
node scripts/miladyos/build-aosp.mjs --aosp-root ~/aosp --launch --boot-validate
```

For faster iteration when you only changed `vendor/milady` product XML/makefiles and do not need to rebuild the APK:

```bash
cd ~/milady
node scripts/miladyos/build-aosp.mjs --aosp-root ~/aosp --skip-build
```

For faster iteration when you want build but not launch:

```bash
cd ~/milady
node scripts/miladyos/build-aosp.mjs --aosp-root ~/aosp
```

### One-shot Cuttlefish runner

Once `m` finishes (or while it's still running, with `--wait-for-build`):

```bash
# Wait for system.img, start cvd, validate, capture screenshots — one command
bun run miladyos:sim -- --wait-for-build --out reports/aosp-sim

# Already booted manually? Skip the launch step
bun run miladyos:sim -- --no-launch --out reports/aosp-sim

# Tear down cvd cleanly when done
bun run miladyos:sim -- --stop-after
```

The runner:
1. Waits for `out/target/product/<device>/system.img` to appear (`--wait-for-build` polls).
2. Stops any running cvd instance for a clean boot.
3. `lunch milady_cf_x86_64_phone-trunk_staging-userdebug && cvd start --daemon` (falls back to `launch_cvd --daemon` on Cuttlefish 0.x).
4. Spawns `miladyos:e2e` which boot-validates and captures HOME / Dialer / SMS / Assist / launcher screenshots.
5. Optionally tears down cvd at the end (`--stop-after`).

### Play Store distribution (AAB + dynamic feature module)

Cuttlefish and the AOSP product build want a base APK with the bundled GGUF models inline; cvd cannot consume an AAB. Play Store wants the opposite: an AAB whose base module stays under the 200MB upload ceiling, with the GGUFs split into a dynamic feature module (DFM) that ships alongside the base on first install.

The build script handles both paths from one entry point:

```bash
# AOSP / cuttlefish (default)
node scripts/miladyos/build-aosp.mjs --aosp-root ~/aosp --rebuild-privileged-apk

# Play Store (AAB with :models DFM split out)
MILADY_BUILD_FORMAT=aab \
  node scripts/miladyos/build-aosp.mjs --aosp-root ~/aosp --rebuild-privileged-apk --build-format aab
```

What the AAB path adds on top of the APK path:

1. After `build:android:system` finishes (which produces the base APK), `scripts/miladyos/stage-models-dfm.mjs` restructures the regenerated `apps/app/android/` tree:
   - Creates `apps/app/android/models/` as a new gradle module declared with `apply plugin: 'com.android.dynamic-feature'`.
   - Patches `settings.gradle` to `include ':models'`.
   - Patches `app/build.gradle` to declare `dynamicFeatures = [':models']`.
   - Moves the staged GGUFs from `app/src/main/assets/agent/models/` into `models/src/main/assets/agent/models/`.
2. Invokes `./gradlew :app:bundleRelease` directly (NOT through `bun run build:android:system`, which would re-overlay the regenerated tree and undo the DFM restructure).
3. Stages the resulting AAB at `os/android/vendor/milady/apps/Milady/Milady.aab` next to the existing APK.

The DFM is install-time delivered (`<dist:install-time>` with `<dist:removable dist:value="false" />` and `<dist:fusing dist:include="true" />`), which means Play installs the module alongside the base APK on first install — no on-demand prompt, no `SplitInstallManager` glue in app code. From the user's perspective it's identical to the inline-models APK; from `MiladyAgentService`'s perspective `getAssets().open("agent/models/...")` resolves through the merged AssetManager exactly the same way.

Verify the AAB shape locally with `bundletool` (do NOT upload to Play Store from this script — that's a separate manual step):

```bash
# Install bundletool if not present
curl -L -o /tmp/bundletool.jar \
  https://github.com/google/bundletool/releases/latest/download/bundletool-all-1.18.1.jar

# Sanity-check the AAB structure includes the :models DFM
java -jar /tmp/bundletool.jar build-apks \
  --bundle=os/android/vendor/milady/apps/Milady/Milady.aab \
  --output=/tmp/milady.apks --mode=universal

# `unzip -l /tmp/milady.apks` should list a base/ split AND a models/ split
# the base split should be << 200MB; the models split carries the GGUFs.
unzip -l /tmp/milady.apks | grep -E "(base|models)"
```

Expected approximate sizes after the split:
- Base APK split: ~150 MB (bun runtime + WebView assets + libllama.so).
- Models DFM split: ~400 MB (SmolLM2 + BGE).
- Combined uncompressed install size: same as the inline-models APK; the split only matters at upload + over-the-wire delivery.

The AAB build path gates on `--rebuild-privileged-apk` because the standard MiladyOS APK staging is a dependency: gradle reuses the same agent-bundle.js + libllama.so output the APK path produces. Calling with `--build-format aab` without `--rebuild-privileged-apk` logs a warning and skips the AAB build (the existing APK is left in place).

### Visual / e2e validation (Cuttlefish or AVD)

After Cuttlefish boots (or against a stock AVD), capture role-ownership proof and a PNG gallery of the Milady surfaces:

```bash
# Cuttlefish — full role/permission/appop checks + Dialer/SMS/Assist screenshots
bun run miladyos:e2e -- --out reports/aosp-cuttlefish

# AVD short loop — install the Capacitor APK on an existing emulator
bun run miladyos:avd -- --avd JejuWallet_Pixel6 --capture reports/avd

# Just grab screenshots without driving steps
bun run miladyos:capture -- --out reports/manual --no-launch
```

`miladyos:e2e` writes `report.json` next to the PNGs with the boot-validate results and step list. `miladyos:avd` is the short app-only iteration loop — it does **not** prove role ownership (only Cuttlefish + a real AOSP build can do that), but it does verify the WebView, gateway service, and deep-link routing without paying for a system rebuild.

### `dev:android` is not the AOSP loop

`bun run dev:android` opens **Android Studio against the Capacitor app**, not against AOSP. It builds a debug APK and installs it on a connected handset/emulator using the standard Capacitor flow. This is for app-only iteration without the system image.

The actual AOSP iteration loop is:

1. Edit Capacitor app sources or `os/android/vendor/milady/`.
2. `bun run build:android:system` (rebuilds the privileged APK).
3. `node scripts/miladyos/build-aosp.mjs --aosp-root ~/aosp` (sync + `m`).
4. If only product XML/makefiles changed, add `--skip-build` to skip the APK rebuild.
5. `node scripts/miladyos/build-aosp.mjs --aosp-root ~/aosp --launch --boot-validate` to relaunch Cuttlefish from a clean state.

## Known Limits Of This Stage

Validated locally on macOS:

- Android system APK builds (requires Android SDK with `build-tools` and JDK 21).
- Static MiladyOS product validation passes (requires `xmllint` and `aapt` — see below).
- MiladyOS script and workflow contract tests pass.
- App-core typecheck passes.

`bun run miladyos:validate` shells out to two binaries that aren't on a stock macOS:

```bash
brew install libxml2     # for xmllint
# aapt comes with the Android SDK build-tools — install via Android Studio
#   or `sdkmanager "build-tools;36.0.0"` and ensure ANDROID_HOME is set.
```

On Linux these come from `apt install libxml2-utils` and the SDK / `setup-android` action respectively.

Requires Linux/KVM validation:

- Full AOSP product build.
- Cuttlefish boot.
- Runtime role ownership.
- Runtime permissions.
- Actual launcher/default app behavior in the device UI.

Still out of scope for Cuttlefish:

- Real modem behavior.
- Carrier SMS/MMS integration beyond platform APIs.
- Hardware telephony stack behavior.
- OEM bootloader flashing.
- Physical device partition quirks.

Those come after Cuttlefish is green.

## Troubleshooting

### Sepolicy + seccomp diagnosis

The on-device agent is gated by **two** independent kernel mechanisms:

- **SELinux (MAC)** — controlled by `os/android/vendor/milady/sepolicy/`. Denials show up in logcat as `avc: denied { ... }` lines. The current allow rule in `milady_agent.te` (`allow platform_app app_data_file:file { execute execute_no_trans };`) is what lets bun start.
- **seccomp-bpf** — controlled by AOSP's per-arch syscall allowlist in `bionic/libc/seccomp/{x86_64,arm64}_app_policy.cpp`. Denials kill the process with `SIGSYS` (signal 31, exit code 159 = 128 + 31). **No SELinux rule can relax the seccomp filter** — it's locked at zygote fork via `prctl(PR_SET_NO_NEW_PRIVS, 1)`.

The seccomp mitigation lives in `MiladyAgentService.startAgentProcess()` as four `BUN_FEATURE_FLAG_*` env vars passed to bun (`DISABLE_IO_POOL`, `FORCE_WAITER_THREAD`, `DISABLE_RWF_NONBLOCK`, `DISABLE_SPAWNSYNC_FAST_PATH`). They route bun off `io_uring_*`, `pidfd_*`, `clone3`, and `RWF_NONBLOCK` syscall paths that Android's app allowlist blocks. The same flag list is documented in `milady_agent.te`'s comment block; `validateSepolicy()` pins both copies so they cannot drift apart silently.

Verify on a clean Cuttlefish boot:

```bash
# 1. Static check (works without a device): the .te + file_contexts +
#    runtime BUN_FEATURE_FLAG_* parity.
bun run miladyos:validate

# 2. Live check on cuttlefish: no SIGSYS, no audit lines, milady process up.
adb shell ps -A | grep milady
adb logcat -d | grep -E "(seccomp|SIGSYS|audit:.*type=1326)"
adb shell dmesg | grep -E "(seccomp|SIGSYS)"

# 3. Live check: SELinux denials targeting milady_agent_* labels.
adb logcat -d | grep -E "avc:.*(milady_agent|com\.miladyai\.milady)"
```

Healthy state: the process is in `ps -A`, logcat / dmesg are silent, and any `avc:` lines that DO mention Milady are documented `dontaudit`-eligible noise (proc/sysfs probes, etc.) — not `denied { execute }` for the bun binary, which is the failure mode the allow rule addresses.

If a future bun release introduces a brand-new gated syscall with no fallback flag, the only fixes are (a) downgrade bun, (b) patch bun, or (c) extend the per-arch seccomp allowlist in `bionic/libc/seccomp/` and rebuild AOSP. None of those are sepolicy work — vendor sepolicy cannot relax seccomp.

### `MiladyOS AOSP/Cuttlefish builds require a Linux x86_64 builder with KVM`

You are not on Linux x86_64, or Node reports a non-x64 architecture. Use an x86_64 Linux builder.

### `MiladyOS Cuttlefish launch requires /dev/kvm`

Enable virtualization in BIOS/UEFI or fix VM nested virtualization. Confirm:

```bash
find /dev -name kvm
groups
```

If your user is missing groups, re-run:

```bash
sudo usermod -aG kvm,cvdnetwork,render "$USER"
sudo reboot
```

### `~/aosp is missing build/envsetup.sh`

The AOSP checkout is incomplete or the wrong path was passed. Check:

```bash
ls ~/aosp/build/envsetup.sh
```

### `repo sync` fails

Re-run it:

```bash
cd ~/aosp
repo sync -c -j8
```

If it repeatedly fails, lower parallelism:

```bash
repo sync -c -j4
```

### `nsjail: mount('/', '/', ...): Permission denied` partway through `m`

Ubuntu 24.04 restricts unprivileged user namespaces via AppArmor by default. AOSP's Soong uses `nsjail` to sandbox parts of the build (Trusty TEE VM and a few others) and nsjail can't set up its sandbox root without those namespaces. Symptom:

```
FAILED: out/soong/.intermediates/trusty/.../trusty_security_vm_*.elf
[E] initCloneNs(): mount('/', '/', NULL, MS_REC|MS_PRIVATE, NULL): Permission denied
ninja: build stopped: subcommand failed.
```

Fix (one-time, persistent across reboots):

```bash
echo "kernel.apparmor_restrict_unprivileged_userns = 0" | \
  sudo tee /etc/sysctl.d/99-miladyos-aosp.conf
sudo sysctl --system
```

`scripts/aosp-host-root-setup.sh` writes this file already; only relevant if you set up the host before this fix landed or used a different setup path.

### AOSP build runs out of memory

Lower parallelism:

```bash
cd ~/milady
node scripts/miladyos/build-aosp.mjs --aosp-root ~/aosp --jobs 4
```

### Boot validator cannot find `adb`

Use AOSP's built `adb`:

```bash
node scripts/miladyos/boot-validate.mjs --adb ~/aosp/out/host/linux-x86/bin/adb
```

Or export:

```bash
export PATH="$HOME/aosp/out/host/linux-x86/bin:$PATH"
```

### Multiple devices are connected

Specify the serial:

```bash
adb devices
node scripts/miladyos/boot-validate.mjs --serial <SERIAL>
```

### WebRTC UI does not load

On the builder:

```bash
curl -k https://localhost:8443
```

For remote browser access, use SSH forwarding:

```bash
ssh -L 8443:localhost:8443 <user>@<linux-builder>
```

Then open:

```text
https://localhost:8443
```

If direct remote access is required, allow:

- `TCP:8443`
- `TCP:15550..15599`
- `UDP:15550..15599`

### Stock apps are still present

Check product inheritance and overrides:

```bash
grep -R "PRODUCT_PACKAGES -=" ~/aosp/vendor/milady/products
grep -R "overrides:" ~/aosp/vendor/milady/apps/Milady
```

Then rebuild:

```bash
cd ~/milady
node scripts/miladyos/build-aosp.mjs --aosp-root ~/aosp --launch --boot-validate
```

### Milady is installed but not default HOME

Inspect HOME resolution and role state:

```bash
adb shell cmd package resolve-activity --brief \
  -a android.intent.action.MAIN \
  -c android.intent.category.HOME
adb shell cmd role get-role-holders android.app.role.HOME
adb shell dumpsys package com.miladyai.milady | grep -Ei 'android.intent.category.HOME|android.intent.action.MAIN'
```

If HOME resolution does not point at Milady, rebuild after confirming the stock launchers were removed by the product layer.

## Success Criteria

Call the Linux validation green only when all of these pass:

```bash
cd ~/milady
bun run build:android:system
bun run miladyos:validate
node scripts/miladyos/build-aosp.mjs --aosp-root ~/aosp --launch --boot-validate
```

And manually confirm in WebRTC:

- Device boots to Milady.
- No stock launcher is reachable as the primary UX.
- Phone, Messages, and Contacts tabs are visible in Milady.
- `adb shell cmd role get-role-holders ...` returns Milady for HOME/DIALER/SMS/ASSISTANT.

