/**
 * Vitest config for conversational scenario tests (*.convo.test.ts).
 *
 * Extends real.config.ts — inherits workspace aliases, PGLite inlining,
 * serial execution, and live-test environment flags.
 *
 * Conversation tests need longer timeouts because multi-turn LLM interactions
 * can take several minutes per scenario. The `include` is explicitly
 * overridden (not merged) so only *.convo.test.ts files run.
 */

import { defineConfig } from "vitest/config";
import baseConfig from "./real.config";

const base = baseConfig as {
  resolve?: unknown;
  test?: Record<string, unknown>;
};

export default defineConfig({
  resolve: base.resolve as ReturnType<typeof defineConfig>["resolve"],
  test: {
    ...(base.test ?? {}),
    testTimeout: 600_000,
    hookTimeout: 300_000,
    include: ["**/*.convo.test.ts", "**/*.convo.test.tsx"],
  },
});
