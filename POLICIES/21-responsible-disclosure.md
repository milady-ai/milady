# 21 — Responsible Disclosure Policy

**Owner:** Security Lead
**Review cadence:** Annual
**SOC2 mapping:** CC2.2

## Purpose

Provide a clear, public channel for security researchers and customers to report vulnerabilities, and define our commitments in return.

## Scope

All Eliza-controlled assets: Eliza Cloud, published clients (desktop / mobile / web), first-party plugins, public packages, infrastructure exposing customer data.

## In Scope For Reports

- Authentication / authorization bypass.
- Data exposure (Restricted or Confidential class per [`10-data-classification.md`](10-data-classification.md)).
- Remote code execution.
- Cryptography misuse with material impact.
- Supply-chain attacks against our publishing pipeline.
- Plugin sandbox escape.

## Out of Scope

- Findings against unsupported or end-of-life versions.
- Social-engineering of staff.
- Physical attacks.
- DOS without sustained impact proof.
- Findings on third-party services (report to that vendor directly).
- Self-XSS without escalation path.

## Reporting

- Primary: `security@elizaos.ai`.
- PGP key fingerprint: `<TBD — to be published with this policy>`.
- `/.well-known/security.txt` published on the Cloud domain referencing this contact.

## Our Commitments

1. **Acknowledge** within 3 business days.
2. **Initial assessment** within 10 business days.
3. **Coordinated disclosure** — researchers may publish 90 days after first report, sooner if remediated.
4. **No legal action** for good-faith research within scope (safe-harbor).
5. **Credit** in release notes / hall of fame unless researcher opts out.

## Procedures

- Reports route to the Security Lead and on-call security responder.
- Triage uses the SLA classes in [`15-vulnerability-management.md`](15-vulnerability-management.md).

## Evidence

- `security.txt` content versioned in source.
- PGP key published.
- Disclosure-program metrics (reports / quarter, MTTR).

## Open Items For Human Sign-Off

Track public security contact decisions in [`../docs/security/SOC2-OPERATOR-CHECKLIST.md`](../docs/security/SOC2-OPERATOR-CHECKLIST.md) before patching this policy.

- Publish PGP key.
- Decide bug-bounty platform vs self-managed.
