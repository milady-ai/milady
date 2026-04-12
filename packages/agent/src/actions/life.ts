import type {
  Action,
  ActionResult,
  HandlerOptions,
  IAgentRuntime,
  State,
} from "@elizaos/core";
import type { Memory } from "@elizaos/core";
import {
  extractDurationMinutesFromText,
  extractWebsiteTargetsFromText,
  normalizeWebsiteTargets,
} from "@miladyai/plugin-selfcontrol/selfcontrol";
import type {
  CreateLifeOpsDefinitionRequest,
  CreateLifeOpsGoalRequest,
  LifeOpsCadence,
  LifeOpsDailySlot,
  LifeOpsDefinitionRecord,
  LifeOpsDomain,
  LifeOpsGoalRecord,
  LifeOpsReminderIntensity,
  LifeOpsReminderStep,
  SetLifeOpsReminderPreferenceRequest,
  UpdateLifeOpsDefinitionRequest,
  UpdateLifeOpsGoalRequest,
} from "@miladyai/shared/contracts/lifeops";
import { LIFEOPS_REMINDER_INTENSITIES } from "@miladyai/shared/contracts/lifeops";
import { LifeOpsService, LifeOpsServiceError } from "../lifeops/service.js";
import {
  calendarReadUnavailableMessage,
  dayRange,
  detailArray,
  detailBoolean,
  detailNumber,
  detailObject,
  detailString,
  formatCalendarFeed,
  formatEmailTriage,
  formatNextEventContext,
  formatOverview,
  gmailReadUnavailableMessage,
  getGoogleCapabilityStatus,
  hasLifeOpsAccess,
  INTERNAL_URL,
  messageText,
  toActionData,
  weekRange,
} from "./lifeops-google-helpers.js";
import {
  extractLifeOperationWithLlm,
  type ExtractedLifeOperation,
} from "./life.extractor.js";

// ── Types ─────────────────────────────────────────────

type LifeOperation = ExtractedLifeOperation;

type LifeAction =
  | "create"
  | "create_goal"
  | "update"
  | "update_goal"
  | "delete"
  | "delete_goal"
  | "complete"
  | "skip"
  | "snooze"
  | "review"
  | "phone"
  | "escalation"
  | "reminder_preference"
  | "calendar"
  | "next_event"
  | "email"
  | "overview";

const ACTION_TO_OPERATION: Record<LifeAction, LifeOperation> = {
  create: "create_definition",
  create_goal: "create_goal",
  update: "update_definition",
  update_goal: "update_goal",
  delete: "delete_definition",
  delete_goal: "delete_goal",
  complete: "complete_occurrence",
  skip: "skip_occurrence",
  snooze: "snooze_occurrence",
  review: "review_goal",
  phone: "capture_phone",
  escalation: "configure_escalation",
  reminder_preference: "set_reminder_preference",
  calendar: "query_calendar_today",
  next_event: "query_calendar_next",
  email: "query_email",
  overview: "query_overview",
};

type LifeParams = {
  action?: LifeAction;
  intent?: string;
  title?: string;
  target?: string;
  details?: Record<string, unknown>;
};

type LifeDefinitionSeed = {
  title: string;
  kind: CreateLifeOpsDefinitionRequest["kind"];
  cadence: LifeOpsCadence;
  description?: string;
  reminderPlan?: CreateLifeOpsDefinitionRequest["reminderPlan"];
  websiteAccess?: CreateLifeOpsDefinitionRequest["websiteAccess"];
};

const CADENCE_HINT_RE =
  /\b(?:every day|daily|weekly|monthly|each day|every week|every month|every mornings?|every afternoons?|every evenings?|every nights?|mornings?|afternoons?|evenings?|nights?|twice a day|(?:\w+|\d+)\s*(?:x|times?)\s*(?:a|per)\s*day|per day|per week|throughout the day|with lunch|with breakfast|with dinner|every\s+\d+\s*(?:hours?|minutes?))\b/i;
const GENERIC_DERIVED_TITLE_RE =
  /^(?:new\s+)?(?:habit|routine|task|goal|life goal|thing|item|something|anything|stuff|plan|reminder|todo|to do|achieve|achieve a|achieve an)$/i;
const DERIVED_TITLE_STOPWORDS = new Set([
  "a",
  "about",
  "actually",
  "add",
  "am",
  "an",
  "and",
  "anything",
  "are",
  "as",
  "at",
  "be",
  "been",
  "being",
  "by",
  "can",
  "called",
  "could",
  "create",
  "did",
  "do",
  "does",
  "doing",
  "done",
  "for",
  "goal",
  "goals",
  "had",
  "happen",
  "happens",
  "has",
  "have",
  "help",
  "habit",
  "i",
  "im",
  "i'm",
  "item",
  "its",
  "it",
  "just",
  "life",
  "make",
  "manage",
  "me",
  "mine",
  "more",
  "my",
  "need",
  "new",
  "named",
  "of",
  "on",
  "ops",
  "our",
  "ours",
  "plan",
  "please",
  "really",
  "reminder",
  "routine",
  "save",
  "set",
  "setup",
  "something",
  "start",
  "stuff",
  "task",
  "that",
  "the",
  "them",
  "then",
  "thing",
  "this",
  "to",
  "todo",
  "titled",
  "track",
  "until",
  "up",
  "want",
  "we",
  "were",
  "with",
  "would",
  "you",
  "your",
]);
const DERIVED_TITLE_CADENCE_TOKENS = new Set([
  "afternoon",
  "afternoons",
  "breakfast",
  "daily",
  "day",
  "days",
  "dinner",
  "each",
  "evening",
  "evenings",
  "every",
  "hour",
  "hours",
  "lunch",
  "minute",
  "minutes",
  "monthly",
  "morning",
  "mornings",
  "night",
  "nights",
  "once",
  "per",
  "throughout",
  "time",
  "times",
  "today",
  "tomorrow",
  "twice",
  "week",
  "weeks",
  "weekly",
  "with",
  "x",
  "year",
  "years",
]);
const GENERIC_DERIVED_TOKENS = new Set([
  "achieve",
  "achieving",
  "better",
  "goal",
  "habit",
  "improve",
  "item",
  "plan",
  "reminder",
  "routine",
  "something",
  "stuff",
  "task",
  "thing",
  "todo",
]);

type DerivedIntentSegment = {
  hasQuantity: boolean;
  text: string;
};

type DeferredLifeDefinitionDraft = {
  intent: string;
  operation: "create_definition";
  request: {
    cadence: LifeOpsCadence;
    description?: string;
    goalRef?: string;
    kind: CreateLifeOpsDefinitionRequest["kind"];
    priority?: number;
    progressionRule?: CreateLifeOpsDefinitionRequest["progressionRule"];
    reminderPlan?: CreateLifeOpsDefinitionRequest["reminderPlan"];
    title: string;
    websiteAccess?: CreateLifeOpsDefinitionRequest["websiteAccess"];
  };
};

type DeferredLifeGoalDraft = {
  intent: string;
  operation: "create_goal";
  request: {
    cadence?: CreateLifeOpsGoalRequest["cadence"];
    description?: string;
    successCriteria?: CreateLifeOpsGoalRequest["successCriteria"];
    supportStrategy?: CreateLifeOpsGoalRequest["supportStrategy"];
    title: string;
  };
};

type DeferredLifeDraft = DeferredLifeDefinitionDraft | DeferredLifeGoalDraft;

// ── Intent classifier ─────────────────────────────────

