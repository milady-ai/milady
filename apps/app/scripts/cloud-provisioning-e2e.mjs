#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const appId = "ai.milady.milady";
const defaultCloudApiBase = "https://api.elizacloud.ai";
const defaultAndroidApk = path.resolve(
  "android/app/build/outputs/apk/debug/app-debug.apk",
);

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasArg(name) {
  return process.argv.includes(name);
}

if (hasArg("--help") || hasArg("-h")) {
  console.log(`Usage:
  ELIZA_CLOUD_AUTH_TOKEN=... bun run test:cloud:provisioning -- --surfaces programmatic
  ELIZA_CLOUD_AUTH_TOKEN=... bun run test:cloud:provisioning -- --surfaces programmatic,web --web-url http://127.0.0.1:2138
  ELIZA_CLOUD_AUTH_TOKEN=... bun run test:cloud:provisioning -- --surfaces programmatic,android --android-apk android/app/build/outputs/apk/debug/app-debug.apk
  ELIZA_CLOUD_AUTH_TOKEN=... bun run test:cloud:provisioning -- --surfaces programmatic,ios-simulator --ios-app ios/App/build/...

Options:
  --token <token>              Cloud API token; env ELIZA_CLOUD_AUTH_TOKEN also works.
  --agent-id <id>              Use an existing Cloud agent instead of first/listed agent.
  --agent-name <name>          Agent name used when creating an agent if none exists.
  --fresh-agent                Always create a new Cloud agent for this run.
  --cloud-api-base <url>       Default: https://api.elizacloud.ai
  --timeout-ms <ms>            Provisioning wait deadline. Default: 600000.
  --provision-sync             Request legacy sync provisioning (?sync=true).
  --interactive-login          Open Eliza Cloud CLI login if no token is set.
  --login-timeout-ms <ms>      Browser login wait deadline. Default: 120000.
  --report <path>              Write redacted JSON report.
`);
  process.exit(0);
}

function splitList(value) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const surfaces = splitList(
  argValue("--surfaces") ?? argValue("--surface") ?? "programmatic",
);
let token =
  argValue("--token") ??
  process.env.ELIZA_CLOUD_AUTH_TOKEN ??
  process.env.MILADY_E2E_ELIZACLOUD_API_KEY ??
  process.env.ELIZACLOUD_API_KEY;
const cloudApiBase = (
  argValue("--cloud-api-base") ??
  process.env.ELIZA_CLOUD_API_BASE ??
  process.env.MILADY_E2E_ELIZACLOUD_BASE_URL ??
  defaultCloudApiBase
).replace(/\/+$/, "");
const agentIdArg = argValue("--agent-id") ?? process.env.ELIZA_CLOUD_AGENT_ID;
const agentName =
  argValue("--agent-name") ??
  process.env.ELIZA_CLOUD_AGENT_NAME ??
  `Milady Cloud E2E ${new Date().toISOString()}`;
const provisionTimeoutMs = Number(argValue("--timeout-ms") ?? 600_000);
const pollIntervalMs = Number(argValue("--poll-ms") ?? 3_000);
const loginTimeoutMs = Number(argValue("--login-timeout-ms") ?? 120_000);
const reportPath = argValue("--report");
const provisionSync = hasArg("--provision-sync");
const interactiveLogin =
  hasArg("--interactive-login") ||
  hasArg("--login") ||
  process.env.MILADY_E2E_ELIZACLOUD_INTERACTIVE_LOGIN === "1";

function log(message) {
  console.log(`[cloud-e2e] ${message}`);
}

