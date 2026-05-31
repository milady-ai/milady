# SOC2 Type II Implementation Plan — Eliza Stack

**Status:** Interim v2. Based on framework (`00-framework.md`) + completed audits 01, 03, 05, 06, 07, 08 (6 of 8). Sections marked **[PENDING-AUDIT-02]** (cloud-infra) and **[PENDING-AUDIT-04]** (logging-monitoring) will be expanded when those land. The plan structure is intentionally final-shape so later findings slot in without re-architecture.

---

## ⚠️ EMERGENCY ITEM — DO BEFORE ANYTHING ELSE

Audit 08 (SDLC/Supply-Chain) identified **production secrets committed to the repo**, including:
- AWS access keys (e.g., `AKIAXO37ISOVWYBDBDNT`)
- Crypto private keys for Base/BSC/Solana **mainnet** wallets
- Database passwords
- ~150 third-party API keys (Anthropic, OpenAI, Stripe, Slack, Discord, etc.)
- JWT signing keys

**Immediate action (today, before any other SOC2 work):**

| ID | Action |
|---|---|
| E-0a | **Rotate every exposed credential.** AWS keys, wallet keys (transfer funds first), DB passwords, every third-party API key, every JWT signing key. Order: wallet keys (move funds) → AWS → DB → third-party. |
| E-0b | **Purge from git history** (`git filter-repo` or BFG). Force-push to all branches. Notify any forkers. |
| E-0c | **Enable GitHub secret-scanning + push protection** at org level immediately. |
| E-0d | **Audit access logs** on AWS, Stripe, third-party services for any anomalous access during the exposure window. |
| E-0e | **Incident-response record:** log timeline, scope, actions for SOC2 evidence. This becomes the first real incident-response artifact. |

The exposure of mainnet crypto private keys in a public repo is a critical financial-loss risk that must be handled immediately and is independent of SOC2 timeline.

---

## Part A — Overall Assessment

### A.1 Maturity Snapshot

| Domain | Existing Strength | SOC2 Readiness |
|---|---|---|
| AuthN (Cloud) | Steward OAuth, JWT HS256, constant-time compare, Redis session cache, API-key hashing | ~70% CC6.1 — missing MFA, rotation, audit |
| AuthZ / RBAC | Role field, `requireRole`, separate `admin_users` table | ~40% CC6.3 — granular perms stored but unenforced |
| Encryption-at-rest | Org-scoped DEKs, AES-256-GCM, vault crypto with AAD | ~55% C1.1 — partial; plaintext API keys & PII |
| Encryption-in-transit | TLS at edge, encrypted cookies | ~85% CC6.7 — DB connections lack enforced `sslmode=require` |
| Webhook integrity | HMAC-SHA512 Stripe/OxaPay, replay dedup | ~90% — missing timestamp window |
| Input validation | Zod at route boundaries | ~85% |
| Rate limiting | Redis sliding window, fail-open | ~75% — anomaly alerting absent |
| Audit logging | Some (secret access, webhook events) | ~25% CC4/CC7 — no auth-event log, no admin-action log, retention unbounded |
| Plugin trust | Manifest schema, permission allowlist | ~30% — no signature verification, perms unenforced at RPC |
| Sub-agent isolation | None | ~10% — full env inheritance, no FS scope |
| Data retention / deletion | Cascade FKs | ~20% — no soft-delete, no DSR workflow, no purge job |
| Local-mode data security | OS keychain + passphrase fallback | ~40% — local PGlite unencrypted, trajectory capture broad |
| Infra/network | GKE Autopilot, WIF/OIDC, VPC/subnets, CNPG backups, Terraform IaC | ~50–60% — hardcoded compose secrets, root containers, no NetworkPolicies, no scanning, no central logs |
| Logging / monitoring | Adze structured logger, fast-redact PII filter, trajectory plugin | ~20–30% — no audit stream, no auth events, zero alerting, no retention policy |
| Client (desktop/mobile) | Vault AES-256-GCM, OS keychain, macOS notarization, dev-endpoints loopback-gated | ~40% — unsigned auto-update, plaintext localStorage, PTY sandbox absent, Windows signing absent |
| Training / model supply chain | Privacy filter (1500+ rules), kernel manifest enforcement, prompt versioning | ~25% — no customer consent, no data lineage, no model signing, optional `--strict`, no firmware signing |
| SDLC / CI / supply chain | 103 GitHub workflows, dependency pinning, PyPI OIDC, manual upstream patches | ~30% — **secrets committed to repo**, no CODEOWNERS, no gitleaks, static NPM_TOKEN, provenance disabled |

