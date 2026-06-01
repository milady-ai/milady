import type { AgentRunInput } from "../../shared/rpc";
import type { AppError } from "../../shared/domain";

export function createSafetyPolicy() {
  return {
    evaluateInput(input: AgentRunInput): { allowed: true } | { allowed: false; error: AppError } {
      if (input.prompt.length > 20_000) {
        return { allowed: false, error: { code: "invalid-input", message: "Prompt is too large.", recoverable: true } };
      }
      if (/\b(api[_-]?key|password|secret|token)\b/i.test(input.prompt)) {
        return { allowed: false, error: { code: "invalid-input", message: "Remove secrets before using the agent.", recoverable: true } };
      }
      return { allowed: true };
    },
  };
}
