import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import type { AgentRuntime, Content } from "@elizaos/core";
import type { Trajectory } from "../types/trajectory";
import type { RoleplayEpisode } from "./roleplay-trajectories";
import {
  buildRoleplayExecutionReport,
  executeRoleplayEpisode,
  executeRoleplayEpisodes,
  exportRoleplayExecutionResults,
} from "./roleplay-executor";

const GROUP_CHANNEL = "GROUP";

function createRuntimeWithTrajectory(trajectory: Trajectory): AgentRuntime {
  const logger = {
    getTrajectoryDetail: vi.fn(async () => trajectory),
  };

  return {
    agentId: "00000000-0000-0000-0000-000000000111",
    character: {
      name: "Nova",
    },
    createMemory: vi.fn(async () => undefined),
    ensureConnection: vi.fn(async () => undefined),
    getActionResults: vi.fn(() => [{ actionName: "SWAP_TOKEN" }]),
    getServicesByType: vi.fn(() => [logger]),
    getService: vi.fn(() => logger),
    messageService: {
      handleMessage: vi.fn(
        async (
          _runtime: AgentRuntime,
          _message: unknown,
          callback?: (content: Content) => Promise<unknown>,
        ) => {
          await callback?.({
            text: "Swapping now.",
            actions: ["SWAP_TOKEN"],
            source: "discord",
            channelType: GROUP_CHANNEL,
          });

          return {
            didRespond: true,
            responseContent: {
              text: "Swapping now.",
              actions: ["SWAP_TOKEN"],
              source: "discord",
              channelType: GROUP_CHANNEL,
            },
            responseMessages: [],
            state: { values: {}, data: {} },
            mode: "actions",
          };
        },
      ),
    },
  } as unknown as AgentRuntime;
}

function createRuntimeWithDelayedTrajectory(
  trajectory: Trajectory,
  missingAfterAttempts = false,
): AgentRuntime {
  let attempts = 0;
  const logger = {
    getTrajectoryDetail: vi.fn(async () => {
      attempts += 1;
      if (missingAfterAttempts) {
        return null;
      }
      return attempts >= 3 ? trajectory : null;
    }),
  };

  return {
    agentId: "00000000-0000-0000-0000-000000000111",
    character: {
      name: "Nova",
    },
    createMemory: vi.fn(async () => undefined),
    ensureConnection: vi.fn(async () => undefined),
    getActionResults: vi.fn(() => []),
    getServicesByType: vi.fn(() => [logger]),
    getService: vi.fn(() => logger),
    messageService: {
      handleMessage: vi.fn(async () => ({
        didRespond: false,
        responseContent: null,
        responseMessages: [],
        state: { values: {}, data: {} },
        mode: "ignore",
      })),
    },
  } as unknown as AgentRuntime;
}

const episode: RoleplayEpisode = {
  id: "episode-1",
  blueprintId: "respond-wallet-swap-001",
  agentName: "Nova",
  platform: "discord",
  roomType: "group",
  primaryContext: "wallet",
  secondaryContexts: ["automation"],
  expectedDecision: "RESPOND",
  expectedAction: "SWAP_TOKEN",
  evaluationTurnId: "turn-002",
  turns: [
    {
      id: "turn-001",
      role: "participant",
      speaker: "Alice",
      content: "ETH is pumping again.",
      isEvaluationTarget: false,
    },
    {
      id: "turn-002",
      role: "participant",
      speaker: "Bob",
      content: "Nova swap half to USDC.",
      isEvaluationTarget: true,
    },
  ],
  metadata: {
    pattern: "group_direct_mention",
    generatedBy: "test",
    generatedAt: new Date(0).toISOString(),
    sourceSampleId: "sample-1",
  },
};

const trajectory: Trajectory = {
  trajectoryId: "00000000-0000-0000-0000-000000000222",
  agentId: "00000000-0000-0000-0000-000000000111",
  startTime: Date.now(),
  steps: [
      {
        timestamp: Date.now(),
        llmCalls: [
          {
            purpose: "should_respond",
          systemPrompt:
            "available_contexts:\nwallet, automation\ncontext_routing:\n- primaryContext: wallet\n- secondaryContexts: automation\n- evidenceTurnIds: turn-002\ndecision_note:",
            userPrompt:
              "conversation:\n[turn-001] Alice: ETH is pumping again.\n[turn-002] Bob: Nova swap half to USDC.",
            response:
              "name: Nova\nreasoning: Direct wallet request.\naction: RESPOND\nprimaryContext: wallet\nsecondaryContexts: automation\nevidenceTurnIds: turn-002",
          },
          {
            purpose: "action",
            model: "ACTION_PLANNER",
            systemPrompt: "Decide which actions to take.",
            userPrompt: "User asked the agent to swap half to USDC.",
            response:
              "<response><thought>Need a wallet trade.</thought><actions>SWAP_TOKEN</actions><text>Swapping now.</text></response>",
          },
        ],
      },
    ],
  };

