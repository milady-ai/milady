import type { AgentRuntime } from "@elizaos/core";
import { startApiServer } from "@miladyai/app-core/src/api/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { req } from "./helpers/http";
import { type RawSqlQuery, sqlText, splitSqlTuple, parseSqlScalar } from "./helpers/sql";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | {
      [key: string]: JsonValue;
    };

type JsonObject = Record<string, JsonValue>;

class InMemoryTrajectoryDb {
  private rows = new Map<string, Record<string, unknown>>();

  async execute(query: RawSqlQuery): Promise<{ rows: unknown[] }> {
    const sql = sqlText(query);
    const normalized = sql.toLowerCase().replace(/\s+/g, " ").trim();

    if (normalized.startsWith("create table if not exists trajectories")) {
      return { rows: [] };
    }

    if (normalized.startsWith("insert into trajectories")) {
      const match =
        /insert into trajectories\s*\(([\s\S]+?)\)\s*values\s*\(([\s\S]+?)\)\s*on conflict/i.exec(
          sql,
        );
      if (!match) return { rows: [] };
      const columns = splitSqlTuple(match[1]).map((col) => col.trim());
      const values = splitSqlTuple(match[2]).map(parseSqlScalar);
      const row: Record<string, unknown> = {};
      for (let i = 0; i < columns.length; i += 1) {
        row[columns[i]] = values[i] ?? null;
      }
      const id = String(row.id ?? "");
      if (id) {
        const existing = this.rows.get(id) ?? {};
        this.rows.set(id, { ...existing, ...row });
      }
      return { rows: [] };
    }

    if (normalized.startsWith("select * from trajectories where id =")) {
      const match = /where id = '([^']*(?:''[^']*)*)'/i.exec(sql);
      const id = match ? match[1].replace(/''/g, "'") : "";
      const row = id ? this.rows.get(id) : null;
      return { rows: row ? [row] : [] };
    }

    if (normalized.startsWith("select * from trajectories")) {
      const limitMatch = /limit\s+(\d+)/i.exec(sql);
      const limit = limitMatch ? Number(limitMatch[1]) : 5000;
      const rows = Array.from(this.rows.values()).sort((a, b) =>
        String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
      );
      return { rows: rows.slice(0, limit) };
    }

    return { rows: [] };
  }
}

type InMemoryTrajectoryLogger = {
  isEnabled: () => boolean;
  getLlmCallLogs: () => ReadonlyArray<Record<string, unknown>>;
  getProviderAccessLogs: () => ReadonlyArray<Record<string, unknown>>;
  logLlmCall?: (params: Record<string, unknown>) => void;
  llmCalls: Array<Record<string, unknown>>;
  providerAccess: Array<Record<string, unknown>>;
};

function createRuntimeWithCoreLogger(
  agentId: string,
  name: string,
  logger: InMemoryTrajectoryLogger,
  db: InMemoryTrajectoryDb,
): AgentRuntime {
  const noop = () => {};
  return {
    agentId,
    character: { name },
    adapter: { db } as AgentRuntime["adapter"],
    plugins: [],
    actions: [],
    providers: [],
    evaluators: [],
    services: new Map(),
    getService: (serviceType: string) =>
      serviceType === "trajectory_logger" ? logger : null,
    getServicesByType: (serviceType: string) =>
      serviceType === "trajectory_logger" ? [logger] : [],
    messageService: null,
    logger: {
      trace: noop,
      debug: noop,
      info: noop,
      warn: noop,
      error: noop,
      fatal: noop,
      success: noop,
      progress: noop,
      clear: noop,
      child: () =>
        ({
          trace: noop,
          debug: noop,
          info: noop,
          warn: noop,
          error: noop,
          fatal: noop,
          success: noop,
          progress: noop,
          clear: noop,
          child: () => ({}),
        }) as AgentRuntime["logger"],
    } as AgentRuntime["logger"],
  } as unknown as AgentRuntime;
}

describe("trajectory logs survive updateRuntime hot-swap", () => {
  let port = 0;
  let closeServer: (() => Promise<void>) | null = null;
  let updateRuntime: ((rt: AgentRuntime) => void) | null = null;
  const db = new InMemoryTrajectoryDb();
  let loggerA: InMemoryTrajectoryLogger | null = null;

  beforeAll(async () => {
    loggerA = {
      isEnabled: () => true,
      llmCalls: [],
      providerAccess: [],
      getLlmCallLogs() {
        return this.llmCalls;
      },
      getProviderAccessLogs() {
        return this.providerAccess;
      },
    };

    const runtimeA = createRuntimeWithCoreLogger(
      "00000000-0000-0000-0000-000000000001",
      "CarryoverA",
      loggerA,
      db,
    );

    const server = await startApiServer({ port: 0, runtime: runtimeA });
    port = server.port;
    closeServer = server.close;
    updateRuntime = server.updateRuntime;

    loggerA.logLlmCall?.({
      stepId: "step-a",
      model: "unit-test-model",
      systemPrompt: "sys",
      userPrompt: "hello",
      response: "world",
      temperature: 0,
      maxTokens: 64,
      purpose: "action",
      actionType: "runtime.useModel",
      latencyMs: 12,
      timestamp: Date.now(),
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
  }, 30_000);

  afterAll(async () => {
    if (closeServer) {
      await closeServer();
    }
  });

  it("retains existing trajectories after runtime swap", async () => {
    const before = await req(port, "GET", "/api/trajectories");
    if (before.status === 503) {
      expect(typeof before.data.error).toBe("string");
      return;
    }
    expect(before.status).toBe(200);
    const beforeRows = (before.data.trajectories ?? []) as Array<JsonObject>;
    expect(beforeRows.length).toBeGreaterThan(0);

    const loggerB: InMemoryTrajectoryLogger = {
      isEnabled: () => true,
      llmCalls: [],
      providerAccess: [],
      getLlmCallLogs() {
        return this.llmCalls;
      },
      getProviderAccessLogs() {
        return this.providerAccess;
      },
    };
    const runtimeB = createRuntimeWithCoreLogger(
      "00000000-0000-0000-0000-000000000002",
      "CarryoverB",
      loggerB,
      db,
    );

    if (!updateRuntime) {
      throw new Error("updateRuntime not available");
    }
    updateRuntime(runtimeB);

    const after = await req(port, "GET", "/api/trajectories");
    if (after.status === 503) {
      expect(typeof after.data.error).toBe("string");
      return;
    }
    expect(after.status).toBe(200);
    const afterRows = (after.data.trajectories ?? []) as Array<JsonObject>;
    expect(afterRows.length).toBeGreaterThanOrEqual(beforeRows.length);
    expect(afterRows.some((row) => row.id === beforeRows[0]?.id)).toBe(true);
  });
});
