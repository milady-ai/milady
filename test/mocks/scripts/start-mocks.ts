import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENVS_DIR = path.resolve(__dirname, "..", "environments");

export const MOCK_ENVIRONMENTS = [
  "google",
  "twilio",
  "whatsapp",
  "x-twitter",
  "calendly",
  "cloud-managed",
] as const;

export type MockEnvironmentName = (typeof MOCK_ENVIRONMENTS)[number];

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type RequestBody = Record<string, JsonValue>;

interface MockoonHeader {
  key: string;
  value: string;
}

interface MockoonResponse {
  statusCode?: number;
  headers?: MockoonHeader[];
  body?: string;
}

interface MockoonRoute {
  method: string;
  endpoint: string;
  responses?: MockoonResponse[];
}

interface MockoonEnvironmentFile {
  name?: string;
  routes?: MockoonRoute[];
}

interface CompiledRoute {
  method: string;
  endpoint: string;
  response: MockoonResponse;
  matcher: RegExp;
  paramNames: string[];
}

interface StartedFixtureServer {
  port: number;
  baseUrl: string;
  requests: MockRequestLedgerEntry[];
  clearRequests(): void;
  stop(): Promise<void>;
}

export interface MockRequestLedgerEntry {
  environment: string;
  method: string;
  path: string;
  query: string;
  body: RequestBody;
  createdAt: string;
  runId?: string;
  gmail?: GmailRequestLedgerMetadata;
}

interface GmailDecodedSendMetadata {
  rawLength: number;
  from: string | null;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  references: string | null;
  runIdHeader: string | null;
  bodyText: string;
}

interface GmailRequestLedgerMetadata {
  action: string;
  messageId?: string;
  threadId?: string;
  draftId?: string;
  ids?: string[];
  batchIds?: string[];
  addLabelIds?: string[];
  removeLabelIds?: string[];
  decodedSend?: GmailDecodedSendMetadata;
  runId?: string;
  historyId?: string;
}

interface DynamicFixtureResponse {
  statusCode: number;
  body: JsonValue;
  headers?: Record<string, string>;
}

class MockHttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export interface StartedMocks {
  portMap: Record<MockEnvironmentName, number>;
  baseUrls: Record<MockEnvironmentName, string>;
  /** Convenience env vars to set on process.env */
  envVars: Record<string, string>;
  requestLedger(): MockRequestLedgerEntry[];
  clearRequestLedger(): void;
  stop(): Promise<void>;
}

function envVarsFor(
  envs: readonly MockEnvironmentName[],
  baseUrls: Record<MockEnvironmentName, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (envs.includes("google")) {
    out.MILADY_MOCK_GOOGLE_BASE = baseUrls.google;
    out.MILADY_BLOCK_REAL_GMAIL_WRITES = "1";
  }
  if (envs.includes("twilio")) out.MILADY_MOCK_TWILIO_BASE = baseUrls.twilio;
  if (envs.includes("whatsapp"))
    out.MILADY_MOCK_WHATSAPP_BASE = baseUrls.whatsapp;
  if (envs.includes("x-twitter"))
    out.MILADY_MOCK_X_BASE = baseUrls["x-twitter"];
  if (envs.includes("calendly"))
    out.MILADY_MOCK_CALENDLY_BASE = baseUrls.calendly;
  if (envs.includes("cloud-managed"))
    out.ELIZA_CLOUD_BASE_URL = baseUrls["cloud-managed"];
  return out;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileEndpoint(endpoint: string): {
  matcher: RegExp;
  paramNames: string[];
} {
  const paramNames: string[] = [];
  const segments = endpoint
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      if (segment.startsWith(":")) {
        paramNames.push(segment.slice(1));
        return "([^/]+)";
      }
      return escapeRegex(segment);
    });

  return {
    matcher: new RegExp(`^/${segments.join("/")}/?$`),
    paramNames,
  };
}

function compileRoutes(environment: MockoonEnvironmentFile): CompiledRoute[] {
  return (environment.routes ?? []).map((route) => {
    const { matcher, paramNames } = compileEndpoint(route.endpoint);
    const response = route.responses?.find((candidate) => candidate) ?? {};

    return {
      method: route.method.toUpperCase(),
      endpoint: route.endpoint,
      response,
      matcher,
      paramNames,
    };
  });
}

function readEnvironment(dataPath: string): MockoonEnvironmentFile {
  const parsed = JSON.parse(fs.readFileSync(dataPath, "utf8")) as JsonValue;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid mock environment JSON: ${dataPath}`);
  }

  const environment = parsed as Partial<MockoonEnvironmentFile>;
  if (!Array.isArray(environment.routes)) {
    throw new Error(`Mock environment has no routes array: ${dataPath}`);
  }

  return {
    name: typeof environment.name === "string" ? environment.name : dataPath,
    routes: environment.routes.filter(
      (route): route is MockoonRoute =>
        !!route &&
        typeof route === "object" &&
        !Array.isArray(route) &&
        typeof route.method === "string" &&
        typeof route.endpoint === "string",
    ),
  };
}

async function readRequestBody(
  req: http.IncomingMessage,
): Promise<RequestBody> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.trim().length === 0) return {};

  const contentType = String(req.headers["content-type"] ?? "").toLowerCase();
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(raw).entries());
  }

  if (contentType.includes("application/json")) {
    let parsed: JsonValue;
    try {
      parsed = JSON.parse(raw) as JsonValue;
    } catch {
      throw new MockHttpError(400, "Invalid JSON body");
    }
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  }

  return Object.fromEntries(new URLSearchParams(raw).entries());
}

function valueAsTemplateString(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function escapeTemplateString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

function randomFromAlphabet(alphabet: string, length: number): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (const byte of bytes) {
    out += alphabet[byte % alphabet.length];
  }
  return out;
}

function fakerValue(kind: string, lengthText?: string): string {
  if (kind === "string.uuid") return crypto.randomUUID();

  const length = Number.parseInt(lengthText ?? "", 10);
  const size = Number.isFinite(length) && length > 0 ? length : 16;
  if (kind === "string.numeric") return randomFromAlphabet("0123456789", size);
  if (kind === "string.alphanumeric") {
    return randomFromAlphabet(
      "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
      size,
    );
  }

  return crypto.randomUUID();
}

function offsetDate(offsetText?: string): Date {
  const date = new Date();
  const match = offsetText?.match(/^([+-])(\d+)([hm])$/);
  if (!match) return date;

  const sign = match[1] === "-" ? -1 : 1;
  const amount = Number.parseInt(match[2], 10);
  const unitMs = match[3] === "h" ? 60 * 60 * 1000 : 60 * 1000;
  return new Date(date.getTime() + sign * amount * unitMs);
}

function formatHttpDate(date: Date): string {
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${weekdays[date.getUTCDay()]}, ${pad(date.getUTCDate())} ${
    months[date.getUTCMonth()]
  } ${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(
    date.getUTCMinutes(),
  )}:${pad(date.getUTCSeconds())} GMT`;
}

function nowValue(format: string, offsetText?: string): string {
  const date = offsetDate(offsetText);
  if (format === "x") return String(date.getTime());
  if (format === "iso") return date.toISOString();
  if (format === "ddd, DD MMM YYYY HH:mm:ss [GMT]") {
    return formatHttpDate(date);
  }
  return date.toISOString();
}

