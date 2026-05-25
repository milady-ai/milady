# 10 — Data Classification & Handling Policy

**Owner:** Security Lead
**Review cadence:** Annual
**SOC2 mapping:** C1.1, CC6.7

## Purpose

Classify every category of data Eliza processes and define the handling controls per class.

## Scope

All data processed by Eliza Cloud, agent runtime, training pipeline, and clients.

## Classes

| Class | Description | Storage | In Transit | Audit |
|---|---|---|---|---|
| **Public** | Marketing, docs, OSS source code | Any | TLS optional | Standard CI logs |
| **Internal** | Aggregated, anonymized usage metrics; non-sensitive employee directory | Encrypted at rest | TLS 1.2+ | Standard logs |
| **Confidential** | Customer account metadata; agent memory; conversation content; training corpora not derived from customer data | KMS-encrypted at rest (AES-256-GCM via `@elizaos/security`) | TLS 1.2+ | Audit-event row per access |
| **Restricted** | KMS master keys; connector OAuth tokens; payment-method tokens; PII fields; signed-key private material; user passwords (only as bcrypt/argon2 hashes) | KMS-encrypted with strict AAD; never logged; never on disk in plaintext | TLS 1.3 preferred, mTLS service-to-service when feasible | Audit-event row per access + alert on anomalous volume |

## Data-Type Mapping

| Data type | Class |
|---|---|
| PII fields (name, email, phone, address) | Restricted |
| Customer connector OAuth tokens (Slack/GitHub/Notion/…) | Restricted |
| KMS master key material | Restricted |
| Payment-method tokens / Stripe refs | Restricted |
| User password hashes | Restricted |
| Cloud session JWTs | Confidential (short-lived) |
| Agent conversation/memory content | Confidential |
| Agent trajectories (when opt-in telemetry on) | Confidential |
| Training datasets (Eliza-curated, no customer data) | Confidential |
| App registry metadata | Internal |
| Billing line items | Confidential (PI1 integrity also applies) |
| Public homepage content | Public |

## Policy Statements

1. **Restricted data never leaves the KMS-encrypted envelope** in transit or at rest, except inside the security-package decrypt boundary.
2. **No Restricted data in logs, telemetry, or error reports.** OTel collector applies a redaction processor (see [`14-logging-monitoring.md`](14-logging-monitoring.md)).
3. **AAD is mandatory** for all envelope encryption — context-bound (user_id + key_namespace + field name) per the KMS contract.
4. **Customer training opt-in** — no Confidential customer data feeds model training unless the customer opts in. See [`23-ai-ml-model-governance.md`](23-ai-ml-model-governance.md).
5. **Data minimization** — collect only what is required to deliver the feature; document the basis per field in the privacy notice.

## Evidence

- DB schema with encrypted-field annotations.
- OTel collector config showing redaction rules.
- Audit-event sample for Restricted access.

## Open Items For Human Sign-Off

Track data-protection decisions in [`../docs/security/SOC2-OPERATOR-CHECKLIST.md`](../docs/security/SOC2-OPERATOR-CHECKLIST.md) before patching this policy.

- Confirm final field-level encryption coverage in `cloud-api` schema.
