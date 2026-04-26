# MiladyOS — Real Device Build & Flash

This is the runbook for taking the same `milady_cf_*` product layer and producing a system image that runs on physical hardware. Cuttlefish is the simulator that proves the privileged-app integration; this document covers the actual phone path.

There is no shortcut. AOSP source images run only on devices for which AOSP ships a complete device tree (Pixels, AOSP-supported partner devices) — every other device requires vendor blobs you have to obtain from the OEM, which gates the project on a hardware-acquisition step before the software flow even starts.

## Hardware target options

| Target | Why pick it | Caveats |
| --- | --- | --- |
| **Pixel 6 / 7 / 8 / 9** | Google ships the device tree + binary blobs in AOSP. Bootloader unlocks officially. The fastest path to a real phone running MiladyOS. | OEM-locks lose Play Integrity, banking apps will refuse. |
| **Generic ARM64 device with GSI support** | Boot a Generic System Image on any Treble-compliant device. | No telephony / sensor / camera unless the vendor partition stays from the OEM. Loses the priv-app HOME story unless you flash Milady into the system_ext slot or pre-bake into the GSI. |
| **Cuttlefish on Cloud / dev** | Pure software. Same path as `SETUP_AOSP.md`. | Not a phone. Modem/sensor/camera fidelity is fake. Useful for CI, not for the on-the-go product. |
| **Custom partner board** | OEM relationship — they ship a board support package, you bake Milady on top. | Requires OEM cooperation, NDA, hardware delivery, secure boot key handling. |

For the foreseeable iteration, **Pixel** is the only target where one developer can go end-to-end without a partner deal. Everything below assumes a Pixel target unless stated.

## Pixel target prerequisites

- Pixel 6, 7, 8, 9, or 9 Pro running the same Android major version as the AOSP branch (`android-latest-release` ≈ Android 16/Baklava preview at the time of writing). Mixing AOSP major versions and the device's stock major version is well-defined but breaks vendor compatibility on a sub-major mismatch.
- A USB-C cable that does data, not power-only.
- The user account on the dev machine must be in `plugdev` and `adbusers` (Linux), or have macOS/Windows ADB drivers installed.
- The Pixel must be in **Developer Options → OEM unlock = ON** *before* you reboot to the bootloader. Google does not let you toggle OEM unlock from `fastboot`.

## Bootloader unlock (one-time, wipes the device)

```bash
adb reboot bootloader
fastboot flashing unlock     # screen prompts the user to confirm with volume keys
fastboot reboot
```

The device factory-resets. Re-enable Developer Options + OEM unlock + USB Debugging after the wipe so you can reflash.

## Lunch target for Pixel

The lunch target is **not** `milady_cf_x86_64_phone-trunk_staging-userdebug` — that is the Cuttlefish virtual target. For real Pixels you inherit from the matching device makefile. Add a Pixel product makefile alongside the Cuttlefish one:

```
os/android/vendor/milady/products/milady_pixel_phone.mk
  $(call inherit-product, device/google/<codename>/aosp_<codename>.mk)
  PRODUCT_NAME := milady_<codename>_phone
  PRODUCT_DEVICE := <codename>
  ...
```

Pixel codenames: `oriole` (P6), `raven` (P6 Pro), `bluejay` (P6a), `panther` (P7), `cheetah` (P7 Pro), `lynx` (P7a), `shiba` (P8), `husky` (P8 Pro), `akita` (P8a), `caiman` (P9), `komodo` (P9 Pro), `tokay` (P9 Pro XL), `tegu` (P9a). Confirm by `lunch` listing inside the AOSP checkout.

`AndroidProducts.mk` then needs the matching lunch entry:

```
COMMON_LUNCH_CHOICES := \
    milady_cf_x86_64_phone-trunk_staging-userdebug \
    milady_<codename>_phone-trunk_staging-userdebug
```

## Vendor binaries

Pixels need binary vendor blobs that AOSP cannot redistribute. Download from <https://developers.google.com/android/drivers> for the matching build number, then:

```bash
cd ~/aosp
# extract <codename>-vendor.tgz and <codename>-qcom.tgz to vendor/google_devices/
./extract-google_devices-<codename>.sh   # script ships in the tarballs
```

