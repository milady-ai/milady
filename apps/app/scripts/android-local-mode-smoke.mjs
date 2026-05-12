#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const appId = "ai.milady.milady";
const defaultApk = path.resolve(
  "apps/app/android/app/build/outputs/apk/debug/app-debug.apk",
);

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasArg(name) {
  return process.argv.includes(name);
}

const adb =
  process.env.ADB ??
  path.join(os.homedir(), "Library/Android/sdk/platform-tools/adb");
const apk = path.resolve(argValue("--apk") ?? defaultApk);
const serialArg = argValue("--serial");
const timeoutMs = Number(argValue("--timeout-ms") ?? 600_000);
const shouldInstall = !hasArg("--no-install");

function run(args, options = {}) {
  return execFileSync(args[0], args.slice(1), {
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function adbRun(serial, args, options) {
  return run([adb, "-s", serial, ...args], options);
}

function adbTry(serial, args, options = {}) {
  try {
    return adbRun(serial, args, options);
  } catch {
    return "";
  }
}

function resolveSerial() {
  if (serialArg) return serialArg;
  const output = run([adb, "devices"]);
  const line = output
    .split("\n")
    .find((entry) => /^emulator-\d+\s+device$/.test(entry.trim()));
  if (!line) {
    throw new Error("No running Android emulator found. Pass --serial.");
  }
  return line.trim().split(/\s+/)[0];
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function cdpEvaluate(webSocketDebuggerUrl, expression, evalTimeoutMs) {
  const ws = new WebSocket(webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const waiter = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) {
      waiter.reject(new Error(JSON.stringify(message.error)));
    } else {
      waiter.resolve(message.result);
    }
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
          () =>
            reject(
              new Error(`CDP evaluation timed out after ${evalTimeoutMs}ms`),
            ),
          evalTimeoutMs,
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

async function main() {
  if (!fs.existsSync(adb)) throw new Error(`adb not found: ${adb}`);
  if (shouldInstall && !fs.existsSync(apk)) {
    throw new Error(`APK not found: ${apk}. Run bun run build:android first.`);
  }

  const serial = resolveSerial();
  console.log(`[android-local-smoke] serial=${serial}`);

  if (shouldInstall) {
    console.log(`[android-local-smoke] installing ${apk}`);
    adbRun(serial, ["install", "-r", apk], { stdio: "inherit" });
  }

  adbRun(serial, ["shell", "pm", "clear", appId], { stdio: "inherit" });
  adbRun(serial, ["logcat", "-c"]);
  adbRun(serial, ["shell", "am", "force-stop", appId]);
  adbRun(serial, [
    "shell",
    "am",
    "start",
    "-W",
    "-n",
    `${appId}/.MainActivity`,
  ]);
  await delay(8_000);

  const pid = adbRun(serial, ["shell", "pidof", appId]).trim();
  if (!pid) throw new Error("App process did not start");
  adbTry(serial, ["forward", "--remove", "tcp:9223"], { stdio: "ignore" });
  run([
    adb,
    "-s",
    serial,
    "forward",
    "tcp:9223",
    `localabstract:webview_devtools_remote_${pid}`,
  ]);
  adbTry(serial, ["forward", "--remove", "tcp:31337"], { stdio: "ignore" });
  run([adb, "-s", serial, "forward", "tcp:31337", "tcp:31337"]);

  const targets = await fetch("http://127.0.0.1:9223/json").then((res) =>
    res.json(),
  );
  const target =
    targets.find((entry) => entry.url?.startsWith("https://localhost")) ??
    targets[0];
  if (!target?.webSocketDebuggerUrl) {
    throw new Error("No debuggable WebView target found");
  }

  const result = await cdpEvaluate(
    target.webSocketDebuggerUrl,
    `(async () => {
      const deadline = Date.now() + ${JSON.stringify(timeoutMs)};
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const buttons = () => Array.from(document.querySelectorAll("button"));
      const fail = (reason, last) => {
        throw new Error(JSON.stringify({ reason, last }));
      };
      const agent = () => window.Capacitor?.Plugins?.Agent;
      const parseResponse = (response) => {
        let body = null;
        try {
          body = response?.body ? JSON.parse(response.body) : null;
        } catch {
          body = response?.body ?? null;
        }
        return { ...response, body };
      };
      const request = async (path, options = {}) => {
        const response = await agent()?.request?.({
          path,
          method: options.method ?? "GET",
          headers: {
            "X-ElizaOS-Client-Id": "android-local-smoke",
            "Content-Type": "application/json",
            ...(options.headers ?? {}),
          },
          body:
            options.body == null
              ? null
              : typeof options.body === "string"
                ? options.body
                : JSON.stringify(options.body),
          timeoutMs: options.timeoutMs ?? 10000,
        });
        return parseResponse(response);
      };
      const waitForApi = async () => {
        let last = null;
        while (Date.now() < deadline) {
          const status = await request("/api/status").catch((error) => ({
            error: String(error),
          }));
          const health = await request("/api/health").catch((error) => ({
            error: String(error),
          }));
          const bodyText = document.body.innerText;
          last = { status, health, body: bodyText.slice(0, 500) };
          if (/BACKEND UNREACHABLE/i.test(bodyText)) {
            fail("backend-unreachable", last);
          }
          if (
            status?.status === 200 &&
            health?.status === 200 &&
            health?.body?.ready === true
          ) {
            return last;
          }
          await delay(1000);
        }
        fail("api-timeout", last);
      };
      const ensureInstalled = async (modelId) => {
        const installed = await request("/api/local-inference/installed");
        if (
          installed.status === 200 &&
          installed.body?.models?.some((model) => model.id === modelId)
        ) {
          return;
        }
        const started = await request("/api/local-inference/downloads", {
          method: "POST",
          body: { modelId },
          timeoutMs: 15000,
        });
        if (started.status < 200 || started.status >= 300) {
          fail("model-download-start-failed", { modelId, started });
        }
        let last = started;
        while (Date.now() < deadline) {
          await delay(2000);
          const hub = await request("/api/local-inference/hub", {
            timeoutMs: 15000,
          });
          const isInstalled =
            hub.status === 200 &&
            hub.body?.installed?.some((model) => model.id === modelId);
          if (isInstalled) return;
          const download = hub.body?.downloads?.find(
            (job) => job.modelId === modelId,
          );
          last = { hub, download };
          if (download?.state === "failed" || download?.state === "cancelled") {
            fail("model-download-failed", { modelId, last });
          }
        }
        fail("model-download-timeout", { modelId, last });
      };

      document.querySelector('[data-runtime-choice="local"]')?.click();
      await delay(350);
      buttons().find((button) => /start local agent/i.test(button.innerText))?.click();
      await waitForApi();
      await ensureInstalled("bge-small-en-v1.5");
      await ensureInstalled("smollm2-360m");
      const active = await request("/api/local-inference/active", {
        method: "POST",
        body: { modelId: "smollm2-360m" },
        timeoutMs: 60000,
      });
      if (active.status < 200 || active.status >= 300) {
        fail("model-activation-failed", { active });
      }

      let last = null;
      while (Date.now() < deadline) {
        await delay(1_000);
        const tokenResult = await agent()?.getLocalAgentToken?.().catch((error) => ({ error: String(error) }));
        const token = tokenResult?.token;
        const status = await request("/api/status").catch((error) => ({ error: String(error) }));
        const authMe = token
          ? await fetch("http://127.0.0.1:31337/api/auth/me", {
              credentials: "include",
              headers: {
                Authorization: \`Bearer \${token}\`,
                "X-ElizaOS-Client-Id": "android-local-smoke",
              },
            }).then(async (res) => ({ status: res.status, text: await res.text() }))
              .catch((error) => ({ error: String(error) }))
          : null;
        const conversations = await request("/api/conversations").catch((error) => ({ error: String(error) }));
        const composer = document.querySelector('[data-testid="chat-composer-textarea"]');
        const body = document.body.innerText;
        last = {
          location: location.href,
          mode: localStorage.getItem("eliza:mobile-runtime-mode"),
          activeServer: localStorage.getItem("elizaos:active-server"),
          body: body.slice(0, 500),
          status,
          authMe,
          conversations,
          composerDisabled: composer?.disabled ?? null,
          composerPlaceholder: composer?.getAttribute("placeholder") ?? null,
        };
        if (/BACKEND UNREACHABLE/i.test(body)) {
          fail("backend-unreachable", last);
        }
        if (
          status?.status === 200 &&
          status?.body?.model === "smollm2-360m" &&
          authMe?.status === 200 &&
          conversations?.status === 200 &&
          composer &&
          composer.disabled === false &&
          !/INITIALIZING AGENT|LOADING/i.test(body)
        ) {
          const existingConversation = conversations.body?.conversations?.[0];
          const conversationId =
            existingConversation?.id ??
            (
              await request("/api/conversations", {
                method: "POST",
                body: { title: "Android local smoke" },
              })
            ).body?.conversation?.id;
          if (!conversationId) fail("conversation-unavailable", last);
          const chat = await request(
            \`/api/conversations/\${encodeURIComponent(conversationId)}/messages\`,
            {
              method: "POST",
              body: {
                text: "Reply briefly with the exact words: local ok",
                channelType: "DM",
                conversationMode: "simple",
              },
              timeoutMs: 120000,
            },
          );
          if (chat.status < 200 || chat.status >= 300) {
            fail("chat-send-failed", { ...last, chat });
          }
          const messages = await request(
            \`/api/conversations/\${encodeURIComponent(conversationId)}/messages\`,
          );
          const transcript = JSON.stringify(messages.body ?? {});
          if (!/local ok/i.test(transcript)) {
            fail("chat-response-missing", { ...last, chat, messages });
          }
          return { ...last, active, chat, messages };
        }
      }
      fail("timeout", last);
    })()`,
    timeoutMs + 10_000,
  );

  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(`[android-local-smoke] ${error?.message ?? error}`);
    process.exit(1);
  });
