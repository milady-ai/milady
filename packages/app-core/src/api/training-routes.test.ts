import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentRuntime } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createRouteInvoker } from "../test-support/route-test-helpers";
import { handleTrainingRoutes } from "./training-routes";
import type { TrainingServiceLike } from "./training-service-like";

const ORIGINAL_ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ORIGINAL_OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function createMockTrainingService(): TrainingServiceLike {
  return {
    getStatus: vi.fn().mockReturnValue({
      runningJobs: 0,
      queuedJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      modelCount: 0,
      datasetCount: 0,
    }),
    listTrajectories: vi.fn().mockResolvedValue({
      available: true,
      total: 1,
      trajectories: [
        {
          id: "traj-row-1",
          trajectoryId: "trajectory-1",
          agentId: "agent-1",
          archetype: "default",
          createdAt: new Date(0).toISOString(),
          totalReward: 1,
          aiJudgeReward: 1,
          episodeLength: 4,
          hasLlmCalls: true,
          llmCallCount: 2,
        },
      ],
    }),
    getTrajectoryById: vi.fn().mockResolvedValue({
      id: "traj-row-1",
      trajectoryId: "trajectory-1",
      agentId: "agent-1",
      archetype: "default",
      createdAt: new Date(0).toISOString(),
      totalReward: 1,
      aiJudgeReward: 1,
      episodeLength: 4,
      hasLlmCalls: true,
      llmCallCount: 2,
      stepsJson: "[]",
      aiJudgeReasoning: null,
    }),
    buildDataset: vi.fn().mockResolvedValue({
      id: "dataset-1",
      createdAt: new Date(0).toISOString(),
      jsonlPath: "/tmp/training-data.jsonl",
      trajectoryDir: "/tmp/trajectories",
      metadataPath: "/tmp/metadata.json",
      sampleCount: 10,
      trajectoryCount: 3,
    }),
    listDatasets: vi.fn().mockReturnValue([]),
    startTrainingJob: vi.fn().mockResolvedValue({
      id: "job-1",
      createdAt: new Date(0).toISOString(),
      startedAt: new Date(0).toISOString(),
      completedAt: null,
      status: "running",
      phase: "starting",
      progress: 0.1,
      error: null,
      exitCode: null,
      signal: null,
      options: {},
      datasetId: "dataset-1",
      pythonRoot: "/tmp/python",
      scriptPath: "/tmp/train.py",
      outputDir: "/tmp/out",
      logPath: "/tmp/job.log",
      modelPath: null,
      adapterPath: null,
      modelId: null,
      logs: [],
    }),
    listJobs: vi.fn().mockReturnValue([]),
    getJob: vi.fn().mockReturnValue(null),
    cancelJob: vi.fn().mockRejectedValue(new Error("not found")),
    listModels: vi.fn().mockReturnValue([]),
    importModelToOllama: vi.fn().mockResolvedValue({
      id: "model-1",
      createdAt: new Date(0).toISOString(),
      jobId: "job-1",
      outputDir: "/tmp/out",
      modelPath: "/tmp/out/model",
      adapterPath: "/tmp/out/adapter",
      sourceModel: "qwen",
      backend: "cpu",
      ollamaModel: "eliza-ft-model",
      active: false,
      benchmark: { status: "not_run", lastRunAt: null, output: null },
    }),
    activateModel: vi.fn().mockResolvedValue({
      modelId: "model-1",
      providerModel: "ollama/eliza-ft-model",
      needsRestart: true,
    }),
    benchmarkModel: vi.fn().mockResolvedValue({
      status: "passed",
      output: "ok",
    }),
  };
}

function createRoleplayRuntime(): AgentRuntime {
  const trajectory = {
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
            userPrompt: "User asked the agent to swap tokens.",
            response:
              "<response><thought>Need a wallet trade.</thought><actions>SWAP_TOKEN</actions><text>Swapping now.</text></response>",
          },
        ],
      },
    ],
  };
  const logger = {
    getTrajectoryDetail: vi.fn(async () => trajectory),
  };

  return {
    agentId: "00000000-0000-0000-0000-000000000111",
    character: { name: "Nova" },
    createMemory: vi.fn(async () => undefined),
    ensureConnection: vi.fn(async () => undefined),
    getActionResults: vi.fn(() => [{ data: { actionName: "SWAP_TOKEN" } }]),
    getServicesByType: vi.fn(() => [logger]),
    getService: vi.fn(() => logger),
    messageService: {
      handleMessage: vi.fn(async (_runtime, _message, callback) => {
        await callback?.({
          text: "Swapping now.",
          actions: ["SWAP_TOKEN"],
          source: "discord",
          channelType: "GROUP",
        });

        return {
          didRespond: true,
          responseContent: {
            text: "Swapping now.",
            actions: ["SWAP_TOKEN"],
            source: "discord",
            channelType: "GROUP",
          },
          responseMessages: [],
          state: { values: {}, data: {} },
          mode: "actions",
        };
      }),
    },
  } as unknown as AgentRuntime;
}

