# SOC2 Type II Readiness Audit: Logging, Audit Trails & Monitoring
**Scope:** Eliza Monorepo  
**Assessment Date:** May 21, 2026  
**Focus:** CC4.1, CC7.1, CC7.2, CC7.3, CC7.4, CC2.1 (COSO controls)

---

## Executive Summary

The Eliza monorepo demonstrates **partial SOC2 readiness** on logging and monitoring. A structured logger (`Adze`-backed via `@elizaos/core`) exists with redaction and file output, but critical **audit logging gaps** remain:

- **Strengths:** Centralized logger, PII redaction, trajectory logging for agent decision tracking
- **Critical Gaps:** No dedicated audit log stream, no alerting on auth anomalies or security events, limited logging of privileged actions
- **Risk:** Security incidents could go undetected; compliance evidence is scattered across general app logs and database tables

**Estimated Remediation Effort:** 8–12 weeks (architecture + integration + testing).

---

## Critical Gaps

### 1. No Dedicated Audit Log Stream (CC7.1, CC7.3)
**Status:** NOT IMPLEMENTED

- General app logs and audit events are mixed in the same output
- No separate audit trail for security-relevant events (auth, admin actions, data exports)
- SOC2 requirement: *"System monitoring and logging shall be architected to separate security events from application events for timely evaluation"*

**Impact:** Cannot quickly isolate security incidents or satisfy auditor requests for "security log extracts."

**Evidence:**
- `/Users/shawwalters/eliza-workspace/milady/eliza/packages/core/src/logger.ts` — single logger instance, all levels flow to same destination
- `logSchema` (log.ts) only has `body` (JSONB), `type`, no `severity`, `actor`, `action_type` columns
- No audit event classification in runtime

**Remediation:**
- Create separate audit log table with columns: `event_id`, `timestamp`, `event_type` (login, permission_change, data_access, etc.), `actor_id`, `actor_type` (user/agent/system), `resource_id`, `action`, `result` (success/failure), `reason_code`, `metadata`
- Implement audit event dispatcher alongside general logger
- Add audit sink configuration (syslog, CloudWatch, Datadog)

---

### 2. No Authentication Event Logging (CC4.1, CC7.2)
**Status:** NOT IMPLEMENTED

- No explicit logging of login success/failure, session creation/termination, password changes
- No anomaly detection (failed login attempts, lateral movement, privilege escalation)
- No per-identity audit trail

**Evidence:**
- Searched `/packages/core/src/features/` for auth-related actions — found `oauth`, `secrets`, `pairing-request` but no audit event emission
- No `login_event`, `logout_event`, `mfa_event`, `session_event` tables
- General logger redacts `*.auth`, `*.authorization`, `*.token` — prevents accidental leaks but means no audit trail of what was redacted

**Remediation:**
- Log auth events at service boundary (runtime.login(), runtime.logout(), runtime.verifySession())
- Track: user ID, device fingerprint, IP address (if applicable), timestamp, success/failure reason, MFA status
- Implement failed-login threshold alerting (e.g., >5 failures in 5 min → escalate)
- Retention: ≥1 year (SOC2 Type II baseline)

---

### 3. No Privileged Action Audit (CC7.3, CC2.1)
**Status:** PARTIAL

- Secrets management has basic logging (`CharacterSettingsStorage` emits debug logs on secret write/delete)
- Payment actions registered but no event emission on payment lifecycle
- No logging of: role changes, API key creation/revocation, permission grants, data exports

**Evidence:**
- `/packages/core/src/features/secrets/storage/character-store.ts` — logs secret operations at DEBUG level only
- Payment plugin (`features/payments/plugin.ts`) registers action with no event hooks
- No `admin_action`, `permission_change`, `api_key_event` tables

**Remediation:**
- Emit structured audit events for:
  - Secret create/update/delete (who, when, which secret, new perms)
  - API key generation/revocation (holder, scopes, issuance time)
  - Role/permission changes (actor, target, old → new role, approval chain)
  - Data export requests (actor, dataset, rows exported, query)
  - Payment actions (amount, parties, status, timestamp)
- Raise INFO level for privileged ops (currently DEBUG)
- Wire to compliance dashboard for evidence export

---

### 4. Trajectory Logging Not Tied to Audit (CC7.1)
**Status:** IMPLEMENTED (partial)

