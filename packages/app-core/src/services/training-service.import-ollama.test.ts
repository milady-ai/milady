import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test, vi } from "vitest";
import { describeIf } from "../../../../test/helpers/conditional-tests.ts";
import type { ElizaConfig } from "../config/config";

type TrainingServiceLike = new (
  ctx: unknown,
) => {
  importModelToOllama: (id: string, opts: unknown) => Promise<void>;
  models: Map<string, TrainingModelRecord>;
};

const trainingServiceModuleUrl = new URL(
  "../../../../plugins/plugin-training/dist/index.js",
  import.meta.url,
);
const trainingPluginAvailable = existsSync(
  fileURLToPath(trainingServiceModuleUrl),
);
const describeTraining = describeIf(trainingPluginAvailable);

let TrainingService: TrainingServiceLike;

type TrainingServiceInstance = InstanceType<TrainingServiceLike>;

type TrainingModelRecord = {
  id: string;
  createdAt: string;
  jobId: string;
  outputDir: string;
  modelPath: string;
  adapterPath: string;
  sourceModel: string;
  backend: string;
  ollamaModel: null | string;
  active: boolean;
  benchmark: { status: string; lastRunAt: null; output: null };
};

describeTraining("training service importModelToOllama", () => {
  test("loads the training plugin module", async () => {
    const trainingServiceModule = (await import(
      trainingServiceModuleUrl.href
    )) as {
      TrainingService: TrainingServiceLike;
    };
    TrainingService = trainingServiceModule.TrainingService;
  });

  test("uses manual redirect mode to prevent redirect-based SSRF escapes", async () => {
    const config = {} as ElizaConfig;
    const service = new TrainingService({
      getRuntime: () => null,
      getConfig: () => config,
      setConfig: () => undefined,
    });

    vi.spyOn(
      service as TrainingServiceInstance & { initialize: () => Promise<void> },
      "initialize",
    ).mockResolvedValue(undefined);
    vi.spyOn(
      service as TrainingServiceInstance & { saveState: () => Promise<void> },
      "saveState",
    ).mockResolvedValue(undefined);

    const model: TrainingModelRecord = {
      id: "model-1",
      createdAt: new Date(0).toISOString(),
      jobId: "job-1",
      outputDir: "/tmp/out",
      modelPath: "/tmp/out/model",
      adapterPath: "/tmp/out/adapter",
      sourceModel: "qwen2.5:7b-instruct",
      backend: "cpu",
      ollamaModel: null,
      active: false,
      benchmark: { status: "not_run", lastRunAt: null, output: null },
    };
    (
      service as {
        models: Map<string, TrainingModelRecord>;
      }
    ).models.set(model.id, model);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      text: async () => "",
    } as Response);

    try {
      await service.importModelToOllama("model-1", {
        ollamaUrl: "http://localhost:11434",
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        "http://localhost:11434/api/create",
        expect.objectContaining({
          method: "POST",
          redirect: "manual",
        }),
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
