import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentRuntime } from "@elizaos/core";
import { ModelType } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureMiladyTextToSpeechHandler } from "./eliza";

const originalEnv = { ...process.env };

type RuntimeModelRegistry = AgentRuntime & {
  getModel: (modelType: string | number) => unknown;
  registerModel: (
    modelType: string | number,
    handler: unknown,
    provider: string,
    priority?: number,
  ) => void;
};

function createRuntimeMock(): RuntimeModelRegistry {
  const models = new Map<string | number, unknown>();
  return {
    getModel: (modelType) => models.get(modelType),
    registerModel: (modelType, handler) => {
      models.set(modelType, handler);
    },
  } as unknown as RuntimeModelRegistry;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs = 5_000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            `Timed out after ${timeoutMs}ms while waiting for Edge TTS registration`,
          ),
        );
      }, timeoutMs);
    }),
  ]);
}

describe("ensureMiladyTextToSpeechHandler", () => {
  let tempStateDir = "";

  beforeEach(async () => {
    tempStateDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "milady-edge-tts-restart-"),
    );
    process.env = {
      ...originalEnv,
      ELIZA_STATE_DIR: tempStateDir,
      MILADY_STATE_DIR: tempStateDir,
    };
    delete process.env.MILADY_DISABLE_EDGE_TTS;
    delete process.env.ELIZA_DISABLE_EDGE_TTS;
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    if (tempStateDir) {
      await fs.rm(tempStateDir, { recursive: true, force: true });
    }
  });

  it("registers Edge TTS across repeated runtime boots", async () => {
    const firstRuntime = createRuntimeMock();
    await withTimeout(ensureMiladyTextToSpeechHandler(firstRuntime));
    expect(typeof firstRuntime.getModel(ModelType.TEXT_TO_SPEECH)).toBe(
      "function",
    );

    const secondRuntime = createRuntimeMock();
    await withTimeout(ensureMiladyTextToSpeechHandler(secondRuntime));
    expect(typeof secondRuntime.getModel(ModelType.TEXT_TO_SPEECH)).toBe(
      "function",
    );
  });
});