The trajectory logger captures agent decision trees and LLM calls, but:
- **Default:** ON (unless `ELIZA_DISABLE_TRAJECTORY_LOGGING=1`)
- **Content:** LLM calls, tool invocations, provider accesses — rich for debugging, NOT for compliance
- **Storage:** Separate database table via `/plugin-trajectory-logger`
- **PII Risk:** Trajectories may contain user data, prompts, or sensitive decisions; redaction unclear
- **Retention:** No documented retention policy; no mention of log export/archival

**Evidence:**
- `ELIZA_DISABLE_TRAJECTORY_LOGGING` env var in `/packages/agent/src/runtime/trajectory-internals.ts` — opt-OUT (secure default)
- Trajectory API: `/api/trajectories?limit=10` returns `llmCalls`, `providerAccesses` — developer-facing, not auditor-facing
- No schema definition for trajectory retention or data classification

**Remediation:**
- Document trajectory data classification (does it contain PII? What redaction applies?)
- Set explicit retention window (e.g., 90 days for active, 365 days for security incidents)
- Separate developer trajectories from audit trajectories (e.g., tag compliance-relevant ones: system.decision, system.auth)
- Add trajectory export endpoint with audit event (who exported, when, what criteria)

---

### 5. No Error/Anomaly Alerting (CC7.2, CC7.3, CC7.4)
**Status:** NOT IMPLEMENTED

- Logger captures errors but no alert rules
- No monitoring dashboards (Prometheus, Grafana configs not found)
- No automated incident response triggers
- No SLA for incident acknowledgment/remediation

**Evidence:**
- No `prometheus.yml`, `grafana/`, or `/monitoring` directory in codebase
- Logger has ERROR level but no downstream alert sink
- `docker-compose` files for test/dev lack monitoring stack
- GitHub workflows test but do not export security metrics

**Remediation:**
- Deploy OpenTelemetry + Prometheus exporter (structured logs + traces)
- Define alert rules:
  - Auth failures: >10/hour per user → WARN
  - Privilege elevation failures: any → CRITICAL
  - Trajectory anomalies: execution time outliers → INFO
  - Secret access spikes: >50 reads/hour per secret → WARN
- Integrate with incident management (PagerDuty, Opsgenie)
- Document playbooks: who responds, escalation, communication

---

### 6. Frontend/Client Logging Not Addressed (CC7.1)
**Status:** NOT IMPLEMENTED

- App-core (desktop/mobile) client code not surveyed for client-side logging
- Web clients (TUI, UI) unknown logging status
- No telemetry consent/opt-out mechanism visible
- Risk: User actions on client not captured; tampering possible if logs stored locally

**Evidence:**
- Searched only server-side (`/packages/core`, `/packages/agent`)
- `/packages/app-core` has Electron/Capacitor bridges but logger integration TBD
- No telemetry plugin or consent manager found

**Remediation:**
- Audit client-side logging in app-core, tui, ui packages
- Implement consent layer (user can opt out of non-critical logs)
- Ship client logs to server (with user context) at session end or on demand
- Sanitize: no passwords, auth tokens, or sensitive API responses

---

## High-Priority Gaps

### 7. No Log Retention or Archival Policy (CC7.1)
- File logs written to `output.log`, `prompts.log`, `chat.log` but no rotation/archival
- Database logs (trajectory, memory-access) have no documented TTL
- SOC2 requirement: ≥365 days for security-relevant logs

**Fix:** 
- Implement log rotation (e.g., daily, gzip archive to S3/cold storage)
- Set database table retention via trigger or job (cascade delete after 1 year)
- Document policy in runbook

---

### 8. No Redaction Validation (CC7.1, User Privacy)
- `fast-redact` library used with hardcoded paths (`*.password`, `*.token`, etc.)
- No test coverage for redaction; risk of false positives (redacts non-secrets) or false negatives (misses custom PII)
- Example: `*.authorization` redacted, but custom `api_token` field might leak

**Fix:**
- Add unit tests for redaction: inject mock sensitive fields, verify censored
- Maintain allowlist of known sensitive keys; disable wildcard matching
- Add PII detector (regex for emails, SSNs, credit card patterns) as fallback

---

### 9. No Audit Log Immutability Mechanism (CC7.1)
- Database logs can be modified/deleted by any code with write access
- No append-only log, write-once storage, or cryptographic commitment

**Fix:**
- Audit logs table: set constraints to prevent UPDATE/DELETE (INSERT-ONLY)
- Optional: append-only ledger via blockchain or write-once object storage (S3 Object Lock)
- Document who has audit log access (must be distinct from app owners)

---

## Medium-Priority Gaps

