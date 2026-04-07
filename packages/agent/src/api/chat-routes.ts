/**
 * Chat route handlers extracted from server.ts.
 *
 * Handles:
 *   POST /v1/chat/completions   – OpenAI-compatible
 *   POST /v1/messages           – Anthropic-compatible
 *   GET  /v1/models             – OpenAI model listing
 *   GET  /v1/models/:id         – OpenAI single model
 *
 * Also exports generateChatResponse() and supporting helpers so that
 * conversation-routes.ts (and server.ts itself) can reuse them.
 */

import crypto from "node:crypto";
import type http from "node:http";
import {
  type AgentRuntime,
  ChannelType,
  type Content,
  createMessageMemory,
  logger,
  ModelType,
  stringToUuid,
  type UUID,
} from "@elizaos/core";
import {
  getSelfControlStatus,
  hasWebsiteBlockDeferralIntent,
  hasWebsiteBlockIntent,
} from "@miladyai/plugin-selfcontrol/selfcontrol";
import type { ElizaConfig } from "../config/config.js";
import { normalizeCharacterLanguage } from "../onboarding-presets.js";
import { withMiladyTrajectoryStep } from "../runtime/trajectory-step-context.js";
import { detectRuntimeModel } from "./agent-model.js";
import {
  isClientVisibleNoResponse,
  isNoResponsePlaceholder,
  stripAssistantStageDirections,
} from "./chat-text-helpers.js";
import {
  extractAnthropicSystemAndLastUser,
  extractCompatTextContent,
  extractOpenAiSystemAndLastUser,
  resolveCompatRoomKey,
} from "./compat-utils.js";
import {
  isInsufficientCreditsError,
  isInsufficientCreditsMessage,
} from "./credit-detection.js";
import type { ReadJsonBodyOptions } from "./http-helpers.js";
import type { RouteRequestContext } from "./route-helpers.js";
import {
  buildWalletActionNotExecutedReply,
  cloneWithoutBlockedObjectKeys,
  decodePathComponent,
  executeFallbackParsedActions,
  getErrorMessage,
  hasBlockedObjectKeyDeep,
  hasUsableWalletFallbackParams,
  inferBalanceChainFromText,
  inferWalletExecutionFallback,
  isBalanceIntent,
  isUuidLike,
  isWalletActionRequiredIntent,
  maybeAugmentChatMessageWithKnowledge,
  maybeAugmentChatMessageWithLanguage,
  maybeAugmentChatMessageWithWalletContext,
  // Deep dependencies of generateChatResponse that stay in server.ts
  maybeHandleDirectBinanceSkillRequest,
  normalizeIncomingChatPrompt,
  parseFallbackActionBlocks,
  resolveAppUserName,
  resolvePluginConfigReply,
  resolveWalletModeGuidanceReply,
  shouldForceCheckBalanceFallback,
  trimWalletProgressPrefix,
  validateChatImages,
  WALLET_EXECUTION_INTENT_RE,
  WALLET_PROGRESS_ONLY_RE,
} from "./server.js";
import { resolveStreamingUpdate } from "./streaming-text.js";

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB
const CHAT_MAX_BODY_BYTES = 20 * 1024 * 1024; // 20 MB (image-capable)

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface ChatGenerationResult {
  text: string;
  agentName: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    model?: string;
  };
}

export interface ChatGenerateOptions {
  onChunk?: (chunk: string) => void;
  onSnapshot?: (text: string) => void;
  isAborted?: () => boolean;
  resolveNoResponseText?: () => string;
  preferredLanguage?: string;
}

export interface LogEntry {
  timestamp: number;
  level: string;
  message: string;
  source: string;
  tags: string[];
}