function renderBodyTemplate(
  body: string,
  params: Record<string, string>,
  requestBody: RequestBody,
): string {
  return body
    .replace(/\{\{urlParam '([^']+)'\}\}/g, (_, key: string) =>
      escapeTemplateString(params[key] ?? ""),
    )
    .replace(/\{\{body '([^']+)'\}\}/g, (_, key: string) =>
      escapeTemplateString(valueAsTemplateString(requestBody[key])),
    )
    .replace(
      /\{\{faker '([^']+)'(?: length=(\d+))?\}\}/g,
      (_, kind: string, length: string | undefined) => fakerValue(kind, length),
    )
    .replace(
      /\{\{now '([^']+)'(?: offset='([^']+)')?\}\}/g,
      (_, format: string, offset: string | undefined) =>
        nowValue(format, offset),
    );
}

function findRoute(
  routes: readonly CompiledRoute[],
  method: string,
  pathname: string,
): { route: CompiledRoute; params: Record<string, string> } | null {
  for (const route of routes) {
    if (route.method !== method) continue;

    const match = route.matcher.exec(pathname);
    if (!match) continue;

    const params: Record<string, string> = {};
    route.paramNames.forEach((name, index) => {
      params[name] = decodeURIComponent(match[index + 1] ?? "");
    });

    return { route, params };
  }

  return null;
}

function jsonFixture(
  body: JsonValue,
  statusCode = 200,
): DynamicFixtureResponse {
  return { statusCode, body, headers: { "Content-Type": "application/json" } };
}

function routeParam(pathname: string, pattern: RegExp): string | null {
  const match = pattern.exec(pathname);
  return match ? decodeURIComponent(match[1] ?? "") : null;
}

type MessageResponse = {
  id: string;
  threadId: string;
  labelIds?: string[];
};

type GmailFixtureMessage = MessageResponse & {
  snippet: string;
  internalDateOffsetMs: number;
  headers: Array<{ name: string; value: string }>;
  bodyText: string;
};

const GMAIL_FIXTURE_MESSAGES: GmailFixtureMessage[] = [
  {
    id: "msg-finance",
    threadId: "thr-finance",
    labelIds: ["INBOX", "UNREAD", "IMPORTANT"],
    snippet: "Please confirm receipt of invoice 4831 when you get a chance.",
    internalDateOffsetMs: -60 * 60 * 1000,
    headers: [
      { name: "From", value: "Finance Team <finance@example.com>" },
      { name: "To", value: "Owner <owner@example.test>" },
      { name: "Subject", value: "Invoice 4831 received" },
      { name: "Message-Id", value: "<finance-4831@example.com>" },
    ],
    bodyText:
      "Hi there,\n\nWe received invoice 4831 for April. Please confirm receipt when you get a chance.\n\nThanks,\nFinance Team\n",
  },
  {
    id: "msg-sarah",
    threadId: "thr-sarah",
    labelIds: ["INBOX", "UNREAD"],
    snippet:
      "Could you review the product brief tomorrow and send notes before lunch?",
    internalDateOffsetMs: -3 * 60 * 60 * 1000,
    headers: [
      { name: "From", value: "Sarah Lee <sarah@example.com>" },
      { name: "To", value: "Owner <owner@example.test>" },
      { name: "Subject", value: "Can you review the product brief?" },
      { name: "Message-Id", value: "<sarah-brief@example.com>" },
    ],
    bodyText:
      "Hey,\n\nCan you review the product brief tomorrow and send me notes before lunch?\n\nThanks,\nSarah\n",
  },
  {
    id: "msg-julia",
    threadId: "thr-julia",
    labelIds: ["INBOX"],
    snippet: "Looking forward to our intro meeting tomorrow.",
    internalDateOffsetMs: -6 * 60 * 60 * 1000,
    headers: [
      { name: "From", value: "Julia Chen <julia.chen@example.com>" },
      { name: "To", value: "Owner <owner@example.test>" },
      { name: "Subject", value: "Looking forward to tomorrow" },
      { name: "Message-Id", value: "<julia-intro@example.com>" },
    ],
    bodyText:
      "Looking forward to our intro meeting tomorrow. I'd love to compare notes on product strategy and AI assistants.\n\nBest,\nJulia\n",
  },
  {
    id: "msg-newsletter",
    threadId: "thr-news",
    labelIds: ["INBOX", "CATEGORY_PROMOTIONS"],
    snippet:
      "This week in ops: ship the launch checklist and review the metrics deck.",
    internalDateOffsetMs: -10 * 60 * 60 * 1000,
    headers: [
      { name: "From", value: "Weekly Digest <digest@example.com>" },
      { name: "To", value: "Owner <owner@example.test>" },
      { name: "Subject", value: "Weekly ops digest" },
      { name: "Precedence", value: "bulk" },
      { name: "List-Id", value: "<weekly.digest.example.com>" },
      { name: "Message-Id", value: "<weekly-digest@example.com>" },
    ],
    bodyText:
      "This week in ops: ship the launch checklist, review the metrics deck, and confirm next week's travel.\n",
  },
  {
    id: "msg-spam",
    threadId: "thr-spam",
    labelIds: ["SPAM", "UNREAD"],
    snippet: "Suspicious account notice routed to spam.",
    internalDateOffsetMs: -2 * 60 * 60 * 1000,
    headers: [
      { name: "From", value: "Security Notice <security@example.com>" },
      { name: "To", value: "Owner <owner@example.test>" },
      { name: "Subject", value: "Account notice" },
      { name: "Message-Id", value: "<spam-notice@example.com>" },
    ],
    bodyText: "This is a synthetic spam-folder fixture.\n",
  },
  {
    id: "msg-unresponded-inbound",
    threadId: "thr-unresponded",
    labelIds: ["INBOX"],
    snippet: "Could you send the signed vendor packet?",
    internalDateOffsetMs: -16 * 24 * 60 * 60 * 1000,
    headers: [
      { name: "From", value: "Vendor Ops <vendor@example.com>" },
      { name: "To", value: "Owner <owner@example.test>" },
      { name: "Subject", value: "Signed vendor packet" },
      { name: "Message-Id", value: "<vendor-inbound@example.com>" },
    ],
    bodyText: "Could you send the signed vendor packet when you can?\n",
  },
  {
    id: "msg-unresponded-sent",
    threadId: "thr-unresponded",
    labelIds: ["SENT"],
    snippet: "Following up on the signed packet.",
    internalDateOffsetMs: -14 * 24 * 60 * 60 * 1000,
    headers: [
      { name: "From", value: "Owner <owner@example.test>" },
      { name: "To", value: "Vendor Ops <vendor@example.com>" },
      { name: "Subject", value: "Re: Signed vendor packet" },
      { name: "Message-Id", value: "<vendor-sent@example.test>" },
      { name: "In-Reply-To", value: "<vendor-inbound@example.com>" },
      {
        name: "References",
        value: "<vendor-inbound@example.com> <vendor-sent@example.test>",
      },
    ],
    bodyText: "Following up on the signed packet. Can you confirm receipt?\n",
  },
];

type GmailMockMessage = Omit<GmailFixtureMessage, "internalDateOffsetMs"> & {
  internalDateMs: number;
  historyId: string;
  deleted: boolean;
  raw?: string;
};

interface GmailMockDraft {
  id: string;
  message: GmailMockMessage;
}

interface GmailHistoryMessageRef {
  message: { id: string; threadId: string };
}

