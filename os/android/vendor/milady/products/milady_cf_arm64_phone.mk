$(call inherit-product, device/google/cuttlefish/vsoc_arm64_only/phone/aosp_cf.mk)

PRODUCT_NAME := milady_cf_arm64_phone
PRODUCT_DEVICE := vsoc_arm64_only
PRODUCT_MODEL := MiladyOS Cuttlefish arm64 Phone

MILADY_PRODUCT_TAG := milady_cf_arm64_phone

$(call inherit-product, vendor/milady/milady_common.mk)
