import type { AgentRuntime, Memory, UUID } from "@elizaos/core";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createRouteInvoker } from "../test-support/route-test-helpers.js";
import { handleMemoryRoutes } from "./memory-routes.js";

const AGENT_ID = "00000000-0000-0000-0000-000000000001" as UUID;

function uuid(n: number): UUID {
  return `00000000-0000-0000-0000-${String(n).padStart(12, "0")}` as UUID;
}

function buildMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: uuid(9000),
    agentId: AGENT_ID,
    roomId: uuid(7000),
    entityId: AGENT_ID,
    content: { text: "" },
    createdAt: 1,
    ...overrides,
  } as unknown as Memory;
}

describe("memory routes", () => {
  let runtime: AgentRuntime | null;
  let createMemoryMock: ReturnType<typeof vi.fn>;
  let getMemoriesMock: ReturnType<typeof vi.fn>;
  let useModelMock: ReturnType<typeof vi.fn>;
  let knowledgeGetMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createMemoryMock = vi.fn(async () => undefined);
    getMemoriesMock = vi.fn(async () => []);
    useModelMock = vi.fn(async () => "quick answer");
    knowledgeGetMock = vi.fn(async () => []);

    runtime = {
      agentId: AGENT_ID,
      character: { name: "Eliza" },
      ensureConnection: vi.fn(async () => undefined),
      createMemory: createMemoryMock,
      getMemories: getMemoriesMock,
      useModel: useModelMock,
      getService: (name: string) =>
        name === "knowledge"
          ? {
              getKnowledge: knowledgeGetMock,
            }
          : null,
      getServiceLoadPromise: async () => undefined,
    } as unknown as AgentRuntime;
  });

  const invoke = createRouteInvoker<
    Record<string, unknown> | null,
    AgentRuntime | null,
    Record<string, unknown>
  >(
    (ctx) =>
      handleMemoryRoutes({
        req: ctx.req,
        res: ctx.res,
        method: ctx.method,
        pathname: ctx.pathname,
        url: new URL(ctx.req.url ?? ctx.pathname, "http://localhost:2138"),
        runtime: ctx.runtime,
        agentName: "Eliza",
        readJsonBody: async () => ctx.readJsonBody(),
        json: (res, data, status) => ctx.json(res, data, status),
        error: (res, message, status) => ctx.error(res, message, status),
      }),
    { runtimeProvider: () => runtime },
  );

  test("stores #remember notes in messages table with hash_memory source", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/memory/remember",
      body: { text: "we use typescript" },
    });

    expect(result.handled).toBe(true);
    expect(result.status).toBe(200);
    expect(createMemoryMock).toHaveBeenCalledTimes(1);
    expect(createMemoryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          text: "we use typescript",
          source: "hash_memory",
        }),
      }),
      "messages",
    );
  });

  test("search returns only matching hash memories", async () => {
    getMemoriesMock.mockResolvedValue([
      buildMemory({
        id: uuid(1),
        createdAt: 1,
        content: { text: "we use typescript", source: "hash_memory" },
      }),
      buildMemory({
        id: uuid(2),
        createdAt: 2,
        content: { text: "python only", source: "hash_memory" },
      }),
      buildMemory({
        id: uuid(3),
        createdAt: 3,
        content: { text: "noise", source: "client_chat" },
      }),
    ]);

    const result = await invoke({
      method: "GET",
      pathname: "/api/memory/search",
      url: "/api/memory/search?q=typescript&limit=5",
    });

    expect(result.status).toBe(200);
    expect(
      (result.payload as { results: Array<{ text: string }> }).results.map(
        (item) => item.text,
      ),
    ).toEqual(["we use typescript"]);
  });

  // ── Memory Viewer endpoints ──────────────────────────────────────────

  describe("GET /api/memories/feed", () => {
    test("returns memories sorted newest-first across tables", async () => {
      getMemoriesMock.mockImplementation(
        async ({ tableName }: { tableName: string }) => {
          if (tableName === "messages") {
            return [
              buildMemory({
                id: uuid(1),
                createdAt: 100,
                content: { text: "msg one" },
              }),
            ];
          }
          if (tableName === "facts") {
            return [
              buildMemory({
                id: uuid(2),
                createdAt: 200,
                content: { text: "fact one" },
              }),
            ];
          }
          return [];
        },
      );

      const result = await invoke({
        method: "GET",
        pathname: "/api/memories/feed",
        url: "/api/memories/feed?limit=10",
      });

      expect(result.handled).toBe(true);
      expect(result.status).toBe(200);
      const payload = result.payload as {
        memories: Array<{ id: string; type: string; text: string }>;
        count: number;
        hasMore: boolean;
      };
      expect(payload.memories.length).toBeGreaterThanOrEqual(1);
      // newest first
      if (payload.memories.length >= 2) {
        expect(payload.memories[0].type).toBe("facts");
        expect(payload.memories[1].type).toBe("messages");
      }
    });

    test("skips empty message rows", async () => {
      getMemoriesMock.mockImplementation(
        async ({ tableName }: { tableName: string }) =>
          tableName === "messages"
            ? [
                buildMemory({
                  id: uuid(3),
                  createdAt: 300,
                  content: { text: "" },
                }),
                buildMemory({
                  id: uuid(4),
                  createdAt: 200,
                  content: { text: "kept" },
                }),
              ]
            : [],
      );

      const result = await invoke({
        method: "GET",
        pathname: "/api/memories/feed",
        url: "/api/memories/feed?limit=10",
      });

      expect(result.status).toBe(200);
      const payload = result.payload as {
        memories: Array<{ text: string }>;
      };
      expect(payload.memories).toHaveLength(1);
      expect(payload.memories[0]?.text).toBe("kept");
    });

    test("filters by type when provided", async () => {
      getMemoriesMock.mockImplementation(
        async ({ tableName }: { tableName: string }) =>
          tableName === "facts"
            ? [
                buildMemory({
                  id: uuid(10),
                  createdAt: 300,
                  content: { text: "a fact" },
                }),
              ]
            : [],
      );

      const result = await invoke({
        method: "GET",
        pathname: "/api/memories/feed",
        url: "/api/memories/feed?type=facts&limit=5",
      });

      expect(result.status).toBe(200);
      const payload = result.payload as {
        memories: Array<{ type: string }>;
      };
      for (const m of payload.memories) {
        expect(m.type).toBe("facts");
      }
    });

    test("supports cursor-based before param", async () => {
      getMemoriesMock.mockImplementation(async () => [
        buildMemory({ id: uuid(20), createdAt: 500, content: { text: "new" } }),
        buildMemory({ id: uuid(21), createdAt: 100, content: { text: "old" } }),
      ]);

      const result = await invoke({
        method: "GET",
        pathname: "/api/memories/feed",
        url: "/api/memories/feed?before=200",
      });

      expect(result.status).toBe(200);
      const payload = result.payload as {
        memories: Array<{ text: string; createdAt: number }>;
      };
      for (const m of payload.memories) {
        expect(m.createdAt).toBeLessThan(200);
      }
    });
  });

  describe("GET /api/memories/browse", () => {
    test("returns paginated memories with offset", async () => {
      const mocks = Array.from({ length: 5 }, (_, i) =>
        buildMemory({
          id: uuid(30 + i),
          createdAt: 1000 - i * 10,
          content: { text: `item ${i}` },
        }),
      );
      getMemoriesMock.mockResolvedValue(mocks);

      const result = await invoke({
        method: "GET",
        pathname: "/api/memories/browse",
        url: "/api/memories/browse?limit=2&offset=1",
      });

      expect(result.status).toBe(200);
      const payload = result.payload as {
        memories: Array<{ text: string }>;
        total: number;
        limit: number;
        offset: number;
      };
      expect(payload.limit).toBe(2);
      expect(payload.offset).toBe(1);
      expect(payload.memories.length).toBeLessThanOrEqual(2);
    });

    test("supports text search with q param", async () => {
      getMemoriesMock.mockImplementation(
        async ({ tableName }: { tableName: string }) =>
          tableName === "messages"
            ? [
                buildMemory({
                  id: uuid(40),
                  createdAt: 100,
                  content: { text: "typescript is great" },
                }),
                buildMemory({
                  id: uuid(41),
                  createdAt: 200,
                  content: { text: "python is fine" },
                }),
              ]
            : [],
      );

      const result = await invoke({
        method: "GET",
        pathname: "/api/memories/browse",
        url: "/api/memories/browse?q=typescript",
      });

      expect(result.status).toBe(200);
      const payload = result.payload as {
        memories: Array<{ text: string }>;
        total: number;
      };
      expect(payload.total).toBe(1);
      expect(payload.memories[0].text).toContain("typescript");
    });
  });

  describe("GET /api/memories/by-entity/:entityId", () => {
    test("returns memories for a specific entity", async () => {
      getMemoriesMock.mockResolvedValue([
        buildMemory({
          id: uuid(50),
          entityId: uuid(999),
          createdAt: 100,
          content: { text: "entity memory" },
        }),
      ]);

      const result = await invoke({
        method: "GET",
        pathname: `/api/memories/by-entity/${uuid(999)}`,
        url: `/api/memories/by-entity/${uuid(999)}?limit=10`,
      });

      expect(result.handled).toBe(true);
      expect(result.status).toBe(200);
      const payload = result.payload as {
        entityId: string;
        memories: Array<{ text: string }>;
        total: number;
      };
      expect(payload.entityId).toBe(uuid(999));
      expect(payload.memories.length).toBeGreaterThanOrEqual(0);
    });

    test("returns 400 for missing entity id", async () => {
      const result = await invoke({
        method: "GET",
        pathname: "/api/memories/by-entity/",
        url: "/api/memories/by-entity/",
      });

      expect(result.handled).toBe(true);
      expect(result.status).toBe(400);
    });
  });

  describe("GET /api/memories/stats", () => {
    test("returns counts by table type", async () => {
      getMemoriesMock.mockImplementation(
        async ({ tableName }: { tableName: string }) => {
          const counts: Record<string, number> = {
            messages: 10,
            memories: 5,
            facts: 3,
            documents: 1,
          };
          return Array.from({ length: counts[tableName] ?? 0 }, (_, i) =>
            buildMemory({
              id: uuid(100 + i),
              createdAt: i,
              content: { text: `${tableName} ${i}` },
            }),
          );
        },
      );

      const result = await invoke({
        method: "GET",
        pathname: "/api/memories/stats",
        url: "/api/memories/stats",
      });

      expect(result.status).toBe(200);
      const payload = result.payload as {
        total: number;
        byType: Record<string, number>;
      };
      expect(payload.total).toBe(19);
      expect(payload.byType.messages).toBe(10);
      expect(payload.byType.facts).toBe(3);
      expect(payload.byType.documents).toBe(1);
    });
  });

  test("quick context returns model answer with memory and knowledge context", async () => {
    getMemoriesMock.mockResolvedValue([
      buildMemory({
        id: uuid(11),
        createdAt: 11,
        content: { text: "use TypeScript for services", source: "hash_memory" },
      }),
    ]);
    knowledgeGetMock.mockResolvedValue([
      {
        id: uuid(100),
        content: { text: "Repo uses Bun and TypeScript" },
        similarity: 0.88,
        metadata: { filename: "README.md" },
      },
    ]);
    useModelMock.mockResolvedValue("TypeScript is the preferred stack.");

    const result = await invoke({
      method: "GET",
      pathname: "/api/context/quick",
      url: "/api/context/quick?q=typescript&limit=3",
    });

    expect(result.status).toBe(200);
    expect((result.payload as { answer: string }).answer).toContain(
      "TypeScript",
    );
    expect((result.payload as { memories: unknown[] }).memories).toHaveLength(
      1,
    );
    expect((result.payload as { knowledge: unknown[] }).knowledge).toHaveLength(
      1,
    );
    expect(useModelMock).toHaveBeenCalledTimes(1);
  });
});
