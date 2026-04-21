import { ChannelType, stringToUuid } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { buildUserMessages } from "../src/api/server";

describe("buildUserMessages", () => {
  it("keeps caller metadata on content payloads without promoting it to top-level message metadata", () => {
    const metadata = {
      scenarioId: "B001",
      batchId: "batch-test",
      connectorName: "discord",
      eval: {
        scenarioId: "B001",
        batchId: "batch-test",
      },
    };

    const { userMessage, messageToStore } = buildUserMessages({
      images: undefined,
      prompt: "Build a tiny page for me.",
      userId: stringToUuid("user"),
      agentId: stringToUuid("agent"),
      roomId: stringToUuid("room"),
      channelType: ChannelType.DM,
      messageSource: "discord",
      metadata,
    });

    expect(userMessage.content.source).toBe("discord");
    expect(userMessage.content.metadata).toMatchObject(metadata);
    expect(userMessage.metadata?.scenarioId).toBeUndefined();
    expect(userMessage.metadata?.batchId).toBeUndefined();
    expect(userMessage.metadata?.connectorName).toBeUndefined();

    expect(messageToStore.content.metadata).toMatchObject(metadata);
    expect(messageToStore.metadata?.scenarioId).toBeUndefined();
    expect(messageToStore.metadata?.batchId).toBeUndefined();
    expect(messageToStore.metadata?.connectorName).toBeUndefined();
  });
});
