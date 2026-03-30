import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveCloudApiKey } from "./cloud-connection";
import {
  _resetCloudSecretsForTesting,
  scrubCloudSecretsFromEnv,
} from "./cloud-secrets";

describe("resolveCloudApiKey (integration)", () => {
  beforeEach(() => {
    _resetCloudSecretsForTesting();
    delete process.env.ELIZAOS_CLOUD_API_KEY;
  });
  afterEach(() => {
    _resetCloudSecretsForTesting();
    delete process.env.ELIZAOS_CLOUD_API_KEY;
  });

  it("returns undefined when cloud.enabled is false (ignores env, sealed store, runtime)", () => {
    process.env.ELIZAOS_CLOUD_API_KEY = "from-env";
    scrubCloudSecretsFromEnv();
    process.env.ELIZAOS_CLOUD_API_KEY = "from-env";

    const key = resolveCloudApiKey(
      {
        cloud: {
          enabled: false,
          apiKey: "in-file-should-not-matter",
        },
      },
      {
        character: {
          secrets: { ELIZAOS_CLOUD_API_KEY: "from-db" },
        },
      } as never,
    );

    expect(key).toBeUndefined();
  });

  it("still resolves when enabled is undefined and env has a key", () => {
    process.env.ELIZAOS_CLOUD_API_KEY = "legacy-env";
    expect(resolveCloudApiKey({ cloud: {} }, null)).toBe("legacy-env");
  });
});
