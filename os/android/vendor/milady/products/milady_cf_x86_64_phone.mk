$(call inherit-product, device/google/cuttlefish/vsoc_x86_64_only/phone/aosp_cf.mk)

PRODUCT_NAME := milady_cf_x86_64_phone
PRODUCT_DEVICE := vsoc_x86_64_only
PRODUCT_BRAND := Milady
PRODUCT_MODEL := MiladyOS Cuttlefish Phone
PRODUCT_MANUFACTURER := Milady

PRODUCT_PACKAGES += \
    Milady \
    default-permissions-com.miladyai.milady.xml \
    privapp-permissions-com.miladyai.milady.xml

PRODUCT_PACKAGES -= \
    Browser2 \
    Calendar \
    Camera2 \
    Contacts \
    DeskClock \
    Dialer \
    Email \
    Gallery2 \
    Launcher3 \
    Launcher3QuickStep \
    Messaging \
    Music \
    QuickSearchBox \
    Trebuchet

PRODUCT_PACKAGE_OVERLAYS += \
    vendor/milady/overlays/framework-res

PRODUCT_ARTIFACT_PATH_REQUIREMENT_ALLOWED_LIST += \
    system/priv-app/Milady/% \
    system/etc/default-permissions/default-permissions-com.miladyai.milady.xml \
    system/etc/permissions/privapp-permissions-com.miladyai.milady.xml

PRODUCT_SYSTEM_DEFAULT_PROPERTIES += \
    ro.miladyos.product=milady_cf_x86_64_phone \
    ro.miladyos.home=com.miladyai.milady
