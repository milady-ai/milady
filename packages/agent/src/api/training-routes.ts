import type { AgentRuntime } from "@elizaos/core";
import { parsePositiveInteger } from "../utils/number-parsing";
import type { RouteHelpers, RouteRequestContext } from "./route-helpers";
import { detectAvailableBackends } from "./training-backend-check";
import type { TrainingServiceLike } from "./training-service-like";

export type TrainingRouteHelpers = RouteHelpers;

export interface TrainingRouteContext extends RouteRequestContext {
  runtime: AgentRuntime | null;
  trainingService: TrainingServiceLike;
  isLoopbackHost: (host: string) => boolean;
}

function resolveStringSetting(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function resolveOllamaUrlRejection(
  rawUrl: string,
  isLoopbackHost: (host: string) => boolean,
): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return "ollamaUrl must be a valid URL";
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "ollamaUrl must use http:// or https://";
  }

  if (!isLoopbackHost(parsed.hostname)) {
    return "ollamaUrl must target a loopback host (localhost, 127.0.0.1, or ::1)";
  }

  return null;
}

export async function handleTrainingRoutes(
  ctx: TrainingRouteContext,
): Promise<boolean> {
  const {
    req,
    res,
    method,
    pathname,
    runtime,
    trainingService,
    json,
    error,
    readJsonBody,
    isLoopbackHost,
  } = ctx;

  if (!pathname.startsWith("/api/training")) return false;

  if (method === "GET" && pathname === "/api/training/status") {
    const status = trainingService.getStatus();
    json(res, {
      ...status,
      runtimeAvailable: runtime !== null,
    });
    return true;
  }

  if (method === "GET" && pathname === "/api/training/trajectories") {
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );
    const limit = parsePositiveInteger(url.searchParams.get("limit"), 100);
    const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0"));
    const result = await trainingService.listTrajectories({ limit, offset });
    json(res, result);
    return true;
  }

  const trajectoryMatch = /^\/api\/training\/trajectories\/([^/]+)$/.exec(
    pathname,
  );
  if (method === "GET" && trajectoryMatch) {
    const trajectoryId = decodeURIComponent(trajectoryMatch[1]);
    const detail = await trainingService.getTrajectoryById(trajectoryId);
    if (!detail) {
      error(res, "Trajectory not found", 404);
      return true;
    }
    json(res, { trajectory: detail });
    return true;
  }

  if (method === "GET" && pathname === "/api/training/datasets") {
    json(res, { datasets: trainingService.listDatasets() });
    return true;
  }

  if (method === "POST" && pathname === "/api/training/datasets/build") {
    const body = await readJsonBody<{
      limit?: number;
      minLlmCallsPerTrajectory?: number;
    }>(req, res);
    if (!body) return true;

    const dataset = await trainingService.buildDataset({
      limit: body.limit,
      minLlmCallsPerTrajectory: body.minLlmCallsPerTrajectory,
    });
    json(res, { dataset }, 201);
    return true;
  }

  if (method === "GET" && pathname === "/api/training/backends") {
    const backends = await detectAvailableBackends();
    json(res, { backends });
    return true;
  }

  if (method === "GET" && pathname === "/api/training/jobs") {
    json(res, { jobs: trainingService.listJobs() });
    return true;
  }

  if (method === "POST" && pathname === "/api/training/jobs") {
    const body = await readJsonBody<{
      datasetId?: string;
      maxTrajectories?: number;
      backend?: "mlx" | "cuda" | "cpu";
      model?: string;
      iterations?: number;
      batchSize?: number;
      learningRate?: number;
    }>(req, res);
    if (!body) return true;

    if (body.backend && body.backend !== "cpu") {
      const backends = await detectAvailableBackends();
      if (!backends[body.backend]) {
        const available = (Object.entries(backends) as [string, boolean][])
          .filter(([, ok]) => ok)
          .map(([name]) => name)
          .join(", ");
        error(
          res,
          `Backend '${body.backend}' is not available on this system. Available backends: ${available}`,
          400,
        );
        return true;
      }
    }

    try {
      const job = await trainingService.startTrainingJob({
        datasetId: body.datasetId,
        maxTrajectories: body.maxTrajectories,
        backend: body.backend,
        model: body.model,
        iterations: body.iterations,
        batchSize: body.batchSize,
        learningRate: body.learningRate,
      });
      json(res, { job }, 201);
    } catch (err) {
      const message = String(err);
      error(res, message, 400);
    }
    return true;
  }

  const jobMatch = /^\/api\/training\/jobs\/([^/]+)$/.exec(pathname);
  if (method === "GET" && jobMatch) {
    const jobId = decodeURIComponent(jobMatch[1]);
    const job = trainingService.getJob(jobId);
    if (!job) {
      error(res, "Training job not found", 404);
      return true;
    }
    json(res, { job });
    return true;
  }

  const cancelMatch = /^\/api\/training\/jobs\/([^/]+)\/cancel$/.exec(pathname);
  if (method === "POST" && cancelMatch) {
    const jobId = decodeURIComponent(cancelMatch[1]);
    try {
      const job = await trainingService.cancelJob(jobId);
      json(res, { job });
    } catch (err) {
      const message = String(err);
      error(res, message, 404);
    }
    return true;
  }

  if (method === "GET" && pathname === "/api/training/models") {
    json(res, { models: trainingService.listModels() });
    return true;
  }

  const importMatch = /^\/api\/training\/models\/([^/]+)\/import-ollama$/.exec(
    pathname,
  );
  if (method === "POST" && importMatch) {
    const modelId = decodeURIComponent(importMatch[1]);
    const body = await readJsonBody<{
      modelName?: string;
      baseModel?: string;
      ollamaUrl?: string;
    }>(req, res);
    if (!body) return true;

    if (body.ollamaUrl !== undefined && typeof body.ollamaUrl !== "string") {
      error(res, "ollamaUrl must be a string", 400);
      return true;
    }
    if (typeof body.ollamaUrl === "string") {
      const ollamaUrlRejection = resolveOllamaUrlRejection(
        body.ollamaUrl,
        isLoopbackHost,
      );
      if (ollamaUrlRejection) {
        error(res, ollamaUrlRejection, 400);
        return true;
      }
    }

    try {
      const model = await trainingService.importModelToOllama(modelId, body);
      json(res, { model });
    } catch (err) {
      const message = String(err);
      error(res, message, 400);
    }
    return true;
  }

  const activateMatch = /^\/api\/training\/models\/([^/]+)\/activate$/.exec(
    pathname,
  );
  if (method === "POST" && activateMatch) {
    const modelId = decodeURIComponent(activateMatch[1]);
    const body = await readJsonBody<{ providerModel?: string }>(req, res);
    if (!body) return true;
    try {
      const result = await trainingService.activateModel(
        modelId,
        body.providerModel,
      );
      json(res, result);
    } catch (err) {
      const message = String(err);
      error(res, message, 400);
    }
    return true;
  }

  const benchmarkMatch = /^\/api\/training\/models\/([^/]+)\/benchmark$/.exec(
    pathname,
  );
  if (method === "POST" && benchmarkMatch) {
    const modelId = decodeURIComponent(benchmarkMatch[1]);
    try {
      const result = await trainingService.benchmarkModel(modelId);
      json(res, result);
    } catch (err) {
      const message = String(err);
      error(res, message, 400);
    }
    return true;
  }

  // === Synthetic dataset generation ===

  if (method === "GET" && pathname === "/api/training/blueprints") {
    const { ALL_BLUEPRINTS } = await import("../training/scenario-blueprints.js");
    json(res, {
      count: ALL_BLUEPRINTS.length,
      blueprints: ALL_BLUEPRINTS.map((b) => ({
        id: b.id,
        decision: b.decision,
        primaryContext: b.primaryContext,
        pattern: b.pattern,
        description: b.description,
      })),
    });
    return true;
  }

  if (method === "GET" && pathname === "/api/training/context-catalog") {
    const { ACTION_CONTEXT_MAP, PROVIDER_CONTEXT_MAP, ALL_CONTEXTS } =
      await import("../training/context-catalog.js");
    json(res, {
      contexts: ALL_CONTEXTS,
      actions: ACTION_CONTEXT_MAP,
      providers: PROVIDER_CONTEXT_MAP,
    });
    return true;
  }

  if (method === "POST" && pathname === "/api/training/generate-dataset") {
    const body = await readJsonBody<{
      variantsPerBlueprint?: number;
      filterContexts?: string[];
      filterDecisions?: string[];
      concurrency?: number;
    }>(req, res);
    if (!body) return true;

    const anthropicKey =
      resolveStringSetting(runtime?.getSetting("ANTHROPIC_API_KEY")) ??
      process.env.ANTHROPIC_API_KEY;
    const openaiKey =
      resolveStringSetting(runtime?.getSetting("OPENAI_API_KEY")) ??
      process.env.OPENAI_API_KEY;

    if (!anthropicKey && !openaiKey) {
      error(res, "No teacher model API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.", 400);
      return true;
    }

    const { generateDataset, exportToGeminiJSONL, createAnthropicTeacher, createOpenAITeacher } =
      await import("../training/dataset-generator.js");

    const teacher = anthropicKey
      ? createAnthropicTeacher(anthropicKey)
      : createOpenAITeacher(openaiKey!);

    const outputDir = `.tmp/training-data-${Date.now()}`;

    try {
      const samples = await generateDataset({
        variantsPerBlueprint: body.variantsPerBlueprint ?? 5,
        teacher,
        outputDir,
        concurrency: body.concurrency ?? 5,
        filterContexts: body.filterContexts as any,
        filterDecisions: body.filterDecisions as any,
      });

      const { validateDataset } = await import("../training/replay-validator.js");
      const report = validateDataset(samples);

      const paths = await exportToGeminiJSONL(samples, outputDir);

      json(res, {
        samplesGenerated: samples.length,
        report,
        paths,
        outputDir,
      }, 201);
    } catch (err) {
      error(res, `Dataset generation failed: ${String(err)}`, 500);
    }
    return true;
  }

  // === Vertex AI tuning ===

  if (method === "POST" && pathname === "/api/training/vertex/tune") {
    const body = await readJsonBody<{
      projectId: string;
      gcsBucket: string;
      baseModel?: string;
      trainingDataPath: string;
      validationDataPath?: string;
      epochs?: number;
      displayName?: string;
      region?: string;
    }>(req, res);
    if (!body) return true;

    if (!body.projectId || !body.gcsBucket || !body.trainingDataPath) {
      error(res, "projectId, gcsBucket, and trainingDataPath are required", 400);
      return true;
    }

    const { createTuningJob } = await import("../training/vertex-tuning.js");

    try {
      const job = await createTuningJob({
        projectId: body.projectId,
        region: body.region ?? "us-central1",
        gcsBucket: body.gcsBucket,
        baseModel: (body.baseModel === "flash" ? "gemini-2.5-flash" : "gemini-2.5-flash-lite") as any,
        trainingDataPath: body.trainingDataPath,
        validationDataPath: body.validationDataPath,
        epochs: body.epochs ?? 3,
        displayName: body.displayName ?? "milady-should-respond",
      });
      json(res, { job }, 201);
    } catch (err) {
      error(res, `Tuning job creation failed: ${String(err)}`, 500);
    }
    return true;
  }

  if (method === "GET" && pathname === "/api/training/vertex/jobs") {
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );
    const projectId = url.searchParams.get("projectId");
    const region = url.searchParams.get("region") ?? "us-central1";

    if (!projectId) {
      error(res, "projectId query parameter is required", 400);
      return true;
    }

    const { listTuningJobs } = await import("../training/vertex-tuning.js");

    try {
      const jobs = await listTuningJobs(projectId, region);
      json(res, { jobs });
    } catch (err) {
      error(res, `Failed to list tuning jobs: ${String(err)}`, 500);
    }
    return true;
  }

  return false;
}