function run(args, options = {}) {
  return execFileSync(args[0], args.slice(1), {
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function requireToken() {
  if (!token?.trim()) {
    throw new Error(
      "Missing Cloud token. Set ELIZA_CLOUD_AUTH_TOKEN, pass --token, or use --interactive-login.",
    );
  }
  return token.trim();
}

function redact(value) {
  const cloudToken = token?.trim();
  if (!cloudToken) return value;
  return String(value).replaceAll(cloudToken, "<redacted-token>");
}

function tryJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : null;
}

function dataRecord(value) {
  const outer = record(value);
  if (!outer) return null;
  return record(outer.data) ?? outer;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function normalizeStatus(value) {
  const status = String(value ?? "")
    .trim()
    .toLowerCase();
  switch (status) {
    case "complete":
    case "completed":
    case "success":
    case "succeeded":
      return "completed";
    case "process":
    case "processing":
    case "in_progress":
    case "running":
    case "pending":
    case "queued":
      return status === "running" ? "processing" : status;
    case "fail":
    case "failed":
    case "error":
      return "failed";
    default:
      return status || "unknown";
  }
}

function resolveRuntimeUrl(...values) {
  for (const value of values) {
    const item = record(value);
    if (!item) continue;
    const url = firstString(
      item.bridgeUrl,
      item.bridge_url,
      item.webUiUrl,
      item.web_ui_url,
      item.runtimeUrl,
      item.runtime_url,
      item.containerUrl,
      item.container_url,
      item.apiBase,
      item.api_base,
    );
    if (url) return url.replace(/\/+$/, "");
  }
  return null;
}

function cloudErrorMessage(status, body, url) {
  const payload = record(body);
  const detail =
    firstString(payload?.error, payload?.message, payload?.reason) ??
    (typeof body === "string" && body.trim() ? body.trim() : null);
  return detail
    ? `Cloud request failed (${status}) ${url}: ${detail}`
    : `Cloud request failed (${status}) ${url}`;
}

function isAcceptableCloudResponse(status, body) {
  if (status >= 200 && status < 300) return true;
  const payload = record(body);
  return payload?.success === true;
}

function responseDiagnostics(response) {
  const headers = {};
  for (const name of [
    "date",
    "cf-ray",
    "x-request-id",
    "x-correlation-id",
    "server",
    "via",
  ]) {
    const value = response.headers.get(name);
    if (value) headers[name] = value;
  }
  return headers;
}

function resolveCloudWebBase() {
  try {
    const url = new URL(cloudApiBase);
    if (url.hostname === "api.elizacloud.ai") {
      return "https://www.elizacloud.ai";
    }
    return url.origin;
  } catch {
    return "https://www.elizacloud.ai";
  }
}

function openBrowser(url) {
  if (process.platform === "darwin") {
    run(["open", url]);
    return;
  }
  if (process.platform === "win32") {
    run(["cmd", "/c", "start", "", url]);
    return;
  }
  run(["xdg-open", url]);
}

async function waitForBrowserLogin(sessionId) {
  const deadline = Date.now() + loginTimeoutMs;
  const url = `${cloudApiBase}/api/auth/cli-session/${encodeURIComponent(
    sessionId,
  )}`;
  while (Date.now() < deadline) {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    const text = await response.text();
    const body = tryJson(text) ?? {};
    if (!response.ok && response.status !== 404) {
      throw new Error(`Cloud login poll failed (${response.status}): ${text}`);
    }
    const payload = record(body) ?? {};
    const apiKey = firstString(payload.apiKey, payload.api_key, payload.token);
    if (payload.status === "authenticated" && apiKey) {
      return apiKey;
    }
    if (payload.status === "expired" || response.status === 404) {
      throw new Error("Cloud login session expired before authentication.");
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(
    `Timed out after ${loginTimeoutMs}ms waiting for Eliza Cloud browser login.`,
  );
}

async function acquireTokenFromBrowserLogin() {
  const sessionId =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const response = await fetch(`${cloudApiBase}/api/auth/cli-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Cloud login session create failed (${response.status}): ${text}`,
    );
  }
  const loginUrl = `${resolveCloudWebBase()}/auth/cli-login?session=${encodeURIComponent(
    sessionId,
  )}`;
  log("opening Eliza Cloud browser login");
  openBrowser(loginUrl);
  token = await waitForBrowserLogin(sessionId);
  log("Eliza Cloud browser login authenticated");
}

async function ensureToken() {
  if (token?.trim()) return;
  if (!interactiveLogin) return;
  await acquireTokenFromBrowserLogin();
}

async function cloudRequest(pathname, init = {}) {
  const authToken = requireToken();
  const url = `${cloudApiBase}${pathname}`;
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${authToken}`,
    ...(init.headers ?? {}),
  };
  const response = await fetch(url, {
    ...init,
    headers,
  });
  const text = await response.text();
  const body = tryJson(text) ?? text;
  if (!isAcceptableCloudResponse(response.status, body)) {
    const error = new Error(cloudErrorMessage(response.status, body, url));
    error.status = response.status;
    error.url = url;
    error.body = body;
    error.headers = responseDiagnostics(response);
    throw error;
  }
  return {
    status: response.status,
    body,
    text,
    url,
    headers: responseDiagnostics(response),
  };
}

async function listAgents() {
  const response = await cloudRequest("/api/v1/eliza/agents");
  const payload = record(response.body);
  const data = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(response.body)
      ? response.body
      : [];
  return data.map((item) => dataRecord(item) ?? item).filter(Boolean);
}

async function createAgent() {
  const response = await cloudRequest("/api/v1/eliza/agents", {
    method: "POST",
    body: JSON.stringify({ agentName }),
  });
  const data = dataRecord(response.body);
  const id = firstString(data?.id, data?.agentId, data?.agent_id);
  if (!id) {
    throw new Error(`Cloud create returned no agent id: ${response.text}`);
  }
  return { ...data, id };
}

async function getAgent(agentId) {
  const response = await cloudRequest(
    `/api/v1/eliza/agents/${encodeURIComponent(agentId)}`,
  );
  const data = dataRecord(response.body);
  return data
    ? { ...data, id: firstString(data.id, data.agentId) ?? agentId }
    : null;
}

async function resolveAgent() {
  if (agentIdArg?.trim()) {
    const existing = await getAgent(agentIdArg.trim());
    if (!existing) throw new Error(`Cloud agent not found: ${agentIdArg}`);
    return existing;
  }

  if (hasArg("--fresh-agent")) {
    return createAgent();
  }

  const agents = await listAgents();
  const named = agents.find(
    (agent) =>
      firstString(agent.agentName, agent.name, agent.agent_name) === agentName,
  );
  const selected = named ?? agents[0];
  if (selected) return selected;

  if (hasArg("--no-create")) {
    throw new Error("No Cloud agents found and --no-create was passed.");
  }
  return createAgent();
}

function provisionInfo(body, fallbackAgentId) {
  const payload = record(body) ?? {};
  const data = dataRecord(body) ?? {};
  const jobId = firstString(
    data.jobId,
    data.job_id,
    payload.jobId,
    payload.job_id,
    data.id,
  );
  const agentId = firstString(
    data.agentId,
    data.agent_id,
    payload.agentId,
    payload.agent_id,
    fallbackAgentId,
  );
  const runtimeUrl = resolveRuntimeUrl(data, payload);
  const status = normalizeStatus(
    firstString(data.status, data.state, payload.status, payload.state),
  );
  return { agentId, jobId, runtimeUrl, status };
}

function jobInfo(body) {
  const payload = record(body) ?? {};
  const data = dataRecord(body) ?? {};
  const result = record(data.result) ?? record(payload.result);
  const status = normalizeStatus(
    firstString(
      data.status,
      data.state,
      data.phase,
      payload.status,
      payload.state,
    ),
  );
  const runtimeUrl = resolveRuntimeUrl(result, data, payload);
  const error =
    firstString(
      data.error,
      data.message,
      data.reason,
      payload.error,
      payload.message,
    ) ??
    record(data.error)?.message ??
    null;
  return { status, runtimeUrl, error };
}

async function provisionAgent(agentId) {
  log(`starting Cloud provision for agent=${agentId}`);
  const response = await cloudRequest(
    `/api/v1/eliza/agents/${encodeURIComponent(agentId)}/provision${
      provisionSync ? "?sync=true" : ""
    }`,
    { method: "POST" },
  );
  return provisionInfo(response.body, agentId);
}

async function waitForRuntimeUrl(agentId, provision) {
  if (provision.runtimeUrl) return provision.runtimeUrl;

  const deadline = Date.now() + provisionTimeoutMs;
  while (Date.now() < deadline) {
    if (provision.jobId) {
      const jobResponse = await cloudRequest(
        `/api/v1/jobs/${encodeURIComponent(provision.jobId)}`,
      );
      const job = jobInfo(jobResponse.body);
      if (job.runtimeUrl) return job.runtimeUrl;
      if (job.status === "failed") {
        throw new Error(
          `Cloud provision job failed: ${job.error ?? "unknown error"}`,
        );
      }
    }

    const agent = await getAgent(agentId).catch(() => null);
    const runtimeUrl = resolveRuntimeUrl(agent);
    if (runtimeUrl) return runtimeUrl;

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(
    `Timed out after ${provisionTimeoutMs}ms waiting for Cloud runtime URL.`,
  );
}

async function probeRuntime(runtimeUrl) {
  const authToken = requireToken();
  const endpoints = ["/api/status", "/api/health", "/api/auth/me"];
  const failures = [];
  for (const endpoint of endpoints) {
    const url = `${runtimeUrl}${endpoint}`;
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${authToken}`,
          "X-ElizaOS-Client-Id": "cloud-provisioning-e2e",
        },
      });
      const text = await response.text();
      if (response.ok) {
        return {
          ok: true,
          url,
          status: response.status,
          body: tryJson(text) ?? text.slice(0, 500),
        };
      }
      failures.push({ url, status: response.status, body: text.slice(0, 500) });
    } catch (error) {
      failures.push({ url, error: String(error) });
    }
  }
  throw new Error(
    `Provisioned runtime did not answer: ${JSON.stringify(failures)}`,
  );
}