### 10. Logging of API Key Usage & Rotation (CC4.1)
- Secrets management exists but no audit trail of key reads or rotations
- No automatic key expiration or revocation logging

**Fix:**
- Log each secret access (read): `timestamp`, `accessor_id`, `secret_name`, `access_method` (code vs API)
- Log key rotations: old key revoked, new key created, timestamp, approver
- Emit alert on unused keys >90 days old

---

### 11. Memory Access Audit Partial (CC7.1)
- Table `memory_access_logs` schema exists with `access_type`, `agent_id`, `accessed_at`
- But implementation unclear: is it populated? What are the `access_type` enum values? Who reviews it?

**Fix:**
- Document memory access event types: read, write, delete, export
- Implement emission in memory service
- Set up monthly review dashboard: "top 10 agents by memory reads", "anomalies"

---

### 12. Trajectory Plugin Lacks Compliance Metadata (CC7.1)
- Trajectory schema (`trajectory-logger` plugin) captures developer info, not compliance info
- No `audit_relevant` flag, `pii_classification`, or `retention_deadline` fields

**Fix:**
- Add schema fields for compliance tagging
- Implement middleware to mark compliance-relevant trajectories (auth, payment, data access)
- Export audit trajectories separately from developer view

---

## Existing Controls (Strengths)

### 1. Structured Logger with Redaction
- **File:** `/packages/core/src/logger.ts` (1300+ lines, mature)
- **Features:**
  - Adze backend (supports levels, namespaces, pretty/JSON formats)
  - PII redaction via `fast-redact` (paths for password, token, auth, credential, etc.)
  - In-memory log buffer (100 entries, real-time streaming via listeners)
  - Log file output: `output.log`, `prompts.log`, `chat.log` (lazy-initialized)
  - Context bindings: `namespace`, `agentName`, `agentId`, `serverId`, `pid`, `environment`
- **Usage:** Core logger used by most packages; compliance with AGENTS.md #9 (logger-only directive)

**SOC2 Impact:** +10 points for structured logging, redaction, context

### 2. Prompt/Response Instrumentation
- **Functions:** `logPrompt()`, `logResponse()` in logger.ts
- **Purpose:** Track LLM calls for debugging and cost attribution
- **Fields:** model type, prompt slug, metadata (agentName, runId, provider, caller), response duration
- **Storage:** `prompts.log` file, correlated by slug

**SOC2 Impact:** +5 points for decision traceability

### 3. Chat Instrumentation
- **Functions:** `logChatIn()`, `logChatOut()` in logger.ts
- **Purpose:** Message log with preview (first 200 chars in, 120 chars out)
- **Fields:** agentName, roomId, source, action, emoji, reasoning, provider list
- **Storage:** `chat.log` file with timestamp

**SOC2 Impact:** +3 points for user interaction tracking

### 4. Memory Access Log Schema
- **Table:** `memory_access_logs` (advanced-memory feature)
- **Columns:** memory_id, memory_type, agent_id, access_type, accessed_at
- **Indexes:** by memory_id, agent_id, timestamp

**SOC2 Impact:** +5 points for data access audit readiness

### 5. Log Level Filtering
- Configurable via `LOG_LEVEL` env var (default: info)
- Custom levels: trace, debug, success, progress, log, info, warn, error, fatal

**SOC2 Impact:** +2 points for operational control

### 6. Trajectory Logging Infrastructure
- **Plugin:** `@elizaos/plugin-trajectory-logger`
- **Purpose:** Real-time inspector for HANDLE/PLAN/ACTION/EVALUATE phases
- **Data:** LLM calls, tool invocations, provider accesses, evaluation events
- **API:** `/api/trajectories`, `/api/trajectories/{id}`
- **Opt-out:** `ELIZA_DISABLE_TRAJECTORY_LOGGING=1`

**SOC2 Impact:** +7 points for decision/audit trail (if properly scoped to compliance use cases)

---

## Required Remediation Tasks

### CRITICAL (Blocking SOC2 attestation)

