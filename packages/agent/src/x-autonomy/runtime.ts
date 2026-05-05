import {
  type IAgentRuntime,
  logger,
  ModelType,
  type Task,
  type TaskMetadata,
  type UUID,
  stringToUuid,
} from "@elizaos/core";
import {
  postToX,
  readXPosterCredentialsFromEnv,
} from "../lifeops/x-poster.js";
import {
  loadOwnerContactsConfig,
  resolveOwnerContactWithFallback,
} from "../config/owner-contacts.js";
import { resolveOwnerEntityId } from "../runtime/owner-entity.js";
import {
  hasRuntimeSendHandler,
  logMissingSendHandlerOnce,
} from "../services/send-handler-availability.js";

export const X_AUTONOMY_TASK_NAME = "X_AUTONOMY" as const;
export const X_AUTONOMY_TASK_TAGS = ["queue", "repeat", "x-autonomy"] as const;
export const X_AUTONOMY_TASK_INTERVAL_MS = 15 * 60 * 1000;

const DEFAULT_DRAFT_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_RUNTIME_POLL_MS = 60 * 1000;
const DEFAULT_RUNTIME_START_DELAY_MS = 60 * 1000;
const DEFAULT_DRAFT_COUNT = 2;
const DEFAULT_MAX_POSTS_PER_DAY = 3;
const MAX_QUEUE_ITEMS = 20;
const MAX_TWEET_CHARS = 280;
const activeRuntimeLoops = new WeakSet<object>();

type XAutonomyStatus = "drafted" | "posted" | "failed";

export type XAutonomyQueueItem = {
  id: string;
  text: string;
  status: XAutonomyStatus;
  source: string;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  url?: string;
  error?: string;
};

type XAutonomyMetadata = {
  xAutonomy?: {
    kind?: string;
    version?: number;
    lastDraftedAt?: string;
    lastSuggestionsSentAt?: string;
    lastPostedAt?: string;
    lastError?: string;
  };
  xQueue?: XAutonomyQueueItem[];
};

export type XDraftSuggestionsResult = {
  items: XAutonomyQueueItem[];
  taskId?: UUID;
  sentSuggestions: boolean;
};

