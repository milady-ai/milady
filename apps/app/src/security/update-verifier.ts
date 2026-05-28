/**
 * Auto-update signature verifier (L-1).
 *
 * Every downloaded update artifact must be accompanied by a detached `.sig`
 * file (Ed25519). This module:
 *
 *   1. Verifies the signature against the pinned public key embedded in the
 *      binary (`release-trust-anchor.ts`). The pinned key is the offline
 *      trust anchor — KMS is the verification primitive but the trust
 *      decision is rooted in the embedded constant.
 *   2. Routes the verify call through the KmsClient (`systemKey(
 *      "desktop-update")`) so the operation is centrally observable and
 *      uses the same algorithm path as server-side signing.
 *   3. Tracks consecutive verification failures; after
 *      MAX_CONSECUTIVE_VERIFICATION_FAILURES the verifier transitions to
 *      "manual update required" mode and refuses further auto-updates.
 *   4. Emits an audit event for every verification attempt.
 *
 * Wiring (out of scope of this package — done by the platform host that
 * spawns Electrobun's updater):
 *
 *   import { verifyUpdateArtifact, FailureCounter } from "@miladyai/app/.../update-verifier";
 *   const counter = new FailureCounter(loadCount, persistCount);
 *   const verifier = createUpdateVerifier({ kms, counter, getEmbeddedPublicKey });
 *   await verifier.verify({ artifact, signature });
 *
 * SOC2 refs: CC6.7, CC8.1.
 */

import { emitClientAudit } from "../secure-store/audit.js";
import {
  isPlaceholderPublicKey,
  MAX_CONSECUTIVE_VERIFICATION_FAILURES,
  RELEASE_SIGNING_KEY_PURPOSE,
  RELEASE_SIGNING_PUBLIC_KEY_BASE64,
} from "./release-trust-anchor.js";

/**
 * Minimal KMS verification surface — matches @elizaos/security's
 * `KmsClient.verify`. We avoid importing the security package directly so
 * the renderer bundle stays slim; the host passes in a bound client.
 */
export interface UpdateKmsClient {
  verify(
    keyId: string,
    data: Uint8Array,
    signature: Uint8Array,
    algorithm?: "ed25519" | "rsa-pss-sha256",
  ): Promise<boolean>;
}

export interface FailureCounter {
  /** Read current consecutive-failure count from persistent storage. */
  get(): Promise<number>;
  /** Persist a new count. */
  set(count: number): Promise<void>;
}

export interface VerifyInput {
  /** Raw bytes of the downloaded update artifact (e.g. .zip, .dmg). */
  artifact: Uint8Array;
  /** Raw bytes of the detached signature (the .sig file). */
  signature: Uint8Array;
  /** Optional artifact name / version for audit metadata. */
  artifactId?: string;
}

export type VerifyOutcome =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "signature_mismatch"
        | "placeholder_key_in_use"
        | "manual_update_required"
        | "kms_error";
      detail?: string;
    };

export interface UpdateVerifier {
  verify(input: VerifyInput): Promise<VerifyOutcome>;
  /** True once the consecutive-failure threshold is reached. */
  isManualUpdateRequired(): Promise<boolean>;
  /** Reset the failure counter (e.g. after a successful manual install). */
  reset(): Promise<void>;
}

export interface CreateUpdateVerifierOptions {
  kms: UpdateKmsClient;
  counter: FailureCounter;
  /** Defaults to the pinned constant. Override for testing. */
  getEmbeddedPublicKey?: () => string;
}

function systemKeyId(purpose: string): string {
  // Inlined so we don't pull @elizaos/security into the renderer.
  return `system:${purpose}/v1`;
}

export function createUpdateVerifier(
  opts: CreateUpdateVerifierOptions,
): UpdateVerifier {
  const getKey =
    opts.getEmbeddedPublicKey ?? (() => RELEASE_SIGNING_PUBLIC_KEY_BASE64);

  async function isManualUpdateRequired(): Promise<boolean> {
    const count = await opts.counter.get();
    return count >= MAX_CONSECUTIVE_VERIFICATION_FAILURES;
  }

  async function verify(input: VerifyInput): Promise<VerifyOutcome> {
    if (await isManualUpdateRequired()) {
      emitClientAudit({
        action: "plugin.denied",
        result: "denied",
        resource: input.artifactId
          ? { type: "update_artifact", id: input.artifactId }
          : undefined,
        metadata: { reason: "manual_update_required" },
      });
      return { ok: false, reason: "manual_update_required" };
    }

    const embedded = getKey();
    if (isPlaceholderPublicKey(embedded)) {
      emitClientAudit({
        action: "plugin.denied",
        result: "denied",
        resource: input.artifactId
          ? { type: "update_artifact", id: input.artifactId }
          : undefined,
        metadata: { reason: "placeholder_release_key" },
      });
      // Fail-closed: refuse to apply unsigned/placeholder-signed updates.
      return { ok: false, reason: "placeholder_key_in_use" };
    }

    let verified = false;
    try {
      verified = await opts.kms.verify(
        systemKeyId(RELEASE_SIGNING_KEY_PURPOSE),
        input.artifact,
        input.signature,
        "ed25519",
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      await bumpFailure(opts.counter);
      emitClientAudit({
        action: "kms.key.access",
        result: "failure",
        metadata: { reason: "verify_threw", detail },
      });
      return { ok: false, reason: "kms_error", detail };
    }

    if (!verified) {
      await bumpFailure(opts.counter);
      emitClientAudit({
        action: "plugin.denied",
        result: "denied",
        resource: input.artifactId
          ? { type: "update_artifact", id: input.artifactId }
          : undefined,
        metadata: { reason: "signature_mismatch" },
      });
      return { ok: false, reason: "signature_mismatch" };
    }

    await opts.counter.set(0);
    emitClientAudit({
      action: "kms.key.access",
      result: "success",
      resource: input.artifactId
        ? { type: "update_artifact", id: input.artifactId }
        : undefined,
      metadata: { reason: "update_signature_verified" },
    });
    return { ok: true };
  }

  async function reset(): Promise<void> {
    await opts.counter.set(0);
  }

  return { verify, isManualUpdateRequired, reset };
}

async function bumpFailure(counter: FailureCounter): Promise<void> {
  const current = await counter.get();
  await counter.set(current + 1);
}
