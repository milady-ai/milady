# SOC2 Type II Readiness Audit — Eliza Agent Runtime & Plugin System

**Audit Date:** 2026-05-21  
**Scope:** Agent runtime (packages/agent), Core runtime, Plugin ecosystem (host shim, worker runtime, remote manifest), Sub-agent orchestration (Claude Code), Connector security  
**Assessment Level:** Comprehensive

---

## Executive Summary

The Eliza agent runtime and plugin system demonstrate a **moderately mature security posture** with several well-implemented controls but significant **gaps in supply-chain integrity, sandboxing, and action/provider invocation integrity**. 

**Key Findings:**
- ✅ Strong input validation on plugin manifests and permissions framework
- ✅ Privacy controls for connector accounts (role-based, owner-only default)
- ✅ SSRF/DNS rebinding defenses on user-supplied URLs
- ✅ Explicit permission allowlist model for plugin capabilities (host & Bun permissions)
- ⚠️ **CRITICAL:** No cryptographic signature verification on plugin artifacts
- ⚠️ **CRITICAL:** Sub-agent (Claude Code) spawned with user's environment variables — no sanitization, no FS scope limits
- ⚠️ **CRITICAL:** Tool invocation from LLM output → action dispatch has no prompt-injection mitigations
- ⚠️ **HIGH:** Plugin-worker RPC has no authentication — host-side permission enforcement only
- ⚠️ **HIGH:** Vision/screen-capture not verified as opt-in; MCP bridge endpoint trust model undefined
- ⚠️ **MEDIUM:** Skill loading does not verify integrity; "disable-model-invocation" policy has no enforcement hook
- ⚠️ **MEDIUM:** No structured audit logging for plugin permission grants or revocations
- ⚠️ **MEDIUM:** In-memory OAuth flow storage (fallback) with no secrets vault integration

---

## Critical Gaps

### 1. Plugin Supply-Chain Integrity (CC6.6, PI1.1)

**Finding:** No cryptographic signature verification on plugin installation.

- **Location:** `/packages/plugin-remote-manifest/src/types.ts` (lines 114–121)  
  Remote plugin artifact sources store `currentHash` (nullable) but **no verification** of hash against tarball on install.
  
- **Location:** `/packages/plugin-sub-agent-claude-code/src/sub-agent-service.ts` (line 94)  
  Sub-agent spawns with `binary: "claude"` — assumes PATH-based binary resolution with no integrity check.

- **Risk:** Attacker can:
  - Replace published plugin tarballs with backdoored versions if update server is compromised
  - MITM plugin downloads if TLS is bypassed
  - Substitute local `claude` binary on PATH during agent startup

- **Remediation:** 
  - Implement mandatory SHA-256 signature verification on artifact downloads
  - Pin expected hash in install record; reject on mismatch
  - Use OS-level subresource integrity (SRI) for tarball verification
  - Verify sub-agent binary path explicitly; fail if not in whitelisted locations

---

### 2. Sub-Agent Environment Isolation (CC6.1, CC6.6)

**Finding:** Claude Code subprocess spawned with full environment inheritance; no FS scope or syscall limits.

- **Location:** `/packages/plugin-sub-agent-claude-code/src/sub-agent-service.ts` (lines 93–99)
  ```typescript
  const proc = Bun.spawn({
    cmd: [binary, ...args],
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    cwd: params.cwd,
    // NO env filtering, NO seccomp, NO FS bind-mount
  });
  ```

- **Risk:** 
  - Sub-agent inherits **all parent's environment variables** → access to `GITHUB_TOKEN`, database credentials, wallet keys
  - No filesystem scope — can read/write anywhere the parent process can
  - No syscall filtering — can fork, exec, dlopen, ptrace
  - Prompt injection from LLM → arbitrary filesystem access

- **Impact:** CC6.1 (logical access) — **Compromised controls**  
  An attacker controlling the LLM can exfiltrate secrets from memory, modify production code, or escalate privileges via sub-agent.

