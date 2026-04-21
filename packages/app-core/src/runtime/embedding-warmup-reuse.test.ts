import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  embeddingGgufFilePresent,
  findExistingEmbeddingModelForWarmupReuse,
} from "./embedding-manager-support.js";

describe("embedding warmup reuse (MODELS_DIR)", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) {
      try {
        fs.rmSync(d, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    dirs.length = 0;
  });

  function tempModelsDir(): string {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "milady-emb-reuse-"));
    dirs.push(d);
    return d;
  }

  it("returns null when directory is empty", () => {
    const dir = tempModelsDir();
    expect(findExistingEmbeddingModelForWarmupReuse(dir)).toBeNull();
  });

  it("reuses the compact bge file when it exists", () => {
    const dir = tempModelsDir();
    const bge = "bge-small-en-v1.5.Q4_K_M.gguf";
    fs.writeFileSync(path.join(dir, bge), "x");
    const found = findExistingEmbeddingModelForWarmupReuse(dir);
    expect(found?.model).toBe(bge);
  });

  it("selects bge when it is the only known file", () => {
    const dir = tempModelsDir();
    const bge = "bge-small-en-v1.5.Q4_K_M.gguf";
    fs.writeFileSync(path.join(dir, bge), "x");
    const found = findExistingEmbeddingModelForWarmupReuse(dir);
    expect(found?.model).toBe(bge);
    expect(found?.dimensions).toBe(384);
  });

  it("ignores legacy larger embedding files when compact bge is absent", () => {
    const dir = tempModelsDir();
    fs.writeFileSync(
      path.join(dir, "ggml-e5-mistral-7b-instruct-q4_k_m.gguf"),
      "x",
    );
    fs.writeFileSync(path.join(dir, "nomic-embed-text-v1.5.Q5_K_M.gguf"), "x");
    expect(findExistingEmbeddingModelForWarmupReuse(dir)).toBeNull();
  });

  it("embeddingGgufFilePresent rejects traversal names", () => {
    const dir = tempModelsDir();
    expect(embeddingGgufFilePresent(dir, "../escape.gguf")).toBe(false);
  });
});
