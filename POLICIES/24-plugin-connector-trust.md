# 24 — Plugin & Connector Trust Policy

**Owner:** Security Lead + Engineering Lead (agent runtime)
**Review cadence:** Annual; per-plugin review on first-party publish
**SOC2 mapping:** Eliza-specific (maps to CC6.8, CC8.1)

## Purpose

Define the trust model for third-party and first-party plugins that execute inside an Eliza agent runtime, and the connectors (OAuth-bearing integrations) they expose.

## Scope

- Plugins distributed via the Eliza plugin registry (`@elizaos/plugin-*`, `@elizaos-plugins/*`).
- Customer-installed plugins from third-party authors.
- Connectors (Slack, GitHub, Notion, Apple Notes, Discord, etc.) and their OAuth-token storage.

## Trust Tiers

| Tier | Description | Customer-visible label |
|---|---|---|
| **First-party** | Authored and signed by Eliza; in CI; reviewed per SDLC policy | "Verified" |
| **Partner** | External author with signed publisher key and Eliza review | "Partner" |
| **Community** | Open registry entry, automated checks only | "Community" |
| **Local** | User-loaded from disk; no signing required | "Local — at your risk" |

## Policy Statements

### Plugin packaging

1. **Signed manifest required** for First-party and Partner tiers. Manifest declares: name, version, permissions, capability schema, SBOM hash. Signed via Sigstore Cosign or in-house Ed25519 publisher key.
2. **Permission model** — plugins declare required permissions (network domains, filesystem paths, child processes, OS APIs). Runtime enforces declared scope; unrequested access fails-closed.
3. **Sandboxed worker** — plugin code runs in an isolated worker process with the declared permission set; cannot read other plugins' state or KMS-protected material.
4. **Customer-responsibility line** — local-tier and community-tier plugins run on the customer's machine. Eliza Cloud is not responsible for their behavior; this is stated in the install dialog.

### Connector OAuth tokens

5. **Storage** — connector tokens are Restricted-class (see [`10-data-classification.md`](10-data-classification.md)). Stored KMS-encrypted with AAD `connector_id|user_id|grant_id`.
6. **Scope minimization** — request the narrowest OAuth scope that satisfies the feature.
7. **User-revocable** — every connector grant is visible in the user's settings with a revoke button. Revoke triggers immediate token destruction (DEK destroy) and provider-side revocation when supported.
8. **Audit-event row** per token issuance, refresh, use, and revocation. (See [`14-logging-monitoring.md`](14-logging-monitoring.md).)

### Revocation

9. **Plugin revocation** — Eliza maintains a published revocation list (signed). Runtime checks on install and periodically. Revoked plugins refuse to load.
10. **Connector emergency revoke** — Security Lead can broadcast a connector-class revoke (e.g., suspected provider breach) that invalidates all grants for that connector.

### First-party / Partner review

11. New First-party / Partner plugin requires Security Lead sign-off: source review, permission rationale, threat-model fit, dependency audit.
12. Annual re-review for First-party / Partner plugins.

## Procedures

- Publishing pipeline (first-party): CI produces signed manifest + SBOM + Cosign signature; registry rejects unsigned uploads.
- Revocation: PR to the revocation list repo with reasoning; auto-published.

## Evidence

- Manifest signatures verifiable on a sample of published plugins.
- Permission-grant audit events.
- Connector token-storage AAD scheme in source.
- Revocation list history.

## Open Items For Human Sign-Off

Track plugin-trust decisions in [`../docs/security/SOC2-OPERATOR-CHECKLIST.md`](../docs/security/SOC2-OPERATOR-CHECKLIST.md) before patching this policy.

- Sigstore vs in-house Ed25519 publisher key.
- Customer install-dialog copy for "Local — at your risk".
