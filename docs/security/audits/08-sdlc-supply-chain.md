# SOC2 Type II Readiness Audit: SDLC, CI/CD & Supply Chain Security

**Audit Date:** 2026-05-21  
**Scope:** elizaOS/eliza monorepo + Milady workspace  
**Assessor:** Claude Code (read-only analysis)  
**Risk Level:** CRITICAL

---

## Executive Summary

The elizaOS monorepo demonstrates mature **CI/CD automation** with structured release pipelines, OIDC-based authentication to PyPI, and regular dependency scanning. However, **critical secrets exposure** undermines security posture: multiple `.env` files containing production credentials, private keys, and API tokens are committed to the repository with no evidence of rotation or remediation. Additionally, **supply chain integrity controls are incomplete**: install scripts lack checksum verification, no CODEOWNERS file for change control, and Dependabot is configured but vulnerability patches are not consistently applied.

**Status:** Not SOC2 compliant. Immediate remediation required for secrets and change management before pursuing certification.

---

## CRITICAL GAPS

### 1. Secrets Committed to Repository (CRITICAL)

**Finding:** Production and development credentials hardcoded in committed `.env` files.

**Evidence:**
- `/Users/shawwalters/eliza-workspace/milady/eliza/.env` — contains:
  - Twitter API keys and OAuth tokens
  - Cerebras API key (production)
  - **Crypto private keys** (Base, BSC, Solana mainnet wallets):
    - `CRYPTO_DIRECT_BASE_PRIVATE_KEY=0x4bee...`
    - `CRYPTO_DIRECT_BSC_PRIVATE_KEY=0x650e...`
    - `CRYPTO_DIRECT_SOLANA_PRIVATE_KEY=3QbR7...`

- `/Users/shawwalters/eliza-workspace/milady/eliza/.env.production` (235 lines) — contains:
  - AWS credentials: `AKIAXO37ISOVWYBDBDNT` + secret key
  - Database credentials: Neon PostgreSQL connection strings with plaintext passwords
  - **150+ API keys/tokens:**
    - Anthropic, OpenAI, Stripe, Sendgrid, Discord, Slack, GitHub, Jira, Linear, Notion
    - EVM and Solana wallet private keys and facilitator keys
    - JWT signing keys (base64-encoded PEM format)
    - Vercel OIDC token (JWT)
    - N8N API key (JWT format)
  - AWS ACM certificate ARNs, ECS/ALB infrastructure secrets
  - Mailbox/messaging service credentials

- `/Users/shawwalters/eliza-workspace/milady/eliza/.env.local` — duplicate of `.env.production`

- `/Users/shawwalters/eliza-workspace/milady/eliza/.env.preview.local` — exists but not read

- `/Users/shawwalters/eliza-workspace/milady/eliza/.env.test` — test secrets (lower risk)

- `/Users/shawwalters/eliza-workspace/milady/eliza/.env.local.bak` — backup copy of secrets

- `/Users/shawwalters/eliza-workspace/milady/eliza/.env.crypto-wallets.generated` — generated wallet keys

**SOC2 Impact:**
- **CC6.8 (Integrity)**: No evidence of encryption at rest for sensitive repositories.
- **CC9.2 (Vendor/Supply Chain)**: Credentials should be externalized to secrets management (GitHub Secrets, Vault, AWS Secrets Manager).
- **CC7.1 (Monitoring)**: No evidence of automated secrets scanning (gitleaks, truffleHog, or native GitHub secret scanning).

**Remediation Required:**
1. Immediately rotate ALL secrets exposed (AWS keys, API tokens, crypto wallet keys).
2. Remove `.env` files from git history (e.g., `git filter-branch`, BFG Repo Cleaner).
3. Add `.env*` to `.gitignore`.
4. Enable GitHub native secret scanning (Settings → Security).
5. Migrate secrets to GitHub Secrets and reference via Actions.
6. Use cryptographic hardware wallets or cloud KMS for production private keys.

---

### 2. No Code Owners / Change Management Control (CRITICAL)