- **Remediation:**
  - Filter environment: only pass explicitly whitelisted vars (e.g., `PATH`, `HOME`, `TMPDIR`)
  - Block all credential/token vars: `*TOKEN`, `*SECRET`, `*KEY`, `DATABASE_URL`, `WALLET_*`, etc.
  - Implement FS sandbox: chroot or equivalent, restrict to `{cwd, /tmp, ~/.cache}`
  - Use Bun worker or seccomp profile to block dangerous syscalls: `ptrace`, `fork` (if possible), `execve` (enforce argv[0] only)
  - Validate `cwd` parameter: must be within agent's workspace or known safe directory

---

### 3. Plugin-Worker RPC Lacks Authentication & Authorization (CC6.1, CC6.6)

**Finding:** Host-side worker RPC invocation assumes authenticated channel; no per-message auth tokens.

- **Location:** `/packages/plugin-worker-runtime/src/dispatch.ts` (lines 37–74)  
  Dispatcher receives `WorkerRpcMessage` and routes directly to handler registry keyed on `target`.  
  No validation that the message came from an authorized host, and no per-handler permission check.

- **Location:** `/packages/plugin-remote-manifest/src/types.ts` (lines 145–151)  
  `WorkerRpcMessage` contains `type`, `requestId`, `target`, `surface`, `args` — **no auth fields**.

- **Risk:**
  - A malicious plugin or compromised worker can inject fake `worker-rpc-result` messages claiming success for operations it never executed
  - Host assumes all RPC calls originate from the host itself — no validation of channel origin
  - Bridge endpoints (not fully mapped in this audit) may lack authentication

- **Remediation:**
  - Add optional `authToken` field to `WorkerRpcMessage` (HMAC-SHA256 over message + session key)
  - Validate token on dispatch; reject if missing or invalid
  - Implement per-session ephemeral keys; rotate on permission grant/revocation
  - Log all RPC invocations to audit trail

---

### 4. Tool Invocation from LLM Output Lacks Injection Defenses (CC6.6, PI1.1)

**Finding:** LLM-generated tool names and arguments flow directly into action dispatch with minimal sanitization.

- **Location:** `/packages/core/src/runtime/execute-planned-tool-call.ts` (lines 95–127)  
  Tool call name is matched against action list; arguments validated via `validateToolArgs()` but **no checks for:**
  - Prompt injection via tool name (e.g., name contains `<script>` or YAML markers)
  - SQL injection in numeric/string parameters (validation is type-only, not semantic)
  - Path traversal in file-like parameters

- **Location:** `/packages/core/src/actions.ts` (lines 1–100)  
  Action dispatch does not guard against:
  - Tool name collisions with built-ins or system commands
  - Parameter expansion via shell metacharacters (if action internally invokes `Bun.spawn`)

- **Risk:** If an LLM is jailbroken or adversarially prompted:
  - Call an action with name `"; rm -rf /"` if action names are not strictly validated
  - Pass file paths like `../../../etc/passwd` to actions that read files
  - Inject YAML/JSON syntax to escape parameter context

- **Remediation:**
  - Whitelist action names: alphanumeric + hyphens/underscores only
  - Escape/reject parameters containing shell metacharacters: `;`, `|`, `&`, `<`, `>`, backticks, `$(...)`
  - Validate file paths: must be within declared sandbox or fail explicitly
  - Add telemetry: log every tool invocation (name, args, result) for audit trail
  - Consider human-in-loop confirmation for high-risk actions (shell exec, file write, credential operations)

---

## High Gaps

### 5. Plugin Permission Grants Lack Enforcement (CC6.6, PI1.5)

**Finding:** Permission model defined but enforcement is incomplete.

- **Location:** `/packages/plugin-remote-manifest/src/permissions.ts` (lines 135–145)  
  `toBunWorkerPermissions()` converts grant to Bun worker perms, but **no call site found** that actually enforces these when spawning the worker.
  
  No evidence that `bun:read`, `bun:write`, `bun:env`, `bun:run` are passed to Bun as restrictions.

