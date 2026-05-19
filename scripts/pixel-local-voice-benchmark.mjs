#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_AGENT_PORT = 31500;
const DEFAULT_DEVICE_PORT = 31337;
const DEFAULT_PACKAGE = "ai.milady.milady";
const DEFAULT_TEXT =
  "Reply with one short sentence confirming local voice benchmark readiness.";
const DEFAULT_TTS_TEXT = "Milady local voice benchmark is ready.";
const DEFAULT_LOG_BYTES = 64 * 1024;
const DEFAULT_LOGCAT_LINES = 400;

function usage() {
  return `Usage: node scripts/pixel-local-voice-benchmark.mjs [options]

Options:
  --text <text>          Chat prompt to stream.
  --text-file <path>     Read the chat prompt from a UTF-8 text file.
  --repeat-text <n>      Repeat the chat prompt n times. Default: 1.
  --max-tokens <n>       Requested generation token cap, passed in body + metadata.
  --full-chat            Deprecated alias for --route agent. This can hit stock Capacitor LlamaCpp.
  --route <direct|agent> Chat route. direct keeps the Android native fast path. Default: direct.
  --tts-text <text>      Text to synthesize with local TTS.
  --skip-tts             Skip the local TTS request.
  --agent-port <port>    Host port forwarded to device tcp:31337. Default: 31500.
  --package <id>         Android package id. Default: ai.milady.milady.
  --out <path>           Optional JSON report path.
  --wav-out <path>       Optional WAV output path. Use /tmp/name.wav for temp output.
  --log-out <path>       Optional JSON log-capture path.
  --log-bytes <n>        Agent log tail bytes to capture. Default: ${DEFAULT_LOG_BYTES}.
  --logcat-lines <n>     logcat tail lines to capture. Default: ${DEFAULT_LOGCAT_LINES}.
  --no-log-capture       Do not capture agent.log/logcat tails.
  --serial <serial>      Optional adb device serial.
  --help                 Show this help.
`;
}

function parseArgs(argv) {
  const args = {
    agentPort: DEFAULT_AGENT_PORT,
    packageName: DEFAULT_PACKAGE,
    text: DEFAULT_TEXT,
    textFile: null,
    repeatText: 1,
    maxTokens: null,
    route: "direct",
    ttsText: DEFAULT_TTS_TEXT,
    skipTts: false,
    out: null,
    logOut: null,
    logBytes: DEFAULT_LOG_BYTES,
    logcatLines: DEFAULT_LOGCAT_LINES,
    logCapture: true,
    serial: null,
    wavOut: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(usage());
      process.exit(0);
    }
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${arg}`);
      }
      index += 1;
      return value;
    };
    if (arg === "--text") args.text = next();
    else if (arg === "--text-file") args.textFile = next();
    else if (arg === "--repeat-text") {
      args.repeatText = parsePositiveInteger(next(), arg);
    } else if (arg === "--max-tokens") {
      args.maxTokens = parsePositiveInteger(next(), arg);
    } else if (arg === "--full-chat") args.route = "agent";
    else if (arg === "--route") {
      const route = next();
      if (route !== "direct" && route !== "agent") {
        throw new Error(`--route must be direct or agent, got ${route}`);
      }
      args.route = route;
    } else if (arg === "--tts-text") args.ttsText = next();
    else if (arg === "--skip-tts") args.skipTts = true;
    else if (arg === "--agent-port") args.agentPort = parsePort(next(), arg);
    else if (arg === "--package") args.packageName = next();
    else if (arg === "--out") args.out = next();
    else if (arg === "--wav-out") args.wavOut = next();
    else if (arg === "--log-out") args.logOut = next();
    else if (arg === "--log-bytes") {
      args.logBytes = parsePositiveInteger(next(), arg);
    } else if (arg === "--logcat-lines") {
      args.logcatLines = parsePositiveInteger(next(), arg);
    } else if (arg === "--no-log-capture") args.logCapture = false;
    else if (arg === "--serial") args.serial = next();
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (args.textFile) {
    args.text = fs.readFileSync(path.resolve(args.textFile), "utf8");
  }
  if (args.repeatText > 1) {
    args.text = Array.from({ length: args.repeatText }, () => args.text).join(
      "\n\n",
    );
  }

  return args;
}

function parsePositiveInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer, got ${value}`);
  }
  return parsed;
}

function parsePort(value, flag) {
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`${flag} must be a TCP port number, got ${value}`);
  }
  return port;
}

