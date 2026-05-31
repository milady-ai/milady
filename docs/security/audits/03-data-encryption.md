# SOC2 Audit Report 03 — Data, DB, Encryption, PII

*Captured from sub-agent return summary; the agent did not write to disk directly.*

## Executive Summary

Strong foundational encryption and key-management patterns (multi-tier vault, org-scoped DEKs, AES-256-GCM, field-level encryption for some sensitive fields). However, critical gaps in plaintext-at-rest storage, TLS enforcement on DB connections, data-retention enforcement, and GDPR deletion workflow must close before SOC2 Type II.

## Critical Gaps (P0)

1. **Plaintext API keys in DB** — `eliza/packages/cloud-shared/src/db/schemas/api-keys.ts:28` stores full plaintext `key` field. Violates C1.1, CC6.1. Fix: encrypt at rest using org DEK; keep only hashed lookup column.
2. **No TLS enforcement on DB connections** — `eliza/packages/cloud-shared/src/db/client.ts:127-183` does not force `sslmode=require` for remote Postgres. Violates CC6.7. Fix: enforce `sslmode=require` default for non-localhost connections.
3. **Incomplete field-level encryption** — PII fields stored plaintext across:
   - `platform-credentials.ts`: `platform_user_id`, `platform_email`, `platform_display_name`
   - `users.ts`: `email`, `phone_number`, `telegram_id`, `discord_id`, `wallet_address`
   - `conversations.ts:82`: message `content`
   - `secrets.ts`: some OAuth credential types lack encryption wrapper
   Violates C1.1, P. Fix: expand field-level encryption to all PII; publish data dictionary.
4. **No data retention / soft-delete pattern** — schemas use hard cascade only; no `deleted_at`; no documented retention period; no scheduled GDPR/CCPA purge. Violates C1.2, P. Fix: soft-delete + retention-policy enforcement.
5. **Audit log retention unbounded** — `secrets.ts:232-265` `secret_audit_log` has no `expires_at`. Define retention (recommend 7 years for security-relevant audit events; ≥365 days minimum for SOC2).

## High Gaps (P1)

6. **Master key management gaps** — `eliza/packages/vault/src/master-key.ts` has OS-keychain → passphrase → error fallback, but no documented rotation, no KMS integration for prod, `SECRETS_MASTER_KEY` lifecycle unspecified. Fix: integrate AWS KMS / GCP KMS / Neon Keys; document rotation.
7. **Local-first data leakage risk** — `app-core/src/security/cloud-secret-store.ts` and `agent/src/runtime/trajectory-storage.ts` write PII, secrets, full LLM transcripts to local PGlite at `.eliza/.pgdata` **unencrypted**. Trajectory logging captures full prompts without redaction. Fix: encrypt local DBs; PII scrubbing on trajectory write; default off in prod builds (already disabled in tests).
8. **No comprehensive user-deletion workflow** — cascade-on-FK exists but no service for consent/audit/anonymization, no soft-delete window, anonymous-sessions may retain user-linked data. Fix: deletion service with soft-delete window → anonymize → hard purge; auditable.
9. **CLI auth plaintext keys** — `cli-auth-sessions.ts` `api_key_plain` "deleted after retrieval" but no TTL job; comment unimplemented. Fix: single-use in-memory delivery via short-lived signed token.

## Medium Gaps (P2)

10. **No published encryption schema / data dictionary**.
11. **Backup encryption status undocumented** (`0106_…`, `0113_ensure_agent_sandbox_backups.sql` refer to backups but no policy).
12. **No CI guard for migration safety** (no `IF NOT EXISTS` linter, no rollback test).
13. **PII in trajectories / logs not sanitized**.

## Existing Controls (Keep)

- Org-scoped DEKs (`organization-encryption-keys.ts`), AES-256-GCM with nonce/auth-tag.
- Secrets table separation of `encrypted_value`/`dek`/`nonce`/`auth_tag` (`secrets.ts:87-91`).
- Vault crypto: AES-256-GCM, 12-byte nonce, 16-byte tag, AAD binding (`vault/src/crypto.ts`).
- Secret-access audit log with actor/IP/UA/endpoint.
- FK cascades for relational cleanup.
- API-key hashed lookup column (kept — just need to drop the plaintext companion).

## Remediation Tasks

| Pri | Task | Effort |
|---|---|---|
| P0 | Encrypt API key values; drop plaintext column | 2d |
| P0 | Enforce `sslmode=require` on all remote DB conns | 1d |
| P0 | Encrypt PII fields (email, phone, wallet, platform IDs, message content) | 3d |
| P0 | Set audit-log retention & purge job | 1d |
| P0 | Soft-delete on user-scoped tables + retention policy | 3d |
| P1 | KMS integration + master-key rotation procedure | 3d |
| P1 | Encrypt local PGlite stores; redact trajectory captures | 2d |
| P1 | GDPR/CCPA DSR (deletion) workflow + endpoint | 2d |
| P1 | Remove `api_key_plain` from cli-auth-sessions | 1d |
| P2 | Data dictionary doc | 1d |
| P2 | Backup encryption / recovery docs + restore test | 1d |
| P2 | Trajectory PII-scrubber | 1d |
