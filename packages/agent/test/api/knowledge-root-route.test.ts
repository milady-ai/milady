import { describe, expect, test, vi } from "vitest";

vi.mock("../../src/api/knowledge-service-loader", () => ({
  getKnowledgeService: vi.fn(async () => ({
    service: {
      countMemories: vi.fn(async ({ tableName }: { tableName: string }) =>
        tableName === "documents" ? 2 : 5,
      ),
    },
    reason: null,
  })),
}));

import type { KnowledgeRouteContext } from "../../src/api/knowledge-routes";
import { handleKnowledgeRoutes } from "../../src/api/knowledge-routes";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../../src/test-support/test-helpers";

function buildCtx(overrides: Partial<KnowledgeRouteContext> = {}): KnowledgeRouteContext {
  const { res } = createMockHttpResponse();
  return {
    req: createMockIncomingMessage({ method: "GET", url: "/api/knowledge" }),
    res,
    method: "GET",
    pathname: "/api/knowledge",
    url: new URL("/api/knowledge", "http://localhost:2138"),
    json: vi.fn((r, data, status = 200) => {
      r.writeHead(status);
      r.end(JSON.stringify(data));
    }),
    error: vi.fn((r, msg, status = 500) => {
      r.writeHead(status);
      r.end(JSON.stringify({ error: msg }));
    }),
    readJsonBody: vi.fn(async () => ({})),
    runtime: { agentId: "00000000-0000-0000-0000-000000000001" } as KnowledgeRouteContext["runtime"],
    ...overrides,
  } as KnowledgeRouteContext;
}

describe("knowledge root route", () => {
  test("GET /api/knowledge returns availability summary instead of 404", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse();
    const ctx = buildCtx({ res });

    const handled = await handleKnowledgeRoutes(ctx);

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual({
      ok: true,
      available: true,
      agentId: "00000000-0000-0000-0000-000000000001",
      documentCount: 2,
      fragmentCount: 5,
    });
  });
});
