#!/usr/bin/env node
import crypto from "node:crypto";
import {
  lifeopsConnectorParams,
  readLifeOpsApiBases,
} from "./lib/lifeops-api-base.mjs";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const METADATA_HEADERS = [
  "Subject",
  "From",
  "To",
  "Cc",
  "Date",
  "Message-Id",
  "In-Reply-To",
  "References",
  "List-Id",
  "Precedence",
  "Auto-Submitted",
  "X-Milady-Test-Run",
];
const REDACTED_CONTENT_KEYS = new Set([
  "bodyHtml",
  "bodyText",
  "from",
  "name",
  "snippet",
  "subject",
]);

function readFlag(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function readNumberFlag(name, fallback) {
  const raw = readFlag(name);
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

function readOptionalBooleanFlag(name, fallback) {
  const raw = readFlag(name);
  if (raw === null) return fallback;
  if (/^(1|true|yes)$/i.test(raw)) return true;
  if (/^(0|false|no)$/i.test(raw)) return false;
  throw new Error(`${name} must be true or false when provided.`);
}

function encodeRawEmail(lines) {
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

function scrubText(value, emailMap) {
  return String(value ?? "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (email) => {
      const key = email.toLowerCase();
      const existing = emailMap.get(key);
      if (existing) return existing;
      const next = `person${emailMap.size + 1}@example.test`;
      emailMap.set(key, next);
      return next;
    })
    .replace(/https?:\/\/\S+/gi, "https://example.test/redacted")
    .replace(/\b\+?\d[\d\s().-]{7,}\d\b/g, "+1-555-0100")
    .replace(/\s+/g, " ")
    .trim();
}

function scrubId(value, prefix) {
  const digest = crypto
    .createHash("sha256")
    .update(String(value ?? "missing"))
    .digest("hex");
  return `${prefix}-${digest.slice(0, 16)}`;
}

function scrubContent(value, key, emailMap) {
  const text = scrubText(value, emailMap);
  if (process.env.MILADY_GMAIL_REAL_SMOKE_VERBOSE === "1") return text;
  const digest = scrubId(text, "content").slice(
    "content-".length,
    "content-".length + 12,
  );
  return `${key || "text"}-${digest}`;
}

function scrubHeaderValue(name, value, emailMap) {
  if (name.toLowerCase() === "subject") {
    return scrubContent(value, "subject", emailMap);
  }
  return scrubText(value, emailMap);
}

function isIdentifierKey(key) {
  if (key === "labelIds") return false;
  return (
    key === "id" ||
    key === "listId" ||
    key === "messageIdHeader" ||
    key === "referencesHeader" ||
    /Ids?$/.test(key)
  );
}

function scrubJson(value, emailMap = new Map(), key = "") {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => scrubJson(item, emailMap, key));
  }
  if (typeof value === "object") {
    const scrubbed = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      scrubbed[entryKey] = scrubJson(entryValue, emailMap, entryKey);
    }
    return scrubbed;
  }
  if (typeof value === "string") {
    if (key === "baseUrl" || key === "grantedScopes") {
      return value;
    }
    if (REDACTED_CONTENT_KEYS.has(key)) {
      return scrubContent(value, key, emailMap);
    }
    if (isIdentifierKey(key)) {
      return scrubId(value, key.replace(/[^a-z0-9]+/gi, "-").toLowerCase());
    }
    return scrubText(value, emailMap);
  }
  return value;
}

function describeError(error) {
  return error instanceof Error ? error.message : String(error);
}