async function runProgrammaticSurface() {
  const agent = await resolveAgent();
  const agentId = firstString(agent.id, agent.agentId, agent.agent_id);
  if (!agentId) throw new Error("Selected Cloud agent has no id.");
  let provision;
  try {
    provision = await provisionAgent(agentId);
  } catch (error) {
    error.agent = summarizeAgent(agent, agentId);
    throw error;
  }
  const runtimeUrl = await waitForRuntimeUrl(agentId, provision);
  const probe = await probeRuntime(runtimeUrl);
  return {
    agentId,
    agentName: firstString(agent.agentName, agent.name, agent.agent_name),
    runtimeUrl,
    provision,
    probe,
  };
}

function summarizeAgent(agent, fallbackAgentId) {
  return {
    id: firstString(agent.id, agent.agentId, agent.agent_id, fallbackAgentId),
    name: firstString(agent.agentName, agent.name, agent.agent_name),
    status: firstString(agent.status, agent.state),
    databaseStatus: firstString(agent.databaseStatus, agent.database_status),
    bridgeUrl: firstString(agent.bridgeUrl, agent.bridge_url),
    runtimeUrl: firstString(agent.runtimeUrl, agent.runtime_url),
    containerUrl: firstString(agent.containerUrl, agent.container_url),
    createdAt: firstString(agent.createdAt, agent.created_at),
    updatedAt: firstString(agent.updatedAt, agent.updated_at),
    lastHeartbeatAt: firstString(
      agent.lastHeartbeatAt,
      agent.last_heartbeat_at,
    ),
    errorMessage: firstString(agent.errorMessage, agent.error_message),
  };
}

