import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Mock dependencies
vi.mock("@miladyai/agent/auth", async (importOriginal) => {
  const orig = (await importOriginal()) as Record<string, unknown>;
  return {
    ...orig,
    refreshAnthropicToken: vi.fn(),
    refreshCodexToken: vi.fn(),
    applyClaudeCodeStealth: vi.fn(),
  };
});

// Mock fs to simulate credential files.
// Note: Bun's vi.mock does not support `importOriginal`, so we provide the
// full mock directly.  The closures over `mockCredentials` work because the
// factory returns functions that are only called at test time (after init).
const mockCredentials: Record<string, string | null> = {};
vi.mock("node:fs", () => ({
  default: {
    existsSync: (p: string) => !!mockCredentials[p],
    readFileSync: (p: string) => {
      const data = mockCredentials[p];
      if (!data) {
        const err = new Error("ENOENT") as NodeJS.ErrnoException;
        err.code = "ENOENT";
        throw err;
      }
      return data;
    },
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
  existsSync: (p: string) => !!mockCredentials[p],
  readFileSync: (p: string) => {
    const data = mockCredentials[p];
    if (!data) {
      const err = new Error("ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    }
    return data;
  },
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

describe("applySubscriptionCredentials", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    savedEnv.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    savedEnv.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    // Clear mock credentials
    for (const key of Object.keys(mockCredentials)) {
      delete mockCredentials[key];
    }
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val !== undefined) {
        process.env[key] = val;
      } else {
        delete process.env[key];
      }
    }
  });

  test("auto-sets model.primary for anthropic-subscription", async () => {
    const { applySubscriptionCredentials } = await import("./credentials");
    const config = {
      agents: {
        defaults: {
          subscriptionProvider: "anthropic-subscription" as string,
          model: undefined as { primary?: string } | undefined,
        },
      },
    };

    await applySubscriptionCredentials(config);

    expect(config.agents.defaults.model?.primary).toBe("anthropic");
  });

  test("auto-sets model.primary when model exists but primary is missing", async () => {
    const { applySubscriptionCredentials } = await import("./credentials");
    const config = {
      agents: {
        defaults: {
          subscriptionProvider: "openai-codex" as string,
          model: {} as { primary?: string },
        },
      },
    };

    await applySubscriptionCredentials(config);

    expect(config.agents.defaults.model.primary).toBe("openai");
  });

  test("does not override existing model.primary", async () => {
    const { applySubscriptionCredentials } = await import("./credentials");
    const config = {
      agents: {
        defaults: {
          subscriptionProvider: "openai-codex" as string,
          model: { primary: "deepseek" },
        },
      },
    };

    await applySubscriptionCredentials(config);

    expect(config.agents.defaults.model.primary).toBe("deepseek");
  });

  test("handles missing config gracefully", async () => {
    const { applySubscriptionCredentials } = await import("./credentials");
    // Should not throw when config is undefined / empty
    await expect(applySubscriptionCredentials()).resolves.toBeUndefined();
    await expect(applySubscriptionCredentials({})).resolves.toBeUndefined();
    await expect(
      applySubscriptionCredentials({ agents: {} }),
    ).resolves.toBeUndefined();
  });

  test("applies Anthropic subscription tokens to runtime env", async () => {
    // Set up a mock credential file for anthropic-subscription
    const authDir = require("node:path").join(
      require("node:os").homedir(),
      ".eliza",
      "auth",
    );
    const credPath = require("node:path").join(
      authDir,
      "anthropic-subscription.json",
    );
    mockCredentials[credPath] = JSON.stringify({
      provider: "anthropic-subscription",
      credentials: {
        access: "sk-ant-oat01-test-token",
        refresh: "refresh-token",
        expires: Date.now() + 60 * 60 * 1000, // 1 hour from now
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const { applySubscriptionCredentials } = await import("./credentials");

    await applySubscriptionCredentials();

    expect(process.env.ANTHROPIC_API_KEY).toBe("sk-ant-oat01-test-token");
  });
});
