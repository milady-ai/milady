# 02 — Access Control Policy

**Owner:** Security Lead
**Review cadence:** Annual; access reviews quarterly
**SOC2 mapping:** CC6.1, CC6.2, CC6.3, CC6.6

## Purpose

Define how identities are created, authorized, reviewed, and revoked across Eliza Cloud, source control, infrastructure, and internal tooling.

## Scope

All human and machine identities that access Eliza-controlled systems: employees, contractors, CI bots, deploy runners, plugin signing keys, GRC integrations.

## Roles & Responsibilities

- **Security Lead** — owns this policy and quarterly access reviews.
- **IT / People Ops** — provision/deprovision via the identity provider (Google Workspace or Okta) on hire/role-change/exit.
- **Engineering Leads** — approve role-based scope grants for their service.

## Policy Statements

1. **SSO required** for all internal services that support it (GitHub, hosting provider console, observability stack, GRC tool).
2. **MFA enforced** on the identity provider, GitHub, hosting console, and any service exposing prod-write capability. WebAuthn preferred; TOTP acceptable.
3. **Least privilege.** Default grant is read-only on prod. Write access requires named role membership and a documented business need.
4. **Production access tiering** — three tiers: read (logs, dashboards), operate (deploys, restarts), admin (IAM, KMS, billing). Admin requires two-person approval to grant.
5. **Quarterly access review** — every prod-touching role is re-attested by the engineering lead and the Security Lead. Stale grants are removed.
6. **Machine identities** (CI tokens, deploy keys, plugin signing keys) are scoped to a single repo/service and rotated per the schedule in [`12-cryptography.md`](12-cryptography.md).
7. **Customer authentication** — Eliza Cloud user auth supports MFA; admin/superuser actions in Cloud require MFA.

## Procedures

- Provisioning: People Ops opens an onboarding ticket; engineering lead approves role memberships; identity provider creates the account with default-deny grants.
- Deprovisioning: on exit notification, IT disables the IdP account within 1 business hour; engineering revokes machine tokens within 1 business day.
- Access review: Security Lead exports IdP group memberships and prod-role memberships quarterly to a tracked artifact; engineering leads sign off; deltas drive remediation tickets.

## Evidence

- IdP audit log showing account lifecycle events.
- Quarterly access review artifact (spreadsheet or GRC export) with reviewer signatures.
- GitHub branch-protection settings and CODEOWNERS file.
- Hosting console IAM snapshot.

## Open Items For Human Sign-Off

Track identity and access decisions in [`../docs/security/SOC2-OPERATOR-CHECKLIST.md`](../docs/security/SOC2-OPERATOR-CHECKLIST.md) before patching this policy.

- Confirm IdP (Google vs Okta).
- Name the two roles authorized to grant admin tier.
