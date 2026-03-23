import type { AgentRuntime, UUID } from "@elizaos/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { req } from "../../../../test/helpers/http";
import { startApiServer } from "./server";

describe("conversation message truncation route", () => {
  let port: number;
  let close: () => Promise<void> = async () => {};
  let updateRuntime: (runtime: AgentRuntime) => void = () => {};
  const deleteMemory = vi.fn(async () => undefined);
  const getMemories = vi.fn(async () => [
    {
      id: "00000000-0000-0000-0000-000000000101" as UUID,
      entityId: "00000000-0000-0000-0000-000000000001" as UUID,
      roomId: "00000000-0000-0000-0000-000000000201" as UUID,
      content: { text: "hello" },
      createdAt: 1,
    },
    {
      id: "00000000-0000-0000-0000-000000000102" as UUID,
      entityId: "00000000-0000-0000-0000-000000000999" as UUID,
      roomId: "00000000-0000-0000-0000-000000000201" as UUID,
      content: { text: "hi" },
      createdAt: 2,
    },
    {
      id: "00000000-0000-0000-0000-000000000103" as UUID,
      entityId: "00000000-0000-0000-0000-000000000001" as UUID,
      roomId: "00000000-0000-0000-0000-000000000201" as UUID,
      content: { text: "question" },
      createdAt: 3,
    },
    {
      id: "00000000-0000-0000-0000-000000000104" as UUID,
      entityId: "00000000-0000-0000-0000-000000000999" as UUID,
      roomId: "00000000-0000-0000-0000-000000000201" as UUID,
      content: { text: "answer" },
      createdAt: 4,
    },
  ]);
  const runtime = {
    agentId: "00000000-0000-0000-0000-000000000999" as UUID,
    character: { name: "Eliza" },
    ensureConnection: vi.fn(async () => undefined),
    getService: vi.fn(() => null),
    getRoom: vi.fn(async () => null),
    getMemories,
    deleteMemory,
    adapter: {},
  } as unknown as unknown as AgentRuntime;

  beforeAll(async () => {
    const server = await startApiServer({ port: 0 });
    port = server.port;
    close = server.close;
    updateRuntime = server.updateRuntime;
  }, 30_000);

  afterAll(async () => {
    await close();
  });

  it("deletes the selected message and all later messages", async () => {
    const created = await req(port, "POST", "/api/conversations", {
      title: "Editable thread",
    });
    expect(created.status).toBe(200);
    const conversationId = String(
      (created.data.conversation as { id?: string } | undefined)?.id ?? "",
    );
    expect(conversationId).not.toBe("");

    updateRuntime(runtime);
    deleteMemory.mockClear();

    const response = await req(
      port,
      "POST",
      `/api/conversations/${conversationId}/messages/truncate`,
      {
        messageId: "00000000-0000-0000-0000-000000000103",
        inclusive: true,
      },
    );

    expect(response.status).toBe(200);
    expect(response.data.deletedCount).toBe(2);
    expect(deleteMemory).toHaveBeenCalledTimes(2);
    expect(deleteMemory).toHaveBeenNthCalledWith(
      1,
      "00000000-0000-0000-0000-000000000103",
    );
    expect(deleteMemory).toHaveBeenNthCalledWith(
      2,
      "00000000-0000-0000-0000-000000000104",
    );
  });
});
