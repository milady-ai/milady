#!/usr/bin/env node
// scripts/miladyos/stage-default-models.mjs — fetch and stage the default
// chat + embedding GGUF models into the Milady APK's android assets so a
// fresh AOSP install boots straight into a working chat without needing
// network access.
//
// Why bundle, not download-on-first-run:
//   The user's stated UX is "boot the AOSP image → chat works". Download-
//   on-first-run requires (a) network at first boot, (b) a UI prompt the
//   user must satisfy, (c) an extra ~400 MB transfer that will be
//   re-downloaded for every fresh image. Bundling pays the size cost once
//   at APK build time, then every install is offline-capable.
//
// Output (per ABI is unnecessary — GGUF files are arch-independent):
//   apps/app/android/app/src/main/assets/agent/models/<file>.gguf
//   apps/app/android/app/src/main/assets/agent/models/manifest.json
//
// On-device: MiladyAgentService extracts assets/agent/models/* into
// $MILADY_STATE_DIR/local-inference/models/, then the runtime's first-
// run bootstrap scans the directory and registers each file in the
// local-inference registry with source: "milady-download" (Milady ships
// these files; we own them).
//
// APK size impact (Q4_K_M quants):
//   SmolLM2-360M-Instruct          ~270 MB
//   bge-small-en-v1.5              ~130 MB
//   --------------------------------------
//   total                          ~400 MB
//
// Opt out for builders who want to download at runtime instead:
//   --skip-bundled-models       (passed by build-aosp.mjs)
//   MILADY_SKIP_BUNDLED_MODELS=1 (env var, also respected)
//
// Idempotent: re-running with the same files on disk and matching size
// is a no-op. A size mismatch triggers a re-download. The script never
// deletes other files in the assets/agent/models/ dir.

import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

/**
 * Models to bundle. IDs match `MODEL_CATALOG` entries in
 * eliza/packages/app-core/src/services/local-inference/catalog.ts so the
 * runtime registry treats them as known catalog models, not orphans.
 *
 * The embedding model has no catalog entry yet (catalog only carries
 * chat models); we still register it as a Milady-owned model with a
 * stable id so the auto-assign logic can wire it to TEXT_EMBEDDING.
 *
 * Sizes are sanity-checked at download time. If HuggingFace serves
 * a smaller file (e.g. partial download, repo deleted, replaced) the
 * staging step fails loudly rather than shipping a broken APK.
 */
export const DEFAULT_MODELS = [
  {
    id: "smollm2-360m",
    displayName: "SmolLM2 360M Instruct",
    hfRepo: "bartowski/SmolLM2-360M-Instruct-GGUF",
    ggufFile: "SmolLM2-360M-Instruct-Q4_K_M.gguf",
    expectedMinBytes: 220 * 1024 * 1024, // 220 MB lower bound (sanity)
    expectedMaxBytes: 320 * 1024 * 1024, // 320 MB upper bound
    role: "chat",
  },
  {
    id: "bge-small-en-v1.5",
    displayName: "BGE Small EN v1.5 (embedding)",
    hfRepo: "ChristianAzinn/bge-small-en-v1.5-gguf",
    ggufFile: "bge-small-en-v1.5.Q4_K_M.gguf",
    expectedMinBytes: 30 * 1024 * 1024, // 30 MB lower bound
    expectedMaxBytes: 200 * 1024 * 1024, // 200 MB upper bound
    role: "embedding",
  },
];

const ASSETS_MODELS_DIR = path.join(
  repoRoot,
  "apps",
  "app",
  "android",
  "app",
  "src",
  "main",
  "assets",
  "agent",
  "models",
);

const MANIFEST_PATH = path.join(ASSETS_MODELS_DIR, "manifest.json");

function hfResolveUrl(repo, file) {
  // The /resolve/main/ path serves the LFS-hydrated file, not the
  // pointer. /raw/ would serve the LFS pointer text and break us.
  return `https://huggingface.co/${repo}/resolve/main/${encodeURIComponent(file)}`;
}

async function fileSize(p) {
  try {
    const stat = await fs.stat(p);
    return stat.size;
  } catch (error) {
    if (error.code === "ENOENT") return -1;
    throw error;
  }
}