async function runWebSurface(context) {
  const webUrl = argValue("--web-url") ?? process.env.MILADY_CLOUD_E2E_WEB_URL;
  if (!webUrl) {
    throw new Error("Missing --web-url for web surface.");
  }
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: !hasArg("--headed") });
  try {
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    await page.addInitScript(
      ({ activeServer, cloudToken }) => {
        localStorage.setItem(
          "elizaos:active-server",
          JSON.stringify(activeServer),
        );
        localStorage.setItem("eliza:onboarding-complete", "1");
        localStorage.setItem("eliza:mobile-runtime-mode", "cloud");
        globalThis.__ELIZA_CLOUD_AUTH_TOKEN__ = cloudToken;
        globalThis.__ELIZAOS_API_BASE__ = activeServer.apiBase;
        globalThis.__ELIZA_API_BASE__ = activeServer.apiBase;
        globalThis.__ELIZAOS_API_TOKEN__ = cloudToken;
        globalThis.__ELIZA_API_TOKEN__ = cloudToken;
      },
      {
        activeServer: {
          id: `cloud:${context.agentId}`,
          kind: "cloud",
          label: context.agentName ?? context.agentId,
          apiBase: context.runtimeUrl,
          accessToken: requireToken(),
        },
        cloudToken: requireToken(),
      },
    );
    await page.goto(webUrl, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const text = document.body?.innerText ?? "";
        if (
          /Cloud request failed|Backend unreachable|Load failed/i.test(text)
        ) {
          return true;
        }
        return (
          /Setup Provider To Chat|hey, good to see you|Eliza/i.test(text) &&
          !/Choose your setup/i.test(text)
        );
      },
      null,
      { timeout: 90_000 },
    );
    const body = await page.locator("body").innerText({ timeout: 5_000 });
    const url = page.url();
    if (/Cloud request failed|Backend unreachable|Load failed/i.test(body)) {
      throw new Error(`Web UI connection failed: ${body.slice(0, 500)}`);
    }
    return {
      url,
      body: body.slice(0, 500),
      consoleErrors: consoleErrors.slice(0, 20),
    };
  } finally {
    await browser.close();
  }
}

function serializeFailure(error) {
  return {
    ok: false,
    error: error?.message ?? String(error),
    status: error?.status,
    url: error?.url,
    headers: error?.headers,
    agent: error?.agent,
    body: error?.body,
  };
}