interface GmailHistoryLabelRef extends GmailHistoryMessageRef {
  labelIds: string[];
}

interface GmailHistoryRecord {
  id: string;
  messagesAdded?: GmailHistoryMessageRef[];
  messagesDeleted?: GmailHistoryMessageRef[];
  labelsAdded?: GmailHistoryLabelRef[];
  labelsRemoved?: GmailHistoryLabelRef[];
}

interface GoogleMockState {
  gmailMessages: Map<string, GmailMockMessage>;
  gmailDrafts: Map<string, GmailMockDraft>;
  gmailHistoryId: number;
  gmailHistory: GmailHistoryRecord[];
  googleTokens: Map<string, Set<string>>;
}

const GOOGLE_DEFAULT_TOKEN_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.settings.basic",
] as const;

const GOOGLE_GMAIL_READ_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.metadata",
  "https://www.googleapis.com/auth/gmail.modify",
] as const;
const GOOGLE_GMAIL_SEND_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.modify",
] as const;
const GOOGLE_GMAIL_MODIFY_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
] as const;
const GOOGLE_GMAIL_DRAFT_SCOPES = [
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.modify",
] as const;
const GOOGLE_GMAIL_SETTINGS_SCOPES = [
  "https://www.googleapis.com/auth/gmail.settings.basic",
  "https://www.googleapis.com/auth/gmail.modify",
] as const;

function createGoogleMockState(): GoogleMockState {
  const messages = new Map<string, GmailMockMessage>();
  for (const fixture of GMAIL_FIXTURE_MESSAGES) {
    messages.set(fixture.id, {
      id: fixture.id,
      threadId: fixture.threadId,
      labelIds: [...(fixture.labelIds ?? [])],
      snippet: fixture.snippet,
      internalDateMs: Date.now() + fixture.internalDateOffsetMs,
      headers: fixture.headers.map((header) => ({ ...header })),
      bodyText: fixture.bodyText,
      historyId: "123456",
      deleted: false,
    });
  }

  const draftMessage = buildGmailMessageFromRaw({
    id: "draft-message-mock",
    threadId: "thr-draft",
    labelIds: ["DRAFT"],
    raw: Buffer.from(
      "To: test@example.test\r\nSubject: Mock Gmail draft\r\n\r\nMock Gmail draft",
      "utf8",
    ).toString("base64url"),
    historyId: "123456",
  });

  return {
    gmailMessages: messages,
    gmailDrafts: new Map([
      ["draft-mock", { id: "draft-mock", message: draftMessage }],
    ]),
    gmailHistoryId: 123456,
    gmailHistory: [
      {
        id: "123456",
        messagesAdded: [
          { message: { id: "msg-finance", threadId: "thr-finance" } },
        ],
        labelsAdded: [
          {
            message: { id: "msg-finance", threadId: "thr-finance" },
            labelIds: ["INBOX", "UNREAD"],
          },
        ],
      },
    ],
    googleTokens: new Map(),
  };
}

function gmailFixtureInternalDate(
  message: GmailFixtureMessage | GmailMockMessage,
): number {
  return "internalDateMs" in message
    ? message.internalDateMs
    : Date.now() + message.internalDateOffsetMs;
}

function gmailFixtureResponse(
  message: GmailFixtureMessage | GmailMockMessage,
): JsonValue {
  const date = new Date(gmailFixtureInternalDate(message));
  return {
    id: message.id,
    threadId: message.threadId,
    labelIds: message.labelIds ?? [],
    snippet: message.snippet,
    historyId: "123456",
    internalDate: String(date.getTime()),
    sizeEstimate: message.bodyText.length,
    payload: {
      mimeType: "text/plain",
      headers: [
        ...message.headers,
        { name: "Date", value: formatHttpDate(date) },
      ],
      body: {
        data: Buffer.from(message.bodyText, "utf8").toString("base64url"),
        size: message.bodyText.length,
      },
    },
  };
}

function gmailQueryMatches(
  message: GmailFixtureMessage | GmailMockMessage,
  query: string,
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  const labels = new Set(
    (message.labelIds ?? []).map((label) => label.toUpperCase()),
  );
  const haystack = [
    message.id,
    message.threadId,
    message.snippet,
    ...message.headers.map((header) => header.value),
    ...(message.labelIds ?? []),
  ]
    .join(" ")
    .toLowerCase();
  const ageMs = Date.now() - gmailFixtureInternalDate(message);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  return tokens.every((token) => {
    if (token === "in:anywhere") return true;
    if (token === "in:inbox") return labels.has("INBOX");
    if (token === "in:sent") return labels.has("SENT");
    if (token === "in:spam") return labels.has("SPAM");
    if (token === "in:trash") return labels.has("TRASH");
    if (token === "is:unread") return labels.has("UNREAD");
    if (token === "is:read") return !labels.has("UNREAD");
    if (token === "is:important") return labels.has("IMPORTANT");
    if (token.startsWith("label:")) {
      return labels.has(token.slice("label:".length).toUpperCase());
    }
    if (token.startsWith("category:")) {
      return labels.has(
        `CATEGORY_${token.slice("category:".length).toUpperCase()}`,
      );
    }
    if (token.startsWith("from:")) {
      const from = message.headers.find(
        (header) => header.name.toLowerCase() === "from",
      )?.value;
      return (from ?? "").toLowerCase().includes(token.slice("from:".length));
    }
    if (token.startsWith("subject:")) {
      const subject = message.headers.find(
        (header) => header.name.toLowerCase() === "subject",
      )?.value;
      return (subject ?? "")
        .toLowerCase()
        .includes(token.slice("subject:".length));
    }
    const relative = token.match(/^(older|newer)_than:(\d+)([dmy])$/);
    if (relative) {
      const amount = Number.parseInt(relative[2] ?? "", 10);
      const unit = relative[3];
      const dayCount =
        unit === "d" ? amount : unit === "m" ? amount * 30 : amount * 365;
      const boundaryMs = dayCount * 24 * 60 * 60 * 1000;
      return relative[1] === "older"
        ? ageMs >= boundaryMs
        : ageMs <= boundaryMs;
    }
    return haystack.includes(token.replace(/^"|"$/g, ""));
  });
}

function gmailLiveMessages(state: GoogleMockState): GmailMockMessage[] {
  return [...state.gmailMessages.values()].filter(
    (message) => !message.deleted,
  );
}

function isStringArray(value: JsonValue | undefined): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

function readOptionalStringArray(
  body: RequestBody,
  key: string,
): string[] | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (!isStringArray(value)) {
    throw new MockHttpError(400, `${key} must be an array of strings`);
  }
  return value.map((entry) => entry.trim()).filter(Boolean);
}

function readRequiredStringArray(body: RequestBody, key: string): string[] {
  const value = readOptionalStringArray(body, key);
  if (!value || value.length === 0) {
    throw new MockHttpError(400, `${key} must contain at least one string`);
  }
  return value;
}

function readRequiredString(body: RequestBody, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new MockHttpError(400, `${key} must be a non-empty string`);
  }
  return value.trim();
}

function getMessageOrThrow(
  state: GoogleMockState,
  messageId: string,
): GmailMockMessage {
  const message = state.gmailMessages.get(messageId);
  if (!message || message.deleted) {
    throw new MockHttpError(404, "Requested entity was not found.");
  }
  return message;
}

