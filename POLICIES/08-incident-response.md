# 08 — Incident Response Policy

**Owner:** Security Lead
**Review cadence:** Annual; tabletop exercise annually
**SOC2 mapping:** CC7.3, CC7.4

## Purpose

Define how Eliza detects, triages, contains, eradicates, recovers from, and learns from security incidents.

## Scope

All confirmed or suspected events that compromise confidentiality, integrity, or availability of Eliza-controlled systems or customer data.

## Severity Classes

| Sev | Description | Examples | Target Response |
|---|---|---|---|
| **SEV-0** | Active compromise of customer data or production keys | KMS master-key exposure; auth bypass in wild | Pager + incident channel within 15 min |
| **SEV-1** | High-impact outage or imminent compromise | Cloud API down; suspected token theft | Within 30 min |
| **SEV-2** | Degraded service or contained internal exposure | Single-region failure; one employee laptop loss | Within 4 hours |
| **SEV-3** | Suspicious but unconfirmed | Anomalous failed-auth spike | Within 1 business day |

## Policy Statements

1. **On-call rotation** — at least one engineer is on-call 24/7 with paging via PagerDuty / Opsgenie / equivalent.
2. **Incident commander (IC)** is designated at incident open. IC owns the timeline.
3. **Communication channels** — `#incident-active` chat channel; status page updated for customer-impacting issues within 1 hour of SEV-0/1 confirmation.
4. **Breach notification** — Security Lead notifies affected customers and regulators per DPA and applicable law (GDPR 72h, US state laws).
5. **Evidence preservation** — system images, logs, and KMS audit trails are preserved before remediation when feasible.
6. **Post-incident review** — within 5 business days; blameless; produces remediation tickets; updates the risk register.
7. **Annual tabletop** — Security Lead runs a tabletop exercise simulating a SEV-0 (e.g., master-key exposure).

## Procedures

See [`../docs/security/INCIDENT-RUNBOOK.md`](../docs/security/INCIDENT-RUNBOOK.md) for step-by-step detection → triage → contain → eradicate → recover → review playbooks per incident type.

## Evidence

- Pager / on-call schedule.
- Incident log (per-incident write-up).
- Tabletop exercise records.
- Post-incident review documents with action items.

## Open Items For Human Sign-Off

Track incident-response decisions in [`../docs/security/SOC2-OPERATOR-CHECKLIST.md`](../docs/security/SOC2-OPERATOR-CHECKLIST.md) before patching this policy.

- On-call paging tool.
- Status page URL.
- Customer notification template approval.
