/**
 * Combined dev server — starts the ElizaOS runtime in headless mode and
 * wires it into the API server so the Control UI has a live agent to talk to.
 *
 * The MILADY_HEADLESS env var tells startEliza() to skip the interactive
 * CLI chat loop and return the AgentRuntime instance.
 *
 * Usage: bun src/runtime/dev-server.ts   (with MILADY_HEADLESS=1)
 *        (or via the dev script: bun run dev)
 */
import process from "node:process";
import type { AgentRuntime } from "@elizaos/core";
import { logger } from "@elizaos/core";
import { startApiServer } from "../api/server";
import { startEliza } from "./eliza";
import { setRestartHandler } from "./restart";

// Load .env files for parity with CLI mode (which loads via run-main.ts).
try {
  const { config } = await import("dotenv");
  config();
} catch {
  // dotenv not installed or .env not found — non-fatal.
}

const port = Number(process.env.MILADY_PORT) || 31337;

const MAX_STARTUP_ATTEMPTS = 5;
const BASE_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 5_000;

/** The currently active runtime — swapped on restart. */
let currentRuntime: AgentRuntime | null = null;

/** The API server's `updateRuntime` handle (set after startup). */
let apiUpdateRuntime: ((rt: AgentRuntime) => void) | null = null;

/** Guards against concurrent restart attempts (bun --watch + API restart). */
let isRestarting = false;

/** Tracks whether the process is shutting down to prevent restart during exit. */
let isShuttingDown = false;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function withRetries<T>(
  label: string,
  action: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_STARTUP_ATTEMPTS; attempt++) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (attempt >= MAX_STARTUP_ATTEMPTS) break;

      const delay = Math.min(
        MAX_RETRY_DELAY_MS,
        BASE_RETRY_DELAY_MS * 2 ** (attempt - 1),
      );
      logger.warn(
        `[milady] ${label} failed (attempt ${attempt}/${MAX_STARTUP_ATTEMPTS}) — retrying in ${delay}ms`,
      );
      await sleep(delay);
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error(`Unknown error while ${label}`);
}

/**
 * Create a fresh runtime via startEliza (headless).
 * If a runtime is already running, stop it first.
 */
async function createRuntime(): Promise<AgentRuntime> {
  if (currentRuntime) {
    try {
      await currentRuntime.stop();
    } catch (err) {
      logger.warn(
        `[milady] Error stopping old runtime: ${err instanceof Error ? err.message : err}`,
      );
    }
    currentRuntime = null;
  }

  const result = await startEliza({ headless: true });
  if (!result) {
    throw new Error("startEliza returned null — runtime failed to initialize");
  }

  currentRuntime = result as AgentRuntime;
  return currentRuntime;
}

/**
 * Restart handler for headless / dev-server mode.
 *
 * Stops the current runtime, creates a new one, and hot-swaps the
 * API server's reference so the UI sees the fresh agent immediately.
 *
 * Protected by a lock so concurrent restart requests (e.g. rapid file
 * saves triggering bun --watch while an API restart is in-flight) don't
 * overlap and corrupt state.
 */
async function handleRestart(reason?: string): Promise<void> {
  if (isShuttingDown) {
    logger.warn("[milady] Restart skipped — process is shutting down");
    return;
  }

  if (isRestarting) {
    logger.warn(
      "[milady] Restart already in progress, skipping duplicate request",
    );
    return;
  }

  isRestarting = true;
  try {
    logger.info(
      `[milady] Restart requested${reason ? ` (${reason})` : ""} — bouncing runtime…`,
    );

    const rt = await withRetries("runtime restart", createRuntime);
    const agentName = rt.character.name ?? "Milady";
    logger.info(`[milady] Runtime restarted — agent: ${agentName}`);

    // Hot-swap the API server's runtime reference.
    if (apiUpdateRuntime) {
      apiUpdateRuntime(rt);
    }
  } finally {
    isRestarting = false;
  }
}

/**
 * Graceful shutdown for the dev-server process.
 *
 * Since we told startEliza to run in headless mode (which now skips
 * registering its own SIGINT/SIGTERM handlers), we own the shutdown
 * lifecycle here.
 */
async function shutdown(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info("[milady] Dev server shutting down…");
  if (currentRuntime) {
    try {
      await currentRuntime.stop();
    } catch (err) {
      logger.warn(
        `[milady] Error stopping runtime during shutdown: ${err instanceof Error ? err.message : err}`,
      );
    }
    currentRuntime = null;
  }
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

async function main() {
  // Register the in-process restart handler so the RESTART_AGENT action
  // (and the POST /api/agent/restart endpoint) work without killing the
  // process.
  setRestartHandler(handleRestart);

  // 1. Start the API server first (no runtime yet) so the UI can connect
  //    immediately while the heavier agent runtime boots in the background.
  const { port: actualPort, updateRuntime } = await withRetries(
    "API server startup",
    () =>
      startApiServer({
        port,
        onRestart: async () => {
          await handleRestart("api");
          return currentRuntime;
        },
      }),
  );
  apiUpdateRuntime = updateRuntime;
  logger.info(`[milady] API server ready on port ${actualPort}`);

  // 2. Boot the ElizaOS agent runtime (plugin loading, migrations, etc.).
  const runtime = await withRetries("runtime startup", createRuntime);
  const agentName = runtime.character.name ?? "Milady";
  logger.info(`[milady] Runtime ready — agent: ${agentName}`);

  // 3. Wire the live runtime into the already-running API server.
  updateRuntime(runtime);
}

main().catch((err: unknown) => {
  const error = err instanceof Error ? err : new Error(String(err));
  console.error("[milady] Fatal error:", error.stack ?? error.message);
  if (error.cause) {
    const cause =
      error.cause instanceof Error
        ? error.cause
        : new Error(String(error.cause));
    console.error("[milady] Caused by:", cause.stack ?? cause.message);
  }
  process.exit(1);
});
