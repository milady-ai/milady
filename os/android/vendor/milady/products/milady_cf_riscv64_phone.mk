$(call inherit-product, device/google/cuttlefish/vsoc_riscv64/phone/aosp_cf.mk)

PRODUCT_NAME := milady_cf_riscv64_phone
PRODUCT_DEVICE := vsoc_riscv64
PRODUCT_MODEL := MiladyOS Cuttlefish riscv64 Phone

MILADY_PRODUCT_TAG := milady_cf_riscv64_phone

$(call inherit-product, vendor/milady/milady_common.mk)