### A.2 Cross-Cutting Root-Cause Themes

Five systemic patterns drive most findings:

1. **"Defined but not enforced"** — Permission/trust/role/tenant boundaries are *modeled in the schema/types* but enforcement at the dispatch point is missing. Fix is to add enforcement middleware/guards at the choke points, not redesign the model.
2. **Audit logging is a stack-wide gap.** Several local logs exist but no unified, immutable, retention-bounded audit stream covers auth, admin action, data access, plugin install/grant, sub-agent spawn, billing/redemption events. Fix is a single `audit_events` service + sink; every privileged action calls it.
3. **Key/secret lifecycle is undocumented.** Multiple key types (Steward JWT, webhook secrets, vault master, org DEKs) all read from env vars with no rotation procedure, no KMS, no versioned key store. Fix is one KMS-backed key store with documented rotation per key class.
4. **Confidentiality is implemented unevenly.** Some columns/structs are fully encrypted (AES-256-GCM with AAD), neighbors are plaintext. Fix is a data-classification pass + field-level encryption uniformly applied + published data dictionary.
5. **Supply-chain trust is asserted, not verified.** Plugins, sub-agent binaries, models from HF (**[PENDING-AUDIT-07]**), npm dependencies (**[PENDING-AUDIT-08]**) — no signature/hash verification on install. Fix is mandatory artifact integrity checks at every install/spawn point.

### A.3 Eliza-Specific SOC2 Risks (from framework §7)

The audit confirms the framework's preliminary risk themes. Strongest *evidenced* risks so far:

- **Hybrid local+cloud boundary** — must be drawn in the description-of-system. Local PGlite holds PII and trajectories unencrypted; local-mode data must either stay local (and be encrypted at rest on disk) or move with consent.
- **Sub-agent (Claude Code) execution** — currently a privileged-execution path with full env inheritance. This is a credential-exfiltration vector visible to anyone who can influence the LLM output. Must be sandboxed before SOC2 Type II observation window.
- **Plugin trust** — no signature verification = unbounded customer-side risk. Need plugin trust policy + signature/hash verification + customer-responsibility line in the DPA.
- **Cloud monetization (PI1)** — redemption/payout paths require deterministic, audit-trailed processing; existing webhook dedup is good but PI1 needs full evidence of "complete, accurate, timely" across the billing flow. **[PENDING-AUDIT-02 for deploy-side PI1 evidence]**.

---

## Part B — Phased Implementation Plan

Each task lists: **ID**, **task**, **why (control)**, **owner**, **effort**, **dependencies**.

### Phase 0 — Foundation (Weeks 0–2)

| ID | Task | Control | Owner | Effort |
|---|---|---|---|---|
| F-1 | Choose GRC platform (Vanta / Drata / Secureframe). Required for evidence collection at audit cost-effectively. | CC4.1 | Sec lead | 2d eval |
| F-2 | Designate Security Officer (CISO equivalent). Document in org chart. | CC1.3 | Leadership | 1d |
| F-3 | Stand up `security@elizalabs.ai` inbox + `security.txt` + responsible-disclosure page. | CC2.2 | Sec lead | 1d |
| F-4 | Create master Information Security Policy v1 (template-derived OK). | CC5.3 | Sec lead | 3d |
| F-5 | Set up risk register (spreadsheet or GRC). Seed with the 5 cross-cutting themes + Eliza-specific risks. | CC3.1 | Sec lead | 2d |
| F-6 | Subprocessor inventory + DPA carve-outs (Anthropic, OpenAI, HF, Nebius, Stripe, GitHub, hosting). Publish subprocessor list. | CC9.2 | Legal | 3d |

### Phase 1 — P0 Technical Gaps (Weeks 2–6)

