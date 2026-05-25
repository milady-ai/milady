# 07 — Risk Assessment Policy

**Owner:** Security Lead
**Review cadence:** Annual full reassessment; quarterly delta review
**SOC2 mapping:** CC3.1–CC3.4

## Purpose

Maintain a living risk register that drives security investment and prioritization.

## Scope

All risks affecting Eliza-controlled systems, customer data, business continuity, and brand. Includes Eliza-specific risks (plugin trust, AI/ML supply chain, sub-agent escape) alongside standard SaaS risks.

## Policy Statements

1. **Risk register** maintained in the GRC tool (or `docs/security/risk-register.md` absent one). Each entry: title, description, likelihood, impact, owner, mitigation, residual rating.
2. **Annual full reassessment** — every entry is re-rated; new entries are added; closed risks are archived.
3. **Quarterly delta** — Security Lead reviews entries touched since last quarter and confirms ratings.
4. **Material change trigger** — major architecture changes, new vendor categories, new customer segments, new regulatory exposure all trigger a delta review.
5. **Fraud risk** (CC3.2) — billing, inference markup, and redemption flows have dedicated entries reviewed by Finance + Security Lead.

## Standing Risk Themes (Eliza-specific)

- Plugin compromise via npm supply chain or malicious manifest.
- Sub-agent escape from PTY/workspace sandbox.
- Model poisoning via training-data pipeline.
- KMS / Steward master-key compromise.
- HuggingFace artifact tampering.
- Connector OAuth token theft.
- AI-authored code introducing logic bugs in security-critical paths.
- Cloud monetization arithmetic errors (PI1).

## Procedures

- New risk: anyone files via PR or GRC tool entry; Security Lead triages within 5 business days.
- Quarterly review opens a tracking issue with a due date.

## Evidence

- Risk register snapshot per quarter.
- Review minutes / signed-off review records.

## Open Items For Human Sign-Off

Track the selected evidence system in [`../docs/security/SOC2-OPERATOR-CHECKLIST.md`](../docs/security/SOC2-OPERATOR-CHECKLIST.md) before patching this policy.

- Confirm GRC tool (Vanta / Drata / Secureframe / none).
