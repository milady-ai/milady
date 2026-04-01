import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ensureApiTokenForBindHost } from "../../src/api/server";

const originalEnv = { ...process.env };

function saveAndClearTokenEnv() {
  delete process.env.MILADY_API_TOKEN;
  delete process.env.ELIZA_API_TOKEN;
  delete process.env.MILADY_DISABLE_AUTO_API_TOKEN;
  delete process.env.ELIZA_DISABLE_AUTO_API_TOKEN;
  delete process.env.MILADY_CLOUD_PROVISIONED;
  delete process.env.ELIZA_CLOUD_PROVISIONED;
  delete process.env.STEWARD_AGENT_TOKEN;
}

beforeEach(() => {
  process.env = { ...originalEnv };
  saveAndClearTokenEnv();
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("ensureApiTokenForBindHost", () => {
  test("does not generate a token for loopback bind when not cloud-provisioned", () => {
    ensureApiTokenForBindHost("127.0.0.1");
    expect(process.env.MILADY_API_TOKEN).toBeUndefined();
  });

  test("generates a token for non-loopback bind", () => {
    ensureApiTokenForBindHost("0.0.0.0");
    expect(process.env.MILADY_API_TOKEN).toMatch(/^[a-f0-9]{64}$/);
  });

  test("respects disableAutoApiToken for non-cloud containers", () => {
    process.env.MILADY_DISABLE_AUTO_API_TOKEN = "1";
    ensureApiTokenForBindHost("0.0.0.0");
    expect(process.env.MILADY_API_TOKEN).toBeUndefined();
  });

  test("overrides disableAutoApiToken for cloud-provisioned containers", () => {
    process.env.MILADY_DISABLE_AUTO_API_TOKEN = "1";
    process.env.MILADY_CLOUD_PROVISIONED = "1";
    process.env.STEWARD_AGENT_TOKEN = "steward-test-token";
    ensureApiTokenForBindHost("0.0.0.0");
    expect(process.env.MILADY_API_TOKEN).toMatch(/^[a-f0-9]{64}$/);
  });

  test("does not overwrite an existing token", () => {
    process.env.MILADY_API_TOKEN = "existing-token";
    ensureApiTokenForBindHost("0.0.0.0");
    expect(process.env.MILADY_API_TOKEN).toBe("existing-token");
  });
});