- **Location:** `/packages/plugin-remote-manifest/src/manifest.ts` (lines 51–69)  
  Permission diffing and consent requests are built, but **no enforcement hook** after user grants permission.

- **Risk:** 
  - Plugin requests `bun:run` but receives same access as one granted `bun:read`
  - Scope of host permissions (`"windows"`, `"tray"`, `"notifications"`, `"storage"`) not validated at invocation time

- **Remediation:**
  - Enforce Bun worker permissions at spawn time: pass to Bun runtime
  - Add per-host-permission gate at RPC dispatch: check `grantedPermissions` before allowing action
  - Example: `invoke("tray:setTray", payload)` checks `grantedPermissions.host.tray === true` first

---

### 6. Vision/Screen-Capture Not Verified as Opt-In (CC6.6, PI1.2)

**Finding:** User feedback notes that vision must be opt-in; no implementation found enforcing this.

- **Search Result:** No references to `vision`, `screenshot`, `screen-capture`, or similar in core runtime or plugin system (grep yielded only unrelated "provisioning" results).

- **Risk:** 
  - Sub-agent (Claude Code) or plugins may capture screen without user consent
  - MCP tools (mcp__claude-in-chrome__*) may invoke browser tools that expose sensitive UI
  - No telemetry tag or audit log indicating vision was used

- **Remediation:**
  - Add `vision_enabled` flag to sub-agent invocation context
  - Default to **false** (opt-in only via explicit user grant)
  - At sub-agent invoke, check `grantedPermissions.host.screen_capture === true` or similar
  - Emit audit event when vision is granted/used
  - Enforce in MCP bridge: screen tools blocked unless `vision_enabled === true`

---

### 7. Bridge Endpoints Lack Defined Authentication (CC6.1)

**Finding:** Plugin-host bridge RPC endpoints (if HTTP-based) lack authentication details.

- **Location:** `/packages/plugin-remote-manifest/src/types.ts` (lines 198–227)  
  Message types for host requests/responses, but **no session ID, auth token, or HMAC** in message envelope.

- **Risk:** 
  - If bridge exposes HTTP endpoints for plugin ↔ host communication, network sniffing/forgery is possible
  - Privilege escalation: low-level plugin RPC calling high-level host actions without auth check

- **Remediation:**
  - Add session-level authentication: each worker-host pair gets ephemeral token on bootstrap
  - Require token in every request/response message
  - Implement challenge-response or HMAC validation
  - Use TLS for any network transport (localhost or remote)

---

## Medium Gaps

### 8. Skill Integrity & Invocation Policy Not Enforced (PI1.1, PI1.5)

**Finding:** Skills loaded from disk without integrity check; invocation policies defined but not enforced.

- **Location:** `/packages/skills/src/loader.ts` (lines 76–117)  
  `loadSkillFromFile()` reads YAML frontmatter and file contents; **no hash/signature verification**, no write-protect flag.

- **Location:** `/packages/skills/src/types.ts` (lines 116–119)  
  `SkillInvocationPolicy` includes `disableModelInvocation` and `userInvocable` flags, but **no enforcement** at call site.

- **Risk:**
  - Attacker modifies skill on disk after install
  - Model invocation policy ignored; LLM can still invoke "disabled" skills
  - No provenance chain from skill creation to invocation

- **Remediation:**
  - Compute SHA-256 of skill file on load; store in registry
  - On each invocation, verify hash; reject if modified
  - Add invocation policy gate: check `disableModelInvocation` before allowing LLM to call skill
  - Log skill invocation attempts (especially forbidden ones)

---

### 9. OAuth Flows Stored In-Memory Without Secrets Vault (PI1.4, CC6.1)

**Finding:** Fallback connector account storage uses in-memory Map; no encrypted storage or HSM integration.

