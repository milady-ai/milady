#!/usr/bin/env node
// scripts/miladyos/smoke-cuttlefish.mjs — end-to-end smoke test for the
// on-device agent. Confirms: cvd is up → APK is installed → service
// starts → /api/health responds → bearer token is readable → chat round-
// trip works → response was generated locally (not cloud-routed).
//
// Designed to run after `node scripts/miladyos/build-aosp.mjs --launch`
// finishes. Idempotent: re-running on the same cvd is fine; the service
// is restartable. Exit code 0 on full pass, 1 on any failure.
//
// Works for both x86_64 cuttlefish and a real arm64-v8a device. The
// per-device ABI is read from `getprop ro.product.cpu.abi` so the
// reporter can call it out in the summary.
//
// Hard rule from the brief: this verifies LOCAL inference, not cloud-
// routed. Step 8 hits /api/local-inference/active and asserts the
// active model state is "ready" with a real modelId. If the runtime
// fell back to cloud (which it should NOT on AOSP with MILADY_LOCAL_-
// LLAMA=1) the test fails loudly.
//
// Caveat: the AOSP_LLAMA_PROVIDER constant referenced in some earlier
// briefs does not exist in the runtime. Local-vs-cloud detection uses
// the local-inference active-model state as the signal — that endpoint
// is only populated when a local libllama-backed model is loaded.

import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

const PACKAGE_NAME = "com.miladyai.milady";
const SERVICE_FQN = `${PACKAGE_NAME}/${PACKAGE_NAME}.MiladyAgentService`;
const AGENT_PORT = 31337;
// adb forward picks an arbitrary host port; we always pin to AGENT_PORT
// for simplicity. cvd binds 6520+ for its own ports so 31337 is free.
const HOST_PORT = 31337;
const HEALTH_TIMEOUT_MS = 30_000;
const HEALTH_POLL_INTERVAL_MS = 1_000;
const CHAT_TIMEOUT_MS = 60_000;

// ANSI color helpers — output is human-readable, no JSON for now.
const RESET = "[0m";
const RED = "[31m";
const GREEN = "[32m";
const CYAN = "[36m";

const TOTAL_STEPS = 8;

function color(c, s) {
  return `${c}${s}${RESET}`;
}

function logStep(n, label) {
  console.log(color(CYAN, `[${n}/${TOTAL_STEPS}] ${label}`));
}

export function formatResult(step, label, ok, detail) {
  const tag = ok ? color(GREEN, "PASS") : color(RED, "FAIL");
  const tail = detail ? ` — ${detail}` : "";
  return `[${step}/${TOTAL_STEPS}] ${tag} ${label}${tail}`;
}

export function summarize(results) {
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  const allPassed = failed === 0;
  const tag = allPassed
    ? color(GREEN, `PASS (${passed}/${results.length})`)
    : color(RED, `FAIL (${passed}/${results.length} passed, ${failed} failed)`);
  return { line: `Smoke test: ${tag}`, allPassed };
}

