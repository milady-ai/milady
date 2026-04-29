$(call inherit-product, device/google/cuttlefish/vsoc_x86_64_only/phone/aosp_cf.mk)

PRODUCT_NAME := milady_cf_x86_64_phone
PRODUCT_DEVICE := vsoc_x86_64_only
PRODUCT_MODEL := MiladyOS Cuttlefish Phone

# Set before inheriting milady_common.mk so the brand property can pin
# this image to its lunch target.
MILADY_PRODUCT_TAG := milady_cf_x86_64_phone

$(call inherit-product, vendor/milady/milady_common.mk)
