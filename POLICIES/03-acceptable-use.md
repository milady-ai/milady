# 03 — Acceptable Use Policy

**Owner:** People Ops
**Review cadence:** Annual
**SOC2 mapping:** CC1.1, CC6.1

## Purpose

Define acceptable use of Eliza-controlled systems, devices, and data by employees and contractors.

## Scope

All personnel with access to Eliza systems, company-issued devices, BYOD devices used for company work, customer data, and source code.

## Policy Statements

1. **Company-issued laptops** are managed by MDM (where in place). Full-disk encryption (FileVault / BitLocker) required. Screen lock ≤10 minutes.
2. **BYOD** is permitted for non-prod work only. Source code may be checked out on BYOD only with full-disk encryption enabled.
3. **No customer data on personal accounts or personal cloud storage.** Use sanctioned company storage only.
4. **No credentials in source code.** Use the secrets backend ([`12-cryptography.md`](12-cryptography.md)).
5. **No production access from public Wi-Fi without VPN.**
6. **Personal use** of company systems is permitted within reason; illegal or harassing use is grounds for discipline.
7. **AI assistants** (Claude, Codex, etc.) may be used for code work. The author is responsible for reviewing AI output before merging. Confidential customer data must not be pasted into third-party AI tools that retain prompts.
8. **Reporting** — suspected security incidents are reported to `security@elizaos.ai` immediately; no retaliation for good-faith reports.

## Procedures

- Acknowledgment signed during onboarding and at each annual renewal.
- Violations are routed to People Ops + Security Lead; disciplinary process per [`17-code-of-conduct.md`](17-code-of-conduct.md).

## Evidence

- Signed acknowledgments per employee per year.
- MDM enrollment report (if in use).
- Acceptable-use training completion records.

## Open Items For Human Sign-Off

- Confirm MDM tooling (or document decision to operate without).
- VPN provider.
