# Parameterized Pixel product makefile for MiladyOS.
#
# Per-codename wrappers (milady_oriole_phone.mk, milady_panther_phone.mk,
# milady_shiba_phone.mk, ...) set MILADY_PIXEL_CODENAME and inherit this
# file. The codename inherit-product line resolves to whichever AOSP
# manifest tag was synced; on `android-latest-release` the Pixel device
# trees only appear during specific release windows, so a `lunch` failure
# pointing at this line means the AOSP checkout doesn't carry the device
# tree for that codename — re-init `repo` against an AOSP tag that does.
#
# References
#   https://developers.google.com/android/drivers — vendor blob downloads
#   https://source.android.com/docs/devices/google-devices

ifndef MILADY_PIXEL_CODENAME
$(error milady_pixel_phone.mk requires MILADY_PIXEL_CODENAME (e.g. oriole, panther, shiba))
endif

$(call inherit-product, device/google/$(MILADY_PIXEL_CODENAME)/aosp_$(MILADY_PIXEL_CODENAME).mk)

PRODUCT_NAME := milady_$(MILADY_PIXEL_CODENAME)_phone
PRODUCT_DEVICE := $(MILADY_PIXEL_CODENAME)
PRODUCT_MODEL := MiladyOS Phone ($(MILADY_PIXEL_CODENAME))

MILADY_PRODUCT_TAG := milady_$(MILADY_PIXEL_CODENAME)_phone

$(call inherit-product, vendor/milady/milady_common.mk)