Closes the bleeding before Type I.

#### B.1 Cloud API & AuthN/Z (from audit 01)

| ID | Task | File / Surface | Effort |
|---|---|---|---|
| C-1 | Add explicit org-membership checks on routes that accept user-supplied IDs (close IDOR). Add helper `assertOrgMembership(userId, resourceId, ctx)` and apply to all `/api/v1/api-keys/*`, `/api/v1/agents/*`, `/api/v1/containers/*`. | `packages/cloud-api/src/routes/v1/*` | 3d |
| C-2 | Implement `auth_events` table + service. Log: login success/failure, logout, API-key create/revoke/use, admin actions, permission changes, password reset, MFA enroll. Include actor, IP, UA, timestamp, target. | `packages/cloud-shared/src/db/schemas/auth-events.ts` (new); `packages/cloud-api/src/services/audit.ts` (new) | 4d |
| C-3 | Remove `ELIZA_CLOUD_LOCAL_DEV_ADMIN` admin-bypass code path or hard-fail when `NODE_ENV=production`. | `packages/cloud-api/src/middleware/auth.ts:110-121` | 0.5d |
| C-4 | Document & implement secret-rotation procedure for `STEWARD_SESSION_SECRET`, `STRIPE_WEBHOOK_SECRET`, `OXAPAY_*`. Versioned key store; dual-accept window. | runbook + `packages/cloud-shared/src/lib/auth.ts` | 3d |
| C-5 | Add webhook timestamp validation (±5 min replay window). | `packages/cloud-api/src/routes/crypto/webhook/route.ts` | 1d |
| C-6 | Enforce `permissions` field on API keys — currently stored but never checked at request time. Add `requireApiKeyPermission(perm)` middleware. | `packages/cloud-api/src/middleware/auth.ts` | 2d |

#### B.2 Data, Encryption, PII (from audit 03)

| ID | Task | File / Surface | Effort |
|---|---|---|---|
| D-1 | Encrypt API-key plaintext at rest; drop the `key` column, keep only `key_hash` for lookup + `key_encrypted` (envelope with org DEK) for one-time reveal flow. | `packages/cloud-shared/src/db/schemas/api-keys.ts:28` + migration | 2d |
| D-2 | Force `sslmode=require` on all non-localhost Postgres connections. | `packages/cloud-shared/src/db/client.ts:127-183` | 1d |
| D-3 | Extend field-level encryption to: `users.email`, `users.phone_number`, `users.wallet_address`, `users.telegram_id`, `users.discord_id`; `platform_credentials.*`; `conversations.content`. Maintain searchable hash columns where needed. | `packages/cloud-shared/src/db/schemas/{users,platform-credentials,conversations}.ts` + migration | 4d |
| D-4 | Set `expires_at` retention on `secret_audit_log` and other audit tables; deploy purge job (recommend 7y for security audit, 365d minimum). | `packages/cloud-shared/src/db/schemas/secrets.ts:232-265`, new cron job in cloud-api | 1d |
| D-5 | Add soft-delete (`deleted_at` + view filter) on user-scoped tables (users, conversations, secrets, api_keys, agents, connector_accounts). | schemas + queries | 3d |
| D-6 | Remove `api_key_plain` field from `cli-auth-sessions`. Replace with single-use signed token + in-memory delivery. | `packages/cloud-shared/src/db/schemas/cli-auth-sessions.ts` | 1d |

#### B.3 Agent Runtime & Plugin Sandbox (from audit 06)

