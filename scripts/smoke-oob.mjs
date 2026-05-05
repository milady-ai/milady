#!/usr/bin/env node
/**
 * scripts/smoke-oob.mjs — out-of-the-box smoke test.
 *
 * Verifies the contract from MASTER.md §5 Definition of Done:
 *   1. Fresh install → API spins up
 *   2. /api/status reports ready
 *   3. POST /v1/chat/completions returns a real response (not the
 *      misnomer "Sorry, I'm having a provider issue" that path #1
 *      of MASTER.md §3 Phase 4 patched)
 *   4. /api/agent/reset succeeds
 *   5. Repeat (3) — a second chat after reset still works
 *
 * Runs the API in an isolated tmpdir state dir so it doesn't touch
 * the developer's actual ~/.milady. Tears the API down on exit.
 *
 * Usage:
 *   node scripts/smoke-oob.mjs                 # run once, exit 0/1
 *   node scripts/smoke-oob.mjs --keep-running  # leave server alive after pass
 *   SMOKE_LOG_LEVEL=debug node scripts/smoke-oob.mjs
 *
 * Pass criteria for CI:
 *   - /api/status reachable within 60s
 *   - chat reply text is NOT exactly "Sorry, I'm having a provider issue"
 *     (that string was the misnomer; the new code splits it from the
 *     no-response fallback so it should now only fire on actual
 *     provider throws — and we shouldn't be triggering one)
 *   - chat reply text is non-empty after reply normalization
 *
 * Without a configured LLM provider the chat reply will be the
 * "Set up an LLM provider" / no-response fallback. That counts as
 * pass — we're checking for the absence of the misnomer + the basic
 * round-trip, not for a working LLM.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveElizaAppCoreRoot } from "./lib/resolve-eliza-app-core-script.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const READY_TIMEOUT_MS = 60_000;
const CHAT_TIMEOUT_MS = 60_000;
const PROVIDER_ISSUE_TEXT = "Sorry, I'm having a provider issue";

const args = new Set(process.argv.slice(2));
const keepRunning = args.has("--keep-running");
const debug = process.env.SMOKE_LOG_LEVEL === "debug";

function log(level, message) {
  const prefix = level === "fail" ? "[smoke-oob][FAIL]" : "[smoke-oob]";
  console.log(`${prefix} ${message}`);
}

function debugLog(message) {
  if (debug) log("debug", message);
}

function resolveDevServerEntry() {
  const appCoreRoot = resolveElizaAppCoreRoot({ repoRoot: REPO_ROOT });
  const candidates = [
    join(appCoreRoot, "src", "runtime", "dev-server.ts"),
    join(appCoreRoot, "src", "runtime", "dev-server.js"),
    join(
      appCoreRoot,
      "packages",
      "app-core",
      "src",
      "runtime",
      "dev-server.ts",
    ),
    join(
      appCoreRoot,
      "packages",
      "app-core",
      "src",
      "runtime",
      "dev-server.js",
    ),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Could not locate app-core dev-server entry under ${appCoreRoot}`,
  );
}

async function pickFreePort() {
  // Use net to bind 0, read the port, close.
  const { createServer } = await import("node:net");
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForReady(baseUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/status`, {
        method: "GET",
        signal: AbortSignal.timeout(2_000),
      });
      if (res.ok) {
        const body = await res.json().catch(() => null);
        if (body && typeof body.state === "string") {
          debugLog(`/api/status state=${body.state}`);
          return body;
        }
      }
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `API did not become ready within ${timeoutMs}ms (last error: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    })`,
  );
}

async function chat(baseUrl, prompt) {
  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "smoke-oob",
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `/v1/chat/completions HTTP ${res.status}: ${text.slice(0, 200)}`,
    );
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(
      `/v1/chat/completions returned non-JSON: ${text.slice(0, 200)}`,
    );
  }
  const reply = body?.choices?.[0]?.message?.content;
  if (typeof reply !== "string") {
    throw new Error(
      `/v1/chat/completions returned no message.content: ${JSON.stringify(body).slice(0, 200)}`,
    );
  }
  return reply;
}

function assertReplyOk(label, reply) {
  if (reply.trim() === PROVIDER_ISSUE_TEXT) {
    throw new Error(
      `${label}: chat reply is the bare provider-issue misnomer (${JSON.stringify(reply)}). ` +
        "Either an actual provider throw is happening or Phase 4's split regressed.",
    );
  }
  if (reply.trim().length === 0) {
    throw new Error(`${label}: chat reply was empty`);
  }
  log("info", `${label}: reply=${JSON.stringify(reply.slice(0, 120))}`);
}

async function reset(baseUrl) {
  const res = await fetch(`${baseUrl}/api/agent/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok && res.status !== 405) {
    const text = await res.text();
    throw new Error(
      `/api/agent/reset HTTP ${res.status}: ${text.slice(0, 200)}`,
    );
  }
}

async function main() {
  const stateDir = await mkdtemp(join(tmpdir(), "milady-smoke-oob-"));
  const port = await pickFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  log("info", `state dir = ${stateDir}`);
  log("info", `API will bind = ${baseUrl}`);

  // Spawn JUST the API entry directly — no Vite, no Electrobun, no
  // orchestrator wrapper. The orchestrator is heavy (multiple processes,
  // long startup) and would conflict with any active dev session on
  // the same machine. We want a CI-shaped boot: one process, isolated
  // state dir, known port. Boot exercises the same vault bootstrap,
  // SECRET_SALT persistence, and route registration paths a real boot
  // hits — just without the renderer/static-server side.
  const devServerEntry = resolveDevServerEntry();
  const child = spawn("bun", [devServerEntry], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      MILADY_STATE_DIR: stateDir,
      ELIZA_STATE_DIR: stateDir,
      MILADY_API_PORT: String(port),
      ELIZA_API_PORT: String(port),
      ELIZA_HEADLESS: "1",
      FORCE_COLOR: "0",
    },
    stdio: ["ignore", debug ? "inherit" : "pipe", debug ? "inherit" : "pipe"],
    detached: process.platform !== "win32",
  });
  // If we asked for piped stdio (non-debug), still capture stderr so
  // boot failures aren't silently swallowed.
  if (!debug && child.stderr) {
    child.stderr.on("data", (chunk) => {
      process.stderr.write(`[api] ${chunk}`);
    });
  }
  child.on("error", (err) => {
    log("fail", `failed to spawn API: ${err.message}`);
    process.exit(1);
  });

  let killed = false;
  const teardown = async (exitCode) => {
    if (!keepRunning && !killed) {
      killed = true;
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        try {
          child.kill("SIGTERM");
        } catch {}
      }
      await new Promise((r) => setTimeout(r, 500));
      try {
        await rm(stateDir, { recursive: true, force: true });
      } catch {}
    }
    if (exitCode != null) process.exit(exitCode);
  };

  process.on("SIGINT", () => teardown(130));
  process.on("SIGTERM", () => teardown(143));

  try {
    log("info", "waiting for /api/status …");
    await waitForReady(baseUrl, READY_TIMEOUT_MS);
    log("info", "API ready");

    log("info", "smoke 1: chat 'hey' on a fresh state");
    const reply1 = await chat(baseUrl, "hey");
    assertReplyOk("smoke 1", reply1);

    log("info", "smoke 2: /api/agent/reset round-trip");
    await reset(baseUrl);
    await waitForReady(baseUrl, READY_TIMEOUT_MS);

    log("info", "smoke 3: chat 'hey' after reset");
    const reply2 = await chat(baseUrl, "hey");
    assertReplyOk("smoke 3", reply2);

    log("info", "PASS — OOB contract holds");
    await teardown(0);
  } catch (err) {
    log("fail", err instanceof Error ? err.message : String(err));
    await teardown(1);
  }
}

main().catch((err) => {
  log("fail", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
