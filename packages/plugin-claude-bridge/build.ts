#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";

async function build() {
  const start = performance.now();
  console.log("Building plugin-claude-bridge...");

  if (existsSync("dist")) {
    await rm("dist", { recursive: true, force: true });
  }

  const result = await Bun.build({
    entrypoints: ["./src/index.ts"],
    outdir: "./dist",
    target: "node",
    format: "esm",
    sourcemap: true,
    minify: false,
    external: ["node:*", "@elizaos/core"],
    naming: { entry: "[dir]/[name].[ext]" },
  });

  if (!result.success) {
    console.error("Build failed:", result.logs);
    process.exit(1);
  }

  const sizeMB = (result.outputs.reduce((s, o) => s + o.size, 0) / 1024 / 1024).toFixed(2);
  const elapsed = ((performance.now() - start) / 1000).toFixed(2);
  console.log(`Built ${result.outputs.length} file(s) - ${sizeMB}MB (${elapsed}s)`);
}

build().catch((err) => { console.error(err); process.exit(1); });