type AutonomyServiceLike = {
  getAutonomousRoomId?: () => UUID;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

function getNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isXAutonomyTask(task: Task): boolean {
  const metadata = isRecord(task.metadata) ? task.metadata : null;
  const marker = metadata?.xAutonomy;
  return (
    task.name === X_AUTONOMY_TASK_NAME &&
    isRecord(marker) &&
    marker.kind === "runtime_runner"
  );
}

function readQueue(metadata: Record<string, unknown>): XAutonomyQueueItem[] {
  const queue = metadata.xQueue;
  if (!Array.isArray(queue)) return [];
  return queue
    .filter(isRecord)
    .map((item): XAutonomyQueueItem => ({
      id: String(item.id ?? ""),
      text: String(item.text ?? "").slice(0, MAX_TWEET_CHARS),
      status: (
        item.status === "posted" || item.status === "failed"
          ? item.status
          : "drafted"
      ) as XAutonomyStatus,
      source: String(item.source ?? "x-autonomy"),
      createdAt: String(item.createdAt ?? new Date().toISOString()),
      updatedAt: String(item.updatedAt ?? new Date().toISOString()),
      attempts: Number.isFinite(Number(item.attempts))
        ? Number(item.attempts)
        : 0,
      url: typeof item.url === "string" ? item.url : undefined,
      error: typeof item.error === "string" ? item.error : undefined,
    }))
    .filter((item) => item.id && item.text)
    .slice(0, MAX_QUEUE_ITEMS);
}

function buildXAutonomyMetadata(
  current: Record<string, unknown> | null = null,
): TaskMetadata {
  return {
    ...(current ?? {}),
    updateInterval: X_AUTONOMY_TASK_INTERVAL_MS,
    baseInterval: X_AUTONOMY_TASK_INTERVAL_MS,
    blocking: true,
    xAutonomy: {
      ...(isRecord(current?.xAutonomy) ? current.xAutonomy : {}),
      kind: "runtime_runner",
      version: 1,
    },
    xQueue: readQueue(current ?? {}),
  };
}

function shouldDraft(args: {
  metadata: Record<string, unknown>;
  now: Date;
}): boolean {
  if (!getBooleanEnv("BOTDICK_X_AUTONOMY_ENABLED", true)) return false;

  const marker = isRecord(args.metadata.xAutonomy)
    ? args.metadata.xAutonomy
    : {};
  const lastDraftedAt =
    typeof marker.lastDraftedAt === "string"
      ? Date.parse(marker.lastDraftedAt)
      : 0;
  if (!Number.isFinite(lastDraftedAt) || lastDraftedAt <= 0) return true;

  const interval = getNumberEnv(
    "BOTDICK_X_DRAFT_INTERVAL_MS",
    DEFAULT_DRAFT_INTERVAL_MS,
  );
  return args.now.getTime() - lastDraftedAt >= interval;
}

function getDraftCount(): number {
  return Math.max(
    1,
    Math.min(4, Math.floor(getNumberEnv("BOTDICK_X_DRAFT_COUNT", DEFAULT_DRAFT_COUNT))),
  );
}

function normalizeDraftCount(value?: number): number {
  if (!Number.isFinite(value) || !value) return getDraftCount();
  return Math.max(1, Math.min(4, Math.floor(value)));
}

function postedToday(queue: XAutonomyQueueItem[], now: Date): number {
  const day = now.toISOString().slice(0, 10);
  return queue.filter(
    (item) => item.status === "posted" && item.updatedAt.slice(0, 10) === day,
  ).length;
}

function shouldAutoPublish(queue: XAutonomyQueueItem[], now: Date): boolean {
  if (!getBooleanEnv("BOTDICK_X_AUTO_PUBLISH", false)) return false;
  const maxPosts = getNumberEnv(
    "BOTDICK_X_MAX_POSTS_PER_DAY",
    DEFAULT_MAX_POSTS_PER_DAY,
  );
  return postedToday(queue, now) < maxPosts;
}

function sanitizeTweetText(raw: unknown): string {
  const text = String(raw ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/^(tweet|post|draft)\s*[:\-]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= MAX_TWEET_CHARS) return text;
  return `${text.slice(0, MAX_TWEET_CHARS - 1).trimEnd()}…`;
}

function summarizeTask(task: Task): string {
  const tags = Array.isArray(task.tags) ? task.tags.join(",") : "";
  return [
    task.name,
    task.description,
    tags ? `tags=${tags}` : "",
  ]
    .filter(Boolean)
    .join(" | ")
    .slice(0, 240);
}

async function buildRecentContext(runtime: IAgentRuntime): Promise<string> {
  try {
    const tasks = await runtime.getTasks({ agentIds: [runtime.agentId] });
    const relevant = tasks
      .filter((task) => task.name !== X_AUTONOMY_TASK_NAME)
      .slice(0, 8)
      .map(summarizeTask)
      .filter(Boolean);
    if (relevant.length > 0) {
      return relevant.map((line) => `- ${line}`).join("\n");
    }
  } catch (error) {
    logger.warn(
      `[x-autonomy] Failed to read recent runtime tasks: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return "- botdick is online and maintaining the public agent loop.";
}

function parseDraftList(raw: unknown, count: number): string[] {
  const text = String(raw ?? "").trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map(sanitizeTweetText).filter(Boolean).slice(0, count);
    }
    if (isRecord(parsed) && Array.isArray(parsed.drafts)) {
      return parsed.drafts.map(sanitizeTweetText).filter(Boolean).slice(0, count);
    }
  } catch {
    // Plain text fallback below.
  }

  return text
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, ""))
    .map(sanitizeTweetText)
    .filter(Boolean)
    .slice(0, count);
}

async function draftTweets(runtime: IAgentRuntime, count: number): Promise<string[]> {
  const context = await buildRecentContext(runtime);
  const prompt = [
    `Draft ${count} original X post candidates for botdick.`,
    "Constraints:",
    "- Each candidate 220 characters or less.",
    "- Plain text only.",
    "- Return JSON only: an array of strings.",
    "- No hashtags unless the context clearly needs one.",
    "- The comedic taste references are dril, Sam Hyde, George Carlin, Nick Mullen, and similar abrasive internet/standup voices.",
    "- Use those references as inspiration for botdick's own original voice: absurd deadpan, sharp observational timing, anti-slop cynicism, and compact left-field punchlines.",
    "- Do not quote them, copy a known bit, or write as if you are one of them.",
    "- Sound like a concise agent shipping work, not a marketing account.",
    "- Do not mention private keys, tokens, raw logs, or hidden paths.",
    "- Do not use slurs or target protected classes.",
    "",
    "Recent runtime context:",
    context,
    "",
    "Return only the JSON array.",
  ].join("\n");

  try {
    const response = await runtime.useModel(ModelType.TEXT_SMALL, { prompt });
    const drafts = parseDraftList(response, count);
    if (drafts.length > 0) return drafts;
  } catch (error) {
    logger.warn(
      `[x-autonomy] Draft model failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return [
    "botdick is online, doing the useful part first, and leaving receipts when the work actually lands.",
    "agent status: alive. thoughts: suspicious. deployment logs: somehow more emotionally available than most people.",
  ].slice(0, count);
}

export async function createXDraftSuggestions(
  runtime: IAgentRuntime,
  options: {
    count?: number;
    source?: string;
    sendSuggestions?: boolean;
    now?: Date;
  } = {},
): Promise<XDraftSuggestionsResult> {
  const now = options.now ?? new Date();
  const createdAt = now.toISOString();
  const count = normalizeDraftCount(options.count);
  const drafts = await draftTweets(runtime, count);
  const items = drafts.map((text, index): XAutonomyQueueItem => ({
    id: `${now.getTime().toString(36)}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    status: "drafted",
    source: options.source ?? "x-autonomy-manual",
    createdAt,
    updatedAt: createdAt,
    attempts: 0,
  }));

  let taskId: UUID | undefined;
  let metadata: Record<string, unknown> = {};
  try {
    let tasks = await runtime.getTasks({
      agentIds: [runtime.agentId],
      tags: [...X_AUTONOMY_TASK_TAGS],
    });
    let task = tasks.find(isXAutonomyTask);
    if (!task?.id) {
      const ensuredTaskId = await ensureXAutonomyTask(runtime);
      tasks = await runtime.getTasks({
        agentIds: [runtime.agentId],
        tags: [...X_AUTONOMY_TASK_TAGS],
      });
      task = tasks.find((candidate) => candidate.id === ensuredTaskId) ?? tasks.find(isXAutonomyTask);
    }

    if (task?.id) {
      taskId = task.id;
      metadata = isRecord(task.metadata) ? task.metadata : {};
      const queue = [...items, ...readQueue(metadata)].slice(0, MAX_QUEUE_ITEMS);
      await runtime.updateTask(task.id, {
        metadata: {
          ...metadata,
          xQueue: queue,
          xAutonomy: {
            ...(isRecord(metadata.xAutonomy) ? metadata.xAutonomy : {}),
            kind: "runtime_runner",
            version: 1,
            lastDraftedAt: createdAt,
            lastSuggestionsSentAt: options.sendSuggestions
              ? createdAt
              : isRecord(metadata.xAutonomy)
                ? String(metadata.xAutonomy.lastSuggestionsSentAt ?? "")
                : "",
          },
        },
      });
    }
  } catch (error) {
    logger.warn(
      `[x-autonomy] Failed to persist manual X drafts: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const sentSuggestions = options.sendSuggestions === true
    ? await sendDraftSuggestions(runtime, items)
    : false;
  for (const item of items) {
    await mirrorXEvent(item);
  }

  return { items, taskId, sentSuggestions };
}

async function sendDraftSuggestions(
  runtime: IAgentRuntime,
  items: XAutonomyQueueItem[],
): Promise<boolean> {
  if (!getBooleanEnv("BOTDICK_X_SEND_SUGGESTIONS", true)) return false;
  if (items.length === 0) return false;

  const ownerEntityId = await resolveOwnerEntityId(runtime);
  if (!ownerEntityId) {
    logger.warn("[x-autonomy] No owner entity configured; cannot send X drafts");
    return false;
  }

  const ownerContacts = loadOwnerContactsConfig({
    boundary: "x_autonomy",
    operation: "owner_contacts_config",
    message:
      "[x-autonomy] Failed to load owner contacts config; X drafts cannot route to owner channels until config is available.",
  });
  const preferredSource =
    process.env.BOTDICK_X_SUGGESTION_TARGET_SOURCE?.trim() || "discord";
  const resolved =
    resolveOwnerContactWithFallback({
      ownerContacts,
      source: preferredSource,
      ownerEntityId,
    }) ??
    resolveOwnerContactWithFallback({
      ownerContacts,
      source: "client_chat",
      ownerEntityId,
    });

  if (!resolved) {
    logger.warn("[x-autonomy] No owner contact route for X draft suggestions");
    return false;
  }

  if (!hasRuntimeSendHandler(runtime, resolved.source)) {
    logMissingSendHandlerOnce("x-autonomy", resolved.source);
    return false;
  }

  const text = [
    "X drafts:",
    ...items.map((item, index) => `${index + 1}. ${item.text}`),
    "",
    "Reply with the one to post, or tell me what angle to mutate.",
  ].join("\n");

  await runtime.sendMessageToTarget(
    {
      source: resolved.source,
      entityId: resolved.contact.entityId as UUID | undefined,
      channelId: resolved.contact.channelId,
      roomId: resolved.contact.roomId as UUID | undefined,
    } as Parameters<typeof runtime.sendMessageToTarget>[0],
    { text, source: resolved.source },
  );

  return true;
}

async function mirrorXEvent(item: XAutonomyQueueItem): Promise<void> {
  if (!getBooleanEnv("BOTDICK_HOMEPAGE_MIRROR", true)) return;

  const endpoint =
    process.env.BOTDICK_HOMEPAGE_EVENTS_URL?.trim() ||
    "https://botdick.com/api/events";
  const token = process.env.BOTDICK_INGEST_TOKEN?.trim();

  try {
    await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        id: `x-${item.id}`,
        type: "x_view",
        station: "publish",
        title: item.status === "posted" ? "Posted to X" : "X draft queued",
        body: item.text,
        url: item.url || "https://x.com/bot_dick_",
        status: item.status,
        createdAt: item.updatedAt,
        meta: {
          source: item.source,
          attempts: item.attempts,
          error: item.error,
        },
      }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch (error) {
    logger.warn(
      `[x-autonomy] Homepage mirror failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function maybePublishDraft(
  item: XAutonomyQueueItem,
  queue: XAutonomyQueueItem[],
  now: Date,
): Promise<XAutonomyQueueItem> {
  if (!shouldAutoPublish(queue, now)) return item;

  const credentials = readXPosterCredentialsFromEnv(process.env);
  if (!credentials) {
    return {
      ...item,
      updatedAt: now.toISOString(),
      error:
        "TWITTER_* credentials missing; draft kept queued until API posting is configured.",
    };
  }

  const result = await postToX({ text: item.text, credentials });
  if (!result.ok) {
    return {
      ...item,
      status: "failed",
      attempts: item.attempts + 1,
      updatedAt: now.toISOString(),
      error: result.error || result.category,
    };
  }

  return {
    ...item,
    status: "posted",
    attempts: item.attempts + 1,
    updatedAt: now.toISOString(),
    url: result.postId
      ? `https://x.com/i/web/status/${result.postId}`
      : "https://x.com/bot_dick_",
    error: undefined,
  };
}

export async function executeXAutonomyTask(
  runtime: IAgentRuntime,
): Promise<{ nextInterval: number }> {
  const now = new Date();

  try {
    const tasks = await runtime.getTasks({
      agentIds: [runtime.agentId],
      tags: [...X_AUTONOMY_TASK_TAGS],
    });
    const task = tasks.find(isXAutonomyTask);
    if (!task?.id) {
      return { nextInterval: X_AUTONOMY_TASK_INTERVAL_MS };
    }

    const metadata = isRecord(task.metadata) ? task.metadata : {};
    let queue = readQueue(metadata);
    let changed = false;

    let sentSuggestions = false;
    if (shouldDraft({ metadata, now })) {
      const createdAt = now.toISOString();
      const drafts = await draftTweets(runtime, getDraftCount());
      const items = drafts.map((text, index): XAutonomyQueueItem => ({
        id: `${now.getTime().toString(36)}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        text,
        status: "drafted",
        source: "x-autonomy",
        createdAt,
        updatedAt: createdAt,
        attempts: 0,
      }));
      queue = [...items, ...queue].slice(0, MAX_QUEUE_ITEMS);
      changed = true;
      sentSuggestions = await sendDraftSuggestions(runtime, items);
      for (const item of items) {
        await mirrorXEvent(item);
      }
    }

    const draft = queue.find((item) => item.status === "drafted");
    if (draft) {
      const published = await maybePublishDraft(draft, queue, now);
      if (published !== draft) {
        queue = queue.map((item) => (item.id === draft.id ? published : item));
        changed = true;
        await mirrorXEvent(published);
      }
    }

    if (changed) {
      const lastDrafted = queue.find((item) => item.source === "x-autonomy");
      const lastPosted = queue.find((item) => item.status === "posted");
      const lastError = queue.find((item) => item.error)?.error;
      await runtime.updateTask(task.id, {
        metadata: {
          ...metadata,
          xQueue: queue,
          xAutonomy: {
            ...(isRecord(metadata.xAutonomy) ? metadata.xAutonomy : {}),
            kind: "runtime_runner",
            version: 1,
            lastDraftedAt:
              lastDrafted?.createdAt ??
              (isRecord(metadata.xAutonomy)
                ? String(metadata.xAutonomy.lastDraftedAt ?? "")
                : ""),
            lastSuggestionsSentAt: sentSuggestions
              ? now.toISOString()
              : isRecord(metadata.xAutonomy)
                ? String(metadata.xAutonomy.lastSuggestionsSentAt ?? "")
                : "",
            lastPostedAt:
              lastPosted?.updatedAt ??
              (isRecord(metadata.xAutonomy)
                ? String(metadata.xAutonomy.lastPostedAt ?? "")
                : ""),
            lastError,
          },
        },
      });
    }
  } catch (error) {
    logger.error(
      `[x-autonomy] Worker error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return { nextInterval: X_AUTONOMY_TASK_INTERVAL_MS };
}

export function registerXAutonomyTaskWorker(runtime: IAgentRuntime): void {
  if (runtime.getTaskWorker(X_AUTONOMY_TASK_NAME)) {
    return;
  }
  runtime.registerTaskWorker({
    name: X_AUTONOMY_TASK_NAME,
    shouldRun: async () => true,
    execute: (rt) => executeXAutonomyTask(rt),
  });
}

async function runXAutonomyRuntimeLoop(runtime: IAgentRuntime): Promise<void> {
  if (!getBooleanEnv("BOTDICK_X_AUTONOMY_ENABLED", true)) return;

  try {
    await ensureXAutonomyTask(runtime);
    await executeXAutonomyTask(runtime);
  } catch (error) {
    logger.error(
      `[x-autonomy] Runtime loop error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function startXAutonomyRuntimeLoop(runtime: IAgentRuntime): void {
  const runtimeKey = runtime as unknown as object;
  if (activeRuntimeLoops.has(runtimeKey)) {
    return;
  }
  activeRuntimeLoops.add(runtimeKey);

  const startDelay = getNumberEnv(
    "BOTDICK_X_RUNTIME_START_DELAY_MS",
    DEFAULT_RUNTIME_START_DELAY_MS,
  );
  const pollInterval = getNumberEnv(
    "BOTDICK_X_RUNTIME_POLL_MS",
    DEFAULT_RUNTIME_POLL_MS,
  );

  const firstRun = setTimeout(() => {
    void runXAutonomyRuntimeLoop(runtime);
  }, startDelay);
  firstRun.unref?.();

  const interval = setInterval(() => {
    void runXAutonomyRuntimeLoop(runtime);
  }, pollInterval);
  interval.unref?.();

  logger.info(
    `[x-autonomy] Runtime loop armed: firstRun=${startDelay}ms poll=${pollInterval}ms draftInterval=${getNumberEnv(
      "BOTDICK_X_DRAFT_INTERVAL_MS",
      DEFAULT_DRAFT_INTERVAL_MS,
    )}ms`,
  );
}

export async function ensureXAutonomyTask(
  runtime: IAgentRuntime,
): Promise<UUID> {
  const tasks = await runtime.getTasks({
    agentIds: [runtime.agentId],
    tags: [...X_AUTONOMY_TASK_TAGS],
  });
  const existing = tasks.find(isXAutonomyTask);
  const metadata = buildXAutonomyMetadata(
    isRecord(existing?.metadata) ? existing.metadata : null,
  );

  if (existing?.id) {
    await runtime.updateTask(existing.id, {
      description: "Autonomous X drafts and optional posting for botdick",
      metadata,
    });
    return existing.id;
  }

  const autonomy = runtime.getService("AUTONOMY") as AutonomyServiceLike | null;
  const roomId =
    autonomy?.getAutonomousRoomId?.() ??
    stringToUuid(`x-autonomy-room-${runtime.agentId}`);

  return runtime.createTask({
    name: X_AUTONOMY_TASK_NAME,
    description: "Autonomous X drafts and optional posting for botdick",
    roomId,
    tags: [...X_AUTONOMY_TASK_TAGS],
    metadata,
    dueAt: Date.now(),
  });
}