- **Location:** `/packages/core/src/connectors/account-manager.ts` (lines 553–593)  
  `InMemoryConnectorAccountStorage` is marked as a **fallback** "for tests and for hosts that have not yet installed the durable connector-account storage service."  
  Stores OAuth tokens in plaintext `Map<string, ConnectorOAuthFlow>` with `codeVerifier?.` exposed.

- **Risk:**
  - If fallback is used in production, OAuth tokens and code verifiers are in process memory
  - Memory dump/core file leak exposes all connected accounts
  - No rotation or expiry management

- **Remediation:**
  - Remove in-memory storage from production paths; enforce durable storage requirement
  - Encrypt OAuth tokens at rest: AES-256-GCM with per-account key
  - Integrate with system secret store: macOS Keychain, Linux libsecret, Windows DPAPI
  - Implement token rotation on refresh and expiry eviction

---

### 10. Connector Account Audit Logging Not Implemented (CC8.1, PI1.4)

**Finding:** No structured audit logs for connector account operations.

- **Location:** `/packages/core/src/connectors/account-manager.ts`  
  Methods like `upsertAccount()`, `deleteAccount()`, `startOAuth()`, `completeOAuth()` have no log emission.

- **Risk:** 
  - Cannot detect unauthorized account modifications
  - No evidence trail for compliance audits (SOC2, HIPAA if applicable)
  - Cannot correlate account changes with API access

- **Remediation:**
  - Emit audit events:
    - `connector.account.created`: provider, accountId, role, timestamp
    - `connector.account.granted_permission`: provider, accountId, scope, timestamp, grantor
    - `connector.account.revoked`: provider, accountId, timestamp, reason
    - `connector.account.deleted`: provider, accountId, timestamp, actor
  - Store in immutable log (append-only database or syslog)
  - Include requester identity, timestamp, and change diff

---

### 11. No Plugin Update Verification (CC8.1, PI1.2)

**Finding:** Plugin updates fetched from network without integrity verification.

- **Location:** `/packages/plugin-remote-manifest/src/types.ts` (lines 115–121)  
  `RemotePluginInstallSource` with `kind: "artifact"` has optional `updateLocation` but **no hash or signature chain** across updates.

- **Risk:**
  - Attacker can MitM plugin update and inject backdoor
  - No way to verify update came from legitimate publisher

- **Remediation:**
  - Require signed manifests: publish manifest + signature (RSA-2048 or EdDSA) alongside artifact
  - Verify signature before updating permissions or code
  - Maintain publisher key registry; pin keys in agent config

---

### 12. No Telemetry for Plugin Actions (CC8.1, PI1.1)

**Finding:** Plugin action invocations and LLM tool calls not centrally logged.

- **Location:** `/packages/core/src/runtime/execute-planned-tool-call.ts`  
  Action handler is invoked with no mandatory telemetry hook for audit trail.

- **Risk:**
  - Malicious plugin actions leave no trace
  - Cannot correlate user request → LLM tool → plugin action for compliance

- **Remediation:**
  - Wrap every action handler invocation with telemetry:
    - Event: `action.invoked` (actionName, params, actor, timestamp)
    - Event: `action.completed` (actionName, result, duration, status)
  - Store in centralized audit log, not just process logs

---

## Existing Controls

### ✅ Plugin Manifest Validation (CC6.6)

**Control:** Comprehensive JSON schema validation on plugin manifests.

- **Location:** `/packages/plugin-remote-manifest/src/validation.ts` (lines 20–150+)  
  Validates required fields, types, ID format, permission schema, view/worker paths.
  
- **Strength:** Rejects malformed manifests before installation; prevents typos and injection.

---

### ✅ Plugin Permission Framework (CC6.1, PI1.5)

**Control:** Explicit allowlist of host and Bun permissions; user consent before grant.

- **Location:** `/packages/plugin-remote-manifest/src/permissions.ts` (lines 29–112)  
  Normalized permission grants, diffing against previous, flattening to tags for UI presentation.

