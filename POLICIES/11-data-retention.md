# 11 — Data Retention & Disposal Policy

**Owner:** Security Lead
**Review cadence:** Annual
**SOC2 mapping:** C1.2, CC6.5

## Purpose

Define how long each data class is retained and how it is securely disposed.

## Scope

All data stored by Eliza Cloud and any data shipped from clients to Cloud.

## Retention Schedule

| Data type | Hot retention | Cold archive | Hard delete |
|---|---|---|---|
| Audit events (security-relevant) | 90 days hot | Until 7 years | 7 years |
| Application logs (non-security) | 30 days hot | 365 days | 365 days |
| Metrics (Prometheus) | 15 days hot | 90 days downsampled | 90 days |
| Traces | 7 days | n/a | 7 days |
| Customer conversation/memory | Lifetime of account + 30 days post-deletion | n/a | 30 days post-deletion |
| Connector OAuth tokens | Lifetime of grant; revoked tokens deleted within 24h | n/a | 24h post-revocation |
| Billing records | 7 years (regulatory) | 7 years | 7 years |
| Backups | 35 daily / 26 weekly / 12 monthly | n/a | per rotation |
| Training datasets | Lifetime of project + 1 year | n/a | per project plan |

## Policy Statements

1. **Customer-initiated deletion** (DSR — see [`22-data-subject-request.md`](22-data-subject-request.md)) — confirmed within 30 days, including derived caches and search indices.
2. **Hard-delete is a tombstoning operation** for KMS-encrypted data: the data-encryption-key is destroyed, rendering the ciphertext unrecoverable. The KMS audit log records the destruction.
3. **Backups** retain encrypted ciphertext; once the DEK is destroyed, restored data is also unrecoverable.
4. **No retention beyond business need.** Engineering may not extend retention without Security Lead approval and a documented basis.

## Procedures

- Retention is enforced via scheduled jobs in Cloud that run nightly. Job success is exported as a metric and alerted on failure.
- Disposal records (DEK-destroy events) are written to `audit_events` and retained 7 years.

## Evidence

- Retention-job metrics with success history.
- DEK-destroy audit events sample.
- DSR fulfillment records.

## Open Items For Human Sign-Off

Track retention decisions in [`../docs/security/SOC2-OPERATOR-CHECKLIST.md`](../docs/security/SOC2-OPERATOR-CHECKLIST.md) before patching this policy.

- Validate billing-record regulatory retention with Finance / counsel.
