import { describe, expect, it } from "vitest";
import {
  nextRuntimeBootRetryDelayMs,
  resolveRuntimeBootstrapFailure,
} from "./runtime-bootstrap-policy";

describe("runtime bootstrap retry policy", () => {
  it("backs off exponentially for retryable failures", () => {
    expect(nextRuntimeBootRetryDelayMs(1)).toBe(1_000);
    expect(nextRuntimeBootRetryDelayMs(2)).toBe(2_000);
    expect(nextRuntimeBootRetryDelayMs(3)).toBe(4_000);
    expect(nextRuntimeBootRetryDelayMs(10)).toBe(30_000);
  });

  it("fails fast for coded pglite startup errors", () => {
    const failure = resolveRuntimeBootstrapFailure({
      attempt: 1,
      err: Object.assign(new Error("manual reset required"), {
        code: "ELIZA_PGLITE_MANUAL_RESET_REQUIRED",
      }),
      firstFailureAt: 1_000,
      now: 1_500,
    });

    expect(failure.shouldRetry).toBe(false);
    expect(failure.phase).toBe("runtime-error");
    expect(failure.state).toBe("error");
    expect(failure.delayMs).toBeUndefined();
    expect(failure.nextRetryAt).toBeUndefined();
  });

  it("keeps retrying ordinary failures until thresholds are crossed", () => {
    const failure = resolveRuntimeBootstrapFailure({
      attempt: 1,
      err: new Error("provider unavailable"),
      firstFailureAt: 1_000,
      now: 1_500,
    });

    expect(failure.shouldRetry).toBe(true);
    expect(failure.phase).toBe("runtime-retry");
    expect(failure.state).toBe("starting");
    expect(failure.delayMs).toBe(1_000);
    expect(failure.nextRetryAt).toBe(2_500);
  });

  it("surfaces error state after repeated ordinary failures", () => {
    const failure = resolveRuntimeBootstrapFailure({
      attempt: 3,
      err: new Error("provider unavailable"),
      firstFailureAt: 1_000,
      now: 2_000,
    });

    expect(failure.shouldRetry).toBe(true);
    expect(failure.phase).toBe("runtime-error");
    expect(failure.state).toBe("error");
    expect(failure.delayMs).toBe(4_000);
  });
});
