# Eliza Policy Library

This directory is the canonical written-policy library for the Eliza stack. Each numbered file is a single policy mapped to one or more SOC2 Trust Service Criteria (CC1–CC9, A1, C1, PI1). Auditors consume this directory as-is.

## How to use

- **Engineers:** read the policy whose subject area you touch before changing controls (encryption, logging, plugin trust, etc.). If a code change conflicts with a policy, the policy is updated *first* via PR, then the code.
- **People Ops / Leadership:** review on the cadence stated in each policy. Annual at minimum, plus on material change.
- **Auditors:** every policy has an explicit `Evidence` section listing what we will produce.

## Index

| # | Policy | Primary TSC |
|---|---|---|
| [01](01-information-security.md) | Information Security (master) | CC1–CC9 |
| [02](02-access-control.md) | Access Control | CC6 |
| [03](03-acceptable-use.md) | Acceptable Use | CC1, CC6 |
| [04](04-asset-management.md) | Asset Management | CC6, CC9 |
| [05](05-change-management.md) | Change Management | CC8 |
| [06](06-vendor-management.md) | Vendor Management | CC9 |
| [07](07-risk-assessment.md) | Risk Assessment | CC3 |
| [08](08-incident-response.md) | Incident Response | CC7 |
| [09](09-business-continuity.md) | Business Continuity / DR | CC9, A1 |
| [10](10-data-classification.md) | Data Classification & Handling | C1 |
| [11](11-data-retention.md) | Data Retention & Disposal | C1, CC6.5 |
| [12](12-cryptography.md) | Cryptography & Key Management | C1, CC6.7 |
| [13](13-backup.md) | Backup | A1.2 |
| [14](14-logging-monitoring.md) | Logging & Monitoring | CC7 |
| [15](15-vulnerability-management.md) | Vulnerability Management | CC7.1 |
| [16](16-secure-development.md) | Secure Development (SDLC) | CC8.1 |
| [17](17-code-of-conduct.md) | Code of Conduct / Ethics | CC1.1 |
| [18](18-onboarding-offboarding.md) | Onboarding / Offboarding | CC1, CC6 |
| [19](19-privacy.md) | Privacy | P1–P8 |
| [20](20-terms-dpa-subprocessors.md) | Terms / DPA / Subprocessors | CC2.3 |
| [21](21-responsible-disclosure.md) | Responsible Disclosure | CC2.2 |
| [22](22-data-subject-request.md) | Data Subject Request (DSR) | P5 |
| [23](23-ai-ml-model-governance.md) | AI/ML Model Governance | Eliza-specific |
| [24](24-plugin-connector-trust.md) | Plugin & Connector Trust | Eliza-specific |

## Policy template

Every policy follows the same structure:

1. **Purpose** — why the policy exists.
2. **Scope** — what systems, data, people it applies to.
3. **Roles & Responsibilities** — named roles (not individuals).
4. **Policy Statements** — the actual rules.
5. **Procedures** — how the rules are operationalized.
6. **Evidence** — what an auditor will see.
7. **Review Cadence** — annual unless stated otherwise.
8. **Owner** — accountable role.

## Cross-references

- SOC2 control matrix: [`../docs/security/SOC2-CONTROL-MATRIX.md`](../docs/security/SOC2-CONTROL-MATRIX.md)
- Threat model: [`../docs/security/THREAT-MODEL.md`](../docs/security/THREAT-MODEL.md)
- Incident runbook: [`../docs/security/INCIDENT-RUNBOOK.md`](../docs/security/INCIDENT-RUNBOOK.md)
- KMS contract: [`../docs/security/audits/KMS-CONTRACT.md`](../docs/security/audits/KMS-CONTRACT.md)
- Top-level entry: [`../SOC2.md`](../SOC2.md)
