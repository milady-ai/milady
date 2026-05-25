import type { AgentRunInput, AgentRunOutput } from "../../shared/rpc";
import type { Result } from "../../shared/domain";
import { withTimeout } from "../../shared/validation";
import { createModelRouter } from "./model-router";
import { createToolRegistry } from "./tool-registry";
import { createSafetyPolicy } from "./safety-policy";

export function createAgentOrchestrator() {
  const modelRouter = createModelRouter();
  const tools = createToolRegistry();
  const safety = createSafetyPolicy();
  const runs = new Map<string, AbortController>();

  return {
    async run(input: AgentRunInput): Promise<Result<AgentRunOutput>> {
      const runId = crypto.randomUUID();
      const controller = new AbortController();
      runs.set(runId, controller);
      try {
        const decision = safety.evaluateInput(input);
        if (!decision.allowed) return { ok: false, error: decision.error };

        const route = await modelRouter.selectRoute(input);
        if (route.kind === "deterministic") {
          return { ok: true, value: tools.planDeterministic(input) };
        }

        const output = await withTimeout(
          route.generateStructured(input, { signal: controller.signal, tools }),
          25_000,
          "agent run",
          controller.signal,
        );
        return { ok: true, value: output };
      } catch (error) {
        if (controller.signal.aborted) {
          return { ok: false, error: { code: "cancelled", message: "The agent run was cancelled.", recoverable: true } };
        }
        return { ok: false, error: { code: "tool-failed", message: error instanceof Error ? error.message : "Agent run failed.", recoverable: true } };
      } finally {
        runs.delete(runId);
      }
    },
    async cancel(runId: string): Promise<Result<{ cancelled: boolean }>> {
      const controller = runs.get(runId);
      if (!controller) return { ok: true, value: { cancelled: false } };
      controller.abort();
      return { ok: true, value: { cancelled: true } };
    },
  };
}
