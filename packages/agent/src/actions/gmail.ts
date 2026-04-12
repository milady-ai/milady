import type {
  Action,
  ActionExample,
  HandlerCallback,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import {
  ModelType,
  parseJSONObjectFromText,
  parseKeyValueXml,
} from "@elizaos/core";
import type {
  CreateLifeOpsGmailBatchReplyDraftsRequest,
  CreateLifeOpsGmailReplyDraftRequest,
  LifeOpsGmailBatchReplySendItem,
  SendLifeOpsGmailBatchReplyRequest,
  SendLifeOpsGmailReplyRequest,
} from "@miladyai/shared/contracts/lifeops";
import { LifeOpsService, LifeOpsServiceError } from "../lifeops/service.js";
import { resolveDefaultTimeZone } from "../lifeops/defaults.js";
import {
  detailArray,
  detailBoolean,
  detailNumber,
  detailString,
  formatEmailNeedsResponse,
  formatEmailRead,
  formatEmailSearch,
  formatEmailTriage,
  formatGmailBatchReplyDrafts,
  formatGmailReplyDraft,
  getGoogleCapabilityStatus,
  gmailReadUnavailableMessage,
  gmailSendUnavailableMessage,
  hasLifeOpsAccess,
  INTERNAL_URL,
  messageText,
  toActionData,
} from "./lifeops-google-helpers.js";

type GmailSubaction =
  | "triage"
  | "needs_response"
  | "search"
  | "read"
  | "draft_reply"
  | "draft_batch_replies"
  | "send_reply"
  | "send_batch_replies"
  | "send_message";

export type GmailLlmPlan = {
  subaction: GmailSubaction | null;
  queries: string[];
  messageId?: string;
  replyNeededOnly?: boolean;
};

type GmailActionParams = {
  subaction?: GmailSubaction;
  intent?: string;
  query?: string;
  queries?: string[];
  messageId?: string;
  bodyText?: string;
  details?: Record<string, unknown>;
};

const WEAK_CONFIRMATION_PATTERN =
  /^(?:yes|yeah|yep|yup|ok|okay|sure|please|please do|do it|go ahead|sounds good|mm-?hmm|mhm|uh-?huh)$/i;
const GMAIL_SUBJECT_PATTERN =
  /\b(email|emails|gmail|mail|inbox|reply|replies|respond|response|messages?|sender|subject|unread|important|starred|attach(?:ment|ed)|search|find)\b/;
const FOLLOW_UP_PATTERN =
  /\b(today|yesterday|this week|this month|last week|last few weeks|last few days|past few weeks|past few days|next week|last month|recent|search again|check again|look again|try again|try it|retry|from them|from him|from her|unread|important|starred|with attachments?|reply needed|needs response|read it|read that|read them|what does it say|what's in it|show me the email)\b/i;
const PARAMETER_DOC_NOISE_PATTERN =
  /\b(?:actions?|params?|parameters?|required parameter|structured gmail arguments|supported keys include|may include:|structured data when needed|boolean when)\b|\b\w+\?:\w+\b/i;
const WEAK_GMAIL_QUERY_PATTERN =
  /^(?:again|retry|try again|search again|check again|look again|it|that|them|those|this)$/i;
const GMAIL_READ_PATTERN =
  /\b(read|open|show(?: me)?|what does (?:it|that|this) say|what(?:'s| is) in (?:it|that|this)|full (?:email|message)|message body)\b/i;
const GMAIL_DETAIL_ALIASES = {
  forceSync: ["forcesync", "force_sync"],
  maxResults: ["maxresults", "max_results"],
  replyNeededOnly: ["replyneededonly", "reply_needed_only"],
  messageIds: ["messageids", "message_ids"],
} as const;

function normalizeGmailSubaction(value: unknown): GmailSubaction | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case "triage":
    case "needs_response":
    case "search":
    case "read":
    case "draft_reply":
    case "draft_batch_replies":
    case "send_reply":
    case "send_batch_replies":
    case "send_message":
      return normalized;
    default:
      return null;
  }
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeLookupKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function wordCount(value: string): number {
  const normalized = normalizeText(value);
  if (!normalized) {
    return 0;
  }
  return normalized.split(" ").filter(Boolean).length;
}

function stripMatchingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function trimTrailingPunctuation(value: string): string {
  return value.replace(/[.?!,;:]+$/g, "").trim();
}

function quoteQueryValue(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value;
}

/**
 * Strip the elizaOS runtime timestamp + entity prefix from a state line.
 * Handles both formats:
 *   Simple:      "user: find emails from suran"
 *   Timestamped: "14:23 (3 min ago) [entity-id] Shaw: find emails from suran"
 * Returns { role, text } where role is the name/role prefix.
 */
function parseStateLine(line: string): { role: string; text: string } {
  const trimmed = line.trim();
  // Timestamped format: "HH:MM (relative) [entity-id] Name: text"
  const tsMatch = trimmed.match(
    /^\d{1,2}:\d{2}\s+\([^)]+\)\s+\[[^\]]+\]\s+(\S+)\s*:\s*(.*)/,
  );
  if (tsMatch) {
    return { role: tsMatch[1].toLowerCase(), text: tsMatch[2].trim() };
  }
  // Simple format: "role: text"
  const simpleMatch = trimmed.match(
    /^(user|assistant|system|owner|admin|\S+)\s*:\s*(.*)/i,
  );
  if (simpleMatch) {
    return { role: simpleMatch[1].toLowerCase(), text: simpleMatch[2].trim() };
  }
  // Continuation line (no prefix) — snippet, body text, etc.
  return { role: "", text: trimmed };
}

/** Baseline role names that should never be treated as user intents. */
const SYSTEM_ROLE_NAMES = new Set(["assistant", "system"]);

function splitStateTextCandidates(value: string): string[] {
  return value
    .split(/\n+/)
    .map((line) => parseStateLine(line).text)
    .filter((text) => text.length > 0);
}

/**
 * Extract only user-authored messages from state.
 * Handles both simple "user: X" and timestamped "HH:MM (...) [id] Name: X" formats.
 * Filters out agent responses, system messages, and continuation lines (snippets, body text).
 * Uses state.values.agentName (set by the elizaOS character provider) to dynamically
 * identify agent messages regardless of the character's name.
 */
function userIntentsFromState(state: State | undefined): string[] {
  if (!state || typeof state !== "object") return [];
  const stateRecord = state as Record<string, unknown>;
  const values =
    stateRecord.values && typeof stateRecord.values === "object"
      ? (stateRecord.values as Record<string, unknown>)
      : undefined;
  const raw =
    typeof values?.recentMessages === "string"
      ? values.recentMessages
      : typeof stateRecord.text === "string"
        ? stateRecord.text
        : "";
  if (!raw) return [];

  // Build exclusion set: baseline system roles + the agent's own character name
  const agentName =
    typeof values?.agentName === "string" ? values.agentName.toLowerCase() : "";
  const excludedRoles = new Set(SYSTEM_ROLE_NAMES);
  if (agentName) excludedRoles.add(agentName);

  return raw
    .split(/\n+/)
    .filter((line) => {
      const { role } = parseStateLine(line);
      // Must have a role prefix (not a continuation line) and not be an agent role
      return role.length > 0 && !excludedRoles.has(role);
    })
    .map((line) => parseStateLine(line).text)
    .filter((text) => text.length > 0);
}

function stateTextCandidates(state: State | undefined): string[] {
  if (!state || typeof state !== "object") {
    return [];
  }

  const stateRecord = state as Record<string, unknown>;
  const values =
    stateRecord.values && typeof stateRecord.values === "object"
      ? (stateRecord.values as Record<string, unknown>)
      : undefined;

  const candidates: string[] = [];
  const pushText = (value: unknown) => {
    if (typeof value === "string" && value.trim().length > 0) {
      candidates.push(...splitStateTextCandidates(value));
    }
  };

  pushText(values?.recentMessages);
  pushText(stateRecord.text);

  const recentMessagesData =
    stateRecord.recentMessagesData ?? stateRecord.recentMessages;
  if (Array.isArray(recentMessagesData)) {
    for (const item of recentMessagesData) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const content = (item as Record<string, unknown>).content;
      if (!content || typeof content !== "object") {
        continue;
      }
      pushText((content as Record<string, unknown>).text);
    }
  }

  return [...new Set(candidates)];
}

