import { describe, expect, test, vi } from "vitest";
import type { TrainingSample } from "./dataset-generator";

const mockWithStandaloneTrajectory = vi.fn(
  async (
    _runtime: unknown,
    _options: Record<string, unknown>,
    callback: () => Promise<unknown>,
  ) => await callback(),
);
const mockLogActiveTrajectoryLlmCall = vi.fn();

vi.mock("@elizaos/core", () => ({
  withStandaloneTrajectory: mockWithStandaloneTrajectory,
  logActiveTrajectoryLlmCall: mockLogActiveTrajectoryLlmCall,
}));

const { ALL_BLUEPRINTS } = await import("./scenario-blueprints");
const { toGeminiFormat } = await import("./dataset-generator");
const {
  buildRoleplayEpisode,
  toRoleplayManifestLine,
} = await import("./roleplay-trajectories");
const {
  buildVertexModelPreferencePatch,
  normalizeVertexBaseModel,
} = await import("./vertex-tuning");

const sample: TrainingSample = {
  id: "sample-1",
  blueprintId: "bp-1",
  agentName: "Nova",
  messages: [
    { role: "user", name: "Alice", content: "ETH is ripping again." },
    { role: "user", name: "Bob", content: "Nova can you swap half to USDC?" },
  ],
  expectedOutput: {
    decision: "RESPOND",
    primaryContext: "wallet",
    secondaryContexts: ["automation"],
    reasoning: "Direct wallet request to the agent.",
    expectedAction: "SWAP_TOKEN",
  },
  metadata: {
    platform: "discord",
    pattern: "group_direct_mention",
    turnCount: 2,
    generatedBy: "test",
    generatedAt: new Date(0).toISOString(),
    variant: 0,
    totalVariants: 1,
  },
};

describe("training pipeline", () => {
  test("expands canonical blueprints to a large corpus", () => {
    expect(ALL_BLUEPRINTS.length).toBeGreaterThan(1000);
  });

  test("renders Gemini tuning examples with shouldRespond prompt fields", () => {
    const example = toGeminiFormat(sample, true);
    expect(example.messages[0]?.content).toContain("available_contexts:");
    expect(example.messages[0]?.content).toContain("context_routing:");
    expect(example.messages[0]?.content).toContain("actions:");
    expect(example.messages[2]?.content).toContain("action: RESPOND");
    expect(example.messages[2]?.content).toContain("primaryContext: wallet");
    expect(example.messages[2]?.content).toContain("evidenceTurnIds:");
  });

  test("builds roleplay episodes with a marked evaluation turn", () => {
    const episode = buildRoleplayEpisode(sample);
    expect(episode.evaluationTurnId).toBe("turn-002");
    expect(episode.turns[1]?.isEvaluationTarget).toBe(true);

    const manifest = toRoleplayManifestLine(episode);
    expect(manifest.expectedDecision).toBe("RESPOND");
    expect(manifest.conversation).toHaveLength(2);
  });

  test("maps tuned models into the correct runtime slots", () => {
    expect(normalizeVertexBaseModel(undefined, "should_respond")).toBe(
      "gemini-2.5-flash-lite",
    );
    expect(normalizeVertexBaseModel(undefined, "action_planner")).toBe(
      "gemini-2.5-flash",
    );

    const shouldRespondPatch = buildVertexModelPreferencePatch({
      slot: "should_respond",
      tunedModelId: "projects/demo/locations/us-central1/models/tuned-1",
    });
    expect(shouldRespondPatch.modelPreferences.shouldRespondModel).toBe(
      "projects/demo/locations/us-central1/models/tuned-1",
    );
    expect(shouldRespondPatch.modelPreferences.responseHandlerModel).toBe(
      "projects/demo/locations/us-central1/models/tuned-1",
    );

    const plannerPatch = buildVertexModelPreferencePatch({
      slot: "action_planner",
      tunedModelId: "projects/demo/locations/us-central1/models/tuned-2",
      scope: "user",
      ownerId: "user-1",
    });
    expect(plannerPatch.scope).toBe("user");
    expect(plannerPatch.ownerId).toBe("user-1");
    expect(plannerPatch.modelPreferences.actionPlannerModel).toBe(
      "projects/demo/locations/us-central1/models/tuned-2",
    );
    expect(plannerPatch.modelPreferences.plannerModel).toBe(
      "projects/demo/locations/us-central1/models/tuned-2",
    );
  });
});