async function gmailJson(pathname, token, init = {}) {
  const response = await fetch(`${GMAIL_BASE}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(
      `Gmail request failed ${response.status}: ${JSON.stringify(body)}`,
    );
  }
  return body;
}

async function lifeopsJson(baseUrl, pathname, init = {}) {
  const response = await fetch(new URL(pathname, baseUrl), {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(
      `LifeOps request failed ${response.status}: ${JSON.stringify(body)}`,
    );
  }
  return body;
}

async function listMetadata(token, query, maxResults, includeSpamTrash) {
  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
    includeSpamTrash: includeSpamTrash ? "true" : "false",
  });
  const listed = await gmailJson(`/messages?${params.toString()}`, token);
  const refs = Array.isArray(listed.messages) ? listed.messages : [];
  const metadataParams = new URLSearchParams({ format: "metadata" });
  for (const header of METADATA_HEADERS) {
    metadataParams.append("metadataHeaders", header);
  }
  const messages = [];
  for (const ref of refs) {
    if (!ref?.id) continue;
    messages.push(
      await gmailJson(
        `/messages/${encodeURIComponent(ref.id)}?${metadataParams.toString()}`,
        token,
      ),
    );
  }
  return {
    request: {
      method: "GET",
      path: "/gmail/v1/users/me/messages",
      query,
      maxResults,
      includeSpamTrash: params.get("includeSpamTrash") === "true",
    },
    resultSizeEstimate:
      typeof listed.resultSizeEstimate === "number"
        ? listed.resultSizeEstimate
        : messages.length,
    messages,
  };
}

function lifeopsGmailParams(options) {
  const params = lifeopsConnectorParams(options);
  params.set("forceSync", String(options.forceSync));
  params.set("maxResults", String(options.maxResults));
  if (options.query !== undefined) params.set("query", options.query);
  if (options.replyNeededOnly !== undefined) {
    params.set("replyNeededOnly", String(options.replyNeededOnly));
  }
  if (options.includeSpamTrash !== undefined) {
    params.set("includeSpamTrash", String(options.includeSpamTrash));
  }
  return params;
}

async function resolveLifeOpsApiBase(options) {
  const statusPath = `/api/lifeops/connectors/google/status?${lifeopsConnectorParams(options).toString()}`;
  let lastError = null;
  for (const baseUrl of readLifeOpsApiBases(readFlag("--api-base"))) {
    try {
      const status = await lifeopsJson(baseUrl, statusPath);
      return { baseUrl, status, statusPath };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `Unable to reach a local LifeOps API with a Google connector status route. Start Milady/LifeOps or pass --api-base. Last error: ${describeError(lastError)}`,
  );
}

function buildSmokeOptions() {
  const query = readFlag("--query", "in:inbox newer_than:7d");
  const includeSpamTrash =
    hasFlag("--include-spam-trash") ||
    /\bin:(?:spam|trash|anywhere)\b/i.test(query);
  return {
    source: readFlag(
      "--source",
      process.env.MILADY_GMAIL_REAL_SMOKE_SOURCE ?? "auto",
    ),
    query,
    maxResults: Math.min(readNumberFlag("--max", 5), 10),
    includeSpamTrash,
    replyNeededOnly: hasFlag("--reply-needed-only") ? true : undefined,
    forceSync:
      !hasFlag("--cache") && readOptionalBooleanFlag("--force-sync", true),
    side: readFlag(
      "--side",
      process.env.MILADY_GMAIL_REAL_SMOKE_SIDE ?? "owner",
    ),
    mode: readFlag("--mode", process.env.MILADY_GMAIL_REAL_SMOKE_MODE),
    grantId: readFlag(
      "--grant-id",
      process.env.MILADY_GMAIL_REAL_SMOKE_GRANT_ID,
    ),
  };
}

async function runLifeOpsSmoke(options) {
  const { baseUrl, status, statusPath } = await resolveLifeOpsApiBase(options);
  const searchPath = `/api/lifeops/gmail/search?${lifeopsGmailParams(options).toString()}`;
  const recommendationsPath = `/api/lifeops/gmail/recommendations?${lifeopsGmailParams(options).toString()}`;
  const [search, recommendations] = await Promise.all([
    lifeopsJson(baseUrl, searchPath),
    lifeopsJson(baseUrl, recommendationsPath),
  ]);
  return scrubJson({
    source: "lifeops",
    baseUrl,
    status: {
      request: {
        method: "GET",
        path: statusPath,
      },
      response: status,
    },
    search: {
      request: {
        method: "GET",
        path: searchPath,
      },
      response: search,
    },
    recommendations: {
      request: {
        method: "GET",
        path: recommendationsPath,
      },
      response: recommendations,
    },
    send: hasFlag("--send-test")
      ? await sendLifeOpsSmokeEmail(baseUrl, options)
      : null,
  });
}

function summarizeMetadata(result) {
  const emailMap = new Map();
  return {
    request: result.request,
    resultSizeEstimate: result.resultSizeEstimate,
    messages: result.messages.map((message) => ({
      id: scrubId(message.id, "gmail-msg"),
      threadId: scrubId(message.threadId, "gmail-thread"),
      labelIds: Array.isArray(message.labelIds) ? message.labelIds : [],
      snippet: scrubContent(message.snippet, "snippet", emailMap),
      headers: (message.payload?.headers ?? []).map((header) => ({
        name: header.name,
        value: scrubHeaderValue(header.name, header.value, emailMap),
      })),
    })),
  };
}

function requireAllowedRecipient(to) {
  const allowlist = (process.env.MILADY_GMAIL_REAL_SMOKE_ALLOWLIST ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (!allowlist.includes(to.toLowerCase())) {
    throw new Error(
      "MILADY_GMAIL_REAL_SMOKE_ALLOWLIST must include the exact test recipient before a real Gmail send.",
    );
  }
}

function readAllowlist(name) {
  return (process.env[name] ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function requireRunId() {
  const runId = process.env.MILADY_GMAIL_REAL_SMOKE_RUN_ID?.trim();
  if (!runId) {
    throw new Error(
      "MILADY_GMAIL_REAL_SMOKE_RUN_ID is required for real send metadata.",
    );
  }
  if (!/^milady-gmail-smoke-[a-zA-Z0-9._:-]{8,160}$/.test(runId)) {
    throw new Error(
      "MILADY_GMAIL_REAL_SMOKE_RUN_ID must start with milady-gmail-smoke- and contain only letters, numbers, dot, underscore, colon, or hyphen.",
    );
  }
  const allowlist = readAllowlist("MILADY_GMAIL_REAL_SMOKE_RUN_ALLOWLIST");
  if (!allowlist.includes(runId)) {
    throw new Error(
      "MILADY_GMAIL_REAL_SMOKE_RUN_ALLOWLIST must include the exact run id before a real Gmail send.",
    );
  }
  return runId;
}

function gmailTestLabelName(runId) {
  return `Milady/GmailSmoke/${runId}`;
}

async function findGmailLabel(token, name) {
  const listed = await gmailJson("/labels", token);
  const labels = Array.isArray(listed.labels) ? listed.labels : [];
  return labels.find((label) => label?.name === name) ?? null;
}

async function ensureGmailLabel(token, name) {
  const existing = await findGmailLabel(token, name);
  if (existing?.id) return existing;
  return await gmailJson("/labels", token, {
    method: "POST",
    body: JSON.stringify({
      name,
      labelListVisibility: "labelHide",
      messageListVisibility: "hide",
    }),
  });
}

async function applyGmailLabel(token, messageId, labelId) {
  await gmailJson(`/messages/${encodeURIComponent(messageId)}/modify`, token, {
    method: "POST",
    body: JSON.stringify({ addLabelIds: [labelId] }),
  });
}

async function sendSmokeEmail(token) {
  if (process.env.MILADY_GMAIL_REAL_SMOKE_SEND !== "1") {
    throw new Error("Set MILADY_GMAIL_REAL_SMOKE_SEND=1 to run a real send.");
  }
  if (process.env.MILADY_ALLOW_REAL_GMAIL_WRITES !== "1") {
    throw new Error("Set MILADY_ALLOW_REAL_GMAIL_WRITES=1 for a real send.");
  }
  const to = process.env.MILADY_GMAIL_REAL_SMOKE_TO?.trim();
  if (!to) {
    throw new Error("MILADY_GMAIL_REAL_SMOKE_TO is required for real send.");
  }
  requireAllowedRecipient(to);
  const runId = requireRunId();
  const labelName = gmailTestLabelName(runId);
  const label = await ensureGmailLabel(token, labelName);
  const subject = `Milady Gmail smoke ${runId}`;
  const raw = encodeRawEmail([
    `To: ${to}`,
    `Subject: ${subject}`,
    `X-Milady-Test-Run: ${runId}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    `This is an explicitly enabled Milady Gmail integration smoke email.\nRun ID: ${runId}`,
  ]);
  const sent = await gmailJson("/messages/send", token, {
    method: "POST",
    body: JSON.stringify({ raw }),
  });
  if (sent.id && label?.id) {
    await applyGmailLabel(token, sent.id, label.id);
  }
  return {
    request: {
      method: "POST",
      path: "/gmail/v1/users/me/messages/send",
      to,
      subject,
      runId,
      labelName,
      xMiladyTestRun: runId,
    },
    response: {
      id: scrubId(sent.id, "gmail-sent"),
      threadId: scrubId(sent.threadId, "gmail-thread"),
      labelIds: Array.isArray(sent.labelIds) ? sent.labelIds : [],
      appliedRunLabel: Boolean(label?.id),
    },
  };
}