- **Strength:** Users see exactly what permissions are requested; plugins cannot escalate silently.

---

### ✅ Connector Account Privacy Controls (CC6.1)

**Control:** Owner-only default privacy level for connector accounts.

- **Location:** `/packages/core/src/connectors/privacy.ts` (lines 15–49)  
  Privacy levels: `owner_only` (default), `team_visible`, `semi_public`, `public`.  
  Role-based gating on account data visibility.

- **Strength:** Prevents team members from seeing owner's connected accounts by default.

---

### ✅ SSRF & DNS Rebinding Defenses (CC6.6)

**Control:** Multi-layer URL validation blocking private IPs and resolving hostnames.

- **Location:** `/packages/docs/security.md` (lines 28–63)  
  Blocks file://, ftp://, and private IP ranges; verifies DNS resolution against blocklist.

- **Strength:** Prevents agent from accessing internal services or cloud metadata endpoints.

---

### ✅ Environment Variable Blocklist (CC6.1)

**Control:** Blocks setting sensitive env vars via API.

- **Location:** `/packages/docs/security.md` (lines 67–97)  
  Blocklist includes `LD_PRELOAD`, `NODE_OPTIONS`, `*_PRIVATE_KEY`, `*_TOKEN`, database URLs.

- **Strength:** Prevents API user from injecting credentials or code via env vars.

---

### ✅ Tool Argument Validation (PI1.1)

**Control:** Type validation and schema checking on tool parameters.

- **Location:** `/packages/core/src/runtime/execute-planned-tool-call.ts` (lines 115–126)  
  Validates arguments via `validateToolArgs()` before invocation.

- **Strength:** Catches type mismatches and missing required params; fails safely.

---

### ✅ Connector Role-Based Access Control (CC6.1)

**Control:** Role field on connector accounts; read-only role restrictions.

- **Location:** `/packages/core/src/connectors/oauth-role.ts` (lines 35–60)  
  Resolves requested OAuth role from metadata; defaults to `OWNER` if missing.

- **Strength:** Prevents privilege escalation via OAuth setup; enforces principle of least privilege.

---

## Required Remediation Tasks

### Priority 1 (Critical — Block Release)

1. **Implement Plugin Artifact Signature Verification**
   - Add RSA-2048 or EdDSA signature verification on plugin tarball downloads
   - Store publisher public key in manifest
   - Reject unsigned or invalid signatures
   - *Files:* `/packages/plugin-remote-manifest/src/store.ts`, new signature validation module

2. **Sanitize Sub-Agent Environment**
   - Filter environment variables before spawning Claude Code; allowlist only: `PATH`, `HOME`, `TMPDIR`, `LANG`
   - Block: `*TOKEN`, `*SECRET`, `*KEY`, `DATABASE_URL`, `WALLET_*`, credentials
   - Validate and restrict `cwd` to workspace or known safe directory
   - *Files:* `/packages/plugin-sub-agent-claude-code/src/sub-agent-service.ts`

3. **Add Plugin-Worker RPC Authentication**
   - Implement session-level HMAC validation for all worker RPC messages
   - Add `authToken` field to message envelope
   - Validate on dispatch; log failures
   - *Files:* `/packages/plugin-remote-manifest/src/types.ts`, `/packages/plugin-worker-runtime/src/dispatch.ts`

4. **Enforce Plugin Permission Grants**
   - Gate host RPC methods based on `grantedPermissions`
   - Check `bun:read`, `bun:write`, `bun:run` at dispatch time
   - Check `host:windows`, `host:tray`, etc. at invocation
   - *Files:* `/packages/plugin-worker-runtime/src/dispatch.ts`, new permission-gating middleware

5. **Add Tool Invocation Injection Defenses**
   - Whitelist action names (alphanumeric + `-_` only)
   - Escape/reject shell metacharacters in parameters
   - Validate file paths: no `../` or absolute paths outside workspace
   - Log all tool invocations (name, args, result)
   - *Files:* `/packages/core/src/runtime/execute-planned-tool-call.ts`, new parameter-validation module