Without these the build will succeed but the device will refuse to boot — modem, GPU, sensor stack, camera HAL all live in vendor.

## Build for the real device

```bash
cd ~/aosp
source build/envsetup.sh
lunch milady_<codename>_phone-trunk_staging-userdebug
m -j$(nproc)
```

`m` produces:

- `out/target/product/<codename>/system.img`
- `out/target/product/<codename>/vendor.img`
- `out/target/product/<codename>/boot.img`
- `out/target/product/<codename>/super.img` (A/B partition combined image)

## Flash

```bash
adb reboot bootloader
cd ~/aosp/out/target/product/<codename>
fastboot flashall -w        # -w wipes userdata; omit on incremental reflash
```

`flashall` reads `android-info.txt` to know which partitions to push. On Pixel that is `boot`, `dtbo`, `vbmeta`, `vendor_boot`, `super`. The script will reboot the device.

## Production signing

`userdebug` is the dev/lab build flavor. **Do not ship `userdebug` to end users** — it leaves `adb root`, `su`, and the test keys on the device.

For a release build you need:

1. Generate four signing keys (`make-key.sh` from `build/make/target/product/security`):
   - `releasekey` — replaces the `testkey`.
   - `platform` — used by `android_app_import` for Milady; must match what we resign Milady.apk with.
   - `shared`, `media` — distinct keys for AOSP-internal apps that share UIDs.
2. Drop them at `vendor/milady/security/<key>.pk8` + `<key>.x509.pem`.
3. Set `PRODUCT_DEFAULT_DEV_CERTIFICATE := vendor/milady/security/releasekey` in the product makefile.
4. Switch the lunch flavor: `milady_<codename>_phone-trunk_staging-user` (drop `debug`).
5. Re-`m -j` — every priv-app gets re-signed with the production keys.
6. Sign the OTA / factory image with `signapk` from `out/host/linux-x86/bin/signapk`. Detailed flow: <https://source.android.com/docs/core/ota/sign_builds>.

The Capacitor app's release APK signing config (`ELIZAOS_KEYSTORE_PATH` etc.) is *separate* from the AOSP platform key — Soong's `android_app_import` resigns the prebuilt with the platform certificate at `m` time, so what matters for production is the **platform key**, not the upload keystore.

## Re-flash after iteration

```bash
cd ~/aosp
source build/envsetup.sh
lunch milady_<codename>_phone-trunk_staging-userdebug
m -j$(nproc)
adb reboot bootloader
fastboot flashall          # omit -w to keep userdata
```

For just the Milady APK without re-imaging the whole system:

```bash
adb root
adb remount             # remounts /system rw on userdebug only
adb push out/target/product/<codename>/system/priv-app/Milady/Milady.apk \
        /system/priv-app/Milady/Milady.apk
adb shell pm install -r --user 0 /system/priv-app/Milady/Milady.apk
adb shell am force-stop com.miladyai.milady
```

## Lock the bootloader for production deployment

Once a release-signed image is ready and a user-facing device is being set up:

```bash
fastboot flashing lock     # re-locks; only release-signed images will boot
```

Re-locking with a `userdebug` image bricks the device. Don't.

## CI considerations

- Real-device builds need a self-hosted runner with the Pixel attached via USB and the unlocked-bootloader state pre-baked into the runner setup.
- Unattended `fastboot flashing unlock` is not possible — Google requires a physical button press.
- For OTA promotion automation, build the release-signed package on the runner, sign the OTA, and push to a private OTA endpoint that the device pulls from on `update_engine` schedule.

## Known gaps before this is shippable

- We only ship the Cuttlefish makefile. A `milady_<codename>_phone.mk` per Pixel codename is still TODO.
- Production signing keys do not exist in the repo (intentionally).
- Vendor blob download is manual; could be automated via a script that pulls the matching build number from `developers.google.com/android/drivers`.
- `bun run miladyos:validate` checks the Cuttlefish path only; needs a `--device <codename>` mode for real-device targets.
- No OTA infrastructure. First-touch flashing is manual `fastboot flashall`.