async function sendLifeOpsSmokeEmail(baseUrl, options) {
  if (process.env.MILADY_GMAIL_REAL_SMOKE_SEND !== "1") {
    throw new Error("Set MILADY_GMAIL_REAL_SMOKE_SEND=1 to run a real send.");
  }
  if (process.env.MILADY_ALLOW_REAL_GMAIL_WRITES !== "1") {
    throw new Error("Set MILADY_ALLOW_REAL_GMAIL_WRITES=1 for a real send.");
  }
  const to = process.env.MILADY_GMAIL_REAL_SMOKE_TO?.trim();
  if (!to) {
    throw new Error("MILADY_GMAIL_REAL_SMOKE_TO is required for real send.");
  }
  requireAllowedRecipient(to);
  const runId = requireRunId();
  const labelName = gmailTestLabelName(runId);
  const subject = `Milady Gmail smoke ${runId}`;
  const bodyText = [
    "This is an explicitly enabled Milady Gmail integration smoke email.",
    `Run ID: ${runId}`,
    `Sweep label: ${labelName}`,
  ].join("\n");
  const payload = {
    side: options.side,
    mode: options.mode,
    grantId: options.grantId,
    to: [to],
    subject,
    bodyText,
    confirmSend: true,
  };
  const response = await lifeopsJson(
    baseUrl,
    "/api/lifeops/gmail/message-send",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  return {
    request: {
      method: "POST",
      path: "/api/lifeops/gmail/message-send",
      to,
      subject,
      runId,
      labelName,
      xMiladyTestRun: null,
      confirmSend: true,
    },
    response,
  };
}

async function runDirectGmailSmoke(options) {
  const token = process.env.GOOGLE_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new Error("GOOGLE_ACCESS_TOKEN is required for --source gmail.");
  }
  return {
    source: "gmail",
    read: summarizeMetadata(
      await listMetadata(
        token,
        options.query,
        options.maxResults,
        options.includeSpamTrash,
      ),
    ),
    send: hasFlag("--send-test") ? await sendSmokeEmail(token) : null,
  };
}

