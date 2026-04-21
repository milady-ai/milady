import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isCloudProvisionedContainer } from "../../src/api/cloud-provisioning";

describe("isCloudProvisionedContainer", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.MILADY_CLOUD_PROVISIONED;
    delete process.env.ELIZA_CLOUD_PROVISIONED;
    delete process.env.MILADY_API_TOKEN;
    delete process.env.ELIZA_API_TOKEN;
    delete process.env.STEWARD_AGENT_TOKEN;
    delete process.env.ELIZAOS_CLOUD_ENABLED;
    delete process.env.ELIZAOS_CLOUD_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns false without the cloud flag", () => {
    process.env.STEWARD_AGENT_TOKEN = "steward-token";
    expect(isCloudProvisionedContainer()).toBe(false);
  });

  it("returns true for cloud-provisioned containers with a steward token", () => {
    process.env.MILADY_CLOUD_PROVISIONED = "1";
    process.env.STEWARD_AGENT_TOKEN = "steward-token";
    expect(isCloudProvisionedContainer()).toBe(true);
  });

  it("returns true for cloud-provisioned containers with a compat API token", () => {
    process.env.ELIZA_CLOUD_PROVISIONED = "1";
    process.env.ELIZA_API_TOKEN = "api-token";
    expect(isCloudProvisionedContainer()).toBe(true);
  });

  it("returns false when only the cloud flag is set", () => {
    process.env.MILADY_CLOUD_PROVISIONED = "1";
    expect(isCloudProvisionedContainer()).toBe(false);
  });

  it("treats blank tokens as absent", () => {
    process.env.MILADY_CLOUD_PROVISIONED = "1";
    process.env.STEWARD_AGENT_TOKEN = "   ";
    process.env.MILADY_API_TOKEN = "";
    expect(isCloudProvisionedContainer()).toBe(false);
  });

  it("accepts mixed Milady/Eliza flag+token combinations", () => {
    process.env.MILADY_CLOUD_PROVISIONED = "1";
    process.env.ELIZA_API_TOKEN = "api-token";
    expect(isCloudProvisionedContainer()).toBe(true);
  });

  it("returns true for cloud-provisioned containers with cloud API key provisioning", () => {
    process.env.MILADY_CLOUD_PROVISIONED = "1";
    process.env.ELIZAOS_CLOUD_ENABLED = "true";
    process.env.ELIZAOS_CLOUD_API_KEY = "eliza_test_key";
    expect(isCloudProvisionedContainer()).toBe(true);
  });
});
