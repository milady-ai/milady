# 16 — Secure Development (SDLC) Policy

**Owner:** Engineering Lead
**Review cadence:** Annual
**SOC2 mapping:** CC8.1

## Purpose

Define the gates and practices that every code change goes through, from authorship to production.

## Scope

All production code: Cloud, agent runtime, plugins shipped first-party, client apps (desktop, mobile, web), training pipeline, infra-as-code.

## Gates

Every PR to a protected branch must pass:

1. **Branch protection** — no direct push; PR + ≥1 reviewer required.
2. **Typecheck + lint + unit tests** green.
3. **Dependency audit** — no new High/Critical without waiver.
4. **Secret scan** — Gitleaks / GitHub secret-scanning pass.
5. **Code scan** — CodeQL / Semgrep pass.
6. **SBOM** generated for released artifacts.
7. **CODEOWNERS** — domain owner reviews changes to security-critical paths (`@elizaos/security`, auth, billing, KMS, plugin trust).

## Policy Statements

1. **No secrets in source.** Pre-commit hook + CI gate.
2. **Pinned dependencies** — lockfile committed; no floating tags in container base images.
3. **AI-authored code is reviewed by a human** before merge. AI provenance noted in commit trailer when practical (e.g., `Co-Authored-By: Claude ...`).
4. **Security-critical paths** require Security Lead review: anything touching `@elizaos/security`, the audit-event sink, billing math, KMS, plugin signing.
5. **Reproducible builds** — every release is buildable from a tagged commit. Container images signed via Sigstore Cosign.
6. **Patches to upstream `eliza/`** are tracked under `patches/` and reviewed before incorporation.
7. **Test data** — no real customer data in tests or fixtures. Synthetic data only.
8. **Plugin first-party publishing** follows the signed-manifest workflow in [`24-plugin-connector-trust.md`](24-plugin-connector-trust.md).

## Procedures

- Quarterly SDLC audit: Security Lead samples 10 merged PRs across packages; deviations get remediation tickets.
- Annual review of CI configuration vs this policy.

## Evidence

- Branch-protection settings export.
- CI run history per PR.
- SBOM + Cosign signatures.
- Quarterly audit notes.

## Open Items For Human Sign-Off

Track SDLC gate decisions in [`../docs/security/SOC2-OPERATOR-CHECKLIST.md`](../docs/security/SOC2-OPERATOR-CHECKLIST.md) before patching this policy.

- Confirm CodeQL or Semgrep (or both).
- Define the protected-branch list.