function writeReport(report) {
  if (!reportPath) return;
  fs.writeFileSync(reportPath, `${redact(JSON.stringify(report, null, 2))}\n`);
  log(`wrote report ${reportPath}`);
}

async function cdpEvaluate(webSocketDebuggerUrl, expression, timeoutMs) {
  const ws = new WebSocket(webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const waiter = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
    else waiter.resolve(message.result);
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  const send = (method, params = {}) => {
    const id = ++seq;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
  };
  try {
    await send("Runtime.enable");
    const result = await Promise.race([
      send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      }),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("CDP evaluation timed out")),
          timeoutMs,
        ),
      ),
    ]);
    if (result.exceptionDetails) {
      throw new Error(JSON.stringify(result.exceptionDetails, null, 2));
    }
    return result.result.value;
  } finally {
    ws.close();
  }
}

function resolveAndroidSerial() {
  const serial = argValue("--android-serial") ?? process.env.ANDROID_SERIAL;
  if (serial) return serial;
  const adb =
    process.env.ADB ??
    path.join(os.homedir(), "Library/Android/sdk/platform-tools/adb");
  const output = run([adb, "devices"]);
  const line = output
    .split("\n")
    .find((entry) => /^emulator-\d+\s+device$/.test(entry.trim()));
  if (!line) throw new Error("No running Android emulator found.");
  return line.trim().split(/\s+/)[0];
}

async function runAndroidSurface(context) {
  const adb =
    process.env.ADB ??
    path.join(os.homedir(), "Library/Android/sdk/platform-tools/adb");
  if (!fs.existsSync(adb)) throw new Error(`adb not found: ${adb}`);
  const serial = resolveAndroidSerial();
  const apk = path.resolve(argValue("--android-apk") ?? defaultAndroidApk);
  if (!hasArg("--android-no-install")) {
    if (!fs.existsSync(apk)) throw new Error(`APK not found: ${apk}`);
    run([adb, "-s", serial, "install", "-r", apk], { stdio: "inherit" });
  }
  run([adb, "-s", serial, "shell", "pm", "clear", appId], { stdio: "inherit" });
  run([adb, "-s", serial, "shell", "am", "force-stop", appId]);
  run([
    adb,
    "-s",
    serial,
    "shell",
    "am",
    "start",
    "-W",
    "-n",
    `${appId}/.MainActivity`,
  ]);
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  const pid = run([adb, "-s", serial, "shell", "pidof", appId]).trim();
  if (!pid) throw new Error("Android app process did not start.");
  try {
    run([adb, "-s", serial, "forward", "--remove", "tcp:9224"], {
      stdio: "ignore",
    });
  } catch {
    // no existing forward
  }
  run([
    adb,
    "-s",
    serial,
    "forward",
    "tcp:9224",
    `localabstract:webview_devtools_remote_${pid}`,
  ]);
  const targets = await fetch("http://127.0.0.1:9224/json").then((res) =>
    res.json(),
  );
  const target =
    targets.find((entry) => entry.url?.startsWith("https://localhost")) ??
    targets[0];
  if (!target?.webSocketDebuggerUrl) {
    throw new Error("No debuggable Android WebView target found.");
  }
  return cdpEvaluate(
    target.webSocketDebuggerUrl,
    `(async () => {
      const activeServer = ${JSON.stringify({
        id: `cloud:${context.agentId}`,
        kind: "cloud",
        label: context.agentName ?? context.agentId,
        apiBase: context.runtimeUrl,
        accessToken: requireToken(),
      })};
      const cloudToken = ${JSON.stringify(requireToken())};
      localStorage.setItem("elizaos:active-server", JSON.stringify(activeServer));
      localStorage.setItem("eliza:onboarding-complete", "1");
      localStorage.setItem("eliza:mobile-runtime-mode", "cloud");
      window.__ELIZA_CLOUD_AUTH_TOKEN__ = cloudToken;
      window.__ELIZAOS_API_BASE__ = activeServer.apiBase;
      window.__ELIZA_API_BASE__ = activeServer.apiBase;
      window.__ELIZAOS_API_TOKEN__ = cloudToken;
      window.__ELIZA_API_TOKEN__ = cloudToken;
      location.reload();
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const deadline = Date.now() + 90000;
      let last = "";
      while (Date.now() < deadline) {
        await delay(1000);
        last = document.body?.innerText ?? "";
        if (/Cloud request failed|Backend unreachable|Load failed/i.test(last)) {
          throw new Error(last.slice(0, 800));
        }
        if (/Setup Provider To Chat|hey, good to see you|Eliza/i.test(last) && !/Choose your setup/i.test(last)) {
          return {
            location: location.href,
            body: last.slice(0, 500),
            activeServer: localStorage.getItem("elizaos:active-server"),
            mode: localStorage.getItem("eliza:mobile-runtime-mode")
          };
        }
      }
      throw new Error("Timed out waiting for Android app to connect: " + last.slice(0, 800));
    })()`,
    100_000,
  );
}

