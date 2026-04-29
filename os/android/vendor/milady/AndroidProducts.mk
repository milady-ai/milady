# MiladyOS lunch targets.
#
# Cuttlefish: virtual phone, x86_64, validated end-to-end via
#   `bun run miladyos:e2e` after `cvd start --daemon`.
# Pixel codenames: real-device targets. Each per-codename wrapper sets
#   MILADY_PIXEL_CODENAME and inherits products/milady_pixel_phone.mk.
#   The wrapper file must exist for `lunch` to surface the target;
#   add new codenames by creating products/milady_<codename>_phone.mk
#   and listing it under PRODUCT_MAKEFILES + COMMON_LUNCH_CHOICES below.

PRODUCT_MAKEFILES := \
    $(LOCAL_DIR)/products/milady_cf_x86_64_phone.mk \
    $(LOCAL_DIR)/products/milady_oriole_phone.mk \
    $(LOCAL_DIR)/products/milady_panther_phone.mk \
    $(LOCAL_DIR)/products/milady_shiba_phone.mk \
    $(LOCAL_DIR)/products/milady_caiman_phone.mk

COMMON_LUNCH_CHOICES := \
    milady_cf_x86_64_phone-trunk_staging-userdebug \
    milady_oriole_phone-trunk_staging-userdebug \
    milady_panther_phone-trunk_staging-userdebug \
    milady_shiba_phone-trunk_staging-userdebug \
    milady_caiman_phone-trunk_staging-userdebug
