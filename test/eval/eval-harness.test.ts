/**
 * Agent benchmark evaluation harness.
 *
 * Validates the benchmark bridge contract by running golden prompts through
 * the plugin + server-utils pipeline and checking structural expectations:
 *
 *   - Provider output shape (text contains expected sections, values are correct)
 *   - Prompt composition (input text + context assembly)
 *   - Action validation (BENCHMARK_ACTION gate honors context presence)
 *   - Context normalization (field aliasing, session metadata injection)
 *   - Params coercion (JSON and XML parsing)
 *   - Captured action → params conversion
 *
 * Uses the deterministic mock plugin for model responses — no LLM API keys needed.
 * Gated behind MILADY_EVAL_TEST=1.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  BENCHMARK_MESSAGE_TEMPLATE,
  type BenchmarkContext,
  clearCapturedAction,
  createBenchmarkPlugin,
  getBenchmarkContext,
  getCapturedAction,
  setBenchmarkContext,
} from "../../packages/app-core/src/benchmark/plugin";
import { mockPlugin } from "../../packages/app-core/src/benchmark/mock-plugin-base";
import {
  capturedActionToParams,
  coerceActions,
  coerceParams,
  compactCuaResult,
  compactCuaStep,
  composeBenchmarkPrompt,
  createSession,
  envFlag,
  extractBenchmarkName,
  extractRecord,
  extractTaskId,
  formatUnknownError,
  isRecord,
  normalizeBenchmarkContext,
  parseBooleanValue,
  resolveHost,
  resolvePort,
  sessionKey,
  toPlugin,
} from "../../packages/app-core/src/benchmark/server-utils";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface PromptExpectations {
  provider_contains?: string[];
  provider_values?: Record<string, unknown>;
  provider_empty?: boolean;
  prompt_contains?: string[];
  action_validates?: boolean;
}

interface GoldenPrompt {
  id: string;
  benchmark: string;
  taskId: string;
  input: string;
  context: Record<string, unknown>;
  expectations: PromptExpectations;
}

interface GoldenPromptsFile {
  version: number;
  prompts: GoldenPrompt[];
}

const promptsPath = path.join(__dirname, "golden-prompts.json");
const promptsFile: GoldenPromptsFile = JSON.parse(
  fs.readFileSync(promptsPath, "utf8"),
);

const enabled = process.env.MILADY_EVAL_TEST === "1";

describe.skipIf(!enabled)("benchmark eval harness", () => {
  const plugin = createBenchmarkPlugin();
  const provider = plugin.providers?.find((p) => p.name === "ELIZA_BENCHMARK");
  const action = plugin.actions?.find((a) => a.name === "BENCHMARK_ACTION");

  if (!provider?.get || !action?.handler || !action.validate) {
    throw new Error("Benchmark plugin missing required provider or action");
  }

  afterEach(() => {
    clearCapturedAction();
    setBenchmarkContext(null);
  });

  describe("golden prompt provider contracts", () => {
    for (const prompt of promptsFile.prompts) {
      it(`${prompt.id}: provider output matches expectations`, async () => {
        const ctx: BenchmarkContext = {
          benchmark: prompt.benchmark,
          taskId: prompt.taskId,
          ...prompt.context,
        };

        if (prompt.expectations.provider_empty) {
          setBenchmarkContext(null);
          const result = await provider.get(
            {} as never,
            {} as never,
            {} as never,
          );
          expect(result.text).toBe("");
          expect(result.values).toEqual({});
          return;
        }

        setBenchmarkContext(ctx);
        const result = await provider.get(
          {} as never,
          {} as never,
          {} as never,
        );

        if (prompt.expectations.provider_contains) {
          for (const expected of prompt.expectations.provider_contains) {
            expect(result.text).toContain(expected);
          }
        }

        if (prompt.expectations.provider_values) {
          for (const [key, value] of Object.entries(
            prompt.expectations.provider_values,
          )) {
            expect((result.values as Record<string, unknown>)[key]).toEqual(
              value,
            );
          }
        }

        expect(result.data).toHaveProperty("benchmarkContext");
        const returnedCtx = (result.data as { benchmarkContext: unknown })
          .benchmarkContext as Record<string, unknown>;
        expect(returnedCtx.benchmark).toBe(prompt.benchmark);
        expect(returnedCtx.taskId).toBe(prompt.taskId);
      });
    }
  });

  describe("golden prompt composition contracts", () => {
    for (const prompt of promptsFile.prompts) {
      it(`${prompt.id}: composed prompt includes input and context`, () => {
        const composed = composeBenchmarkPrompt({
          text: prompt.input,
          context:
            Object.keys(prompt.context).length > 0
              ? prompt.context
              : undefined,
        });

        if (prompt.expectations.prompt_contains) {
          for (const expected of prompt.expectations.prompt_contains) {
            expect(composed).toContain(expected);
          }
        }

        expect(composed).toContain(prompt.input);

        if (Object.keys(prompt.context).length > 0) {
          expect(composed).toContain("BENCHMARK CONTEXT (authoritative):");
        }

        expect(composed).toContain(
          "Respond using normal Eliza action output",
        );
      });
    }
  });

  describe("golden prompt action validation contracts", () => {
    for (const prompt of promptsFile.prompts) {
      it(`${prompt.id}: action validates=${prompt.expectations.action_validates}`, async () => {
        if (prompt.expectations.action_validates) {
          setBenchmarkContext({
            benchmark: prompt.benchmark,
            taskId: prompt.taskId,
            ...prompt.context,
          });
          const valid = await action.validate({} as never);
          expect(valid).toBe(true);
        } else {
          setBenchmarkContext(null);
          const valid = await action.validate({} as never);
          expect(valid).toBe(false);
        }
      });
    }
  });

  describe("context normalization contracts", () => {
    it("normalizes action_space to actionSpace", () => {
      const session = createSession("task-1", "agentbench");
      const context = {
        action_space: ["search[q]", "click[id]"],
        goal: "test goal",
      };
      const normalized = normalizeBenchmarkContext(session, context);
      expect(normalized.actionSpace).toEqual(["search[q]", "click[id]"]);
      expect(normalized.benchmark).toBe("agentbench");
      expect(normalized.taskId).toBe("task-1");
    });

    it("preserves existing actionSpace over action_space", () => {
      const session = createSession("task-2", "tau-bench");
      const context = {
        actionSpace: ["existing"],
        action_space: ["should-not-override"],
      };
      const normalized = normalizeBenchmarkContext(session, context);
      expect(normalized.actionSpace).toEqual(["existing"]);
    });

    it("injects session metadata into normalized context", () => {
      const session = createSession("task-3", "mind2web");
      const context = { goal: "Click checkout" };
      const normalized = normalizeBenchmarkContext(session, context);
      expect(normalized.benchmark).toBe("mind2web");
      expect(normalized.taskId).toBe("task-3");
      expect(normalized.task_id).toBe("task-3");
    });
  });

  describe("session lifecycle contracts", () => {
    it("createSession produces unique IDs per call", () => {
      const s1 = createSession("task-1", "agentbench");
      const s2 = createSession("task-1", "agentbench");
      expect(s1.roomId).not.toBe(s2.roomId);
      expect(s1.relayRoomId).not.toBe(s2.relayRoomId);
      expect(s1.userEntityId).not.toBe(s2.userEntityId);
    });

    it("sessionKey is deterministic for same benchmark:taskId", () => {
      const s1 = createSession("task-x", "bench-y");
      const s2 = createSession("task-x", "bench-y");
      expect(sessionKey(s1)).toBe(sessionKey(s2));
      expect(sessionKey(s1)).toBe("bench-y:task-x");
    });

    it("normalizes empty taskId and benchmark", () => {
      const session = createSession("", "");
      expect(session.taskId).toBe("default-task");
      expect(session.benchmark).toBe("unknown");
    });
  });

  describe("params coercion contracts", () => {
    it("coerces JSON object passthrough", () => {
      const obj = { command: "search[laptop]" };
      expect(coerceParams(obj)).toEqual(obj);
    });

    it("coerces JSON string to object", () => {
      const result = coerceParams('{"command":"search[laptop]"}');
      expect(result).toEqual({ command: "search[laptop]" });
    });

    it("coerces XML string to nested object", () => {
      const xml = [
        "<BENCHMARK_ACTION>",
        "<operation>CLICK</operation>",
        "<element_id>42</element_id>",
        "<value></value>",
        "</BENCHMARK_ACTION>",
      ].join("\n");
      const result = coerceParams(xml);
      expect(result).toHaveProperty("BENCHMARK_ACTION");
      const inner = result.BENCHMARK_ACTION as Record<string, unknown>;
      expect(inner.operation).toBe("CLICK");
      expect(inner.element_id).toBe("42");
    });

    it("returns empty object for non-parseable string", () => {
      expect(coerceParams("just plain text")).toEqual({});
    });

    it("returns empty object for arrays", () => {
      expect(coerceParams(["a", "b"])).toEqual({});
    });

    it("returns empty object for null/undefined", () => {
      expect(coerceParams(null)).toEqual({});
      expect(coerceParams(undefined)).toEqual({});
    });
  });

  describe("action capture → params conversion contracts", () => {
    it("converts command-style capture", () => {
      const result = capturedActionToParams({
        command: "search[laptop under $500]",
      });
      expect(result).toEqual({
        BENCHMARK_ACTION: { command: "search[laptop under $500]" },
      });
    });

    it("converts tool-call capture", () => {
      const result = capturedActionToParams({
        toolName: "lookup_order",
        arguments: { order_id: "A-123" },
      });
      expect(result).toEqual({
        BENCHMARK_ACTION: {
          tool_name: "lookup_order",
          arguments: { order_id: "A-123" },
        },
      });
    });

    it("converts mind2web capture", () => {
      const result = capturedActionToParams({
        operation: "CLICK",
        elementId: "42",
        value: "",
      });
      // Empty string value is falsy, so capturedActionToParams omits it
      expect(result).toEqual({
        BENCHMARK_ACTION: {
          operation: "CLICK",
          element_id: "42",
        },
      });
    });

    it("converts mind2web capture with non-empty value", () => {
      const result = capturedActionToParams({
        operation: "TYPE",
        elementId: "input-1",
        value: "laptop under $500",
      });
      expect(result).toEqual({
        BENCHMARK_ACTION: {
          operation: "TYPE",
          element_id: "input-1",
          value: "laptop under $500",
        },
      });
    });

    it("returns empty for null capture", () => {
      expect(capturedActionToParams(null)).toEqual({});
    });

    it("returns empty for capture with no fields set", () => {
      expect(capturedActionToParams({})).toEqual({});
    });
  });

  describe("actions coercion contracts", () => {
    it("passes through string arrays", () => {
      expect(coerceActions(["BENCHMARK_ACTION", "REPLY"])).toEqual([
        "BENCHMARK_ACTION",
        "REPLY",
      ]);
    });

    it("filters non-string entries", () => {
      expect(coerceActions(["BENCHMARK_ACTION", 42, null, "REPLY"])).toEqual([
        "BENCHMARK_ACTION",
        "REPLY",
      ]);
    });

    it("returns empty for non-arrays", () => {
      expect(coerceActions("BENCHMARK_ACTION")).toEqual([]);
      expect(coerceActions(null)).toEqual([]);
      expect(coerceActions(undefined)).toEqual([]);
    });
  });

  describe("mock plugin deterministic model contract", () => {
    let callTextLarge: (prompt: unknown) => Promise<string>;

    beforeAll(() => {
      expect(mockPlugin.models).toBeDefined();
      expect(mockPlugin.models?.TEXT_LARGE).toBeDefined();
      expect(typeof mockPlugin.models?.TEXT_LARGE).toBe("function");
      const handler = mockPlugin.models!.TEXT_LARGE as (
        runtime: unknown,
        params: unknown,
      ) => Promise<string>;
      callTextLarge = (prompt: unknown) => handler({}, { prompt });
    });

    it("responds with RESPOND for shouldRespond prompts", async () => {
      const result = await callTextLarge(
        "Should you respond? Options: RESPOND | IGNORE | STOP. Pick one.",
      );
      expect(result).toContain("RESPOND");
    });

    it("responds with isFinish for finish-check prompts", async () => {
      const result = await callTextLarge(
        "Is this conversation finished? <isFinish>true | false</isFinish>",
      );
      expect(result).toContain("isFinish");
      expect(result).toContain("true");
    });

    it("responds with BENCHMARK_ACTION XML for benchmark prompts", async () => {
      const result = await callTextLarge(
        "Execute the benchmark task. Use BENCHMARK_ACTION.",
      );
      expect(result).toContain("<actions>BENCHMARK_ACTION</actions>");
      expect(result).toContain("<operation>CLICK</operation>");
      expect(result).toContain("<element_id>10</element_id>");
      expect(result).toContain("<tool_name>ui.click</tool_name>");
    });

    it("extracts embedded codes from prompt into response", async () => {
      const testUuid = "12345678-1234-1234-1234-123456789abc";
      const result = await callTextLarge(
        `initial code: ${testUuid}\nmiddle code: ${testUuid}\nend code: ${testUuid}`,
      );
      expect(result).toContain(`<one_initial_code>${testUuid}</one_initial_code>`);
      expect(result).toContain(`<one_middle_code>${testUuid}</one_middle_code>`);
      expect(result).toContain(`<one_end_code>${testUuid}</one_end_code>`);
    });

    it("falls back to DEFAULT_CODE when prompt has no matching UUID", async () => {
      const defaultCode = "00000000-0000-0000-0000-000000000000";
      const result = await callTextLarge(
        "Some prompt without any code labels",
      );
      expect(result).toContain(
        `<one_initial_code>${defaultCode}</one_initial_code>`,
      );
      expect(result).toContain(
        `<one_middle_code>${defaultCode}</one_middle_code>`,
      );
      expect(result).toContain(
        `<one_end_code>${defaultCode}</one_end_code>`,
      );
    });

    it("handles non-string prompt by stringifying", async () => {
      const result = await callTextLarge({ nested: "object" });
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("handles null/undefined prompt", async () => {
      const result = await callTextLarge(undefined);
      expect(typeof result).toBe("string");
    });

    it("shouldRespond branch takes priority over benchmark XML", async () => {
      const result = await callTextLarge(
        "RESPOND | IGNORE | STOP — also has BENCHMARK_ACTION",
      );
      expect(result).toContain("<action>RESPOND</action>");
      expect(result).not.toContain("<actions>BENCHMARK_ACTION</actions>");
    });
  });

  describe("BENCHMARK_ACTION handler contracts", () => {
    it("captures command-style params and stores via getCapturedAction", async () => {
      setBenchmarkContext({ benchmark: "agentbench", taskId: "handler-1" });
      const result = await action.handler(
        {} as never,
        {} as never,
        undefined as never,
        { parameters: { command: "search[laptop]" } },
      );
      const captured = getCapturedAction();
      expect(captured).not.toBeNull();
      expect(captured?.command).toBe("search[laptop]");
      expect(captured?.toolName).toBeUndefined();
      expect(result).toHaveProperty("text");
      expect(result).toHaveProperty("success", true);
      expect(result).toHaveProperty("values");
      expect((result as { values: { captured: boolean } }).values.captured).toBe(true);
      expect(result).toHaveProperty("data");
      expect((result as { data: { action: unknown } }).data.action).toEqual(captured);
    });

    it("captures tool-call params with valid JSON arguments", async () => {
      setBenchmarkContext({ benchmark: "tau-bench", taskId: "handler-2" });
      await action.handler({} as never, {} as never, undefined as never, {
        parameters: {
          tool_name: "lookup_order",
          arguments: '{"order_id":"A-123"}',
        },
      });
      const captured = getCapturedAction();
      expect(captured?.toolName).toBe("lookup_order");
      expect(captured?.arguments).toEqual({ order_id: "A-123" });
    });

    it("captures tool-call with invalid JSON as _raw fallback", async () => {
      setBenchmarkContext({ benchmark: "tau-bench", taskId: "handler-3" });
      await action.handler({} as never, {} as never, undefined as never, {
        parameters: {
          tool_name: "broken_tool",
          arguments: "{not valid json}",
        },
      });
      const captured = getCapturedAction();
      expect(captured?.toolName).toBe("broken_tool");
      expect(captured?.arguments).toEqual({ _raw: "{not valid json}" });
    });

    it("captures arguments as object when not a string", async () => {
      setBenchmarkContext({ benchmark: "tau-bench", taskId: "handler-4" });
      const argObj = { order_id: "B-456", status: "pending" };
      await action.handler({} as never, {} as never, undefined as never, {
        parameters: { tool_name: "check_status", arguments: argObj },
      });
      const captured = getCapturedAction();
      expect(captured?.arguments).toEqual(argObj);
    });

    it("captures mind2web operation/element_id/value", async () => {
      setBenchmarkContext({ benchmark: "mind2web", taskId: "handler-5" });
      await action.handler({} as never, {} as never, undefined as never, {
        parameters: {
          operation: "TYPE",
          element_id: "input-42",
          value: "hello world",
        },
      });
      const captured = getCapturedAction();
      expect(captured?.operation).toBe("TYPE");
      expect(captured?.elementId).toBe("input-42");
      expect(captured?.value).toBe("hello world");
    });

    it("handles protobuf Struct-style fields extraction", async () => {
      setBenchmarkContext({ benchmark: "mind2web", taskId: "handler-6" });
      await action.handler({} as never, {} as never, undefined as never, {
        parameters: {
          fields: {
            operation: { stringValue: "SELECT" },
            element_id: { stringValue: "dropdown-1" },
            value: { stringValue: "Option A" },
          },
        },
      });
      const captured = getCapturedAction();
      expect(captured?.operation).toBe("SELECT");
      expect(captured?.elementId).toBe("dropdown-1");
      expect(captured?.value).toBe("Option A");
    });

    it("handles empty/missing options gracefully", async () => {
      setBenchmarkContext({ benchmark: "agentbench", taskId: "handler-7" });
      await action.handler(
        {} as never,
        {} as never,
        undefined as never,
        undefined as never,
      );
      const captured = getCapturedAction();
      expect(captured).not.toBeNull();
      expect(captured?.command).toBeUndefined();
      expect(captured?.toolName).toBeUndefined();
    });

    it("clearCapturedAction resets to null", async () => {
      setBenchmarkContext({ benchmark: "agentbench", taskId: "handler-8" });
      await action.handler({} as never, {} as never, undefined as never, {
        parameters: { command: "test" },
      });
      expect(getCapturedAction()).not.toBeNull();
      clearCapturedAction();
      expect(getCapturedAction()).toBeNull();
    });
  });

  describe("getBenchmarkContext / setBenchmarkContext state contracts", () => {
    it("returns null when no context is set", () => {
      setBenchmarkContext(null);
      expect(getBenchmarkContext()).toBeNull();
    });

    it("returns the set context object", () => {
      const ctx: BenchmarkContext = {
        benchmark: "test",
        taskId: "state-1",
        goal: "verify state",
      };
      setBenchmarkContext(ctx);
      expect(getBenchmarkContext()).toBe(ctx);
    });

    it("overwrites previous context", () => {
      setBenchmarkContext({ benchmark: "first", taskId: "1" });
      const second: BenchmarkContext = { benchmark: "second", taskId: "2" };
      setBenchmarkContext(second);
      expect(getBenchmarkContext()).toBe(second);
    });
  });

  describe("BENCHMARK_MESSAGE_TEMPLATE contract", () => {
    it("contains required response format sections", () => {
      expect(BENCHMARK_MESSAGE_TEMPLATE).toContain("BENCHMARK_ACTION");
      expect(BENCHMARK_MESSAGE_TEMPLATE).toContain("{{agentName}}");
      expect(BENCHMARK_MESSAGE_TEMPLATE).toContain("{{providers}}");
      expect(BENCHMARK_MESSAGE_TEMPLATE).toContain("AgentBench");
      expect(BENCHMARK_MESSAGE_TEMPLATE).toContain("tau-bench");
      expect(BENCHMARK_MESSAGE_TEMPLATE).toContain("mind2web");
    });

    it("requires BENCHMARK_ACTION for action benchmarks", () => {
      expect(BENCHMARK_MESSAGE_TEMPLATE).toContain(
        "Always use BENCHMARK_ACTION",
      );
      expect(BENCHMARK_MESSAGE_TEMPLATE).toContain(
        "Never use REPLY for benchmarks that need tool/command execution",
      );
    });
  });

  describe("plugin structural contracts", () => {
    it("plugin has expected name and description", () => {
      expect(plugin.name).toBe("eliza-benchmark");
      expect(plugin.description).toContain("Benchmark adapter");
    });

    it("provider has correct metadata", () => {
      expect(provider.name).toBe("ELIZA_BENCHMARK");
      expect(provider.description).toContain("benchmark task context");
      expect((provider as { dynamic?: boolean }).dynamic).toBe(true);
      expect((provider as { position?: number }).position).toBe(-10);
    });

    it("action has similes covering common benchmark verbs", () => {
      const benchAction = plugin.actions?.find(
        (a) => a.name === "BENCHMARK_ACTION",
      );
      const similes = benchAction?.similes ?? [];
      expect(similes).toContain("SEARCH");
      expect(similes).toContain("CLICK");
      expect(similes).toContain("CALL_TOOL");
      expect(similes).toContain("SQL");
      expect(similes).toContain("TYPE");
      expect(similes).toContain("SELECT");
    });

    it("action has parameter definitions for all benchmark types", () => {
      const benchAction = plugin.actions?.find(
        (a) => a.name === "BENCHMARK_ACTION",
      );
      const paramNames = (
        benchAction?.parameters as Array<{ name: string }>
      )?.map((p) => p.name);
      expect(paramNames).toContain("command");
      expect(paramNames).toContain("tool_name");
      expect(paramNames).toContain("arguments");
      expect(paramNames).toContain("operation");
      expect(paramNames).toContain("element_id");
      expect(paramNames).toContain("value");
    });
  });

  describe("provider formatContextAsText edge cases", () => {
    it("truncates HTML longer than 3000 characters", async () => {
      const longHtml = "<div>" + "x".repeat(4000) + "</div>";
      setBenchmarkContext({
        benchmark: "mind2web",
        taskId: "long-html",
        html: longHtml,
      });
      const result = await provider.get({} as never, {} as never, {} as never);
      expect(result.text).toContain("Page HTML");
      expect(result.text).toContain("...");
      expect(result.text).not.toContain(longHtml);
    });

    it("limits elements to first 15", async () => {
      const elements = Array.from({ length: 20 }, (_, i) => ({
        backend_node_id: String(i),
        tag: "div",
        text_content: `Element ${i}`,
      }));
      setBenchmarkContext({
        benchmark: "mind2web",
        taskId: "many-elements",
        elements,
      });
      const result = await provider.get({} as never, {} as never, {} as never);
      expect(result.text).toContain("Element 14");
      expect(result.text).not.toContain("Element 15");
    });

    it("handles elements missing backend_node_id gracefully", async () => {
      setBenchmarkContext({
        benchmark: "mind2web",
        taskId: "no-id",
        elements: [{ tag: "button", text_content: "Click me" }],
      });
      const result = await provider.get({} as never, {} as never, {} as never);
      expect(result.text).toContain("[?]");
      expect(result.text).toContain("<button");
    });

    it("handles tool entries with missing fields", async () => {
      setBenchmarkContext({
        benchmark: "tau-bench",
        taskId: "sparse-tools",
        tools: [{ name: "minimal_tool" }, {}],
      });
      const result = await provider.get({} as never, {} as never, {} as never);
      expect(result.text).toContain("minimal_tool");
      expect(result.text).toContain("unknown");
    });

    it("renders observation as string when it is a string", async () => {
      setBenchmarkContext({
        benchmark: "agentbench",
        taskId: "string-obs",
        observation: "mysql> SELECT 1;",
      });
      const result = await provider.get({} as never, {} as never, {} as never);
      expect(result.text).toContain("Current Observation");
      expect(result.text).toContain("mysql> SELECT 1;");
    });

    it("renders question section for context-bench", async () => {
      setBenchmarkContext({
        benchmark: "context-bench",
        taskId: "question-1",
        question: "What is the meaning of life?",
      });
      const result = await provider.get({} as never, {} as never, {} as never);
      expect(result.text).toContain("## Question");
      expect(result.text).toContain("What is the meaning of life?");
    });

    it("renders empty actionSpace without Available Actions section", async () => {
      setBenchmarkContext({
        benchmark: "agentbench",
        taskId: "empty-actions",
        actionSpace: [],
      });
      const result = await provider.get({} as never, {} as never, {} as never);
      expect(result.text).not.toContain("Available Actions");
    });

    it("generates tau-bench instructions when tools are present", async () => {
      setBenchmarkContext({
        benchmark: "tau-bench",
        taskId: "tau-instructions",
        tools: [{ name: "t1", description: "Tool 1" }],
      });
      const result = await provider.get({} as never, {} as never, {} as never);
      expect(result.text).toContain("customer service agent");
      expect(result.text).toContain("MUST use the available tools");
    });

    it("generates generic instructions when no tools are present", async () => {
      setBenchmarkContext({
        benchmark: "agentbench",
        taskId: "generic-instructions",
        goal: "Do something",
      });
      const result = await provider.get({} as never, {} as never, {} as never);
      expect(result.text).toContain("Analyze the above context");
      expect(result.text).not.toContain("customer service agent");
    });
  });

  describe("integration: normalization → provider pipeline", () => {
    it("normalized context with action_space renders in provider output", async () => {
      const session = createSession("integration-1", "agentbench");
      const rawContext = {
        goal: "Buy a laptop",
        action_space: ["search[q]", "click[id]"],
      };
      const normalized = normalizeBenchmarkContext(session, rawContext);
      setBenchmarkContext(normalized);
      const result = await provider.get({} as never, {} as never, {} as never);
      expect(result.text).toContain("agentbench");
      expect(result.text).toContain("integration-1");
      expect(result.text).toContain("Buy a laptop");
      expect(result.text).toContain("Available Actions");
      expect(result.text).toContain("search[q]");
    });

    it("composed prompt feeds into mock model and produces parseable XML", async () => {
      const composed = composeBenchmarkPrompt({
        text: "Find laptop deals",
        context: { benchmark: "agentbench", taskId: "integration-2" },
      });
      const handler = mockPlugin.models!.TEXT_LARGE as (
        runtime: unknown,
        params: unknown,
      ) => Promise<string>;
      const modelOutput = await handler({}, { prompt: composed });
      // Mock model wraps in <response>; coerceParams parses outer XML level
      const parsedParams = coerceParams(modelOutput);
      expect(parsedParams).toHaveProperty("response");
      const response = parsedParams.response as Record<string, unknown>;
      expect(response).toHaveProperty("actions", "BENCHMARK_ACTION");
      expect(response).toHaveProperty("thought");

      // The inner params contain the BENCHMARK_ACTION nested XML
      const innerParams = coerceParams(response.params as string);
      expect(innerParams).toHaveProperty("BENCHMARK_ACTION");
      const benchAction = innerParams.BENCHMARK_ACTION as Record<
        string,
        unknown
      >;
      expect(benchAction).toHaveProperty("operation", "CLICK");
      expect(benchAction).toHaveProperty("element_id", "10");
    });

    it("handler output feeds into capturedActionToParams correctly", async () => {
      setBenchmarkContext({ benchmark: "agentbench", taskId: "integration-3" });
      clearCapturedAction();
      await action.handler({} as never, {} as never, undefined as never, {
        parameters: { command: "buy[item-42]" },
      });
      const captured = getCapturedAction();
      const params = capturedActionToParams(captured);
      expect(params).toEqual({
        BENCHMARK_ACTION: { command: "buy[item-42]" },
      });
    });
  });

  describe("compactCuaStep contracts", () => {
    it("wraps non-record input", () => {
      expect(compactCuaStep("not-an-object", false)).toEqual({
        step: "not-an-object",
      });
      expect(compactCuaStep(42, true)).toEqual({ step: 42 });
      expect(compactCuaStep(null, false)).toEqual({ step: null });
    });

    it("strips screenshot when includeScreenshots=false", () => {
      const step = {
        action: "click",
        screenshotAfterBase64: "base64data...",
      };
      const result = compactCuaStep(step, false);
      expect(result).not.toHaveProperty("screenshotAfterBase64");
      expect(result.hasScreenshot).toBe(true);
      expect(result.action).toBe("click");
    });

    it("preserves screenshot when includeScreenshots=true", () => {
      const step = {
        action: "type",
        screenshotAfterBase64: "base64data...",
      };
      const result = compactCuaStep(step, true);
      expect(result.screenshotAfterBase64).toBe("base64data...");
      expect(result.hasScreenshot).toBe(true);
    });

    it("sets hasScreenshot=false when no screenshot present", () => {
      const step = { action: "scroll" };
      expect(compactCuaStep(step, false).hasScreenshot).toBe(false);
      expect(compactCuaStep(step, true).hasScreenshot).toBe(false);
    });

    it("handles non-string screenshotAfterBase64", () => {
      const step = { action: "click", screenshotAfterBase64: 12345 };
      const result = compactCuaStep(step, true);
      expect(result.screenshotAfterBase64).toBeUndefined();
      expect(result.hasScreenshot).toBe(false);
    });
  });

  describe("compactCuaResult contracts", () => {
    it("wraps non-record input with unknown status", () => {
      expect(compactCuaResult("bad", false)).toEqual({
        status: "unknown",
        raw: "bad",
      });
      expect(compactCuaResult(null, true)).toEqual({
        status: "unknown",
        raw: null,
      });
    });

    it("compacts completed result steps", () => {
      const result = {
        status: "completed",
        steps: [
          { action: "click", screenshotAfterBase64: "img1" },
          { action: "type", screenshotAfterBase64: "img2" },
        ],
      };
      const compacted = compactCuaResult(result, false);
      const steps = compacted.steps as Array<Record<string, unknown>>;
      expect(steps).toHaveLength(2);
      expect(steps[0]).not.toHaveProperty("screenshotAfterBase64");
      expect(steps[0].hasScreenshot).toBe(true);
      expect(steps[1].action).toBe("type");
    });

    it("preserves screenshots in completed result when requested", () => {
      const result = {
        status: "completed",
        steps: [{ action: "click", screenshotAfterBase64: "img1" }],
      };
      const compacted = compactCuaResult(result, true);
      const steps = compacted.steps as Array<Record<string, unknown>>;
      expect(steps[0].screenshotAfterBase64).toBe("img1");
    });

    it("compacts failed result the same as completed", () => {
      const result = {
        status: "failed",
        error: "timeout",
        steps: [{ action: "wait", screenshotAfterBase64: "err-img" }],
      };
      const compacted = compactCuaResult(result, false);
      expect(compacted.error).toBe("timeout");
      const steps = compacted.steps as Array<Record<string, unknown>>;
      expect(steps[0].hasScreenshot).toBe(true);
      expect(steps[0]).not.toHaveProperty("screenshotAfterBase64");
    });

    it("handles completed result with no steps array", () => {
      const result = { status: "completed" };
      const compacted = compactCuaResult(result, false);
      expect(compacted.steps).toEqual([]);
    });

    it("compacts paused_for_approval with pending screenshots", () => {
      const result = {
        status: "paused_for_approval",
        pending: {
          screenshotBeforeBase64: "before-img",
          stepsSoFar: [
            { action: "navigate", screenshotAfterBase64: "step-img" },
          ],
          approvalRequired: true,
        },
      };
      const compacted = compactCuaResult(result, false);
      const pending = compacted.pending as Record<string, unknown>;
      expect(pending).not.toHaveProperty("screenshotBeforeBase64");
      expect(pending.hasScreenshotBefore).toBe(true);
      expect(pending.approvalRequired).toBe(true);
      const steps = pending.stepsSoFar as Array<Record<string, unknown>>;
      expect(steps[0].hasScreenshot).toBe(true);
      expect(steps[0]).not.toHaveProperty("screenshotAfterBase64");
    });

    it("preserves pending screenshots when requested", () => {
      const result = {
        status: "paused_for_approval",
        pending: {
          screenshotBeforeBase64: "before-img",
          stepsSoFar: [],
        },
      };
      const compacted = compactCuaResult(result, true);
      const pending = compacted.pending as Record<string, unknown>;
      expect(pending.screenshotBeforeBase64).toBe("before-img");
      expect(pending.hasScreenshotBefore).toBe(true);
    });

    it("handles paused_for_approval with non-record pending", () => {
      const result = { status: "paused_for_approval", pending: "broken" };
      const compacted = compactCuaResult(result, false);
      const pending = compacted.pending as Record<string, unknown>;
      expect(pending.hasScreenshotBefore).toBe(false);
      expect(pending.stepsSoFar).toEqual([]);
    });

    it("passes through unknown status as shallow copy", () => {
      const result = { status: "running", progress: 50 };
      const compacted = compactCuaResult(result, false);
      expect(compacted.status).toBe("running");
      expect(compacted.progress).toBe(50);
      expect(compacted).not.toBe(result);
    });

    it("handles result with no status field", () => {
      const result = { someField: "value" };
      const compacted = compactCuaResult(result, false);
      expect(compacted.someField).toBe("value");
      expect(compacted).not.toBe(result);
    });
  });

  describe("server-utils boundary cases", () => {
    it("isRecord identifies plain objects", () => {
      expect(isRecord({})).toBe(true);
      expect(isRecord({ key: "value" })).toBe(true);
    });

    it("isRecord rejects non-objects", () => {
      expect(isRecord(null)).toBe(false);
      expect(isRecord(undefined)).toBe(false);
      expect(isRecord(42)).toBe(false);
      expect(isRecord("string")).toBe(false);
      expect(isRecord([])).toBe(false);
      expect(isRecord(true)).toBe(false);
    });

    it("envFlag reads process.env and returns boolean", () => {
      const key = "__MILADY_TEST_ENVFLAG__";
      const saved = process.env[key];
      try {
        process.env[key] = "1";
        expect(envFlag(key)).toBe(true);
        process.env[key] = "0";
        expect(envFlag(key)).toBe(false);
        delete process.env[key];
        expect(envFlag(key)).toBe(false);
      } finally {
        if (saved !== undefined) process.env[key] = saved;
        else delete process.env[key];
      }
    });

    it("parseBooleanValue handles all truthy/falsy variants", () => {
      for (const val of ["1", "true", "yes", "y", "on", "TRUE", "Yes", "ON"]) {
        expect(parseBooleanValue(val)).toBe(true);
      }
      for (const val of [
        "0",
        "false",
        "no",
        "n",
        "off",
        "FALSE",
        "No",
        "OFF",
      ]) {
        expect(parseBooleanValue(val)).toBe(false);
      }
    });

    it("parseBooleanValue returns default for unrecognized values", () => {
      expect(parseBooleanValue("maybe")).toBe(false);
      expect(parseBooleanValue("maybe", true)).toBe(true);
      expect(parseBooleanValue(undefined)).toBe(false);
      expect(parseBooleanValue(null)).toBe(false);
    });

    it("parseBooleanValue handles boolean and number inputs", () => {
      expect(parseBooleanValue(true)).toBe(true);
      expect(parseBooleanValue(false)).toBe(false);
      expect(parseBooleanValue(1)).toBe(true);
      expect(parseBooleanValue(0)).toBe(false);
      expect(parseBooleanValue(42)).toBe(true);
    });

    it("formatUnknownError formats Error instances", () => {
      expect(formatUnknownError(new Error("test error"))).toBe(
        "Error: test error",
      );
      expect(formatUnknownError(new TypeError("bad type"))).toBe(
        "TypeError: bad type",
      );
    });

    it("formatUnknownError stringifies non-Error values", () => {
      expect(formatUnknownError("plain string")).toBe("plain string");
      expect(formatUnknownError(42)).toBe("42");
      expect(formatUnknownError(null)).toBe("null");
    });

    it("extractRecord returns object for valid record input", () => {
      expect(extractRecord({ key: "val" })).toEqual({ key: "val" });
    });

    it("extractRecord returns undefined for non-objects", () => {
      expect(extractRecord(null)).toBeUndefined();
      expect(extractRecord(undefined)).toBeUndefined();
      expect(extractRecord("string")).toBeUndefined();
      expect(extractRecord(42)).toBeUndefined();
      expect(extractRecord([])).toBeUndefined();
    });

    it("extractTaskId handles snake_case and camelCase", () => {
      expect(extractTaskId({ task_id: "snake" })).toBe("snake");
      expect(extractTaskId({ taskId: "camel" })).toBe("camel");
      expect(extractTaskId({ task_id: "snake", taskId: "camel" })).toBe(
        "snake",
      );
    });

    it("extractTaskId defaults to 'default-task'", () => {
      expect(extractTaskId(undefined)).toBe("default-task");
      expect(extractTaskId({})).toBe("default-task");
      expect(extractTaskId({ task_id: "" })).toBe("default-task");
      expect(extractTaskId({ task_id: "   " })).toBe("default-task");
    });

    it("extractBenchmarkName extracts benchmark field", () => {
      expect(extractBenchmarkName({ benchmark: "agentbench" })).toBe(
        "agentbench",
      );
    });

    it("extractBenchmarkName defaults to 'unknown'", () => {
      expect(extractBenchmarkName(undefined)).toBe("unknown");
      expect(extractBenchmarkName({})).toBe("unknown");
      expect(extractBenchmarkName({ benchmark: "" })).toBe("unknown");
      expect(extractBenchmarkName({ benchmark: "  " })).toBe("unknown");
    });

    it("toPlugin accepts valid plugin-like objects", () => {
      const validPlugin = { name: "test-plugin", description: "A test" };
      expect(() => toPlugin(validPlugin, "test")).not.toThrow();
      expect(toPlugin(validPlugin, "test")).toBe(validPlugin);
    });

    it("toPlugin rejects non-objects", () => {
      expect(() => toPlugin(null, "test")).toThrow("not an object");
      expect(() => toPlugin(undefined, "test")).toThrow("not an object");
      expect(() => toPlugin("string", "test")).toThrow("not an object");
    });

    it("toPlugin rejects objects without a name", () => {
      expect(() => toPlugin({}, "test")).toThrow("missing a valid name");
      expect(() => toPlugin({ name: "" }, "test")).toThrow(
        "missing a valid name",
      );
      expect(() => toPlugin({ name: 42 }, "test")).toThrow(
        "missing a valid name",
      );
    });

    it("resolvePort returns DEFAULT_PORT when env is unset", () => {
      const saved = process.env.ELIZA_BENCH_PORT;
      delete process.env.ELIZA_BENCH_PORT;
      try {
        expect(resolvePort()).toBe(3939);
      } finally {
        if (saved !== undefined) process.env.ELIZA_BENCH_PORT = saved;
      }
    });

    it("resolvePort returns parsed value for valid port", () => {
      const saved = process.env.ELIZA_BENCH_PORT;
      process.env.ELIZA_BENCH_PORT = "8080";
      try {
        expect(resolvePort()).toBe(8080);
      } finally {
        if (saved !== undefined) process.env.ELIZA_BENCH_PORT = saved;
        else delete process.env.ELIZA_BENCH_PORT;
      }
    });

    it("resolvePort floors fractional port values", () => {
      const saved = process.env.ELIZA_BENCH_PORT;
      process.env.ELIZA_BENCH_PORT = "3000.7";
      try {
        expect(resolvePort()).toBe(3000);
      } finally {
        if (saved !== undefined) process.env.ELIZA_BENCH_PORT = saved;
        else delete process.env.ELIZA_BENCH_PORT;
      }
    });

    it("resolvePort falls back for port 0", () => {
      const saved = process.env.ELIZA_BENCH_PORT;
      process.env.ELIZA_BENCH_PORT = "0";
      try {
        expect(resolvePort()).toBe(3939);
      } finally {
        if (saved !== undefined) process.env.ELIZA_BENCH_PORT = saved;
        else delete process.env.ELIZA_BENCH_PORT;
      }
    });

    it("resolvePort falls back for negative port", () => {
      const saved = process.env.ELIZA_BENCH_PORT;
      process.env.ELIZA_BENCH_PORT = "-1";
      try {
        expect(resolvePort()).toBe(3939);
      } finally {
        if (saved !== undefined) process.env.ELIZA_BENCH_PORT = saved;
        else delete process.env.ELIZA_BENCH_PORT;
      }
    });

    it("resolvePort falls back for port > 65535", () => {
      const saved = process.env.ELIZA_BENCH_PORT;
      process.env.ELIZA_BENCH_PORT = "65536";
      try {
        expect(resolvePort()).toBe(3939);
      } finally {
        if (saved !== undefined) process.env.ELIZA_BENCH_PORT = saved;
        else delete process.env.ELIZA_BENCH_PORT;
      }
    });

    it("resolvePort falls back for non-numeric string", () => {
      const saved = process.env.ELIZA_BENCH_PORT;
      process.env.ELIZA_BENCH_PORT = "not-a-number";
      try {
        expect(resolvePort()).toBe(3939);
      } finally {
        if (saved !== undefined) process.env.ELIZA_BENCH_PORT = saved;
        else delete process.env.ELIZA_BENCH_PORT;
      }
    });

    it("resolvePort accepts boundary port 1", () => {
      const saved = process.env.ELIZA_BENCH_PORT;
      process.env.ELIZA_BENCH_PORT = "1";
      try {
        expect(resolvePort()).toBe(1);
      } finally {
        if (saved !== undefined) process.env.ELIZA_BENCH_PORT = saved;
        else delete process.env.ELIZA_BENCH_PORT;
      }
    });

    it("resolvePort accepts boundary port 65535", () => {
      const saved = process.env.ELIZA_BENCH_PORT;
      process.env.ELIZA_BENCH_PORT = "65535";
      try {
        expect(resolvePort()).toBe(65535);
      } finally {
        if (saved !== undefined) process.env.ELIZA_BENCH_PORT = saved;
        else delete process.env.ELIZA_BENCH_PORT;
      }
    });

    it("resolveHost returns DEFAULT_HOST when env is unset", () => {
      const saved = process.env.ELIZA_BENCH_HOST;
      delete process.env.ELIZA_BENCH_HOST;
      try {
        expect(resolveHost()).toBe("127.0.0.1");
      } finally {
        if (saved !== undefined) process.env.ELIZA_BENCH_HOST = saved;
        else delete process.env.ELIZA_BENCH_HOST;
      }
    });

    it("resolveHost accepts 127.0.0.1", () => {
      const saved = process.env.ELIZA_BENCH_HOST;
      process.env.ELIZA_BENCH_HOST = "127.0.0.1";
      try {
        expect(resolveHost()).toBe("127.0.0.1");
      } finally {
        if (saved !== undefined) process.env.ELIZA_BENCH_HOST = saved;
        else delete process.env.ELIZA_BENCH_HOST;
      }
    });

    it("resolveHost accepts ::1", () => {
      const saved = process.env.ELIZA_BENCH_HOST;
      process.env.ELIZA_BENCH_HOST = "::1";
      try {
        expect(resolveHost()).toBe("::1");
      } finally {
        if (saved !== undefined) process.env.ELIZA_BENCH_HOST = saved;
        else delete process.env.ELIZA_BENCH_HOST;
      }
    });

    it("resolveHost accepts localhost", () => {
      const saved = process.env.ELIZA_BENCH_HOST;
      process.env.ELIZA_BENCH_HOST = "localhost";
      try {
        expect(resolveHost()).toBe("localhost");
      } finally {
        if (saved !== undefined) process.env.ELIZA_BENCH_HOST = saved;
        else delete process.env.ELIZA_BENCH_HOST;
      }
    });

    it("resolveHost rejects non-loopback addresses", () => {
      const saved = process.env.ELIZA_BENCH_HOST;
      process.env.ELIZA_BENCH_HOST = "0.0.0.0";
      try {
        expect(resolveHost()).toBe("127.0.0.1");
      } finally {
        if (saved !== undefined) process.env.ELIZA_BENCH_HOST = saved;
        else delete process.env.ELIZA_BENCH_HOST;
      }
    });

    it("resolveHost rejects external hostnames", () => {
      const saved = process.env.ELIZA_BENCH_HOST;
      process.env.ELIZA_BENCH_HOST = "example.com";
      try {
        expect(resolveHost()).toBe("127.0.0.1");
      } finally {
        if (saved !== undefined) process.env.ELIZA_BENCH_HOST = saved;
        else delete process.env.ELIZA_BENCH_HOST;
      }
    });

    it("resolveHost trims whitespace", () => {
      const saved = process.env.ELIZA_BENCH_HOST;
      process.env.ELIZA_BENCH_HOST = "  localhost  ";
      try {
        expect(resolveHost()).toBe("localhost");
      } finally {
        if (saved !== undefined) process.env.ELIZA_BENCH_HOST = saved;
        else delete process.env.ELIZA_BENCH_HOST;
      }
    });

    it("resolveHost falls back for empty string", () => {
      const saved = process.env.ELIZA_BENCH_HOST;
      process.env.ELIZA_BENCH_HOST = "";
      try {
        expect(resolveHost()).toBe("127.0.0.1");
      } finally {
        if (saved !== undefined) process.env.ELIZA_BENCH_HOST = saved;
        else delete process.env.ELIZA_BENCH_HOST;
      }
    });

    it("composeBenchmarkPrompt omits context section for empty context", () => {
      const result = composeBenchmarkPrompt({ text: "Hello" });
      expect(result).toContain("Hello");
      expect(result).not.toContain("BENCHMARK CONTEXT");
      expect(result).toContain("Respond using normal Eliza action output");
    });

    it("composeBenchmarkPrompt includes image payload when provided", () => {
      const result = composeBenchmarkPrompt({
        text: "Describe this",
        image: { type: "base64", data: "abc123" },
      });
      expect(result).toContain("IMAGE PAYLOAD:");
      expect(result).toContain("abc123");
    });

    it("coerceParams: JSON string with array value returns empty", () => {
      expect(coerceParams("[1, 2, 3]")).toEqual({});
    });

    it("coerceParams: empty string returns empty", () => {
      expect(coerceParams("")).toEqual({});
    });

    it("coerceParams: whitespace string returns empty", () => {
      expect(coerceParams("   ")).toEqual({});
    });

    it("coerceParams: XML with multiple root tags extracts all", () => {
      const xml = [
        "<ACTION_A><field>value_a</field></ACTION_A>",
        "<ACTION_B><field>value_b</field></ACTION_B>",
      ].join("\n");
      const result = coerceParams(xml);
      expect(result).toHaveProperty("ACTION_A");
      expect(result).toHaveProperty("ACTION_B");
      expect(
        (result.ACTION_A as Record<string, unknown>).field,
      ).toBe("value_a");
    });

    it("coerceParams: XML tag with no child tags returns body as string", () => {
      const result = coerceParams("<SIMPLE>just text</SIMPLE>");
      expect(result).toEqual({ SIMPLE: "just text" });
    });

    it("session fields are UUID-shaped strings", () => {
      const session = createSession("test", "bench");
      const uuidPattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
      expect(session.roomId).toMatch(uuidPattern);
      expect(session.relayRoomId).toMatch(uuidPattern);
      expect(session.userEntityId).toMatch(uuidPattern);
    });

    it("session with whitespace-only taskId normalizes", () => {
      const session = createSession("   ", "   ");
      expect(session.taskId).toBe("default-task");
      expect(session.benchmark).toBe("unknown");
    });
  });
});
