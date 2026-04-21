import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { Trajectory } from "../types/trajectory";
import {
  exportTrajectoryTaskDatasets,
  extractTrajectoryExamplesByTask,
} from "./trajectory-task-datasets";

const trajectory: Trajectory = {
  trajectoryId: "trajectory-1",
  agentId: "agent-1",
  startTime: Date.now(),
  steps: [
    {
      timestamp: Date.now(),
      llmCalls: [
        {
          purpose: "should_respond",
          systemPrompt:
            "available_contexts:\nwallet, automation\ncontext_routing:\n- primaryContext: wallet\n- secondaryContexts: automation\n- evidenceTurnIds: turn-002\ndecision_note:",
          userPrompt: "conversation:\n[turn-001] Alice: price looks good\n[turn-002] Bob: Nova swap half to USDC",
          response:
            "name: Nova\nreasoning: Direct wallet request.\naction: RESPOND\nprimaryContext: wallet\nsecondaryContexts: automation\nevidenceTurnIds: turn-002",
          model: "RESPONSE_HANDLER",
        },
        {
          purpose: "action",
          model: "ACTION_PLANNER",
          systemPrompt: "Decide which actions to take.",
          userPrompt: "User asked the agent to swap tokens.",
          response:
            "<response><thought>Need a wallet trade.</thought><actions>SWAP_TOKEN</actions><text>Swapping now.</text></response>",
        },
      ],
    },
  ],
};

describe("trajectory task datasets", () => {
  test("extracts should-respond, context-routing, and planner corpora from trajectories", () => {
    const examples = extractTrajectoryExamplesByTask([trajectory]);

    expect(examples.should_respond).toHaveLength(1);
    expect(examples.context_routing).toHaveLength(1);
    expect(examples.action_planner).toHaveLength(1);
    expect(examples.should_respond[0]?.messages[0]?.content).not.toContain(
      "context_routing:",
    );
    expect(examples.should_respond[0]?.messages[2]?.content).not.toContain(
      "primaryContext:",
    );
    expect(examples.context_routing[0]?.messages[2]?.content).toContain(
      "primaryContext: wallet",
    );
  });

  test("writes per-task JSONL datasets and a summary report", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "trajectory-datasets-"));
    const exported = await exportTrajectoryTaskDatasets([trajectory], outputDir);

    expect(exported.counts.should_respond).toBe(1);
    expect(exported.counts.context_routing).toBe(1);
    expect(exported.counts.action_planner).toBe(1);

    const plannerJsonl = await readFile(exported.paths.actionPlannerPath, "utf-8");
    const summary = JSON.parse(
      await readFile(exported.paths.summaryPath, "utf-8"),
    ) as {
      counts: Record<string, number>;
      llmCallCount: number;
      taskMetrics: Record<
        string,
        { exampleCount: number; sourceCallCount: number; sourceTrajectoryCount: number }
      >;
    };

    expect(plannerJsonl).toContain("SWAP_TOKEN");
    expect(summary.counts.action_planner).toBe(1);
    expect(summary.llmCallCount).toBe(2);
    expect(summary.taskMetrics.action_planner).toMatchObject({
      exampleCount: 1,
      sourceCallCount: 1,
      sourceTrajectoryCount: 1,
    });
    expect(exported.summary.taskMetrics.should_respond.exampleCount).toBe(1);
  });

  test("honors explicit task filters and skips incomplete calls", async () => {
    const incompleteTrajectory: Trajectory = {
      trajectoryId: "trajectory-2",
      agentId: "agent-1",
      startTime: Date.now(),
      steps: [
        {
          timestamp: Date.now(),
          llmCalls: [
            {
              purpose: "should_respond",
              systemPrompt: "missing response",
              userPrompt: "user prompt only",
              model: "RESPONSE_HANDLER",
            },
            {
              purpose: "response",
              systemPrompt: "missing user prompt",
              response: "hello",
            },
          ],
        },
      ],
    };

    const outputDir = await mkdtemp(join(tmpdir(), "trajectory-task-filter-"));
    const exported = await exportTrajectoryTaskDatasets(
      [trajectory, incompleteTrajectory],
      outputDir,
      ["action_planner"],
    );

    const shouldRespondJsonl = await readFile(exported.paths.shouldRespondPath, "utf-8");
    const actionPlannerJsonl = await readFile(exported.paths.actionPlannerPath, "utf-8");
    const parsedPlannerExamples = actionPlannerJsonl
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as { messages: Array<{ role: string; content: string }> });

    expect(exported.summary.tasks).toEqual(["action_planner"]);
    expect(exported.counts.should_respond).toBe(0);
    expect(exported.counts.action_planner).toBe(1);
    expect(shouldRespondJsonl).toBe("");
    expect(parsedPlannerExamples).toHaveLength(1);
    expect(parsedPlannerExamples[0]?.messages[2]?.content).toContain("SWAP_TOKEN");
    expect(exported.summary.taskMetrics.action_planner).toMatchObject({
      exampleCount: 1,
      sourceCallCount: 1,
      sourceTrajectoryCount: 1,
    });
  });
});