describe("training routes", () => {
  let runtime: AgentRuntime | null;
  let trainingService: TrainingServiceLike;

  beforeEach(() => {
    runtime = {
      character: { name: "Eliza" },
    } as unknown as AgentRuntime;

    trainingService = createMockTrainingService();
  });

  afterEach(() => {
    if (ORIGINAL_ANTHROPIC_API_KEY === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = ORIGINAL_ANTHROPIC_API_KEY;
    }

    if (ORIGINAL_OPENAI_API_KEY === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = ORIGINAL_OPENAI_API_KEY;
    }
  });

  const invoke = createRouteInvoker<
    Record<string, unknown> | null,
    AgentRuntime | null,
    object
  >(
    (ctx) => {
      return handleTrainingRoutes({
        req: ctx.req,
        res: ctx.res,
        method: ctx.method,
        pathname: ctx.pathname,
        runtime: ctx.runtime,
        trainingService,
        readJsonBody: async () => ctx.readJsonBody(),
        json: (res, data, status) => ctx.json(res, data, status),
        error: (res, message, status) => ctx.error(res, message, status),
      });
    },
    { runtimeProvider: () => runtime },
  );

  test("returns false for non-training paths", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/status",
    });
    expect(result.handled).toBe(false);
  });

  test("returns training status with runtime flag", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/training/status",
    });
    expect(result.handled).toBe(true);
    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      runningJobs: 0,
      runtimeAvailable: true,
    });
  });

  test("lists trajectories using parsed limit and offset", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/training/trajectories",
      url: "/api/training/trajectories?limit=25&offset=5",
    });
    expect(result.status).toBe(200);
    expect(trainingService.listTrajectories).toHaveBeenCalledWith({
      limit: 25,
      offset: 5,
    });
  });

  test("returns 404 when trajectory is missing", async () => {
    (
      trainingService.getTrajectoryById as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(null);
    const result = await invoke({
      method: "GET",
      pathname: "/api/training/trajectories/trajectory-404",
    });
    expect(result.status).toBe(404);
    expect(result.payload).toMatchObject({ error: "Trajectory not found" });
  });

  test("builds dataset via POST endpoint", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/training/datasets/build",
      body: { limit: 100, minLlmCallsPerTrajectory: 2 },
    });
    expect(result.status).toBe(201);
    expect(trainingService.buildDataset).toHaveBeenCalledWith({
      limit: 100,
      minLlmCallsPerTrajectory: 2,
    });
  });

  test("lists expanded blueprint metadata", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/training/blueprints",
    });
    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      count: expect.any(Number),
      stats: expect.objectContaining({
        totalCount: expect.any(Number),
      }),
    });
  });

  test("audits loaded runtime plugin context coverage", async () => {
    runtime = {
      character: { name: "Eliza" },
      plugins: [
        {
          name: "catalog-covered-plugin",
          actions: [{ name: "SET_USER_NAME" }],
          providers: [{ name: "userName" }],
        },
        {
          name: "gap-plugin",
          actions: [{ name: "UNKNOWN_ACTION" }],
          providers: [{ name: "unknownProvider" }],
        },
      ],
    } as unknown as AgentRuntime;

    const result = await invoke({
      method: "GET",
      pathname: "/api/training/context-audit",
    });

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      hasGaps: true,
      audit: {
        pluginCount: 2,
        gapCount: 2,
        coverageBySource: {
          actions: expect.objectContaining({
            catalog: 1,
            default: 1,
          }),
          providers: expect.objectContaining({
            catalog: 1,
            default: 1,
          }),
        },
      },
    });
  });

  test("returns 503 when context audit is requested without loaded plugins", async () => {
    runtime = {
      character: { name: "Eliza" },
    } as unknown as AgentRuntime;

    const result = await invoke({
      method: "GET",
      pathname: "/api/training/context-audit",
    });

    expect(result.status).toBe(503);
    expect(result.payload).toMatchObject({
      error: "Runtime with loaded plugins is required for context audit",
    });
  });

  test("starts training job and returns created job", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/training/jobs",
      body: {
        datasetId: "dataset-1",
        backend: "cpu",
        iterations: 10,
      },
    });
    expect(result.status).toBe(201);
    expect(trainingService.startTrainingJob).toHaveBeenCalledWith({
      datasetId: "dataset-1",
      maxTrajectories: undefined,
      backend: "cpu",
      model: undefined,
      iterations: 10,
      batchSize: undefined,
      learningRate: undefined,
    });
  });

  test("returns 400 when training job start fails", async () => {
    (
      trainingService.startTrainingJob as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error("bad request"));
    const result = await invoke({
      method: "POST",
      pathname: "/api/training/jobs",
      body: { backend: "cpu" },
    });
    expect(result.status).toBe(400);
    expect(result.payload).toMatchObject({
      error: expect.stringContaining("bad request"),
    });
  });

  test("returns 404 when cancelling unknown job", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/training/jobs/job-404/cancel",
    });
    expect(result.status).toBe(404);
  });

  test("returns 404 when fetching unknown job", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/training/jobs/job-404",
    });
    expect(result.status).toBe(404);
    expect(result.payload).toMatchObject({ error: "Training job not found" });
  });

  test("activates model from endpoint", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/training/models/model-1/activate",
      body: { providerModel: "ollama/eliza-ft-model" },
    });
    expect(result.status).toBe(200);
    expect(trainingService.activateModel).toHaveBeenCalledWith(
      "model-1",
      "ollama/eliza-ft-model",
    );
  });

  test("imports model into Ollama from endpoint", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/training/models/model-1/import-ollama",
      body: {
        modelName: "eliza-ft-model",
        baseModel: "qwen2.5:7b-instruct",
        ollamaUrl: "http://localhost:11434",
      },
    });
    expect(result.status).toBe(200);
    expect(trainingService.importModelToOllama).toHaveBeenCalledWith(
      "model-1",
      {
        modelName: "eliza-ft-model",
        baseModel: "qwen2.5:7b-instruct",
        ollamaUrl: "http://localhost:11434",
      },
    );
  });

  test("rejects non-loopback ollamaUrl to prevent SSRF", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/training/models/model-1/import-ollama",
      body: {
        modelName: "eliza-ft-model",
        baseModel: "qwen2.5:7b-instruct",
        ollamaUrl: "http://169.254.169.254:11434",
      },
    });

    expect(result.status).toBe(400);
    expect(result.payload).toMatchObject({
      error: expect.stringContaining("loopback host"),
    });
    expect(trainingService.importModelToOllama).not.toHaveBeenCalled();
  });

  test("rejects hostnames that only prefix-match loopback", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/training/models/model-1/import-ollama",
      body: {
        ollamaUrl: "http://127.0.0.1.evil.com:11434",
      },
    });

    expect(result.status).toBe(400);
    expect(result.payload).toMatchObject({
      error: expect.stringContaining("loopback host"),
    });
    expect(trainingService.importModelToOllama).not.toHaveBeenCalled();
  });

  test("rejects unsupported ollamaUrl protocols", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/training/models/model-1/import-ollama",
      body: {
        ollamaUrl: "file:///etc/passwd",
      },
    });

    expect(result.status).toBe(400);
    expect(result.payload).toMatchObject({
      error: "ollamaUrl must use http:// or https://",
    });
    expect(trainingService.importModelToOllama).not.toHaveBeenCalled();
  });

  test("accepts bracketed IPv6 loopback ollamaUrl", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/training/models/model-1/import-ollama",
      body: {
        ollamaUrl: "http://[::1]:11434",
      },
    });

    expect(result.status).toBe(200);
    expect(trainingService.importModelToOllama).toHaveBeenCalledWith(
      "model-1",
      expect.objectContaining({
        ollamaUrl: "http://[::1]:11434",
      }),
    );
  });

  test("benchmarks model from endpoint", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/training/models/model-1/benchmark",
    });
    expect(result.status).toBe(200);
    expect(trainingService.benchmarkModel).toHaveBeenCalledWith("model-1");
  });

  test("requires a job name for Vertex job status lookup", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/training/vertex/job-status",
      url: "/api/training/vertex/job-status",
    });
    expect(result.status).toBe(400);
    expect(result.payload).toMatchObject({
      error: "name query parameter is required",
    });
  });

  test("rejects synthetic dataset generation when no teacher API key is configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const result = await invoke({
      method: "POST",
      pathname: "/api/training/generate-dataset",
      body: {
        variantsPerBlueprint: 1,
      },
    });

    expect(result.status).toBe(400);
    expect(result.payload).toMatchObject({
      error: expect.stringContaining("No teacher model API key found"),
    });
  });

  test("requires a runtime for roleplay execution", async () => {
    runtime = null;

    const result = await invoke({
      method: "POST",
      pathname: "/api/training/roleplay/execute",
      body: {
        episodesPath: "/tmp/episodes.json",
      },
    });

    expect(result.status).toBe(503);
    expect(result.payload).toMatchObject({
      error: "Runtime is required to execute roleplay episodes",
    });
  });

  test("requires an input path for roleplay execution", async () => {
    runtime = createRoleplayRuntime();

    const result = await invoke({
      method: "POST",
      pathname: "/api/training/roleplay/execute",
      body: {},
    });

    expect(result.status).toBe(400);
    expect(result.payload).toMatchObject({
      error: "episodesPath or manifestPath is required",
    });
  });

  test("executes roleplay manifests through the runtime and returns a report", async () => {
    runtime = createRoleplayRuntime();
    const outputDir = await mkdtemp(join(tmpdir(), "training-route-roleplay-"));
    const episodesPath = join(outputDir, "episodes.json");
    await writeFile(
      episodesPath,
      JSON.stringify([
        {
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
        },
      ]),
    );

    const result = await invoke({
      method: "POST",
      pathname: "/api/training/roleplay/execute",
      body: {
        episodesPath,
        outputDir,
      },
    });

    expect(result.status).toBe(201);
    expect(result.payload).toMatchObject({
      episodesExecuted: 1,
      report: expect.objectContaining({
        decisionAccuracy: 1,
        routingAccuracy: 1,
        actionAccuracy: 1,
        trajectoryDatasetSummary: expect.objectContaining({
          counts: expect.objectContaining({
            should_respond: expect.any(Number),
            action_planner: expect.any(Number),
          }),
        }),
      }),
      paths: expect.objectContaining({
        executionsPath: expect.any(String),
        reportPath: expect.any(String),
      }),
    });
  });

  test("exports trajectory corpora split by task", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/training/trajectories/export",
      body: {
        splitByTask: true,
        outputDir: await mkdtemp(
          join(tmpdir(), "training-route-trajectories-"),
        ),
      },
    });

    expect(result.status).toBe(201);
    expect(result.payload).toMatchObject({
      exportedExamples: expect.any(Number),
      taskDataset: {
        counts: expect.objectContaining({
          should_respond: expect.any(Number),
        }),
        summary: expect.objectContaining({
          llmCallCount: expect.any(Number),
          taskMetrics: expect.objectContaining({
            should_respond: expect.objectContaining({
              exampleCount: expect.any(Number),
            }),
          }),
        }),
        paths: expect.objectContaining({
          shouldRespondPath: expect.any(String),
          actionPlannerPath: expect.any(String),
        }),
      },
    });
  });

  test("exports raw should-respond JSONL and writes inspectable examples", async () => {
    const outputPath = join(
      await mkdtemp(join(tmpdir(), "training-route-raw-export-")),
      "training.jsonl",
    );

    (
      trainingService.getTrajectoryById as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      trajectoryId: "trajectory-export-1",
      metadata: { source: "test" },
      steps: [
        {
          llmCalls: [
            {
              purpose: "should_respond",
              systemPrompt: "system prompt",
              userPrompt: "user prompt",
              response: "action: RESPOND",
              model: "RESPONSE_HANDLER",
            },
            {
              purpose: "action",
              systemPrompt: "planner prompt",
              userPrompt: "swap now",
              response: "<actions>SWAP_TOKEN</actions>",
              model: "ACTION_PLANNER",
            },
          ],
        },
      ],
    });

    const result = await invoke({
      method: "POST",
      pathname: "/api/training/trajectories/export",
      body: {
        trajectoryIds: ["trajectory-export-1"],
        outputPath,
      },
    });

    const exportedLines = (await readFile(outputPath, "utf-8"))
      .trim()
      .split("\n")
      .map(
        (line) =>
          JSON.parse(line) as {
            messages: Array<{ role: string; content: string }>;
          },
      );

    expect(result.status).toBe(201);
    expect(result.payload).toMatchObject({
      exportedExamples: 1,
      trajectoriesConsidered: 1,
      outputPath,
    });
    expect(exportedLines).toHaveLength(1);
    expect(exportedLines[0]?.messages).toEqual([
      { role: "system", content: "system prompt" },
      { role: "user", content: "user prompt" },
      { role: "model", content: "action: RESPOND" },
    ]);
  });
});