function planningConversationLines(state: State | undefined): string[] {
  if (!state || typeof state !== "object") {
    return [];
  }

  const stateRecord = state as Record<string, unknown>;
  const values =
    stateRecord.values && typeof stateRecord.values === "object"
      ? (stateRecord.values as Record<string, unknown>)
      : undefined;
  const raw =
    typeof values?.recentMessages === "string"
      ? values.recentMessages
      : typeof stateRecord.text === "string"
        ? stateRecord.text
        : "";
  if (!raw) {
    return [];
  }

  return raw
    .split(/\n+/)
    .map((line) => parseStateLine(line))
    .filter((line) => line.role.length > 0 && line.text.length > 0)
    .map((line) => `${line.role}: ${line.text}`);
}

function scoreGmailIntentCandidate(value: string): number {
  const normalized = normalizeText(value);
  if (!normalized) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = Math.min(normalized.length, 200) / 20;
  if (WEAK_CONFIRMATION_PATTERN.test(normalized)) {
    score -= 200;
  }
  if (PARAMETER_DOC_NOISE_PATTERN.test(normalized)) {
    score -= 500;
  }
  if (GMAIL_SUBJECT_PATTERN.test(normalized)) {
    score += 16;
  }
  if (
    /\b(from|sender|subject|unread|important|reply needed|needs response|contains?|about)\b/.test(
      normalized,
    )
  ) {
    score += 12;
  }
  if (
    /\b(last few weeks|last week|past few weeks|this week|last month|today|yesterday)\b/.test(
      normalized,
    )
  ) {
    score += 10;
  }
  if (/\b(find|search|look(?:ing)? for|show me|check)\b/.test(normalized)) {
    score += 8;
  }
  return score;
}

function looksLikeGmailResultSummary(value: string): boolean {
  const trimmed = value.trim();
  return (
    /^(?:email inbox:|found \d+ email|no (?:email|gmail message) matched|emails that likely need a reply|no emails look|no important emails|i (?:couldn't|could not) find)/i.test(
      trimmed,
    ) || /^- \*\*/.test(trimmed)
  );
}

function resolveGmailIntent(
  paramsIntent: string | undefined,
  message: Memory,
  state: State | undefined,
): string {
  const normalizeFollowUpConstraint = (value: string) => {
    const cleaned = value
      .trim()
      .replace(
        /^(?:yes|yeah|yep|yup|ok|okay|sure|please|please do|do it|go ahead|sounds good)\b[\s,.-]*/i,
        "",
      )
      .replace(/^(?:and\s+|also\s+)/i, "")
      .replace(/^(?:what about|how about|and the|also the|or the|only the|just the)\s+/i, "")
      .replace(/^from\s+(the\s+)?(last|past|previous|this|next)\b/i, "$1$2")
      .trim();
    if (
      /^(?:try\s+(?:it|again|that)|retry|do\s+(?:it\s+)?again|one\s+more\s+time|proceed|go for it)$/i.test(
        cleaned,
      )
    ) {
      return "";
    }
    return cleaned;
  };
  const currentMessageText = messageText(message).trim();
  const normalizedCurrentMessage = normalizeText(currentMessageText);
  const isRefinement =
    /^(?:what about|how about|and the|also the|or the|only the|just the)\b/i.test(
      normalizedCurrentMessage,
    );
  if (
    currentMessageText &&
    GMAIL_SUBJECT_PATTERN.test(normalizedCurrentMessage) &&
    !isRefinement
  ) {
    return currentMessageText;
  }

  if (
    currentMessageText &&
    (WEAK_CONFIRMATION_PATTERN.test(normalizedCurrentMessage) ||
      FOLLOW_UP_PATTERN.test(normalizedCurrentMessage))
  ) {
    const recentRelevantIntent = userIntentsFromState(state)
      .reverse()
      .find(
        (candidate) =>
          GMAIL_SUBJECT_PATTERN.test(normalizeText(candidate)) &&
          normalizeText(candidate) !== normalizedCurrentMessage,
      );
    if (recentRelevantIntent) {
      const followUpConstraint =
        normalizeFollowUpConstraint(currentMessageText);
      return followUpConstraint
        ? `${recentRelevantIntent} ${followUpConstraint}`.trim()
        : recentRelevantIntent;
    }
  }

  const candidates = [
    { text: paramsIntent?.trim(), source: "params" as const },
    { text: currentMessageText, source: "message" as const },
    ...stateTextCandidates(state).map((text) => ({
      text,
      source: "state" as const,
    })),
  ].filter(
    (
      candidate,
    ): candidate is { text: string; source: "params" | "message" | "state" } =>
      Boolean(candidate.text && candidate.text.trim().length > 0),
  );

  if (candidates.length === 0) {
    return "";
  }

  return [...candidates]
    .sort((left, right) => {
      const leftBonus =
        left.source === "message" &&
        GMAIL_SUBJECT_PATTERN.test(normalizeText(left.text))
          ? 20
          : 0;
      const rightBonus =
        right.source === "message" &&
        GMAIL_SUBJECT_PATTERN.test(normalizeText(right.text))
          ? 20
          : 0;
      return (
        scoreGmailIntentCandidate(right.text) +
        rightBonus -
        (scoreGmailIntentCandidate(left.text) + leftBonus)
      );
    })
    .map((candidate) => candidate.text)[0];
}

function normalizeSearchFragment(
  value: string | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = trimTrailingPunctuation(value.trim());
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeGmailSearchQueryValue(
  value: string | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }

  if (PARAMETER_DOC_NOISE_PATTERN.test(value)) {
    return undefined;
  }

  const cleaned = normalizeText(value)
    .replace(/\b(?:actions?|params?|parameters?)\b[:;]*/g, "")
    .replace(/\b\w+\?:\w+(?:\s+\[[^\]]+\])?\s*-\s*/g, " ")
    .replace(
      /\b(?:search|find|look(?:ing)? for|show me|check)\s+(?:my\s+)?(?:email|emails|gmail|mail|inbox)\s+for\b/g,
      "",
    )
    .replace(/\b(?:my\s+)?(?:email|emails|gmail|mail|inbox)\s+for\b/g, "")
    .replace(/\b(?:search|find|look(?:ing)? for|show me|check)\b/g, "")
    .replace(/\b(?:all\s+)?emails?\s+(?:sent\s+to\s+me\s+)?from\b/g, "from ")
    .replace(/\b(?:email|emails|gmail|mail|inbox|messages?)\b/g, "")
    .replace(/\bsupported keys include\b.*$/g, "")
    .replace(/\bstructured gmail arguments\b.*$/g, "")
    .replace(/[;:,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (
    !cleaned ||
    [
      "email",
      "emails",
      "gmail",
      "mail",
      "inbox",
      "message",
      "messages",
      "my",
      "my inbox",
      "my email",
      "my mail",
      "my gmail",
    ].includes(cleaned) ||
    WEAK_GMAIL_QUERY_PATTERN.test(cleaned) ||
    looksLikeNarrativeEmailQuery(cleaned) ||
    PARAMETER_DOC_NOISE_PATTERN.test(cleaned)
  ) {
    return undefined;
  }
  return cleaned;
}

function dedupeQueries(values: Array<string | undefined>): string[] {
  const queries: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const query =
      typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
    if (!query) {
      continue;
    }
    const key = query.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    queries.push(query);
  }
  return queries;
}

function tokenizeGmailSearchQuery(value: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of value.trim()) {
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
      continue;
    }
    if (!inQuotes && /\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current.length > 0) {
    tokens.push(current);
  }
  return tokens;
}

