import { describe, expect, it } from "vitest";
import { shouldUseCloudOnlyBranding } from "../src/cloud-only";

describe("shouldUseCloudOnlyBranding", () => {
  it("keeps local onboarding enabled in dev without an injected backend", () => {
    expect(
      shouldUseCloudOnlyBranding({ isDev: true, injectedApiBase: undefined }),
    ).toBe(false);
  });

  it("keeps the production web bundle cloud-only when no backend is injected", () => {
    expect(
      shouldUseCloudOnlyBranding({ isDev: false, injectedApiBase: undefined }),
    ).toBe(true);
  });

  it("trusts a host-injected backend over the production cloud-only default", () => {
    expect(
      shouldUseCloudOnlyBranding({
        isDev: false,
        injectedApiBase: "http://127.0.0.1:31337",
      }),
    ).toBe(false);
  });

  it("ignores blank injected api base values", () => {
    expect(
      shouldUseCloudOnlyBranding({
        isDev: false,
        injectedApiBase: "   ",
      }),
    ).toBe(true);
  });

  it("returns true for native platforms even without an injected backend", () => {
    expect(
      shouldUseCloudOnlyBranding({
        isDev: false,
        injectedApiBase: undefined,
        isNativePlatform: true,
      }),
    ).toBe(true);
  });

  it("returns true for native platforms in production", () => {
    expect(
      shouldUseCloudOnlyBranding({
        isDev: false,
        injectedApiBase: "   ",
        isNativePlatform: true,
      }),
    ).toBe(true);
  });
});