function jsonError(
  statusCode: number,
  message: string,
): DynamicFixtureResponse {
  const status =
    statusCode === 401
      ? "UNAUTHENTICATED"
      : statusCode === 403
        ? "PERMISSION_DENIED"
        : statusCode === 404
          ? "NOT_FOUND"
          : "INVALID_ARGUMENT";
  return jsonFixture(
    {
      error: {
        code: statusCode,
        message,
        status,
      },
    },
    statusCode,
  );
}

function addHistoryRecord(
  state: GoogleMockState,
  record: Omit<GmailHistoryRecord, "id">,
): string {
  state.gmailHistoryId += 1;
  const id = String(state.gmailHistoryId);
  state.gmailHistory.push({ id, ...record });
  return id;
}

function gmailHistoryRecordResponse(
  record: GmailHistoryRecord,
): Record<string, JsonValue> {
  return {
    id: record.id,
    ...(record.messagesAdded
      ? {
          messagesAdded: record.messagesAdded.map((entry) => ({
            message: { ...entry.message },
          })),
        }
      : {}),
    ...(record.messagesDeleted
      ? {
          messagesDeleted: record.messagesDeleted.map((entry) => ({
            message: { ...entry.message },
          })),
        }
      : {}),
    ...(record.labelsAdded
      ? {
          labelsAdded: record.labelsAdded.map((entry) => ({
            message: { ...entry.message },
            labelIds: [...entry.labelIds],
          })),
        }
      : {}),
    ...(record.labelsRemoved
      ? {
          labelsRemoved: record.labelsRemoved.map((entry) => ({
            message: { ...entry.message },
            labelIds: [...entry.labelIds],
          })),
        }
      : {}),
  };
}

function applyLabelPatch(
  message: GmailMockMessage,
  addLabelIds: readonly string[] | undefined,
  removeLabelIds: readonly string[] | undefined,
): {
  added: string[];
  removed: string[];
} {
  const labels = new Set(message.labelIds ?? []);
  const added: string[] = [];
  const removed: string[] = [];
  for (const labelId of removeLabelIds ?? []) {
    if (labels.delete(labelId)) {
      removed.push(labelId);
    }
  }
  for (const labelId of addLabelIds ?? []) {
    if (!labels.has(labelId)) {
      labels.add(labelId);
      added.push(labelId);
    }
  }
  message.labelIds = [...labels];
  return { added, removed };
}

function modifyGmailMessages(
  state: GoogleMockState,
  ids: readonly string[],
  addLabelIds: readonly string[] | undefined,
  removeLabelIds: readonly string[] | undefined,
): string {
  if (
    (!addLabelIds || addLabelIds.length === 0) &&
    (!removeLabelIds || removeLabelIds.length === 0)
  ) {
    throw new MockHttpError(
      400,
      "modify requires addLabelIds or removeLabelIds",
    );
  }

  const labelsAdded: GmailHistoryLabelRef[] = [];
  const labelsRemoved: GmailHistoryLabelRef[] = [];
  for (const id of ids) {
    const message = getMessageOrThrow(state, id);
    const changed = applyLabelPatch(message, addLabelIds, removeLabelIds);
    if (changed.added.length > 0) {
      labelsAdded.push({
        message: { id: message.id, threadId: message.threadId },
        labelIds: changed.added,
      });
    }
    if (changed.removed.length > 0) {
      labelsRemoved.push({
        message: { id: message.id, threadId: message.threadId },
        labelIds: changed.removed,
      });
    }
  }

  const historyId = addHistoryRecord(state, {
    ...(labelsAdded.length > 0 ? { labelsAdded } : {}),
    ...(labelsRemoved.length > 0 ? { labelsRemoved } : {}),
  });
  for (const id of ids) {
    const message = state.gmailMessages.get(id);
    if (message && !message.deleted) message.historyId = historyId;
  }
  return historyId;
}

function deleteGmailMessages(
  state: GoogleMockState,
  ids: readonly string[],
): string {
  const messagesDeleted: GmailHistoryMessageRef[] = [];
  for (const id of ids) {
    const message = getMessageOrThrow(state, id);
    message.deleted = true;
    messagesDeleted.push({
      message: { id: message.id, threadId: message.threadId },
    });
  }
  return addHistoryRecord(state, { messagesDeleted });
}

function splitAddressHeader(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function decodeGmailRaw(raw: string): string {
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(raw)) {
    throw new MockHttpError(400, "raw must be a base64url RFC 822 message");
  }
  const decoded = Buffer.from(raw, "base64url").toString("utf8");
  if (decoded.trim().length === 0 || !decoded.includes(":")) {
    throw new MockHttpError(400, "raw must decode to an RFC 822 message");
  }
  return decoded;
}

function parseRfc822(raw: string): {
  headers: Array<{ name: string; value: string }>;
  bodyText: string;
} {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const separatorIndex = normalized.indexOf("\n\n");
  const headerBlock =
    separatorIndex >= 0 ? normalized.slice(0, separatorIndex) : normalized;
  const bodyText =
    separatorIndex >= 0 ? normalized.slice(separatorIndex + 2) : "";
  const unfolded = headerBlock.replace(/\n[ \t]+/g, " ");
  const headers = unfolded
    .split("\n")
    .map((line) => {
      const index = line.indexOf(":");
      if (index <= 0) return null;
      return {
        name: line.slice(0, index).trim(),
        value: line.slice(index + 1).trim(),
      };
    })
    .filter(
      (header): header is { name: string; value: string } => header !== null,
    );
  return { headers, bodyText };
}

function readRfc822Header(
  headers: readonly { name: string; value: string }[],
  name: string,
): string | null {
  const lower = name.toLowerCase();
  return (
    headers.find((header) => header.name.toLowerCase() === lower)?.value ?? null
  );
}

function decodedSendMetadata(raw: string): GmailDecodedSendMetadata {
  const decoded = decodeGmailRaw(raw);
  const parsed = parseRfc822(decoded);
  return {
    rawLength: raw.length,
    from: readRfc822Header(parsed.headers, "From"),
    to: splitAddressHeader(readRfc822Header(parsed.headers, "To")),
    cc: splitAddressHeader(readRfc822Header(parsed.headers, "Cc")),
    bcc: splitAddressHeader(readRfc822Header(parsed.headers, "Bcc")),
    subject: readRfc822Header(parsed.headers, "Subject"),
    messageId: readRfc822Header(parsed.headers, "Message-Id"),
    inReplyTo: readRfc822Header(parsed.headers, "In-Reply-To"),
    references: readRfc822Header(parsed.headers, "References"),
    runIdHeader:
      readRfc822Header(parsed.headers, "X-Milady-Test-Run") ??
      readRfc822Header(parsed.headers, "X-Milady-Run-Id"),
    bodyText: parsed.bodyText.trim(),
  };
}

function buildGmailMessageFromRaw(args: {
  id: string;
  threadId: string;
  labelIds: string[];
  raw: string;
  historyId: string;
}): GmailMockMessage {
  const decoded = decodeGmailRaw(args.raw);
  const parsed = parseRfc822(decoded);
  const subject = readRfc822Header(parsed.headers, "Subject") ?? "(no subject)";
  return {
    id: args.id,
    threadId: args.threadId,
    labelIds: [...args.labelIds],
    snippet: parsed.bodyText.trim().replace(/\s+/g, " ").slice(0, 160),
    internalDateMs: Date.now(),
    headers:
      parsed.headers.length > 0
        ? parsed.headers
        : [{ name: "Subject", value: subject }],
    bodyText: parsed.bodyText,
    historyId: args.historyId,
    deleted: false,
    raw: args.raw,
  };
}