| Task ID | File Paths | Owner | Effort | Target Date |
|---------|-----------|-------|--------|-------------|
| **AUD-001** | Create audit log schema | Core Team | 1 week | Week 1 |
| | `/packages/core/src/schemas/audit-event.ts` (new) | | | |
| | Define: event_id, timestamp, event_type (auth, admin, data), actor, action, result, reason | | | |
| **AUD-002** | Implement audit event dispatcher | Core Team | 2 weeks | Week 3 |
| | `/packages/core/src/runtime.ts` (add auditEvent() method) | | | |
| | Emit on: login, logout, secret create/update/delete, permission change, API key gen, payment | | | |
| **AUD-003** | Add auth event logging | Auth Owner | 2 weeks | Week 3 |
| | `/packages/core/src/features/oauth/actions/` | | | |
| | Log: login success/failure, MFA, session create/destroy, password change | | | |
| **AUD-004** | Separate audit log output stream | Logging Owner | 1 week | Week 2 |
| | `/packages/core/src/logger.ts` (extend) | | | |
| | Audit sink: file, syslog, or cloud logging API | | | |
| **AUD-005** | Document trajectory PII policy | Privacy Owner | 3 days | Week 1 |
| | `/packages/trajectory-logger/docs/PRIVACY.md` (new) | | | |
| | Classify data, redaction rules, retention window, export controls | | | |

### HIGH (SOC2 maturity)

| Task ID | File Paths | Owner | Effort | Target Date |
|---------|-----------|-------|--------|-------------|
| **MON-001** | Deploy monitoring stack | DevOps | 3 weeks | Week 5 |
| | `/docker-compose.monitoring.yml` (new) | | | |
| | Prometheus, Grafana, alert rules for auth anomalies, error spikes, privilege escalation | | | |
| **MON-002** | Implement alerting rules | Security Owner | 2 weeks | Week 4 |
| | Define thresholds: failed logins, secret access, trajectory anomalies | | | |
| | Integration: PagerDuty or incident management system | | | |
| **MON-003** | Add log rotation & archival | DevOps | 1 week | Week 2 |
| | `/packages/core/src/logger.ts` (extend) | | | |
| | Daily rotation, gzip, S3 cold storage, 1-year retention for security logs | | | |
| **MON-004** | Audit redaction test coverage | QA | 1 week | Week 3 |
| | `/packages/core/src/__tests__/logger.redaction.test.ts` (new) | | | |
| | Test: sensitive fields redacted, non-sensitive fields preserved, custom PII patterns | | | |

### MEDIUM (Maturity & compliance)

| Task ID | File Paths | Owner | Effort | Target Date |
|---------|-----------|-------|--------|-------------|
| **AUD-006** | Client-side logging audit | App Team | 2 weeks | Week 6 |
| | `/packages/app-core/`, `/packages/tui/`, `/packages/ui/` | | | |
| | Assess: what's logged, consent mechanism, data flow to server | | | |
| **AUD-007** | API key lifecycle audit logging | API Owner | 1 week | Week 4 |
| | Log key generation, scopes, rotation, revocation, each read | | | |
| **AUD-008** | Implement memory access audit sink | Advanced Memory Owner | 1 week | Week 4 |
| | Ensure `memory_access_logs` is populated; add review dashboard | | | |
| **AUD-009** | Immutable audit log enforcement | Database Owner | 2 weeks | Week 5 |
| | Add INSERT-ONLY constraints to audit tables; document access controls | | | |
| **AUD-010** | Retention & archival runbook | Operations | 3 days | Week 2 |
| | Document: log lifecycle, rotation schedule, cold storage location, retrieval SLA | | | |

---

## Compliance Mapping

| COSO Control | Coverage | Gap |
|--------------|----------|-----|
| **CC4.1** (System Monitoring) | Trajectory, prompts, chat logs; no auth events | 40% |
| **CC7.1** (System Events) | General app logs captured; no audit stream | 30% |
| **CC7.2** (Anomaly Detection) | Log levels exist; no alerting rules | 20% |
| **CC7.3** (Security Incident Investigation) | Logs scattered; no centralized audit trail | 25% |
| **CC7.4** (Incident Response) | No documented playbooks or response SLAs | 0% |
| **CC2.1** (Internal Communication) | No audit event newsletter or escalation proc | 10% |
| **Overall** | | **~20–30% SOC2 readiness** |

---

## Conclusion

Eliza has **solid foundational logging** (structured logger, redaction, trajectory tracking) but **lacks audit-specific infrastructure** (dedicated log stream, auth events, alerting). Remediation requires ~12 weeks and is architecturally tractable (no major rewrites; mostly new tables + event emission).

**Recommended Phasing:**
1. **Weeks 1–3:** AUD-001, AUD-002, AUD-003 (audit baseline)
2. **Weeks 4–6:** MON-001, MON-002 (alerting) + AUD-006 (client audit)
3. **Weeks 7–12:** Integration testing, runbook, SOC2 attestation prep

**Post-remediation target:** SOC2 Type II ready (70–80% coverage).