function printUsage() {
  console.log(`Usage:
  bun run lifeops:gmail:real-smoke -- [--source auto|lifeops|gmail] [--query <gmail-query>] [--max <n>]

Defaults:
  --source auto tries the logged-in local LifeOps Google connector first.
  --query defaults to "in:inbox newer_than:7d".
  --force-sync defaults to true; pass --cache to use cached LifeOps data.
  Content fields are redacted unless MILADY_GMAIL_REAL_SMOKE_VERBOSE=1.

LifeOps options:
  --api-base <url>      Local API base. Defaults probe :31337 then :2138.
  --side <owner|user>   Connector side. Defaults to owner.
  --mode <local|cloud>  Optional connector mode.
  --grant-id <id>       Optional Google connector grant id.

Direct Gmail fallback:
  GOOGLE_ACCESS_TOKEN=... bun run lifeops:gmail:real-smoke -- --source gmail

Real send gates:
  MILADY_GMAIL_REAL_SMOKE_SEND=1 MILADY_ALLOW_REAL_GMAIL_WRITES=1 \\
  MILADY_GMAIL_REAL_SMOKE_TO=test@example.com \\
  MILADY_GMAIL_REAL_SMOKE_ALLOWLIST=test@example.com \\
  MILADY_GMAIL_REAL_SMOKE_RUN_ID=milady-gmail-smoke-20260422T120000-manual \\
  MILADY_GMAIL_REAL_SMOKE_RUN_ALLOWLIST=milady-gmail-smoke-20260422T120000-manual \\
  bun run lifeops:gmail:real-smoke -- --send-test`);
}

async function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    printUsage();
    return;
  }
  const options = buildSmokeOptions();
  if (options.source === "lifeops") {
    console.log(JSON.stringify(await runLifeOpsSmoke(options), null, 2));
    return;
  }
  if (options.source === "gmail") {
    console.log(JSON.stringify(await runDirectGmailSmoke(options), null, 2));
    return;
  }
  if (options.source !== "auto") {
    throw new Error("--source must be auto, lifeops, or gmail.");
  }
  try {
    console.log(JSON.stringify(await runLifeOpsSmoke(options), null, 2));
  } catch (lifeopsError) {
    if (!process.env.GOOGLE_ACCESS_TOKEN?.trim()) {
      throw lifeopsError;
    }
    const output = await runDirectGmailSmoke(options);
    output.lifeopsFallback = {
      attempted: true,
      error: scrubText(describeError(lifeopsError), new Map()),
    };
    console.log(JSON.stringify(output, null, 2));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