export function classifyIntent(intent: string): LifeOperation {
  const lower = intent.toLowerCase();

  if (
    /\b(remind|reminder|ping|message|nudge)\b.*\b(less|fewer|more|again|back on|resume|normal)\b/.test(
      lower,
    ) ||
    /\b(stop reminding me|don't remind me|pause reminders?|resume reminders?|more reminders?|less reminders?|fewer reminders?|normal reminders?)\b/.test(
      lower,
    )
  ) {
    return "set_reminder_preference";
  }

  // Update — check before calendar so "edit my workout schedule" doesn't hit calendar
  if (/\b(update|change|edit|modify|adjust|rename|reschedule)\b/.test(lower)) {
    if (/\b(goal)\b/.test(lower)) return "update_goal";
    return "update_definition";
  }

  // Escalation config — check before phone capture; more specific patterns
  if (/\b(escalat|reminder plan|set up (sms|text|voice)|notify.*if|text.*if.*(ignore|miss)|call.*if.*(ignore|miss)|sms.*if)\b/.test(lower)) return "configure_escalation";

  // Phone capture — "text me", "call me", "my number"
  if (/\b(phone|text me|call me|sms|my number|voice call)\b/.test(lower)) return "capture_phone";

  // Review — check before calendar so "review the calendar event" doesn't hit calendar
  if (/\b(review|how.*(doing|going)|progress|check.*(goal|on))\b/.test(lower)) return "review_goal";

  // Delete — check before calendar so "stop the reminder" doesn't hit create
  if (/\b(delete|remove|cancel|get rid of|drop|stop tracking|stop the|stop my)\b/.test(lower)) {
    if (/\b(goal)\b/.test(lower)) return "delete_goal";
    return "delete_definition";
  }

  // Completion — "I did it", "mark brushing done", "finished my workout", "I brushed my teeth"
  if (looksLikeCompletionReport(lower)) return "complete_occurrence";

  // Skip — "skip brushing", "pass on workout", "not today"
  if (/\b(skip|pass\b|not today|skip.*(today|this))\b/.test(lower)) return "skip_occurrence";

  // Snooze — "snooze", "remind me later", "postpone", "defer", "push ... back"
  if (/\b(snooze|later|remind.*(later|again|in)|postpone|defer|push\b.*\bback)\b/.test(lower)) return "snooze_occurrence";

  // Query operations — check before create default
  if (/\b(calendar|events?|meetings?|what'?s on|agenda|(?:my|today'?s|this week'?s|tomorrow'?s) schedule)\b/.test(lower)) {
    if (/\b(next|upcoming|soon|about to)\b/.test(lower)) return "query_calendar_next";
    if (/\b(tomorrow)\b/.test(lower)) return "query_calendar_today";
    if (/\b(this week|week)\b/.test(lower)) return "query_calendar_today";
    return "query_calendar_today";
  }
  if (/\b(emails?|inbox|mail|messages?|gmail|respond to|important.*(need|should|must))\b/.test(lower)) return "query_email";
  if (/\b(overview|summary|what'?s active|status|what do i have|show me everything)\b/.test(lower)) return "query_overview";

  if (looksLikeDefinitionCreateIntent(lower)) {
    return "create_definition";
  }

  if (looksLikeGoalCreateIntent(lower)) return "create_goal";

  // Default: create a task/habit/routine
  return "create_definition";
}

async function resolveLifeOperation(args: {
  runtime: IAgentRuntime;
  message: Memory;
  state: State | undefined;
  intent: string;
  explicitOperation: LifeOperation | undefined;
}): Promise<LifeOperation> {
  const { runtime, message, state, intent, explicitOperation } = args;
  if (explicitOperation) {
    return explicitOperation;
  }

  const extracted = await extractLifeOperationWithLlm({
    runtime,
    message,
    state,
    intent,
  });
  if (extracted.operation) {
    return extracted.operation;
  }

  runtime.logger?.warn?.(
    { src: "action:life", intent },
    "Life LLM extraction returned no operation; falling back to regex classifier",
  );
  return classifyIntent(intent);
}

function looksLikeDefinitionCreateIntent(lower: string): boolean {
  return hasCadenceHint(lower);
}

function looksLikeGoalCreateIntent(lower: string): boolean {
  return /\bgoals?\b/.test(lower) && !hasCadenceHint(lower);
}

function hasCadenceHint(lower: string): boolean {
  return CADENCE_HINT_RE.test(lower);
}

function looksLikeCompletionReport(lower: string): boolean {
  return (
    /\b(done|finished)\b/.test(lower) ||
    /\bcompleted\b/.test(lower) ||
    /\bdid (it|that|my|the)\b/.test(lower) ||
    /\bmark.*\b(done|complete)\b/.test(lower) ||
    /\bi(?:'ve| have)? (already )?(done|completed|finished)\b/.test(lower) ||
    /\bi (already )?(brushed|worked out|meditated|exercised|stretched|took|drank|ate|ran|walked|cleaned|called|read|showered|shaved)\b/.test(
      lower,
    )
  );
}

function shouldRecoverMissingOccurrenceAsCreate(
  intent: string,
  seed: LifeDefinitionSeed | undefined,
): boolean {
  if (!seed) {
    return false;
  }
  const lower = intent.toLowerCase();
  return (
    looksLikeDefinitionCreateIntent(lower) && !looksLikeCompletionReport(lower)
  );
}

function inferReminderIntensityFromIntent(
  intent: string,
): LifeOpsReminderIntensity | null {
  const lower = intent.toLowerCase();
  if (
    /\b(stop reminding me|don't remind me|pause reminders?|mute reminders?|high priority only|only high priority)\b/.test(
      lower,
    )
  ) {
    return "high_priority_only";
  }
  if (
    /\b(resume reminders?|start reminding me again|turn reminders? back on|normal reminders?)\b/.test(
      lower,
    )
  ) {
    return "normal";
  }
  if (
    /\b(less|fewer|lower)\s+reminders?\b/.test(lower) ||
    /\b(remind|ping|message|nudge)\b.*\b(less|fewer|lower)\b/.test(lower)
  ) {
    return "minimal";
  }
  if (
    /\bmore reminders?\b/.test(lower) ||
    /\b(remind|ping|message|nudge)\b.*\bmore\b/.test(lower) ||
    /\bbe more persistent\b/.test(lower) ||
    /\bmore persistent\b/.test(lower)
  ) {
    return "persistent";
  }
  return null;
}

// ── Helpers ───────────────────────────────────────────

function requestedOwnership(domain?: LifeOpsDomain) {
  if (domain === "agent_ops") {
    return { domain: "agent_ops" as const, subjectType: "agent" as const };
  }
  return { domain: "user_lifeops" as const, subjectType: "owner" as const };
}

function normalizeIntentText(value: string): string {
  return normalizeLifeInputText(value).toLowerCase();
}

function normalizeLifeInputText(value: string): string {
  return value
    .replace(/[\u00a0\u1680\u2000-\u200b\u202f\u205f\u3000]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTitle(value: string): string {
  return normalizeIntentText(value);
}

function matchByTitle<T extends { definition?: { title: string }; goal?: { title: string } }>(
  entries: T[],
  targetTitle: string,
): T | null {
  const normalized = normalizeTitle(targetTitle);
  return (
    entries.find((e) => normalizeTitle(e.definition?.title ?? e.goal?.title ?? "") === normalized) ??
    entries.find((e) => normalizeTitle(e.definition?.title ?? e.goal?.title ?? "").includes(normalized)) ??
    null
  );
}

function coerceDeferredLifeDraft(value: unknown): DeferredLifeDraft | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const operation = record.operation;
  const intent =
    typeof record.intent === "string" ? record.intent.trim() : "";
  const request =
    record.request && typeof record.request === "object"
      ? (record.request as Record<string, unknown>)
      : null;

  if (!request || !intent) {
    return null;
  }

  const title = typeof request.title === "string" ? request.title.trim() : "";
  if (!title) {
    return null;
  }

  if (operation === "create_definition") {
    const kind =
      typeof request.kind === "string"
        ? (request.kind as CreateLifeOpsDefinitionRequest["kind"])
        : null;
    const cadence = request.cadence as LifeOpsCadence | undefined;
    if (!kind || !cadence) {
      return null;
    }
    return {
      intent,
      operation,
      request: {
        cadence,
        description:
          typeof request.description === "string"
            ? request.description
            : undefined,
        goalRef:
          typeof request.goalRef === "string" ? request.goalRef : undefined,
        kind,
        priority:
          typeof request.priority === "number" ? request.priority : undefined,
        progressionRule:
          request.progressionRule as CreateLifeOpsDefinitionRequest["progressionRule"],
        reminderPlan:
          request.reminderPlan as CreateLifeOpsDefinitionRequest["reminderPlan"],
        title,
        websiteAccess:
          request.websiteAccess as CreateLifeOpsDefinitionRequest["websiteAccess"],
      },
    };
  }

  if (operation === "create_goal") {
    return {
      intent,
      operation,
      request: {
        cadence: request.cadence as CreateLifeOpsGoalRequest["cadence"],
        description:
          typeof request.description === "string"
            ? request.description
            : undefined,
        successCriteria:
          request.successCriteria as CreateLifeOpsGoalRequest["successCriteria"],
        supportStrategy:
          request.supportStrategy as CreateLifeOpsGoalRequest["supportStrategy"],
        title,
      },
    };
  }

  return null;
}

function stateActionResults(state: State | undefined): ActionResult[] {
  if (!state || typeof state !== "object") {
    return [];
  }
  const stateRecord = state as Record<string, unknown>;
  const data =
    stateRecord.data && typeof stateRecord.data === "object"
      ? (stateRecord.data as Record<string, unknown>)
      : undefined;
  const providerResults =
    data?.providers && typeof data.providers === "object"
      ? (data.providers as Record<string, unknown>)
      : undefined;
  const providerActionState =
    providerResults?.ACTION_STATE &&
    typeof providerResults.ACTION_STATE === "object"
      ? (providerResults.ACTION_STATE as Record<string, unknown>)
      : undefined;
  const providerActionStateData =
    providerActionState?.data && typeof providerActionState.data === "object"
      ? (providerActionState.data as Record<string, unknown>)
      : undefined;
  const providerRecentMessages =
    providerResults?.RECENT_MESSAGES &&
    typeof providerResults.RECENT_MESSAGES === "object"
      ? (providerResults.RECENT_MESSAGES as Record<string, unknown>)
      : undefined;
  const providerRecentMessagesData =
    providerRecentMessages?.data &&
    typeof providerRecentMessages.data === "object"
      ? (providerRecentMessages.data as Record<string, unknown>)
      : undefined;

  const candidates = [
    data?.actionResults,
    providerActionStateData?.actionResults,
    providerActionStateData?.recentActionMemories,
    providerRecentMessagesData?.actionResults,
  ].filter(Array.isArray) as unknown[][];

  if (candidates.length === 0) {
    return [];
  }

  return candidates.flatMap((entries) =>
    entries.flatMap((entry): ActionResult[] => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    if ("content" in entry) {
      const content =
        (entry as { content?: unknown }).content &&
        typeof (entry as { content?: unknown }).content === "object"
          ? ((entry as { content: Record<string, unknown> }).content as Record<
              string,
              unknown
            >)
          : null;
      if (!content) {
        return [];
      }

      const contentData =
        content.data && typeof content.data === "object"
          ? ({ ...(content.data as Record<string, unknown>) } as Record<
              string,
              unknown
            >)
          : {};
      if (
        typeof content.actionName === "string" &&
        typeof contentData.actionName !== "string"
      ) {
        contentData.actionName = content.actionName;
      }

      return [
        {
          success: content.actionStatus !== "failed",
          text: typeof content.text === "string" ? content.text : undefined,
          data: contentData as import("@elizaos/core").ProviderDataRecord,
          error:
            typeof content.error === "string" ? content.error : undefined,
        },
      ];
    }

    return [entry as ActionResult];
    }),
  );
}

function stateMessageDrafts(state: State | undefined): DeferredLifeDraft[] {
  if (!state || typeof state !== "object") {
    return [];
  }

  const stateRecord = state as Record<string, unknown>;
  const data =
    stateRecord.data && typeof stateRecord.data === "object"
      ? (stateRecord.data as Record<string, unknown>)
      : undefined;
  const providerResults =
    data?.providers && typeof data.providers === "object"
      ? (data.providers as Record<string, unknown>)
      : undefined;
  const providerRecentMessages =
    providerResults?.RECENT_MESSAGES &&
    typeof providerResults.RECENT_MESSAGES === "object"
      ? (providerResults.RECENT_MESSAGES as Record<string, unknown>)
      : undefined;
  const providerRecentMessagesData =
    providerRecentMessages?.data &&
    typeof providerRecentMessages.data === "object"
      ? (providerRecentMessages.data as Record<string, unknown>)
      : undefined;

  const recentMessagesData = [
    stateRecord.recentMessagesData,
    stateRecord.recentMessages,
    providerRecentMessagesData?.recentMessages,
  ].find(Array.isArray);

  if (!Array.isArray(recentMessagesData)) {
    return [];
  }

  const drafts: DeferredLifeDraft[] = [];
  for (const item of recentMessagesData) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const content = (item as Record<string, unknown>).content;
    if (!content || typeof content !== "object") {
      continue;
    }
    const contentRecord = content as Record<string, unknown>;
    const candidate =
      coerceDeferredLifeDraft(contentRecord.lifeDraft) ??
      coerceDeferredLifeDraft(
        contentRecord.data && typeof contentRecord.data === "object"
          ? (contentRecord.data as Record<string, unknown>).lifeDraft
          : undefined,
      );
    if (candidate) {
      drafts.push(candidate);
    }
  }

  return drafts;
}

function latestDeferredLifeDraft(state: State | undefined): DeferredLifeDraft | null {
  for (const result of [...stateActionResults(state)].reverse()) {
    const resultData =
      result.data && typeof result.data === "object"
        ? (result.data as Record<string, unknown>)
        : null;
    const completedCreate =
      result.success &&
      resultData &&
      !coerceDeferredLifeDraft(resultData.lifeDraft) &&
      ((resultData.definition &&
        typeof resultData.definition === "object") ||
        (resultData.goal && typeof resultData.goal === "object"));
    if (completedCreate) {
      return null;
    }

    const candidate = coerceDeferredLifeDraft(result.data?.lifeDraft);
    if (candidate) {
      return candidate;
    }
  }

  const messageDrafts = stateMessageDrafts(state);
  return messageDrafts.length > 0 ? messageDrafts[messageDrafts.length - 1] : null;
}

function looksLikeDeferredLifeConfirmation(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (
    /\b(no|nope|nah|don't|do not|wait|hold on|change|edit|update|rename|instead|actually)\b/.test(
      normalized,
    )
  ) {
    return false;
  }

  return /^(?:yes|yeah|yep|yup|ok|okay|sure|confirm|confirmed|go ahead|do it|please do|sounds good)\b/.test(
    normalized,
  )
    || /\b(?:save|create)\s+(?:it|that|this|them|the goal|the habit|the routine|the task)\b/.test(
      normalized,
    );
}

function shouldReuseDeferredLifeDraft(args: {
  currentText: string;
  details: Record<string, unknown> | undefined;
  draft: DeferredLifeDraft | null;
  explicitAction: LifeAction | undefined;
  paramsIntent: string | undefined;
  target: string | undefined;
  title: string | undefined;
}): boolean {
  if (!args.draft) {
    return false;
  }

  if (detailBoolean(args.details, "confirmed") === true) {
    return true;
  }

  const words = args.currentText.trim().split(/\s+/).filter(Boolean);
  const isConfirmationFollowup =
    words.length > 0 &&
    words.length <= 6 &&
    !hasCadenceHint(args.currentText.toLowerCase()) &&
    looksLikeDeferredLifeConfirmation(args.currentText);
  if (isConfirmationFollowup) {
    if (
      args.explicitAction &&
      ACTION_TO_OPERATION[args.explicitAction] !== args.draft.operation
    ) {
      return false;
    }
    return true;
  }

  const normalizedCurrentText = normalizeIntentText(args.currentText);
  const normalizedParamsIntent =
    typeof args.paramsIntent === "string" && args.paramsIntent.trim().length > 0
      ? normalizeIntentText(args.paramsIntent)
      : "";
  if (
    normalizedParamsIntent &&
    normalizedParamsIntent !== normalizedCurrentText &&
    !looksLikeDeferredLifeConfirmation(args.paramsIntent ?? "")
  ) {
    return false;
  }

  if (
    args.explicitAction &&
    ACTION_TO_OPERATION[args.explicitAction] !== args.draft.operation
  ) {
    return false;
  }

  if (args.title || args.target) {
    return false;
  }
  return false;
}

async function resolveGoal(
  service: LifeOpsService,
  target: string | undefined,
  domain?: LifeOpsDomain,
): Promise<LifeOpsGoalRecord | null> {
  if (!target) return null;
  const goals = (await service.listGoals()).filter((e) => (domain ? e.goal.domain === domain : true));
  return goals.find((e) => e.goal.id === target) ?? matchByTitle(goals, target);
}

async function resolveDefinition(
  service: LifeOpsService,
  target: string | undefined,
  domain?: LifeOpsDomain,
): Promise<LifeOpsDefinitionRecord | null> {
  if (!target) return null;
  const defs = (await service.listDefinitions()).filter((e) => (domain ? e.definition.domain === domain : true));
  return defs.find((e) => e.definition.id === target) ?? matchByTitle(defs, target);
}

function tokenizeTitle(value: string): string[] {
  return normalizeTitle(value)
    .split(" ")
    .filter((token) => token.length >= 3);
}

async function resolveDefinitionFromIntent(
  service: LifeOpsService,
  target: string | undefined,
  intent: string,
  domain?: LifeOpsDomain,
): Promise<LifeOpsDefinitionRecord | null> {
  const direct = await resolveDefinition(service, target, domain);
  if (direct) {
    return direct;
  }
  const defs = (await service.listDefinitions()).filter((entry) =>
    domain ? entry.definition.domain === domain : true,
  );
  const intentTokens = new Set(tokenizeTitle(intent));
  let best: LifeOpsDefinitionRecord | null = null;
  let bestScore = 0;
  let tied = false;
  for (const entry of defs) {
    const title = normalizeTitle(entry.definition.title);
    if (title.length > 0 && normalizeTitle(intent).includes(title)) {
      return entry;
    }
    const overlap = tokenizeTitle(entry.definition.title).filter((token) =>
      intentTokens.has(token),
    ).length;
    if (overlap === 0) {
      continue;
    }
    if (overlap > bestScore) {
      best = entry;
      bestScore = overlap;
      tied = false;
      continue;
    }
    if (overlap === bestScore) {
      tied = true;
    }
  }
  return bestScore > 0 && !tied ? best : null;
}

async function resolveOccurrence(
  service: LifeOpsService,
  target: string | undefined,
  domain?: LifeOpsDomain,
) {
  if (!target) return null;
  const overview = await service.getOverview();
  const all = [...overview.owner.occurrences, ...overview.agentOps.occurrences]
    .filter((o) => (domain ? o.domain === domain : true));
  const normalized = normalizeTitle(target);
  return (
    all.find((o) => o.id === target) ??
    all.find((o) => normalizeTitle(o.title) === normalized) ??
    all.find((o) => normalizeTitle(o.title).includes(normalized)) ??
    null
  );
}

function summarizeCadence(cadence: LifeOpsCadence): string {
  switch (cadence.kind) {
    case "once": return `one-off due ${cadence.dueAt}`;
    case "daily": return `daily in ${cadence.windows.join(", ")}`;
    case "times_per_day": return `${cadence.slots.length} times per day`;
    case "interval": return `every ${cadence.everyMinutes} minutes in ${cadence.windows.join(", ")}`;
    case "weekly": return `weekly on ${cadence.weekdays.join(", ")}`;
  }
}

// ── Calendar/email formatters ─────────────────────────

function slugifyValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function parseNumberWord(token: string): number | null {
  switch (token.trim().toLowerCase()) {
    case "one":
    case "once":
      return 1;
    case "two":
    case "twice":
      return 2;
    case "three":
      return 3;
    case "four":
      return 4;
    case "five":
      return 5;
    case "six":
      return 6;
    case "seven":
      return 7;
    default: {
      const parsed = Number.parseInt(token, 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
  }
}

function weekdaysForFrequency(count: number): number[] {
  if (count <= 1) return [1];
  if (count === 2) return [1, 4];
  if (count === 3) return [1, 3, 5];
  if (count === 4) return [1, 2, 4, 6];
  if (count === 5) return [1, 2, 3, 4, 5];
  if (count === 6) return [0, 1, 2, 3, 4, 5];
  return [0, 1, 2, 3, 4, 5, 6];
}

function inferWebsiteTargetsFromIntent(intent: string): string[] {
  const lower = intent.toLowerCase();
  const normalized = new Set(
    normalizeWebsiteTargets(extractWebsiteTargetsFromText(intent)),
  );
  const blockContext =
    /\b(blocks?|blocked|blocking|unlocks?|unblock|locked|locks?|focus|self ?control)\b/.test(
      lower,
    );
  if (!blockContext) {
    return [...normalized];
  }
  if (/\b(?:x|twitter)\b/.test(lower)) {
    normalized.add("x.com");
    normalized.add("twitter.com");
  }
  if (/\bfacebook\b/.test(lower)) {
    normalized.add("facebook.com");
  }
  if (/\binstagram\b/.test(lower)) {
    normalized.add("instagram.com");
  }
  if (/\bgoogle news\b/.test(lower)) {
    normalized.add("news.google.com");
  }
  if (/\bhacker news\b/.test(lower)) {
    normalized.add("news.ycombinator.com");
  }
  if (/\by combinator\b|\byc\b/.test(lower)) {
    normalized.add("ycombinator.com");
  }
  return [...normalized].sort();
}

function inferWebsiteAccessPolicyFromIntent(
  intent: string,
  title: string,
): CreateLifeOpsDefinitionRequest["websiteAccess"] | undefined {
  const lower = intent.toLowerCase();
  if (
    !/\b(blocks?|blocked|blocking|unlocks?|unblock|locked|locks?|focus|self ?control)\b/.test(
      lower,
    )
  ) {
    return undefined;
  }

  const websites = inferWebsiteTargetsFromIntent(intent);
  if (websites.length === 0) {
    return undefined;
  }

  const manualUnlock =
    /\b(?:unlock|unblock)\b.*\buntil i (?:say done|say so|relock|lock it again|block it again|turn it off)\b/.test(
      lower,
    ) || /\buntil i say done\b/.test(lower);
  const callbackMatch = lower.match(
    /\b(?:unlock|unblock)\b.*\buntil ([a-z0-9][a-z0-9\s_-]{1,40}?) (?:happens|is done|is over|completes|finishes|ends)\b/,
  );
  const explicitUnlockDuration =
    /\b(?:unlock|unblock)\b/.test(lower) || /\bfor a while\b/.test(lower)
      ? extractDurationMinutesFromText(intent)
      : null;

  const groupKey = `earned-access-${slugifyValue(websites.join("-")) || slugifyValue(title) || "web"}`;
  if (manualUnlock) {
    return {
      groupKey,
      websites,
      unlockMode: "until_manual_lock",
      reason: `Earn access to ${websites.join(", ")} after completing ${title}.`,
    };
  }
  if (callbackMatch?.[1]) {
    const callbackKey = slugifyValue(callbackMatch[1]);
    if (callbackKey) {
      return {
        groupKey,
        websites,
        unlockMode: "until_callback",
        callbackKey,
        reason: `Earn access to ${websites.join(", ")} after completing ${title}.`,
      };
    }
  }
  return {
    groupKey,
    websites,
    unlockMode: "fixed_duration",
    unlockDurationMinutes:
      explicitUnlockDuration && explicitUnlockDuration > 0
        ? explicitUnlockDuration
        : 60,
    reason: `Earn access to ${websites.join(", ")} after completing ${title}.`,
  };
}

function extractIntentWindows(
  intent: string,
): Array<"morning" | "afternoon" | "evening" | "night"> {
  const lower = intent.toLowerCase();
  const windows: Array<"morning" | "afternoon" | "evening" | "night"> = [];
  if (/\bmornings?\b/.test(lower)) windows.push("morning");
  if (/\bafternoons?\b/.test(lower)) windows.push("afternoon");
  if (/\bevenings?\b/.test(lower)) windows.push("evening");
  if (/\bnights?\b/.test(lower)) windows.push("night");
  return windows;
}

const DEFAULT_WINDOW_SLOT_TIMES: Record<
  "morning" | "afternoon" | "evening" | "night",
  { minuteOfDay: number; durationMinutes: number; label: string }
> = {
  morning: {
    minuteOfDay: 8 * 60,
    durationMinutes: 45,
    label: "Morning",
  },
  afternoon: {
    minuteOfDay: 13 * 60,
    durationMinutes: 45,
    label: "Afternoon",
  },
  evening: {
    minuteOfDay: 18 * 60,
    durationMinutes: 45,
    label: "Evening",
  },
  night: {
    minuteOfDay: 21 * 60,
    durationMinutes: 45,
    label: "Night",
  },
};

function buildSlotsFromWindows(
  windows: Array<"morning" | "afternoon" | "evening" | "night">,
): LifeOpsDailySlot[] {
  return windows.map((window, index) => {
    const preset = DEFAULT_WINDOW_SLOT_TIMES[window];
    return {
      key:
        windows.indexOf(window) === index ? window : `${window}-${index + 1}`,
      label: preset.label,
      minuteOfDay: preset.minuteOfDay,
      durationMinutes: preset.durationMinutes,
    };
  });
}

function buildDistributedDailySlots(count: number): LifeOpsDailySlot[] {
  const normalizedCount = Math.max(1, Math.min(6, count));
  const presets: Record<number, number[]> = {
    1: [9 * 60],
    2: [8 * 60, 21 * 60],
    3: [8 * 60, 13 * 60, 20 * 60],
    4: [8 * 60, 12 * 60, 16 * 60, 20 * 60],
    5: [8 * 60, 11 * 60, 14 * 60, 17 * 60, 20 * 60],
    6: [8 * 60, 10 * 60, 12 * 60, 14 * 60, 17 * 60, 20 * 60],
  };
  const minutes = presets[normalizedCount] ?? presets[1];
  return minutes.map((minuteOfDay, index) => ({
    key: `slot-${index + 1}`,
    label: `Time ${index + 1}`,
    minuteOfDay,
    durationMinutes: 45,
  }));
}

function formatMinuteOfDayLabel(minuteOfDay: number): string {
  const hour24 = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const meridiem = hour24 >= 12 ? "pm" : "am";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return minute === 0
    ? `${hour12}${meridiem}`
    : `${hour12}:${String(minute).padStart(2, "0")}${meridiem}`;
}

function parseClockToken(token: string): number | null {
  const normalized = token.trim().toLowerCase();
  if (normalized === "noon") {
    return 12 * 60;
  }
  if (normalized === "midnight") {
    return 0;
  }
  const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute >= 60) {
    return null;
  }
  if (hour < 1 || hour > 12) {
    return null;
  }
  const meridiem = match[3];
  const normalizedHour =
    meridiem === "am"
      ? hour % 12
      : hour % 12 === 0
        ? 12
        : hour % 12 + 12;
  return normalizedHour * 60 + minute;
}

function parseTimeOfDayToken(token: string): number | null {
  const normalized = normalizeLifeInputText(token).toLowerCase();
  const hhmmMatch = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmmMatch) {
    const hour = Number(hhmmMatch[1]);
    const minute = Number(hhmmMatch[2]);
    if (
      Number.isFinite(hour) &&
      Number.isFinite(minute) &&
      hour >= 0 &&
      hour <= 23 &&
      minute >= 0 &&
      minute < 60
    ) {
      return hour * 60 + minute;
    }
  }
  return parseClockToken(normalized);
}

function extractExplicitDailySlots(intent: string): LifeOpsDailySlot[] {
  const tokens = [
    ...intent.matchAll(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)|noon|midnight)\b/gi),
  ].map((match) => match[1]);
  const seen = new Set<number>();
  const slots: LifeOpsDailySlot[] = [];
  for (const [index, token] of tokens.entries()) {
    const minuteOfDay = parseClockToken(token);
    if (minuteOfDay === null || seen.has(minuteOfDay)) {
      continue;
    }
    seen.add(minuteOfDay);
    slots.push({
      key: `clock-${index + 1}`,
      label: token.trim(),
      minuteOfDay,
      durationMinutes: 45,
    });
  }
  return slots.sort((left, right) => left.minuteOfDay - right.minuteOfDay);
}

