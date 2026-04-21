import { afterEach, describe, expect, it } from "vitest";
import { normalizeCloudSiteUrl, resolveCloudApiBaseUrl } from "./base-url";

const previousCloudBaseUrl = process.env.ELIZAOS_CLOUD_BASE_URL;

afterEach(() => {
  if (previousCloudBaseUrl === undefined) {
    delete process.env.ELIZAOS_CLOUD_BASE_URL;
  } else {
    process.env.ELIZAOS_CLOUD_BASE_URL = previousCloudBaseUrl;
  }
});

describe("normalizeCloudSiteUrl", () => {
  it("lets ELIZAOS_CLOUD_BASE_URL override configured cloud URLs", () => {
    process.env.ELIZAOS_CLOUD_BASE_URL =
      "http://cloud.example.internal:8080/api/v1/";

    expect(normalizeCloudSiteUrl("https://www.elizacloud.ai")).toBe(
      "https://cloud.example.internal",
    );
    expect(resolveCloudApiBaseUrl("https://www.elizacloud.ai")).toBe(
      "https://cloud.example.internal/api/v1",
    );
  });

  it("still normalizes legacy elizacloud aliases when no env override is set", () => {
    delete process.env.ELIZAOS_CLOUD_BASE_URL;

    expect(normalizeCloudSiteUrl("https://elizacloud.ai/api/v1/")).toBe(
      "https://www.elizacloud.ai",
    );
  });
});
