# Security Documentation Index

This directory contains the technical security documentation that supports the policy library in [`../../POLICIES/`](../../POLICIES/) and the SOC2 readiness work.

## Index

| File | Purpose |
|---|---|
| [`SOC2-CONTROL-MATRIX.md`](SOC2-CONTROL-MATRIX.md) | Maps every Trust Service Criterion to policy + code + evidence. |
| [`SOC2-OPERATOR-CHECKLIST.md`](SOC2-OPERATOR-CHECKLIST.md) | Canonical fill-in sheet for operator-owned SOC2 names, vendors, contact routes, and deployment values. |
| [`THREAT-MODEL.md`](THREAT-MODEL.md) | Eliza-specific threats (plugin compromise, sub-agent escape, model poisoning, KMS compromise, supply-chain, training-data leakage, connector-token theft). |
| [`INCIDENT-RUNBOOK.md`](INCIDENT-RUNBOOK.md) | Per-scenario playbooks (detection → triage → contain → eradicate → recover → lessons). |
| [`KEY-LIFECYCLE.md`](KEY-LIFECYCLE.md) | Per-class key lifecycle implementing the KMS contract. |
| [`AUDIT-EVIDENCE-INVENTORY.md`](AUDIT-EVIDENCE-INVENTORY.md) | What an auditor will request, who owns each artifact. |
| [`audits/`](audits/) | Source audit reports (per-package + framework + KMS contract + plan). |

## Related

- [`../../POLICIES/`](../../POLICIES/) — policy library.
- [`../../deploy/observability/`](../../deploy/observability/) — observability stack config.
- [`../../SOC2.md`](../../SOC2.md) — top-level entry document.
- [`../../SECURITY.md`](../../SECURITY.md) — responsible disclosure (when present).