async function streamDownload(url, dest, sizeMin, sizeMax) {
  // Use Node's built-in fetch (Node 22 has it); follow redirects, fail
  // fast on non-200, content-length mismatch, or under-size.
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "Milady-AOSP-build/1.0" },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }
  const contentLength = Number(res.headers.get("content-length") ?? "0");
  if (contentLength && (contentLength < sizeMin || contentLength > sizeMax)) {
    throw new Error(
      `Content-Length ${contentLength} for ${url} is outside expected range ${sizeMin}-${sizeMax}`,
    );
  }

  await fs.mkdir(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.partial`;
  const sink = createWriteStream(tmp);
  const hash = createHash("sha256");
  let written = 0;
  // The body is a web ReadableStream in Node 22; iterate via reader.
  const reader = res.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      hash.update(value);
      written += value.length;
      sink.write(value);
    }
    sink.end();
    // Wait for the FS write to flush.
    await new Promise((resolve, reject) => {
      sink.on("finish", resolve);
      sink.on("error", reject);
    });
    if (written < sizeMin) {
      throw new Error(
        `Downloaded ${written} bytes but expected at least ${sizeMin} for ${url}`,
      );
    }
    if (written > sizeMax) {
      throw new Error(
        `Downloaded ${written} bytes but expected at most ${sizeMax} for ${url}`,
      );
    }
    await fs.rename(tmp, dest);
    return { sizeBytes: written, sha256: hash.digest("hex") };
  } catch (error) {
    sink.destroy();
    await fs.rm(tmp, { force: true });
    throw error;
  }
}

async function readExistingManifest() {
  try {
    const raw = await fs.readFile(MANIFEST_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function main(argv = process.argv.slice(2)) {
  const skip =
    argv.includes("--skip-bundled-models") ||
    process.env.MILADY_SKIP_BUNDLED_MODELS === "1";
  if (skip) {
    console.log(
      "[stage-default-models] --skip-bundled-models / MILADY_SKIP_BUNDLED_MODELS=1; nothing to do.",
    );
    return;
  }

  await fs.mkdir(ASSETS_MODELS_DIR, { recursive: true });

  const existingManifest = await readExistingManifest();
  const manifestEntries = [];

  for (const model of DEFAULT_MODELS) {
    const dest = path.join(ASSETS_MODELS_DIR, model.ggufFile);
    const have = await fileSize(dest);
    if (have >= model.expectedMinBytes && have <= model.expectedMaxBytes) {
      console.log(
        `[stage-default-models] ${model.id}: already staged (${have} bytes), skipping.`,
      );
      // Try to reuse the existing manifest entry rather than re-hashing.
      const prior = existingManifest?.models?.find((m) => m.id === model.id);
      manifestEntries.push({
        id: model.id,
        displayName: model.displayName,
        hfRepo: model.hfRepo,
        ggufFile: model.ggufFile,
        role: model.role,
        sizeBytes: have,
        sha256: prior?.sha256 ?? null,
      });
      continue;
    }
    if (have >= 0) {
      console.log(
        `[stage-default-models] ${model.id}: stale (${have} bytes), re-downloading.`,
      );
    } else {
      console.log(
        `[stage-default-models] ${model.id}: downloading from ${model.hfRepo}...`,
      );
    }
    const url = hfResolveUrl(model.hfRepo, model.ggufFile);
    const { sizeBytes, sha256 } = await streamDownload(
      url,
      dest,
      model.expectedMinBytes,
      model.expectedMaxBytes,
    );
    console.log(
      `[stage-default-models] ${model.id}: downloaded ${sizeBytes} bytes (sha256=${sha256.slice(0, 12)}...)`,
    );
    manifestEntries.push({
      id: model.id,
      displayName: model.displayName,
      hfRepo: model.hfRepo,
      ggufFile: model.ggufFile,
      role: model.role,
      sizeBytes,
      sha256,
    });
  }

  // Manifest is read by the runtime's first-run bootstrap to register
  // these models in the local-inference registry. Format is intentionally
  // self-describing — `version: 1`, then a flat array of model objects.
  const manifest = {
    version: 1,
    models: manifestEntries,
  };
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
  console.log(
    `[stage-default-models] Wrote ${MANIFEST_PATH} with ${manifestEntries.length} entries.`,
  );
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  await main();
}