export interface ChatImageAttachment {
  /** Base64-encoded image data (no data URL prefix). */
  data: string;
  mimeType: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Chat failure / no-response helpers
// ---------------------------------------------------------------------------

const PROVIDER_ISSUE_CHAT_REPLY = "Sorry, I'm having a provider issue";
const INSUFFICIENT_CREDITS_CHAT_REPLY =
  "Eliza Cloud credits are depleted. Top up the cloud balance and try again.";
const GENERIC_NO_RESPONSE_CHAT_REPLY = PROVIDER_ISSUE_CHAT_REPLY;
const WEBSITE_BLOCK_SUBJECT_RE =
  /\b(websites?|sites?|domains?|x\.com|twitter\.com)\b/i;
const WEBSITE_BLOCK_FOLLOW_UP_RE =
  /\b(do it|do that|block it|block them|go ahead|use self ?control|self ?control now|block the websites?|please do|now)\b/i;
const WEBSITE_BLOCK_PERMISSION_RE =
  /\b(permission|permissions|approval|approve|access|admin|administrator|root|sudo|allow|grant|enable)\b/i;
const WEBSITE_BLOCK_PERMISSION_MODEL_RE =
  /\b(permission|approval|approve|access|admin|administrator|root|sudo)\b/i;
const NON_EXECUTABLE_FALLBACK_ACTIONS = new Set(["REPLY", "NONE", "IGNORE"]);

function isExecutableFallbackAction(action: { name: string }): boolean {
  return !NON_EXECUTABLE_FALLBACK_ACTIONS.has(action.name);
}

function hasWebsiteBlockingPermissionIntent(text: string): boolean {
  return (
    WEBSITE_BLOCK_PERMISSION_RE.test(text) &&
    /\b(block(?:ing)?|self ?control|hosts? file|websites?)\b/i.test(text)
  );
}

function pickInsufficientCreditsChatReply(): string {
  return INSUFFICIENT_CREDITS_CHAT_REPLY;
}

function findRecentInsufficientCreditsLog(
  logBuffer: LogEntry[],
  lookbackMs = 60_000,
): LogEntry | null {
  const now = Date.now();
  for (let i = logBuffer.length - 1; i >= 0; i--) {
    const entry = logBuffer[i];
    if (now - entry.timestamp > lookbackMs) break;
    if (isInsufficientCreditsMessage(entry.message)) {
      return entry;
    }
  }
  return null;
}

export function resolveNoResponseFallback(
  logBuffer: LogEntry[],
  _runtime?: AgentRuntime | null,
  _lang = "en",
): string {
  if (findRecentInsufficientCreditsLog(logBuffer)) {
    return pickInsufficientCreditsChatReply();
  }
  return GENERIC_NO_RESPONSE_CHAT_REPLY;
}

function getProviderIssueChatReply(): string {
  return PROVIDER_ISSUE_CHAT_REPLY;
}

export function getChatFailureReply(
  err: unknown,
  logBuffer: LogEntry[],
): string {
  if (
    isInsufficientCreditsError(err) ||
    findRecentInsufficientCreditsLog(logBuffer)
  ) {
    return pickInsufficientCreditsChatReply();
  }
  return getProviderIssueChatReply();
}

export function normalizeChatResponseText(
  text: string,
  logBuffer: LogEntry[],
  runtime?: AgentRuntime | null,
): string {
  if (
    text.trim() === PROVIDER_ISSUE_CHAT_REPLY &&
    findRecentInsufficientCreditsLog(logBuffer)
  ) {
    return pickInsufficientCreditsChatReply();
  }
  if (!isClientVisibleNoResponse(text)) return text;
  return resolveNoResponseFallback(logBuffer, runtime);
}

function inferWebsiteBlockFallback(
  userText: string,
  modelText: string,
): {
  name: "BLOCK_WEBSITES";
} | null {
  if (hasWebsiteBlockDeferralIntent(userText)) {
    return null;
  }

  const userHasBlockIntent = hasWebsiteBlockIntent(userText);
  const modelLooksLikeBlockConfirmation =
    /\b(blocking|block|self ?control)\b/i.test(modelText);
  const userHasPermissionIntent = hasWebsiteBlockingPermissionIntent(userText);

  if (userHasPermissionIntent) {
    return null;
  }

  const userLooksLikeBlockIntent =
    userHasBlockIntent &&
    (WEBSITE_BLOCK_SUBJECT_RE.test(userText) ||
      /\b(it|them)\b/i.test(userText));
  if (userLooksLikeBlockIntent) {
    return { name: "BLOCK_WEBSITES" };
  }

  if (
    modelLooksLikeBlockConfirmation &&
    WEBSITE_BLOCK_FOLLOW_UP_RE.test(userText)
  ) {
    return { name: "BLOCK_WEBSITES" };
  }

  return null;
}

function inferWebsiteBlockingPermissionFallback(
  userText: string,
  modelText: string,
): {
  name: "REQUEST_WEBSITE_BLOCKING_PERMISSION";
} | null {
  const userHasPermissionIntent = hasWebsiteBlockingPermissionIntent(userText);
  if (userHasPermissionIntent) {
    return { name: "REQUEST_WEBSITE_BLOCKING_PERMISSION" };
  }

  const modelLooksLikePermissionConfirmation =
    WEBSITE_BLOCK_PERMISSION_MODEL_RE.test(modelText) &&
    /\b(ask|request|grant|enable|allow|approve|get)\b/i.test(modelText);
  if (
    modelLooksLikePermissionConfirmation &&
    WEBSITE_BLOCK_FOLLOW_UP_RE.test(userText)
  ) {
    return { name: "REQUEST_WEBSITE_BLOCKING_PERMISSION" };
  }

  return null;
}

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

export function initSse(res: http.ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
}

export function writeSse(
  res: http.ServerResponse,
  payload: Record<string, string | number | boolean | null | undefined>,
): void {
  if (res.writableEnded || res.destroyed) return;
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function writeChatTokenSse(
  res: http.ServerResponse,
  text: string,
  fullText: string,
): void {
  writeSse(res, { type: "token", text, fullText });
}

export function writeSseData(
  res: http.ServerResponse,
  data: string,
  event?: string,
): void {
  if (res.writableEnded || res.destroyed) return;
  if (event) res.write(`event: ${event}\n`);
  res.write(`data: ${data}\n\n`);
}

export function writeSseJson(
  res: http.ServerResponse,
  payload: unknown,
  event?: string,
): void {
  writeSseData(res, JSON.stringify(payload), event);
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function isDuplicateMemoryError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("duplicate") ||
    msg.includes("already exists") ||
    msg.includes("unique constraint")
  );
}

export async function persistConversationMemory(
  runtime: AgentRuntime,
  memory: ReturnType<typeof createMessageMemory>,
): Promise<void> {
  try {
    await runtime.createMemory(memory, "messages");
  } catch (err) {
    if (isDuplicateMemoryError(err)) return;
    throw err;
  }
}

async function hasRecentAssistantMemory(
  runtime: AgentRuntime,
  roomId: UUID,
  text: string,
  sinceMs: number,
): Promise<boolean> {
  const trimmed = text.trim();
  if (!trimmed) return false;

  try {
    const recent = await runtime.getMemories({
      roomId,
      tableName: "messages",
      count: 12,
    });

    return recent.some((memory) => {
      const contentText = (memory.content as { text?: string })?.text?.trim();
      const createdAt = memory.createdAt ?? 0;
      return (
        memory.entityId === runtime.agentId &&
        contentText === trimmed &&
        createdAt >= sinceMs - 2000
      );
    });
  } catch {
    return false;
  }
}

export async function persistAssistantConversationMemory(
  runtime: AgentRuntime,
  roomId: UUID,
  text: string,
  channelType: ChannelType,
  dedupeSinceMs?: number,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  if (typeof dedupeSinceMs === "number") {
    const alreadyPersisted = await hasRecentAssistantMemory(
      runtime,
      roomId,
      trimmed,
      dedupeSinceMs,
    );
    if (alreadyPersisted) return;
  }

  await persistConversationMemory(
    runtime,
    createMessageMemory({
      id: crypto.randomUUID() as UUID,
      entityId: runtime.agentId,
      agentId: runtime.agentId,
      roomId,
      content: {
        text: trimmed,
        source: "client_chat",
        channelType,
      },
    }),
  );
}

// ---------------------------------------------------------------------------
// Chat request parsing
// ---------------------------------------------------------------------------

const VALID_CHANNEL_TYPES = new Set<string>(Object.values(ChannelType));
const VALID_CONVERSATION_MODES = new Set(["simple", "power"]);

function parseRequestChannelType(
  value: unknown,
  fallback: ChannelType = ChannelType.DM,
): ChannelType | null {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  if (!VALID_CHANNEL_TYPES.has(normalized)) {
    return null;
  }
  return normalized as ChannelType;
}

function parseConversationMode(
  value: unknown,
): "simple" | "power" | undefined | null {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!VALID_CONVERSATION_MODES.has(normalized)) {
    return null;
  }
  return normalized as "simple" | "power";
}

function readUiLanguageHeader(
  req: http.IncomingMessage | undefined,
): string | undefined {
  if (!req) {
    return undefined;
  }
  const header =
    req.headers["x-milady-ui-language"] ?? req.headers["x-eliza-ui-language"];
  if (Array.isArray(header)) {
    return header.find((value) => value.trim())?.trim();
  }
  return typeof header === "string" && header.trim()
    ? header.trim()
    : undefined;
}