function normalizeLifeWindows(
  value: unknown,
): Array<"morning" | "afternoon" | "evening" | "night"> {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  const normalized = values.flatMap((entry) => {
    if (typeof entry !== "string") {
      return [];
    }
    const lower = normalizeLifeInputText(entry).toLowerCase();
    if (lower === "morning") return ["morning" as const];
    if (lower === "afternoon") return ["afternoon" as const];
    if (lower === "evening") return ["evening" as const];
    if (lower === "night") return ["night" as const];
    return [];
  });
  return [...new Set(normalized)];
}

function normalizeCadenceDetail(value: unknown): LifeOpsCadence | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const cadenceKind =
    typeof record.kind === "string"
      ? normalizeLifeInputText(record.kind).toLowerCase()
      : typeof record.type === "string"
        ? normalizeLifeInputText(record.type).toLowerCase()
        : "";

  if (!cadenceKind) {
    return undefined;
  }

  if (cadenceKind === "once" && typeof record.dueAt === "string") {
    return {
      kind: "once",
      dueAt: record.dueAt,
    };
  }

  if (cadenceKind === "interval") {
    const everyMinutes =
      typeof record.everyMinutes === "number"
        ? record.everyMinutes
        : typeof record.everyMinutes === "string"
          ? Number(record.everyMinutes)
          : typeof record.minutes === "number"
            ? record.minutes
            : typeof record.minutes === "string"
              ? Number(record.minutes)
              : NaN;
    if (Number.isFinite(everyMinutes) && everyMinutes > 0) {
      return {
        kind: "interval",
        everyMinutes,
        windows: normalizeLifeWindows(record.windows),
      };
    }
    return undefined;
  }

  if (cadenceKind === "weekly") {
    const weekdays = Array.isArray(record.weekdays)
      ? record.weekdays
          .map((entry) =>
            typeof entry === "number"
              ? entry
              : typeof entry === "string"
                ? Number(entry)
                : NaN,
          )
          .filter((entry) => Number.isFinite(entry))
      : [];
    if (weekdays.length > 0) {
      return {
        kind: "weekly",
        weekdays,
        windows: normalizeLifeWindows(record.windows),
      };
    }
    return undefined;
  }

  const explicitTimes = Array.isArray(record.times)
    ? record.times
        .map((entry) =>
          typeof entry === "string" ? parseTimeOfDayToken(entry) : null,
        )
        .filter((entry): entry is number => entry !== null)
    : [];
  if (explicitTimes.length > 0) {
    return {
      kind: "times_per_day",
      slots: explicitTimes.map((minuteOfDay, index) => ({
        key: `time-${index + 1}`,
        label: formatMinuteOfDayLabel(minuteOfDay),
        minuteOfDay,
        durationMinutes: 45,
      })),
      visibilityLeadMinutes: 90,
      visibilityLagMinutes: 180,
    };
  }

  if (cadenceKind === "times_per_day") {
    if (Array.isArray(record.slots)) {
      const slots = record.slots
        .map((entry, index) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return null;
          }
          const slot = entry as Record<string, unknown>;
          const minuteOfDay =
            typeof slot.minuteOfDay === "number"
              ? slot.minuteOfDay
              : typeof slot.minuteOfDay === "string"
                ? Number(slot.minuteOfDay)
                : null;
          if (minuteOfDay === null || !Number.isFinite(minuteOfDay)) {
            return null;
          }
          return {
            key:
              typeof slot.key === "string" && slot.key.trim().length > 0
                ? slot.key
                : `slot-${index + 1}`,
            label:
              typeof slot.label === "string" && slot.label.trim().length > 0
                ? slot.label
                : formatMinuteOfDayLabel(minuteOfDay),
            minuteOfDay,
            durationMinutes:
              typeof slot.durationMinutes === "number" &&
              Number.isFinite(slot.durationMinutes) &&
              slot.durationMinutes > 0
                ? slot.durationMinutes
                : 45,
          } satisfies LifeOpsDailySlot;
        })
        .filter((entry): entry is LifeOpsDailySlot => entry !== null);
      if (slots.length > 0) {
        return {
          kind: "times_per_day",
          slots,
          visibilityLeadMinutes:
            typeof record.visibilityLeadMinutes === "number"
              ? record.visibilityLeadMinutes
              : 90,
          visibilityLagMinutes:
            typeof record.visibilityLagMinutes === "number"
              ? record.visibilityLagMinutes
              : 180,
        };
      }
    }

    const count =
      typeof record.count === "number"
        ? record.count
        : typeof record.count === "string"
          ? Number(record.count)
          : NaN;
    if (Number.isFinite(count) && count > 0) {
      return {
        kind: "times_per_day",
        slots: buildDistributedDailySlots(count),
        visibilityLeadMinutes: 90,
        visibilityLagMinutes: 180,
      };
    }
  }

  if (cadenceKind === "daily") {
    const windows = normalizeLifeWindows(record.windows ?? record.window);
    if (windows.length > 0) {
      return {
        kind: "daily",
        windows,
      };
    }
    return {
      kind: "daily",
      windows: ["morning"],
    };
  }

  return undefined;
}

