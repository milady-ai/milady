import type { AgentRuntime } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import {
  runtimeKnowledgeEnabled,
  runtimeTrajectoriesEnabled,
} from "../native-runtime-features.js";

describe("native runtime feature probes", () => {
  it("calls feature methods with the runtime instance bound", () => {
    const runtime = {
      nativeFeatureStates: {
        knowledge: false,
        trajectories: true,
      },
      isKnowledgeEnabled() {
        return this.nativeFeatureStates.knowledge;
      },
      isTrajectoriesEnabled() {
        return this.nativeFeatureStates.trajectories;
      },
    } as unknown as AgentRuntime;

    expect(runtimeKnowledgeEnabled(runtime)).toBe(false);
    expect(runtimeTrajectoriesEnabled(runtime)).toBe(true);
  });
});