| ID | Task | File / Surface | Effort |
|---|---|---|---|
| A-1 | Mandatory SHA-256 verification on plugin tarball install; pin `currentHash` and reject mismatch. Sign manifests with org key; verify on install. | `packages/plugin-remote-manifest/src/types.ts:114-121`, install path | 3d |
| A-2 | Sub-agent (Claude Code) spawn: env allowlist (only PATH, HOME, TMPDIR, LANG, plus explicitly-passed task vars); block all `*TOKEN`, `*SECRET`, `*KEY`, `DATABASE_URL`, `WALLET_*`. Validate `cwd` is inside workspace. Resolve `claude` binary to absolute whitelisted path. | `packages/plugin-sub-agent-claude-code/src/sub-agent-service.ts:93-99` | 2d |
| A-3 | Sub-agent FS sandbox: confine to `{workspace, /tmp/<session>, ~/.cache}`. Use OS-level sandbox (sandbox-exec on macOS, bubblewrap on Linux, AppContainer on Windows) where available; document residual risk where not. | new wrapper around Bun.spawn | 4d |
| A-4 | Plugin-worker RPC authentication: per-session HMAC token bound to plugin install ID; reject unsigned messages at dispatcher. | `packages/plugin-worker-runtime/src/dispatch.ts:37-74` | 3d |
| A-5 | Plugin permission enforcement at RPC dispatch (not just UI present). Check the granted permission before invoking the host capability. | `packages/plugin-worker-runtime/src/dispatch.ts` | 2d |
| A-6 | LLM-tool dispatch: action allowlist per agent, human-in-loop confirmation for destructive actions (file write outside workspace, network egress, billing ops). | `packages/agent/src/runtime/*` | 4d |
| A-7 | Confirm vision/screen-capture is opt-in service per `feedback_plugin_vision_cost.md`. Add explicit consent gate + cost-warning UI + per-call audit log. | TBD | 2d |

#### B.4 Cross-cutting

| ID | Task | Effort |
|---|---|---|
| X-1 | Stand up unified `audit_events` log sink (immutable, ≥365d retention, separate access). Append-only S3-with-object-lock or equivalent. Feed C-2, plus plugin grants/revokes (A-5), sub-agent spawns (A-2), data exports, admin actions. | 4d |
| X-2 | Integrate KMS (AWS KMS or equivalent) as backing for: Steward JWT secret, webhook secrets, vault master, org DEKs. Document rotation schedule per class (JWT: 90d, webhook: 180d, DEK: 365d, master: 730d). | 5d |
| X-3 | Add SOC2-grade structured logger usage audit; replace any remaining `console.*` calls in server code per AGENTS.md commandment #9. Ensure PII redaction filter. | 2d |

### Phase 2 — Policies, Process, Org (Weeks 4–8) — overlaps with Phase 1

| ID | Task | Control |
|---|---|---|
| P-1 | Write the 24 required policies (framework §3). Use a template pack (Vanta/Drata supplies). Customize for Eliza-specific items: AI/ML model governance, plugin trust policy. | CC5.3 |
| P-2 | Onboarding/offboarding runbook: laptop provisioning, SSO/MFA enroll, role grant, access review at 90d, offboarding checklist with same-day revoke. | CC6.2 |
| P-3 | Vendor management workflow: intake form, DPA on file, SOC2 report on file, annual review. | CC9.2 |
| P-4 | Incident Response Plan + severity matrix + on-call rota + comms templates (customer, internal, regulator). Tabletop exercise once written. | CC7.3/7.4 |
| P-5 | BC/DR Plan with documented RTO (suggest 4h API, 24h dashboard) / RPO (suggest 1h). Quarterly restore test. | A1.3, CC9.1 |
| P-6 | Data classification scheme (Public / Internal / Confidential / Restricted) + handling matrix. Map every DB column to a class. | C1.1 |
| P-7 | Data retention & disposal policy. Per-data-class retention. DSR (delete-on-request) workflow. | C1.2 |
| P-8 | Cryptography policy: AES-256-GCM for symmetric, TLS ≥1.2, key rotation schedule (mirrors X-2). | C1.1 |
| P-9 | Plugin & Connector Trust Policy: customer responsibility, signature requirement, revocation. | Eliza-specific |
| P-10 | AI/ML Model Governance Policy: training data sources, consent, model artifact integrity, **[PENDING-AUDIT-07]** for specifics. | Eliza-specific |
| P-11 | Acceptable Use Policy, Code of Conduct, signed by all employees. | CC1.1 |
| P-12 | Background-check process for personnel with prod access. | CC1.4 |
| P-13 | MFA enforcement org-wide on SSO + critical SaaS (GitHub, npm publish, hosting, payment processor). | CC6.1 |
| P-14 | Quarterly access review process; document attestations. | CC6.1 |

