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

  it("returns false for cloud-provisioned containers without a steward token", () => {
    process.env.ELIZA_CLOUD_PROVISIONED = "1";
    process.env.ELIZA_API_TOKEN = "api-token";
    expect(isCloudProvisionedContainer()).toBe(false);
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
});
