import type { AgentRuntime } from "@elizaos/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createConversation,
  postConversationMessage,
} from "../../../test/helpers/http";
import { createLifeOpsChatTestRuntime } from "./helpers/lifeops-chat-runtime";
import { lifeAction } from "../src/actions/life";
import { startApiServer } from "../src/api/server";
import { LifeOpsService } from "../src/lifeops/service";

const AGENT_ID = "lifeops-life-chat-agent";

function createRuntimeForLifeChatTests(): AgentRuntime {
  return createLifeOpsChatTestRuntime({
    agentId: AGENT_ID,
    useModel: async () => "<response></response>",
    handleTurn: async ({ runtime, message, state }) => {
      const result = await lifeAction.handler?.(
        runtime,
        message as never,
        state,
        {
          parameters: {},
        } as never,
      );
      return {
        text:
          typeof result?.text === "string" && result.text.trim().length > 0
            ? result.text
            : "I couldn't figure out that LifeOps request.",
        data: result?.data,
      };
    },
  });
}

async function createConversationAndSend(port: number, text: string) {
  const { conversationId } = await createConversation(port, {
    includeGreeting: false,
    title: `LifeOps chat ${text}`,
  });
  const response = await postConversationMessage(port, conversationId, {
    text,
    source: "discord",
  });
  return { conversationId, response };
}

describe("life-ops life chat transcripts", () => {
  let port = 0;
  let closeServer: (() => Promise<void>) | null = null;
  let runtime: AgentRuntime;
  let service: LifeOpsService;

  beforeAll(async () => {
    runtime = createRuntimeForLifeChatTests();
    service = new LifeOpsService(runtime);
    const server = await startApiServer({
      port: 0,
      runtime,
    });
    port = server.port;
    closeServer = server.close;
  }, 60_000);

  afterAll(async () => {
    if (closeServer) {
      await closeServer();
    }
  });

  it("previews then saves a brushing routine through natural chat", async () => {
    const { conversationId, response: preview } = await createConversationAndSend(
      port,
      "Help me remember to brush my teeth in the morning and at night.",
    );

    expect(preview.status).toBe(200);
    const previewText = String(preview.data.text ?? "");
    expect(previewText).toContain("Brush teeth");
    expect(previewText).toContain("Confirm");

    const confirm = await postConversationMessage(port, conversationId, {
      text: "yes, save that",
      source: "discord",
    });
    expect(confirm.status).toBe(200);
    expect(String(confirm.data.text ?? "")).toContain('Saved "Brush teeth"');

    const definition = (await service.listDefinitions()).find(
      (entry) => entry.definition.title === "Brush teeth",
    );
    expect(definition?.definition.kind).toBe("habit");
    expect(definition?.definition.cadence).toMatchObject({
      kind: "times_per_day",
      slots: expect.arrayContaining([
        expect.objectContaining({ label: "Morning", minuteOfDay: 8 * 60 }),
        expect.objectContaining({ label: "Night", minuteOfDay: 21 * 60 }),
      ]),
    });
    expect(definition?.reminderPlan?.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: "in_app", offsetMinutes: 0 }),
      ]),
    );
  });

  it("previews then saves a health-adjacent goal through natural chat", async () => {
    const { conversationId, response: preview } = await createConversationAndSend(
      port,
      "I want a goal called Stabilize sleep schedule.",
    );

    expect(preview.status).toBe(200);
    const previewText = String(preview.data.text ?? "");
    expect(previewText).toContain("Stabilize Sleep Schedule");
    expect(previewText).toContain("goal");

    const confirm = await postConversationMessage(port, conversationId, {
      text: "yes, save the goal",
      source: "discord",
    });
    expect(confirm.status).toBe(200);
    expect(String(confirm.data.text ?? "")).toContain(
      'Saved goal "Stabilize Sleep Schedule".',
    );

    const goal = (await service.listGoals()).find(
      (entry) => entry.goal.title === "Stabilize Sleep Schedule",
    );
    expect(goal?.goal.status).toBe("active");
    expect(goal?.goal.reviewState).toBe("idle");
  });

  it("updates reminder intensity for an existing routine through chat follow-up", async () => {
    const { conversationId, response: preview } = await createConversationAndSend(
      port,
      "Please remind me to drink water throughout the day.",
    );

    expect(preview.status).toBe(200);
    expect(String(preview.data.text ?? "")).toContain("Drink water");

    const confirmCreate = await postConversationMessage(port, conversationId, {
      text: "yes, save it",
      source: "discord",
    });
    expect(confirmCreate.status).toBe(200);
    expect(String(confirmCreate.data.text ?? "")).toContain(
      'Saved "Drink water"',
    );

    const update = await postConversationMessage(port, conversationId, {
      text: "remind me less about drink water",
      source: "discord",
    });
    expect(update.status).toBe(200);
    expect(String(update.data.text ?? "")).toContain("minimal");

    const definition = (await service.listDefinitions()).find(
      (entry) => entry.definition.title === "Drink water",
    );
    expect(definition?.definition.id).toBeTruthy();

    const preference = await service.getReminderPreference(
      definition?.definition.id ?? null,
    );
    expect(preference.effective.intensity).toBe("minimal");
  });
});