export async function readChatRequestPayload(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  helpers: {
    readJsonBody: <T extends object>(
      req: http.IncomingMessage,
      res: http.ServerResponse,
      options?: ReadJsonBodyOptions,
    ) => Promise<T | null>;
    error: (res: http.ServerResponse, message: string, status?: number) => void;
  },
  /** Body size limit. Image-capable endpoints pass CHAT_MAX_BODY_BYTES (20 MB);
   *  legacy/cloud-proxy endpoints that don't process images pass MAX_BODY_BYTES (1 MB). */
  maxBytes = CHAT_MAX_BODY_BYTES,
): Promise<{
  prompt: string;
  channelType: ChannelType;
  images?: ChatImageAttachment[];
  conversationMode?: "simple" | "power";
  preferredLanguage?: string;
  metadata?: Record<string, unknown>;
} | null> {
  const body = await helpers.readJsonBody<{
    text?: string;
    channelType?: string;
    images?: ChatImageAttachment[];
    conversationMode?: string;
    language?: string;
    metadata?: Record<string, unknown>;
  }>(req, res, { maxBytes });
  if (!body) return null;
  const normalizedPrompt = normalizeIncomingChatPrompt(body.text, body.images);
  if (!normalizedPrompt) {
    helpers.error(res, "text is required");
    return null;
  }
  const channelType = parseRequestChannelType(body.channelType, ChannelType.DM);
  if (!channelType) {
    helpers.error(res, "channelType is invalid", 400);
    return null;
  }
  const conversationMode = parseConversationMode(body.conversationMode);
  if (conversationMode === null) {
    helpers.error(res, "conversationMode is invalid", 400);
    return null;
  }
  const imageValidationError = validateChatImages(body.images);
  if (imageValidationError) {
    helpers.error(res, imageValidationError, 400);
    return null;
  }
  const images = Array.isArray(body.images)
    ? (body.images as ChatImageAttachment[]).map((img) => ({
        ...img,
        mimeType: img.mimeType.toLowerCase(),
      }))
    : undefined;
  const rawPreferredLanguage =
    (typeof body.language === "string" && body.language.trim()
      ? body.language
      : undefined) ?? readUiLanguageHeader(req);
  const preferredLanguage = rawPreferredLanguage
    ? normalizeCharacterLanguage(rawPreferredLanguage)
    : undefined;
  const metadata =
    body.metadata &&
    typeof body.metadata === "object" &&
    !Array.isArray(body.metadata)
      ? body.metadata
      : undefined;
  return {
    prompt: normalizedPrompt,
    channelType,
    images,
    ...(conversationMode ? { conversationMode } : {}),
    ...(preferredLanguage ? { preferredLanguage } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

type ChatTrajectoryLogger = {
  isEnabled?: () => boolean;
  setEnabled?: (enabled: boolean) => void;
  startTrajectory?: (
    stepIdOrAgentId: string,
    options?: {
      source?: string;
      metadata?: Record<string, unknown>;
    },
  ) => Promise<string>;
  startStep?: (
    trajectoryId: string,
    envState?: Record<string, unknown>,
  ) => string;
};

function getMessageMetadata(
  message: ReturnType<typeof createMessageMemory>,
): Record<string, unknown> {
  if (!message.metadata || typeof message.metadata !== "object") {
    message.metadata = { type: "message" };
  }
  return message.metadata as Record<string, unknown>;
}

function readMessageTrajectoryStepId(
  message: ReturnType<typeof createMessageMemory>,
): string | null {
  const metadata = message.metadata;
  if (!metadata || typeof metadata !== "object") return null;
  const stepId = (metadata as Record<string, unknown>).trajectoryStepId;
  return typeof stepId === "string" && stepId.trim().length > 0
    ? stepId.trim()
    : null;
}

async function ensureChatTrajectoryStep(
  runtime: AgentRuntime,
  message: ReturnType<typeof createMessageMemory>,
  source: string,
): Promise<void> {
  if (readMessageTrajectoryStepId(message)) return;

  const trajectoryLogger = runtime.getService?.(
    "trajectory_logger",
  ) as ChatTrajectoryLogger | null;
  if (
    !trajectoryLogger ||
    typeof trajectoryLogger.startTrajectory !== "function"
  ) {
    return;
  }

  try {
    if (
      typeof trajectoryLogger.isEnabled === "function" &&
      !trajectoryLogger.isEnabled() &&
      typeof trajectoryLogger.setEnabled === "function"
    ) {
      trajectoryLogger.setEnabled(true);
    }

    const metadata = getMessageMetadata(message);
    const content = message.content as Content & {
      channelType?: unknown;
    };
    const trajectoryId = await trajectoryLogger.startTrajectory(
      runtime.agentId,
      {
        source,
        metadata: {
          roomId: message.roomId,
          entityId: message.entityId,
          messageId: message.id,
          channelType: metadata.channelType ?? content.channelType,
          conversationId: metadata.sessionKey,
        },
      },
    );

    const stepId =
      typeof trajectoryLogger.startStep === "function"
        ? trajectoryLogger.startStep(trajectoryId, {
            timestamp: Date.now(),
            agentBalance: 0,
            agentPoints: 0,
            agentPnL: 0,
            openPositions: 0,
          })
        : trajectoryId;

    if (typeof stepId === "string" && stepId.trim().length > 0) {
      metadata.trajectoryStepId = stepId;
      runtime.logger?.warn(
        {
          src: "eliza-api",
          messageId: message.id,
          roomId: message.roomId,
          trajectoryId,
          trajectoryStepId: stepId,
        },
        "[eliza-api] Trajectory logger fallback started a chat trajectory after MESSAGE_RECEIVED did not inject a step id",
      );
    }
  } catch (err) {
    runtime.logger?.warn(
      {
        err,
        src: "eliza-api",
        messageId: message.id,
        roomId: message.roomId,
      },
      "Failed to start fallback trajectory logging for chat request",
    );
  }
}

// ---------------------------------------------------------------------------
// generateChatResponse
// ---------------------------------------------------------------------------

export async function generateChatResponse(
  runtime: AgentRuntime,
  message: ReturnType<typeof createMessageMemory>,
  agentName: string,
  opts?: ChatGenerateOptions,
): Promise<ChatGenerationResult> {
  const originalUserText = String(
    extractCompatTextContent(message.content) ?? "",
  );
  type StreamSource = "unset" | "callback" | "onStreamChunk";
  let responseText = "";
  let forcedWalletExecutionText = false;
  let activeStreamSource: StreamSource = "unset";
  // Snapshot of `responseText` at the moment the first action callback runs.
  // WHY: LLM streaming genuinely appends token deltas. Action handlers that
  // call HandlerCallback multiple times (Discord "progressive message" pattern)
  // send unrelated status strings — merging them with mergeStreamingText would
  // concatenate ("🔍…" + "✨…" + "Now playing…"). We preserve the streamed
  // prefix and replace only the callback suffix so the dashboard SSE client
  // gets snapshot fullText updates (same UX as editing one chat bubble).
  let preCallbackText: string | null = null;
  const messageSource =
    typeof message.content.source === "string" &&
    message.content.source.trim().length > 0
      ? message.content.source
      : "api";
  const emitChunk = (chunk: string): void => {
    if (!chunk) return;
    responseText += chunk;
    opts?.onChunk?.(chunk);
  };
  const emitSnapshot = (text: string): void => {
    if (!text) return;
    responseText = text;
    opts?.onSnapshot?.(text);
  };
  const claimStreamSource = (
    source: Exclude<StreamSource, "unset">,
  ): boolean => {
    if (activeStreamSource === "unset") {
      activeStreamSource = source;
      return true;
    }
    return activeStreamSource === source;
  };
  const appendIncomingText = (incoming: string): void => {
    const update = resolveStreamingUpdate(responseText, incoming);
    if (update.kind === "noop") return;
    if (update.kind === "append") {
      emitChunk(update.emittedText);
      return;
    }
    emitSnapshot(update.nextText);
  };
  /** Latest action callback wins: replaces prior callback text, keeps LLM prefix. */
  const replaceCallbackText = (incoming: string): void => {
    if (preCallbackText === null) {
      preCallbackText = responseText;
    }
    const separator = preCallbackText.length > 0 ? "\n\n" : "";
    const nextText = `${preCallbackText}${separator}${incoming}`;
    emitSnapshot(nextText);
  };

  // Emit inbound events so trajectory/session hooks run for API chat.
  try {
    if (typeof runtime.emitEvent === "function") {
      await runtime.emitEvent("MESSAGE_RECEIVED", {
        message,
        source: messageSource,
      });
    }
  } catch (err) {
    runtime.logger?.warn(
      {
        err,
        src: "eliza-api",
        messageId: message.id,
        roomId: message.roomId,
      },
      "Failed to emit MESSAGE_RECEIVED event",
    );
  }

  await ensureChatTrajectoryStep(runtime, message, messageSource);

  let result:
    | Awaited<
        ReturnType<NonNullable<AgentRuntime["messageService"]>["handleMessage"]>
      >
    | undefined;
  let actionCallbacksSeen = 0;
  const seenActionTags = new Set<string>();
  let _handlerError: unknown = null;
  const recordActionCallback = (actionTag: string, hasText: boolean): void => {
    actionCallbacksSeen += 1;
    seenActionTags.add(actionTag.toUpperCase());
    runtime.logger?.info(
      {
        src: "eliza-api",
        action: actionTag,
        hasText,
      },
      `[eliza-api] Action callback fired: ${actionTag}`,
    );
  };
  const directWalletExecutionFallback = WALLET_EXECUTION_INTENT_RE.test(
    originalUserText,
  )
    ? inferWalletExecutionFallback(originalUserText)
    : null;
  try {
    // Binance skill direct dispatch
    const directSkillText = await maybeHandleDirectBinanceSkillRequest(
      runtime,
      message,
      replaceCallbackText,
      emitSnapshot,
    );
    if (directSkillText) {
      const finalText = isClientVisibleNoResponse(directSkillText)
        ? directSkillText || "(no response)"
        : directSkillText;
      const promptText = extractCompatTextContent(message.content) ?? "";
      const estPromptTokens = Math.ceil(promptText.length / 4);
      const estCompletionTokens = Math.ceil(finalText.length / 4);
      return {
        text: finalText,
        agentName,
        usage: {
          promptTokens: estPromptTokens,
          completionTokens: estCompletionTokens,
          totalTokens: estPromptTokens + estCompletionTokens,
        },
      };
    }

    // Direct dispatch for explicit task creation intent from UI
    const contentMetadata = message.content.metadata as
      | Record<string, unknown>
      | undefined;
    if (contentMetadata?.intent === "create_task") {
      const coordinator = runtime.getService("SWARM_COORDINATOR");
      if (coordinator) {
        const createTaskAction = runtime.actions.find(
          (a) => a?.name?.toUpperCase() === "CREATE_TASK",
        );
        if (createTaskAction) {
          runtime.logger?.info(
            {
              src: "eliza-api",
              agentType: contentMetadata.agentType,
              intent: "create_task",
            },
            "[eliza-api] Direct dispatch CREATE_TASK from UI intent",
          );
          let actionResponseText = "";
          await createTaskAction.handler(
            runtime,
            message,
            undefined,
            {},
            async (content: Content) => {
              const chunk = extractCompatTextContent(content);
              if (chunk) {
                replaceCallbackText(chunk);
                actionResponseText = responseText;
              }
              return [];
            },
          );
          const finalText =
            actionResponseText || responseText || "Task created.";
          const promptText = originalUserText;
          const estPromptTokens = Math.ceil(promptText.length / 4);
          const estCompletionTokens = Math.ceil(finalText.length / 4);
          return {
            text: finalText,
            agentName,
            usage: {
              promptTokens: estPromptTokens,
              completionTokens: estCompletionTokens,
              totalTokens: estPromptTokens + estCompletionTokens,
            },
          };
        }
      }
      // Fall through to normal LLM-based routing if coordinator not available
    }

    if (directWalletExecutionFallback?.errorText) {
      forcedWalletExecutionText = true;
      responseText = directWalletExecutionFallback.errorText;
      result = {
        didRespond: true,
        responseContent: { text: directWalletExecutionFallback.errorText },
        responseMessages: [],
      };
    } else if (directWalletExecutionFallback?.action) {
      runtime.logger?.info(
        {
          src: "eliza-api",
          action: directWalletExecutionFallback.action.name,
          parameters: directWalletExecutionFallback.action.parameters,
        },
        "[eliza-api] Direct wallet execution dispatch from prompt intent",
      );
      await executeFallbackParsedActions(
        runtime,
        message,
        [directWalletExecutionFallback.action],
        appendIncomingText,
        recordActionCallback,
        {
          getCurrentText: () => responseText,
          onCallbackText: replaceCallbackText,
        },
      );
      result = {
        didRespond: true,
        responseContent: { text: responseText },
        responseMessages: [],
      };
    } else {
      const languageAugmentedMessage = maybeAugmentChatMessageWithLanguage(
        message,
        opts?.preferredLanguage,
      );
      const walletAugmentedMessage = maybeAugmentChatMessageWithWalletContext(
        runtime,
        languageAugmentedMessage,
      );
      const generationMessage = await maybeAugmentChatMessageWithKnowledge(
        runtime,
        walletAugmentedMessage,
      );
      const trajectoryStepId =
        readMessageTrajectoryStepId(generationMessage) ??
        readMessageTrajectoryStepId(message);
      result = await withMiladyTrajectoryStep(trajectoryStepId, () =>
        runtime.messageService?.handleMessage(
          runtime,
          generationMessage,
          async (content: Content) => {
            if (opts?.isAborted?.()) {
              throw new Error("client_disconnected");
            }

            const actionTag = (content as Record<string, unknown>)?.action;
            if (typeof actionTag === "string" && actionTag.length > 0) {
              recordActionCallback(
                actionTag,
                Boolean(extractCompatTextContent(content)),
              );
            }

            const chunk = extractCompatTextContent(content);
            if (!chunk) return [];
            if (!claimStreamSource("callback")) return [];
            replaceCallbackText(chunk);
            return [];
          },
          {
            onStreamChunk: opts?.onChunk
              ? async (chunk: string) => {
                  if (opts?.isAborted?.()) {
                    throw new Error("client_disconnected");
                  }
                  if (!chunk) return;
                  if (!claimStreamSource("onStreamChunk")) return;
                  appendIncomingText(chunk);
                }
              : undefined,
          },
        ),
      );
    }

    // Ensure MESSAGE_SENT hooks run for API chat flows.
    try {
      const responseMessages = Array.isArray(result?.responseMessages)
        ? (result.responseMessages as Array<{ id?: string; content?: Content }>)
        : [];
      const fallbackResponseContent =
        result?.responseContent && typeof result.responseContent === "object"
          ? (result.responseContent as Content)
          : responseText
            ? ({ text: responseText } as Content)
            : null;
      const messagesToEmit =
        responseMessages.length > 0
          ? responseMessages
          : fallbackResponseContent
            ? [{ id: crypto.randomUUID(), content: fallbackResponseContent }]
            : [];
      if (
        messagesToEmit.length > 0 &&
        typeof runtime.emitEvent === "function"
      ) {
        for (const responseMessage of messagesToEmit) {
          const memoryLike = {
            id: responseMessage.id ?? crypto.randomUUID(),
            roomId: message.roomId,
            entityId: runtime.agentId,
            content: responseMessage.content ?? { text: "" },
            metadata: message.metadata,
          } as unknown as ReturnType<typeof createMessageMemory>;
          await runtime.emitEvent("MESSAGE_SENT", {
            message: memoryLike,
            source: messageSource,
          });
        }
      }
    } catch (err) {
      runtime.logger?.warn(
        {
          err,
          src: "eliza-api",
          messageId: message.id,
          roomId: message.roomId,
        },
        "Failed to emit MESSAGE_SENT event",
      );
    }
  } catch (err) {
    _handlerError = err;
    throw err;
  }

  // Post-process fallback actions
  if (result) {
    const rc = result.responseContent as Record<string, unknown> | null;
    const resultRecord = result as unknown as Record<string, unknown>;
    runtime.logger?.info(
      {
        src: "eliza-api",
        mode: resultRecord.mode,
        actions: rc?.actions,
        simple: rc?.simple,
        hasText: Boolean(rc?.text),
      },
      "[eliza-api] Chat response metadata",
    );

    const rawActionsPayload = rc?.actions ?? resultRecord.actions;
    const modelText = String(
      extractCompatTextContent(result.responseContent) ?? "",
    );
    const parsedFallbackActions = parseFallbackActionBlocks(
      rawActionsPayload,
      modelText,
    );
    const userText = String(extractCompatTextContent(message.content) ?? "");
    const fallbackActionsToRun = [...parsedFallbackActions];
    const inferredBalanceChain = inferBalanceChainFromText(userText);

    if (
      shouldForceCheckBalanceFallback(
        fallbackActionsToRun,
        userText,
        modelText,
      ) &&
      !fallbackActionsToRun.some((a) => a.name === "CHECK_BALANCE")
    ) {
      fallbackActionsToRun.push({
        name: "CHECK_BALANCE",
        parameters: { chain: inferredBalanceChain },
      });
      runtime.logger?.warn(
        {
          src: "eliza-api",
          inferredChain: inferredBalanceChain,
        },
        "[eliza-api] Injecting CHECK_BALANCE fallback for REPLY-only malformed action payload",
      );
    }

    if (
      actionCallbacksSeen === 0 &&
      fallbackActionsToRun.length === 0 &&
      isBalanceIntent(userText)
    ) {
      fallbackActionsToRun.push({
        name: "CHECK_BALANCE",
        parameters: { chain: inferredBalanceChain },
      });
      runtime.logger?.warn(
        {
          src: "eliza-api",
          inferredChain: inferredBalanceChain,
        },
        "[eliza-api] Injecting CHECK_BALANCE fallback for balance intent without any action payload",
      );
    }

    if (
      actionCallbacksSeen === 0 &&
      !fallbackActionsToRun.some((action) => action.name === "BLOCK_WEBSITES")
    ) {
      const inferredWebsiteBlockFallback = inferWebsiteBlockFallback(
        userText,
        modelText,
      );
      if (inferredWebsiteBlockFallback) {
        fallbackActionsToRun.push(inferredWebsiteBlockFallback);
        runtime.logger?.warn(
          {
            src: "eliza-api",
            action: inferredWebsiteBlockFallback.name,
          },
          "[eliza-api] Injecting website blocker fallback from prompt intent",
        );
      }
    }

    if (
      actionCallbacksSeen === 0 &&
      !fallbackActionsToRun.some(
        (action) => action.name === "REQUEST_WEBSITE_BLOCKING_PERMISSION",
      )
    ) {
      const inferredWebsiteBlockingPermissionFallback =
        inferWebsiteBlockingPermissionFallback(userText, modelText);
      if (inferredWebsiteBlockingPermissionFallback) {
        fallbackActionsToRun.push(inferredWebsiteBlockingPermissionFallback);
        runtime.logger?.warn(
          {
            src: "eliza-api",
            action: inferredWebsiteBlockingPermissionFallback.name,
          },
          "[eliza-api] Injecting website blocker permission fallback from prompt intent",
        );
      }
    }

    if (
      actionCallbacksSeen === 0 &&
      WALLET_EXECUTION_INTENT_RE.test(userText)
    ) {
      const inferredWalletFallback = inferWalletExecutionFallback(userText);
      if (inferredWalletFallback?.action) {
        const existingIndex = fallbackActionsToRun.findIndex(
          (action) => action.name === inferredWalletFallback.action.name,
        );
        const existingAction =
          existingIndex >= 0 ? fallbackActionsToRun[existingIndex] : undefined;
        if (
          existingIndex === -1 ||
          !existingAction ||
          !hasUsableWalletFallbackParams(existingAction)
        ) {
          if (existingIndex >= 0) {
            fallbackActionsToRun.splice(existingIndex, 1);
          }
          fallbackActionsToRun.push(inferredWalletFallback.action);
          runtime.logger?.warn(
            {
              src: "eliza-api",
              action: inferredWalletFallback.action.name,
              parameters: inferredWalletFallback.action.parameters,
            },
            "[eliza-api] Injecting wallet execution fallback from prompt intent",
          );
        }
      } else if (inferredWalletFallback?.errorText) {
        forcedWalletExecutionText = true;
        if (opts?.onSnapshot) {
          emitSnapshot(inferredWalletFallback.errorText);
        } else {
          responseText = inferredWalletFallback.errorText;
        }
      }
    }

    // Only run fallback execution when the core did NOT dispatch actions itself.
    const coreHandledActions = resultRecord.mode === "actions";
    const executableFallbackActions = fallbackActionsToRun.filter(
      isExecutableFallbackAction,
    );
    if (
      actionCallbacksSeen === 0 &&
      !coreHandledActions &&
      executableFallbackActions.length > 0
    ) {
      runtime.logger?.warn(
        {
          src: "eliza-api",
          parsedActions: executableFallbackActions.map((a) => a.name),
        },
        "[eliza-api] Recovering from unexecuted action payload",
      );

      await executeFallbackParsedActions(
        runtime,
        message,
        executableFallbackActions,
        appendIncomingText,
        recordActionCallback,
        {
          getCurrentText: () => responseText || modelText,
          onCallbackText: replaceCallbackText,
        },
      );
    }

    const inferredWebsiteBlockRecovery = inferWebsiteBlockFallback(
      userText,
      modelText,
    );
    if (inferredWebsiteBlockRecovery && !seenActionTags.has("BLOCK_WEBSITES")) {
      const websiteBlockStatus = await getSelfControlStatus();
      if (!websiteBlockStatus.active) {
        runtime.logger?.warn(
          {
            src: "eliza-api",
            action: inferredWebsiteBlockRecovery.name,
          },
          "[eliza-api] Recovering missing website blocker side effect after model response",
        );

        await executeFallbackParsedActions(
          runtime,
          message,
          [inferredWebsiteBlockRecovery],
          appendIncomingText,
          recordActionCallback,
          {
            getCurrentText: () => responseText || modelText,
            onCallbackText: replaceCallbackText,
          },
        );
      }
    }
  }

  const resultText = extractCompatTextContent(result?.responseContent);

  // Fallback: if callbacks weren't used for text, stream + return final text.
  if (!responseText && resultText) {
    if (opts?.onSnapshot) {
      emitSnapshot(resultText);
    } else {
      emitChunk(resultText);
    }
  } else if (
    actionCallbacksSeen === 0 &&
    resultText &&
    resultText !== responseText &&
    resultText.startsWith(responseText)
  ) {
    emitChunk(resultText.slice(responseText.length));
  } else if (
    actionCallbacksSeen === 0 &&
    resultText &&
    resultText !== responseText &&
    !forcedWalletExecutionText
  ) {
    if (opts?.onSnapshot) {
      emitSnapshot(resultText);
    } else {
      responseText = resultText;
    }
  }

  if (
    actionCallbacksSeen === 0 &&
    isWalletActionRequiredIntent(originalUserText)
  ) {
    const normalizedVisibleText = stripAssistantStageDirections(
      (responseText || resultText || "").trim(),
    );
    if (
      normalizedVisibleText.length === 0 ||
      WALLET_PROGRESS_ONLY_RE.test(normalizedVisibleText)
    ) {
      const failureText = buildWalletActionNotExecutedReply(
        runtime,
        originalUserText.trim(),
      );
      if (opts?.onSnapshot) {
        emitSnapshot(failureText);
      } else {
        responseText = failureText;
      }
    }
  }

  const noResponseFallback = opts?.resolveNoResponseText?.();
  const normalizedResponseText = trimWalletProgressPrefix(responseText);
  const finalText = isClientVisibleNoResponse(normalizedResponseText)
    ? (noResponseFallback ?? (responseText || "(no response)"))
    : normalizedResponseText;

  // Estimate token usage from text lengths (~4 chars per token)
  const promptText = extractCompatTextContent(message.content) ?? "";
  const estPromptTokens = Math.ceil(promptText.length / 4);
  const estCompletionTokens = Math.ceil(finalText.length / 4);

  return {
    text: finalText,
    agentName,
    usage: {
      promptTokens: estPromptTokens,
      completionTokens: estCompletionTokens,
      totalTokens: estPromptTokens + estCompletionTokens,
      model: detectRuntimeModel(runtime, undefined) ?? undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// generateConversationTitle
// ---------------------------------------------------------------------------

export async function generateConversationTitle(
  runtime: AgentRuntime,
  userMessage: string,
  agentName: string,
): Promise<string | null> {
  const modelClass = ModelType.TEXT_SMALL;

  const prompt = `Based on the user's first message in a new chat, generate a very short, concise title (max 4-5 words) for the conversation.
The agent's name is "${agentName}". The title should reflect the topic or intent of the user.
Ideally, the title should fit the persona/vibe of the agent if possible, but clarity is more important.
Do not use quotes. Do not include "Title:" prefix.

User message: "${userMessage}"

Title:`;

  try {
    const title = await runtime.useModel(modelClass, {
      prompt,
      maxTokens: 20,
      temperature: 0.7,
    });

    if (!title) return null;

    let cleanTitle = title.trim();
    if (
      (cleanTitle.startsWith('"') && cleanTitle.endsWith('"')) ||
      (cleanTitle.startsWith("'") && cleanTitle.endsWith("'"))
    ) {
      cleanTitle = cleanTitle.slice(1, -1);
    }

    if (!cleanTitle || cleanTitle.length > 50) return null;

    return cleanTitle;
  } catch (err) {
    logger.warn(
      `[eliza] Failed to generate conversation title: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// State interface required by chat routes
// ---------------------------------------------------------------------------

export interface ChatRouteState {
  runtime: AgentRuntime | null;
  config: ElizaConfig;
  agentName: string;
  logBuffer: LogEntry[];
  chatRoomId: UUID | null;
  chatUserId: UUID | null;
  chatConnectionReady: { userId: UUID; roomId: UUID; worldId: UUID } | null;
  chatConnectionPromise: Promise<void> | null;
  adminEntityId: UUID | null;
  /** Wallet trade permission mode for wallet-mode guidance replies. */
  tradePermissionMode?: string;
}

export interface ChatRouteContext extends RouteRequestContext {
  state: ChatRouteState;
}

async function ensureCompatChatConnection(
  state: ChatRouteState,
  runtime: AgentRuntime,
  agentName: string,
  channelIdPrefix: string,
  roomKey: string,
): Promise<{ userId: UUID; roomId: UUID; worldId: UUID }> {
  const userId = ensureAdminEntityIdForChat(state);
  const roomId = stringToUuid(
    `${agentName}-${channelIdPrefix}-room-${roomKey}`,
  ) as UUID;
  const worldId = stringToUuid(`${agentName}-web-chat-world`) as UUID;
  const messageServerId = stringToUuid(`${agentName}-web-server`) as UUID;

  await runtime.ensureConnection({
    entityId: userId,
    roomId,
    worldId,
    userName: resolveAppUserName(state.config),
    source: "client_chat",
    channelId: `${channelIdPrefix}-${roomKey}`,
    type: ChannelType.DM,
    messageServerId,
    metadata: { ownership: { ownerId: userId } },
  });

  // Ensure world ownership
  const world = await runtime.getWorld(worldId);
  if (world) {
    let needsUpdate = false;
    if (!world.metadata) {
      world.metadata = {};
      needsUpdate = true;
    }
    if (
      !world.metadata.ownership ||
      typeof world.metadata.ownership !== "object" ||
      (world.metadata.ownership as { ownerId?: string }).ownerId !== userId
    ) {
      world.metadata.ownership = { ownerId: userId };
      needsUpdate = true;
    }
    const metadataWithRoles = world.metadata as {
      roles?: Record<string, string>;
    };
    const roles = metadataWithRoles.roles ?? {};
    if (roles[userId] !== "OWNER") {
      roles[userId] = "OWNER";
      metadataWithRoles.roles = roles;
      needsUpdate = true;
    }
    if (needsUpdate) {
      await runtime.updateWorld(world);
    }
  }

  return { userId, roomId, worldId };
}

function ensureAdminEntityIdForChat(state: ChatRouteState): UUID {
  if (state.adminEntityId) {
    return state.adminEntityId;
  }
  const configured = state.config.agents?.defaults?.adminEntityId?.trim();
  const nextAdminEntityId =
    configured && isUuidLike(configured)
      ? configured
      : (stringToUuid(`${state.agentName}-admin-entity`) as UUID);
  if (configured && !isUuidLike(configured)) {
    logger.warn(
      `[eliza-api] Invalid agents.defaults.adminEntityId "${configured}", using deterministic fallback`,
    );
  }
  state.adminEntityId = nextAdminEntityId;
  state.chatUserId = state.adminEntityId;
  return nextAdminEntityId;
}

// ---------------------------------------------------------------------------
// Main route handler
// ---------------------------------------------------------------------------

export async function handleChatRoutes(
  ctx: ChatRouteContext,
): Promise<boolean> {
  const { req, res, method, pathname, readJsonBody, json, error, state } = ctx;

  // ── GET /v1/models (OpenAI compatible) ─────────────────────────────────
  if (method === "GET" && pathname === "/v1/models") {
    const created = Math.floor(Date.now() / 1000);
    const ids = new Set<string>();
    ids.add("eliza");
    if (state.agentName?.trim()) ids.add(state.agentName.trim());
    if (state.runtime?.character.name?.trim())
      ids.add(state.runtime.character.name.trim());

    json(res, {
      object: "list",
      data: Array.from(ids).map((id) => ({
        id,
        object: "model",
        created,
        owned_by: "eliza",
      })),
    });
    return true;
  }

  // ── GET /v1/models/:id (OpenAI compatible) ─────────────────────────────
  if (method === "GET" && /^\/v1\/models\/[^/]+$/.test(pathname)) {
    const created = Math.floor(Date.now() / 1000);
    const raw = pathname.split("/")[3] ?? "";
    const decoded = decodePathComponent(raw, res, "model id");
    if (!decoded) return true;
    const id = decoded.trim();
    if (!id) {
      json(
        res,
        {
          error: {
            message: "Model id is required",
            type: "invalid_request_error",
          },
        },
        400,
      );
      return true;
    }
    json(res, { id, object: "model", created, owned_by: "eliza" });
    return true;
  }

  // ── POST /v1/chat/completions (OpenAI compatible) ──────────────────────
  if (method === "POST" && pathname === "/v1/chat/completions") {
    const body = await readJsonBody<Record<string, unknown>>(req, res);
    if (!body) return true;
    if (hasBlockedObjectKeyDeep(body)) {
      json(
        res,
        {
          error: {
            message: "Request body contains a blocked object key",
            type: "invalid_request_error",
          },
        },
        400,
      );
      return true;
    }
    const safeBody = cloneWithoutBlockedObjectKeys(body);

    const extracted = extractOpenAiSystemAndLastUser(safeBody.messages);
    if (!extracted) {
      json(
        res,
        {
          error: {
            message:
              "messages must be an array containing at least one user message",
            type: "invalid_request_error",
          },
        },
        400,
      );
      return true;
    }

    const roomKey = resolveCompatRoomKey(safeBody).slice(0, 120);
    const wantsStream =
      safeBody.stream === true ||
      (req.headers.accept ?? "").includes("text/event-stream");
    const requestedModel =
      typeof safeBody.model === "string" && safeBody.model.trim()
        ? safeBody.model.trim()
        : null;

    const prompt = extracted.system
      ? `${extracted.system}\n\n${extracted.user}`.trim()
      : extracted.user;

    const created = Math.floor(Date.now() / 1000);
    const id = `chatcmpl-${crypto.randomUUID()}`;
    const model = requestedModel ?? state.agentName ?? "eliza";

    if (wantsStream) {
      initSse(res);
      let aborted = false;
      req.on("close", () => {
        aborted = true;
      });

      const sendChunk = (
        delta: Record<string, unknown>,
        finishReason: string | null,
      ) => {
        writeSseData(
          res,
          JSON.stringify({
            id,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [
              {
                index: 0,
                delta,
                finish_reason: finishReason,
              },
            ],
          }),
        );
      };

      try {
        if (!state.runtime) {
          writeSseData(
            res,
            JSON.stringify({
              error: {
                message: "Agent is not running",
                type: "service_unavailable",
              },
            }),
          );
          writeSseData(res, "[DONE]");
          return true;
        }

        sendChunk({ role: "assistant" }, null);

        let fullText = "";

        {
          const runtime = state.runtime;
          if (!runtime) throw new Error("Agent is not running");
          const agentName = runtime.character.name ?? "Eliza";
          const { userId, roomId } = await ensureCompatChatConnection(
            state,
            runtime,
            agentName,
            "openai-compat",
            roomKey,
          );

          const message = createMessageMemory({
            id: crypto.randomUUID() as UUID,
            entityId: userId,
            agentId: runtime.agentId,
            roomId,
            content: {
              text: prompt,
              source: "compat_openai",
              channelType: ChannelType.API,
            },
          });

          await generateChatResponse(runtime, message, state.agentName, {
            isAborted: () => aborted,
            onChunk: (chunk) => {
              fullText += chunk;
              if (chunk) sendChunk({ content: chunk }, null);
            },
            resolveNoResponseText: () =>
              resolveNoResponseFallback(state.logBuffer, runtime),
          });
        }

        const resolved = normalizeChatResponseText(
          fullText,
          state.logBuffer,
          state.runtime,
        );
        if (
          (fullText.trim().length === 0 || isNoResponsePlaceholder(fullText)) &&
          resolved.trim()
        ) {
          sendChunk({ content: resolved }, null);
        }

        sendChunk({}, "stop");
        writeSseData(res, "[DONE]");
      } catch (err) {
        if (!aborted) {
          writeSseData(
            res,
            JSON.stringify({
              error: {
                message: getErrorMessage(err),
                type: "server_error",
              },
            }),
          );
          writeSseData(res, "[DONE]");
        }
      } finally {
        res.end();
      }
      return true;
    }

    // Non-streaming
    try {
      let responseText: string;

      {
        if (!state.runtime) {
          json(
            res,
            {
              error: {
                message: "Agent is not running",
                type: "service_unavailable",
              },
            },
            503,
          );
          return true;
        }
        const runtime = state.runtime;
        const agentName = runtime.character.name ?? "Eliza";
        const { userId, roomId } = await ensureCompatChatConnection(
          state,
          runtime,
          agentName,
          "openai-compat",
          roomKey,
        );
        const message = createMessageMemory({
          id: crypto.randomUUID() as UUID,
          entityId: userId,
          roomId,
          content: {
            text: prompt,
            source: "compat_openai",
            channelType: ChannelType.API,
          },
        });
        const result = await generateChatResponse(
          runtime,
          message,
          state.agentName,
          {
            resolveNoResponseText: () =>
              resolveNoResponseFallback(state.logBuffer, runtime),
          },
        );
        responseText = result.text;
      }

      const resolvedText = normalizeChatResponseText(
        responseText,
        state.logBuffer,
        state.runtime,
      );
      json(res, {
        id,
        object: "chat.completion",
        created,
        model,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: resolvedText },
            finish_reason: "stop",
          },
        ],
      });
    } catch (err) {
      json(
        res,
        { error: { message: getErrorMessage(err), type: "server_error" } },
        500,
      );
    }
    return true;
  }

  // ── POST /v1/messages (Anthropic compatible) ───────────────────────────
  if (method === "POST" && pathname === "/v1/messages") {
    const body = await readJsonBody<Record<string, unknown>>(req, res);
    if (!body) return true;
    if (hasBlockedObjectKeyDeep(body)) {
      json(
        res,
        {
          error: {
            type: "invalid_request_error",
            message: "Request body contains a blocked object key",
          },
        },
        400,
      );
      return true;
    }
    const safeBody = cloneWithoutBlockedObjectKeys(body);

    const extracted = extractAnthropicSystemAndLastUser({
      system: safeBody.system,
      messages: safeBody.messages,
    });
    if (!extracted) {
      json(
        res,
        {
          error: {
            type: "invalid_request_error",
            message:
              "messages must be an array containing at least one user message",
          },
        },
        400,
      );
      return true;
    }

    const roomKey = resolveCompatRoomKey(safeBody).slice(0, 120);
    const wantsStream =
      safeBody.stream === true ||
      (req.headers.accept ?? "").includes("text/event-stream");
    const requestedModel =
      typeof safeBody.model === "string" && safeBody.model.trim()
        ? safeBody.model.trim()
        : null;

    const prompt = extracted.system
      ? `${extracted.system}\n\n${extracted.user}`.trim()
      : extracted.user;

    const id = `msg_${crypto.randomUUID().replace(/-/g, "")}`;
    const model = requestedModel ?? state.agentName ?? "eliza";

    if (wantsStream) {
      initSse(res);
      let aborted = false;
      req.on("close", () => {
        aborted = true;
      });

      try {
        if (!state.runtime) {
          writeSseJson(
            res,
            {
              type: "error",
              error: {
                type: "service_unavailable",
                message: "Agent is not running",
              },
            },
            "error",
          );
          return true;
        }

        writeSseJson(
          res,
          {
            type: "message_start",
            message: {
              id,
              type: "message",
              role: "assistant",
              model,
              content: [],
              stop_reason: null,
              stop_sequence: null,
              usage: { input_tokens: 0, output_tokens: 0 },
            },
          },
          "message_start",
        );
        writeSseJson(
          res,
          {
            type: "content_block_start",
            index: 0,
            content_block: { type: "text", text: "" },
          },
          "content_block_start",
        );

        let fullText = "";

        const onDelta = (chunk: string) => {
          if (!chunk) return;
          fullText += chunk;
          writeSseJson(
            res,
            {
              type: "content_block_delta",
              index: 0,
              delta: { type: "text_delta", text: chunk },
            },
            "content_block_delta",
          );
        };

        {
          const runtime = state.runtime;
          if (!runtime) throw new Error("Agent is not running");
          const agentName = runtime.character.name ?? "Eliza";
          const { userId, roomId } = await ensureCompatChatConnection(
            state,
            runtime,
            agentName,
            "anthropic-compat",
            roomKey,
          );

          const message = createMessageMemory({
            id: crypto.randomUUID() as UUID,
            entityId: userId,
            roomId,
            content: {
              text: prompt,
              source: "compat_anthropic",
              channelType: ChannelType.API,
            },
          });

          await generateChatResponse(runtime, message, state.agentName, {
            isAborted: () => aborted,
            onChunk: onDelta,
            resolveNoResponseText: () =>
              resolveNoResponseFallback(state.logBuffer, runtime),
          });
        }

        const resolved = normalizeChatResponseText(
          fullText,
          state.logBuffer,
          state.runtime,
        );
        if (
          (fullText.trim().length === 0 || isNoResponsePlaceholder(fullText)) &&
          resolved.trim()
        ) {
          onDelta(resolved);
        }

        writeSseJson(
          res,
          { type: "content_block_stop", index: 0 },
          "content_block_stop",
        );
        writeSseJson(
          res,
          {
            type: "message_delta",
            delta: { stop_reason: "end_turn", stop_sequence: null },
            usage: { output_tokens: 0 },
          },
          "message_delta",
        );
        writeSseJson(res, { type: "message_stop" }, "message_stop");
      } catch (err) {
        if (!aborted) {
          writeSseJson(
            res,
            {
              type: "error",
              error: { type: "server_error", message: getErrorMessage(err) },
            },
            "error",
          );
        }
      } finally {
        res.end();
      }
      return true;
    }

    // Non-streaming
    try {
      let responseText: string;

      {
        if (!state.runtime) {
          json(
            res,
            {
              error: {
                type: "service_unavailable",
                message: "Agent is not running",
              },
            },
            503,
          );
          return true;
        }
        const runtime = state.runtime;
        const agentName = runtime.character.name ?? "Eliza";
        const { userId, roomId } = await ensureCompatChatConnection(
          state,
          runtime,
          agentName,
          "anthropic-compat",
          roomKey,
        );
        const message = createMessageMemory({
          id: crypto.randomUUID() as UUID,
          entityId: userId,
          roomId,
          content: {
            text: prompt,
            source: "compat_anthropic",
            channelType: ChannelType.API,
          },
        });
        const result = await generateChatResponse(
          runtime,
          message,
          state.agentName,
          {
            resolveNoResponseText: () =>
              resolveNoResponseFallback(state.logBuffer, runtime),
          },
        );
        responseText = result.text;
      }

      const resolvedText = normalizeChatResponseText(
        responseText,
        state.logBuffer,
        state.runtime,
      );
      json(res, {
        id,
        type: "message",
        role: "assistant",
        model,
        content: [{ type: "text", text: resolvedText }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      });
    } catch (err) {
      json(
        res,
        { error: { type: "server_error", message: getErrorMessage(err) } },
        500,
      );
    }
    return true;
  }

  return false;
}
