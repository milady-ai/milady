import { describe, expect, it, vi } from "vitest";
import {
  createUpdateVerifier,
  type FailureCounter,
  isPlaceholderPublicKey,
  MAX_CONSECUTIVE_VERIFICATION_FAILURES,
  type UpdateKmsClient,
} from "../../src/security/index.ts";

function makeCounter(initial = 0): FailureCounter {
  let n = initial;
  return {
    async get() {
      return n;
    },
    async set(v) {
      n = v;
    },
  };
}

const REAL_KEY = "VmVyeVJlYWxQdWJsaWNLZXlGb3JUZXN0aW5nMTIzNDU2Nzg5MDEyMzQ=";

describe("update-verifier", () => {
  it("refuses to verify while the placeholder key is in use", async () => {
    const kms: UpdateKmsClient = { verify: vi.fn().mockResolvedValue(true) };
    const verifier = createUpdateVerifier({
      kms,
      counter: makeCounter(),
    });
    const outcome = await verifier.verify({
      artifact: new Uint8Array([1, 2, 3]),
      signature: new Uint8Array([4, 5, 6]),
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("placeholder_key_in_use");
    }
    expect(kms.verify).not.toHaveBeenCalled();
  });

  it("returns ok when KMS confirms the signature", async () => {
    const kms: UpdateKmsClient = { verify: vi.fn().mockResolvedValue(true) };
    const verifier = createUpdateVerifier({
      kms,
      counter: makeCounter(),
      getEmbeddedPublicKey: () => REAL_KEY,
    });
    const outcome = await verifier.verify({
      artifact: new Uint8Array([1, 2, 3]),
      signature: new Uint8Array([4, 5, 6]),
      artifactId: "milady-darwin-arm64-2.0.0",
    });
    expect(outcome.ok).toBe(true);
    expect(kms.verify).toHaveBeenCalledOnce();
  });

  it("bumps failure counter and surfaces signature_mismatch on bad sig", async () => {
    const kms: UpdateKmsClient = { verify: vi.fn().mockResolvedValue(false) };
    const counter = makeCounter();
    const verifier = createUpdateVerifier({
      kms,
      counter,
      getEmbeddedPublicKey: () => REAL_KEY,
    });
    const outcome = await verifier.verify({
      artifact: new Uint8Array([1]),
      signature: new Uint8Array([2]),
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("signature_mismatch");
    expect(await counter.get()).toBe(1);
  });

  it("transitions to manual_update_required after consecutive failures", async () => {
    const kms: UpdateKmsClient = { verify: vi.fn().mockResolvedValue(false) };
    const counter = makeCounter(MAX_CONSECUTIVE_VERIFICATION_FAILURES);
    const verifier = createUpdateVerifier({
      kms,
      counter,
      getEmbeddedPublicKey: () => REAL_KEY,
    });
    expect(await verifier.isManualUpdateRequired()).toBe(true);
    const outcome = await verifier.verify({
      artifact: new Uint8Array([1]),
      signature: new Uint8Array([2]),
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("manual_update_required");
    expect(kms.verify).not.toHaveBeenCalled();
  });

  it("isPlaceholderPublicKey identifies the embedded placeholder", () => {
    expect(
      isPlaceholderPublicKey(
        "REPLACE_BEFORE_FIRST_PRODUCTION_RELEASE_PUBKEY_BASE64_GOES_HERE==",
      ),
    ).toBe(true);
    expect(isPlaceholderPublicKey(REAL_KEY)).toBe(false);
  });
});
