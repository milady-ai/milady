# 05 — Change Management Policy

**Owner:** Engineering Lead
**Review cadence:** Annual
**SOC2 mapping:** CC8.1, CC3.4

## Purpose

Ensure every change to production code, infrastructure, or configuration is reviewed, traceable, and reversible.

## Scope

All production code (Cloud, agent runtime, mobile/desktop binaries shipped to customers), infrastructure-as-code, CI/CD configuration, plugin signing root, database schema migrations.

## Policy Statements

1. **All production changes are pull requests.** No direct commits to protected branches (`main`, `develop`, release branches).
2. **At least one human reviewer** approves before merge. CODEOWNERS enforces domain expertise.
3. **CI gates** required and passing before merge: typecheck, lint, unit tests, dependency audit, SBOM generation, secret scan.
4. **Migrations** — every schema migration is reversible or carries an explicit one-way risk note in the PR description.
5. **Customer-impacting changes** (auth, billing, encryption, plugin trust) require sign-off from the Security Lead.
6. **AI-authored PRs** are clearly attributed and reviewed by a human; no auto-merge of AI commits.
7. **Emergency changes** (hotfixes during incident) may bypass review with on-call lead approval; a post-incident PR backfills the review trail within 24 hours.
8. **Release tagging** is reproducible: every released binary or container is tagged with a git SHA and signed (Sigstore).

## Procedures

- Branch protection on `main` / `develop` / `release/*` requires PR + ≥1 approval + green CI.
- Quarterly CI-gate review: Security Lead spot-checks 5 random merged PRs for gate compliance.
- Schema-migration playbook in `docs/security/INCIDENT-RUNBOOK.md` for rollback.

## Evidence

- GitHub branch-protection settings (screenshot or API export).
- PR history with reviewer + CI-gate metadata.
- Signed release tags / container signatures.

## Open Items For Human Sign-Off

Track decisions in [`../docs/security/SOC2-OPERATOR-CHECKLIST.md`](../docs/security/SOC2-OPERATOR-CHECKLIST.md) before patching this policy.

- Confirm CODEOWNERS coverage.
- Define "customer-impacting" change list with the Security Lead.
