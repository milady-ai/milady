# 04 — Asset Management Policy

**Owner:** IT / People Ops
**Review cadence:** Annual; inventory reviewed quarterly
**SOC2 mapping:** CC6.4, CC6.5, CC6.8, CC9

## Purpose

Track and protect hardware and software assets used to access or process Eliza data.

## Scope

Company-issued laptops, mobile devices, servers/VMs in cloud accounts, container registries, package registries, signing keys, and software licenses.

## Policy Statements

1. **Inventory** — every company-issued laptop and every cloud VM is recorded in the asset register with owner, purpose, OS, and date-of-issue.
2. **Endpoint protection** — laptops run an OS-native or third-party endpoint protection tool (XProtect/MDE/equivalent). Auto-update enabled.
3. **Secure disposal** — on offboarding or hardware retirement, drives are cryptographically erased; cloud disks are deleted via the provider's secure-erase API. A disposal record is kept.
4. **Software inventory** — production runtime dependencies are tracked via SBOM (CycloneDX or SPDX) generated in CI. See [`16-secure-development.md`](16-secure-development.md).
5. **Container images** — base images are pinned; rebuilt monthly and on critical CVE. Signed via Sigstore Cosign.
6. **No unmanaged storage of confidential data** on assets outside the inventory.

## Procedures

- Onboarding: IT assigns the laptop, registers in the inventory, enrolls in MDM if used.
- Offboarding: IT recovers the device, wipes, marks the inventory entry as retired with the disposal date.
- Cloud asset audit: quarterly export of running VMs / containers, reconciled to the register.

## Evidence

- Asset register (spreadsheet or GRC tool).
- Disposal records.
- SBOM artifacts in CI build logs.
- Cosign signatures on container images.

## Open Items For Human Sign-Off

- Confirm endpoint protection tool.
- Confirm container registry (GHCR vs other).
