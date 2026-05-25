# 06 — Vendor Management Policy

**Owner:** Security Lead
**Review cadence:** Annual per vendor; on intake
**SOC2 mapping:** CC3.3, CC9.2

## Purpose

Manage third-party providers ("subprocessors") that process Eliza customer data or operate Eliza-critical infrastructure.

## Scope

All paid and free third-party services that touch customer data, source code, build outputs, or runtime infrastructure.

## Roles & Responsibilities

- **Security Lead** — approves vendor intake; maintains the subprocessor register.
- **Procurement / Finance** — keeps contracts and DPAs on file.
- **Engineering Lead** — proposes new vendors and documents data flow.

## Policy Statements

1. **Vendor intake** — before any new vendor receives customer data or production access, Security Lead reviews: SOC2 report (or equivalent), DPA, security posture, data residency, breach-notification clause.
2. **Subprocessor list** — published at the URL referenced in [`20-terms-dpa-subprocessors.md`](20-terms-dpa-subprocessors.md). Customers are notified of changes per the DPA notice window.
3. **Annual review** — each vendor's SOC2 / equivalent is re-validated annually. Lapses are tracked as risk-register items.
4. **Offboarding** — when a vendor is terminated, Security Lead confirms data deletion and revokes integrations within 30 days.

## Vendor Categories (current known set)

| Vendor | Category | SOC2 / Equivalent Required |
|---|---|---|
| AWS / GCP / hosting provider | Infrastructure | Yes |
| Anthropic | LLM API | Yes |
| OpenAI | LLM API | Yes |
| HuggingFace | Model registry | Terms review |
| Nebius | GPU training | Yes |
| Stripe (or payment processor) | Billing | Yes (PCI + SOC2) |
| GitHub | Source control | Yes |
| Sigstore / Fulcio / Rekor | Code signing | Public-good infra |
| Sentry / Loki / Grafana (self-host or SaaS) | Observability | Yes if SaaS |

## Procedures

- Vendor intake checklist tracked in the GRC tool (or spreadsheet absent one).
- Annual review: Security Lead opens a tracking issue per vendor in Q1.

## Evidence

- Vendor register with intake date, last-review date, SOC2 expiration.
- Signed DPAs.
- Published subprocessor list (URL).

## Open Items For Human Sign-Off

Track vendor decisions in [`../docs/security/SOC2-OPERATOR-CHECKLIST.md`](../docs/security/SOC2-OPERATOR-CHECKLIST.md) before patching this policy.

- Confirm hosting provider, payment processor, observability stack vendors.