### Phase 3 — P1 Technical Gaps (Weeks 6–12)

#### B.5 Infra & Deployment — from audit 02

Maturity ~50–60%. K8s + GCP IaC (Terraform/GKE Autopilot) + Workload Identity Federation are good foundations. Critical gaps:

| ID | Task | Effort |
|---|---|---|
| I-1 | **Remove hardcoded secrets** from `docker-compose.yml` (passwords, JWT tokens, S3 creds). Use sealed-secrets / external-secrets-operator pulling from KMS-backed secret store. Rotate any exposed values. (Overlap with E-0.) | 2d |
| I-2 | Container `securityContext`: `runAsNonRoot: true`, fixed UID, `readOnlyRootFilesystem: true`, drop ALL capabilities, `allowPrivilegeEscalation: false`. Apply to every K8s workload. | 3d |
| I-3 | **NetworkPolicies** for east-west segmentation: default-deny ingress, then explicit allow per service edge. (Currently zero policies — full mesh open.) | 3d |
| I-4 | Trivy (or Grype) container scanning in CI on every image push; pin base image by digest; fail build on critical CVE. | 2d |
| I-5 | mTLS between in-cluster services (Linkerd or Istio ambient). Verify Postgres/Redis links also TLS-required (overlaps D-2). | 5d |
| I-6 | Cosign image signing + SLSA provenance attestation; verify signatures at admission via policy-controller / Kyverno. (Re-enable `NPM_CONFIG_PROVENANCE` is S-4.) | 4d |
| I-7 | Fluent Bit (or equivalent) cluster-wide log shipper → centralized log store (Loki / GCP Logging) with ≥365d retention, immutable bucket, restricted access. Feeds audit-event sink X-1. | 3d |
| I-8 | Document RTO (target 4h) / RPO (target 1h) for the production cluster. Quarterly restore-from-CNPG-backup drill; record drill evidence. | 2d setup + recurring |
| I-9 | Pod-Disruption-Budgets + HPA + capacity-planning doc (A1.1). | 2d |

Keep: GKE Autopilot, GitHub Actions OIDC/WIF (no long-lived cloud creds in CI), GCP VPC + subnets, CNPG daily backups (30d prod / 7d staging), Terraform IaC discipline.

#### B.6 Logging & Monitoring — from audit 04

Maturity ~20–30%. Good `Adze`-based structured logger + `fast-redact` PII filter. Critical gaps in audit-stream separation, auth-event logging, and zero alerting.

