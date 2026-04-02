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

  it("keeps a persisted linked-account key even when cloud inference is disabled", () => {
    process.env.ELIZAOS_CLOUD_API_KEY = "from-env";
    scrubCloudSecretsFromEnv();
    process.env.ELIZAOS_CLOUD_API_KEY = "from-env";

    const key = resolveCloudApiKey(
      {
        connection: {
          kind: "local-provider",
          provider: "openai",
        },
        cloud: {
          enabled: false,
          apiKey: "in-file-linked-key",
        },
      },
      {
        character: {
          secrets: { ELIZAOS_CLOUD_API_KEY: "from-db" },
        },
      } as never,
    );

    expect(key).toBe("in-file-linked-key");
  });

  it("does not fall back to env-only cloud state when cloud inference is not selected", () => {
    process.env.ELIZAOS_CLOUD_API_KEY = "legacy-env";
    expect(
      resolveCloudApiKey(
        {
          connection: {
            kind: "local-provider",
            provider: "anthropic",
          },
          cloud: {},
        },
        null,
      ),
    ).toBeUndefined();
  });

  it("still resolves env fallback for legacy cloud-selected configs", () => {
    process.env.ELIZAOS_CLOUD_API_KEY = "legacy-env";
    expect(
      resolveCloudApiKey({ cloud: { inferenceMode: "cloud" } }, null),
    ).toBe("legacy-env");
  });
});
