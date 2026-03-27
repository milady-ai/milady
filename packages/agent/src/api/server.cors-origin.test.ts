import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveCorsOrigin } from "./server";

describe("resolveCorsOrigin", () => {
  const envKeys = [
    "MILADY_CLOUD_PROVISIONED",
    "ELIZA_CLOUD_PROVISIONED",
    "ELIZA_API_BIND",
    "MILADY_API_BIND",
    "ELIZA_ALLOWED_ORIGINS",
    "CORS_ORIGINS",
  ] as const;
  const savedEnv = new Map<(typeof envKeys)[number], string | undefined>();

  beforeEach(() => {
    for (const key of envKeys) savedEnv.set(key, process.env[key]);
  });

  afterEach(() => {
    for (const [key, value] of savedEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it.each([
    "MILADY_CLOUD_PROVISIONED",
    "ELIZA_CLOUD_PROVISIONED",
  ] as const)("allows arbitrary origins for cloud-provisioned containers when %s=1", (envKey) => {
    process.env[envKey] = "1";

    expect(resolveCorsOrigin("https://evil.example.com")).toBe(
      "https://evil.example.com",
    );
  });

  it("accepts CORS_ORIGINS as an alias for ELIZA_ALLOWED_ORIGINS", () => {
    process.env.ELIZA_API_BIND = "127.0.0.1";
    delete process.env.ELIZA_ALLOWED_ORIGINS;
    process.env.CORS_ORIGINS =
      "https://proxy.example.com, https://other.example.com";

    expect(resolveCorsOrigin("https://proxy.example.com")).toBe(
      "https://proxy.example.com",
    );
    expect(resolveCorsOrigin("https://blocked.example.com")).toBeNull();
  });
});