function trimSenderQualifierTail(value: string): string {
  return value
    .replace(
      /\b(?:that|which)\s+(?:contain(?:s|ing)?|mention(?:s|ed|ing)?|match(?:es|ing)?|has|have)\b.*$/i,
      "",
    )
    .replace(/\b(?:what\s+about|about|with)\b.*$/i, "")
    .replace(
      /\b(?:in|within|over|during|for)\s+(?:the\s+)?(?:last|past|previous|this|next)\b.*$/i,
      "",
    )
    .replace(
      /\b(?:today|yesterday|last week|this week|next week|last month|this month|few weeks|few days|couple weeks|reply needed|needs response|unread|important)\b.*$/i,
      "",
    )
    .trim();
}

function looksLikeNarrativeEmailQuery(value: string): boolean {
  const normalized = normalizeText(value);
  if (!normalized) {
    return false;
  }
  return (
    /\b(?:tell me if|let me know if|whether|did|has|what did|any(?:one|body)|someone|named)\b/.test(
      normalized,
    ) &&
    /\b(?:email(?:ed)?|mail(?:ed)?|send|sent|message(?:d)?|write|wrote)\b/.test(
      normalized,
    )
  );
}

function looksLikeLiteralRequestEcho(
  query: string,
  intent: string,
): boolean {
  const normalizedQuery = normalizeText(query);
  const normalizedIntent = normalizeText(intent);
  const questionLike = /[?¿]/.test(query);
  if (!normalizedQuery || !normalizedIntent) {
    return false;
  }
  if (
    /\b(?:from|subject|to|cc|label|labels|in|is|newer_than|older_than|after|before):/i.test(
      query,
    )
  ) {
    return false;
  }
  if (normalizedQuery === normalizedIntent) {
    return (
      questionLike ||
      wordCount(normalizedQuery) >= 10 ||
      normalizedQuery.length >= 80
    );
  }
  return (
    (normalizedQuery.includes(normalizedIntent) ||
      normalizedIntent.includes(normalizedQuery)) &&
    (questionLike || normalizedQuery.length >= 96)
  );
}

function inferSenderSearchCandidate(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const operatorToken = tokenizeGmailSearchQuery(trimmed).find((token) =>
    /^from:/i.test(token),
  );
  if (operatorToken) {
    const candidate = normalizeSearchFragment(
      stripMatchingQuotes(operatorToken.slice(5)),
    );
    if (candidate) {
      return candidate;
    }
  }

  const patterns = [
    /\b(?:any(?:one|body)|someone)\s+named\s+(.+?)\s+(?:email(?:ed)?|mail(?:ed)?|send|sent|message(?:d)?|write|wrote)\b/i,
    /\bnamed\s+(.+?)\s+(?:email(?:ed)?|mail(?:ed)?|send|sent|message(?:d)?|write|wrote)\b/i,
    /\b(?:email|emails|message|messages|mail)\s+(?:sent\s+to\s+me\s+)?from\s+(.+)$/i,
    /\b(?:anything|everything|stuff|something)\s+from\s+(.+)$/i,
    /\bfrom\s+(.+)$/i,
    /\bsender(?:\s+(?:is|matches?|named))?\s+(.+)$/i,
    /\b(?:first\s+name|last\s+name|name)\s+is\s+(.+)$/i,
    /\b(?:email|emails|message|messages?|mail)\s+(\S+(?:\s+\S+)?)\s+sent(?:\s+to)?\s+me\b/i,
    /\bdid\s+(\S+(?:\s+\S+)?)\s+(?:email(?:ed)?|send|sent|mail(?:ed)?|write|wrote|message(?:d)?)\b/i,
    /\bhas\s+(\S+(?:\s+\S+)?)\s+(?:email(?:ed)?|send|sent|mail(?:ed)?|message(?:d)?|write|wrote)\b/i,
    /\bwhat\s+did\s+(\S+(?:\s+\S+)?)\s+(?:send|sent|email(?:ed)?|mail(?:ed)?|write|wrote)\b/i,
    // possessive: "suran's emails", "alex's messages"
    /\b(\S+(?:\s+\S+)?)'s\s+(?:email|emails|message|messages?|mail)\b/i,
    // "emails by X"
    /\b(?:email|emails|message|messages?|mail)\s+by\s+(.+)$/i,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    const candidate = normalizeSearchFragment(
      stripMatchingQuotes(trimSenderQualifierTail(match?.[1] ?? "")),
    );
    if (candidate) {
      return candidate;
    }
  }
  return undefined;
}

function inferKeywordSearchCandidate(value: string): string | undefined {
  const senderCandidate = inferSenderSearchCandidate(value)?.toLowerCase();
  const patterns = [
    /\b(?:contain(?:s|ing)?|about|regarding|re|subject(?: mentions?| containing)?)\s+(.+?)(?=$|[?.!,]|\b(?:in|within|over|during|for)\s+(?:the\s+)?(?:last|past|previous|this|next)\b)/i,
    /\b(?:search(?: for)?|find|look(?:ing)? for)\s+(.+?)(?=$|[?.!,]|\b(?:in|within|over|during|for)\s+(?:the\s+)?(?:last|past|previous|this|next)\b)/i,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    const candidate = normalizeGmailSearchQueryValue(
      stripMatchingQuotes(trimSenderQualifierTail(match?.[1] ?? "")),
    );
    const normalizedCandidate = candidate
      ?.replace(/^(?:an?|all)\s+/i, "")
      .trim();
    if (
      normalizedCandidate &&
      !/^from\b/i.test(normalizedCandidate) &&
      !["my", "my inbox", "inbox", "my email", "my mail", "my gmail"].includes(
        normalizedCandidate,
      ) &&
      normalizedCandidate.toLowerCase() !== senderCandidate &&
      normalizedCandidate.toLowerCase() !==
        `from ${senderCandidate ?? ""}`.trim()
    ) {
      return normalizedCandidate;
    }
  }
  return undefined;
}

function inferRelativeDays(intent: string): number | undefined {
  const normalized = normalizeText(intent);
  const explicitWeeks = normalized.match(
    /\b(?:last|past|previous)\s+(\d{1,2})\s+weeks?\b/,
  );
  if (explicitWeeks) {
    return Number(explicitWeeks[1]) * 7;
  }
  const explicitDays = normalized.match(
    /\b(?:last|past|previous)\s+(\d{1,2})\s+days?\b/,
  );
  if (explicitDays) {
    return Number(explicitDays[1]);
  }
  if (/\b(?:last|past)\s+few\s+weeks?\b/.test(normalized)) {
    return 21;
  }
  if (/\b(?:last|past)\s+couple\s+weeks?\b/.test(normalized)) {
    return 14;
  }
  if (/\b(?:last|past)\s+week\b/.test(normalized)) {
    return 7;
  }
  if (/\b(?:last|past)\s+month\b/.test(normalized)) {
    return 30;
  }
  if (/\b(?:last|past)\s+few\s+days?\b/.test(normalized)) {
    return 3;
  }
  if (/\btoday\b/.test(normalized)) {
    return 1;
  }
  if (/\byesterday\b/.test(normalized)) {
    return 2;
  }
  if (/\bthis\s+week\b/.test(normalized)) {
    return 7;
  }
  if (/\bthis\s+month\b/.test(normalized)) {
    return 30;
  }
  if (/\b(?:recent(?:ly)?|latest|newest)\b/.test(normalized)) {
    return 7;
  }
  return undefined;
}

function inferTemporalSearchOperator(intent: string): string | undefined {
  const days = inferRelativeDays(intent);
  return typeof days === "number" ? `newer_than:${days}d` : undefined;
}

function inferUnreadOrImportanceOperator(intent: string): string | undefined {
  const normalized = normalizeText(intent);
  if (/\bunread\b/.test(normalized)) {
    return "is:unread";
  }
  if (/\bimportant\b/.test(normalized)) {
    return "is:important";
  }
  return undefined;
}