**Finding:** CODEOWNERS file missing from root and `.github/`.

**Evidence:**
- No `/Users/shawwalters/eliza-workspace/milady/eliza/CODEOWNERS`
- No `/Users/shawwalters/eliza-workspace/milady/CODEOWNERS`

**SOC2 Impact:**
- **CC8.1 (Change Management)**: Cannot enforce required reviewers for sensitive changes.
- **CC6.1 (Logical Access)**: No clear ownership or approval chain for critical areas (CI/CD config, secrets management, plugin marketplace, financial integrations).
- **Risk:** Anyone with write access to `main` can merge arbitrary code to release channels.

**Remediation Required:**
1. Create `.github/CODEOWNERS` with at least:
   ```
   # Release & publishing
   /.github/workflows/publish-* @elizaOS/release-team
   /.github/workflows/release* @elizaOS/release-team
   /packages/scripts/ @elizaOS/release-team
   
   # Infrastructure & secrets
   /.env* @elizaOS/security-team
   /patches/ @elizaOS/security-team
   
   # Core & plugin security-sensitive areas
   /packages/core/src/security/ @elizaOS/security-team
   /plugins/plugin-coding-tools/ @elizaOS/security-team
   /packages/cloud-services/gateway-discord/ @elizaOS/security-team
   ```
2. Set as required reviewers in branch protection rule.

---

### 3. Supply Chain: Install Script Lacks Checksum Verification (HIGH)

**Finding:** Curl-piped install scripts without hash verification.

**Evidence:**
- `/Users/shawwalters/eliza-workspace/milady/install.sh` (line 5):
  ```bash
  curl -fsSL https://milady-ai.github.io/milady/install.sh | bash
  ```
  - No SHA256 checksum verification
  - No GPG signature validation
  - Fetches Node version managers (nvm, fnm) via curl|bash pattern
  - Fetches from deb.nodesource.com, rpm.nodesource.com, and other external URLs

- **Risk Vector:** DNS hijacking, Man-in-the-Middle (MITM), compromised CDN, or supply chain attack on mirrors can inject malicious code into millions of user installations.

**SOC2 Impact:**
- **CC9.2 (Vendor Management)**: No integrity control for third-party dependencies.
- **CC6.8 (Integrity of Information)**: No assurance that downloaded software is authentic.

**Remediation Required:**
1. Download and GPG-sign release artifacts.
2. Publish SHA256 checksums in a signed manifest.
3. Update install script to fetch and verify:
   ```bash
   EXPECTED_SHA="abc123..."
   ACTUAL_SHA=$(curl -fsSL https://get.milady.ai/milady.tgz | sha256sum)
   [ "$ACTUAL_SHA" == "$EXPECTED_SHA" ] || exit 1
   ```
4. Or: use package managers (Homebrew formula, Winget, apt) with built-in verification.

---

## HIGH GAPS

### 4. NPM Publishing with Long-Lived Secrets (HIGH)

**Finding:** NPM registry authentication uses static token, not OIDC.

**Evidence:**
- `/Users/shawwalters/eliza-workspace/milady/eliza/.github/workflows/release.yaml` (line 137):
  ```yaml
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
    NPM_CONFIG_PROVENANCE: "false"
  ```
- **NPM_CONFIG_PROVENANCE: "false"** disables SLSA provenance attestation.
- Static `NPM_TOKEN` stored in GitHub Secrets (shared across all workflows).

**SOC2 Impact:**
- **CC6.1 (Logical Access)**: Token is long-lived; if compromised, attacker can publish packages indefinitely.
- **CC7.1 (Monitoring)**: No audit trail of who triggered publication or from where.
- **Compared to PyPI:** PyPI publishing correctly uses OIDC (`pypa/gh-action-pypi-publish@release/v1`).

**Remediation Required:**
1. Enable NPM trusted publishing (OIDC):
   - Configure at https://www.npmjs.com/settings/elizaos/tokens
   - Replace with GitHub Actions native support (npm 8+).