function inferThreadIdFromRaw(
  state: GoogleMockState,
  raw: string,
  requestedThreadId: JsonValue | undefined,
): string {
  if (
    typeof requestedThreadId === "string" &&
    requestedThreadId.trim().length > 0
  ) {
    return requestedThreadId.trim();
  }
  const decoded = decodedSendMetadata(raw);
  const referencedHeaders = [decoded.inReplyTo, decoded.references].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  for (const message of gmailLiveMessages(state)) {
    const messageId = readRfc822Header(message.headers, "Message-Id");
    if (
      messageId &&
      referencedHeaders.some((header) => header.includes(messageId))
    ) {
      return message.threadId;
    }
  }
  return `thr-sent-${randomFromAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 8)}`;
}

function gmailListMessages(
  state: GoogleMockState,
  searchParams: URLSearchParams,
): DynamicFixtureResponse {
  const includeSpamTrash = searchParams.get("includeSpamTrash") === "true";
  const query = searchParams.get("q") ?? "";
  const labelIds = searchParams.getAll("labelIds");
  const maxResults = Math.max(
    1,
    Math.min(Number.parseInt(searchParams.get("maxResults") ?? "20", 10), 50),
  );
  const pageOffset = Math.max(
    0,
    Number.parseInt(searchParams.get("pageToken") ?? "0", 10) || 0,
  );
  const queryTargetsSpamTrash = /\bin:(?:spam|trash|anywhere)\b/i.test(query);
  const labelTargetsSpamTrash = labelIds.some((labelId) =>
    /^(SPAM|TRASH)$/i.test(labelId),
  );
  const filtered = gmailLiveMessages(state)
    .filter((message) => {
      const labels = new Set(
        (message.labelIds ?? []).map((label) => label.toUpperCase()),
      );
      if (
        !includeSpamTrash &&
        !queryTargetsSpamTrash &&
        !labelTargetsSpamTrash &&
        (labels.has("SPAM") || labels.has("TRASH"))
      ) {
        return false;
      }
      if (
        labelIds.length > 0 &&
        !labelIds.every((labelId) => labels.has(labelId.toUpperCase()))
      ) {
        return false;
      }
      return gmailQueryMatches(message, query);
    })
    .sort(
      (left, right) =>
        gmailFixtureInternalDate(right) - gmailFixtureInternalDate(left),
    );
  const page = filtered.slice(pageOffset, pageOffset + maxResults);
  return jsonFixture({
    messages: page.map((message) => ({
      id: message.id,
      threadId: message.threadId,
    })),
    resultSizeEstimate: filtered.length,
    ...(pageOffset + maxResults < filtered.length
      ? { nextPageToken: String(pageOffset + maxResults) }
      : {}),
  });
}

function headerValue(
  headers: http.IncomingHttpHeaders,
  key: string,
): string | null {
  const value = headers[key.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === "string" ? value : null;
}

function requestRunId(headers: http.IncomingHttpHeaders): string | undefined {
  return (
    headerValue(headers, "x-milady-test-run") ??
    headerValue(headers, "x-milady-run-id") ??
    headerValue(headers, "x-test-run-id") ??
    undefined
  );
}

function bearerToken(headers: http.IncomingHttpHeaders): string | null {
  const authorization = headerValue(headers, "authorization")?.trim();
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function googleOAuthSearchDirs(): string[] {
  const explicitOAuthDir = process.env.ELIZA_OAUTH_DIR?.trim();
  if (explicitOAuthDir) {
    return [path.join(explicitOAuthDir, "lifeops", "google")];
  }
  const stateDir =
    process.env.MILADY_STATE_DIR?.trim() ?? process.env.ELIZA_STATE_DIR?.trim();
  return stateDir
    ? [path.join(stateDir, "credentials", "lifeops", "google")]
    : [];
}

function readJsonFilesRecursively(
  dir: string,
  out: string[],
  remaining: number,
): number {
  if (remaining <= 0 || !fs.existsSync(dir)) return remaining;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (remaining <= 0) break;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      remaining = readJsonFilesRecursively(fullPath, out, remaining);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".json")) {
      out.push(fullPath);
      remaining -= 1;
    }
  }
  return remaining;
}

function refreshGoogleTokensFromSeededGrants(state: GoogleMockState): void {
  const files: string[] = [];
  for (const dir of googleOAuthSearchDirs()) {
    readJsonFilesRecursively(dir, files, 100);
  }
  for (const file of files) {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as JsonValue;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      continue;
    }
    const record = parsed as Record<string, JsonValue>;
    const accessToken = record.accessToken;
    const grantedScopes = record.grantedScopes;
    if (typeof accessToken !== "string" || !isStringArray(grantedScopes)) {
      continue;
    }
    state.googleTokens.set(accessToken, new Set(grantedScopes));
  }
}

function requiredGmailScopes(
  method: string,
  pathname: string,
): readonly string[] {
  if (!pathname.startsWith("/gmail/v1/users/me/")) return [];
  if (pathname.includes("/settings/filters")) {
    return GOOGLE_GMAIL_SETTINGS_SCOPES;
  }
  if (pathname.endsWith("/messages/send")) return GOOGLE_GMAIL_SEND_SCOPES;
  if (pathname.endsWith("/drafts/send")) return GOOGLE_GMAIL_SEND_SCOPES;
  if (pathname.includes("/drafts")) {
    return method === "GET"
      ? GOOGLE_GMAIL_READ_SCOPES
      : GOOGLE_GMAIL_DRAFT_SCOPES;
  }
  if (
    method === "POST" &&
    (pathname.includes("/modify") ||
      pathname.endsWith("/batchModify") ||
      pathname.endsWith("/batchDelete") ||
      pathname.endsWith("/trash") ||
      pathname.endsWith("/untrash"))
  ) {
    return GOOGLE_GMAIL_MODIFY_SCOPES;
  }
  if (method === "DELETE") return GOOGLE_GMAIL_MODIFY_SCOPES;
  return GOOGLE_GMAIL_READ_SCOPES;
}

function enforceGoogleAuthIfPresent(
  state: GoogleMockState,
  method: string,
  pathname: string,
  headers: http.IncomingHttpHeaders,
): DynamicFixtureResponse | null {
  const requiredScopes = requiredGmailScopes(method, pathname);
  if (requiredScopes.length === 0) return null;
  const token = bearerToken(headers);
  if (!token) return null;
  if (!state.googleTokens.has(token)) {
    refreshGoogleTokensFromSeededGrants(state);
  }
  const scopes = state.googleTokens.get(token);
  if (!scopes) {
    return jsonError(401, "Unknown or expired mock Google access token");
  }
  return requiredScopes.some((scope) => scopes.has(scope))
    ? null
    : jsonError(403, "Google mock token is missing required Gmail scope");
}

