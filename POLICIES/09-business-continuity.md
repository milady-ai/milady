# 09 — Business Continuity & Disaster Recovery Policy

**Owner:** Engineering Lead + Security Lead
**Review cadence:** Annual; DR test annually
**SOC2 mapping:** CC9.1, A1.1, A1.2, A1.3

## Purpose

Ensure Eliza Cloud can recover from infrastructure failure, region loss, or destructive incident within defined RTO/RPO targets.

## Scope

Eliza Cloud services (API, auth, billing, app registry, container deploys). Local-only customer deployments are explicitly out of scope — customers are responsible for their own continuity in that mode.

## Targets

| Service | RTO | RPO |
|---|---|---|
| Cloud API auth | 1 hour | 5 minutes |
| Billing / monetization records | 4 hours | 0 (must not lose) |
| App registry / metadata | 4 hours | 15 minutes |
| Observability stack | 24 hours | 1 hour |

## Policy Statements

1. **Backups** are taken per [`13-backup.md`](13-backup.md) and stored in a region distinct from primary.
2. **Multi-AZ** deployment is required for SEV-0-eligible services (API, auth, billing).
3. **Multi-region failover** is a stated medium-confidence goal; not required for initial Type II window but tracked as a risk.
4. **Annual DR test** — Security Lead schedules a restore-from-backup exercise against a non-production environment; results documented.
5. **Capacity planning** — monthly review of utilization vs forecast; alerts fire at 70%/85%/95% of provisioned capacity.

## Procedures

- DR test: restore the most recent backup of each in-scope datastore to a parallel environment; validate integrity by replaying a sample workload.
- Failure scenarios documented in [`../docs/security/INCIDENT-RUNBOOK.md`](../docs/security/INCIDENT-RUNBOOK.md).

## Evidence

- DR test report (annual).
- Backup-job success metrics from observability.
- Capacity planning notes (monthly).

## Open Items For Human Sign-Off

Track continuity and region decisions in [`../docs/security/SOC2-OPERATOR-CHECKLIST.md`](../docs/security/SOC2-OPERATOR-CHECKLIST.md) before patching this policy.

- Confirm hosting topology (single-region vs multi-region).
- Backup region selection.
