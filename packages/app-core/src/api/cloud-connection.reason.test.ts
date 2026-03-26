import { describe, expect, it } from "vitest";
import { isCloudStatusReasonApiKeyOnly } from "./cloud-connection";

describe("isCloudStatusReasonApiKeyOnly", () => {
  it("returns true for API-key-only cloud status reasons", () => {
    expect(
      isCloudStatusReasonApiKeyOnly("api_key_present_not_authenticated"),
    ).toBe(true);
    expect(
      isCloudStatusReasonApiKeyOnly("api_key_present_runtime_not_started"),
    ).toBe(true);
  });

  it("returns false for other reasons and empty values", () => {
    expect(isCloudStatusReasonApiKeyOnly("not_authenticated")).toBe(false);
    expect(isCloudStatusReasonApiKeyOnly("inactive_local_provider")).toBe(
      false,
    );
    expect(isCloudStatusReasonApiKeyOnly("")).toBe(false);
    expect(isCloudStatusReasonApiKeyOnly(null)).toBe(false);
    expect(isCloudStatusReasonApiKeyOnly(undefined)).toBe(false);
  });
});