| ID | Task | Effort |
|---|---|---|
| O-1 | **Audit-event schema + dispatcher.** Columns: `event_id, ts, actor (user/api-key/service), action, result, resource_type, resource_id, ip, ua, request_id, metadata`. Single canonical schema used by all surfaces. (Realizes X-1.) | 2d |
| O-2 | Wire dispatcher from: auth (login/logout/MFA/session — closes C-2 + this audit's #2), API-key ops, secret ops (currently DEBUG only — promote), payments/redemption, role/permission changes, plugin install/grant/revoke (closes A-1/A-5 gap), sub-agent spawn (A-2), data export, admin actions, container deploy. | 5d |
| O-3 | Separate audit output sink: write-once / append-only / immutable. Options: S3 with object-lock + KMS encryption, GCP Logging with retention-lock, dedicated audit DB with no UPDATE/DELETE grants. Retention ≥365d (recommend 7y for security-relevant). | 3d |
| O-4 | Monitoring/alerting stack: OpenTelemetry collectors → Prometheus + Grafana (or GCP Cloud Monitoring). Alert rules: failed-auth spike, rate-limit hits, 5xx burst, audit-log write failure, container restart loop, certificate expiry, backup-job failure, anomalous data export volume. | 5d |
| O-5 | Trajectory logging compliance scope: document what is captured, redaction policy (extend `fast-redact` rules for emails/tokens/wallet addresses in trajectories), retention default 30d, opt-in flag respected, default-off in prod builds. | 2d |
| O-6 | Log retention/rotation policy documented per stream: app logs 90d hot + 365d cold, audit logs 7y, trajectory 30d (opt-in), access logs 365d. Enforce via lifecycle policies. | 1d |
| O-7 | Redaction test coverage: unit tests that feed known PII into every log path and assert redaction. | 2d |
| O-8 | Coding-agent PTY session recording: store transcripts in audit sink with same retention as audit-events; restricted access; index by session-id. | 2d |

Keep: `Adze` logger + `fast-redact`, prompt/response/chat instrumentation, memory-access-log schema, configurable levels/context.

#### B.7 Clients (Desktop/Mobile) — from audit 05

| ID | Task | Effort |
|---|---|---|
| L-1 | Auto-update signature verification: every `ELIZA_RELEASE_URL` download must verify Ed25519 (or RSA-4096) signature against a pinned public key before swap. Documented rollback policy. CVSS-8.1 finding. | 3d |
| L-2 | Encrypt at rest in localStorage / Preferences / Capacitor: wrap `eliza.device.identity`, `eliza.control.settings.v1`, `eliza.device.auth`, and any token in OS-keychain-backed key derivation; do not store API keys in localStorage. Audit current contents and redact. | 3d |
| L-3 | PTY-agent sandbox: seccomp (Linux), sandbox-exec (macOS), AppContainer (Windows); resource limits (CPU/mem/wall); workspace-only FS scope; signed audit log of every command. CVSS-8.8 finding. | 5d |
| L-4 | Browser-bridge extension: replace `<all_urls>` with per-site allowlist + activeTab; review CSP; document message validation. | 2d |
| L-5 | Windows code signing pipeline (EV cert). | 2d setup |
| L-6 | Encrypt local PGlite that holds conversation history. (Overlaps D-equivalent for client.) | 2d |
| L-7 | Build-time guard: `/api/dev/*` endpoints compiled out of prod builds; smoke test in CI confirms 404. | 1d |

Keep: existing vault crypto, dev-endpoint loopback+token model, macOS codesign+notarization, SSRF guards.

#### B.8 Training & Models — from audit 07

| ID | Task | Effort |
|---|---|---|
| M-1 | **Customer-data consent gate.** Define training-data policy: zero customer data in training **unless** explicit opt-in + DPA carve-out. Audit `datasets.yaml` (training/datasets.yaml:75-153); remove any non-opt-in sources or wire to consent flag. PI1.1 / C1.1 violation if left as-is. | 5d |
| M-2 | Training-data lineage manifest. Every model artifact records its training-data manifest hash. Extend `scripts/manifest/eliza1_manifest.py`. | 3d |
| M-3 | Sign model artifacts (GPG or sigstore) before HF push. Verify on download in `OptimizedPromptService` and any model loader. | 3d |
| M-4 | HMAC + integrity-tag on DSPy optimized-prompts in `~/.local/state/milady/optimized-prompts/<task>/`. Reject on mismatch. (`packages/core/src/services/optimized-prompt.ts:40-677`.) | 2d |
| M-5 | Make `--strict` mandatory in privacy filter (`scripts/privacy_filter_trajectories.py`). Prove TS-runtime equivalent path (or remove the TS bypass). | 2d |
| M-6 | Training infra credential hygiene: `HF_TOKEN`, `VAST_API_KEY`, AWS creds via secrets manager (not env), rotation cadence (90d), audit log of use. | 2d |
| M-7 | Nightly trajectory collection: opt-in + retention policy + purge job. (Overlaps L-2 client-side and X-1 audit log.) | 2d |
| M-8 | **Chip firmware signing** (RSA-4096) before any customer-device flash. Attestation chain. CRITICAL if device ships. (`packages/chip/fw/`.) | 5d |

Keep: privacy-filter rule set (1500+ lines), privacy attestation schema, manifest-enforced kernel requirements, optimized-prompt versioning + rollback.

#### B.9 SDLC & Supply Chain — from audit 08

(Note: audit 08 found committed production secrets — see Emergency section E-0 at top of doc.)

| ID | Task | Effort |
|---|---|---|
| S-1 | **CODEOWNERS** file covering CI workflows (`.github/workflows/*`), release scripts, security-sensitive packages (cloud-api, vault, plugin-host-shim*, training). | 1d |
| S-2 | Branch protection on `main` and `develop`: required reviewers (from CODEOWNERS), required CI checks (typecheck, lint, test, gitleaks), linear history, signed commits required, no force-push. | 1d |
| S-3 | Gitleaks (or trufflehog) pre-commit hook + CI workflow scanning every PR and every push to protected branches. | 1d |
| S-4 | Switch npm publish from static `NPM_TOKEN` → OIDC trusted publishing. Re-enable `NPM_CONFIG_PROVENANCE: "true"` for SLSA attestation. 2FA on all npm publisher accounts. | 2d |
| S-5 | Install scripts (`install.sh`, `install.ps1`, `install.cmd`): pin upstream tool versions; verify SHA-256 checksums on every download; document expected hashes. | 2d |
| S-6 | Dependabot SLA policy: critical ≤7d, high ≤30d, medium ≤90d. Document compensating controls where vulnerabilities are explicitly ignored. | 1d |
| S-7 | CI workflow permission audit: every job runs with `permissions:` block declaring least privilege; pin third-party actions by SHA, not tag. | 3d |
| S-8 | `patches/` audit: checksum each patch file; CI verifies hashes match expected; review process for new patches. | 2d |
| S-9 | AI-authored PR review policy (per AGENTS.md spirit). Document the human-review requirement; consider commit-trailer convention (`Generated-by:`) for traceability. | 1d |
| S-10 | Coverage gate (e.g., 70% min on changed lines) as CI required check. | 2d |

### Phase 4 — Type I Readiness (Week ~14)

| ID | Task |
|---|---|
| T-1 | Engage external SOC2 auditor (CPA firm). |
| T-2 | Internal pre-audit walkthrough; gap reconciliation. |
| T-3 | Type I report (point-in-time, design of controls). |

### Phase 5 — Type II Observation Window (Months 4–10)

Operate controls continuously. Collect evidence automatically via GRC tool. Discipline items:
- Quarterly access reviews (Q1, Q2, …) — keep attestations.
- Monthly vulnerability scans + remediation SLAs (critical 7d, high 30d, medium 90d).
- Annual tabletop incident-response exercise.
- Quarterly backup restore test.
- Annual policy review.
- Continuous: audit-event log review, anomaly alert triage.

### Phase 6 — Type II Audit Fieldwork (Months 10–12)

Auditor samples evidence across the 6-month window. Issue final report.

---

## Part C — Risk Register Seed

| # | Risk | Likelihood | Impact | Mitigation Owner |
|---|---|---|---|---|
| R-1 | Plugin supply-chain compromise (no sig verify) | M | H | Sec — A-1 |
| R-2 | Sub-agent credential exfil via env inheritance | M | H | Sec — A-2/A-3 |
| R-3 | IDOR in cloud-API | M | H | Backend — C-1 |
| R-4 | Plaintext API keys / PII in DB | M | H | Backend — D-1/D-3 |
| R-5 | DB connection not TLS-forced | L | H | Backend — D-2 |
| R-6 | No MFA on admin / prod-access | M | H | Sec — P-13 |
| R-7 | Audit-log retention unbounded / missing events | H | M | Sec — C-2/D-4/X-1 |
| R-8 | No DSR (GDPR/CCPA delete) workflow | M | M | Compliance — D-5 + P-7 |
| R-9 | Key rotation procedure absent | M | M | Sec — X-2 |
| R-10 | Local PGlite holds PII unencrypted | M | M | Client team — Phase 3 B.7 |
| R-11 | Hardcoded secrets in docker-compose + root containers + no NetworkPolicies | H | H | Platform — I-1/I-2/I-3 |
| R-12 | Customer chats in training without consent (PI1/C1.1) | M | H | ML Lead — M-1 |
| R-13 | Production secrets committed to repo (AWS / wallets / API keys) | **CONFIRMED** | **CRITICAL** | Sec — E-0 (emergency) |
| R-14 | No audit-event stream / no alerting | H | H | Sec — O-1/O-3/O-4 + X-1 |
| R-15 | Unsigned desktop auto-update | M | H | Client team — L-1 |
| R-16 | Chip firmware unsigned (if shipped) | depends | H | HW team — M-8 |
| R-17 | Sub-agent / PTY sandbox absent (server + client) | M | H | Runtime — A-2/A-3 + L-3 |

---

## Part D — Sequencing & Critical Path

```
Phase 0 (foundation) ──┐
                       ├─→ Phase 1 P0 fixes ──┐
Phase 2 (policies)  ──┘                       │
                                              ├─→ Phase 4 Type I ─→ Phase 5 observation ─→ Phase 6 Type II
                       Phase 3 P1 fixes ─────┘
```

Critical-path items (gating Type I):
0. **E-0 emergency secret rotation + git-history purge** — must happen *today*, independent of SOC2 timeline.
1. F-1 GRC tool selection (everything downstream uses its evidence collectors).
2. F-2 Security Officer designation.
3. O-1/O-2/O-3 + X-1 audit-event stream + immutable sink (required to demonstrate operating effectiveness during observation window).
4. P-13 MFA enforcement org-wide.
5. X-2 KMS + key rotation procedure (auditor asks day 1).
6. C-1 / D-1 / D-2 / D-3 data confidentiality fixes (can't be open at Type I).
7. S-1/S-2/S-3 CODEOWNERS + branch protection + gitleaks (prevents the next E-0).
8. I-1/I-2/I-3 infra critical: secrets, securityContext, NetworkPolicies.
9. A-2/A-3 + L-3 sub-agent / PTY sandboxing.
10. L-1 desktop auto-update signing.

---

## Part E — Evidence-Collection Map

| Control | Evidence Auto-Collected by GRC | Manual Evidence |
|---|---|---|
| CC6.1 MFA enforced | Okta/SSO config | Quarterly access review attestations |
| CC6.6 Network boundaries | AWS/GCP config | Architecture diagram |
| CC6.7 TLS in transit | TLS endpoint scan | DB conn-string review |
| CC7.1 Vuln scanning | Snyk/GHAS feed | Triage tickets |
| CC8.1 Change mgmt | GitHub branch protection, PR audit | Release runbook |
| C1.1 Encryption-at-rest | Cloud provider attestation + DEK config | Data dictionary |
| A1.2 Backups | Backup job logs | Quarterly restore test report |
| CC4.1 Monitoring | Datadog/Sentry | Monthly alert review |

---

## Part F — Open Questions (post-audit)

All 8 audits complete. Decisions still needed from leadership:

1. **GRC tooling choice** — Vanta vs Drata vs Secureframe. Drives evidence-collection cost more than anything else.
2. **Privacy category in scope** — include SOC2 P (privacy) criteria, or rely on a parallel GDPR/ISO-27701 posture? Recommended: include P given consumer PII + connector data.
3. **Training-data policy** — confirm zero-customer-data-in-training default. If opt-in path is desired, the consent flow + DPA carve-out needs design before any next training run.
4. **Chip deployment timeline** — if customer hardware ships, firmware signing (M-8) becomes blocking; if not, lower priority.
5. **Type I target date** — proposed ~14 weeks from kickoff; depends on resource allocation. Type II window opens immediately after Type I issuance.
6. **Auditor selection** — engage a CPA firm familiar with AI/ML platforms (e.g., Prescient, Insight Assurance, A-LIGN).

---

## Document map

| File | Contents |
|---|---|
| `00-framework.md` | Trust Service Criteria mapping, required policies, evidence framework, Eliza-specific risk themes |
| `01-cloud-api.md` | Cloud API auth/Z, secrets, audit |
| `02-cloud-infra.md` | K8s/GCP infra, network, backups |
| `03-data-encryption.md` | DB schemas, encryption-at-rest, PII, retention |
| `04-logging-monitoring.md` | Loggers, audit streams, alerting |
| `05-clients.md` | Desktop/mobile/extension client security |
| `06-agent-runtime.md` | Agent runtime, plugin sandbox, sub-agent isolation |
| `07-training-models.md` | Training pipeline, model artifacts, chip |
| `08-sdlc-supply-chain.md` | SDLC, CI/CD, secrets-in-repo, npm publish |
| `PLAN.md` | **This file** — consolidated overall assessment + phased implementation plan |