/**
 * Infer additional Gmail filter operators from natural language.
 * Returns operators like is:starred, has:attachment, from:me, subject:X.
 */
function inferAdditionalGmailOperators(intent: string): string[] {
  const normalized = normalizeText(intent);
  const operators: string[] = [];
  if (/\bstarred\b/.test(normalized)) {
    operators.push("is:starred");
  }
  if (
    /\b(?:with\s+)?attach(?:ment|ed|ments)\b/.test(normalized) ||
    /\bhas\s+(?:a\s+)?(?:file|pdf|doc|image|photo|attachment)\b/.test(
      normalized,
    )
  ) {
    operators.push("has:attachment");
  }
  if (
    /\b(?:emails?\s+)?i\s+sent\b/.test(normalized) ||
    /\bmy\s+sent\b/.test(normalized) ||
    /\bsent\s+(?:mail|emails?)\b/.test(normalized) ||
    /\bin\s+(?:my\s+)?sent\b/.test(normalized) ||
    /\bfrom\s+me\b/.test(normalized)
  ) {
    operators.push("from:me");
  }
  // subject:X — only when user explicitly mentions "subject" or "subject line"
  const subjectMatch = normalized.match(
    /\bsubject(?:\s+line)?\s+(?:is|contains?|mentions?|says?|includes?|about|with)?\s*[:\s]?\s*(.+?)(?=$|\b(?:from|in|is|has|newer_than|older_than|after|before)\b)/,
  );
  if (subjectMatch?.[1]) {
    const subjectValue = trimTrailingPunctuation(subjectMatch[1].trim());
    if (subjectValue && subjectValue.length <= 60) {
      operators.push(`subject:${quoteQueryValue(subjectValue)}`);
    }
  }
  return operators;
}

function normalizeGmailDetails(
  details: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!details) {
    return undefined;
  }

  const normalized: Record<string, unknown> = { ...details };
  const aliasMap = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(GMAIL_DETAIL_ALIASES)) {
    aliasMap.set(normalizeLookupKey(canonical), canonical);
    for (const alias of aliases) {
      aliasMap.set(normalizeLookupKey(alias), canonical);
    }
  }

  for (const [key, value] of Object.entries(details)) {
    const canonical = aliasMap.get(normalizeLookupKey(key));
    if (!canonical) {
      continue;
    }
    if (normalized[canonical] === undefined) {
      normalized[canonical] = value;
    }
  }

  return normalized;
}

function inferGmailSubaction(
  intent: string,
  details: Record<string, unknown> | undefined,
  params: GmailActionParams,
): GmailSubaction {
  // A bodyText + recipient list with no messageId means "compose new" rather
  // than "reply to existing thread". Check this branch first so the LLM can
  // dispatch a fresh outbound email when the user provides "to" but no
  // pre-existing thread to reply against.
  if (
    (params.bodyText || detailString(details, "bodyText")) &&
    !params.messageId &&
    !detailString(details, "messageId") &&
    !detailArray(details, "items") &&
    Array.isArray(details?.to) &&
    (details.to as unknown[]).length > 0
  ) {
    return "send_message";
  }
  if (
    params.bodyText ||
    detailString(details, "bodyText") ||
    detailArray(details, "items")
  ) {
    return detailArray(details, "items") ? "send_batch_replies" : "send_reply";
  }
  if (GMAIL_READ_PATTERN.test(intent)) {
    return "read";
  }
  if (
    params.messageId ||
    detailString(details, "messageId") ||
    detailArray(details, "messageIds")
  ) {
    if (
      /\b(batch|all|multiple)\b/.test(intent) ||
      detailArray(details, "messageIds")
    ) {
      return "draft_batch_replies";
    }
    return "draft_reply";
  }
  if (params.query || detailString(details, "query")) {
    return "search";
  }
  if (
    /\b(?:did|has)\s+\S+\s+(?:email(?:ed)?|send|sent|mail(?:ed)?|messaged?)\b/.test(
      intent,
    ) ||
    /\bwhat\s+did\s+\S+\s+(?:send|email|mail)\b/.test(intent)
  ) {
    return "search";
  }
  if (
    /\b(send|reply now|email them back|send this)\b/.test(intent) &&
    detailArray(details, "items")
  ) {
    return "send_batch_replies";
  }
  if (/\b(send|reply now|email them back|send this)\b/.test(intent)) {
    return "send_reply";
  }
  if (/\b(draft|write a reply|compose a reply|reply draft)\b/.test(intent)) {
    return /\b(batch|all|multiple)\b/.test(intent)
      ? "draft_batch_replies"
      : "draft_reply";
  }
  if (/\b(search|find|look for|about|from)\b/.test(intent)) {
    return "search";
  }
  if (
    /\b(need(?:s)? a reply|respond to|reply needed|need response)\b/.test(
      intent,
    )
  ) {
    return "needs_response";
  }
  return "triage";
}


function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function shouldTrustExplicitGmailSubaction(
  subaction: GmailSubaction | undefined,
  params: GmailActionParams,
  details: Record<string, unknown> | undefined,
): boolean {
  if (!subaction) {
    return false;
  }

  switch (subaction) {
    case "search":
      return Boolean(
        params.query ||
          detailString(details, "query") ||
          (params.queries?.length ?? 0) > 0 ||
          (normalizeStringArray(details?.queries)?.length ?? 0) > 0,
      );
    case "read":
      return Boolean(params.messageId || detailString(details, "messageId"));
    case "draft_reply":
    case "send_reply":
      return Boolean(
        params.messageId ||
          detailString(details, "messageId") ||
          params.bodyText ||
          detailString(details, "bodyText"),
      );
    case "draft_batch_replies":
    case "send_batch_replies":
      return Boolean((detailArray(details, "items")?.length ?? 0) > 0);
    case "send_message":
      return Boolean(
        normalizeStringArray(detailArray(details, "to"))?.length ||
          detailString(details, "subject") ||
          params.bodyText ||
          detailString(details, "bodyText"),
      );
    default:
      return false;
  }
}

function inferGmailSearchQuery(intent: string): string | undefined {
  const sender = inferSenderSearchCandidate(intent);
  const keyword = inferKeywordSearchCandidate(intent);
  const temporal = inferTemporalSearchOperator(intent);
  const unreadOrImportant = inferUnreadOrImportanceOperator(intent);
  const additional = inferAdditionalGmailOperators(intent);
  const combined = [
    sender ? `from:${quoteQueryValue(sender)}` : undefined,
    keyword,
    unreadOrImportant,
    ...additional,
    temporal,
  ].filter((value): value is string => Boolean(value));
  if (combined.length > 0) {
    return combined.join(" ");
  }

  const match = intent.match(
    /\b(?:search(?: for)?|find|look(?:ing)? for)\s+(.+)$/i,
  );
  const query = normalizeGmailSearchQueryValue(match?.[1]);
  if (query) {
    return query;
  }
  return sender ? `from:${quoteQueryValue(sender)}` : undefined;
}

function sanitizeGmailQuery(
  query: string | undefined,
  intent: string,
): string | undefined {
  if (!query) {
    return undefined;
  }
  const raw = normalizeText(query);
  if (
    /\b(?:from|subject|to|cc|label|labels|in|is|newer_than|older_than|after|before):/i.test(
      query,
    )
  ) {
    return query.trim().replace(/\s+/g, " ");
  }
  if (
    PARAMETER_DOC_NOISE_PATTERN.test(raw) ||
    raw.includes("supported keys include") ||
    raw.includes("structured gmail arguments")
  ) {
    return undefined;
  }
  const cleaned = normalizeGmailSearchQueryValue(query);
  if (
    !cleaned ||
    cleaned.length > 200 ||
    ["query", "search query", "gmail query"].includes(cleaned) ||
    looksLikeLiteralRequestEcho(cleaned, intent)
  ) {
    return undefined;
  }
  const inferred = inferGmailSearchQuery(intent);
  if (
    inferred &&
    looksLikeNarrativeEmailQuery(cleaned) &&
    !/\b(?:from|subject|to|cc|label|labels|in|is|newer_than|older_than|after|before):/i.test(
      cleaned,
    )
  ) {
    return undefined;
  }
  return cleaned;
}

