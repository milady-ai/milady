# MiladyOS Android Product Layer

This directory contains the Milady-owned Android source overlay for building a real AOSP/Cuttlefish system image. It is not a kiosk or managed-device setup.

## Builder Requirements

AOSP builds must run on a Linux x86_64 builder with KVM available. Keep the Android source checkout outside this repository.

## Build Flow

```bash
bun install
bun run build:android:system
bun run miladyos:validate

repo init --partial-clone -b android-latest-release \
  -u https://android.googlesource.com/platform/manifest
repo sync -c -j8

bun run miladyos:sync -- /path/to/aosp

cd /path/to/aosp
source build/envsetup.sh
lunch milady_cf_x86_64_phone-trunk_staging-userdebug
m
launch_cvd --daemon
node /path/to/milady/scripts/miladyos/boot-validate.mjs
```

`bun run build:android:system` stages `vendor/milady/apps/Milady/Milady.apk`. `bun run miladyos:sync` copies this product layer into the AOSP checkout as `vendor/milady`.

`bun run miladyos:validate` checks the staged APK package, label, permissions, launcher/dialer/SMS/phone-service manifest entries, product makefile, Soong prebuilt, permission XML, and overlay XML. When an AOSP checkout is available, run `bun run miladyos:validate -- --aosp-root /path/to/aosp` to also verify the local AOSP source still uses `framework-res` strings for Dialer/SMS/Assistant role defaults. Current AOSP `roles.xml` does not define a `HOME` default-holder resource; Home falls back through package-manager home resolution, so Milady is made Home by being the installed HOME activity while the standard launchers are overridden.

On a Linux x86_64 builder with KVM and an existing AOSP checkout, the hard-path command is:

```bash
node scripts/miladyos/build-aosp.mjs --aosp-root /path/to/aosp --launch --boot-validate
```

That command syncs `vendor/milady`, validates the product layer against the AOSP source, runs `lunch milady_cf_x86_64_phone-trunk_staging-userdebug && m`, launches Cuttlefish, and then runs the boot validator.

Primary AOSP source points used for the role wiring:

- `packages/modules/Permission/PermissionController/res/xml/roles.xml`
- `frameworks/base/core/res/res/values/config.xml`

## Verification

```bash
bun run miladyos:validate
adb shell cmd role get-role-holders android.app.role.HOME
adb shell cmd role get-role-holders android.app.role.DIALER
adb shell cmd role get-role-holders android.app.role.SMS
adb shell cmd role get-role-holders android.app.role.ASSISTANT
adb shell package resolve-activity --brief android.intent.action.MAIN -c android.intent.category.HOME
adb shell pm list packages | grep -E 'milady|launcher|dialer|messaging|contacts'
node scripts/miladyos/boot-validate.mjs
```
