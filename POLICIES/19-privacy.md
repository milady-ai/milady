# 19 — Privacy Policy (Internal)

**Owner:** Security Lead + Legal
**Review cadence:** Annual; on material change
**SOC2 mapping:** P1–P8 (if Privacy TSC included)

## Purpose

Operationalize Eliza's public privacy commitments inside the organization. This is the internal operating policy; the customer-facing privacy notice is the public version and must remain consistent with this document.

## Scope

All processing of personal data by Eliza Cloud and any data shipped to Cloud by clients.

## Principles

1. **Lawful basis** — every personal-data field has a documented basis: contract performance, legitimate interest (limited), or explicit consent. No "implied" consent for sensitive categories.
2. **Data minimization** — collect only what is needed for the feature; document the basis per field.
3. **Purpose limitation** — data collected for purpose A is not repurposed for B without renewed consent or compatible basis.
4. **Storage limitation** — retention per [`11-data-retention.md`](11-data-retention.md).
5. **Accuracy** — users can correct profile fields via account settings.
6. **Security** — confidentiality per [`10-data-classification.md`](10-data-classification.md) and [`12-cryptography.md`](12-cryptography.md).
7. **Accountability** — Security Lead is the DPO function unless a named DPO is appointed.

## Subject Rights

Implemented via [`22-data-subject-request.md`](22-data-subject-request.md): access, rectification, erasure, portability, restriction, objection, withdraw consent.

## Cross-border Transfers

Where Eliza Cloud serves users outside the hosting region, standard contractual clauses (SCCs) or equivalent are in the subprocessor DPAs. Subprocessor list at [`20-terms-dpa-subprocessors.md`](20-terms-dpa-subprocessors.md).

## Children

Eliza Cloud is not directed at users under 16. Accounts known to be under that age are terminated.

## Evidence

- Customer-facing privacy notice URL.
- DPO designation (or Security Lead acting as DPO).
- Cross-border transfer mechanism per subprocessor.

## Open Items For Human Sign-Off

- Final privacy notice URL.
- Named DPO (or designate Security Lead).
- Decide whether to include Privacy TSC in SOC2 scope or rely on separate posture.