function scoreGmailQueryCandidate(query: string, intent: string): number {
  const normalized = normalizeText(query);
  if (!normalized) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;
  if (PARAMETER_DOC_NOISE_PATTERN.test(normalized)) {
    score -= 500;
  }
  if (looksLikeNarrativeEmailQuery(normalized)) {
    score -= 120;
  }
  if (looksLikeLiteralRequestEcho(query, intent)) {
    score -= 120;
  }
  if (WEAK_GMAIL_QUERY_PATTERN.test(normalized)) {
    score -= 120;
  }
  if (
    /\b(?:from|subject|to|cc|label|labels|in|is|newer_than|older_than|after|before):/i.test(
      query,
    )
  ) {
    score += 50;
  }

  const tokens = tokenizeGmailSearchQuery(query);
  if (tokens.length <= 3) {
    score += 12;
  } else if (tokens.length >= 7) {
    score -= 15;
  }

  const inferred = inferGmailSearchQuery(intent);
  if (inferred && normalizeText(inferred) === normalized) {
    score += 60;
  }

  const sender = inferSenderSearchCandidate(intent);
  if (sender && normalized.includes(normalizeText(sender))) {
    score += 18;
  }

  const keyword = inferKeywordSearchCandidate(intent);
  if (keyword && normalized.includes(normalizeText(keyword))) {
    score += 12;
  }

  const temporal = inferTemporalSearchOperator(intent);
  if (temporal && normalized.includes(normalizeText(temporal))) {
    score += 8;
  }

  const unreadOrImportant = inferUnreadOrImportanceOperator(intent);
  if (
    unreadOrImportant &&
    normalized.includes(normalizeText(unreadOrImportant))
  ) {
    score += 8;
  }

  return score;
}

function inferGmailSearchQueries(intent: string): string[] {
  const sender = inferSenderSearchCandidate(intent);
  const keyword = inferKeywordSearchCandidate(intent);
  const temporal = inferTemporalSearchOperator(intent);
  const unreadOrImportant = inferUnreadOrImportanceOperator(intent);
  const additional = inferAdditionalGmailOperators(intent);
  return dedupeQueries([
    [
      sender ? `from:${quoteQueryValue(sender)}` : undefined,
      keyword,
      unreadOrImportant,
      ...additional,
      temporal,
    ]
      .filter((value): value is string => Boolean(value))
      .join(" "),
    [
      sender ? `from:${quoteQueryValue(sender)}` : undefined,
      unreadOrImportant,
      ...additional,
      temporal,
    ]
      .filter((value): value is string => Boolean(value))
      .join(" "),
    [keyword, sender, unreadOrImportant, temporal]
      .filter((value): value is string => Boolean(value))
      .join(" "),
    sender,
  ]);
}

async function extractGmailSearchQueriesWithLlm(
  runtime: IAgentRuntime,
  message: Memory,
  state: State | undefined,
  intent: string,
): Promise<string[]> {
  return (await extractGmailPlanWithLlm(runtime, message, state, intent)).queries;
}

export async function extractGmailPlanWithLlm(
  runtime: IAgentRuntime,
  message: Memory,
  state: State | undefined,
  intent: string,
): Promise<GmailLlmPlan> {
  const recentConversation = planningConversationLines(state).slice(-8).join("\n");
  const currentMessage = messageText(message).trim();
  const timeZone = resolveDefaultTimeZone();
  const now = new Date();
  const nowIso = now.toISOString();
  const localNow = new Intl.DateTimeFormat("en-US", {
    timeZone,
    dateStyle: "full",
    timeStyle: "long",
  }).format(now);
  const prompt = [
    "Plan the Gmail action for this request.",
    "The user may speak in any language.",
    "Use the current request plus recent conversation context.",
    "If the current request is vague or a follow-up, recover the subject from recent conversation and apply the new constraint from the current request.",
    "You MUST always return a subaction — never return null. Pick the closest match even if uncertain.",
    "",
    "Subactions and when to use each:",
    "  triage — general inbox overview, unread count, email summary (e.g. 'check my inbox', 'any new emails')",
    "  needs_response — specifically about emails that need a reply (e.g. 'which emails need a response', 'any reply-needed emails')",
    "  search — find emails by sender, subject, keyword, date, label (e.g. 'emails from John', 'who emailed me today', 'find the invoice email')",
    "  read — read a specific email body by message ID (e.g. 'read that email', 'show me the full message')",
    "  draft_reply — compose a reply to a specific email (e.g. 'draft a reply to John', 'write a response to that email')",
    "  draft_batch_replies — compose replies to multiple emails at once (e.g. 'draft replies to all of those', 'respond to each one')",
    "  send_reply — send a confirmed reply to an email (e.g. 'send that reply', 'email them back now')",
    "  send_batch_replies — send confirmed replies to multiple emails (e.g. 'send all those replies')",
    "",
    "For search or read, extract up to 3 short Gmail-compatible queries using Gmail search operators.",
    "Return Gmail operators in Gmail syntax even if the user speaks another language, and preserve names, addresses, and subject keywords in their original language or script when useful.",
    "",
    "Gmail search operators reference:",
    "  from:name  to:name  cc:name  subject:word  has:attachment  is:unread  is:starred  is:important",
    "  newer_than:7d  older_than:30d  after:2025/01/01  before:2025/12/31  label:work  in:sent  from:me",
    "  {term1 term2} for OR.  Combine operators: from:suran is:unread newer_than:21d",
    "",
    "Preserve sender names, email addresses, subject keywords, unread/starred/important status, attachment mentions, and time windows.",
    "Use the current local datetime to convert relative time references like today, yesterday, this week, and this month into Gmail-compatible operators.",
    "Set replyNeededOnly to true only when the request is specifically about emails that need a reply.",
    "",
    "Examples:",
    '  "who emailed me today" → subaction: search, queries: newer_than:1d',
    '  "draft a reply to John" → subaction: draft_reply',
    '  "check my inbox" → subaction: triage',
    '  "any emails from Sarah about the report" → subaction: search, queries: from:sarah subject:report',
    "",
    "TOON only. Return exactly one TOON document. No prose before or after it. No <think>.",
    "Use || to separate multiple queries.",
    "",
    "Example:",
    "subaction: search",
    "queries: from:suran newer_than:21d",
    "messageId:",
    "replyNeededOnly: false",
    "",
    `Current timezone: ${timeZone}`,
    `Current local datetime: ${localNow}`,
    `Current ISO datetime: ${nowIso}`,
    `Current request: ${JSON.stringify(currentMessage)}`,
    `Resolved intent: ${JSON.stringify(intent)}`,
    `Recent conversation: ${JSON.stringify(recentConversation)}`,
  ].join("\n");

  let rawResponse = "";
  try {
    const result = await runtime.useModel(ModelType.TEXT_SMALL, {
      prompt,
    });
    rawResponse = typeof result === "string" ? result : "";
  } catch (error) {
    runtime.logger?.warn?.(
      {
        src: "action:gmail",
        error: error instanceof Error ? error.message : String(error),
      },
      "Gmail action planning model call failed",
    );
    return {
      subaction: null,
      queries: [],
    };
  }

  const parsed =
    parseKeyValueXml<Record<string, unknown>>(rawResponse) ??
    parseJSONObjectFromText(rawResponse);
  if (!parsed) {
    return {
      subaction: null,
      queries: [],
    };
  }

  // Extract queries from multiple possible shapes:
  // - TOON string: "from:john || subject:report" (split on ||)
  // - TOON single: "from:john" (no delimiter)
  // - JSON array: ["from:john", "subject:report"]
  // - Numbered fallbacks: query1, query2, query3
  const rawQueries: Array<string | undefined> = [];
  if (typeof parsed.queries === "string" && parsed.queries.trim().length > 0) {
    // TOON path: split on || delimiter
    for (const q of parsed.queries.split(/\s*\|\|\s*/)) {
      if (q.trim().length > 0) rawQueries.push(q.trim());
    }
  } else if (Array.isArray(parsed.queries)) {
    // JSON path: array of strings
    for (const value of parsed.queries) {
      if (typeof value === "string") rawQueries.push(value);
    }
  }
  if (typeof parsed.query === "string") rawQueries.push(parsed.query);
  if (typeof parsed.query1 === "string") rawQueries.push(parsed.query1);
  if (typeof parsed.query2 === "string") rawQueries.push(parsed.query2);
  if (typeof parsed.query3 === "string") rawQueries.push(parsed.query3);

  return {
    subaction: normalizeGmailSubaction(parsed.subaction),
    queries: dedupeQueries(rawQueries),
    messageId:
      typeof parsed.messageId === "string" && parsed.messageId.trim().length > 0
        ? parsed.messageId.trim()
        : undefined,
    replyNeededOnly: normalizeOptionalBoolean(parsed.replyNeededOnly),
  };
}