function buildDefaultReminderPlan(
  label: string,
): NonNullable<CreateLifeOpsDefinitionRequest["reminderPlan"]> {
  return {
    steps: [{ channel: "in_app", offsetMinutes: 0, label }],
  };
}

function inferSeedCadenceFromIntent(
  intent: string,
  fallbackWindows: Array<"morning" | "afternoon" | "evening" | "night">,
): LifeOpsCadence | null {
  const lower = intent.toLowerCase();
  const windows = extractIntentWindows(intent);
  const effectiveWindows =
    windows.length > 0 ? windows : fallbackWindows;
  const weeklyMatch =
    lower.match(
      /\b(one|two|three|four|five|six|seven|\d+)\s*(?:x|times?)\s*(?:a|per)\s*week\b/,
    ) ??
    lower.match(/\b(once|twice)\s+a\s+week\b/);
  if (weeklyMatch?.[1]) {
    const count = parseNumberWord(weeklyMatch[1]);
    if (count) {
      return {
        kind: "weekly",
        weekdays: weekdaysForFrequency(count),
        windows: effectiveWindows.length > 0 ? effectiveWindows : ["morning"],
      };
    }
  }
  if (/\bweekly\b/.test(lower)) {
    return {
      kind: "weekly",
      weekdays: [1],
      windows: effectiveWindows.length > 0 ? effectiveWindows : ["morning"],
    };
  }

  const explicitSlots = extractExplicitDailySlots(intent);
  if (explicitSlots.length > 0) {
    return {
      kind: "times_per_day",
      slots: explicitSlots,
      visibilityLeadMinutes: 90,
      visibilityLagMinutes: 180,
    };
  }

  const intervalMatch = lower.match(/\bevery\s+(\d+)\s*(hours?|minutes?)\b/);
  if (intervalMatch) {
    const value = Number(intervalMatch[1]);
    const unit = intervalMatch[2];
    if (Number.isFinite(value) && value > 0) {
      return {
        kind: "interval",
        everyMinutes: /minute/.test(unit) ? value : value * 60,
        windows:
          effectiveWindows.length > 0
            ? effectiveWindows
            : ["morning", "afternoon", "evening"],
      };
    }
  }

  const timesPerDayMatch =
    lower.match(
      /\b(one|two|three|four|five|six|\d+)\s*(?:x|times?)\s*(?:a|per)\s*day\b/,
    ) ?? lower.match(/\b(once|twice)\s+a\s+day\b/);
  if (timesPerDayMatch?.[1]) {
    const count = parseNumberWord(timesPerDayMatch[1]);
    if (count) {
      const slots =
        effectiveWindows.length >= count
          ? buildSlotsFromWindows(effectiveWindows.slice(0, count))
          : buildDistributedDailySlots(count);
      return {
        kind: "times_per_day",
        slots,
        visibilityLeadMinutes: 90,
        visibilityLagMinutes: 180,
      };
    }
  }

  if (
    /\b(morning and night|night and morning|twice a day|two times a day|2x (a|per) day)\b/.test(
      lower,
    ) ||
    windows.length >= 2
  ) {
    return {
      kind: "times_per_day",
      slots: buildSlotsFromWindows(
        effectiveWindows.length > 0
          ? effectiveWindows
          : ["morning", "night"],
      ),
      visibilityLeadMinutes: 90,
      visibilityLagMinutes: 180,
    };
  }

  if (
    /\b(daily|every day|each day|every mornings?|every afternoons?|every evenings?|every nights?|mornings?|afternoons?|evenings?|nights?)\b/.test(
      lower,
    )
  ) {
    return {
      kind: "daily",
      windows: effectiveWindows.length > 0 ? effectiveWindows : ["morning"],
    };
  }

  return null;
}

