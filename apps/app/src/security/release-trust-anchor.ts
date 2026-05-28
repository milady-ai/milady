/**
 * Offline trust anchor for desktop auto-updates.
 *
 * The release-signing public key is pinned in the shipped binary. The
 * Electrobun release pipeline produces, alongside each artifact, a detached
 * `.sig` file signed with the corresponding Ed25519 private key held in
 * Steward / the offline signing room. The updater verifies signatures
 * against this constant before allowing an artifact to replace the running
 * binary.
 *
 * HUMAN-IN-LOOP REQUIRED BEFORE FIRST PRODUCTION RELEASE:
 *   1. Generate an Ed25519 keypair in the air-gapped signing ceremony.
 *   2. Replace `RELEASE_SIGNING_PUBLIC_KEY_BASE64` below with the public-key
 *      half (raw 32-byte Ed25519 key, base64-encoded).
 *   3. Commit and tag the binary. The private key never leaves the offline
 *      ceremony machine; only `.sig` files derived from it ship through CI.
 *   4. Record the key fingerprint in `docs/security/` (owned by the policies
 *      agent) and the release runbook.
 *
 * SOC2 refs: CC6.7, CC8.1.
 */

// PLACEHOLDER — replace before first production release.
// 32 random bytes encoded as base64; verifies nothing meaningful, but keeps
// the type system happy and lets us land the verification path now.
export const RELEASE_SIGNING_PUBLIC_KEY_BASE64 =
  "REPLACE_BEFORE_FIRST_PRODUCTION_RELEASE_PUBKEY_BASE64_GOES_HERE==";

/**
 * Stable identifier used when looking the key up through `KmsClient.verify`.
 * Maps via `systemKey("desktop-update")` in @elizaos/security.
 */
export const RELEASE_SIGNING_KEY_PURPOSE = "desktop-update";

/**
 * Number of consecutive verification failures after which the updater
 * refuses to attempt further updates and surfaces a "manual update
 * required" prompt to the user.
 */
export const MAX_CONSECUTIVE_VERIFICATION_FAILURES = 3;

/**
 * Rollback retention: keep the previous binary for this many days so we
 * can revert if a signed-but-broken update lands.
 */
export const ROLLBACK_RETENTION_DAYS = 7;

export function isPlaceholderPublicKey(value: string): boolean {
  return value.startsWith("REPLACE_BEFORE_FIRST_PRODUCTION_RELEASE");
}