function googleDynamicFixture(
  state: GoogleMockState,
  method: string,
  pathname: string,
  searchParams: URLSearchParams,
  requestBody: RequestBody,
  headers: http.IncomingHttpHeaders,
  ledgerEntry: MockRequestLedgerEntry,
): DynamicFixtureResponse | null {
  if (method === "POST" && pathname === "/token") {
    const scopeText =
      typeof requestBody.scope === "string"
        ? requestBody.scope
        : GOOGLE_DEFAULT_TOKEN_SCOPES.join(" ");
    const scopes = scopeText.split(/\s+/).filter(Boolean);
    const accessToken = `fake-${crypto.randomUUID()}`;
    state.googleTokens.set(accessToken, new Set(scopes));
    return jsonFixture({
      access_token: accessToken,
      expires_in: 3600,
      refresh_token: "mock-google-refresh-token",
      token_type: "Bearer",
      scope: scopes.join(" "),
    });
  }

  if (!pathname.startsWith("/gmail/v1/users/me/")) return null;

  const authFailure = enforceGoogleAuthIfPresent(
    state,
    method,
    pathname,
    headers,
  );
  if (authFailure) return authFailure;

  if (method === "GET" && pathname === "/gmail/v1/users/me/messages") {
    return gmailListMessages(state, searchParams);
  }

  if (method === "GET" && pathname === "/gmail/v1/users/me/labels") {
    return jsonFixture({
      labels: [
        { id: "INBOX", name: "INBOX", type: "system" },
        { id: "SENT", name: "SENT", type: "system" },
        { id: "DRAFT", name: "DRAFT", type: "system" },
        { id: "SPAM", name: "SPAM", type: "system" },
        { id: "TRASH", name: "TRASH", type: "system" },
        { id: "UNREAD", name: "UNREAD", type: "system" },
        { id: "IMPORTANT", name: "IMPORTANT", type: "system" },
        { id: "STARRED", name: "STARRED", type: "system" },
        {
          id: "CATEGORY_PROMOTIONS",
          name: "CATEGORY_PROMOTIONS",
          type: "system",
        },
        { id: "Label_1", name: "milady-e2e", type: "user" },
      ],
    });
  }

  if (
    method === "POST" &&
    pathname === "/gmail/v1/users/me/messages/batchModify"
  ) {
    const ids = readRequiredStringArray(requestBody, "ids");
    const addLabelIds = readOptionalStringArray(requestBody, "addLabelIds");
    const removeLabelIds = readOptionalStringArray(
      requestBody,
      "removeLabelIds",
    );
    const historyId = modifyGmailMessages(
      state,
      ids,
      addLabelIds,
      removeLabelIds,
    );
    ledgerEntry.gmail = {
      action: "messages.batchModify",
      batchIds: ids,
      ids,
      ...(addLabelIds ? { addLabelIds } : {}),
      ...(removeLabelIds ? { removeLabelIds } : {}),
      historyId,
      ...(ledgerEntry.runId ? { runId: ledgerEntry.runId } : {}),
    };
    return jsonFixture({});
  }

  if (
    method === "POST" &&
    pathname === "/gmail/v1/users/me/messages/batchDelete"
  ) {
    const ids = readRequiredStringArray(requestBody, "ids");
    const historyId = deleteGmailMessages(state, ids);
    ledgerEntry.gmail = {
      action: "messages.batchDelete",
      batchIds: ids,
      ids,
      historyId,
      ...(ledgerEntry.runId ? { runId: ledgerEntry.runId } : {}),
    };
    return jsonFixture({});
  }

  if (method === "POST" && pathname === "/gmail/v1/users/me/messages/send") {
    const raw = readRequiredString(requestBody, "raw");
    const metadata = decodedSendMetadata(raw);
    const message = buildGmailMessageFromRaw({
      id: `sent-${randomFromAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 12)}`,
      threadId: inferThreadIdFromRaw(state, raw, requestBody.threadId),
      labelIds: ["SENT"],
      raw,
      historyId: String(state.gmailHistoryId + 1),
    });
    state.gmailMessages.set(message.id, message);
    const finalHistoryId = addHistoryRecord(state, {
      messagesAdded: [
        { message: { id: message.id, threadId: message.threadId } },
      ],
    });
    message.historyId = finalHistoryId;
    ledgerEntry.gmail = {
      action: "messages.send",
      messageId: message.id,
      threadId: message.threadId,
      decodedSend: metadata,
      historyId: finalHistoryId,
      ...(metadata.runIdHeader ? { runId: metadata.runIdHeader } : {}),
    };
    return jsonFixture(gmailFixtureResponse(message));
  }

  const modifyMessageId = routeParam(
    pathname,
    /^\/gmail\/v1\/users\/me\/messages\/([^/]+)\/modify\/?$/,
  );
  if (method === "POST" && modifyMessageId) {
    const addLabelIds = readOptionalStringArray(requestBody, "addLabelIds");
    const removeLabelIds = readOptionalStringArray(
      requestBody,
      "removeLabelIds",
    );
    const historyId = modifyGmailMessages(
      state,
      [modifyMessageId],
      addLabelIds,
      removeLabelIds,
    );
    const message = getMessageOrThrow(state, modifyMessageId);
    ledgerEntry.gmail = {
      action: "messages.modify",
      messageId: modifyMessageId,
      ids: [modifyMessageId],
      ...(addLabelIds ? { addLabelIds } : {}),
      ...(removeLabelIds ? { removeLabelIds } : {}),
      historyId,
      ...(ledgerEntry.runId ? { runId: ledgerEntry.runId } : {}),
    };
    return jsonFixture(gmailFixtureResponse(message));
  }

  const trashMessageId = routeParam(
    pathname,
    /^\/gmail\/v1\/users\/me\/messages\/([^/]+)\/trash\/?$/,
  );
  if (method === "POST" && trashMessageId) {
    const historyId = modifyGmailMessages(
      state,
      [trashMessageId],
      ["TRASH"],
      ["INBOX", "SPAM"],
    );
    const message = getMessageOrThrow(state, trashMessageId);
    ledgerEntry.gmail = {
      action: "messages.trash",
      messageId: trashMessageId,
      addLabelIds: ["TRASH"],
      removeLabelIds: ["INBOX", "SPAM"],
      historyId,
      ...(ledgerEntry.runId ? { runId: ledgerEntry.runId } : {}),
    };
    return jsonFixture(gmailFixtureResponse(message));
  }

  const untrashMessageId = routeParam(
    pathname,
    /^\/gmail\/v1\/users\/me\/messages\/([^/]+)\/untrash\/?$/,
  );
  if (method === "POST" && untrashMessageId) {
    const historyId = modifyGmailMessages(
      state,
      [untrashMessageId],
      ["INBOX"],
      ["TRASH"],
    );
    const message = getMessageOrThrow(state, untrashMessageId);
    ledgerEntry.gmail = {
      action: "messages.untrash",
      messageId: untrashMessageId,
      addLabelIds: ["INBOX"],
      removeLabelIds: ["TRASH"],
      historyId,
      ...(ledgerEntry.runId ? { runId: ledgerEntry.runId } : {}),
    };
    return jsonFixture(gmailFixtureResponse(message));
  }

  const deleteMessageId = routeParam(
    pathname,
    /^\/gmail\/v1\/users\/me\/messages\/([^/]+)\/?$/,
  );
  if (method === "DELETE" && deleteMessageId) {
    const historyId = deleteGmailMessages(state, [deleteMessageId]);
    ledgerEntry.gmail = {
      action: "messages.delete",
      messageId: deleteMessageId,
      ids: [deleteMessageId],
      historyId,
      ...(ledgerEntry.runId ? { runId: ledgerEntry.runId } : {}),
    };
    return jsonFixture({});
  }
  if (method === "GET" && deleteMessageId) {
    const message = state.gmailMessages.get(deleteMessageId);
    return message && !message.deleted
      ? jsonFixture(gmailFixtureResponse(message))
      : jsonError(404, "Requested entity was not found.");
  }

  if (method === "POST" && pathname === "/gmail/v1/users/me/drafts") {
    const messageBody = requestBody.message;
    if (
      !messageBody ||
      typeof messageBody !== "object" ||
      Array.isArray(messageBody)
    ) {
      throw new MockHttpError(400, "message must be an object");
    }
    const messageRecord = messageBody as Record<string, JsonValue>;
    const raw = messageRecord.raw;
    if (typeof raw !== "string" || raw.trim().length === 0) {
      throw new MockHttpError(400, "message.raw must be a non-empty string");
    }
    const historyId = addHistoryRecord(state, {});
    const draft: GmailMockDraft = {
      id: `draft-${randomFromAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 10)}`,
      message: buildGmailMessageFromRaw({
        id: `draft-message-${randomFromAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 10)}`,
        threadId: inferThreadIdFromRaw(state, raw, messageRecord.threadId),
        labelIds: ["DRAFT"],
        raw,
        historyId,
      }),
    };
    state.gmailDrafts.set(draft.id, draft);
    ledgerEntry.gmail = {
      action: "drafts.create",
      draftId: draft.id,
      messageId: draft.message.id,
      threadId: draft.message.threadId,
      decodedSend: decodedSendMetadata(raw),
      historyId,
      ...(ledgerEntry.runId ? { runId: ledgerEntry.runId } : {}),
    };
    return jsonFixture({
      id: draft.id,
      message: gmailFixtureResponse(draft.message),
    });
  }

  if (method === "GET" && pathname === "/gmail/v1/users/me/drafts") {
    const drafts = [...state.gmailDrafts.values()];
    return jsonFixture({
      drafts: drafts.map((draft) => ({
        id: draft.id,
        message: {
          id: draft.message.id,
          threadId: draft.message.threadId,
        },
      })),
      resultSizeEstimate: drafts.length,
    });
  }

  const draftId = routeParam(
    pathname,
    /^\/gmail\/v1\/users\/me\/drafts\/([^/]+)\/?$/,
  );
  if (method === "GET" && draftId) {
    const draft = state.gmailDrafts.get(draftId);
    if (!draft) return jsonError(404, "Requested entity was not found.");
    return jsonFixture({
      id: draft.id,
      message: gmailFixtureResponse(draft.message),
    });
  }
  if (method === "DELETE" && draftId) {
    if (!state.gmailDrafts.has(draftId)) {
      return jsonError(404, "Requested entity was not found.");
    }
    state.gmailDrafts.delete(draftId);
    ledgerEntry.gmail = {
      action: "drafts.delete",
      draftId,
      ...(ledgerEntry.runId ? { runId: ledgerEntry.runId } : {}),
    };
    return jsonFixture({});
  }

  if (method === "POST" && pathname === "/gmail/v1/users/me/drafts/send") {
    const draftIdToSend = readRequiredString(requestBody, "id");
    const draft = state.gmailDrafts.get(draftIdToSend);
    if (!draft) return jsonError(404, "Requested entity was not found.");
    const raw = draft.message.raw;
    if (!raw) {
      throw new MockHttpError(400, "draft message is missing raw content");
    }
    const sentMessage = buildGmailMessageFromRaw({
      id: `sent-draft-${randomFromAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 12)}`,
      threadId: draft.message.threadId,
      labelIds: ["SENT"],
      raw,
      historyId: String(state.gmailHistoryId + 1),
    });
    state.gmailDrafts.delete(draftIdToSend);
    state.gmailMessages.set(sentMessage.id, sentMessage);
    const finalHistoryId = addHistoryRecord(state, {
      messagesAdded: [
        { message: { id: sentMessage.id, threadId: sentMessage.threadId } },
      ],
    });
    sentMessage.historyId = finalHistoryId;
    ledgerEntry.gmail = {
      action: "drafts.send",
      draftId: draftIdToSend,
      messageId: sentMessage.id,
      threadId: sentMessage.threadId,
      decodedSend: decodedSendMetadata(raw),
      historyId: finalHistoryId,
      ...(ledgerEntry.runId ? { runId: ledgerEntry.runId } : {}),
    };
    return jsonFixture(gmailFixtureResponse(sentMessage));
  }

  if (method === "POST" && pathname === "/gmail/v1/users/me/watch") {
    const topicName = requestBody.topicName;
    if (typeof topicName !== "string" || topicName.trim().length === 0) {
      throw new MockHttpError(400, "topicName must be a non-empty string");
    }
    const labelIds = readOptionalStringArray(requestBody, "labelIds");
    ledgerEntry.gmail = {
      action: "watch",
      ...(labelIds ? { ids: labelIds } : {}),
      historyId: String(state.gmailHistoryId),
      ...(ledgerEntry.runId ? { runId: ledgerEntry.runId } : {}),
    };
    return jsonFixture({
      historyId: String(state.gmailHistoryId),
      expiration: String(Date.now() + 60 * 60 * 1000),
    });
  }

  if (method === "GET" && pathname === "/gmail/v1/users/me/history") {
    const startHistoryId = Number.parseInt(
      searchParams.get("startHistoryId") ?? "0",
      10,
    );
    const history = state.gmailHistory.filter(
      (entry) => Number.parseInt(entry.id, 10) > startHistoryId,
    );
    return jsonFixture({
      history: history.map((entry) => gmailHistoryRecordResponse(entry)),
      historyId: String(state.gmailHistoryId),
    });
  }

  if (method === "GET" && pathname === "/gmail/v1/users/me/threads") {
    const threadIds = [
      ...new Set(gmailLiveMessages(state).map((message) => message.threadId)),
    ];
    return jsonFixture({
      threads: threadIds.map((id) => ({
        id,
        historyId: String(state.gmailHistoryId),
        snippet:
          gmailLiveMessages(state).find((message) => message.threadId === id)
            ?.snippet ?? "",
      })),
      resultSizeEstimate: threadIds.length,
    });
  }

  const threadId = routeParam(
    pathname,
    /^\/gmail\/v1\/users\/me\/threads\/([^/]+)\/?$/,
  );
  if (method === "GET" && threadId) {
    const messages = gmailLiveMessages(state).filter(
      (message) => message.threadId === threadId,
    );
    if (messages.length === 0) {
      return jsonError(404, "Requested entity was not found.");
    }
    return jsonFixture({
      id: threadId,
      historyId: String(state.gmailHistoryId),
      messages: messages.map((message) => gmailFixtureResponse(message)),
    });
  }

  const modifyThreadId = routeParam(
    pathname,
    /^\/gmail\/v1\/users\/me\/threads\/([^/]+)\/modify\/?$/,
  );
  if (method === "POST" && modifyThreadId) {
    const ids = gmailLiveMessages(state)
      .filter((message) => message.threadId === modifyThreadId)
      .map((message) => message.id);
    if (ids.length === 0) {
      return jsonError(404, "Requested entity was not found.");
    }
    const addLabelIds = readOptionalStringArray(requestBody, "addLabelIds");
    const removeLabelIds = readOptionalStringArray(
      requestBody,
      "removeLabelIds",
    );
    const historyId = modifyGmailMessages(
      state,
      ids,
      addLabelIds,
      removeLabelIds,
    );
    ledgerEntry.gmail = {
      action: "threads.modify",
      threadId: modifyThreadId,
      ids,
      ...(addLabelIds ? { addLabelIds } : {}),
      ...(removeLabelIds ? { removeLabelIds } : {}),
      historyId,
      ...(ledgerEntry.runId ? { runId: ledgerEntry.runId } : {}),
    };
    return jsonFixture({
      id: modifyThreadId,
      historyId,
      messages: ids.map((id) =>
        gmailFixtureResponse(getMessageOrThrow(state, id)),
      ),
    });
  }

  const trashThreadId = routeParam(
    pathname,
    /^\/gmail\/v1\/users\/me\/threads\/([^/]+)\/trash\/?$/,
  );
  if (method === "POST" && trashThreadId) {
    const ids = gmailLiveMessages(state)
      .filter((message) => message.threadId === trashThreadId)
      .map((message) => message.id);
    if (ids.length === 0) {
      return jsonError(404, "Requested entity was not found.");
    }
    const historyId = modifyGmailMessages(
      state,
      ids,
      ["TRASH"],
      ["INBOX", "SPAM"],
    );
    ledgerEntry.gmail = {
      action: "threads.trash",
      threadId: trashThreadId,
      ids,
      addLabelIds: ["TRASH"],
      removeLabelIds: ["INBOX", "SPAM"],
      historyId,
      ...(ledgerEntry.runId ? { runId: ledgerEntry.runId } : {}),
    };
    return jsonFixture({
      id: trashThreadId,
      historyId,
      messages: ids.map((id) =>
        gmailFixtureResponse(getMessageOrThrow(state, id)),
      ),
    });
  }

  const untrashThreadId = routeParam(
    pathname,
    /^\/gmail\/v1\/users\/me\/threads\/([^/]+)\/untrash\/?$/,
  );
  if (method === "POST" && untrashThreadId) {
    const ids = gmailLiveMessages(state)
      .filter((message) => message.threadId === untrashThreadId)
      .map((message) => message.id);
    if (ids.length === 0) {
      return jsonError(404, "Requested entity was not found.");
    }
    const historyId = modifyGmailMessages(state, ids, ["INBOX"], ["TRASH"]);
    ledgerEntry.gmail = {
      action: "threads.untrash",
      threadId: untrashThreadId,
      ids,
      addLabelIds: ["INBOX"],
      removeLabelIds: ["TRASH"],
      historyId,
      ...(ledgerEntry.runId ? { runId: ledgerEntry.runId } : {}),
    };
    return jsonFixture({
      id: untrashThreadId,
      historyId,
      messages: ids.map((id) =>
        gmailFixtureResponse(getMessageOrThrow(state, id)),
      ),
    });
  }

  if (method === "POST" && pathname === "/gmail/v1/users/me/settings/filters") {
    if (!requestBody.criteria || !requestBody.action) {
      throw new MockHttpError(400, "filter requires criteria and action");
    }
    ledgerEntry.gmail = {
      action: "settings.filters.create",
      ...(ledgerEntry.runId ? { runId: ledgerEntry.runId } : {}),
    };
    return jsonFixture({
      id: `filter-${randomFromAlphabet(
        "abcdefghijklmnopqrstuvwxyz0123456789",
        8,
      )}`,
      criteria: { from: "*@example.com" },
      action: { removeLabelIds: ["INBOX"] },
    });
  }

  return null;
}