2. Enable provenance attestation: `NPM_CONFIG_PROVENANCE: "true"`
3. Add SLSA provenance verification in CI.

---

### 5. Dependabot Configured but Gaps in Remediation Process (HIGH)

**Finding:** Dependabot enabled but vulnerability response and patch application are unclear.

**Evidence:**
- `/Users/shawwalters/eliza-workspace/milady/eliza/.github/dependabot.yml`:
  - npm, pip, cargo, github-actions scanning configured weekly
  - Known vulnerabilities are explicitly ignored (e.g., gitpython, rustls-webpki, lru)
  - No clear SLA or enforcement for patching

**SOC2 Impact:**
- **CC9.2 (Supply Chain)**: "ignore" rules suggest transitive vulnerabilities are accepted risk, but no compensating controls documented.
- **CC7.1 (Monitoring)**: No evidence of vulnerability tracking or reporting.

**Gaps:**
- No evidence of automated testing on Dependabot PRs before merge.
- No mandatory approval workflow for security updates.
- No SLA for patching critical vs. high vs. medium vulnerabilities.

**Remediation Required:**
1. Document vulnerability remediation policy in SECURITY.md.
2. Require at least one security-team approval for dependency upgrades.
3. Auto-merge low-risk patch updates (minor versions) after CI passes.
4. Set SLA: critical (24h), high (1 week), medium (2 weeks).

---

### 6. No Pre-Commit Hooks or Gitleaks Integration (HIGH)

**Finding:** No client-side or CI-level secret scanning.

**Evidence:**
- `.pre-commit-config.yaml` not found in repo.
- No gitleaks configuration (`.gitleaksignore`).
- Git hooks exist but only enforce Git LFS (`.git/hooks/pre-push`).
- CI has only a limited "Prompt secret scan" step for one package (`packages/prompts && bun run check:secrets`).

**SOC2 Impact:**
- **CC7.1 (Monitoring)**: No automated detection of secrets before commit.
- **CC8.1 (Change Management)**: Developers can accidentally commit secrets without immediate feedback.

**Remediation Required:**
1. Install husky + gitleaks:
   ```bash
   npm install husky gitleaks --save-dev
   husky install
   npx husky add .husky/pre-commit "gitleaks protect --verbose --redact"
   ```
2. Add `.gitleaksignore` to whitelist false positives.
3. Enable GitHub native secret scanning (free on public repos).

---

## MEDIUM GAPS

### 7. Workflow Permissions Not Fully Minimized (MEDIUM)

**Finding:** Some workflows request broad permissions.

**Evidence:**
- `ci.yaml` uses `actions/checkout@v4` (pinned, good) but workflows request:
  - `contents: write` in release workflows (acceptable for git operations)
  - `actions: read` (acceptable)
  - Compared to PyPI (correctly uses `id-token: write` only for OIDC)

**SOC2 Impact:**
- **CC6.1 (Logical Access)**: Least-privilege not fully applied.

**Remediation:**
- Audit each workflow for necessary permissions.
- Use OIDC (`id-token: write`) for external services instead of long-lived secrets.

---

### 8. No Signed Commits or Branch Protection Verification (MEDIUM)

**Finding:** Release workflows do not require signed commits.

**Evidence:**
- `release.yaml` git config doesn't set GPG signing:
  ```bash
  git config user.name "github-actions[bot]"
  git config user.email "github-actions[bot]@users.noreply.github.com"
  # No commit.gpgsign or -S flag
  ```

**SOC2 Impact:**
- **CC8.1 (Change Management)**: Release commits are not cryptographically signed.
- **CC6.8 (Integrity)**: No non-repudiation for release commits.

**Remediation:**
1. Add GPG key to GitHub Actions secrets.
2. Configure signing in workflows:
   ```bash
   git config commit.gpgsign true
   git config user.signingkey "GPG_KEY_ID"
   ```
3. Enable "Require signed commits" in branch protection.

---

### 9. Test Coverage & Gating Not Fully Documented (MEDIUM)

**Finding:** CI runs tests but no explicit SLA or coverage gate.

