#!/usr/bin/env bash
# Run once with: sudo bash scripts/aosp-host-root-setup.sh
# Installs APT packages for AOSP + Cuttlefish, builds Cuttlefish debs, adds user to kvm/cvdnetwork/render.
# After this script completes, reboot (or newgrp) so group membership applies.

set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash $0" >&2
  exit 1
fi

REAL_USER="${SUDO_USER:-${REAL_USER:-}}"
if [[ -z "${REAL_USER}" || "${REAL_USER}" == root ]]; then
  echo "Set SUDO_USER is required (use sudo from a normal account)." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y \
  git-core gnupg flex bison build-essential zip curl \
  zlib1g-dev libc6-dev-i386 x11proto-core-dev libx11-dev \
  lib32z1-dev libgl1-mesa-dev libxml2-utils xsltproc unzip \
  fontconfig repo \
  python3 python-is-python3 \
  git devscripts equivs config-package-dev debhelper-compat golang curl

CUTTLE_DIR="${CUTTLE_DIR:-/home/${REAL_USER}/android-cuttlefish}"
if [[ ! -d "${CUTTLE_DIR}/.git" ]]; then
  rm -rf "${CUTTLE_DIR}"
  sudo -u "${REAL_USER}" git clone https://github.com/google/android-cuttlefish "${CUTTLE_DIR}"
fi
sudo -u "${REAL_USER}" bash -lc "cd '${CUTTLE_DIR}' && tools/buildutils/build_packages.sh"

shopt -s nullglob
for deb in "${CUTTLE_DIR}"/cuttlefish-base_*_*64.deb; do dpkg -i "$deb" || apt-get install -f -y; done
for deb in "${CUTTLE_DIR}"/cuttlefish-user_*_*64.deb; do dpkg -i "$deb" || apt-get install -f -y; done

usermod -aG kvm,cvdnetwork,render "${REAL_USER}"

# Ubuntu 24.04 ships AppArmor with unprivileged user namespaces restricted
# by default. AOSP's Soong uses nsjail to sandbox parts of the build
# (Trusty TEE VM, etc.) and nsjail relies on unprivileged userns to mount
# its sandbox root. Without this, `m` fails partway through with:
#   FAILED: out/soong/.intermediates/trusty/.../trusty_security_vm_*.elf
#   nsjail: initCloneNs(): mount('/', '/', NULL, MS_REC|MS_PRIVATE, NULL): Permission denied
# Persist the unrestrict so subsequent boots don't re-break the build.
echo "kernel.apparmor_restrict_unprivileged_userns = 0" \
  > /etc/sysctl.d/99-miladyos-aosp.conf
sysctl --system >/dev/null

echo "Done. Reboot or log out/in so user ${REAL_USER} is in kvm,cvdnetwork,render."
