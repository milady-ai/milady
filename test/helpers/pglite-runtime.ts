/**
 * Shared PGLite runtime helper for tests.
 *
 * Creates a real AgentRuntime backed by an in-process PGLite database.
 * Use this instead of mocking the database — PGLite needs no API keys
 * and runs entirely in-process.
 *
 * Usage:
 *   let runtime: AgentRuntime;
 *   let cleanup: () => Promise<void>;
 *
 *   beforeAll(async () => {
 *     ({ runtime, cleanup } = await createTestRuntime());
 *   }, 180_000);
 *
 *   afterAll(async () => {
 *     await cleanup();
 *   });
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Plugin } from "@elizaos/core";
import { AgentRuntime, createCharacter, logger } from "@elizaos/core";
import { default as pluginSql } from "@elizaos/plugin-sql";

export interface TestRuntimeOptions {
  /** Name for the test agent character. Defaults to "TestAgent". */
  characterName?: string;
  /** Additional plugins to register (plugin-sql is always included). */
  plugins?: Plugin[];
}

export interface TestRuntimeResult {
  runtime: AgentRuntime;
  /** Stops the runtime and removes the temp PGLite directory. */
  cleanup: () => Promise<void>;
}

/**
 * Create a real AgentRuntime with a PGLite database in a temp directory.
 *
 * The runtime is fully initialized and ready for use. Call `cleanup()` in
 * afterAll to stop the runtime and remove the temp directory.
 *
 * Callers should use a generous timeout (e.g. `beforeAll(async () => { ... }, 180_000)`)
 * since PGLite initialization can take a few seconds.
 */
export async function createTestRuntime(
  options?: TestRuntimeOptions,
): Promise<TestRuntimeResult> {
  const pgliteDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "eliza-test-pglite-"),
  );

  const prevPgliteDir = process.env.PGLITE_DATA_DIR;
  process.env.PGLITE_DATA_DIR = pgliteDir;

  const character = createCharacter({
    name: options?.characterName ?? "TestAgent",
  });

  const runtime = new AgentRuntime({
    character,
    plugins: [],
    logLevel: "warn",
    enableAutonomy: false,
  });

  await runtime.registerPlugin(pluginSql);
  for (const plugin of options?.plugins ?? []) {
    await runtime.registerPlugin(plugin);
  }
  await runtime.initialize();

  const cleanup = async () => {
    try {
      await runtime.stop();
    } catch (err) {
      logger.debug(`[test] runtime.stop() error: ${err}`);
    }
    // Restore previous env
    if (prevPgliteDir !== undefined) {
      process.env.PGLITE_DATA_DIR = prevPgliteDir;
    } else {
      delete process.env.PGLITE_DATA_DIR;
    }
    try {
      fs.rmSync(pgliteDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  };

  return { runtime, cleanup };
}