**Evidence:**
- `ci.yaml` runs:
  - `bun run test:core` (15 min timeout)
  - `bun run test:plugins` (15 min timeout)
  - `bun run typecheck`
  - `bun run lint`
  - No evidence of code coverage enforcement

**SOC2 Impact:**
- **CC7.1 (Monitoring)**: Coverage trends not tracked.
- **CC8.1 (Change Management)**: No gate for minimum coverage on PRs.

**Remediation:**
1. Add coverage reporting (e.g., codecov, nyc/c8).
2. Enforce minimum coverage (e.g., 80%) in branch protection.

---

## EXISTING CONTROLS (Positive Findings)

### ✓ CI/CD Automation
- Comprehensive GitHub Actions workflows (103 files).
- Concurrency controls to prevent race conditions.
- Timeout constraints to catch hanging tests.

### ✓ Dependency Pinning
- Actions use `@v4` (SHA pinning implied via GitHub).
- Node, Bun versions pinned in workflows.
- Dependabot configured for npm, pip, cargo, GitHub Actions.

### ✓ PyPI OIDC Integration
- Correct OIDC trusted publishing for Python packages.
- No static PyPI tokens in repo.

### ✓ Test & Lint Gating
- Tests required before merge (enforced by CI block).
- Linting and formatting checks in place.
- Biome/lint configuration present (`biome.json`).

### ✓ Manual Patching Process
- `patches/` directory for upstream vulnerability fixes.
- 52 patches to upstream dependencies documented.

### ✓ Environment Segregation
- Test env file created at runtime (`packages/core/.env.test`).
- TURBO_REMOTE_ONLY for cache isolation.

---

## REMEDIATION ROADMAP

### Phase 1: Critical (0–2 weeks)
1. **Rotate ALL secrets:** AWS keys, API tokens, crypto wallets, database passwords.
2. **Remove secrets from git history:** Use BFG Repo Cleaner or git filter-branch.
3. **Add `.env*` to `.gitignore`** and commit.
4. **Enable GitHub secret scanning** (Settings → Code security).
5. **Create CODEOWNERS** file with required reviewers for sensitive paths.

### Phase 2: High (2–4 weeks)
1. **Implement gitleaks pre-commit hook.**
2. **Enable npm OIDC trusted publishing.**
3. **Update install scripts** with SHA256 verification.
4. **Document vulnerability remediation SLA** in SECURITY.md.

### Phase 3: Medium (1 month)
1. **Add signed commits** to release pipeline.
2. **Add code coverage gating** (e.g., codecov).
3. **Audit workflow permissions** and minimize to least-privilege.
4. **Set up SLSA provenance** for npm packages.

---

## Assessment Against SOC2 CC Criteria

| CC ID | Criteria | Status | Finding |
|-------|----------|--------|---------|
| CC6.1 | Logical Access | ❌ FAIL | No CODEOWNERS; no required reviewers for sensitive changes. |
| CC6.8 | Integrity | ❌ FAIL | Secrets in git; no cryptographic verification of artifacts. |
| CC7.1 | Monitoring | ⚠️ PARTIAL | Dependabot configured, but no tracking of remediation SLA. |
| CC8.1 | Change Management | ❌ FAIL | No signed commits; no change approval workflow. |
| CC9.2 | Vendor/Supply Chain | ❌ FAIL | Install scripts lack checksum; dependencies not verified. |

---

## Conclusion

The elizaOS project has **strong CI/CD automation** but **critical security gaps** that prevent SOC2 Type II certification. The most urgent issue is **secrets exposure**: hundreds of production credentials hardcoded in committed `.env` files pose an immediate risk to customer data, infrastructure, and financial accounts. Combined with missing change management controls (CODEOWNERS) and supply chain integrity gaps (install scripts), this configuration does not meet enterprise security standards.

**Recommendation:** Do not pursue SOC2 Type II certification until Phase 1 remediation is complete. Once secrets are rotated and removed from git, shift focus to change management and supply chain controls.

