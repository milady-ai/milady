import type { IAgentRuntime, Memory, State } from "@elizaos/core";
import { ModelType, parseJSONObjectFromText, parseKeyValueXml } from "@elizaos/core";

export const LIFE_OPERATION_VALUES = [
  "create_definition",
  "create_goal",
  "update_definition",
  "update_goal",
  "delete_definition",
  "delete_goal",
  "complete_occurrence",
  "skip_occurrence",
  "snooze_occurrence",
  "review_goal",
  "capture_phone",
  "configure_escalation",
  "set_reminder_preference",
  "query_calendar_today",
  "query_calendar_next",
  "query_email",
  "query_overview",
] as const;

export type ExtractedLifeOperation = (typeof LIFE_OPERATION_VALUES)[number];

type ExtractedLifeOperationPlan = {
  operation: ExtractedLifeOperation | null;
  confidence: number | null;
};

function messageText(message: Memory): string {
  const text = message.content?.text;
  return typeof text === "string" ? text.trim() : "";
}

function splitStateTextCandidates(value: string): string[] {
  return value
    .split(/\n+/)
    .map((line) =>
      line
        .replace(
          /^(?:user|assistant|system|owner|admin|shaw|chen|eliza)\s*:\s*/i,
          "",
        )
        .trim(),
    )
    .filter((line) => line.length > 0);
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

function normalizeOperation(
  value: unknown,
): ExtractedLifeOperation | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return LIFE_OPERATION_VALUES.includes(
    normalized as ExtractedLifeOperation,
  )
    ? (normalized as ExtractedLifeOperation)
    : null;
}

function normalizeConfidence(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value));
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.min(1, parsed));
    }
  }
  return null;
}

export async function extractLifeOperationWithLlm(args: {
  runtime: IAgentRuntime;
  message: Memory;
  state: State | undefined;
  intent: string;
}): Promise<ExtractedLifeOperationPlan> {
  const { runtime, message, state, intent } = args;
  if (typeof runtime.useModel !== "function") {
    return { operation: null, confidence: null };
  }

  const recentConversation = stateTextCandidates(state).slice(-8).join("\n");
  const currentMessage = messageText(message);
  const prompt = [
    "Classify the LifeOps request into exactly one operation.",
    "The user may speak in any language.",
    "Use the current request plus recent conversation context.",
    "You MUST always return an operation — never return null. Pick the closest match even if uncertain.",
    "",
    "Operations and when to use each:",
    "  create_definition — create a new habit, routine, task, or repeated reminder (e.g. 'remind me to brush my teeth every night')",
    "  create_goal — create an aspiration or goal without a routine cadence (e.g. 'I want to run a marathon')",
    "  update_definition — edit, rename, reschedule, or modify an existing task/habit/routine (e.g. 'change my workout to 6am')",
    "  update_goal — edit or modify an existing goal (e.g. 'update my marathon goal to June')",
    "  delete_definition — delete, remove, cancel, or stop tracking a task/habit/routine (e.g. 'stop tracking my meditation')",
    "  delete_goal — delete or remove a goal (e.g. 'delete my marathon goal')",
    "  complete_occurrence — mark an item as done (e.g. 'I brushed my teeth', 'done with workout', 'I did it')",
    "  skip_occurrence — skip an item for today (e.g. 'skip brushing', 'not today', 'pass on workout')",
    "  snooze_occurrence — postpone or defer an item (e.g. 'snooze', 'remind me later', 'push it back')",
    "  review_goal — check progress on a goal (e.g. 'how am I doing on my marathon goal', 'review my progress')",
    "  capture_phone — save or confirm a phone number (e.g. 'my number is 555-1234', 'text me at...')",
    "  configure_escalation — set up SMS/voice/call escalation (e.g. 'text me if I ignore the reminder', 'call me if I miss it')",
    "  set_reminder_preference — adjust reminder frequency (e.g. 'less reminders', 'more reminders', 'pause reminders', 'high priority only')",
    "  query_calendar_today — today's/tomorrow's/this week's schedule (e.g. 'what's on my calendar today')",
    "  query_calendar_next — next upcoming event (e.g. 'what's my next meeting')",
    "  query_email — inbox/email status (e.g. 'any new emails', 'who emailed me')",
    "  query_overview — broad status summary (e.g. 'what's active', 'show me everything', 'overview')",
    "",
    "Examples:",
    '  "I brushed my teeth" → operation: complete_occurrence, confidence: 0.95',
    '  "less reminders please" → operation: set_reminder_preference, confidence: 0.9',
    '  "remind me to take vitamins every morning" → operation: create_definition, confidence: 0.95',
    '  "how am I doing on my reading goal" → operation: review_goal, confidence: 0.9',
    "",
    "TOON only. Return exactly one TOON document. No prose before or after it. No <think>.",
    "",
    "Example:",
    "operation: create_definition",
    "confidence: 0.0",
    "",
    `Allowed operations: ${LIFE_OPERATION_VALUES.join(", ")}`,
    `Current request: ${JSON.stringify(currentMessage)}`,
    `Resolved intent: ${JSON.stringify(intent)}`,
    `Recent conversation: ${JSON.stringify(recentConversation)}`,
  ].join("\n");

  let rawResponse = "";
  try {
    const result = await runtime.useModel(ModelType.TEXT_SMALL, { prompt });
    rawResponse = typeof result === "string" ? result : "";
  } catch (error) {
    runtime.logger?.warn?.(
      {
        src: "action:life",
        error: error instanceof Error ? error.message : String(error),
      },
      "Life operation extraction model call failed",
    );
    return { operation: null, confidence: null };
  }

  const parsed =
    parseKeyValueXml<Record<string, unknown>>(rawResponse) ??
    parseJSONObjectFromText(rawResponse);
  if (!parsed) {
    return { operation: null, confidence: null };
  }

  return {
    operation: normalizeOperation(parsed.operation),
    confidence: normalizeConfidence(parsed.confidence),
  };
}
