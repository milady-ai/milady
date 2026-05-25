# 13 — Backup Policy

**Owner:** Engineering Lead
**Review cadence:** Annual; restore-test quarterly
**SOC2 mapping:** A1.2

## Purpose

Ensure recoverable, encrypted, off-site backups of all Cloud datastores.

## Scope

Eliza Cloud Postgres (or equivalent) datastore, object storage buckets containing customer artifacts, KMS metadata (not keys themselves — keys are managed by Steward separately).

## Policy Statements

1. **Frequency** — continuous WAL archiving (or provider-equivalent point-in-time recovery) for Postgres; daily snapshot for object storage buckets containing customer data.
2. **Retention** — 35 daily, 26 weekly, 12 monthly.
3. **Off-site** — backups stored in a region distinct from primary.
4. **Encrypted at rest** — provider-managed KMS or Eliza-managed envelope keys per [`12-cryptography.md`](12-cryptography.md).
5. **Quarterly restore test** — Security Lead runs an end-to-end restore to a non-prod environment and confirms application boots and a sample read returns expected data.
6. **Backup-job alerts** — failure to complete within the SLA window pages on-call.

## Procedures

- Backup configuration is infra-as-code; changes go through the SDLC policy.
- Restore-test report archived in the SOC2 evidence folder.

## Evidence

- Backup-job success metrics (Prometheus).
- Quarterly restore-test reports.
- Provider backup configuration export.

## Open Items For Human Sign-Off

Track backup and datastore decisions in [`../docs/security/SOC2-OPERATOR-CHECKLIST.md`](../docs/security/SOC2-OPERATOR-CHECKLIST.md) before patching this policy.

- Confirm primary + backup region.
- Confirm Postgres provider (managed RDS / Cloud SQL / Neon / self-host).
