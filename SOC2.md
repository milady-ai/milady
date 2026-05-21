# SOC2 — Eliza Stack

Top-level entry point for SOC2 Type II readiness work across the Eliza stack (Eliza Cloud, agent runtime, plugin system, clients, training pipeline, supporting infra).

## Status

**Phase:** scaffolding. Per-package audit findings and the master framework are in [`docs/security/audits/`](docs/security/audits/). Detailed multi-phase plan: [`docs/security/audits/PLAN.md`](docs/security/audits/PLAN.md).

## Trust Service Categories in scope

- **Security** — CC1–CC9 (baseline; required).
- **Availability** — A1 (required for Cloud, a paid managed service).
- **Confidentiality** — C1 (we hold customer connector tokens, conversation memory, training data).
- **Processing Integrity** — PI1 (required for Cloud monetization paths).
- **Privacy** — P1–P8 (decision pending; recommended).

## Where to start

1. **Auditors** — read [`docs/security/SOC2-CONTROL-MATRIX.md`](docs/security/SOC2-CONTROL-MATRIX.md). Every TSC maps to a policy + code location + evidence method.
2. **Engineers** — read the policy whose subject area you touch ([`POLICIES/`](POLICIES/)). For runtime KMS, also read [`eliza/packages/security/docs/SOC2.md`](eliza/packages/security/docs/SOC2.md).
3. **On-call responders** — keep [`docs/security/INCIDENT-RUNBOOK.md`](docs/security/INCIDENT-RUNBOOK.md) at hand.
4. **Security Lead** — quarterly drive list: access review (CC6), risk register (CC3), SDLC audit (CC8), key inventory (C1).

## Document map

```
SOC2.md                                       (this file)
SECURITY.md                                   responsible disclosure
POLICIES/                                     24 policies covering CC1-CC9 + A1 + C1 + PI1
  README.md                                   index
  01-information-security.md … 24-plugin-connector-trust.md
docs/security/
  README.md
  SOC2-CONTROL-MATRIX.md                      TSC → policy → code → evidence
  THREAT-MODEL.md                             Eliza-specific threats
  INCIDENT-RUNBOOK.md                         per-scenario playbooks
  KEY-LIFECYCLE.md                            per-class key lifecycle
  AUDIT-EVIDENCE-INVENTORY.md                 evidence index for auditors
  audits/                                     source audit reports (00-08 + plan)
deploy/observability/
  README.md
  otel-collector-config.yaml                  single funnel + redaction
  prometheus/prometheus.yml
  prometheus/alerts/security.yml              security alert rules
  loki/loki-config.yaml                       365d / 7y retention
  grafana/dashboards/security-overview.json
eliza/packages/security/docs/                 KMS package SOC2 surface
  README.md
  SOC2.md
eliza/docs/security/                          mirror of docs/security for the eliza repo
```

## Open human-in-loop items (must be filled before audit)

These are the placeholders that appear across the documentation and require an operator decision:

- Designate **Security Lead** / CISO function.
- Designate **DPO** (or formally assign to Security Lead).
- Confirm **IdP** (Google Workspace vs Okta).
- Confirm **hosting provider** + primary + backup region.
- Confirm **payment processor** and **observability vendor** identities.
- Choose **GRC tool** (Vanta / Drata / Secureframe / none).
- Publish **PGP key** for `security@elizalabs.ai` and update SECURITY.md fingerprint.
- Establish **on-call paging** tool (PagerDuty / Opsgenie).
- Publish public **status page**, **subprocessor URL**, **/.well-known/security.txt**.
- Engage **penetration test** vendor; pick **bug-bounty** platform decision.
- Confirm **Steward** production deployment topology.
- Approve **board / leadership security review** cadence (CC1.2).

## Phased plan (high level)

Detail in [`docs/security/audits/PLAN.md`](docs/security/audits/PLAN.md).

1. **Phase 0** — Foundation: GRC tool, master Info Sec, security@ inbox.
2. **Phase 1** — Critical technical gaps: secrets out of repo, MFA on prod, audit log, prod access tiering, branch protection.
3. **Phase 2** — Process & policy (this commit lands the policy library).
4. **Phase 3** — High technical gaps: plugin trust, connector-token KMS encryption, log retention ≥ 365d, DR test, signed releases.
5. **Phase 4** — Type I readiness (~week 14).
6. **Phase 5** — Type II observation window (months 4–10).
7. **Phase 6** — Type II audit fieldwork (months 10–12).