async function runIosSimulatorSurface(context) {
  const appPath = argValue("--ios-app");
  if (appPath) {
    run(["xcrun", "simctl", "install", "booted", appPath], {
      stdio: "inherit",
    });
  }
  run(["xcrun", "simctl", "launch", "booted", appId], { stdio: "inherit" });
  const url = `milady://connect?url=${encodeURIComponent(context.runtimeUrl)}&token=${encodeURIComponent(requireToken())}`;
  run(["xcrun", "simctl", "openurl", "booted", url], { stdio: "inherit" });
  const screenshot =
    argValue("--ios-screenshot") ?? "/tmp/milady-cloud-e2e-ios-simulator.png";
  await new Promise((resolve) => setTimeout(resolve, 8_000));
  run(["xcrun", "simctl", "io", "booted", "screenshot", screenshot], {
    stdio: "inherit",
  });
  return {
    launched: true,
    deepLink: "milady://connect?<redacted>",
    screenshot,
    note: "iOS WebView inspection is not available from this script; screenshot is captured for visual assertion.",
  };
}

async function runIosDeviceSurface(context) {
  const device = argValue("--ios-device") ?? process.env.IOS_DEVICE_ID;
  const appPath = argValue("--ios-app");
  if (!device) throw new Error("Missing --ios-device for ios-device surface.");
  if (appPath) {
    run(
      [
        "xcrun",
        "devicectl",
        "device",
        "install",
        "app",
        "--device",
        device,
        appPath,
      ],
      {
        stdio: "inherit",
      },
    );
  }
  run(
    [
      "xcrun",
      "devicectl",
      "device",
      "process",
      "launch",
      "--device",
      device,
      appId,
    ],
    { stdio: "inherit" },
  );
  const url = `milady://connect?url=${encodeURIComponent(context.runtimeUrl)}&token=${encodeURIComponent(requireToken())}`;
  run(["xcrun", "devicectl", "device", "openurl", "--device", device, url], {
    stdio: "inherit",
  });
  return {
    launched: true,
    deepLink: "milady://connect?<redacted>",
    note: "Physical-device UI assertion requires the device to be available to devicectl.",
  };
}

async function main() {
  await ensureToken();

  const report = {
    startedAt: new Date().toISOString(),
    cloudApiBase,
    auth: {
      source: token?.trim()
        ? interactiveLogin
          ? "interactive-login-or-env"
          : "env-or-flag"
        : "missing",
    },
    surfaces,
    results: {},
  };

  let context = null;
  let failed = null;
  for (const surface of surfaces) {
    log(`surface=${surface}`);
    try {
      if (surface === "programmatic") {
        context = await runProgrammaticSurface();
        report.results.programmatic = context;
      } else {
        if (!context) {
          context = await runProgrammaticSurface();
          report.results.programmatic = context;
        }
        if (surface === "web") {
          report.results.web = await runWebSurface(context);
        } else if (surface === "android") {
          report.results.android = await runAndroidSurface(context);
        } else if (surface === "ios-simulator") {
          report.results.iosSimulator = await runIosSimulatorSurface(context);
        } else if (surface === "ios-device") {
          report.results.iosDevice = await runIosDeviceSurface(context);
        } else {
          throw new Error(`Unknown surface: ${surface}`);
        }
      }
      log(`surface=${surface} ok`);
    } catch (error) {
      report.results[surface] = serializeFailure(error);
      failed = error;
      break;
    }
  }

  writeReport(report);
  if (failed) throw failed;
  console.log(redact(JSON.stringify(report, null, 2)));
}

main().catch((error) => {
  console.error(`[cloud-e2e] ${redact(error?.message ?? error)}`);
  if (error?.body) {
    console.error(redact(JSON.stringify(error.body, null, 2)));
  }
  process.exit(1);
});