// Helper: synchronous adb invocation. Returns { stdout, stderr, status }.
// `serial` lets the caller target a specific device when more than one
// is attached (cvd commonly registers 0.0.0.0:6520).
function adb(args, { serial = null, timeout = 10_000 } = {}) {
  const fullArgs = serial ? ["-s", serial, ...args] : args;
  const result = spawnSync("adb", fullArgs, {
    encoding: "utf8",
    timeout,
  });
  return {
    stdout: (result.stdout ?? "").toString(),
    stderr: (result.stderr ?? "").toString(),
    status: result.status,
    error: result.error,
  };
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollHealth(deadline) {
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${HOST_PORT}/api/health`, {
        signal: AbortSignal.timeout(HEALTH_POLL_INTERVAL_MS),
      });
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        return { ok: true, body };
      }
    } catch {
      // fall through to retry
    }
    await sleep(HEALTH_POLL_INTERVAL_MS);
  }
  return { ok: false };
}

/**
 * Run the smoke test against the currently-attached cvd / device.
 *
 * Returns an array of { step, label, ok, detail } records — the caller
 * (CLI entry point) prints them and decides the exit code.
 */
export async function runSmoke({ adb: adbImpl = adb } = {}) {
  const results = [];
  let serial = null;

  // ── Step 1: verify cvd / device is up ───────────────────────────────
  logStep(1, "Verifying cvd / device is reachable via adb");
  const devicesResult = adbImpl(["devices"]);
  const deviceLines = devicesResult.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("List of devices"));
  const onlineDevices = deviceLines
    .filter((l) => /\sdevice$/.test(l))
    .map((l) => l.split(/\s+/)[0]);
  if (onlineDevices.length === 0) {
    results.push({
      step: 1,
      label: "cvd / device reachable",
      ok: false,
      detail:
        "no online adb devices found. Run `cvd_start_x86_64` (or attach a real device) before re-running.",
    });
    return results;
  }
  if (onlineDevices.length > 1) {
    serial = onlineDevices[0];
    results.push({
      step: 1,
      label: "cvd / device reachable",
      ok: true,
      detail: `multiple devices, using ${serial}`,
    });
  } else {
    serial = onlineDevices[0];
    results.push({ step: 1, label: "cvd / device reachable", ok: true });
  }

  // ── Step 2: verify APK installed + report ABI ───────────────────────
  logStep(2, `Verifying ${PACKAGE_NAME} is installed`);
  const pmList = adbImpl(["shell", "pm", "list", "packages", PACKAGE_NAME], {
    serial,
  });
  const installed = pmList.stdout.includes(`package:${PACKAGE_NAME}`);
  if (!installed) {
    results.push({
      step: 2,
      label: "Milady APK installed",
      ok: false,
      detail: `pm list packages did not show ${PACKAGE_NAME}. Reinstall via the AOSP image or sideload Milady.apk.`,
    });
    return results;
  }
  const abiOut = adbImpl(["shell", "getprop", "ro.product.cpu.abi"], {
    serial,
  });
  const abi = abiOut.stdout.trim() || "unknown";
  results.push({
    step: 2,
    label: "Milady APK installed",
    ok: true,
    detail: `abi=${abi}`,
  });

  // ── Step 3: launch the service explicitly ───────────────────────────
  logStep(3, "Starting MiladyAgentService");
  const startSvc = adbImpl(
    ["shell", "am", "start-foreground-service", "-n", SERVICE_FQN],
    { serial },
  );
  // am exits 0 with "Starting service: Intent..." on success. On older
  // Androids without start-foreground-service, fall back to startservice.
  const svcStdout = startSvc.stdout + startSvc.stderr;
  if (
    startSvc.status !== 0 ||
    /Error:|Unable to find|Bad component name/i.test(svcStdout)
  ) {
    const fallback = adbImpl(
      ["shell", "am", "startservice", "-n", SERVICE_FQN],
      {
        serial,
      },
    );
    if (
      fallback.status !== 0 ||
      /Error:|Unable to find/i.test(fallback.stdout + fallback.stderr)
    ) {
      results.push({
        step: 3,
        label: "MiladyAgentService start",
        ok: false,
        detail: `am start-foreground-service / startservice both failed: ${svcStdout
          .trim()
          .slice(0, 200)}`,
      });
      return results;
    }
  }
  results.push({ step: 3, label: "MiladyAgentService start", ok: true });

  // ── Step 4: wait for /api/health via adb forward ────────────────────
  logStep(4, `Waiting up to ${HEALTH_TIMEOUT_MS / 1000}s for /api/health`);
  const forwardResult = adbImpl(
    ["forward", `tcp:${HOST_PORT}`, `tcp:${AGENT_PORT}`],
    { serial },
  );
  if (forwardResult.status !== 0) {
    results.push({
      step: 4,
      label: "/api/health responds",
      ok: false,
      detail: `adb forward failed: ${forwardResult.stderr.trim()}`,
    });
    return results;
  }
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  const health = await pollHealth(deadline);
  if (!health.ok) {
    results.push({
      step: 4,
      label: "/api/health responds",
      ok: false,
      detail: `no 200 within ${HEALTH_TIMEOUT_MS / 1000}s. Check 'adb logcat -s MiladyAgent' for SIGSYS / spawn-failed signs.`,
    });
    return results;
  }
  results.push({
    step: 4,
    label: "/api/health responds",
    ok: true,
    detail: `agentState=${health.body.agentState ?? "?"} runtime=${health.body.runtime ?? "?"}`,
  });

  // ── Step 5: read the per-boot bearer token from app data dir ────────
  logStep(5, "Reading per-boot bearer token via run-as");
  const tokenResult = adbImpl(
    [
      "shell",
      "run-as",
      PACKAGE_NAME,
      "cat",
      `/data/data/${PACKAGE_NAME}/files/auth/local-agent-token`,
    ],
    { serial },
  );
  const token = tokenResult.stdout.trim();
  if (!token || token.length < 16 || /[^0-9a-fA-F]/.test(token)) {
    results.push({
      step: 5,
      label: "Bearer token readable",
      ok: false,
      detail: `run-as cat returned ${token ? `${token.length} chars (non-hex?)` : "empty"}; the service may not have written the token yet, or the build is non-userdebug.`,
    });
    return results;
  }
  results.push({
    step: 5,
    label: "Bearer token readable",
    ok: true,
    detail: `${token.length} hex chars`,
  });

  // ── Step 6: POST a chat message to /v1/chat/completions ─────────────
  logStep(6, "POSTing a chat message to /v1/chat/completions");
  const chatBody = {
    model: "milady",
    messages: [{ role: "user", content: "hello, who are you?" }],
    stream: false,
    max_tokens: 64,
  };
  let chatResp;
  try {
    chatResp = await fetch(
      `http://127.0.0.1:${HOST_PORT}/v1/chat/completions`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(chatBody),
        signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
      },
    );
  } catch (error) {
    results.push({
      step: 6,
      label: "Chat completion request",
      ok: false,
      detail: `fetch failed: ${error.message}`,
    });
    return results;
  }
  if (!chatResp.ok) {
    const text = await chatResp.text().catch(() => "");
    results.push({
      step: 6,
      label: "Chat completion request",
      ok: false,
      detail: `HTTP ${chatResp.status}: ${text.slice(0, 200)}`,
    });
    return results;
  }
  results.push({ step: 6, label: "Chat completion request", ok: true });

  // ── Step 7: assert the chat response contains a non-empty message ──
  logStep(7, "Asserting response shape");
  const chatJson = await chatResp.json().catch(() => null);
  const messageContent =
    chatJson?.choices?.[0]?.message?.content ??
    chatJson?.choices?.[0]?.delta?.content ??
    "";
  if (!messageContent || typeof messageContent !== "string") {
    results.push({
      step: 7,
      label: "Response shape",
      ok: false,
      detail: `choices[0].message.content was empty or non-string. Body: ${JSON.stringify(chatJson).slice(0, 200)}`,
    });
    return results;
  }
  results.push({
    step: 7,
    label: "Response shape",
    ok: true,
    detail: `${messageContent.length} chars: "${messageContent.slice(0, 60).replace(/\n/g, " ")}…"`,
  });

  // ── Step 8: verify the response was LOCAL, not cloud-routed ─────────
  logStep(8, "Verifying provider is local (not cloud-routed)");
  // The local-inference service tracks the active loaded model. On AOSP
  // with MILADY_LOCAL_LLAMA=1 the runtime registers libllama as the
  // local-inference loader; if a chat completion ran without a local
  // active-model entry, the response was cloud-routed (a contract bug
  // we want to catch loudly).
  let activeResp;
  try {
    activeResp = await fetch(
      `http://127.0.0.1:${HOST_PORT}/api/local-inference/active`,
      {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(HEALTH_POLL_INTERVAL_MS * 5),
      },
    );
  } catch (error) {
    results.push({
      step: 8,
      label: "Provider is local",
      ok: false,
      detail: `/api/local-inference/active fetch failed: ${error.message}`,
    });
    return results;
  }
  if (!activeResp.ok) {
    results.push({
      step: 8,
      label: "Provider is local",
      ok: false,
      detail: `/api/local-inference/active returned HTTP ${activeResp.status}`,
    });
    return results;
  }
  const active = await activeResp.json().catch(() => null);
  const status = active?.status ?? "?";
  const modelId = active?.modelId ?? null;
  if (status !== "ready" || !modelId) {
    results.push({
      step: 8,
      label: "Provider is local",
      ok: false,
      detail: `active.status=${status} modelId=${modelId ?? "null"} — chat may have been cloud-routed.`,
    });
    return results;
  }
  results.push({
    step: 8,
    label: "Provider is local",
    ok: true,
    detail: `active model: ${modelId}`,
  });

  return results;
}

export async function main(argv = process.argv.slice(2)) {
  const wantJson = argv.includes("--json");
  const results = await runSmoke();
  if (wantJson) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const r of results) {
      console.log(formatResult(r.step, r.label, r.ok, r.detail));
    }
  }
  const { line, allPassed } = summarize(results);
  console.log(line);
  process.exit(allPassed ? 0 : 1);
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  await main();
}

// Keep the unused-import lint quiet on `repoRoot`; it's exported so the
// reusable parts of this module can be imported without yanking the
// constant in tests.
export { repoRoot };