async function resolveGmailSearchQueries(
  runtime: IAgentRuntime,
  message: Memory,
  state: State | undefined,
  explicitQueries: Array<string | undefined>,
  intent: string,
  llmPlan?: GmailLlmPlan,
): Promise<string[]> {
  const providedQueries = dedupeQueries(
    explicitQueries.map((query) => sanitizeGmailQuery(query, intent)),
  );
  const llmQueries =
    llmPlan && llmPlan.queries.length > 0
      ? llmPlan.queries
      : await extractGmailSearchQueriesWithLlm(
          runtime,
          message,
          state,
          intent,
        );
  const heuristicQueries = inferGmailSearchQueries(intent);
  const stateQueries = stateTextCandidates(state)
    .reverse()
    .flatMap((candidate) => inferGmailSearchQueries(candidate));
  const candidates = dedupeQueries(
    [...providedQueries, ...llmQueries, ...heuristicQueries, ...stateQueries].map(
      (query) => sanitizeGmailQuery(query, intent),
    ),
  );
  return [...candidates].sort(
    (left, right) =>
      scoreGmailQueryCandidate(right, intent) -
      scoreGmailQueryCandidate(left, intent),
  );
}

function buildGmailSearchPlan(args: { intent: string; queries: string[] }): {
  queries: string[];
  displayQuery: string;
} | null {
  const queries = dedupeQueries(args.queries);
  if (queries.length === 0) {
    return null;
  }
  return {
    queries,
    displayQuery:
      inferGmailSearchQuery(args.intent) ??
      inferSenderSearchCandidate(args.intent) ??
      queries[0],
  };
}

function normalizeBatchSendItems(
  details: Record<string, unknown> | undefined,
): LifeOpsGmailBatchReplySendItem[] | undefined {
  const items = detailArray(details, "items");
  if (!items) {
    return undefined;
  }
  const normalized = items
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }
      const record = item as Record<string, unknown>;
      const messageId =
        typeof record.messageId === "string" &&
        record.messageId.trim().length > 0
          ? record.messageId.trim()
          : null;
      const bodyText =
        typeof record.bodyText === "string" && record.bodyText.trim().length > 0
          ? record.bodyText.trim()
          : null;
      if (!messageId || !bodyText) {
        return null;
      }
      const normalized: LifeOpsGmailBatchReplySendItem = {
        messageId,
        bodyText,
        subject:
          typeof record.subject === "string" && record.subject.trim().length > 0
            ? record.subject.trim()
            : undefined,
        to: normalizeStringArray(record.to),
        cc: normalizeStringArray(record.cc),
      };
      return normalized;
    })
    .filter((item): item is LifeOpsGmailBatchReplySendItem => item !== null);
  return normalized.length > 0 ? normalized : undefined;
}

