import { expect, test } from "bun:test";
import { createToolRegistry } from "../src/bun/agent/tool-registry";

test("deterministic fallback does not require a model provider", () => {
  const registry = createToolRegistry();
  const output = registry.planDeterministic({ prompt: "Help me organize notes", mode: "dry-run" });
  expect(output.summary.length).toBeGreaterThan(0);
  expect(output.proposedActions[0]?.requiresConfirmation).toBe(false);
});
