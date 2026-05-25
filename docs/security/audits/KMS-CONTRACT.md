# Eliza KMS Contract (Steward-backed)

All cryptographic operations in Eliza go through a single `KmsClient` interface. Production uses the Steward adapter; tests use an in-memory adapter. **No raw key material in app code, no env-var-derived keys outside the adapter.**

## TypeScript interface (canonical)

```ts
// packages/security/src/kms/types.ts
export type KeyId = string; // opaque, scoped (e.g., "org:abc/dek/v3", "system:webhook-stripe/v1")
export type KeyVersion = number;
export type SignatureAlgorithm = "ed25519" | "rsa-pss-sha256";

export interface EncryptResult {
  ciphertext: Uint8Array;
  nonce: Uint8Array;     // 12 bytes for AES-256-GCM
  authTag: Uint8Array;   // 16 bytes
  keyId: KeyId;
  keyVersion: KeyVersion;
}

export interface KmsClient {
  // --- Symmetric envelope (AES-256-GCM) ---
  encrypt(keyId: KeyId, plaintext: Uint8Array, aad?: Uint8Array): Promise<EncryptResult>;
  decrypt(
    keyId: KeyId, ciphertext: Uint8Array, nonce: Uint8Array, authTag: Uint8Array,
    aad?: Uint8Array, keyVersion?: KeyVersion
  ): Promise<Uint8Array>;

  // --- Key lifecycle ---
  getOrCreateKey(keyId: KeyId, opts?: { rotationDays?: number }): Promise<{ keyId: KeyId; version: KeyVersion }>;
  rotateKey(keyId: KeyId): Promise<{ keyId: KeyId; newVersion: KeyVersion }>;
  listKeyVersions(keyId: KeyId): Promise<KeyVersion[]>;

  // --- Integrity (HMAC-SHA256) ---
  hmac(keyId: KeyId, data: Uint8Array): Promise<Uint8Array>;
  hmacVerify(keyId: KeyId, data: Uint8Array, tag: Uint8Array): Promise<boolean>;

  // --- Signing (Ed25519 default; RSA-PSS-SHA256 for legacy interop) ---
  sign(keyId: KeyId, data: Uint8Array, algo?: SignatureAlgorithm): Promise<{ signature: Uint8Array; algorithm: SignatureAlgorithm; keyId: KeyId; keyVersion: KeyVersion }>;
  verify(keyId: KeyId, data: Uint8Array, signature: Uint8Array, algo?: SignatureAlgorithm): Promise<boolean>;
  getPublicKey(keyId: KeyId): Promise<Uint8Array>;
}
```

## Key namespace (mandatory convention)

```
system:<purpose>/v<n>                    System keys (rotated by ops)
  system:jwt-steward/v1                  - Steward session JWT signing
  system:webhook-stripe/v1               - Stripe HMAC
  system:webhook-oxapay/v1               - OxaPay HMAC
  system:plugin-manifest/v1              - signing of plugin tarballs
  system:model-artifact/v1               - signing of model artifacts
  system:desktop-update/v1               - signing of desktop autoupdate
  system:chip-firmware/v1                - signing of chip firmware

org:<org_id>/dek/v<n>                    Org-scoped data-encryption keys
org:<org_id>/hmac/v<n>                   Org-scoped integrity keys

user:<user_id>/connector/v<n>            User-scoped connector token wrap key
```

## Operating rules

1. **All encryption-at-rest goes through `KmsClient`** — no `crypto.createCipheriv` outside `@elizaos/security`.
2. **AAD is mandatory** for any record where the key bundle is not unique per record (always include `table`, `row_id`, `column`).
3. **Rotation does not break decrypt** — old `keyVersion` records are decryptable until re-encrypted by a background job.
4. **`KmsClient` instances must be DI-injected** — no module-level singletons capturing process env.

## Adapters

- `@elizaos/security/kms/steward-adapter` — production. Talks to Steward over its credential-proxy API (`STEWARD_URL`, mTLS or short-lived OIDC token). All key material stays inside Steward.
- `@elizaos/security/kms/memory-adapter` — tests only. In-process keys; deterministic seeded RNG option for fixtures.
- `@elizaos/security/kms/local-adapter` — single-user desktop builds where there is no Cloud. Wraps OS keychain via existing vault crypto, exposes same interface.

## Audit Event Schema (companion contract)

Every privileged action emits one `AuditEvent`:

```ts
export interface AuditEvent {
  event_id: string;        // UUIDv7 (sortable)
  ts: string;              // ISO-8601 UTC
  actor: { type: "user" | "api_key" | "service" | "system" | "agent"; id: string };
  action: string;          // e.g. "auth.login", "api_key.create", "secret.access", "plugin.install"
  result: "success" | "failure" | "denied";
  resource: { type: string; id: string } | null;
  ip?: string;
  user_agent?: string;
  request_id?: string;
  org_id?: string;
  metadata?: Record<string, unknown>; // PII-redacted by emitter
}
```

Append-only sink with retention ≥365d (target 7y for security-relevant). Sink interface lives in `@elizaos/security/audit`.