async function startFixtureServer(
  dataPath: string,
): Promise<StartedFixtureServer> {
  const environment = readEnvironment(dataPath);
  const routes = compileRoutes(environment);
  const requests: MockRequestLedgerEntry[] = [];
  const googleState =
    environment.name === "Google APIs" ? createGoogleMockState() : null;
  let stopped = false;

  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
      const method = (req.method ?? "GET").toUpperCase();
      const requestBody = await readRequestBody(req);
      if (method === "GET" && requestUrl.pathname === "/__mock/requests") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ requests }));
        return;
      }
      if (method === "DELETE" && requestUrl.pathname === "/__mock/requests") {
        requests.splice(0, requests.length);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      const ledgerEntry: MockRequestLedgerEntry = {
        environment: environment.name ?? dataPath,
        method,
        path: requestUrl.pathname,
        query: requestUrl.search,
        body: requestBody,
        createdAt: new Date().toISOString(),
        ...(requestRunId(req.headers)
          ? { runId: requestRunId(req.headers) }
          : {}),
      };
      requests.push(ledgerEntry);
      const dynamicResponse = googleState
        ? googleDynamicFixture(
            googleState,
            method,
            requestUrl.pathname,
            requestUrl.searchParams,
            requestBody,
            req.headers,
            ledgerEntry,
          )
        : null;
      if (dynamicResponse) {
        res.writeHead(dynamicResponse.statusCode, {
          "Content-Type": "application/json",
          ...(dynamicResponse.headers ?? {}),
        });
        res.end(JSON.stringify(dynamicResponse.body));
        return;
      }

      const matched = findRoute(routes, method, requestUrl.pathname);
      if (!matched) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "not_found" }));
        return;
      }

      const response = matched.route.response;
      const headers = Object.fromEntries(
        (response.headers ?? []).map((header) => [header.key, header.value]),
      );
      if (!headers["Content-Type"] && !headers["content-type"]) {
        headers["Content-Type"] = "application/json";
      }

      res.writeHead(response.statusCode ?? 200, headers);
      res.end(
        renderBodyTemplate(response.body ?? "", matched.params, requestBody),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const statusCode = err instanceof MockHttpError ? err.statusCode : 500;
      res.writeHead(statusCode, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: statusCode === 500 ? "fixture_error" : "bad_request",
          message,
        }),
      );
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  server.unref();

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error(`Failed to bind mock fixture server: ${dataPath}`);
  }

  const port = (address as AddressInfo).port;
  return {
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    clearRequests: () => {
      requests.splice(0, requests.length);
    },
    stop: async () => {
      if (stopped) return;
      stopped = true;
      if (!server.listening) return;
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

export async function startMocks(opts?: {
  envs?: readonly MockEnvironmentName[];
}): Promise<StartedMocks> {
  const envs = opts?.envs ?? MOCK_ENVIRONMENTS;

  const dataPaths = envs.map((e) => path.resolve(ENVS_DIR, `${e}.json`));
  const missing = dataPaths.filter((p) => !fs.existsSync(p));
  if (missing.length > 0) {
    throw new Error(`Mock environment files missing: ${missing.join(", ")}`);
  }

  const servers: StartedFixtureServer[] = [];
  try {
    for (const dataPath of dataPaths) {
      servers.push(await startFixtureServer(dataPath));
    }
  } catch (err) {
    await Promise.allSettled(servers.map((server) => server.stop()));
    throw err;
  }
  const portMap = Object.fromEntries(
    envs.map((e, i) => [e, servers[i].port]),
  ) as Record<MockEnvironmentName, number>;
  const baseUrls = Object.fromEntries(
    envs.map((e, i) => [e, servers[i].baseUrl]),
  ) as Record<MockEnvironmentName, string>;

  return {
    portMap,
    baseUrls,
    envVars: envVarsFor(envs, baseUrls),
    requestLedger: () =>
      servers.flatMap((server) =>
        server.requests.map((entry) => ({ ...entry })),
      ),
    clearRequestLedger: () => {
      for (const server of servers) {
        server.clearRequests();
      }
    },
    stop: async () => {
      await Promise.all(servers.map((server) => server.stop()));
    },
  };
}
