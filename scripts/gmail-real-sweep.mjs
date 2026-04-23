#!/usr/bin/env node
import crypto from "node:crypto";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const DEFAULT_LIFEOPS_API_BASES = [
  "http://127.0.0.1:31337",
  "http://localhost:31337",
  "http://127.0.0.1:2138",
  "http://localhost:2138",
];
const METADATA_HEADERS = [
  "Subject",
  "From",
  "To",
  "Cc",
  "Bcc",
  "Date",
  "Message-Id",
  "X-Milady-Test-Run",
];

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

function splitList(value) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function redactEmail(value, emailMap) {
  const key = value.toLowerCase();
  const existing = emailMap.get(key);
  if (existing) return existing;
  const next = `person${emailMap.size + 1}@example.test`;
  emailMap.set(key, next);
  return next;
}

function scrubText(value, emailMap) {
  return String(value ?? "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (email) =>
      redactEmail(email, emailMap),
    )
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

function describeError(error) {
  return error instanceof Error ? error.message : String(error);
}

function validateRunId(runId) {
  if (!runId) {
    throw new Error("--run-id or MILADY_GMAIL_REAL_SWEEP_RUN_ID is required.");
  }
  if (!/^milady-gmail-smoke-[a-zA-Z0-9._:-]{8,160}$/.test(runId)) {
    throw new Error(
      "run id must start with milady-gmail-smoke- and contain only letters, numbers, dot, underscore, colon, or hyphen.",
    );
  }
  return runId;
}

function requireRunAllowlist(runId) {
  const allowlist = splitList(
    process.env.MILADY_GMAIL_REAL_SWEEP_RUN_ALLOWLIST,
  );
  if (!allowlist.includes(runId)) {
    throw new Error(
      "MILADY_GMAIL_REAL_SWEEP_RUN_ALLOWLIST must include the exact run id before sweeping real Gmail.",
    );
  }
}

function recipientAllowlist() {
  return new Set(
    [
      ...splitList(process.env.MILADY_GMAIL_REAL_SWEEP_RECIPIENT_ALLOWLIST),
      ...splitList(readFlag("--recipient-allowlist")),
    ].map((entry) => entry.toLowerCase()),
  );
}

function extractEmails(value) {
  const matches = String(value ?? "").match(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  );
  return [...new Set((matches ?? []).map((email) => email.toLowerCase()))];
}

function gmailTestLabelName(runId) {
  return `Milady/GmailSmoke/${runId}`;
}

function headerValue(headers, name) {
  const found = headers.find(
    (header) => header.name?.toLowerCase() === name.toLowerCase(),
  );
  return typeof found?.value === "string" ? found.value : "";
}

function hasRunMarker(headers, runId) {
  return (
    headerValue(headers, "X-Milady-Test-Run").trim() === runId ||
    headerValue(headers, "Subject").includes(runId)
  );
}

function assertExecuteAllowed(options, matches) {
  if (options.dryRun) return;
  if (process.env.MILADY_GMAIL_REAL_SWEEP !== "1") {
    throw new Error(
      "Set MILADY_GMAIL_REAL_SWEEP=1 to execute real Gmail sweep.",
    );
  }
  if (options.operation === "delete") {
    if (process.env.MILADY_GMAIL_REAL_SWEEP_DELETE !== "1") {
      throw new Error(
        "Set MILADY_GMAIL_REAL_SWEEP_DELETE=1 to permanently delete real Gmail messages.",
      );
    }
  }
  const allowedRecipients = recipientAllowlist();
  if (allowedRecipients.size === 0) {
    throw new Error(
      "MILADY_GMAIL_REAL_SWEEP_RECIPIENT_ALLOWLIST is required before executing a real Gmail sweep.",
    );
  }
  for (const match of matches) {
    if (match.recipients.length === 0) {
      throw new Error(
        "Refusing to execute because at least one matched message has no To/Cc/Bcc recipient metadata.",
      );
    }
    const blocked = match.recipients.filter(
      (email) => !allowedRecipients.has(email.toLowerCase()),
    );
    if (blocked.length > 0) {
      throw new Error(
        `Refusing to execute because matched recipients are not allowlisted: ${blocked.join(", ")}`,
      );
    }
  }
}

async function gmailJson(pathname, token, init = {}) {
  const response = await fetch(`${GMAIL_BASE}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
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

async function gmailVoid(pathname, token, init = {}) {
  const response = await fetch(`${GMAIL_BASE}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(
      `Gmail request failed ${response.status}: ${await response.text()}`,
    );
  }
}

async function lifeopsJson(baseUrl, pathname, init = {}) {
  const response = await fetch(new URL(pathname, baseUrl), {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
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

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/g, "");
}

function readLifeOpsApiBases() {
  const explicit = readFlag("--api-base");
  const env = [
    process.env.MILADY_LIFEOPS_API_BASE,
    process.env.LIFEOPS_API_BASE,
    process.env.ELIZA_API_BASE,
  ];
  return [explicit, ...env]
    .flatMap((value) => (value ?? "").split(","))
    .map((value) => value.trim())
    .filter(Boolean)
    .concat(DEFAULT_LIFEOPS_API_BASES)
    .map(normalizeBaseUrl)
    .filter((value, index, all) => all.indexOf(value) === index);
}

function lifeopsConnectorParams(options) {
  const params = new URLSearchParams();
  if (options.side) params.set("side", options.side);
  if (options.mode) params.set("mode", options.mode);
  if (options.grantId) params.set("grantId", options.grantId);
  return params;
}

function lifeopsSearchParams(options) {
  const params = lifeopsConnectorParams(options);
  params.set("query", options.query);
  params.set("forceSync", "true");
  params.set("includeSpamTrash", "true");
  params.set("maxResults", String(options.maxResults));
  return params;
}

async function resolveLifeOpsApiBase(options) {
  const statusPath = `/api/lifeops/connectors/google/status?${lifeopsConnectorParams(options).toString()}`;
  let lastError = null;
  for (const baseUrl of readLifeOpsApiBases()) {
    try {
      const status = await lifeopsJson(baseUrl, statusPath);
      return { baseUrl, statusPath, status };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `Unable to reach a local LifeOps API. Start Milady/LifeOps or pass --api-base. Last error: ${describeError(lastError)}`,
  );
}

async function findGmailLabel(token, name) {
  const listed = await gmailJson("/labels", token);
  const labels = Array.isArray(listed.labels) ? listed.labels : [];
  return labels.find((label) => label?.name === name) ?? null;
}

async function listGmailRefs(token, options, labelId) {
  const refsById = new Map();
  const searches = [];
  if (labelId) {
    const labelParams = new URLSearchParams({
      maxResults: String(options.maxResults),
      includeSpamTrash: "true",
    });
    labelParams.append("labelIds", labelId);
    searches.push(`/messages?${labelParams.toString()}`);
  }
  const queryParams = new URLSearchParams({
    q: options.query,
    maxResults: String(options.maxResults),
    includeSpamTrash: "true",
  });
  searches.push(`/messages?${queryParams.toString()}`);

  for (const searchPath of searches) {
    const listed = await gmailJson(searchPath, token);
    for (const ref of Array.isArray(listed.messages) ? listed.messages : []) {
      if (ref?.id) refsById.set(ref.id, ref);
    }
  }
  return [...refsById.values()];
}

async function getGmailMetadata(token, messageId) {
  const metadataParams = new URLSearchParams({ format: "metadata" });
  for (const header of METADATA_HEADERS) {
    metadataParams.append("metadataHeaders", header);
  }
  return await gmailJson(
    `/messages/${encodeURIComponent(messageId)}?${metadataParams.toString()}`,
    token,
  );
}

function directMatchFromMessage(message, options, labelId) {
  const headers = Array.isArray(message.payload?.headers)
    ? message.payload.headers
    : [];
  if (!hasRunMarker(headers, options.runId)) return null;
  const recipientHeaders = ["To", "Cc", "Bcc"]
    .map((name) => headerValue(headers, name))
    .filter(Boolean)
    .join(", ");
  const recipients = extractEmails(recipientHeaders);
  return {
    source: "gmail",
    id: message.id,
    threadId: message.threadId,
    recipients,
    runMatchedBy: {
      subject: headerValue(headers, "Subject").includes(options.runId),
      header:
        headerValue(headers, "X-Milady-Test-Run").trim() === options.runId,
      label: Boolean(labelId && message.labelIds?.includes(labelId)),
    },
    labels: Array.isArray(message.labelIds) ? message.labelIds : [],
    headers,
  };
}

async function discoverDirectGmail(options) {
  const token = process.env.GOOGLE_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new Error("GOOGLE_ACCESS_TOKEN is required for --source gmail.");
  }
  const label = await findGmailLabel(token, options.labelName);
  const refs = await listGmailRefs(token, options, label?.id ?? null);
  const matches = [];
  for (const ref of refs) {
    const message = await getGmailMetadata(token, ref.id);
    const match = directMatchFromMessage(message, options, label?.id ?? null);
    if (match) matches.push(match);
  }
  return { token, label, matches };
}

function lifeopsMatchFromMessage(message, options) {
  const subject = String(message.subject ?? "");
  if (!subject.includes(options.runId)) return null;
  const recipients = [
    ...(Array.isArray(message.to) ? message.to : []),
    ...(Array.isArray(message.cc) ? message.cc : []),
  ].flatMap(extractEmails);
  return {
    source: "lifeops",
    id: message.id,
    externalId: message.externalId,
    threadId: message.threadId,
    recipients: [...new Set(recipients)],
    runMatchedBy: {
      subject: true,
      header: false,
      label: Array.isArray(message.labels)
        ? message.labels.includes(options.labelName)
        : false,
    },
    labels: Array.isArray(message.labels) ? message.labels : [],
    subject,
    from: message.from,
    accountEmail: message.accountEmail,
  };
}

async function discoverLifeOps(options) {
  const { baseUrl, status, statusPath } = await resolveLifeOpsApiBase(options);
  const searchPath = `/api/lifeops/gmail/search?${lifeopsSearchParams(options).toString()}`;
  const search = await lifeopsJson(baseUrl, searchPath);
  const matches = [];
  for (const message of Array.isArray(search.messages) ? search.messages : []) {
    const match = lifeopsMatchFromMessage(message, options);
    if (match) matches.push(match);
  }
  return { baseUrl, status, statusPath, searchPath, matches };
}

async function executeDirectGmail(discovery, options) {
  if (options.dryRun || discovery.matches.length === 0) return null;
  for (const match of discovery.matches) {
    if (options.operation === "trash") {
      await gmailJson(
        `/messages/${encodeURIComponent(match.id)}/trash`,
        discovery.token,
        { method: "POST" },
      );
    } else if (options.operation === "delete") {
      await gmailVoid(
        `/messages/${encodeURIComponent(match.id)}`,
        discovery.token,
        {
          method: "DELETE",
        },
      );
    }
  }
  if (
    options.deleteRunLabel &&
    discovery.label?.id &&
    process.env.MILADY_GMAIL_REAL_SWEEP_DELETE_LABEL === "1"
  ) {
    await gmailVoid(
      `/labels/${encodeURIComponent(discovery.label.id)}`,
      discovery.token,
      { method: "DELETE" },
    );
  }
  return {
    operation: options.operation,
    affectedCount: discovery.matches.length,
    deletedRunLabel: Boolean(
      options.deleteRunLabel &&
        discovery.label?.id &&
        process.env.MILADY_GMAIL_REAL_SWEEP_DELETE_LABEL === "1",
    ),
  };
}

async function executeLifeOps(discovery, options) {
  if (options.dryRun || discovery.matches.length === 0) return null;
  return await lifeopsJson(discovery.baseUrl, "/api/lifeops/gmail/manage", {
    method: "POST",
    body: JSON.stringify({
      side: options.side,
      mode: options.mode,
      grantId: options.grantId,
      operation: options.operation,
      messageIds: discovery.matches.map((match) => match.id),
      confirmDestructive: true,
    }),
  });
}

function summarizeDirect(discovery, options) {
  const emailMap = new Map();
  return {
    source: "gmail",
    runId: options.runId,
    label: discovery.label
      ? {
          id: scrubId(discovery.label.id, "gmail-label"),
          name: discovery.label.name,
        }
      : null,
    query: options.query,
    dryRun: options.dryRun,
    operation: options.operation,
    matches: discovery.matches.map((match) => ({
      id: scrubId(match.id, "gmail-msg"),
      threadId: scrubId(match.threadId, "gmail-thread"),
      recipients: match.recipients.map((email) => redactEmail(email, emailMap)),
      runMatchedBy: match.runMatchedBy,
      labels: match.labels,
      headers: match.headers.map((header) => ({
        name: header.name,
        value:
          header.name === "Subject"
            ? `subject-${scrubId(header.value, "content").slice("content-".length)}`
            : scrubText(header.value, emailMap),
      })),
    })),
  };
}

function summarizeLifeOps(discovery, options) {
  const emailMap = new Map();
  return {
    source: "lifeops",
    baseUrl: discovery.baseUrl,
    status: {
      request: { method: "GET", path: discovery.statusPath },
      connected: Boolean(discovery.status?.connected),
    },
    search: {
      request: { method: "GET", path: discovery.searchPath },
    },
    runId: options.runId,
    labelName: options.labelName,
    query: options.query,
    dryRun: options.dryRun,
    operation: options.operation,
    matches: discovery.matches.map((match) => ({
      id: scrubId(match.id, "lifeops-gmail-msg"),
      externalId: scrubId(match.externalId, "gmail-msg"),
      threadId: scrubId(match.threadId, "gmail-thread"),
      recipients: match.recipients.map((email) => redactEmail(email, emailMap)),
      runMatchedBy: match.runMatchedBy,
      labels: match.labels,
      subject: `subject-${scrubId(match.subject, "content").slice("content-".length)}`,
      from: scrubText(match.from, emailMap),
      accountEmail: match.accountEmail
        ? redactEmail(match.accountEmail, emailMap)
        : null,
    })),
  };
}

function buildOptions() {
  const runId = validateRunId(
    readFlag("--run-id", process.env.MILADY_GMAIL_REAL_SWEEP_RUN_ID),
  );
  const operation = readFlag("--operation", "trash");
  if (!["trash", "delete"].includes(operation)) {
    throw new Error("--operation must be trash or delete.");
  }
  return {
    source: readFlag(
      "--source",
      process.env.MILADY_GMAIL_REAL_SWEEP_SOURCE ?? "auto",
    ),
    runId,
    labelName: readFlag("--label", gmailTestLabelName(runId)),
    query: readFlag("--query", `"${runId}"`),
    maxResults: Math.min(readNumberFlag("--max", 25), 100),
    operation,
    dryRun: !hasFlag("--execute") || hasFlag("--dry-run"),
    deleteRunLabel: hasFlag("--delete-run-label"),
    side: readFlag(
      "--side",
      process.env.MILADY_GMAIL_REAL_SWEEP_SIDE ?? "owner",
    ),
    mode: readFlag("--mode", process.env.MILADY_GMAIL_REAL_SWEEP_MODE),
    grantId: readFlag(
      "--grant-id",
      process.env.MILADY_GMAIL_REAL_SWEEP_GRANT_ID,
    ),
  };
}

async function runLifeOpsSweep(options) {
  const discovery = await discoverLifeOps(options);
  assertExecuteAllowed(options, discovery.matches);
  const executed = await executeLifeOps(discovery, options);
  return {
    ...summarizeLifeOps(discovery, options),
    executed,
  };
}

async function runDirectGmailSweep(options) {
  const discovery = await discoverDirectGmail(options);
  assertExecuteAllowed(options, discovery.matches);
  const executed = await executeDirectGmail(discovery, options);
  return {
    ...summarizeDirect(discovery, options),
    executed,
  };
}

function printUsage() {
  console.log(`Usage:
  bun run lifeops:gmail:real-sweep -- --run-id <id> [--source auto|lifeops|gmail] [--dry-run]

Defaults:
  Dry-run is the default. Pass --execute plus the env gates to write.
  --source auto tries the logged-in local LifeOps Google connector first.
  --query defaults to the exact run id.
  --operation defaults to trash. Permanent delete also needs MILADY_GMAIL_REAL_SWEEP_DELETE=1.

Required for every sweep:
  MILADY_GMAIL_REAL_SWEEP_RUN_ALLOWLIST=<same exact run id>

Execute gates:
  MILADY_GMAIL_REAL_SWEEP=1
  MILADY_GMAIL_REAL_SWEEP_RECIPIENT_ALLOWLIST=test@example.com

Direct Gmail fallback:
  GOOGLE_ACCESS_TOKEN=... bun run lifeops:gmail:real-sweep -- --source gmail --run-id <id>

Examples:
  MILADY_GMAIL_REAL_SWEEP_RUN_ALLOWLIST=milady-gmail-smoke-20260422T120000-manual \\
  bun run lifeops:gmail:real-sweep -- --run-id milady-gmail-smoke-20260422T120000-manual

  MILADY_GMAIL_REAL_SWEEP=1 \\
  MILADY_GMAIL_REAL_SWEEP_RUN_ALLOWLIST=milady-gmail-smoke-20260422T120000-manual \\
  MILADY_GMAIL_REAL_SWEEP_RECIPIENT_ALLOWLIST=test@example.com \\
  bun run lifeops:gmail:real-sweep -- --run-id milady-gmail-smoke-20260422T120000-manual --execute`);
}

async function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    printUsage();
    return;
  }
  const options = buildOptions();
  requireRunAllowlist(options.runId);

  if (options.source === "lifeops") {
    console.log(JSON.stringify(await runLifeOpsSweep(options), null, 2));
    return;
  }
  if (options.source === "gmail") {
    console.log(JSON.stringify(await runDirectGmailSweep(options), null, 2));
    return;
  }
  if (options.source !== "auto") {
    throw new Error("--source must be auto, lifeops, or gmail.");
  }

  try {
    const lifeops = await runLifeOpsSweep(options);
    if (
      lifeops.matches.length > 0 ||
      !process.env.GOOGLE_ACCESS_TOKEN?.trim()
    ) {
      console.log(JSON.stringify(lifeops, null, 2));
      return;
    }
    const gmail = await runDirectGmailSweep(options);
    gmail.lifeopsFallback = {
      attempted: true,
      reason: "LifeOps sweep found no matching messages.",
    };
    console.log(JSON.stringify(gmail, null, 2));
  } catch (lifeopsError) {
    if (!process.env.GOOGLE_ACCESS_TOKEN?.trim()) {
      throw lifeopsError;
    }
    const output = await runDirectGmailSweep(options);
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
