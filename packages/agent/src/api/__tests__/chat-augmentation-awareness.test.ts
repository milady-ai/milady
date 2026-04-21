import { ChannelType, createMessageMemory } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildAgentAwarenessContextPrompt,
  maybeAugmentChatMessageWithAgentAwareness,
} from "../chat-augmentation";

type RuntimeStub = {
  plugins: Array<{ name: string }>;
  character: { settings?: Record<string, unknown> };
  getService?: (name: string) => unknown;
};

const ENV_KEYS = [
  "MILADY_CLOUD_PROVISIONED",
  "ELIZA_CLOUD_PROVISIONED",
  "STEWARD_AGENT_TOKEN",
  "MILADY_WALLET_NETWORK",
  "ELIZA_MANAGED_EVM_ADDRESS",
  "ELIZA_MANAGED_SOLANA_ADDRESS",
  "EVM_PRIVATE_KEY",
  "BSC_RPC_URL",
  "BSC_TESTNET_RPC_URL",
  "NODEREAL_BSC_RPC_URL",
  "QUICKNODE_BSC_RPC_URL",
] as const;

const ORIGINAL_ENV = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof ENV_KEYS)[number], string | undefined>;

function makeRuntime(overrides?: {
  model?: string;
  plugins?: string[];
  cloudBalance?: number;
}): RuntimeStub {
  const cloudBalance = overrides?.cloudBalance;
  return {
    plugins: (overrides?.plugins ?? [
      "@elizaos/plugin-anthropic",
      "@elizaos/plugin-evm",
      "@elizaos/plugin-discord",
    ]).map((name) => ({ name })),
    character: {
      settings: {
        model: overrides?.model ?? "anthropic/claude-sonnet-4.6",
      },
    },
    getService: (name: string) => {
      if (name !== "CLOUD_AUTH" || typeof cloudBalance !== "number") {
        return null;
      }
      return {
        isAuthenticated: () => true,
        getClient: () => ({
          get: async () => ({ balance: cloudBalance }),
        }),
      };
    },
  };
}

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("agent awareness chat augmentation", () => {
  it("builds model, cloud, plugin, and wallet facts into the prompt", async () => {
    process.env.MILADY_CLOUD_PROVISIONED = "1";
    process.env.STEWARD_AGENT_TOKEN = "steward-token";
    process.env.ELIZA_MANAGED_EVM_ADDRESS =
      "0x1111111111111111111111111111111111111111";
    process.env.ELIZA_MANAGED_SOLANA_ADDRESS =
      "So11111111111111111111111111111111111111112";
    process.env.BSC_RPC_URL = "https://bsc.example";

    const prompt = await buildAgentAwarenessContextPrompt(
      makeRuntime({ cloudBalance: 12.34 }) as never,
      "what model are you on and do you have wallets?",
    );

    expect(prompt).toContain("- model: anthropic/claude-sonnet-4.6");
    expect(prompt).toContain("- provider: Anthropic");
    expect(prompt).toContain("- cloudHosted: true");
    expect(prompt).toContain("- cloudConnected: true");
    expect(prompt).toContain("- cloudCredits: 12.34");
    expect(prompt).toContain(
      "- activePlugins: @elizaos/plugin-anthropic, @elizaos/plugin-evm, @elizaos/plugin-discord",
    );
    expect(prompt).toContain(
      "- evmAddress: 0x1111111111111111111111111111111111111111",
    );
    expect(prompt).toContain(
      "- solanaAddress: So11111111111111111111111111111111111111112",
    );
    expect(prompt).toContain("- pluginEvmLoaded: true");
    expect(prompt).toContain("- executionReady: true");
  });

  it("augments matching self-status questions", async () => {
    process.env.ELIZA_MANAGED_EVM_ADDRESS =
      "0x1111111111111111111111111111111111111111";

    const message = createMessageMemory({
      id: "00000000-0000-0000-0000-000000000001",
      entityId: "00000000-0000-0000-0000-000000000002",
      agentId: "00000000-0000-0000-0000-000000000003",
      roomId: "00000000-0000-0000-0000-000000000004",
      content: {
        text: "what model are you on?",
        source: "client_chat",
        channelType: ChannelType.DIRECT,
      },
    });

    const augmented = await maybeAugmentChatMessageWithAgentAwareness(
      makeRuntime() as never,
      message,
    );

    expect(augmented.content.text).toContain("Server-verified agent self-awareness:");
    expect(augmented.content.text).toContain("- model: anthropic/claude-sonnet-4.6");
  });

  it("does not augment unrelated prompts for non-cloud sessions", async () => {
    const message = createMessageMemory({
      id: "00000000-0000-0000-0000-000000000011",
      entityId: "00000000-0000-0000-0000-000000000012",
      agentId: "00000000-0000-0000-0000-000000000013",
      roomId: "00000000-0000-0000-0000-000000000014",
      content: {
        text: "write me a haiku about snow",
        source: "client_chat",
        channelType: ChannelType.DIRECT,
      },
    });

    const augmented = await maybeAugmentChatMessageWithAgentAwareness(
      makeRuntime() as never,
      message,
    );

    expect(augmented).toBe(message);
  });

  it("augments all prompts in cloud-provisioned containers", async () => {
    process.env.MILADY_CLOUD_PROVISIONED = "1";
    process.env.ELIZA_API_TOKEN = "cloud-token";

    const message = createMessageMemory({
      id: "00000000-0000-0000-0000-000000000021",
      entityId: "00000000-0000-0000-0000-000000000022",
      agentId: "00000000-0000-0000-0000-000000000023",
      roomId: "00000000-0000-0000-0000-000000000024",
      content: {
        text: "write me a haiku about snow",
        source: "client_chat",
        channelType: ChannelType.DIRECT,
      },
    });

    const augmented = await maybeAugmentChatMessageWithAgentAwareness(
      makeRuntime() as never,
      message,
    );

    expect(augmented.content.text).toContain("Server-verified agent self-awareness:");
    expect(augmented.content.text).toContain("Original self-status request");
  });
});
