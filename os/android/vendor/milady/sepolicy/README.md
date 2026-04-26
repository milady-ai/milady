# MiladyOS sepolicy

Custom selinux policy for the Milady privileged system app.

`BOARD_VENDOR_SEPOLICY_DIRS += vendor/milady/sepolicy` (in `milady_common.mk`) wires this directory into the board policy. Files here merge into the device-specific policy at build time.

## Layout

- `file_contexts` — labels for paths the Milady app or init scripts create outside the APK.
- `private/*.te` — type/rule declarations not exposed cross-domain.
- `public/*.te` — types other domains may reference. Empty today.

## Adding a rule

1. Trigger the behavior on a userdebug Cuttlefish boot.
2. `adb logcat | grep 'avc:'` — copy the denial.
3. `audit2allow` against the denial to draft a `.te` rule.
4. Drop the rule into `private/<domain>.te`.
5. Rebuild and verify the denial is gone.

Never commit overly broad `allow` rules — every line of policy is a security trade. Prefer narrow domains (`milady_data_file`) over reusing `system_data_file` for app-private data.

## Audit-only mode

For initial bring-up, denials log without enforcing if the device is set to permissive (`adb shell setenforce 0`). Production builds must run enforcing — the policy stub here is the starting point for that work, not the finished policy.
