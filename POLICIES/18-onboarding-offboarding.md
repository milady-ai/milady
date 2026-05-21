# 18 — Onboarding & Offboarding Procedure

**Owner:** People Ops
**Review cadence:** Annual
**SOC2 mapping:** CC1.4, CC6.2, CC6.5

## Purpose

Define the standard sequence for granting and revoking access to Eliza systems.

## Scope

All employees and contractors with access to Eliza systems.

## Onboarding Sequence

1. **Offer + background check** (where legally permissible for prod-access roles).
2. **IdP account** created in Google/Okta with default group membership only.
3. **Hardware** issued from the asset register; MDM enrollment if applicable.
4. **Acknowledgments signed**: this policy + Information Security Policy + Acceptable Use + Code of Conduct.
5. **Role-specific grants** approved by engineering lead and provisioned.
6. **Security training** completed within first 30 days.

## Offboarding Sequence

1. **Notification** received by People Ops.
2. **Disable IdP account** within 1 business hour of exit time (target same hour for involuntary exits).
3. **Revoke machine tokens** owned by departing person within 1 business day (GitHub PATs, cloud CLI creds, plugin signing keys).
4. **Rotate shared secrets** the person had access to (KMS bootstrap secrets if applicable, deploy keys) within 7 days.
5. **Asset return** logged in the asset register; cryptographic erase per [`04-asset-management.md`](04-asset-management.md).
6. **Mailbox / channel access** suspended; forwarding configured per business need.
7. **Final access-review entry** filed.

## Policy Statements

1. Default-deny: every grant is explicit; no inherited prod access from group membership without sign-off.
2. Background checks (for prod-access roles) are documented in the HR system.
3. Reactivation of a former account is treated as new onboarding (re-sign acknowledgments, re-grant).

## Evidence

- Onboarding/offboarding ticket per person with timestamps.
- Token-rotation records.
- Asset return / erase records.

## Open Items For Human Sign-Off

- Background-check vendor.
- Reactivation policy variance for boomerang hires.