function nowMs() {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

function roundMs(value) {
  return Math.round(value * 10) / 10;
}

function findAdb() {
  const candidates = [
    process.env.ADB,
    "adb",
    path.join(os.homedir(), "Android", "Sdk", "platform-tools", "adb"),
    path.join(
      os.homedir(),
      "Library",
      "Android",
      "sdk",
      "platform-tools",
      "adb",
    ),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["version"], {
        encoding: "utf8",
        stdio: ["ignore", "ignore", "ignore"],
      });
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error("adb not found. Set ADB=/path/to/adb or put adb on PATH.");
}

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
      ...options,
    });
  } catch (error) {
    const stderr = error?.stderr ? String(error.stderr).trim() : "";
    const stdout = error?.stdout ? String(error.stdout).trim() : "";
    const detail = [stderr, stdout].filter(Boolean).join("\n");
    throw new Error(
      `${command} ${args.join(" ")} failed${detail ? `:\n${detail}` : ""}`,
    );
  }
}

function adbArgs(serial, args) {
  return serial ? ["-s", serial, ...args] : args;
}

function adb(adbPath, serial, args, options = {}) {
  return run(adbPath, adbArgs(serial, args), options);
}

function adbTry(adbPath, serial, args, options = {}) {
  try {
    return adb(adbPath, serial, args, options);
  } catch {
    return "";
  }
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function adbRunAs(adbPath, serial, packageName, script, options = {}) {
  return adb(
    adbPath,
    serial,
    ["shell", "run-as", packageName, "sh", "-c", shellQuote(script)],
    options,
  );
}

function readDeviceFileSize(adbPath, serial, packageName, relativePath) {
  const quoted = shellQuote(relativePath);
  const output = adbRunAs(
    adbPath,
    serial,
    packageName,
    `if [ -f ${quoted} ]; then wc -c < ${quoted}; else echo 0; fi`,
  ).trim();
  const size = Number(output.split(/\s+/)[0]);
  return Number.isFinite(size) && size >= 0 ? size : 0;
}

function readDeviceFileTail(adbPath, serial, packageName, relativePath, bytes) {
  const quoted = shellQuote(relativePath);
  return adbRunAs(
    adbPath,
    serial,
    packageName,
    `if [ -f ${quoted} ]; then tail -c ${bytes} ${quoted}; fi`,
    { maxBuffer: bytes + 16 * 1024 },
  );
}

function resolveDevice(adbPath, serialArg) {
  const output = run(adbPath, ["devices"]);
  const devices = output
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial, state] = line.split(/\s+/);
      return { serial, state };
    });

  if (serialArg) {
    const match = devices.find((device) => device.serial === serialArg);
    if (!match) throw new Error(`adb device not found: ${serialArg}`);
    if (match.state !== "device") {
      throw new Error(`adb device ${serialArg} is ${match.state}, not device`);
    }
    return serialArg;
  }

  const ready = devices.filter((device) => device.state === "device");
  if (ready.length === 0) {
    throw new Error("No authorized adb device found.");
  }
  if (ready.length > 1) {
    throw new Error(
      `Multiple adb devices found: ${ready
        .map((device) => device.serial)
        .join(", ")}. Pass --serial.`,
    );
  }
  return ready[0].serial;
}

function readLocalAgentToken(adbPath, serial, packageName) {
  const token = adb(adbPath, serial, [
    "shell",
    "run-as",
    packageName,
    "cat",
    "files/auth/local-agent-token",
  ]).trim();
  if (!token) {
    throw new Error(
      `Token file is empty or unavailable for ${packageName}: files/auth/local-agent-token`,
    );
  }
  return token;
}

function authHeaders(token, extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    "X-ElizaOS-Client-Id": "pixel-local-voice-benchmark",
    ...extra,
  };
}

async function readResponseBody(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function jsonRequest(baseUrl, token, pathname, options = {}) {
  const start = nowMs();
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method ?? "GET",
    headers: authHeaders(token, {
      Accept: "application/json",
      ...(options.body == null ? {} : { "Content-Type": "application/json" }),
      ...(options.headers ?? {}),
    }),
    body: options.body == null ? undefined : JSON.stringify(options.body),
  });
  const headersMs = roundMs(nowMs() - start);
  const body = await readResponseBody(response);
  const totalMs = roundMs(nowMs() - start);
  return {
    ok: response.ok,
    status: response.status,
    headersMs,
    totalMs,
    body,
  };
}

