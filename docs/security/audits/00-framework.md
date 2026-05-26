# SOC2 Type II Framework — Eliza Stack

This document is the scaffolding the per-package audit findings will be merged into. It is the auditor-facing structure: what SOC2 requires, what evidence is collected, what controls must exist. Findings from `/tmp/soc2-audit/01..08-*.md` will be mapped into the gap columns.

---

## 1. Audit Scope

**System under audit:** Eliza stack
- **Eliza Cloud** (managed backend) — auth, hosted APIs, app registration, billing, monetization, container deploys, domains.
- **elizaOS** (agent runtime + plugin system + connectors + skills).
- **Eliza app** (desktop via Electrobun, web dashboard, CLI, iOS/Android shims).
- **Training pipeline** (chip + training + DSPy optimization, model artifact distribution).
- **Supporting infra** (CI/CD, source control, package publishing, deploy pipeline).

**Type II window target:** suggested 6-month minimum continuous-operation window after controls are in place. Recommend Type I report first (point-in-time, design only) ~60 days after remediation, then Type II observation window starts.

**Trust Service Categories in scope:**
- **Security (Common Criteria CC1–CC9)** — REQUIRED, baseline.
- **Availability (A1)** — REQUIRED for Cloud (it's a paid managed service).
- **Confidentiality (C1)** — REQUIRED (we hold customer connector tokens, conversation memory, training data).
- **Processing Integrity (PI1)** — REQUIRED for Cloud monetization paths (billing math, inference markup, redemption).
- **Privacy (P1–P8)** — RECOMMENDED if we process consumer PII subject to GDPR/CCPA. Decision needed: include or rely on separate ISO 27701 / GDPR posture.

---

## 2. Trust Service Criteria → Eliza Control Mapping

### CC1 — Control Environment
| Criterion | Required Control | Owner | Evidence |
|---|---|---|---|
| CC1.1 | Code of conduct, ethics policy, integrity attestation. | People Ops | Signed acknowledgments in HR system. |
| CC1.2 | Board / governance oversight of security. | Leadership | Quarterly security review minutes. |
| CC1.3 | Org chart, roles & responsibilities. | People Ops | Org chart, JDs. |
| CC1.4 | Hiring screening (background checks for prod access). | People Ops | Background check records. |
| CC1.5 | Disciplinary process for policy violation. | People Ops | Policy doc + incident records. |

### CC2 — Communication & Information
| Criterion | Required Control |
|---|---|
| CC2.1 | Internal communication of security policies. (All-hands, onboarding, ongoing training cadence.) |
| CC2.2 | External communication channel for customers/users to report security issues. (security@ inbox, security.txt, responsible disclosure policy.) |
| CC2.3 | External communication of system commitments (DPA, ToS, SLA, security page). |

### CC3 — Risk Assessment
| Criterion | Required Control |
|---|---|
| CC3.1 | Risk register maintained; reviewed annually + on major change. |
| CC3.2 | Fraud risk assessment (esp. for Cloud monetization & redemption flows). |
| CC3.3 | Vendor risk assessment (Anthropic, OpenAI, HuggingFace, Nebius, npm, GitHub, payment processor, hosting provider). |
| CC3.4 | Change-impact risk assessment for material releases. |

### CC4 — Monitoring Activities
| Criterion | Required Control |
|---|---|
| CC4.1 | Continuous monitoring of controls (compliance dashboard / GRC tool — Vanta/Drata/Secureframe). |
| CC4.2 | Internal audit / control testing cadence. |

### CC5 — Control Activities
| Criterion | Required Control |
|---|---|
| CC5.1 | Selection & development of controls (this document). |
| CC5.2 | Technology controls (firewalls, IAM, encryption, MFA). |
| CC5.3 | Policy & procedure documents — see §5. |

### CC6 — Logical & Physical Access
| Criterion | Required Control |
|---|---|
| CC6.1 | Identity & access management. SSO for employees (Google/Okta). MFA enforced. JIT or quarterly access review. |
| CC6.2 | New-user provisioning workflow, owner-approved. |
| CC6.3 | Role-based access; least privilege; production access tiering. |
| CC6.4 | Physical access (data centers handled by AWS/GCP/Fly/etc. via subservice SOC2 reports). |
| CC6.5 | Secure media disposal (laptop wipe-on-offboard; cloud DB & backup encryption-at-rest deletion procedure). |
| CC6.6 | Network boundary protection (firewalls, security groups, private subnets, no public DB). |
| CC6.7 | Encryption in transit (TLS ≥1.2 everywhere; mTLS service-to-service where feasible). |
| CC6.8 | Anti-malware / integrity (endpoint protection on employee laptops; image scanning in CI). |

### CC7 — System Operations
| Criterion | Required Control |
|---|---|
| CC7.1 | Vulnerability scanning, infra monitoring, log aggregation, SIEM. |
| CC7.2 | Anomaly detection on auth, billing, admin actions. |
| CC7.3 | Security incident evaluation procedure (severity classification, IRT). |
| CC7.4 | Incident response plan (runbook), tabletop tested annually. |
| CC7.5 | Recovery / DR plan with tested RTO/RPO. |

### CC8 — Change Management
| Criterion | Required Control |
|---|---|
| CC8.1 | Documented SDLC: PR + code review required, branch protection, CI gates, change approval, segregation of dev/staging/prod. |

### CC9 — Risk Mitigation
| Criterion | Required Control |
|---|---|
| CC9.1 | Business continuity / disaster recovery. |
| CC9.2 | Vendor management lifecycle (intake, DPA, SOC2 review, offboarding). |

### A1 — Availability
| Criterion | Required Control |
|---|---|
| A1.1 | Capacity planning. |
| A1.2 | Backups taken, encrypted, off-site, restore-tested quarterly. |
| A1.3 | DR plan with documented RTO/RPO; tested. |

### C1 — Confidentiality
| Criterion | Required Control |
|---|---|
| C1.1 | Encryption-at-rest for confidential data (KMS-managed keys, rotation). |
| C1.2 | Secure disposal of confidential data on customer request and at retention end. |

### PI1 — Processing Integrity
| Criterion | Required Control |
|---|---|
| PI1.1 | Inputs validated. |
| PI1.2 | Processing complete, accurate, timely (esp. billing, inference markup, payout). |
| PI1.3 | Output reviewed. |
| PI1.4 | Inputs stored with integrity. |
| PI1.5 | Outputs delivered correctly. |

---

## 3. Required Written Policies (auditor will request all of these)

| # | Policy | Status | Owner |
|---|---|---|---|
| 1 | Information Security Policy (master) | TODO | CISO/eng lead |
| 2 | Access Control Policy | TODO | |
| 3 | Acceptable Use Policy | TODO | |
| 4 | Asset Management Policy | TODO | |
| 5 | Change Management Policy | TODO | |
| 6 | Vendor Management Policy | TODO | |
| 7 | Risk Assessment Policy | TODO | |
| 8 | Incident Response Plan & Runbook | TODO | |
| 9 | Business Continuity / Disaster Recovery Plan | TODO | |
| 10 | Data Classification & Handling Policy | TODO | |
| 11 | Data Retention & Disposal Policy | TODO | |
| 12 | Cryptography Policy (algorithms, key mgmt, rotation) | TODO | |
| 13 | Backup Policy | TODO | |
| 14 | Logging & Monitoring Policy | TODO | |
| 15 | Vulnerability Management Policy | TODO | |
| 16 | Secure Development (SDLC) Policy | TODO | |
| 17 | Code of Conduct / Ethics | TODO | |
| 18 | Employee Onboarding/Offboarding Procedure | TODO | |
| 19 | Privacy Policy (public) | exists? verify | |
| 20 | Terms of Service / DPA / Subprocessor list | partial | |
| 21 | Responsible Disclosure / `security.txt` | TODO | |
| 22 | Customer Data Subject Request (DSR) Procedure | TODO | |
| 23 | AI/ML Model Governance Policy (training data consent, model integrity) | TODO — Eliza-specific | |
| 24 | Plugin & Connector Trust Policy (third-party code in user's runtime) | TODO — Eliza-specific | |

---

## 4. Required Technical Controls Inventory (will be filled in from sub-agent reports)

Sections will be populated from `/tmp/soc2-audit/0[1-8]-*.md`:

- 4.1 **Cloud API & auth** — from report 01
- 4.2 **Cloud infra & deployment** — from report 02
- 4.3 **Data, DB, encryption, PII** — from report 03
- 4.4 **Logging, monitoring, audit trail** — from report 04
- 4.5 **Desktop & mobile clients** — from report 05
- 4.6 **Agent runtime & plugin sandbox** — from report 06
- 4.7 **Training, models, chip** — from report 07
- 4.8 **SDLC, CI/CD, supply chain** — from report 08

Each section will contain: existing controls (kept), critical gaps (P0), high (P1), medium (P2), concrete remediation tasks with file paths.

---

## 5. Evidence Collection Plan

For each control, auditors need: (a) policy doc, (b) configuration/screenshot, (c) sample of operating effectiveness over the audit window.

Recommended GRC tooling: **Vanta**, **Drata**, or **Secureframe** — they automate evidence collection from AWS/GCP/GitHub/Okta/etc. Without one, evidence assembly is ~5x the work.

---

## 6. Subservice Organizations (carved-out)

We rely on these — their SOC2 reports cover their portion. Maintain a tracker:

| Provider | Service | SOC2 Report on File? | Subprocessor in DPA? |
|---|---|---|---|
| AWS / GCP / hosting provider | infra | required | yes |
| Anthropic | LLM API | obtain | yes |
| OpenAI | LLM API | obtain | yes |
| HuggingFace | model registry | review terms | yes |
| Nebius | GPU training | obtain | yes |
| Stripe / payment processor | billing | yes (PCI + SOC2) | yes |
| GitHub | source control | yes | n/a (internal) |
| Sentry / Datadog / log aggregator | observability | obtain | yes |

---

## 7. Eliza-specific SOC2 Risk Themes (preliminary, before sub-agent findings)

These are the non-standard risks that make Eliza's SOC2 harder than a typical SaaS:

1. **Hybrid local + cloud architecture.** Customer data lives on user devices AND in Cloud. Audit boundary must distinguish what we control (Cloud) from what runs locally on user hardware. Document the local-mode out-of-scope boundary carefully — but anything that ships back to Cloud (telemetry, trajectories, training feed) IS in scope.
2. **User-installed third-party plugins.** Customer agents execute arbitrary plugin code. We need a plugin trust model, signature/manifest verification, sandboxing, and a clear customer-responsibility line. CC6.8 (integrity) and CC8.1 (change) implications.
3. **PTY-spawned sub-coding-agents** (`coding-agent` skill). These get write access to a workspace and FS. Capture model + telemetry of every spawn for audit.
4. **AI-generated code in production codebase.** AGENTS.md itself acknowledges this. Need explicit policy: AI-authored PRs reviewed by human before merge; provenance metadata on commits if feasible.
5. **Training on customer data.** If any user conversation/connector data feeds training (eliza-1 etc.), need explicit opt-in consent, DPA carve-out, and documented data lineage. Otherwise EXPLICITLY exclude (recommended baseline: zero customer data in model training).
6. **Connector OAuth tokens for ~30+ external services** (Slack, GH, Notion, Discord, Apple Notes, etc.). Each is confidential credential storage — KMS-encrypted, scoped, revocable, auditable.
7. **Cloud monetization paths** (inference markup, redemption). PI1 territory — billing math must be deterministic, auditable, reversible-with-trail.
8. **Crypto/blockchain elements** (vault, redemption flows) — confirm whether any blockchain settlement is in scope; if so, key custody is a major SOC2 control surface.
9. **Mobile + desktop clients distributed via app stores** — auto-update integrity, code signing, supply-chain attack surface.
10. **Open-source upstream `eliza/` repo** as a dependency we patch via `patches/`. Provenance of our patched build vs upstream needs a controlled release process.

---

## 8. Suggested Phased Roadmap (high-level — detailed plan in §9 once findings land)

- **Phase 0 — Foundation (weeks 0–2):** Pick GRC tool, draft master Info Sec Policy, designate CISO/Security Lead, security@ inbox + responsible disclosure.
- **Phase 1 — Critical technical gaps (weeks 2–6):** P0 items from all reports — secrets out of repo, MFA on prod, encryption-at-rest verified, audit log, prod access tiering, branch protection.
- **Phase 2 — Process & policy (weeks 4–8):** Write all 24 policies; first-run/offboarding workflow; vendor inventory; risk register; incident runbook + tabletop.
- **Phase 3 — High technical gaps (weeks 6–12):** P1 items — plugin trust model, connector token KMS encryption, log retention ≥365d, DR test, dependency scanning, signed releases.
- **Phase 4 — Type I readiness check (week ~14):** External auditor engages, point-in-time assessment, design of controls.
- **Phase 5 — Type II observation window (months 4–10):** Continuous control operation; quarterly access reviews; monthly vuln scans; tabletop incident drill.
- **Phase 6 — Type II audit fieldwork (month 10–12):** Auditor samples evidence across the window; report issued.

Detailed remediation tasks per phase in §9 (pending sub-agent reports).

---

## 9. Detailed Remediation Plan

*To be populated once `/tmp/soc2-audit/0[1-8]-*.md` reports are available. Will be organized as: per-package task list → cross-cutting consolidated task list → critical path → sequencing dependencies.*

