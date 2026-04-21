import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleCloudStatusRoutes } from "../cloud-status-routes";

const ORIGINAL_ENV = { ...process.env };

function makeJsonCollector() {
  const calls: Array<{ data: unknown; status?: number }> = [];
  return {
    json: (_res: unknown, data: unknown, status?: number) => {
      calls.push({ data, status });
    },
    calls,
  };
}

describe("handleCloudStatusRoutes", () => {
  beforeEach(() => {
    delete process.env.ELIZAOS_CLOUD_API_KEY;
    delete process.env.ELIZAOS_CLOUD_ENABLED;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("treats env-backed cloud API keys as connected", async () => {
    process.env.ELIZAOS_CLOUD_ENABLED = "true";
    process.env.ELIZAOS_CLOUD_API_KEY = "eliza_test_key";

    const { json, calls } = makeJsonCollector();

    const handled = await handleCloudStatusRoutes({
      req: {} as never,
      res: {} as never,
      method: "GET",
      pathname: "/api/cloud/status",
      url: new URL("http://localhost/api/cloud/status"),
      config: { cloud: { enabled: true } },
      runtime: null,
      json,
    });

    expect(handled).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.data).toMatchObject({
      connected: true,
      enabled: true,
      hasApiKey: true,
      reason: "api_key_present_runtime_not_started",
    });
  });
});
