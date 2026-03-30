/**
 * Performance budget tests for the benchmark bridge.
 *
 * Measures critical-path functions against baselines defined in
 * test/perf-baselines.json. Each operation is run multiple times and
 * the p95 latency is compared against the budget.
 *
 * Gated behind MILADY_PERF_TEST=1 — not part of the default test suite
 * to avoid flakiness from CI runner variance.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  type BenchmarkContext,
  clearCapturedAction,
  createBenchmarkPlugin,
  getCapturedAction,
  setBenchmarkContext,
} from "../packages/app-core/src/benchmark/plugin";
import {
  capturedActionToParams,
  coerceParams,
  composeBenchmarkPrompt,
  createSession,
  normalizeBenchmarkContext,
} from "../packages/app-core/src/benchmark/server-utils";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface Baseline {
  p95_ms: number;
  description: string;
}

interface BaselinesFile {
  version: number;
  baselines: Record<string, Baseline>;
}

const baselinesPath = path.join(__dirname, "perf-baselines.json");
const baselinesFile: BaselinesFile = JSON.parse(
  fs.readFileSync(baselinesPath, "utf8"),
);

const ITERATIONS = 1000;
const P95_INDEX = Math.floor(ITERATIONS * 0.95);

function measureP95(fn: () => void): number {
  const timings: number[] = new Array(ITERATIONS);

  // Warmup — run 50 iterations to allow JIT to stabilize
  for (let i = 0; i < 50; i++) {
    fn();
  }

  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    fn();
    timings[i] = performance.now() - start;
  }

  timings.sort((a, b) => a - b);
  return timings[P95_INDEX];
}

async function measureP95Async(fn: () => Promise<void>): Promise<number> {
  const timings: number[] = new Array(ITERATIONS);

  for (let i = 0; i < 50; i++) {
    await fn();
  }

  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    await fn();
    timings[i] = performance.now() - start;
  }

  timings.sort((a, b) => a - b);
  return timings[P95_INDEX];
}

function getBaseline(name: string): Baseline {
  const baseline = baselinesFile.baselines[name];
  if (!baseline) {
    throw new Error(
      `Missing baseline "${name}" in perf-baselines.json — add it before writing a perf test for it`,
    );
  }
  return baseline;
}

const enabled = process.env.MILADY_PERF_TEST === "1";

describe.skipIf(!enabled)("performance budgets", () => {
  afterEach(() => {
    clearCapturedAction();
    setBenchmarkContext(null);
  });

  it("session-create stays within budget and produces valid sessions", () => {
    const baseline = getBaseline("session-create");
    let lastSession: ReturnType<typeof createSession> | undefined;
    const p95 = measureP95(() => {
      lastSession = createSession("webshop-42", "agentbench");
    });
    expect(p95).toBeLessThanOrEqual(baseline.p95_ms);
    expect(lastSession).toBeDefined();
    expect(lastSession!.taskId).toBe("webshop-42");
    expect(lastSession!.benchmark).toBe("agentbench");
    expect(lastSession!.roomId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(lastSession!.relayRoomId).not.toBe(lastSession!.roomId);
  });

  it("context-normalize stays within budget and produces correct output", () => {
    const baseline = getBaseline("context-normalize");
    const session = createSession("task-1", "tau-bench");
    const context = {
      goal: "Find order status",
      action_space: ["lookup_order", "cancel_order"],
      task_id: "task-1",
      benchmark: "tau-bench",
    };
    let lastResult: ReturnType<typeof normalizeBenchmarkContext> | undefined;
    const p95 = measureP95(() => {
      lastResult = normalizeBenchmarkContext(session, context);
    });
    expect(p95).toBeLessThanOrEqual(baseline.p95_ms);
    expect(lastResult).toBeDefined();
    expect(lastResult!.benchmark).toBe("tau-bench");
    expect(lastResult!.taskId).toBe("task-1");
    expect(lastResult!.actionSpace).toEqual(["lookup_order", "cancel_order"]);
    expect(lastResult!.goal).toBe("Find order status");
  });

  it("prompt-compose stays within budget and produces correct output", () => {
    const baseline = getBaseline("prompt-compose");
    const context = {
      benchmark: "agentbench",
      taskId: "webshop-42",
      goal: "Buy a laptop under $500",
      observation: { page: "search results", items: 25 },
      action_space: ["search[query]", "click[id]", "buy[id]", "back", "next"],
    };
    let lastResult = "";
    const p95 = measureP95(() => {
      lastResult = composeBenchmarkPrompt({
        text: "Find a laptop under $500 with good reviews",
        context,
        image: { type: "url", url: "https://example.com/screenshot.png" },
      });
    });
    expect(p95).toBeLessThanOrEqual(baseline.p95_ms);
    expect(lastResult).toContain("Find a laptop under $500");
    expect(lastResult).toContain("BENCHMARK CONTEXT (authoritative):");
    expect(lastResult).toContain("IMAGE PAYLOAD:");
    expect(lastResult).toContain("Respond using normal Eliza action output");
  });

  it("params-coerce-json stays within budget and returns identity", () => {
    const baseline = getBaseline("params-coerce-json");
    const params = {
      BENCHMARK_ACTION: {
        command: "search[laptop under $500]",
        tool_name: "search",
        arguments: { query: "laptop under $500" },
      },
    };
    let lastResult: Record<string, unknown> = {};
    const p95 = measureP95(() => {
      lastResult = coerceParams(params);
    });
    expect(p95).toBeLessThanOrEqual(baseline.p95_ms);
    expect(lastResult).toEqual(params);
  });

  it("params-coerce-xml stays within budget and extracts fields", () => {
    const baseline = getBaseline("params-coerce-xml");
    const xml = [
      "<BENCHMARK_ACTION>",
      "<operation>CLICK</operation>",
      "<element_id>btn-submit</element_id>",
      "<value>confirm purchase</value>",
      "<command>CLICK(btn-submit)</command>",
      "<tool_name>ui.click</tool_name>",
      '<arguments>{"x":100,"y":200}</arguments>',
      "</BENCHMARK_ACTION>",
    ].join("\n");
    let lastResult: Record<string, unknown> = {};
    const p95 = measureP95(() => {
      lastResult = coerceParams(xml);
    });
    expect(p95).toBeLessThanOrEqual(baseline.p95_ms);
    expect(lastResult).toHaveProperty("BENCHMARK_ACTION");
    const inner = lastResult.BENCHMARK_ACTION as Record<string, unknown>;
    expect(inner.operation).toBe("CLICK");
    expect(inner.element_id).toBe("btn-submit");
    expect(inner.value).toBe("confirm purchase");
  });

  it("plugin-create stays within budget and returns valid plugin", () => {
    const baseline = getBaseline("plugin-create");
    let lastPlugin: ReturnType<typeof createBenchmarkPlugin> | undefined;
    const p95 = measureP95(() => {
      lastPlugin = createBenchmarkPlugin();
    });
    expect(p95).toBeLessThanOrEqual(baseline.p95_ms);
    expect(lastPlugin).toBeDefined();
    expect(lastPlugin!.name).toBe("eliza-benchmark");
    expect(lastPlugin!.providers).toHaveLength(1);
    expect(lastPlugin!.actions).toHaveLength(1);
    expect(lastPlugin!.providers![0].name).toBe("ELIZA_BENCHMARK");
    expect(lastPlugin!.actions![0].name).toBe("BENCHMARK_ACTION");
  });

  it("plugin-provider-get stays within budget", async () => {
    const baseline = getBaseline("plugin-provider-get");
    const plugin = createBenchmarkPlugin();
    const provider = plugin.providers?.find(
      (entry) => entry.name === "ELIZA_BENCHMARK",
    );
    if (!provider?.get) throw new Error("ELIZA_BENCHMARK provider not found");

    const context: BenchmarkContext = {
      benchmark: "tau-bench",
      taskId: "task-perf",
      goal: "Find order status for customer",
      tools: [
        {
          name: "lookup_order",
          description: "Look up a customer order by ID",
          parameters: {
            type: "object",
            properties: {
              order_id: { type: "string", description: "The order identifier" },
              customer_id: {
                type: "string",
                description: "The customer identifier",
              },
            },
            required: ["order_id"],
          },
        },
        {
          name: "cancel_order",
          description: "Cancel an existing order",
          parameters: {
            type: "object",
            properties: {
              order_id: { type: "string" },
              reason: { type: "string" },
            },
          },
        },
      ],
    };

    setBenchmarkContext(context);
    let lastResult: { text: string; values: Record<string, unknown> } = {
      text: "",
      values: {},
    };
    const p95 = await measureP95Async(async () => {
      lastResult = (await provider.get(
        {} as never,
        {} as never,
        {} as never,
      )) as typeof lastResult;
    });
    expect(p95).toBeLessThanOrEqual(baseline.p95_ms);
    expect(lastResult.text).toContain("# Benchmark Task");
    expect(lastResult.text).toContain("tau-bench");
    expect(lastResult.text).toContain("lookup_order");
    expect(lastResult.values).toMatchObject({
      hasBenchmark: true,
      benchmark: "tau-bench",
      taskId: "task-perf",
    });
  });

  it("plugin-action-handler stays within budget and captures action", async () => {
    const baseline = getBaseline("plugin-action-handler");
    const plugin = createBenchmarkPlugin();
    const action = plugin.actions?.find(
      (entry) => entry.name === "BENCHMARK_ACTION",
    );
    if (!action?.handler) throw new Error("BENCHMARK_ACTION not found");

    setBenchmarkContext({ benchmark: "agentbench", taskId: "task-perf" });
    const p95 = await measureP95Async(async () => {
      clearCapturedAction();
      await action.handler({} as never, {} as never, undefined as never, {
        parameters: {
          command: "search[laptop under $500]",
          tool_name: "search",
          arguments: '{"query":"laptop under $500"}',
        },
      });
    });
    expect(p95).toBeLessThanOrEqual(baseline.p95_ms);
    const captured = getCapturedAction();
    expect(captured).not.toBeNull();
    expect(captured?.command).toBe("search[laptop under $500]");
    expect(captured?.toolName).toBe("search");
    expect(captured?.arguments).toEqual({ query: "laptop under $500" });
  });

  it("action-to-params stays within budget and produces correct output", () => {
    const baseline = getBaseline("action-to-params");
    const captured = {
      command: "search[laptop under $500]",
      toolName: "search",
      arguments: { query: "laptop under $500" },
      operation: "SEARCH",
      elementId: "search-bar",
      value: "laptop under $500",
    };
    let lastResult: Record<string, unknown> = {};
    const p95 = measureP95(() => {
      lastResult = capturedActionToParams(captured);
    });
    expect(p95).toBeLessThanOrEqual(baseline.p95_ms);
    expect(lastResult).toHaveProperty("BENCHMARK_ACTION");
    const inner = lastResult.BENCHMARK_ACTION as Record<string, unknown>;
    expect(inner.command).toBe("search[laptop under $500]");
    expect(inner.tool_name).toBe("search");
    expect(inner.operation).toBe("SEARCH");
    expect(inner.element_id).toBe("search-bar");
    expect(inner.value).toBe("laptop under $500");
  });
});