function assertOk(label, result) {
  if (!result.ok) {
    throw new Error(
      `${label} failed with HTTP ${result.status}: ${summarize(result.body)}`,
    );
  }
}

function summarize(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 500 ? `${text.slice(0, 500)}...` : text;
}

function extractConversationId(body) {
  const id = body?.conversation?.id ?? body?.id ?? body?.conversationId;
  if (typeof id !== "string" || !id) {
    throw new Error(
      `Could not find conversation id in response: ${summarize(body)}`,
    );
  }
  return id;
}

function parseSseBlock(block) {
  const data = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("data:")) {
      data.push(line.slice(5).replace(/^ /, ""));
    }
  }
  if (data.length === 0) return null;
  const payload = data.join("\n");
  if (payload === "[DONE]") return { type: "done" };
  try {
    return JSON.parse(payload);
  } catch {
    return { type: "raw", data: payload };
  }
}

function updateStreamText(currentText, event) {
  if (typeof event.fullText === "string") return event.fullText;
  if (typeof event.text === "string") return currentText + event.text;
  return currentText;
}

function collectLocalMetadata(event) {
  const metadata = {};
  for (const key of [
    "usage",
    "localInference",
    "local",
    "model",
    "provider",
    "metadata",
    "timings",
    "stats",
    "performance",
    "speculative",
    "dflash",
  ]) {
    if (event && Object.hasOwn(event, key)) {
      metadata[key] = event[key];
    }
  }
  return Object.keys(metadata).length > 0 ? metadata : null;
}

function buildChatRequestBody(text, options) {
  const metadata = {
    source: "pixel-local-voice-benchmark",
    benchmarkHarness: {
      maxTokens: options.maxTokens,
      route: options.route,
      textChars: text.length,
    },
  };
  if (options.route === "agent") {
    metadata.contextRouting = {
      source: "pixel-local-voice-benchmark",
      bypassAndroidDirectFastPath: true,
    };
  }
  return {
    text,
    channelType: "DM",
    conversationMode: "simple",
    source: "pixel-local-voice-benchmark",
    ...(options.maxTokens
      ? {
          maxTokens: options.maxTokens,
          max_tokens: options.maxTokens,
          maxOutputTokens: options.maxTokens,
        }
      : {}),
    metadata,
  };
}

function buildChatTimingSummary(result) {
  const firstTokenToDoneMs =
    result.firstTokenMs != null && result.doneMs != null
      ? roundMs(result.doneMs - result.firstTokenMs)
      : null;
  const streamedTextChars = result.text.length;
  const completionTokens =
    typeof result.usage?.completionTokens === "number"
      ? result.usage.completionTokens
      : null;
  const tokensPerSecond =
    completionTokens != null && firstTokenToDoneMs && firstTokenToDoneMs > 0
      ? Math.round((completionTokens / (firstTokenToDoneMs / 1000)) * 100) / 100
      : null;
  const charsPerSecond =
    streamedTextChars > 0 && firstTokenToDoneMs && firstTokenToDoneMs > 0
      ? Math.round((streamedTextChars / (firstTokenToDoneMs / 1000)) * 100) /
        100
      : null;
  return {
    statusMs: result.statusMs,
    firstTokenMs: result.firstTokenMs,
    lastTokenMs: result.lastTokenMs,
    doneMs: result.doneMs,
    totalMs: result.totalMs,
    firstTokenToDoneMs,
    tokenEventCount: result.tokenEventCount,
    streamedTextChars,
    completionTokens,
    tokensPerSecond,
    charsPerSecond,
  };
}