function sentenceCase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function titleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function trimWords(value: string, maxWords: number): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, maxWords).join(" ");
}

function extractQuotedTitle(intent: string): string | null {
  const matches = [...intent.matchAll(/["“]([^"”]+)["”]/g)];
  const title = matches[matches.length - 1]?.[1]?.trim() ?? "";
  return title.length > 0 ? sentenceCase(title) : null;
}

function tokenizeDerivedSegment(raw: string): string[] {
  const tokens = raw.match(/[a-z0-9][a-z0-9'-]*/gi) ?? [];
  return tokens
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .filter((token) => {
      const lower = token.toLowerCase();
      return (
        !DERIVED_TITLE_STOPWORDS.has(lower) &&
        !DERIVED_TITLE_CADENCE_TOKENS.has(lower)
      );
    });
}

function isGenericDerivedSegment(tokens: string[]): boolean {
  if (tokens.length === 0) {
    return true;
  }
  const normalized = tokens.join(" ").toLowerCase();
  if (GENERIC_DERIVED_TITLE_RE.test(normalized)) {
    return true;
  }
  return tokens.every((token) => GENERIC_DERIVED_TOKENS.has(token.toLowerCase()));
}

function isAuxiliaryDerivedSegment(raw: string): boolean {
  const lower = raw.toLowerCase();
  return /\b(?:block|blocks|blocked|blocking|lock|locks|locked|locking|unlock|unlocks|unlocked|unlocking|until i|do not just|don't just)\b/.test(
    lower,
  );
}

function normalizeDerivedSegment(raw: string): string {
  if (isAuxiliaryDerivedSegment(raw)) {
    return "";
  }
  const tokens = tokenizeDerivedSegment(raw);
  if (
    !tokens.some((token) => /[a-z]/i.test(token)) ||
    isGenericDerivedSegment(tokens)
  ) {
    return "";
  }
  return trimWords(tokens.join(" ").toLowerCase(), 6);
}

function deriveIntentSegments(intent: string): DerivedIntentSegment[] {
  const rawSegments = intent
    .split(/[.!?]/)
    .flatMap((part) => part.split(/\s+(?:and|&)\s+|,/i))
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const segments: DerivedIntentSegment[] = [];
  const seen = new Set<string>();
  for (const raw of rawSegments) {
    const text = normalizeDerivedSegment(raw);
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    segments.push({
      text,
      hasQuantity: /\b\d+\b/.test(raw),
    });
  }
  return segments;
}

function deriveDefinitionTitle(intent: string): string | null {
  const explicitTitle = extractQuotedTitle(intent);
  if (explicitTitle) {
    return explicitTitle;
  }

  const segments = deriveIntentSegments(intent).sort(
    (left, right) =>
      Number(right.hasQuantity) - Number(left.hasQuantity) ||
      right.text.length - left.text.length,
  );
  if (segments.length === 0) {
    return null;
  }
  if (segments.length === 1) {
    return titleCase(segments[0].text);
  }
  return segments.slice(0, 2).map((segment) => titleCase(segment.text)).join(" + ");
}

function deriveGoalTitle(intent: string): string | null {
  const explicitTitle = extractQuotedTitle(intent);
  if (explicitTitle) {
    return explicitTitle;
  }

  const segments = deriveIntentSegments(intent).sort(
    (left, right) => right.text.length - left.text.length,
  );
  if (segments.length === 0) {
    return null;
  }
  return titleCase(trimWords(segments[0].text, 8));
}

function deriveDefinitionDescription(
  intent: string,
  title: string,
): string | undefined {
  const cleaned = intent
    .replace(/[.?!]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) {
    return undefined;
  }
  if (normalizeTitle(cleaned) === normalizeTitle(title)) {
    return undefined;
  }
  return sentenceCase(trimWords(cleaned, 18));
}

function hasSpecificDerivedDefinitionDetails(intent: string): boolean {
  const segments = deriveIntentSegments(intent);
  return segments.some((segment) => segment.hasQuantity);
}

function shouldPreferDerivedDefinitionOverSeed(
  intent: string,
  seed: LifeDefinitionSeed | null,
  derivedTitle: string | null,
): boolean {
  if (!derivedTitle) {
    return false;
  }
  if (!seed) {
    return true;
  }
  if (normalizeTitle(seed.title) === normalizeTitle(derivedTitle)) {
    return false;
  }
  return hasSpecificDerivedDefinitionDetails(intent);
}

function shouldRequireLifeCreateConfirmation(args: {
  confirmed: boolean;
  messageSource: string | undefined;
}): boolean {
  if (args.messageSource === "autonomy") {
    return false;
  }
  return !args.confirmed;
}

function inferLifeDefinitionSeed(intent: string): LifeDefinitionSeed | null {
  const lower = intent.toLowerCase();

  if (/\bbrush(?:ing|ed)?\b/.test(lower) && /\bteeth\b/.test(lower)) {
    const title = "Brush teeth";
    return {
      title,
      kind: "habit",
      cadence:
        inferSeedCadenceFromIntent(intent, ["morning", "night"]) ?? {
          kind: "times_per_day",
          slots: buildSlotsFromWindows(["morning", "night"]),
          visibilityLeadMinutes: 90,
          visibilityLagMinutes: 240,
        },
      description: "Brush your teeth in the morning and again at night.",
      reminderPlan: buildDefaultReminderPlan("Tooth brushing reminder"),
      websiteAccess: inferWebsiteAccessPolicyFromIntent(intent, title),
    };
  }

  if (/\b(work ?out|exercise|gym|lifting|run|running)\b/.test(lower)) {
    const title = "Workout";
    return {
      title,
      kind: "habit",
      cadence:
        inferSeedCadenceFromIntent(intent, ["afternoon", "evening"]) ?? {
          kind: "daily",
          windows: ["afternoon"],
          visibilityLeadMinutes: 120,
          visibilityLagMinutes: 240,
        },
      description: "Exercise in the afternoon and keep your training streak alive.",
      reminderPlan: buildDefaultReminderPlan("Workout reminder"),
      websiteAccess: inferWebsiteAccessPolicyFromIntent(intent, title),
    };
  }

  if (/\binvisalign\b/.test(lower)) {
    const title = "Keep Invisalign in";
    return {
      title,
      kind: "habit",
      cadence:
        inferSeedCadenceFromIntent(intent, ["morning", "afternoon", "evening"]) ?? {
          kind: "interval",
          everyMinutes: 240,
          windows: ["morning", "afternoon", "evening"],
          startMinuteOfDay: 9 * 60,
          maxOccurrencesPerDay: 4,
          visibilityLeadMinutes: 15,
          visibilityLagMinutes: 60,
        },
      description: "Check throughout the day that your Invisalign is back in.",
      reminderPlan: buildDefaultReminderPlan("Invisalign reminder"),
      websiteAccess: inferWebsiteAccessPolicyFromIntent(intent, title),
    };
  }

  if (/\b(drink|drank|hydrat(?:e|ing|ed))\b/.test(lower) && /\bwater\b/.test(lower)) {
    const title = "Drink water";
    return {
      title,
      kind: "habit",
      cadence:
        inferSeedCadenceFromIntent(intent, ["morning", "afternoon", "evening"]) ?? {
          kind: "interval",
          everyMinutes: 180,
          windows: ["morning", "afternoon", "evening"],
          startMinuteOfDay: 9 * 60,
          maxOccurrencesPerDay: 4,
          visibilityLeadMinutes: 15,
          visibilityLagMinutes: 90,
        },
      description: "Hydrate regularly across the day.",
      reminderPlan: buildDefaultReminderPlan("Water reminder"),
      websiteAccess: inferWebsiteAccessPolicyFromIntent(intent, title),
    };
  }

  if (/\bstretch(?:ing|ed)?\b/.test(lower)) {
    const title = "Stretch";
    return {
      title,
      kind: "habit",
      cadence:
        inferSeedCadenceFromIntent(intent, ["afternoon", "evening"]) ?? {
          kind: "interval",
          everyMinutes: 360,
          windows: ["afternoon", "evening"],
          startMinuteOfDay: 12 * 60,
          maxOccurrencesPerDay: 2,
          visibilityLeadMinutes: 15,
          visibilityLagMinutes: 120,
        },
      description: "Take one or two stretch breaks during the day.",
      reminderPlan: buildDefaultReminderPlan("Stretch reminder"),
      websiteAccess: inferWebsiteAccessPolicyFromIntent(intent, title),
    };
  }

  if (/\bvitamins?\b/.test(lower)) {
    const title = "Take vitamins";
    const mealWindows =
      /\bbreakfast\b/.test(lower) || /\bmorning\b/.test(lower)
        ? (["morning"] as const)
        : /\blunch\b/.test(lower)
          ? (["afternoon"] as const)
          : /\bdinner\b/.test(lower) || /\bnight\b/.test(lower)
            ? (["night"] as const)
            : (["morning"] as const);
    const normalizedMealWindows = [
      ...mealWindows,
    ] as Array<"morning" | "afternoon" | "evening" | "night">;
    return {
      title,
      kind: "habit",
      cadence:
        inferSeedCadenceFromIntent(intent, normalizedMealWindows) ?? {
          kind: "daily",
          windows: normalizedMealWindows,
          visibilityLeadMinutes: 60,
          visibilityLagMinutes: 180,
        },
      description: "Take your vitamins with a meal at the right part of the day.",
      reminderPlan: buildDefaultReminderPlan("Vitamin reminder"),
      websiteAccess: inferWebsiteAccessPolicyFromIntent(intent, title),
    };
  }

  if (/\bshower(?:ing)?\b/.test(lower)) {
    const title = "Shower";
    return {
      title,
      kind: "habit",
      cadence:
        inferSeedCadenceFromIntent(intent, ["morning", "night"]) ?? {
          kind: "weekly",
          weekdays: [1, 3, 6],
          windows: ["morning", "night"],
          visibilityLeadMinutes: 120,
          visibilityLagMinutes: 360,
        },
      description: "Stay on top of your weekly shower cadence.",
      reminderPlan: buildDefaultReminderPlan("Shower reminder"),
      websiteAccess: inferWebsiteAccessPolicyFromIntent(intent, title),
    };
  }

  if (/\bshav(?:e|ing|ed)\b/.test(lower)) {
    const title = "Shave";
    return {
      title,
      kind: "habit",
      cadence:
        inferSeedCadenceFromIntent(intent, ["morning"]) ?? {
          kind: "weekly",
          weekdays: [2, 5],
          windows: ["morning"],
          visibilityLeadMinutes: 120,
          visibilityLagMinutes: 360,
        },
      description: "Keep your shaving cadence on track through the week.",
      reminderPlan: buildDefaultReminderPlan("Shave reminder"),
      websiteAccess: inferWebsiteAccessPolicyFromIntent(intent, title),
    };
  }

  return null;
}

function describeReminderIntensity(
  intensity: LifeOpsReminderIntensity,
): string {
  switch (intensity) {
    case "minimal":
      return "minimal";
    case "normal":
      return "normal";
    case "persistent":
      return "persistent";
    case "high_priority_only":
      return "high priority only";
  }
  return "normal";
}

// ── Main action ───────────────────────────────────────

export const lifeAction: Action = {
  name: "LIFE",
  similes: [
    "MANAGE_LIFEOPS",
    "QUERY_LIFEOPS",
    "CREATE_TASK",
    "CREATE_HABIT",
    "CREATE_GOAL",
    "TRACK_HABIT",
    "COMPLETE_TASK",
    "SNOOZE_REMINDER",
    "SET_REMINDER_INTENSITY",
  ],
  description:
    "Manage the user's personal routines, habits, goals, reminders, and escalation settings through LifeOps. " +
    "USE this action for: creating, editing, or deleting tasks, habits, routines, and goals; " +
    "helping the user actually set up follow-through when they say things like 'help me brush my teeth every day', 'i keep forgetting x', or 'help me actually do it'; " +
    "marking items as complete, skipping, or snoozing them; reviewing goal progress; " +
    "setting up phone/SMS escalation channels; adjusting reminder frequency or intensity; " +
    "querying an overview of active LifeOps items. " +
    "DO NOT use this action for Gmail inbox triage, email search, drafting or sending emails — use GMAIL_ACTION instead. " +
    "DO NOT use this action for calendar lookups, scheduling meetings, searching events, or travel itineraries — use CALENDAR_ACTION instead. " +
    "This action provides the final grounded reply; do not pair it with a speculative REPLY action or fall back to advice-only chat when the user wants real LifeOps follow-through.",
  suppressPostActionContinuation: true,
  validate: async (runtime, message) => {
    return hasLifeOpsAccess(runtime, message);
  },
  handler: async (runtime, message, state, options) => {
    if (!(await hasLifeOpsAccess(runtime, message))) {
      return {
        success: false,
        text: "Life management is restricted to the owner, explicitly granted users, and the agent.",
      };
    }

    const rawParams = (options as HandlerOptions | undefined)?.parameters as LifeParams | undefined;
    const params = rawParams ?? {} as LifeParams;
    const currentText = normalizeLifeInputText(messageText(message));
    const details = params.details;
    const deferredDraft = latestDeferredLifeDraft(state);
    const reuseDeferredDraft = shouldReuseDeferredLifeDraft({
      currentText,
      details,
      draft: deferredDraft,
      explicitAction: params.action,
      paramsIntent: params.intent,
      target: params.target,
      title: params.title,
    });
    const intent = reuseDeferredDraft
      ? normalizeLifeInputText(deferredDraft?.intent ?? "")
      : normalizeLifeInputText(params.intent?.trim() ?? currentText);
    if (!intent) {
      return { success: false, text: "LIFE requires an intent describing what to do." };
    }

    const explicitOperation = params.action && ACTION_TO_OPERATION[params.action];
    const operation =
      reuseDeferredDraft && deferredDraft
        ? deferredDraft.operation
        : await resolveLifeOperation({
            runtime,
            message,
            state,
            intent,
            explicitOperation,
          });
    const service = new LifeOpsService(runtime);
    const domain = detailString(details, "domain") as LifeOpsDomain | undefined;
    const ownership = requestedOwnership(domain);
    const chatText = intent;
    const inferredSeed = inferLifeDefinitionSeed(intent);
    const targetName = params.target ?? params.title ?? inferredSeed?.title;
    const createConfirmed =
      reuseDeferredDraft || detailBoolean(details, "confirmed") === true;

    try {
    const createDefinition = async () => {
      const deferredDefinitionDraft =
        reuseDeferredDraft && deferredDraft?.operation === "create_definition"
          ? deferredDraft
          : null;
      const seed = inferredSeed;
      const derivedTitle = deriveDefinitionTitle(intent);
      const preferDerivedDefinition = shouldPreferDerivedDefinitionOverSeed(
        intent,
        seed ?? null,
        derivedTitle,
      );
      const title =
        deferredDefinitionDraft?.request.title ??
        params.title ??
        (preferDerivedDefinition ? derivedTitle : seed?.title ?? derivedTitle);
      const cadence =
        deferredDefinitionDraft?.request.cadence ??
        normalizeCadenceDetail(detailObject(details, "cadence")) ??
        (preferDerivedDefinition ? undefined : seed?.cadence) ??
        inferSeedCadenceFromIntent(intent, ["morning"]);
      if (!title) {
        return {
          success: false as const,
          text: "I need a name for this item. What should I call it?",
        };
      }
      if (!cadence) {
        return {
          success: false as const,
          text: "I need to know the schedule. How often should this happen?",
        };
      }
      const kind =
        deferredDefinitionDraft?.request.kind ??
        (detailString(details, "kind") as
          | CreateLifeOpsDefinitionRequest["kind"]
          | undefined) ??
        seed?.kind ??
        "habit";
      const definitionDraft: DeferredLifeDefinitionDraft =
        deferredDefinitionDraft ?? {
          intent,
          operation: "create_definition",
          request: {
            cadence,
            description:
              detailString(details, "description") ??
              (preferDerivedDefinition
                ? deriveDefinitionDescription(intent, title)
                : seed?.description),
            goalRef:
              detailString(details, "goalId") ??
              detailString(details, "goalTitle") ??
              undefined,
            kind,
            priority: detailNumber(details, "priority"),
            progressionRule: detailObject(
              details,
              "progressionRule",
            ) as CreateLifeOpsDefinitionRequest["progressionRule"],
            reminderPlan:
              (detailObject(details, "reminderPlan") as
                | CreateLifeOpsDefinitionRequest["reminderPlan"]
                | undefined) ??
              (preferDerivedDefinition
                ? buildDefaultReminderPlan(`${title} reminder`)
                : seed?.reminderPlan),
            title,
            websiteAccess:
              (detailObject(details, "websiteAccess") as unknown as
                | CreateLifeOpsDefinitionRequest["websiteAccess"]
                | undefined) ?? seed?.websiteAccess,
          },
        };
      if (
        shouldRequireLifeCreateConfirmation({
          confirmed: createConfirmed,
          messageSource:
            typeof message.content?.source === "string"
              ? message.content.source
              : undefined,
        })
      ) {
        return {
          success: true as const,
          text: `I can save this as a ${definitionDraft.request.kind} named "${definitionDraft.request.title}" that happens ${summarizeCadence(definitionDraft.request.cadence)}. Confirm and I'll save it, or tell me what to change.`,
          data: {
            actionName: "LIFE",
            deferred: true,
            lifeDraft: definitionDraft,
            preview: {
              cadence: definitionDraft.request.cadence,
              kind: definitionDraft.request.kind,
              title: definitionDraft.request.title,
            },
          },
        };
      }
      const resolvedGoal = definitionDraft.request.goalRef
        ? await resolveGoal(service, definitionDraft.request.goalRef, domain)
        : null;

      const created = await service.createDefinition({
        ownership,
        kind: definitionDraft.request.kind,
        title: definitionDraft.request.title,
        description: definitionDraft.request.description,
        originalIntent: definitionDraft.intent || definitionDraft.request.title,
        cadence: definitionDraft.request.cadence,
        priority: definitionDraft.request.priority,
        progressionRule: definitionDraft.request.progressionRule,
        reminderPlan: definitionDraft.request.reminderPlan,
        websiteAccess: definitionDraft.request.websiteAccess,
        goalId: resolvedGoal?.goal.id ?? null,
        source: "chat",
      });
      return {
        success: true as const,
        text: `Saved "${created.definition.title}" as ${summarizeCadence(created.definition.cadence)}.`,
        data: toActionData(created),
      };
    };

    // ── Queries ─────────────────────────────────────

    if (operation === "query_calendar_today" || operation === "query_calendar_next") {
      const google = await getGoogleCapabilityStatus(service);
      if (!google.hasCalendarRead) {
        return {
          success: false,
          text: calendarReadUnavailableMessage(google),
        };
      }
      if (operation === "query_calendar_next") {
        const ctx = await service.getNextCalendarEventContext(INTERNAL_URL);
        return { success: true, text: formatNextEventContext(ctx), data: toActionData(ctx) };
      }
      const timeRangeHint = intent.toLowerCase();
      const range = /\btomorrow\b/.test(timeRangeHint) ? dayRange(1)
        : /\b(this week|week)\b/.test(timeRangeHint) ? weekRange()
        : dayRange(0);
      const label = /\btomorrow\b/.test(timeRangeHint) ? "tomorrow"
        : /\b(this week|week)\b/.test(timeRangeHint) ? "this week"
        : "today";
      const feed = await service.getCalendarFeed(INTERNAL_URL, { timeMin: range.timeMin, timeMax: range.timeMax });
      return { success: true, text: formatCalendarFeed(feed, label), data: toActionData(feed) };
    }

    if (operation === "query_email") {
      const google = await getGoogleCapabilityStatus(service);
      if (!google.hasGmailTriage) {
        return {
          success: false,
          text: gmailReadUnavailableMessage(google),
        };
      }
      const limit = detailNumber(details, "limit") ?? 10;
      const feed = await service.getGmailTriage(INTERNAL_URL, { maxResults: limit });
      return { success: true, text: formatEmailTriage(feed), data: toActionData(feed) };
    }

    if (operation === "query_overview") {
      const overview = await service.getOverview();
      return { success: true, text: formatOverview(overview), data: toActionData(overview) };
    }

    // ── Mutations ───────────────────────────────────

    if (operation === "create_definition") {
      return await createDefinition();
    }

    if (operation === "create_goal") {
      const deferredGoalDraft =
        reuseDeferredDraft && deferredDraft?.operation === "create_goal"
          ? deferredDraft
          : null;
      const title =
        deferredGoalDraft?.request.title ??
        params.title ??
        deriveGoalTitle(intent);
      if (!title) return { success: false, text: "I need a name for this goal. What are you trying to achieve?" };
      const goalDraft: DeferredLifeGoalDraft =
        deferredGoalDraft ?? {
          intent,
          operation: "create_goal",
          request: {
            cadence: normalizeCadenceDetail(detailObject(details, "cadence")) as CreateLifeOpsGoalRequest["cadence"],
            description: detailString(details, "description"),
            successCriteria: detailObject(details, "successCriteria"),
            supportStrategy: detailObject(details, "supportStrategy"),
            title,
          },
        };
      if (
        shouldRequireLifeCreateConfirmation({
          confirmed: createConfirmed,
          messageSource:
            typeof message.content?.source === "string"
              ? message.content.source
              : undefined,
        })
      ) {
        return {
          success: true,
          text: `I can save this goal as "${goalDraft.request.title}". Confirm and I'll save it, or tell me what to change.`,
          data: {
            actionName: "LIFE",
            deferred: true,
            lifeDraft: goalDraft,
            preview: {
              title: goalDraft.request.title,
            },
          },
        };
      }
      const created = await service.createGoal({
        ownership,
        title: goalDraft.request.title,
        description: goalDraft.request.description,
        cadence: goalDraft.request.cadence,
        supportStrategy: goalDraft.request.supportStrategy,
        successCriteria: goalDraft.request.successCriteria,
        metadata: {
          source: "chat",
          originalIntent: goalDraft.intent || goalDraft.request.title,
        },
      });
      return { success: true, text: `Saved goal "${created.goal.title}".`, data: toActionData(created) };
    }

    if (operation === "update_definition") {
      const target = await resolveDefinition(service, targetName, domain);
      if (!target) return { success: false, text: "I could not find that item to update." };
      const request: UpdateLifeOpsDefinitionRequest = {
        ownership,
        title: params.title !== target.definition.title ? params.title : undefined,
        description: detailString(details, "description"),
        cadence: normalizeCadenceDetail(detailObject(details, "cadence")),
        priority: detailNumber(details, "priority"),
        reminderPlan: detailObject(details, "reminderPlan") as UpdateLifeOpsDefinitionRequest["reminderPlan"],
      };
      const updated = await service.updateDefinition(target.definition.id, request);
      return { success: true, text: `Updated "${updated.definition.title}".`, data: toActionData(updated) };
    }

    if (operation === "update_goal") {
      const target = await resolveGoal(service, targetName, domain);
      if (!target) return { success: false, text: "I could not find that goal to update." };
      const request: UpdateLifeOpsGoalRequest = {
        ownership,
        title: params.title !== target.goal.title ? params.title : undefined,
        description: detailString(details, "description"),
        supportStrategy: detailObject(details, "supportStrategy"),
        successCriteria: detailObject(details, "successCriteria"),
      };
      const updated = await service.updateGoal(target.goal.id, request);
      return { success: true, text: `Updated goal "${updated.goal.title}".`, data: toActionData(updated) };
    }

    if (operation === "delete_definition") {
      const target = await resolveDefinition(service, targetName, domain);
      if (!target) return { success: false, text: "I could not find that item to delete." };
      await service.deleteDefinition(target.definition.id);
      return { success: true, text: `Deleted "${target.definition.title}" and its occurrences.` };
    }

    if (operation === "delete_goal") {
      const target = await resolveGoal(service, targetName, domain);
      if (!target) return { success: false, text: "I could not find that goal to delete." };
      await service.deleteGoal(target.goal.id);
      return { success: true, text: `Deleted goal "${target.goal.title}".` };
    }

    if (operation === "complete_occurrence") {
      const target = await resolveOccurrence(service, targetName, domain);
      if (!target) {
        if (
          shouldRecoverMissingOccurrenceAsCreate(intent, inferredSeed ?? undefined)
        ) {
          return await createDefinition();
        }
        return { success: false, text: "I could not find that active item to complete." };
      }
      const completed = await service.completeOccurrence(target.id, { note: detailString(details, "note") });
      return { success: true, text: `Marked "${completed.title}" done.`, data: toActionData(completed) };
    }

    if (operation === "skip_occurrence") {
      const target = await resolveOccurrence(service, targetName, domain);
      if (!target) return { success: false, text: "I could not find that active item to skip." };
      const skipped = await service.skipOccurrence(target.id);
      return { success: true, text: `Skipped "${skipped.title}".`, data: toActionData(skipped) };
    }

    if (operation === "snooze_occurrence") {
      const target = await resolveOccurrence(service, targetName, domain);
      if (!target) return { success: false, text: "I could not find that active item to snooze." };
      const preset = detailString(details, "preset") as "15m" | "30m" | "1h" | "tonight" | "tomorrow_morning" | undefined;
      const minutes = detailNumber(details, "minutes");
      const snoozed = await service.snoozeOccurrence(target.id, { preset, minutes });
      return { success: true, text: `Snoozed "${snoozed.title}".`, data: toActionData(snoozed) };
    }

    if (operation === "review_goal") {
      const target = await resolveGoal(service, targetName, domain);
      if (!target) return { success: false, text: "I could not find that goal to review." };
      const review = await service.reviewGoal(target.goal.id);
      return { success: true, text: review.summary.explanation, data: toActionData(review) };
    }

    if (operation === "set_reminder_preference") {
      const intensity = inferReminderIntensityFromIntent(intent);
      if (!intensity) {
        return {
          success: false,
          text:
            "I need to know whether you want reminders minimal, normal, persistent, or high priority only.",
        };
      }
      const target = await resolveDefinitionFromIntent(
        service,
        targetName,
        intent,
        domain,
      );
      const request: SetLifeOpsReminderPreferenceRequest = {
        intensity,
        definitionId: target?.definition.id ?? null,
        note: chatText || intent,
      };
      const preference = await service.setReminderPreference(request);
      if (target) {
        return {
          success: true,
          text:
            intensity === "high_priority_only"
              ? `Reminder intensity for "${target.definition.title}" is now high priority only.`
              : `Reminder intensity for "${target.definition.title}" is now ${describeReminderIntensity(preference.effective.intensity)}.`,
          data: toActionData(preference),
        };
      }
      return {
        success: true,
        text:
          intensity === "high_priority_only"
            ? "Global LifeOps reminders are now high priority only."
            : `Global LifeOps reminders are now ${describeReminderIntensity(preference.effective.intensity)}.`,
        data: toActionData(preference),
      };
    }

    if (operation === "capture_phone") {
      const phoneNumber = detailString(details, "phoneNumber") ?? params.title;
      if (!phoneNumber) return { success: false, text: "I need a phone number to set up SMS or voice contact." };
      const allowSms = detailBoolean(details, "allowSms") ?? true;
      const allowVoice = detailBoolean(details, "allowVoice") ?? false;
      const result = await service.capturePhoneConsent({
        phoneNumber, consentGiven: true, allowSms, allowVoice, privacyClass: "private",
      });
      const channels: string[] = [];
      if (allowSms) channels.push("SMS");
      if (allowVoice) channels.push("voice calls");
      return { success: true, text: `Phone number ${result.phoneNumber} saved. Enabled for: ${channels.join(" and ") || "reminders"}.`, data: toActionData(result) };
    }

    if (operation === "configure_escalation") {
      const target = await resolveDefinition(service, targetName, domain);
      if (!target) return { success: false, text: "I could not find that item to configure its reminders." };
      const rawSteps = detailArray(details, "steps") ?? detailArray(details, "escalationSteps");
      const steps: LifeOpsReminderStep[] = rawSteps
        ? rawSteps.filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null).map((s) => ({
            channel: String(s.channel ?? "in_app") as LifeOpsReminderStep["channel"],
            offsetMinutes: typeof s.offsetMinutes === "number" ? s.offsetMinutes : 0,
            label: typeof s.label === "string" ? s.label : String(s.channel ?? "reminder"),
          }))
        : [{ channel: "in_app", offsetMinutes: 0, label: "In-app reminder" }];
      const updated = await service.updateDefinition(target.definition.id, {
        ownership,
        reminderPlan: { steps },
      });
      const summary = steps.map((s) => `${s.channel} at +${s.offsetMinutes}m`).join(", ");
      return { success: true, text: `Updated reminder plan for "${updated.definition.title}": ${summary}.`, data: toActionData(updated) };
    }

    return { success: false, text: "I didn't understand that life management request." };

    } catch (err) {
      if (err instanceof LifeOpsServiceError) {
        return { success: false, text: err.message };
      }
      throw err;
    }
  },
  parameters: [
    {
      name: "action",
      description:
        "What kind of life operation to perform.",
      required: false,
      schema: {
        type: "string" as const,
        enum: [
          "create",
          "create_goal",
          "update",
          "update_goal",
          "delete",
          "delete_goal",
          "complete",
          "skip",
          "snooze",
          "review",
          "phone",
          "escalation",
          "reminder_preference",
          "calendar",
          "next_event",
          "email",
          "overview",
        ],
      },
    },
    {
      name: "intent",
      description:
        'Natural language description of what to do. Examples: "create a daily brushing habit for morning and night", "snooze brushing for 30 minutes", "what\'s on my calendar today".',
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "title",
      description: "Name for a new item, or the name of an existing item to act on.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "target",
      description: "Name or ID of an existing item when different from title (e.g., when renaming).",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "details",
      description:
        "Structured data when needed. May include: cadence (schedule object), kind (task/habit/routine), description, priority, progressionRule, reminderPlan, confirmed (boolean when the user explicitly approves a previewed create), preset (snooze preset like 15m/30m/1h/tonight/tomorrow_morning), minutes (snooze minutes), phoneNumber, allowSms, allowVoice, steps (escalation steps array), goalId, goalTitle, supportStrategy, successCriteria, note, limit, domain (user_lifeops/agent_ops), or reminder preference targeting.",
      required: false,
      schema: { type: "object" as const },
    },
  ],
  examples: [
    [
      {
        name: "{{name1}}",
        content: {
          text: "help me brush my teeth at 8 am and 9 pm every day",
        },
      },
      {
        name: "{{agentName}}",
        content: {
          text: 'I can set up a habit named "Brush teeth" for 8 am and 9 pm daily. Confirm and I\'ll save it.',
          actions: ["LIFE"],
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "remind me less about brush teeth",
        },
      },
      {
        name: "{{agentName}}",
        content: {
          text: 'Reminder intensity for "Brush teeth" is now minimal.',
          actions: ["LIFE"],
        },
      },
    ],
  ],
};
