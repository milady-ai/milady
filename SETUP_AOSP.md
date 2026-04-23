# MiladyOS AOSP + Cuttlefish Setup

This is the migration runbook for taking the current `develop` branch onto a Linux builder and validating the hard-path MiladyOS build: a real AOSP/Cuttlefish product image where Milady is installed as a privileged system app and owns the phone UI surface.

This is not kiosk mode, managed-device mode, or an emulator-only wrapper. The target is an AOSP product build named `milady_cf_x86_64_phone-userdebug`.

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

Use a Linux x86_64 machine with KVM. The MiladyOS build script enforces this because the current Cuttlefish target is `milady_cf_x86_64_phone-userdebug`.

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

Build and stage the Android system APK:

```bash
bun run build:android:system
```

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

- Google now recommends `android-latest-release` for platform work.
- `repo sync` can take more than an hour and can fail on flaky networks. Re-run the same command if it fails.
- Do not put AOSP under the Milady checkout.

## One-Command Hard Path

From the Milady checkout:

```bash
cd ~/milady
node scripts/miladyos/build-aosp.mjs \
  --aosp-root ~/aosp \
  --launch \
  --boot-validate
```

What this command does:

1. Confirms the host is Linux x86_64 and `/dev/kvm` exists.
2. Confirms `~/aosp/build/envsetup.sh` exists.
3. Copies `os/android/vendor/milady` into `~/aosp/vendor/milady`.
4. Validates the MiladyOS product layer against the AOSP checkout.
5. Runs:

   ```bash
   source build/envsetup.sh
   lunch milady_cf_x86_64_phone-userdebug
   m -j$(nproc)
   ```

6. Launches Cuttlefish:

   ```bash
   launch_cvd --daemon
   ```

7. Runs boot validation:

   ```bash
   node scripts/miladyos/boot-validate.mjs
   ```

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
lunch milady_cf_x86_64_phone-userdebug
m -j"$(nproc)"
```

### 4. Launch Cuttlefish

```bash
cd ~/aosp
source build/envsetup.sh
lunch milady_cf_x86_64_phone-userdebug
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

## Known Limits Of This Stage

Validated locally on macOS:

- Android system APK builds.
- Static MiladyOS product validation passes.
- MiladyOS script and workflow contract tests pass.
- App-core typecheck passes.

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

