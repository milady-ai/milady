#!/usr/bin/env bun
/**
 * Patches whisper.cpp Makefile for macOS arm64 sysctl noise and deprecated warnings.
 * Invoked by build-whisper.sh (avoid `node` heredoc — Bun's node shim rejects it).
 */
import fs from "node:fs";

const makefilePath = process.argv[2];
if (!makefilePath || !fs.existsSync(makefilePath)) {
  process.exit(0);
}

const original = fs.readFileSync(makefilePath, "utf8");
const patched = original
  .replace(
    "SYSCTL_M := $(shell sysctl -n hw.optional.arm64)",
    "SYSCTL_M := $(shell sysctl -n hw.optional.arm64 2>/dev/null || echo 0)",
  )
  .replace(
    "CFLAGS  += -DGGML_USE_ACCELERATE",
    "CFLAGS  += -DGGML_USE_ACCELERATE -Wno-deprecated-declarations",
  );

if (patched !== original) {
  fs.writeFileSync(makefilePath, patched, "utf8");
}