export const gmailAction: Action = {
  name: "GMAIL_ACTION",
  similes: [
    "GMAIL",
    "CHECK_EMAIL",
    "EMAIL_TRIAGE",
    "SEARCH_EMAIL",
    "DRAFT_EMAIL_REPLY",
    "SEND_EMAIL_REPLY",
    "SEND_EMAIL",
    "COMPOSE_EMAIL",
    "EMAIL_SOMEONE",
  ],
  description:
    "Interact with Gmail through LifeOps. " +
    "USE this action for: inbox triage and unread summaries; searching emails by sender, subject, keyword, date, or label; " +
    "reading full email bodies by message ID; checking which emails need a reply; " +
    "drafting reply text for one or more emails; sending confirmed replies; " +
    "composing and sending brand-new outbound emails to any address (e.g. 'send an email to X', 'email X about Y'). " +
    "DO NOT use this action for calendar events, meetings, or scheduling — use CALENDAR_ACTION instead. " +
    "DO NOT use this action for personal habits, goals, routines, or reminders — use LIFE instead. " +
    "This action provides the final grounded reply; do not pair it with a speculative REPLY action.",
  suppressPostActionContinuation: true,
  validate: async (runtime, message) => {
    return hasLifeOpsAccess(runtime, message);
  },
  handler: async (
    runtime,
    message,
    state,
    options,
    callback?: HandlerCallback,
  ) => {
    if (!(await hasLifeOpsAccess(runtime, message))) {
      return {
        success: false,
        text: "Gmail actions are restricted to the owner, explicitly granted users, and the agent.",
      };
    }

    const rawParams = (options as HandlerOptions | undefined)?.parameters as
      | GmailActionParams
      | undefined;
    const params = rawParams ?? ({} as GmailActionParams);
    const details = normalizeGmailDetails(params.details);
    const intent = resolveGmailIntent(params.intent?.trim(), message, state);
    const normalizedIntent = normalizeText(intent);
    const llmPlan = await extractGmailPlanWithLlm(runtime, message, state, intent);
    const llmSubaction = llmPlan.subaction;
    const explicitSubaction = params.subaction;
    const preferExplicitSubaction = shouldTrustExplicitGmailSubaction(
      explicitSubaction,
      params,
      details,
    );
    let subaction: GmailSubaction;
    if (llmSubaction && !preferExplicitSubaction) {
      subaction = llmSubaction;
    } else if (params.subaction) {
      subaction = params.subaction;
    } else if (llmSubaction) {
      subaction = llmSubaction;
    } else {
      runtime.logger?.warn?.(
        { src: "action:gmail", intent },
        "Gmail LLM plan returned no subaction; falling back to regex inference",
      );
      subaction = inferGmailSubaction(normalizedIntent, details, params);
    }
    runtime.logger?.debug?.(
      {
        src: "action:gmail",
        subaction,
        rawMessage: messageText(message).slice(0, 200),
        resolvedIntent: intent.slice(0, 200),
        params: {
          subaction: params.subaction,
          query: params.query,
          messageId: params.messageId,
          bodyText: params.bodyText?.slice(0, 100),
        },
        detailKeys: details ? Object.keys(details) : [],
        detailToType: typeof details?.to,
        detailSubject: typeof details?.subject === "string"
          ? details.subject
          : undefined,
      },
      "gmail action dispatch",
    );
    const explicitQueryArray = [
      ...(params.queries ?? []),
      ...(normalizeStringArray(details?.queries) ?? []),
    ];
    const service = new LifeOpsService(runtime);
    const respond = async <
      T extends Record<string, unknown> | undefined,
    >(payload: {
      success: boolean;
      text: string;
      data?: T;
    }) => {
      await callback?.({
        text: payload.text,
        source: "action",
        action: "GMAIL_ACTION",
      });
      return payload;
    };

    try {
      const google = await getGoogleCapabilityStatus(service);

      if (
        subaction === "send_reply" ||
        subaction === "send_batch_replies" ||
        subaction === "send_message"
      ) {
        if (!google.hasGmailSend) {
          return respond({
            success: false,
            text: gmailSendUnavailableMessage(google),
          });
        }
      } else if (!google.hasGmailTriage) {
        return respond({
          success: false,
          text: gmailReadUnavailableMessage(google),
        });
      }

      if (subaction === "triage") {
        const feed = await service.getGmailTriage(INTERNAL_URL, {
          mode: detailString(details, "mode") as
            | "local"
            | "remote"
            | "cloud_managed"
            | undefined,
          side: detailString(details, "side") as "owner" | "agent" | undefined,
          forceSync: detailBoolean(details, "forceSync"),
          maxResults: detailNumber(details, "maxResults") ?? 10,
        });
        return respond({
          success: true,
          text: formatEmailTriage(feed),
          data: toActionData(feed),
        });
      }

      if (subaction === "needs_response") {
        const feed = await service.getGmailNeedsResponse(INTERNAL_URL, {
          mode: detailString(details, "mode") as
            | "local"
            | "remote"
            | "cloud_managed"
            | undefined,
          side: detailString(details, "side") as "owner" | "agent" | undefined,
          forceSync: detailBoolean(details, "forceSync"),
          maxResults: detailNumber(details, "maxResults") ?? 10,
        });
        return respond({
          success: true,
          text: formatEmailNeedsResponse(feed),
          data: toActionData(feed),
        });
      }

      if (subaction === "search") {
        const resolvedQueries = await resolveGmailSearchQueries(
          runtime,
          message,
          state,
          [...explicitQueryArray, params.query, detailString(details, "query")],
          intent,
          llmPlan,
        );
        const searchPlan = buildGmailSearchPlan({
          intent,
          queries: resolvedQueries,
        });
        if (!searchPlan) {
          return respond({
            success: false,
            text: "I need a sender, subject, keyword, or email search target to run that Gmail search.",
          });
        }
        const requestBase = {
          mode: detailString(details, "mode") as
            | "local"
            | "remote"
            | "cloud_managed"
            | undefined,
          side: detailString(details, "side") as "owner" | "agent" | undefined,
          forceSync: detailBoolean(details, "forceSync"),
          maxResults: detailNumber(details, "maxResults") ?? 10,
          replyNeededOnly:
            detailBoolean(details, "replyNeededOnly") ??
            llmPlan.replyNeededOnly ??
            /\b(reply needed|needs response|respond to)\b/.test(
              normalizedIntent,
            ),
        };
        let feed = await service.getGmailSearch(INTERNAL_URL, {
          ...requestBase,
          query: searchPlan.queries[0] ?? searchPlan.displayQuery,
        });
        for (const query of searchPlan.queries.slice(1)) {
          if (feed.messages.length > 0) {
            break;
          }
          feed = await service.getGmailSearch(INTERNAL_URL, {
            ...requestBase,
            query,
          });
        }
        const displayFeed =
          feed.query === searchPlan.displayQuery
            ? feed
            : {
                ...feed,
                query: searchPlan.displayQuery,
              };
        return respond({
          success: true,
          text: formatEmailSearch(displayFeed),
          data: toActionData(displayFeed),
        });
      }

      if (subaction === "read") {
        const messageId =
          params.messageId ??
          detailString(details, "messageId") ??
          llmPlan.messageId;
        if (messageId) {
          const result = await service.readGmailMessage(INTERNAL_URL, {
            mode: detailString(details, "mode") as
              | "local"
              | "remote"
              | "cloud_managed"
              | undefined,
            side: detailString(details, "side") as
              | "owner"
              | "agent"
              | undefined,
            forceSync: detailBoolean(details, "forceSync"),
            messageId,
          });
          return respond({
            success: true,
            text: formatEmailRead(result),
            data: toActionData(result),
          });
        }

        const resolvedQueries = await resolveGmailSearchQueries(
          runtime,
          message,
          state,
          [...explicitQueryArray, params.query, detailString(details, "query")],
          intent,
          llmPlan,
        );
        const searchPlan = buildGmailSearchPlan({
          intent,
          queries: resolvedQueries,
        });
        if (!searchPlan) {
          return respond({
            success: false,
            text: "I need to know which email to read. Give me a sender, subject, keyword, or specific message id.",
          });
        }

        const requestBase = {
          mode: detailString(details, "mode") as
            | "local"
            | "remote"
            | "cloud_managed"
            | undefined,
          side: detailString(details, "side") as "owner" | "agent" | undefined,
          forceSync: detailBoolean(details, "forceSync"),
          maxResults: detailNumber(details, "maxResults") ?? 10,
          replyNeededOnly:
            detailBoolean(details, "replyNeededOnly") ??
            llmPlan.replyNeededOnly ??
            /\b(reply needed|needs response|respond to)\b/.test(
              normalizedIntent,
            ),
        };

        let result: Awaited<
          ReturnType<LifeOpsService["readGmailMessage"]>
        > | null = null;
        let lastReadError: LifeOpsServiceError | null = null;

        for (const query of searchPlan.queries) {
          try {
            result = await service.readGmailMessage(INTERNAL_URL, {
              ...requestBase,
              query,
            });
            break;
          } catch (error) {
            if (error instanceof LifeOpsServiceError && error.status === 404) {
              lastReadError = error;
              continue;
            }
            throw error;
          }
        }

        if (!result) {
          return respond({
            success: false,
            text:
              lastReadError?.message ??
              `I couldn't find an email to read for ${searchPlan.displayQuery}.`,
          });
        }

        const displayResult =
          result.query === searchPlan.displayQuery
            ? result
            : {
                ...result,
                query: searchPlan.displayQuery,
              };
        return respond({
          success: true,
          text: formatEmailRead(displayResult),
          data: toActionData(displayResult),
        });
      }

      if (subaction === "draft_reply") {
        const messageId =
          params.messageId ?? detailString(details, "messageId");
        if (!messageId) {
          return respond({
            success: false,
            text: "GMAIL_ACTION draft_reply needs a messageId.",
          });
        }
        const draft = await service.createGmailReplyDraft(INTERNAL_URL, {
          mode: detailString(details, "mode") as
            | "local"
            | "remote"
            | "cloud_managed"
            | undefined,
          side: detailString(details, "side") as "owner" | "agent" | undefined,
          messageId,
          tone: detailString(details, "tone") as
            | "brief"
            | "neutral"
            | "warm"
            | undefined,
          intent:
            detailString(details, "draftIntent") ??
            detailString(details, "intent") ??
            intent,
          includeQuotedOriginal: detailBoolean(
            details,
            "includeQuotedOriginal",
          ),
        } satisfies CreateLifeOpsGmailReplyDraftRequest);
        return respond({
          success: true,
          text: formatGmailReplyDraft(draft),
          data: toActionData(draft),
        });
      }

      if (subaction === "draft_batch_replies") {
        const batchSearchQueries =
          (normalizeStringArray(details?.messageIds)?.length ?? 0)
            ? []
            : await resolveGmailSearchQueries(
                runtime,
                message,
                state,
                [
                  ...explicitQueryArray,
                  params.query,
                  detailString(details, "query"),
                ],
                intent,
                llmPlan,
              );
        const request: CreateLifeOpsGmailBatchReplyDraftsRequest = {
          mode: detailString(details, "mode") as
            | "local"
            | "remote"
            | "cloud_managed"
            | undefined,
          side: detailString(details, "side") as "owner" | "agent" | undefined,
          forceSync: detailBoolean(details, "forceSync"),
          maxResults: detailNumber(details, "maxResults") ?? 10,
          query: batchSearchQueries[0],
          messageIds: normalizeStringArray(details?.messageIds),
          tone: detailString(details, "tone") as
            | "brief"
            | "neutral"
            | "warm"
            | undefined,
          intent:
            detailString(details, "draftIntent") ??
            detailString(details, "intent") ??
            intent,
          includeQuotedOriginal: detailBoolean(
            details,
            "includeQuotedOriginal",
          ),
          replyNeededOnly:
            detailBoolean(details, "replyNeededOnly") ??
            llmPlan.replyNeededOnly ??
            /\b(reply needed|needs response|respond to)\b/.test(
              normalizedIntent,
            ),
        };
        const batch = await service.createGmailBatchReplyDrafts(
          INTERNAL_URL,
          request,
        );
        return respond({
          success: true,
          text: formatGmailBatchReplyDrafts(batch),
          data: toActionData(batch),
        });
      }

      if (subaction === "send_reply") {
        const messageId =
          params.messageId ?? detailString(details, "messageId");
        const bodyText = params.bodyText ?? detailString(details, "bodyText");
        if (!messageId || !bodyText) {
          return respond({
            success: false,
            text: "GMAIL_ACTION send_reply needs both messageId and bodyText.",
          });
        }
        const result = await service.sendGmailReply(INTERNAL_URL, {
          mode: detailString(details, "mode") as
            | "local"
            | "remote"
            | "cloud_managed"
            | undefined,
          side: detailString(details, "side") as "owner" | "agent" | undefined,
          messageId,
          bodyText,
          subject: detailString(details, "subject"),
          to: normalizeStringArray(details?.to),
          cc: normalizeStringArray(details?.cc),
          confirmSend: detailBoolean(details, "confirmSend") ?? true,
        } satisfies SendLifeOpsGmailReplyRequest);
        return respond({
          success: true,
          text: "Gmail reply sent.",
          data: toActionData(result),
        });
      }

      if (subaction === "send_message") {
        // Parse "email <addr> with subject "X" and body "Y"" patterns
        // directly from the user message. The chat LLM almost never puts
        // these into structured details.* fields — it just rewrites the
        // intent. Without a literal-text parser the action would always
        // fail validation for natural-language compose requests.
        const rawText = messageText(message);
        const emailRegex = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
        const recipientsFromIntent = rawText.match(emailRegex) ?? [];
        const subjectMatch =
          rawText.match(
            /\bsubject(?:\s+is|\s*[:=]|\s+of)?\s+["“]([^"”]+)["”]/i,
          ) ??
          rawText.match(/\bsubject\s+[“”]([^””]+)[“”]/i) ??
          rawText.match(
            /\bsubject\s+(?:should\s+(?:say|be|read)|says?)\s+(.+?)(?=\s+(?:and\s+)?(?:the\s+)?body\b|\s*$)/i,
          );
        const subjectFromIntent = subjectMatch?.[1]?.trim();
        const bodyMatch =
          rawText.match(
            /\bbody(?:\s+is|\s*[:=]|\s+of)?\s+[“”]([^””]+)[“”]/i,
          ) ??
          rawText.match(/\bbody\s+[“”]([^””]+)[“”]/i) ??
          rawText.match(
            /\bbody\s+(?:should\s+(?:say|be|include|contain|have)|says?)\s+(.+?)$/i,
          );
        const bodyFromIntent = bodyMatch?.[1]?.trim();

        const to =
          normalizeStringArray(details?.to) ??
          (recipientsFromIntent.length > 0 ? recipientsFromIntent : []);
        const subject =
          detailString(details, "subject") ??
          subjectFromIntent ??
          undefined;
        const bodyText =
          params.bodyText ??
          detailString(details, "bodyText") ??
          bodyFromIntent;

        if (to.length === 0 || !subject || !bodyText) {
          const missing: string[] = [];
          if (to.length === 0) missing.push("recipient address");
          if (!subject) missing.push("subject");
          if (!bodyText) missing.push("body text");
          return respond({
            success: false,
            text: `can't send that yet — i'm missing the ${missing.join(" and ")}. try something like: "send an email to name@example.com, subject should say X and body should say Y"`,
          });
        }
        const result = await service.sendGmailMessage(INTERNAL_URL, {
          mode: detailString(details, "mode") as
            | "local"
            | "remote"
            | "cloud_managed"
            | undefined,
          side: detailString(details, "side") as "owner" | "agent" | undefined,
          to,
          cc: normalizeStringArray(details?.cc),
          bcc: normalizeStringArray(details?.bcc),
          subject,
          bodyText,
          confirmSend: detailBoolean(details, "confirmSend") ?? true,
        });
        return respond({
          success: true,
          text: `sent to ${to.join(", ")}.`,
          data: toActionData(result),
        });
      }

      const items = normalizeBatchSendItems(details);
      if (!items) {
        return respond({
          success: false,
          text: "GMAIL_ACTION send_batch_replies needs an items array with messageId and bodyText for each reply.",
        });
      }
      const result = await service.sendGmailReplies(INTERNAL_URL, {
        mode: detailString(details, "mode") as
          | "local"
          | "remote"
          | "cloud_managed"
          | undefined,
        side: detailString(details, "side") as "owner" | "agent" | undefined,
        confirmSend: detailBoolean(details, "confirmSend") ?? true,
        items,
      } satisfies SendLifeOpsGmailBatchReplyRequest);
      return respond({
        success: true,
        text: `Sent ${result.sentCount} Gmail repl${result.sentCount === 1 ? "y" : "ies"}.`,
        data: toActionData(result),
      });
    } catch (error) {
      if (error instanceof LifeOpsServiceError) {
        if (error.status === 429) {
          return respond({
            success: false,
            text: `Gmail search hit an upstream rate limit: ${error.message}`,
          });
        }
        return respond({ success: false, text: error.message });
      }
      throw error;
    }
  },
  parameters: [
    {
      name: "subaction",
      description:
        "Gmail operation to run. Use triage, needs_response, search, read, draft_reply, draft_batch_replies, send_reply, send_batch_replies, or send_message (compose a brand-new outbound email).",
      required: false,
      schema: {
        type: "string" as const,
        enum: [
          "triage",
          "needs_response",
          "search",
          "read",
          "draft_reply",
          "draft_batch_replies",
          "send_reply",
          "send_batch_replies",
          "send_message",
        ],
      },
    },
    {
      name: "intent",
      description:
        'Natural language Gmail request. Examples: "what emails need a reply", "search email for investor", "read the latest email from suran", "draft a reply to message 123".',
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "query",
      description:
        "Search query for Gmail search or batch draft selection. Use Gmail-style query fragments when helpful, such as from:suran, is:unread, newer_than:21d, subject:venue.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "queries",
      description:
        "Optional array of Gmail search queries to try in order when the planner has multiple good variants.",
      required: false,
      schema: { type: "array" as const, items: { type: "string" as const } },
    },
    {
      name: "messageId",
      description:
        "Single Gmail message id for read, draft_reply, or send_reply operations.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "bodyText",
      description: "Reply body for send_reply.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "details",
      description:
        "Structured Gmail arguments. Supported keys include mode, side, forceSync, maxResults, query, queries, replyNeededOnly, tone, includeQuotedOriginal, messageId, messageIds, draftIntent, subject, to, cc, bodyText, confirmSend, and items for batch send.",
      required: false,
      schema: { type: "object" as const },
    },
  ],
  examples: [
    [
      {
        name: "{{name1}}",
        content: { text: "Do I have any emails I need to reply to?" },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "Emails that likely need a reply: 3.\n- **Investor follow-up** from Jane Doe · 2h ago",
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: { text: "Search my email for OneBlade receipts." },
      },
      {
        name: "{{agentName}}",
        content: { text: 'Found 2 emails for "OneBlade receipts".' },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: { text: "Read the latest email from Suran." },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "**Suran follow-up** from Suran Lee · 2d ago\n\nWanted to follow up on the last few weeks.",
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "Draft a reply to message abc123 thanking them and saying next week works.",
        },
      },
      {
        name: "{{agentName}}",
        content: { text: "Drafted reply for **Re: Scheduling**." },
      },
    ],
  ] as ActionExample[][],
};
