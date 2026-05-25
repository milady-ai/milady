# Steward KMS Endpoints — Required for Eliza SOC2

This is the contract Eliza's `@elizaos/security/kms/steward-adapter` expects Steward to expose so production deployments can use Steward as their KMS. Track this as a parallel work-item in the Steward repo; once these endpoints exist the Eliza adapter switches from `NotImplementedError` stubs to live calls.

## Authentication

Reuse Steward's existing credential-proxy auth. Two supported modes:
- **Short-lived OIDC bearer** (preferred): caller (Eliza Cloud API or local agent) presents an OIDC token; Steward validates the issuer + audience claim. Token TTL ≤15 min, refreshable.
- **mTLS** for service-to-service calls inside a private network.

Every endpoint records an audit event in Steward's own audit log (already a Steward concern). Caller correlation id is propagated via `X-Request-Id` and recorded.

## Resource model

A **Key** is identified by a free-form `key_id` string namespaced by the caller. Eliza's namespace convention:
- `system:<purpose>` — caller-wide system keys (one per Steward tenant).
- `org:<org_id>/<purpose>` — per-customer-org keys.
- `user:<user_id>/<purpose>` — per-end-user keys.

A key has one or more **versions**; `current` always points to the highest-numbered version. Older versions remain decrypt-capable until explicitly deactivated. Each version pins a cipher: AES-256-GCM (default), HMAC-SHA256, Ed25519, or RSA-PSS-SHA256.

## Endpoints

All paths are under `/v1/kms/`. All request/response bodies are JSON; binary fields are base64-encoded.

### `POST /v1/kms/keys`
Create or fetch a key (idempotent on `key_id`).
```jsonc
// Request
{
  "key_id": "org:abc/dek",
  "cipher": "aes-256-gcm",          // aes-256-gcm | hmac-sha256 | ed25519 | rsa-pss-sha256
  "rotation_days": 365              // optional; Steward schedules an internal rotation hint
}
// Response
{ "key_id": "org:abc/dek", "version": 1, "cipher": "aes-256-gcm", "created_at": "..." }
```

### `POST /v1/kms/keys/:key_id/rotate`
Mint the next version. Old versions remain usable for decrypt/verify.
```jsonc
// Response
{ "key_id": "...", "previous_version": 3, "new_version": 4 }
```

### `GET /v1/kms/keys/:key_id/versions`
List versions.
```jsonc
// Response
{ "key_id": "...", "versions": [{"version": 1, "active": true, "created_at": "..."}, ...] }
```

### `POST /v1/kms/keys/:key_id/encrypt`
AES-256-GCM only.
```jsonc
// Request
{
  "plaintext_b64": "...",
  "aad_b64": "...",          // optional but mandatory in Eliza policy
  "version": 4               // optional; default = current
}
// Response
{
  "ciphertext_b64": "...",
  "nonce_b64": "...",        // 12 bytes
  "auth_tag_b64": "...",     // 16 bytes
  "key_id": "...",
  "key_version": 4
}
```

### `POST /v1/kms/keys/:key_id/decrypt`
```jsonc
// Request
{
  "ciphertext_b64": "...",
  "nonce_b64": "...",
  "auth_tag_b64": "...",
  "aad_b64": "...",          // must match encrypt-time AAD
  "version": 4               // required; callers store key_version with ciphertext
}
// Response
{ "plaintext_b64": "..." }
```

### `POST /v1/kms/keys/:key_id/hmac`
HMAC-SHA256.
```jsonc
// Request
{ "data_b64": "...", "version": 1 }
// Response
{ "tag_b64": "...", "key_id": "...", "key_version": 1 }
```

### `POST /v1/kms/keys/:key_id/hmac/verify`
Constant-time verification.
```jsonc
// Request
{ "data_b64": "...", "tag_b64": "...", "version": 1 }
// Response
{ "valid": true }
```

### `POST /v1/kms/keys/:key_id/sign`
```jsonc
// Request
{ "data_b64": "...", "algorithm": "ed25519", "version": 1 }
// Response
{ "signature_b64": "...", "algorithm": "ed25519", "key_id": "...", "key_version": 1 }
```

### `POST /v1/kms/keys/:key_id/verify`
```jsonc
// Request
{ "data_b64": "...", "signature_b64": "...", "algorithm": "ed25519", "version": 1 }
// Response
{ "valid": true }
```

### `GET /v1/kms/keys/:key_id/public`
Return the public key (for signature verification by third parties).
```jsonc
// Response
{ "key_id": "...", "version": 1, "algorithm": "ed25519", "public_key_b64": "..." }
```

## Error model

All errors return `4xx`/`5xx` with `{ "code": "...", "message": "...", "request_id": "..." }`. Codes Eliza adapter must distinguish:
- `key_not_found`
- `version_not_found`
- `cipher_mismatch`
- `auth_failed` (bad MAC / tag)
- `quota_exceeded`
- `policy_denied` (Steward's policy engine rejected the operation)
- `unauthorized`

## Policy hooks

Steward's policy engine should enforce at minimum:
- An org admin cannot decrypt another org's keys (multi-tenant isolation).
- System keys are accessible only to the Eliza Cloud service principal.
- Decrypt count per key per minute is rate-limited (defense-in-depth against extraction loops); audited.
- Optional: human approval required for rotation of high-impact system keys (`jwt-steward`, `webhook-stripe`).

## Performance targets

These endpoints sit in the critical path of every API request that touches encrypted PII. Targets:
- Encrypt / decrypt P50 ≤ 5 ms, P99 ≤ 30 ms, within the cluster.
- HMAC P50 ≤ 3 ms.
- Sign / verify P50 ≤ 10 ms.

If Steward cannot meet these, the Eliza adapter must support a local **cached key-version cache** mode for low-sensitivity classes (config TBD).

## Open questions for Steward team

1. Will Steward expose a Go client + TS client for these endpoints, or only HTTP?
2. Is there an existing audit-log endpoint Eliza should also call from `HttpSinkStub`, or should we add `POST /v1/audit/events`?
3. Multi-region deployment story for key material residency (EU customers).
4. Backup / disaster-recovery story for Steward's own key store (HSM-backed? sealed key shares?).

## SOC2 control mapping

These endpoints support Eliza's evidence for:
- **CC6.1** — logical access (key access is policy-controlled, audited).
- **CC6.7** — encryption in transit (between caller and Steward over TLS) and at rest (Steward holds the keys; Eliza holds only ciphertext).
- **C1.1** — confidentiality (no Eliza service ever holds plaintext keys).
- **C1.2** — disposal (key deactivation marks ciphertext unrecoverable).
- **CC4.1 / CC7.2** — monitoring (Steward audit log records every operation).
