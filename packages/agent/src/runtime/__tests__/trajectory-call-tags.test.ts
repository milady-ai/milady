import { describe, expect, it } from "vitest";
import {
  enrichTrajectoryLlmCall,
  inferTrajectoryLlmStepType,
} from "../trajectory-internals";

describe("trajectory call tagging", () => {
  it("derives a stable should_respond step type and tags", () => {
    const call = enrichTrajectoryLlmCall({
      model: "claude-haiku",
      purpose: "should_respond",
      actionType: "runtime.useModel",
    });

    expect(call.stepType).toBe("should_respond");
    expect(call.tags).toEqual(
      expect.arrayContaining([
        "llm",
        "step:should_respond",
        "purpose:should_respond",
        "action:runtime_use_model",
        "routing",
      ]),
    );
  });

  it("collapses orchestrator decisions into a stable step type", () => {
    expect(
      inferTrajectoryLlmStepType({
        purpose: "turn-complete",
        actionType: "orchestrator.useModel",
      }),
    ).toBe("turn_complete");

    const call = enrichTrajectoryLlmCall({
      purpose: "turn-complete",
      actionType: "orchestrator.useModel",
    });
    expect(call.tags).toEqual(
      expect.arrayContaining([
        "step:turn_complete",
        "purpose:turn_complete",
        "action:orchestrator_use_model",
        "orchestrator",
      ]),
    );
  });

  it("normalizes existing tags and removes duplicates", () => {
    const call = enrichTrajectoryLlmCall({
      purpose: "action",
      actionType: "runtime.useModel",
      tags: ["Routing", "routing", "step:Action"],
    });

    expect(call.stepType).toBe("action");
    expect(call.tags).toEqual(
      expect.arrayContaining([
        "routing",
        "step:action",
        "purpose:action",
        "action:runtime_use_model",
      ]),
    );
    expect(
      call.tags?.filter((tag) => tag === "routing").length,
    ).toBeLessThanOrEqual(1);
  });
});
