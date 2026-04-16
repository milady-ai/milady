import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { logger } from "@elizaos/core";

const DEBOUNCE_MS = 1500;
const BUILD_TIMEOUT_MS = 120_000;
const ACTIVE_SESSION_POLL_MS = 5_000;

interface WatcherState {
  buildInFlight: boolean;
  pendingRebuild: boolean;
  debounceTimer: NodeJS.Timeout | null;
  deferralTimer: NodeJS.Timeout | null;
  lastChangedFile: string | null;
}

type ActiveSessionChecker = () => boolean;

let activeSessionChecker: ActiveSessionChecker | null = null;

/**
 * Register a callback that returns true when there are active (non-terminal)
 * coding sessions. The self-rebuild watcher defers builds while this returns true.
 */
export function setActiveSessionChecker(checker: ActiveSessionChecker): void {
  activeSessionChecker = checker;
}

function resolvePluginDir(): string | null {
  const candidates = [
    path.join(process.cwd(), "plugins", "plugin-agent-orchestrator"),
    path.join(
      process.cwd(),
      "..",
      "..",
      "plugins",
      "plugin-agent-orchestrator",
    ),
  ];
  for (const candidate of candidates) {
    try {
      const resolved = path.resolve(candidate);
      if (
        fs.existsSync(path.join(resolved, "package.json")) &&
        fs.existsSync(path.join(resolved, "src"))
      ) {
        return resolved;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

function runRebuild(pluginDir: string, state: WatcherState): void {
  if (state.buildInFlight) {
    state.pendingRebuild = true;
    return;
  }

  if (activeSessionChecker?.()) {
    if (!state.deferralTimer) {
      logger?.info(
        "[self-rebuild] active coding sessions detected — deferring build",
      );
    }
    state.pendingRebuild = true;
    state.deferralTimer ??= setInterval(() => {
      if (!activeSessionChecker?.()) {
        clearInterval(state.deferralTimer!);
        state.deferralTimer = null;
        state.pendingRebuild = false;
        logger?.info(
          "[self-rebuild] all sessions terminal — starting deferred build",
        );
        runRebuild(pluginDir, state);
      }
    }, ACTIVE_SESSION_POLL_MS);
    return;
  }

  state.buildInFlight = true;
  const trigger = state.lastChangedFile ?? "(unknown)";
  state.lastChangedFile = null;
  const startedAt = Date.now();
  logger?.info(
    `[self-rebuild] change detected (${path.relative(pluginDir, trigger)}) — running bun run build`,
  );
  const child = spawn("bun", ["run", "build"], {
    cwd: pluginDir,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, CI: "1" },
  });
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    stdout += chunk.toString("utf-8");
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf-8");
  });
  const timeout = setTimeout(() => {
    logger?.warn(
      `[self-rebuild] build timed out after ${BUILD_TIMEOUT_MS}ms — killing`,
    );
    child.kill("SIGTERM");
  }, BUILD_TIMEOUT_MS);
  child.on("exit", (code) => {
    clearTimeout(timeout);
    state.buildInFlight = false;
    const durationMs = Date.now() - startedAt;
    if (code === 0) {
      logger?.info(
        `[self-rebuild] ok (${durationMs}ms) — restart milady dev to load the new plugin code`,
      );
    } else {
      const tail = (stderr || stdout).trim().split("\n").slice(-20).join("\n");
      logger?.warn(
        `[self-rebuild] FAILED exit=${code} (${durationMs}ms)\n${tail}`,
      );
    }
    if (state.pendingRebuild) {
      state.pendingRebuild = false;
      scheduleRebuild(pluginDir, state);
    }
  });
  child.on("error", (err) => {
    clearTimeout(timeout);
    state.buildInFlight = false;
    logger?.warn(`[self-rebuild] spawn error: ${err}`);
  });
}

function scheduleRebuild(pluginDir: string, state: WatcherState): void {
  if (state.debounceTimer) clearTimeout(state.debounceTimer);
  state.debounceTimer = setTimeout(() => {
    state.debounceTimer = null;
    runRebuild(pluginDir, state);
  }, DEBOUNCE_MS);
}

function shouldIgnore(relPath: string): boolean {
  if (!relPath) return true;
  if (relPath.startsWith("dist/") || relPath.includes("/dist/")) return true;
  if (relPath.startsWith("node_modules/") || relPath.includes("/node_modules/"))
    return true;
  if (relPath.endsWith(".d.ts")) return true;
  if (!/\.(ts|tsx|js|mjs|cjs|json)$/.test(relPath)) return true;
  return false;
}

let started = false;

/**
 * Watch plugin-agent-orchestrator/src for changes and rebuild the plugin
 * when the agent edits its own source. The running process keeps the old
 * dist in memory, so the rebuilt artifact only takes effect after the next
 * milady dev restart — the log line reminds the operator.
 *
 * If an ActiveSessionChecker is registered via setActiveSessionChecker(),
 * the watcher defers builds until all coding sessions reach a terminal state,
 * preventing mid-task restarts that kill in-flight coordinator state.
 */
export function startSelfRebuildWatcher(): void {
  if (started) return;
  if (process.env.MILADY_SELF_REBUILD === "0") return;

  const pluginDir = resolvePluginDir();
  if (!pluginDir) {
    logger?.debug(
      "[self-rebuild] plugin-agent-orchestrator source not found — watcher disabled",
    );
    return;
  }

  const srcDir = path.join(pluginDir, "src");
  const state: WatcherState = {
    buildInFlight: false,
    pendingRebuild: false,
    debounceTimer: null,
    deferralTimer: null,
    lastChangedFile: null,
  };

  try {
    const watcher = fs.watch(
      srcDir,
      { recursive: true },
      (_eventType, filename) => {
        if (!filename) return;
        const rel = filename.toString();
        if (shouldIgnore(rel)) return;
        state.lastChangedFile = path.join(srcDir, rel);
        scheduleRebuild(pluginDir, state);
      },
    );
    watcher.on("error", (err) => {
      logger?.warn(`[self-rebuild] watcher error: ${err}`);
    });
    started = true;
    logger?.info(`[self-rebuild] watching ${path.relative(process.cwd(), srcDir)}`);
  } catch (err) {
    logger?.warn(`[self-rebuild] failed to start watcher: ${err}`);
  }
}