### Priority 2 (High — Release Window)

6. **Implement Vision Opt-In Gating**
   - Add `vision_enabled` flag to sub-agent context; default **false**
   - Gate screen-capture tools in MCP bridge
   - Emit audit event when vision used
   - *Files:* `/packages/plugin-sub-agent-claude-code/`, new vision policy module

7. **Define & Enforce Bridge Authentication**
   - Add session-level auth tokens to all bridge messages
   - Implement HMAC or challenge-response validation
   - Require TLS for network transport
   - *Files:* `/packages/plugin-remote-manifest/src/types.ts`, bridge implementation (out of scope)

8. **Add Structured Connector Account Audit Logging**
   - Emit events for: created, permission granted, revoked, deleted
   - Include provider, accountId, actor, timestamp, change diff
   - Store in append-only log
   - *Files:* `/packages/core/src/connectors/account-manager.ts`, new audit-event emitter

9. **Enforce Skill Invocation Policy**
   - Verify `disableModelInvocation` before LLM-driven invocation
   - Reject if policy forbids model use
   - Log policy violations
   - *Files:* skill dispatcher (location unclear; may be in core or runtime)

### Priority 3 (Medium — Next Sprint)

10. **Migrate OAuth Storage to Secrets Vault**
    - Remove in-memory fallback from production path
    - Integrate with system secret store (Keychain/libsecret/DPAPI)
    - Encrypt tokens at rest
    - *Files:* `/packages/core/src/connectors/account-manager.ts`

11. **Implement Skill Integrity Verification**
    - Hash skills on load; store in registry
    - Verify hash on each invocation; reject if modified
    - *Files:* `/packages/skills/src/loader.ts`

12. **Add Plugin Update Signature Verification**
    - Require signed manifests for updates
    - Maintain publisher key registry
    - Verify before applying update
    - *Files:* `/packages/plugin-remote-manifest/src/store.ts` (update flow)

13. **Add Centralized Action Invocation Telemetry**
    - Emit `action.invoked` and `action.completed` events
    - Include actionName, params, actor, result, duration
    - Store in audit log
    - *Files:* `/packages/core/src/runtime/execute-planned-tool-call.ts`

---

## Recommendations

1. **Establish Plugin Publisher Verification Program**
   - Require verified publisher identity (GitHub org, npm account, signed public key)
   - Maintain registry of approved publishers
   - Warn on unverified plugin installation

2. **Implement Audit Trail Dashboard**
   - Real-time visibility into plugin installs, permission grants, action invocations
   - Query interface for compliance investigations
   - Retention: 1 year minimum

3. **Deploy Runtime Security Monitoring**
   - Monitor sub-agent syscalls for suspicious patterns (fork, ptrace, execve outside whitelist)
   - Alert on file access outside declared sandbox
   - Alert on unexpected network connections

4. **Conduct Plugin Security Training**
   - Document secure coding guidelines for plugin authors
   - Highlight risks: injection, privilege escalation, data exfiltration
   - Provide security review checklist for plugin submission

5. **Implement Staged Rollout for Plugin Updates**
   - Require user confirmation or enterprise admin approval before auto-update
   - Staged rollout: 10% → 25% → 50% → 100% over 1 week
   - Rollback mechanism if errors spike

---

## Conclusion

The Eliza agent runtime has implemented several strong foundational security controls (manifest validation, permission framework, SSRF defenses). However, **supply-chain integrity, sub-agent sandboxing, and action invocation injection defenses are critically incomplete**. 

Remediation of Priority 1 items is **mandatory before SOC2 Type II attestation**. Priorities 2 & 3 should be completed within 2 sprints to achieve production-grade security posture.

---

**Report Generated:** 2026-05-21  
**Audit Scope:** Read-only analysis of source code patterns, configuration, and design  
**Classification:** Internal — Shared with Security & Engineering Teams
