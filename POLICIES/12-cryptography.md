# 12 — Cryptography & Key Management Policy

**Owner:** Security Lead
**Review cadence:** Annual; key rotations on schedule below
**SOC2 mapping:** C1.1, CC6.7

## Purpose

Define approved algorithms, key management, and rotation cadence across the Eliza stack.

## Authoritative References

- Implementation: [`@elizaos/security`](../eliza/packages/security/README.md) is the canonical KMS interface for the runtime.
- Steward is the authoritative KMS backend (see [`../docs/security/audits/STEWARD-KMS-SPEC.md`](../docs/security/audits/STEWARD-KMS-SPEC.md) and [`../docs/security/audits/KMS-CONTRACT.md`](../docs/security/audits/KMS-CONTRACT.md)).
- Open-source alternative for self-host: HashiCorp Vault (BSL self-host is acceptable).

## Approved Algorithms

| Purpose | Algorithm |
|---|---|
| Symmetric envelope encryption | AES-256-GCM with mandatory AAD |
| KDF | HKDF-SHA256 |
| Asymmetric signing | Ed25519 (preferred) or ECDSA-P256 |
| Hash | SHA-256 / SHA-512 |
| Password hashing | argon2id (Cloud auth) |
| HMAC | HMAC-SHA256 (used for DSPy prompt integrity) |
| TLS | 1.2 minimum, 1.3 preferred |

**Prohibited:** MD5, SHA-1, RC4, DES/3DES, ECB mode, AES-CBC without MAC, RSA-PKCS1v1.5 signatures.

## Key Classes & Rotation

| Class | Use | Rotation | Dual-Accept Window |
|---|---|---|---|
| `auth.jwt` | Cloud session JWT signing | 90 days | 7 days |
| `webhook.hmac` | Inbound webhook verification | 180 days | 14 days |
| `dek.*` | Per-namespace data-encryption keys | 365 days | 30 days |
| `kek` / master | Key-encryption key (Steward) | 730 days | 30 days |
| `release.sigstore` | Release signing (Sigstore Fulcio short-lived) | per-release (ephemeral) | n/a |
| `plugin.signing` | Plugin manifest signing | 365 days | 30 days |

## Policy Statements

1. **Envelope encryption with AAD is mandatory** for all Confidential and Restricted data at rest. Plain ciphertext (no AAD) is rejected at the security boundary.
2. **Keys never leave Steward / Vault in plaintext.** Decrypt operations happen inside the KMS process; only data-encryption keys cross the boundary, wrapped.
3. **No customer-supplied raw key material accepted** for backend encryption — Eliza-managed CMK only for managed services.
4. **Rotation is automated** with the dual-accept window above so ciphertext encrypted with the old key remains decryptable until re-wrap.
5. **Key destruction** for retention/DSR purposes is logged as a non-reversible audit event with `key_id` + `reason`.
6. **No keys in source.** Secrets backend (Steward / Vault / env via sealed-secrets) only.

## Procedures

- Rotation jobs run on schedule and emit metrics; failure alerts SEV-2.
- Quarterly key inventory: Security Lead reviews active keys per class.

## Evidence

- KMS audit log sample showing rotation events.
- Source-grep CI gate proving no keys in source.
- Rotation-job metrics history.

## Open Items For Human Sign-Off

Track Steward/KMS decisions in [`../docs/security/SOC2-OPERATOR-CHECKLIST.md`](../docs/security/SOC2-OPERATOR-CHECKLIST.md) before patching this policy.

- Confirm Steward deployment topology in production.
- Decide whether to expose customer-managed-key (CMK) for enterprise tier.