describe("roleplay executor", () => {
  test("replays an episode against a runtime and scores decision/context/action agreement", async () => {
    const runtime = createRuntimeWithTrajectory(trajectory);
    const execution = await executeRoleplayEpisode(episode, {
      runtime,
    });

    expect(execution.actualDecision).toBe("RESPOND");
    expect(execution.actualPrimaryContext).toBe("wallet");
    expect(execution.actualActions).toContain("SWAP_TOKEN");
    expect(execution.selectedActions).toContain("SWAP_TOKEN");
    expect(execution.executedActions).toContain("SWAP_TOKEN");
    expect(execution.decisionMatch).toBe(true);
    expect(execution.routingMatch).toBe(true);
    expect(execution.primaryContextMatch).toBe(true);
    expect(execution.actionMatch).toBe(true);
    expect(execution.selectedActionMatch).toBe(true);
    expect(execution.executedActionMatch).toBe(true);

    const report = buildRoleplayExecutionReport([execution]);
    expect(report.decisionAccuracy).toBe(1);
    expect(report.routingAccuracy).toBe(1);
    expect(report.actionAccuracy).toBe(1);
    expect(report.selectedActionAccuracy).toBe(1);
    expect(report.executedActionAccuracy).toBe(1);
    expect(report.decisionConfusionMatrix.RESPOND.RESPOND).toBe(1);
    expect(report.byPrimaryContext.wallet?.decisionAccuracy).toBe(1);
    expect(report.byPattern.group_direct_mention?.routingAccuracy).toBe(1);
  });

  test("exports execution results plus per-task trajectory corpora", async () => {
    const runtime = createRuntimeWithTrajectory(trajectory);
    const execution = await executeRoleplayEpisode(episode, {
      runtime,
    });
    const outputDir = await mkdtemp(join(tmpdir(), "roleplay-execution-"));
    const exported = await exportRoleplayExecutionResults([execution], outputDir);

    const reportRaw = await readFile(exported.reportPath, "utf-8");
    const plannerRaw = exported.trajectoryDataset
      ? await readFile(exported.trajectoryDataset.paths.shouldRespondPath, "utf-8")
      : "";

    expect(reportRaw).toContain("\"decisionAccuracy\": 1");
    expect(reportRaw).toContain("\"trajectoryDatasetSummary\"");
    expect(plannerRaw).toContain("\"role\":\"model\"");
    expect(exported.trajectoryDataset?.summary.taskMetrics.action_planner.exampleCount).toBe(1);
  });

  test("waits for delayed trajectory capture before finalizing the execution result", async () => {
    const runtime = createRuntimeWithDelayedTrajectory(trajectory);
    const execution = await executeRoleplayEpisode(episode, {
      runtime,
    });

    expect(execution.trajectoryCaptured).toBe(true);
    expect(execution.actualDecision).toBe("RESPOND");
    expect(execution.actualPrimaryContext).toBe("wallet");
    expect(execution.warnings).toEqual([]);
  });

  test("reports warning counts and decision confusion when replay evidence is missing", async () => {
    const mismatchEpisode: RoleplayEpisode = {
      ...episode,
      id: "episode-2",
      evaluationTurnId: "turn-001",
      turns: [
        {
          id: "turn-001",
          role: "participant",
          speaker: "Bob",
          content: "Nova do something useful.",
          isEvaluationTarget: true,
        },
      ],
    };

    const goodExecution = await executeRoleplayEpisode(episode, {
      runtime: createRuntimeWithTrajectory(trajectory),
    });
    const badExecution = await executeRoleplayEpisodes([mismatchEpisode], {
      runtime: createRuntimeWithDelayedTrajectory(trajectory, true),
    });
    const report = buildRoleplayExecutionReport([
      goodExecution,
      ...badExecution,
    ]);

    expect(badExecution[0]?.trajectoryCaptured).toBe(false);
    expect(badExecution[0]?.actualDecision).toBe("IGNORE");
    expect(badExecution[0]?.warnings).toEqual(
      expect.arrayContaining([
        "trajectory_capture_missing",
        "context_routing_missing",
      ]),
    );
    expect(report.totalEpisodes).toBe(2);
    expect(report.decisionConfusionMatrix.RESPOND.RESPOND).toBe(1);
    expect(report.decisionConfusionMatrix.RESPOND.IGNORE).toBe(1);
    expect(report.warningCounts.trajectory_capture_missing).toBe(1);
    expect(report.warningCounts.context_routing_missing).toBe(1);
  });
});