async function streamConversationMessage(
  baseUrl,
  token,
  conversationId,
  text,
  options,
) {
  const start = nowMs();
  const requestBody = buildChatRequestBody(text, options);
  const response = await fetch(
    `${baseUrl}/api/conversations/${encodeURIComponent(conversationId)}/messages/stream`,
    {
      method: "POST",
      headers: authHeaders(token, {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
      }),
      body: JSON.stringify(requestBody),
    },
  );
  const statusMs = roundMs(nowMs() - start);
  const result = {
    status: response.status,
    ok: response.ok,
    statusMs,
    firstTokenMs: null,
    lastTokenMs: null,
    doneMs: null,
    totalMs: null,
    tokenEventCount: 0,
    text: "",
    usage: null,
    localMetadata: [],
    doneEvent: null,
    errorEvents: [],
    request: {
      textChars: text.length,
      maxTokens: options.maxTokens,
      route: options.route,
      bodyKeys: Object.keys(requestBody),
      metadataKeys: Object.keys(requestBody.metadata),
    },
  };

  if (!response.ok) {
    result.body = await response.text().catch(() => "");
    result.totalMs = roundMs(nowMs() - start);
    return result;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  const reader = response.body?.getReader();
  if (!reader)
    throw new Error("Streaming response did not expose a body reader");

  const processBlock = (block) => {
    const event = parseSseBlock(block);
    if (!event) return;
    if (event.type === "token") {
      result.tokenEventCount += 1;
      const tokenMs = roundMs(nowMs() - start);
      if (result.firstTokenMs === null) result.firstTokenMs = tokenMs;
      result.lastTokenMs = tokenMs;
      result.text = updateStreamText(result.text, event);
    } else if (event.type === "done") {
      result.doneMs = roundMs(nowMs() - start);
      result.doneEvent = event;
      if (typeof event.fullText === "string") result.text = event.fullText;
      if (event.usage) result.usage = event.usage;
    } else if (event.type === "error") {
      result.errorEvents.push(event);
    }
    const metadata = collectLocalMetadata(event);
    if (metadata) result.localMetadata.push(metadata);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: !done });
      let boundary = buffer.search(/\r?\n\r?\n/);
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        const match = buffer.slice(boundary).match(/^\r?\n\r?\n/);
        buffer = buffer.slice(boundary + (match?.[0].length ?? 2));
        processBlock(block);
        boundary = buffer.search(/\r?\n\r?\n/);
      }
    }
    if (done) break;
  }
  buffer += decoder.decode();
  if (buffer.trim()) processBlock(buffer);
  result.totalMs = roundMs(nowMs() - start);
  result.timing = buildChatTimingSummary(result);
  return result;
}

function wavDurationSeconds(buffer) {
  if (buffer.length < 44) return null;
  if (buffer.toString("ascii", 0, 4) !== "RIFF") return null;
  if (buffer.toString("ascii", 8, 12) !== "WAVE") return null;

  let offset = 12;
  let audioFormat = null;
  let channels = null;
  let sampleRate = null;
  let bitsPerSample = null;
  let dataBytes = null;

  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    if (id === "fmt " && size >= 16 && dataOffset + 16 <= buffer.length) {
      audioFormat = buffer.readUInt16LE(dataOffset);
      channels = buffer.readUInt16LE(dataOffset + 2);
      sampleRate = buffer.readUInt32LE(dataOffset + 4);
      bitsPerSample = buffer.readUInt16LE(dataOffset + 14);
    } else if (id === "data") {
      dataBytes = Math.min(size, buffer.length - dataOffset);
      break;
    }
    offset = dataOffset + size + (size % 2);
  }

  if (
    audioFormat !== 1 ||
    !channels ||
    !sampleRate ||
    !bitsPerSample ||
    dataBytes == null
  ) {
    return null;
  }

  const bytesPerSecond = sampleRate * channels * (bitsPerSample / 8);
  if (!bytesPerSecond) return null;
  return Math.round((dataBytes / bytesPerSecond) * 1000) / 1000;
}

async function benchmarkTts(baseUrl, token, text, wavOut) {
  const start = nowMs();
  const response = await fetch(`${baseUrl}/api/tts/local-inference`, {
    method: "POST",
    headers: authHeaders(token, {
      Accept: "audio/wav, audio/*;q=0.9",
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({ text }),
  });
  const headersMs = roundMs(nowMs() - start);
  const arrayBuffer = await response.arrayBuffer();
  const totalMs = roundMs(nowMs() - start);
  const bytes = Buffer.from(arrayBuffer);

  if (response.ok && wavOut) {
    fs.mkdirSync(path.dirname(path.resolve(wavOut)), { recursive: true });
    fs.writeFileSync(wavOut, bytes);
  }

  return {
    status: response.status,
    ok: response.ok,
    headersMs,
    totalMs,
    contentType: response.headers.get("content-type"),
    byteSize: bytes.byteLength,
    wavDurationSeconds: wavDurationSeconds(bytes),
    wavOut: wavOut ? path.resolve(wavOut) : null,
    errorText: response.ok
      ? null
      : bytes.toString("utf8", 0, Math.min(bytes.length, 500)),
  };
}

function matchingLines(text, pattern, limit = 80) {
  if (!text) return [];
  const lines = text.split(/\r?\n/).filter((line) => pattern.test(line));
  return lines.slice(Math.max(0, lines.length - limit));
}

function redactSensitiveLogText(text) {
  if (!text) return text;
  return text
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/g, "Bearer ***REDACTED***")
    .replace(
      /("Authorization"\s*:\s*")Bearer\s+[^"]+(")/gi,
      "$1Bearer ***REDACTED***$2",
    )
    .replace(
      /('Authorization'\s*:\s*')Bearer\s+[^']+(')/gi,
      "$1Bearer ***REDACTED***$2",
    )
    .replace(
      /\b(local-agent-token=)[A-Za-z0-9._~+/-]+=*/gi,
      "$1***REDACTED***",
    );
}

function collectDflashEvidence({ logs, probes, chat }) {
  const sourceText = [
    logs?.agentLog?.tail ?? "",
    logs?.logcat?.tail ?? "",
    JSON.stringify(probes?.active?.body ?? null),
    JSON.stringify(probes?.installed?.body ?? null),
    JSON.stringify(chat?.localMetadata ?? null),
    JSON.stringify(chat?.doneEvent ?? null),
    JSON.stringify(chat?.usage ?? null),
  ].join("\n");
  const signalPattern =
    /\b(DFlash|dflash|ELIZA_DFLASH|speculative|speculation|draft(?:er|ing)?|acceptance)\b/i;
  const readyPattern =
    /\b(ELIZA_DFLASH=1|DFlash\b.*\b(present|ready|enabled|enabling|configured|loaded|kernel)|kernels?[^"\n]*dflash|speculative\b.*\b(ready|enabled|configured|loaded))\b/i;
  const skipPattern =
    /\b(DFlash\b.*\b(skip|skipped|disabled|unavailable|missing|not available|no-?op|fallback|failed|could not)|speculative\b.*\b(skip|skipped|disabled|unavailable|missing|fallback|failed|could not))\b/i;
  const usedPattern =
    /\b(generate:dflash:(?:start|chunk|done)|DFlash stream done|dflash\b.*\b(totalDrafted|totalAccepted|accepted=|drafted=)|speculative\b.*\b(accepted=|drafted=|acceptance))\b/i;
  const readyLines = matchingLines(sourceText, readyPattern);
  const skippedLines = matchingLines(sourceText, skipPattern);
  const usedLines = matchingLines(sourceText, usedPattern);
  const allSignalLines = matchingLines(sourceText, signalPattern, 120);
  const ready = readyLines.length > 0;
  const skipped = skippedLines.length > 0;
  const used = usedLines.length > 0;
  let state = "no_signal";
  if (used) state = "used";
  else if (ready && skipped) state = "ready_with_skip_signal";
  else if (ready) state = "ready_not_observed_used";
  else if (skipped) state = "skipped";
  return {
    state,
    ready,
    skipped,
    used,
    signalCounts: {
      ready: readyLines.length,
      skipped: skippedLines.length,
      used: usedLines.length,
      all: allSignalLines.length,
    },
    signals: {
      ready: readyLines,
      skipped: skippedLines,
      used: usedLines,
      all: allSignalLines,
    },
  };
}

function captureLogs(
  adbPath,
  serial,
  packageName,
  options,
  beforeAgentLogBytes,
) {
  const logs = {
    enabled: options.logCapture,
    agentLog: null,
    logcat: null,
  };
  if (!options.logCapture) return logs;

  try {
    const relativePath = "files/agent/agent.log";
    const afterBytes = readDeviceFileSize(
      adbPath,
      serial,
      packageName,
      relativePath,
    );
    const tail = readDeviceFileTail(
      adbPath,
      serial,
      packageName,
      relativePath,
      options.logBytes,
    );
    const redactedTail = redactSensitiveLogText(tail);
    logs.agentLog = {
      path: relativePath,
      beforeBytes: beforeAgentLogBytes,
      afterBytes,
      grewBytes:
        typeof beforeAgentLogBytes === "number"
          ? Math.max(0, afterBytes - beforeAgentLogBytes)
          : null,
      capturedBytes: Buffer.byteLength(redactedTail),
      truncated: afterBytes > options.logBytes,
      tail: redactedTail,
    };
  } catch (error) {
    logs.agentLog = {
      error: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    const tail = adb(
      adbPath,
      serial,
      ["logcat", "-d", "-v", "time", "-t", String(options.logcatLines)],
      { maxBuffer: options.logBytes * 2 + 64 * 1024 },
    );
    const redactedTail = redactSensitiveLogText(tail);
    logs.logcat = {
      lines: options.logcatLines,
      capturedBytes: Buffer.byteLength(redactedTail),
      matchingAgentLines: matchingLines(
        redactedTail,
        /\b(ElizaAgent|ElizaAgentService|DFlash|dflash|speculative|ELIZA_DFLASH)\b/i,
        120,
      ),
      tail: redactedTail,
    };
  } catch (error) {
    logs.logcat = {
      error: error instanceof Error ? error.message : String(error),
    };
  }

  return logs;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const adbPath = findAdb();
  const serial = resolveDevice(adbPath, args.serial);
  const device = {
    serial,
    packageName: args.packageName,
    agentPort: args.agentPort,
    devicePort: DEFAULT_DEVICE_PORT,
  };

  adb(adbPath, serial, ["get-state"]);
  adbTry(adbPath, serial, ["forward", "--remove", `tcp:${args.agentPort}`], {
    stdio: ["ignore", "ignore", "ignore"],
  });
  adb(adbPath, serial, [
    "forward",
    `tcp:${args.agentPort}`,
    `tcp:${DEFAULT_DEVICE_PORT}`,
  ]);

  const token = readLocalAgentToken(adbPath, serial, args.packageName);
  const baseUrl = `http://127.0.0.1:${args.agentPort}`;
  const beforeAgentLogBytes = args.logCapture
    ? readDeviceFileSize(
        adbPath,
        serial,
        args.packageName,
        "files/agent/agent.log",
      )
    : null;

  const health = await jsonRequest(baseUrl, token, "/api/health");
  assertOk("/api/health", health);
  const active = await jsonRequest(
    baseUrl,
    token,
    "/api/local-inference/active",
  );
  assertOk("/api/local-inference/active", active);
  const installed = await jsonRequest(
    baseUrl,
    token,
    "/api/local-inference/installed",
  );
  assertOk("/api/local-inference/installed", installed);

  const conversation = await jsonRequest(baseUrl, token, "/api/conversations", {
    method: "POST",
    body: {
      title: "Pixel local voice benchmark",
    },
  });
  assertOk("/api/conversations", conversation);
  const conversationId = extractConversationId(conversation.body);

  const chat = await streamConversationMessage(
    baseUrl,
    token,
    conversationId,
    args.text,
    {
      maxTokens: args.maxTokens,
      route: args.route,
    },
  );
  if (!chat.ok) {
    throw new Error(
      `/api/conversations/${conversationId}/messages/stream failed with HTTP ${chat.status}: ${summarize(chat.body ?? "")}`,
    );
  }

  const tts = args.skipTts
    ? {
        skipped: true,
        reason: "--skip-tts",
      }
    : await benchmarkTts(baseUrl, token, args.ttsText, args.wavOut);
  if (!args.skipTts && !tts.ok) {
    throw new Error(
      `/api/tts/local-inference failed with HTTP ${tts.status}: ${summarize(tts.errorText ?? "")}`,
    );
  }

  const logCapture = captureLogs(
    adbPath,
    serial,
    args.packageName,
    args,
    beforeAgentLogBytes,
  );
  if (args.logOut) {
    fs.mkdirSync(path.dirname(path.resolve(args.logOut)), { recursive: true });
    fs.writeFileSync(args.logOut, `${JSON.stringify(logCapture, null, 2)}\n`);
  }
  const dflash = collectDflashEvidence({
    logs: logCapture,
    probes: { active, installed },
    chat,
  });

  const report = {
    benchmark: "pixel-local-voice",
    startedAt: new Date().toISOString(),
    device,
    baseUrl,
    inputs: {
      text: args.text,
      textFile: args.textFile,
      repeatText: args.repeatText,
      textChars: args.text.length,
      maxTokens: args.maxTokens,
      route: args.route,
      ttsText: args.ttsText,
      skipTts: args.skipTts,
    },
    probes: {
      health,
      active,
      installed,
    },
    conversation: {
      id: conversationId,
      create: conversation,
    },
    chat,
    tts,
    dflash,
    logCapture: {
      ...logCapture,
      logOut: args.logOut ? path.resolve(args.logOut) : null,
    },
  };

  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (args.out) {
    fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
    fs.writeFileSync(args.out, json);
  }
  process.stdout.write(json);
}

main().catch((error) => {
  console.error(
    `[pixel-local-voice-benchmark] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
