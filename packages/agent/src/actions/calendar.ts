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
  CreateLifeOpsCalendarEventAttendee,
  CreateLifeOpsCalendarEventRequest,
  GetLifeOpsCalendarFeedRequest,
  LifeOpsCalendarEvent,
} from "@miladyai/shared/contracts/lifeops";
import { LifeOpsService, LifeOpsServiceError } from "../lifeops/service.js";
import { resolveDefaultTimeZone } from "../lifeops/defaults.js";
import {
  addDaysToLocalDate,
  buildUtcDateFromLocalParts,
  getZonedDateParts,
} from "../lifeops/time.js";
import {
  calendarReadUnavailableMessage,
  calendarWriteUnavailableMessage,
  detailArray,
  detailBoolean,
  detailNumber,
  detailString,
  formatCalendarFeed,
  formatNextEventContext,
  futureRange,
  getGoogleCapabilityStatus,
  hasLifeOpsAccess,
  INTERNAL_URL,
  messageText,
  toActionData,
} from "./lifeops-google-helpers.js";

type CalendarSubaction =
  | "feed"
  | "next_event"
  | "search_events"
  | "create_event"
  | "trip_window";

type TripWindowIntent = {
  location: string;
};

export type CalendarLlmPlan = {
  subaction: CalendarSubaction | null;
  queries: string[];
  title?: string;
  tripLocation?: string;
};

const MIN_CREATE_EVENT_DURATION_MINUTES = 15;

type CalendarActionParams = {
  subaction?: CalendarSubaction;
  intent?: string;
  title?: string;
  query?: string;
  queries?: string[];
  details?: Record<string, unknown>;
};

const WEAK_CONFIRMATION_PATTERN =
  /^(?:yes|yeah|yep|yup|ok|okay|sure|please|please do|do it|go ahead|sounds good|mm-?hmm|mhm|uh-?huh)$/i;
const CALENDAR_SUBJECT_PATTERN =
  /\b(calendar|schedule|event|events|flight|flights|fly|travel|trip|return|meeting|appointment)\b/;
const FOLLOW_UP_PATTERN =
  /\b(today|tomorrow|tonight|this week|next week|the week after|week after next|this month|next month|find it|look it up|check again|try to find|try again|retry)\b/i;
const PARAMETER_DOC_NOISE_PATTERN =
  /\b(?:actions?|params?|parameters?|query\?:string|subaction\?:string|details\?:object|required parameter|supported keys include|may include:|match against titles|structured calendar arguments|structured data when needed|boolean when)\b|\b\w+\?:\w+\b/i;
const WEAK_CALENDAR_QUERY_PATTERN =
  /^(?:again|retry|try again|check again|find it|look it up|it|that|them|those|this)$/i;
const CALENDAR_DETAIL_ALIASES = {
  calendarId: ["calendarid", "calendar_id"],
  timeMin: ["timemin", "time_min"],
  timeMax: ["timemax", "time_max"],
  timeZone: ["timezone", "time_zone"],
  forceSync: ["forcesync", "force_sync"],
  windowDays: ["windowdays", "window_days"],
  startAt: ["startat", "start_at"],
  endAt: ["endat", "end_at"],
  durationMinutes: ["durationminutes", "duration_minutes"],
  windowPreset: ["windowpreset", "window_preset"],
} as const;

function normalizeCalendarSubaction(
  value: unknown,
): CalendarSubaction | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case "feed":
    case "next_event":
    case "search_events":
    case "create_event":
    case "trip_window":
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

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length >= 2);
}

function tokenVariants(token: string): string[] {
  const normalized = token.trim().toLowerCase();
  if (!normalized) {
    return [];
  }
  const variants = new Set([normalized]);
  if (normalized.endsWith("ies") && normalized.length > 3) {
    variants.add(`${normalized.slice(0, -3)}y`);
  }
  if (normalized.endsWith("es") && normalized.length > 4) {
    variants.add(normalized.slice(0, -2));
  }
  if (
    normalized.endsWith("s") &&
    !normalized.endsWith("ss") &&
    normalized.length > 3
  ) {
    variants.add(normalized.slice(0, -1));
  }
  return [...variants];
}

function tokenizeForSearch(value: string): string[] {
  return [...new Set(tokenize(value).flatMap((token) => tokenVariants(token)))];
}

function normalizeCalendarSearchQueryValue(
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
      /\b(?:search|find|look(?:ing)? for|show me|check)\s+(?:my\s+)?(?:calendar|schedule)\s+for\b/g,
      "",
    )
    .replace(/\b(?:search|find|look(?:ing)? for|show me|check)\b/g, "")
    .replace(/\b(?:on|in) my calendar\b/g, "")
    .replace(
      /\b(?:today|tomorrow|tonight|this week(?:end)?|next week(?:end)?|week after(?: next)?|this month|next month|this year|next year)\b/g,
      "",
    )
    .replace(/\b(?:scheduled|coming up|happening|for me)\b/g, "")
    .replace(/\b(?:events?|appointments?|meetings?)\b$/g, "")
    .replace(/\bsupported keys include\b.*$/g, "")
    .replace(/\bmatch against titles\b.*$/g, "")
    .replace(/\bstructured calendar arguments\b.*$/g, "")
    .replace(/[;:,]+/g, " ")
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")
    .trim();

  if (
    !cleaned ||
    ["calendar", "schedule", "event", "events"].includes(cleaned) ||
    WEAK_CALENDAR_QUERY_PATTERN.test(cleaned) ||
    PARAMETER_DOC_NOISE_PATTERN.test(cleaned)
  ) {
    return undefined;
  }
  return cleaned;
}

function dedupeCalendarQueries(queries: Array<string | undefined>): string[] {
  const normalized = queries
    .map((query) => normalizeCalendarSearchQueryValue(query))
    .filter((query): query is string => Boolean(query));
  return [...new Set(normalized)];
}

function normalizeCalendarDetails(
  details: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!details) {
    return undefined;
  }

  const normalized: Record<string, unknown> = { ...details };
  const aliasMap = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(CALENDAR_DETAIL_ALIASES)) {
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

function splitStateTextCandidates(value: string): string[] {
  return value
    .split(/\n+/)
    .map((line) =>
      line
        .replace(/^(?:user|assistant|system|owner|admin|shaw|chen|eliza)\s*:\s*/i, "")
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

function scoreIntentCandidate(value: string): number {
  const normalized = normalizeText(value);
  if (!normalized) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = Math.min(normalized.length, 160) / 16;
  if (WEAK_CONFIRMATION_PATTERN.test(normalized)) {
    score -= 200;
  }
  if (PARAMETER_DOC_NOISE_PATTERN.test(normalized)) {
    score -= 500;
  }
  if (/\b(calendar|schedule|event|events)\b/.test(normalized)) {
    score += 10;
  }
  if (
    /\b(flight|flights|travel|trip|hotel|stay|dentist|appointment|meeting)\b/.test(
      normalized,
    )
  ) {
    score += 14;
  }
  if (
    /\b(today|tomorrow|tonight|this week|next week|this month|next month|weekend)\b/.test(
      normalized,
    )
  ) {
    score += 10;
  }
  if (
    /\b(do i have|are there|find|search|look(?:ing)? for|show me|check)\b/.test(
      normalized,
    )
  ) {
    score += 8;
  }
  return score;
}

function looksLikeCalendarResultSummary(value: string): boolean {
  const trimmed = value.trim();
  return (
    /^(?:events\b|no events\b|found \d+ calendar event|no calendar events matched|i couldn't find any upcoming calendar events|your matching (?:flight|calendar event) is|next event:|here's what's on your calendar while you're in)/i.test(
      trimmed,
    ) || /^- \*\*/.test(trimmed)
  );
}

function looksLikeNarrativeCalendarQuery(value: string): boolean {
  const normalized = normalizeText(value);
  if (!normalized) {
    return false;
  }

  return (
    /\b(?:tell me if|let me know if|whether|can you|could you|would you|do i have|are there|what(?:'s| is) on|what(?: event| events)? do i have|when do i|try to find)\b/.test(
      normalized,
    ) &&
    /\b(?:calendar|schedule|event|events|flight|flights|travel|trip|appointment|meeting|hotel|stay|return)\b/.test(
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

function resolveCalendarIntent(
  paramsIntent: string | undefined,
  message: Parameters<typeof messageText>[0],
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
      .replace(
        /^(?:what about|how about|and the|also the|or the|only the|just the)\s+/i,
        "",
      )
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
    CALENDAR_SUBJECT_PATTERN.test(normalizedCurrentMessage) &&
    !isRefinement
  ) {
    return currentMessageText;
  }

  if (
    currentMessageText &&
    (WEAK_CONFIRMATION_PATTERN.test(normalizedCurrentMessage) ||
      FOLLOW_UP_PATTERN.test(normalizedCurrentMessage) ||
      isRefinement)
  ) {
    const followUpCandidates = stateTextCandidates(state).filter(
      (candidate) =>
        CALENDAR_SUBJECT_PATTERN.test(normalizeText(candidate)) &&
        !looksLikeCalendarResultSummary(candidate) &&
        normalizeText(candidate) !== normalizedCurrentMessage,
    );
    const recentRelevantIntent =
      followUpCandidates.length > 0
        ? followUpCandidates.reduce((best, current) =>
            scoreIntentCandidate(current) >= scoreIntentCandidate(best)
              ? current
              : best,
          )
        : undefined;
    if (recentRelevantIntent) {
      const followUpConstraint =
        normalizeFollowUpConstraint(currentMessageText);
      return followUpConstraint
        ? `${recentRelevantIntent} ${followUpConstraint}`.trim()
        : recentRelevantIntent;
    }
  }

  const candidates = [
    {
      text: paramsIntent?.trim(),
      source: "params" as const,
    },
    {
      text: messageText(message).trim(),
      source: "message" as const,
    },
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
      const leftText = normalizeText(left.text);
      const rightText = normalizeText(right.text);
      const leftBonus =
        left.source === "message" && CALENDAR_SUBJECT_PATTERN.test(leftText)
          ? 20
          : 0;
      const rightBonus =
        right.source === "message" && CALENDAR_SUBJECT_PATTERN.test(rightText)
          ? 20
          : 0;
      return (
        scoreIntentCandidate(right.text) +
        rightBonus -
        (scoreIntentCandidate(left.text) + leftBonus)
      );
    })
    .map((candidate) => candidate.text)[0];
}

function inferCalendarSubaction(
  intent: string,
  details: Record<string, unknown> | undefined,
  query: string | undefined,
): CalendarSubaction {
  if (
    query ||
    detailString(details, "query") ||
    /\b(find|search|look for|matching|related to|flight|flights|fly|travel|trip|return)\b/.test(
      intent,
    )
  ) {
    return "search_events";
  }
  if (
    detailString(details, "startAt") ||
    detailNumber(details, "durationMinutes") ||
    /\b(create|add|book)\b/.test(intent) ||
    /\bschedule\s+(?:a|an|this|that|the)?\s*(?:calendar\s+)?(?:meeting|event|appointment|call)\b/.test(
      intent,
    ) ||
    /\bput\b.*\b(calendar|meeting|event)\b/.test(intent) ||
    /\bmake an event\b/.test(intent)
  ) {
    return "create_event";
  }
  if (/\b(next|upcoming|soon|about to|coming up)\b/.test(intent)) {
    return "next_event";
  }
  return "feed";
}

function cleanTripLocation(value: string): string | undefined {
  const cleaned = value
    .trim()
    .replace(
      /\b(?:today|tomorrow|tonight|this week(?:end)?|next week(?:end)?|this month|next month|for me|coming up|upcoming|on my calendar|on the calendar|on my schedule|on the schedule)\b.*$/i,
      "",
    )
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "")
    .trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

function inferTripWindowIntent(intent: string): TripWindowIntent | null {
  const patterns = [
    /\bwhile\s+(?:i(?:'m| am)|im)\s+in\s+(.+?)(?=$|[?.!,])/i,
    /\bwhen\s+(?:i(?:'m| am)|im)\s+in\s+(.+?)(?=$|[?.!,])/i,
    /\bduring\s+(?:my\s+)?(?:trip|stay|visit)\s+(?:to|in)\s+(.+?)(?=$|[?.!,])/i,
    /\bonce\s+(?:i(?:'m| am)|im)\s+in\s+(.+?)(?=$|[?.!,])/i,
  ];

  for (const pattern of patterns) {
    const match = intent.match(pattern);
    const location = cleanTripLocation(match?.[1] ?? "");
    if (location) {
      return { location };
    }
  }

  return null;
}

function parseExplicitLocalDate(
  value: string,
  timeZone: string,
): { year: number; month: number; day: number } | null {
  const normalized = normalizeText(value);
  const localToday = getZonedDateParts(new Date(), timeZone);
  const monthMap: Record<string, number> = {
    january: 1,
    jan: 1,
    february: 2,
    feb: 2,
    march: 3,
    mar: 3,
    april: 4,
    apr: 4,
    may: 5,
    june: 6,
    jun: 6,
    july: 7,
    jul: 7,
    august: 8,
    aug: 8,
    september: 9,
    sept: 9,
    sep: 9,
    october: 10,
    oct: 10,
    november: 11,
    nov: 11,
    december: 12,
    dec: 12,
  };

  const isoMatch = normalized.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    return {
      year: Number(isoMatch[1]),
      month: Number(isoMatch[2]),
      day: Number(isoMatch[3]),
    };
  }

  const monthNameMatch = normalized.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i,
  );
  if (monthNameMatch) {
    return {
      year: monthNameMatch[3] ? Number(monthNameMatch[3]) : localToday.year,
      month: monthMap[normalizeLookupKey(monthNameMatch[1])],
      day: Number(monthNameMatch[2]),
    };
  }

  const numericMatch = normalized.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (numericMatch) {
    const yearRaw = numericMatch[3];
    const parsedYear =
      yearRaw === undefined
        ? localToday.year
        : yearRaw.length === 2
          ? 2000 + Number(yearRaw)
          : Number(yearRaw);
    return {
      year: parsedYear,
      month: Number(numericMatch[1]),
      day: Number(numericMatch[2]),
    };
  }

  return null;
}

function resolveCalendarTimeZone(
  details: Record<string, unknown> | undefined,
): string {
  return detailString(details, "timeZone") ?? resolveDefaultTimeZone();
}

function buildLocalDayRange(
  timeZone: string,
  startOffsetDays: number,
  endOffsetDaysExclusive: number,
): { timeMin: string; timeMax: string } {
  const localToday = getZonedDateParts(new Date(), timeZone);
  const startDay = addDaysToLocalDate(
    {
      year: localToday.year,
      month: localToday.month,
      day: localToday.day,
    },
    startOffsetDays,
  );
  const endDay = addDaysToLocalDate(
    {
      year: localToday.year,
      month: localToday.month,
      day: localToday.day,
    },
    endOffsetDaysExclusive,
  );

  return {
    timeMin: buildUtcDateFromLocalParts(timeZone, {
      year: startDay.year,
      month: startDay.month,
      day: startDay.day,
      hour: 0,
      minute: 0,
      second: 0,
    }).toISOString(),
    timeMax: buildUtcDateFromLocalParts(timeZone, {
      year: endDay.year,
      month: endDay.month,
      day: endDay.day,
      hour: 0,
      minute: 0,
      second: 0,
    }).toISOString(),
  };
}

function resolveCalendarWindow(
  intent: string,
  details: Record<string, unknown> | undefined,
  forSearch: boolean,
): {
  request: GetLifeOpsCalendarFeedRequest;
  label: string;
} {
  const timeMin = detailString(details, "timeMin");
  const timeMax = detailString(details, "timeMax");
  const calendarId = detailString(details, "calendarId");
  const timeZone = resolveCalendarTimeZone(details);
  const forceSync = detailBoolean(details, "forceSync");
  if (timeMin || timeMax) {
    return {
      request: {
        calendarId,
        timeMin: timeMin ?? undefined,
        timeMax: timeMax ?? undefined,
        timeZone,
        forceSync,
      },
      label: detailString(details, "label") ?? "for the requested window",
    };
  }

  const normalizedIntent = normalizeText(intent);
  const explicitDate = parseExplicitLocalDate(normalizedIntent, timeZone);
  if (explicitDate) {
    const nextDate = addDaysToLocalDate(explicitDate, 1);
    return {
      request: {
        calendarId,
        timeZone,
        forceSync,
        timeMin: buildUtcDateFromLocalParts(timeZone, {
          year: explicitDate.year,
          month: explicitDate.month,
          day: explicitDate.day,
          hour: 0,
          minute: 0,
          second: 0,
        }).toISOString(),
        timeMax: buildUtcDateFromLocalParts(timeZone, {
          year: nextDate.year,
          month: nextDate.month,
          day: nextDate.day,
          hour: 0,
          minute: 0,
          second: 0,
        }).toISOString(),
      },
      label: `on ${normalizedIntent.match(/(?:on|for)\s+(.+)$/i)?.[1] ?? normalizedIntent}`,
    };
  }
  if (
    /\bnext week\b/.test(normalizedIntent) &&
    /\b(?:week after next|the week after)\b/.test(normalizedIntent)
  ) {
    return {
      request: {
        calendarId,
        timeZone,
        forceSync,
        ...buildLocalDayRange(timeZone, 7, 21),
      },
      label: "next week or the week after",
    };
  }
  if (/\btomorrow\b/.test(normalizedIntent)) {
    return {
      request: { calendarId, timeZone, forceSync, ...buildLocalDayRange(timeZone, 1, 2) },
      label: "tomorrow",
    };
  }
  if (/\b(?:week after next|the week after)\b/.test(normalizedIntent)) {
    return {
      request: {
        calendarId,
        timeZone,
        forceSync,
        ...buildLocalDayRange(timeZone, 14, 21),
      },
      label: "the week after next",
    };
  }
  if (/\bnext week\b/.test(normalizedIntent)) {
    return {
      request: {
        calendarId,
        timeZone,
        forceSync,
        ...buildLocalDayRange(timeZone, 7, 14),
      },
      label: "next week",
    };
  }
  if (/\b(this week|week)\b/.test(normalizedIntent)) {
    return {
      request: { calendarId, timeZone, forceSync, ...buildLocalDayRange(timeZone, 0, 7) },
      label: "this week",
    };
  }

  const windowDays = detailNumber(details, "windowDays");
  if (forSearch) {
    const days = windowDays && windowDays > 0 ? Math.min(windowDays, 90) : 30;
    return {
      request: {
        calendarId,
        timeZone,
        forceSync,
        ...buildLocalDayRange(timeZone, 0, days),
      },
      label: `across the next ${days} days`,
    };
  }

  return {
    request: { calendarId, timeZone, forceSync, ...buildLocalDayRange(timeZone, 0, 1) },
    label: "today",
  };
}

function resolveTripWindowRequest(
  details: Record<string, unknown> | undefined,
): GetLifeOpsCalendarFeedRequest {
  const timeMin = detailString(details, "timeMin");
  const timeMax = detailString(details, "timeMax");
  const calendarId = detailString(details, "calendarId");
  const timeZone = resolveCalendarTimeZone(details);
  const forceSync = detailBoolean(details, "forceSync");

  if (timeMin || timeMax) {
    return {
      calendarId,
      timeMin: timeMin ?? undefined,
      timeMax: timeMax ?? undefined,
      timeZone,
      forceSync,
    };
  }

  const windowDays = detailNumber(details, "windowDays");
  const days = windowDays && windowDays > 0 ? Math.min(windowDays, 120) : 60;
  return {
    calendarId,
    timeZone,
    forceSync,
    ...buildLocalDayRange(timeZone, 0, days),
  };
}

function inferCalendarSearchQuery(intent: string): string | undefined {
  const normalizedIntent = normalizeText(intent);
  if (/\b(flight|flights|fly|flying|travel|trip)\b/.test(normalizedIntent)) {
    const locationMatch = normalizedIntent.match(
      /\b(?:from|to)\s+(.+?)(?=\b(?:today|tomorrow|tonight|this week(?:end)?|next week(?:end)?|week after(?: next)?|this month|next month|this year|next year|or|and|please|idk|i dk|i don't know)\b|[?.!,]|$)/i,
    );
    const parts = ["flight"];
    if (/\b(return|back|home)\b/.test(normalizedIntent)) {
      parts.push("return");
    }
    const location = normalizeCalendarSearchQueryValue(locationMatch?.[1] ?? "");
    if (location) {
      parts.push(location);
    }
    return normalizeCalendarSearchQueryValue(parts.join(" ")) ?? "flight";
  }

  const dateMatch = normalizedIntent.match(
    /\b(?:on|for)\s+((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{4}-\d{1,2}-\d{1,2})\b/i,
  );
  const normalizedDate = normalizeCalendarSearchQueryValue(dateMatch?.[1]);
  if (normalizedDate) {
    return normalizedDate;
  }

  const patterns = [
    /\b(?:find|search(?: for)?|look(?:ing)? for|show me)\s+(.+)$/i,
    /\b(?:do i have|are there)\s+(?:any\s+)?(.+?)(?:\?|$)/i,
    /\b(?:check|look|see)\s+(?:my\s+)?calendar\s+for\s+(.+?)(?:\?|$)/i,
    /\bwhat\s+(?:event|events)\s+do\s+i\s+have\s+(?:on|for)\s+(.+?)(?:\?|$)/i,
    /\bany\s+(.+?)(?:\?|$)/i,
  ];

  for (const pattern of patterns) {
    const match = normalizedIntent.match(pattern);
    const value = normalizeCalendarSearchQueryValue(match?.[1] ?? "");
    if (value) {
      return value;
    }
  }

  return undefined;
}

function inferCalendarSearchQueries(intent: string): string[] {
  const normalizedIntent = normalizeText(intent);
  const queries = new Set<string>();
  const push = (value: string | undefined) => {
    const normalized = normalizeCalendarSearchQueryValue(value);
    if (normalized) {
      queries.add(normalized);
    }
  };

  push(inferCalendarSearchQuery(intent));

  if (/\b(return|back|home)\b/.test(normalizedIntent)) {
    const locationMatch = normalizedIntent.match(
      /\b(?:from|to)\s+(.+?)(?=\b(?:today|tomorrow|tonight|this week(?:end)?|next week(?:end)?|week after(?: next)?|this month|next month|this year|next year|or|and|please|idk|i dk|i don't know)\b|[?.!,]|$)/i,
    );
    const location = normalizeCalendarSearchQueryValue(locationMatch?.[1] ?? "");
    push(`return flight${location ? ` ${location}` : ""}`);
    if (location) {
      push(`flight back ${location}`);
      push(`${location} return flight`);
    }
  }

  return [...queries];
}

function sanitizeCalendarQuery(
  query: string | undefined,
  intent: string,
): string | undefined {
  if (!query) {
    return undefined;
  }
  const raw = normalizeText(query);
  if (
    PARAMETER_DOC_NOISE_PATTERN.test(raw) ||
    raw.includes("supported keys include") ||
    raw.includes("match against titles") ||
    raw.includes("structured calendar arguments")
  ) {
    return undefined;
  }
  const cleaned = normalizeCalendarSearchQueryValue(query);
  if (
    !cleaned ||
    PARAMETER_DOC_NOISE_PATTERN.test(cleaned) ||
    WEAK_CALENDAR_QUERY_PATTERN.test(cleaned) ||
    looksLikeLiteralRequestEcho(cleaned, intent) ||
    cleaned.length > 160
  ) {
    return undefined;
  }
  const inferred = inferCalendarSearchQuery(intent);
  if (
    inferred &&
    looksLikeNarrativeCalendarQuery(cleaned) &&
    normalizeText(inferred) !== normalizeText(cleaned)
  ) {
    return undefined;
  }
  return cleaned;
}

function scoreCalendarQueryCandidate(query: string, intent: string): number {
  const normalized = normalizeText(query);
  if (!normalized) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;
  if (PARAMETER_DOC_NOISE_PATTERN.test(normalized)) {
    score -= 500;
  }
  if (looksLikeNarrativeCalendarQuery(normalized)) {
    score -= 120;
  }
  if (looksLikeLiteralRequestEcho(query, intent)) {
    score -= 120;
  }
  if (WEAK_CALENDAR_QUERY_PATTERN.test(normalized)) {
    score -= 120;
  }

  const tokens = tokenizeForSearch(normalized);
  if (tokens.length <= 4) {
    score += 12;
  } else if (tokens.length >= 8) {
    score -= 15;
  }

  const inferredQueries = inferCalendarSearchQueries(intent).map((value) =>
    normalizeText(value),
  );
  if (inferredQueries.includes(normalized)) {
    score += 60;
  }
  for (const inferredQuery of inferredQueries) {
    if (!inferredQuery) {
      continue;
    }
    if (normalized.includes(inferredQuery) || inferredQuery.includes(normalized)) {
      score += 18;
    }
    const inferredTokens = new Set(tokenizeForSearch(inferredQuery));
    score += tokens.filter((token) => inferredTokens.has(token)).length * 8;
  }

  if (
    /\b(flight|flights|travel|trip|return|back|home)\b/.test(normalizeText(intent)) &&
    /\b(flight|flights|travel|trip|return|back|home)\b/.test(normalized)
  ) {
    score += 12;
  }

  return score;
}

function eventDateSearchTerms(event: LifeOpsCalendarEvent): Set<string> {
  const formatter = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: event.timezone || undefined,
      ...options,
    }).format(new Date(event.startAt));

  const monthLong = normalizeText(
    formatter({ month: "long" }).replace(/\./g, ""),
  );
  const monthShort = normalizeText(
    formatter({ month: "short" }).replace(/\./g, ""),
  );
  const weekdayLong = normalizeText(formatter({ weekday: "long" }));
  const weekdayShort = normalizeText(formatter({ weekday: "short" }));
  const day = formatter({ day: "numeric" });
  const dayPadded = day.padStart(2, "0");
  const monthNumeric = formatter({ month: "numeric" });
  const monthPadded = monthNumeric.padStart(2, "0");
  const year = formatter({ year: "numeric" });

  return new Set(
    [
      `${monthLong} ${day}`,
      `${monthLong} ${day} ${year}`,
      `${monthShort} ${day}`,
      `${monthShort} ${day} ${year}`,
      `${weekdayLong} ${monthLong} ${day}`,
      `${weekdayShort} ${monthShort} ${day}`,
      `${monthNumeric}/${day}`,
      `${monthNumeric}/${dayPadded}`,
      `${monthPadded}/${day}`,
      `${monthPadded}/${dayPadded}`,
      `${year}-${monthPadded}-${dayPadded}`,
      weekdayLong,
      weekdayShort,
    ].map((term) => normalizeText(term)),
  );
}

async function extractCalendarSearchQueriesWithLlm(
  runtime: IAgentRuntime,
  message: Memory,
  state: State | undefined,
  intent: string,
): Promise<string[]> {
  return (await extractCalendarPlanWithLlm(runtime, message, state, intent)).queries;
}

export async function extractCalendarPlanWithLlm(
  runtime: IAgentRuntime,
  message: Memory,
  state: State | undefined,
  intent: string,
): Promise<CalendarLlmPlan> {
  const recentConversation = stateTextCandidates(state).slice(-8).join("\n");
  const currentMessage = messageText(message).trim();
  const prompt = [
    "Plan the calendar action for this request.",
    "The user may speak in any language.",
    "Use the current request plus recent conversation context.",
    "If the current request is vague or a follow-up, recover the subject from recent conversation and apply the new constraint from the current request.",
    "You MUST always return a subaction — never return null. Pick the closest match even if uncertain.",
    "",
    "Subactions and when to use each:",
    "  feed — view today's, tomorrow's, or this week's schedule (e.g. 'what's on my calendar', 'what do I have today', 'this week's agenda')",
    "  next_event — check the next upcoming event only (e.g. 'what's my next meeting', 'when is my next appointment')",
    "  search_events — find events by title, attendee, location, or date range (e.g. 'find my flight', 'when is the dentist', 'meetings with John')",
    "  create_event — schedule a new event (e.g. 'schedule a meeting tomorrow at 3pm', 'add lunch with Sarah on Friday')",
    "  trip_window — query what's happening during a trip or stay in a specific place (e.g. 'what's happening while I'm in Denver', 'my Tokyo itinerary')",
    "",
    "For search_events or trip_window, extract up to 3 short search queries.",
    "Preserve names, places, and keywords in their original language or script when useful.",
    "Convert time constraints into concise searchable dates or windows even if the user phrases them in another language.",
    "Focus on people, places, flights, itinerary, appointments, and explicit dates.",
    "If the request is about a date, include a date query like april 12 or 2026-04-12.",
    "If the request asks what is happening while the user is in a place, use trip_window and include tripLocation.",
    "",
    "Examples:",
    '  "what\'s on my calendar tomorrow" → subaction: feed',
    '  "schedule a meeting with Alex at 3pm" → subaction: create_event, title: Meeting with Alex',
    '  "find my return flight" → subaction: search_events, queries: return flight',
    '  "what do I have while I\'m in Tokyo" → subaction: trip_window, queries: tokyo, tripLocation: Tokyo',
    "",
    "TOON only. Return exactly one TOON document. No prose before or after it. No <think>.",
    "Use || to separate multiple queries.",
    "",
    "Example:",
    "subaction: search_events",
    "queries: denver return flight",
    "title:",
    "tripLocation:",
    "",
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
        src: "action:calendar",
        error: error instanceof Error ? error.message : String(error),
      },
      "Calendar action planning model call failed",
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

  const tripLocation =
    typeof parsed.tripLocation === "string" &&
    parsed.tripLocation.trim().length > 0
      ? parsed.tripLocation.trim()
      : undefined;
  return {
    subaction: normalizeCalendarSubaction(parsed.subaction),
    queries: dedupeCalendarQueries([
      typeof parsed.query === "string" ? parsed.query : undefined,
      ...(Array.isArray(parsed.queries)
        ? parsed.queries.map((value) =>
            typeof value === "string" ? value : undefined,
          )
        : []),
      typeof parsed.query1 === "string" ? parsed.query1 : undefined,
      typeof parsed.query2 === "string" ? parsed.query2 : undefined,
      typeof parsed.query3 === "string" ? parsed.query3 : undefined,
      tripLocation,
    ]),
    title:
      typeof parsed.title === "string" && parsed.title.trim().length > 0
        ? parsed.title.trim()
        : undefined,
    tripLocation,
  };
}

async function resolveCalendarSearchQueries(
  runtime: IAgentRuntime,
  message: Memory,
  state: State | undefined,
  explicitQueries: Array<string | undefined>,
  intent: string,
  llmPlan?: CalendarLlmPlan,
): Promise<string[]> {
  const providedQueries = dedupeCalendarQueries(
    explicitQueries.map((query) => sanitizeCalendarQuery(query, intent)),
  );
  if (
    providedQueries.length > 0 &&
    providedQueries.every(
      (query) =>
        !looksLikeNarrativeCalendarQuery(query) &&
        !looksLikeLiteralRequestEcho(query, intent) &&
        !WEAK_CALENDAR_QUERY_PATTERN.test(query) &&
        !PARAMETER_DOC_NOISE_PATTERN.test(query),
    )
  ) {
    return providedQueries;
  }

  const heuristicQueries = inferCalendarSearchQueries(intent);
  const llmQueries =
    llmPlan && llmPlan.queries.length > 0
      ? llmPlan.queries
      : await extractCalendarSearchQueriesWithLlm(
          runtime,
          message,
          state,
          intent,
        );
  const stateQueries = stateTextCandidates(state)
    .reverse()
    .flatMap((candidate) => inferCalendarSearchQueries(candidate));
  const candidates = dedupeCalendarQueries(
    [...providedQueries, ...llmQueries, ...heuristicQueries, ...stateQueries].map(
      (query) => sanitizeCalendarQuery(query, intent),
    ),
  );
  return [...candidates].sort(
    (left, right) =>
      scoreCalendarQueryCandidate(right, intent) -
      scoreCalendarQueryCandidate(left, intent),
  );
}

function inferCreateEventTitle(intent: string): string | undefined {
  const patterns = [
    /\b(?:create|add|schedule|book|put)\s+(?:a|an|the)?\s*(.+?)(?=\b(?:for|on|at|tomorrow|today|tonight|next|this|from)\b|[?.!,]|$)/i,
    /\b(?:meeting|appointment|call|event)\s+(?:with|for)\s+(.+?)(?=\b(?:for|on|at|tomorrow|today|tonight|next|this|from)\b|[?.!,]|$)/i,
  ];
  for (const pattern of patterns) {
    const match = intent.match(pattern);
    const value = match?.[1]?.trim();
    if (value && !/^(calendar|event|meeting|appointment|call)$/i.test(value)) {
      return value.replace(/\s+/g, " ").trim();
    }
  }
  return undefined;
}

function isShortPreparationEvent(intent: string, title: string): boolean {
  return /\b(get ready|ready for|prep|prepare|packing|pack|leave for|head to|airport|flight|reminder|remind me)\b/i.test(
    `${intent} ${title}`,
  );
}

function resolveCreateEventDurationMinutes(args: {
  explicitDuration: number | undefined;
  extractedDuration: number | undefined;
  intent: string;
  title: string;
  hasExplicitEndAt: boolean;
  hasExplicitWindowPreset: boolean;
  hasExplicitStartAt: boolean;
}): number | undefined {
  const {
    explicitDuration,
    extractedDuration,
    intent,
    title,
    hasExplicitEndAt,
    hasExplicitWindowPreset,
    hasExplicitStartAt,
  } = args;

  if (typeof explicitDuration === "number" && Number.isFinite(explicitDuration)) {
    return explicitDuration > 0 ? explicitDuration : undefined;
  }
  if (typeof extractedDuration === "number" && Number.isFinite(extractedDuration)) {
    if (extractedDuration > 0) {
      return extractedDuration;
    }
    if (
      isShortPreparationEvent(intent, title) &&
      (hasExplicitStartAt || hasExplicitWindowPreset)
    ) {
      return MIN_CREATE_EVENT_DURATION_MINUTES;
    }
    return undefined;
  }
  if (
    !hasExplicitEndAt &&
    isShortPreparationEvent(intent, title) &&
    (hasExplicitStartAt || hasExplicitWindowPreset)
  ) {
    return MIN_CREATE_EVENT_DURATION_MINUTES;
  }
  return undefined;
}


async function inferCreateEventDetails(
  runtime: IAgentRuntime,
  message: Memory,
  state: State | undefined,
  intent: string,
): Promise<Record<string, unknown>> {
  const recentConversation = stateTextCandidates(state).slice(-8).join("\n");
  const currentMessage = messageText(message).trim();
  const prompt = [
    "Extract calendar event creation fields from the request.",
    "The user may speak in any language.",
    "Use the current request plus recent conversation context.",
    "If the current request is a follow-up, recover the event subject from recent conversation and apply new timing or location constraints from the current request.",
    "Preserve names and places in their original language or script when useful.",
    "Return XML only. Leave fields empty when unknown.",
    "If a start time or window is implied but duration is not explicit, infer a reasonable positive duration.",
    "For short prep or reminder blocks, use at least 15 minutes instead of 0.",
    "",
    "<response>",
    "  <title>event title</title>",
    "  <description>optional description</description>",
    "  <location>optional location</location>",
    "  <startAt>ISO datetime if explicit</startAt>",
    "  <endAt>ISO datetime if explicit</endAt>",
    "  <durationMinutes>number if implied</durationMinutes>",
    "  <windowPreset>tomorrow_morning|tomorrow_afternoon|tomorrow_evening</windowPreset>",
    "  <timeZone>IANA timezone if stated</timeZone>",
    "</response>",
    "",
    `Current request: ${JSON.stringify(currentMessage)}`,
    `Resolved intent: ${JSON.stringify(intent)}`,
    `Recent conversation: ${JSON.stringify(recentConversation)}`,
  ].join("\n");

  try {
    const result = await runtime.useModel(ModelType.TEXT_SMALL, { prompt });
    const rawResponse = typeof result === "string" ? result : "";
    const parsed = parseKeyValueXml<Record<string, unknown>>(rawResponse);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    runtime.logger?.warn?.(
      {
        src: "action:calendar",
        error: error instanceof Error ? error.message : String(error),
      },
      "Calendar create-event extraction model call failed",
    );
    return {};
  }
}

function scoreCalendarEvent(event: LifeOpsCalendarEvent, query: string): number {
  const normalizedQuery = normalizeText(query);
  const title = normalizeText(event.title);
  const description = normalizeText(event.description);
  const location = normalizeText(event.location);
  const attendees = event.attendees
    .flatMap((attendee) => [attendee.displayName ?? "", attendee.email ?? ""])
    .map((value) => normalizeText(value))
    .filter((value) => value.length > 0);
  let score = 0;

  const queryVariants = [...new Set([normalizedQuery, ...tokenVariants(normalizedQuery)])];
  if (queryVariants.some((variant) => title === variant)) {
    score += 100;
  } else if (queryVariants.some((variant) => variant.length > 0 && title.includes(variant))) {
    score += 75;
  }

  if (queryVariants.some((variant) => variant.length > 0 && description.includes(variant))) {
    score += 35;
  }
  if (queryVariants.some((variant) => variant.length > 0 && location.includes(variant))) {
    score += 30;
  }
  if (
    attendees.some((value) =>
      queryVariants.some((variant) => variant.length > 0 && value.includes(variant)),
    )
  ) {
    score += 25;
  }

  const queryTokens = tokenizeForSearch(normalizedQuery);
  if (queryTokens.length > 0) {
    const titleTokens = new Set(tokenizeForSearch(title));
    const descriptionTokens = new Set(tokenizeForSearch(description));
    const locationTokens = new Set(tokenizeForSearch(location));
    const attendeeTokens = attendees.flatMap((value) => tokenizeForSearch(value));
    const attendeeTokenSet = new Set(attendeeTokens);

    score += queryTokens.filter((token) => titleTokens.has(token)).length * 12;
    score +=
      queryTokens.filter((token) => descriptionTokens.has(token)).length * 8;
    score += queryTokens.filter((token) => locationTokens.has(token)).length * 14;
    score +=
      queryTokens.filter((token) => attendeeTokenSet.has(token)).length * 8;
  }

  if (
    /\b(return|back|home)\b/.test(normalizedQuery) &&
    /\b(return|back|home)\b/.test(`${title} ${description}`)
  ) {
    score += 24;
  }

  const dateTerms = eventDateSearchTerms(event);
  if (
    [...dateTerms].some(
      (term) =>
        term === normalizedQuery ||
        normalizedQuery.includes(term) ||
        term.includes(normalizedQuery),
    )
  ) {
    score += 90;
  }
  const dateTokens = new Set(
    [...dateTerms].flatMap((term) => tokenizeForSearch(term)),
  );
  score += queryTokens.filter((token) => dateTokens.has(token)).length * 10;

  return score;
}

function isTravelEvent(event: LifeOpsCalendarEvent): boolean {
  return /\b(flight|fly|travel|trip|hotel|stay|lodging|airbnb|check[- ]?in|check[- ]?out|return|home)\b/i.test(
    `${event.title} ${event.description} ${event.location}`,
  );
}

function eventStartMs(event: LifeOpsCalendarEvent): number {
  return Date.parse(event.startAt);
}

function eventEndMs(event: LifeOpsCalendarEvent): number {
  const parsed = Date.parse(event.endAt);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return eventStartMs(event);
}

function resolveTripWindowEvents(
  events: LifeOpsCalendarEvent[],
  location: string,
): LifeOpsCalendarEvent[] | null {
  const anchors = events
    .map((event) => ({
      event,
      score:
        scoreCalendarEvent(event, location) + (isTravelEvent(event) ? 12 : 0),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => eventStartMs(left.event) - eventStartMs(right.event));

  if (anchors.length === 0) {
    return null;
  }

  const windowStart = Math.min(...anchors.map((candidate) => eventStartMs(candidate.event)));
  const windowEnd = Math.max(...anchors.map((candidate) => eventEndMs(candidate.event)));

  return events
    .filter((event) => eventEndMs(event) >= windowStart && eventStartMs(event) <= windowEnd)
    .sort((left, right) => eventStartMs(left) - eventStartMs(right));
}

function formatCalendarMoment(event: LifeOpsCalendarEvent): string {
  const date = new Date(event.startAt);
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);

  if (event.isAllDay) {
    return dateLabel;
  }

  const timeLabel = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return `${dateLabel}, ${timeLabel}`;
}

function formatTripWindowResults(
  events: LifeOpsCalendarEvent[],
  location: string,
): string {
  if (events.length === 0) {
    return `I couldn't find any upcoming calendar events while you're in ${location}.`;
  }

  const lines = [`Here's what's on your calendar while you're in ${location}:`];
  for (const event of events.slice(0, 12)) {
    lines.push(`- ${formatCalendarMoment(event)}: **${event.title}**`);
  }
  return lines.join("\n");
}

function formatCalendarSearchResults(
  events: LifeOpsCalendarEvent[],
  query: string,
  label: string,
  intent: string,
): string {
  if (events.length === 0) {
    return `No calendar events matched "${query}" ${label}.`;
  }
  if (events.length === 1) {
    const event = events[0];
    const normalizedIntent = normalizeText(intent);
    const matchingSubject = /\b(flight|flights|fly|travel|trip|return|back|home)\b/.test(
      `${normalizedIntent} ${query}`,
    )
      ? "flight"
      : "calendar event";
    return `Your matching ${matchingSubject} is **${event.title}** (${formatCalendarMoment(event)}).`;
  }
  const lines = [
    `Found ${events.length} calendar event${events.length === 1 ? "" : "s"} for "${query}" ${label}:`,
  ];
  for (const event of events.slice(0, 8)) {
    const when = event.isAllDay
      ? "all day"
      : new Date(event.startAt).toLocaleString();
    lines.push(`- **${event.title}** (${when})`);
    if (event.location) {
      lines.push(`  Location: ${event.location}`);
    }
    if (event.description) {
      lines.push(`  ${event.description.slice(0, 120)}`);
    }
  }
  return lines.join("\n");
}

function normalizeCalendarAttendees(
  details: Record<string, unknown> | undefined,
): CreateLifeOpsCalendarEventAttendee[] | undefined {
  const attendees = detailArray(details, "attendees");
  if (!attendees) {
    return undefined;
  }
  const mapped: Array<CreateLifeOpsCalendarEventAttendee | null> = attendees.map(
    (attendee) => {
      if (typeof attendee === "string" && attendee.trim().length > 0) {
        return {
          email: attendee.trim(),
        };
      }
      if (!attendee || typeof attendee !== "object" || Array.isArray(attendee)) {
        return null;
      }
      const record = attendee as Record<string, unknown>;
      const email =
        typeof record.email === "string" && record.email.trim().length > 0
          ? record.email.trim()
          : null;
      if (!email) {
        return null;
      }
      return {
        email,
        displayName:
          typeof record.displayName === "string" &&
          record.displayName.trim().length > 0
            ? record.displayName.trim()
            : undefined,
        optional:
          typeof record.optional === "boolean" ? record.optional : undefined,
      };
    },
  );
  const normalized = mapped.filter(
    (attendee): attendee is CreateLifeOpsCalendarEventAttendee =>
      attendee !== null,
  );
  return normalized.length > 0 ? normalized : undefined;
}

export const calendarAction: Action = {
  name: "CALENDAR_ACTION",
  similes: [
    "CALENDAR",
    "CHECK_CALENDAR",
    "SCHEDULE_EVENT",
    "CREATE_CALENDAR_EVENT",
    "SEARCH_CALENDAR",
    "NEXT_MEETING",
    "ITINERARY",
    "TRAVEL_SCHEDULE",
    "CHECK_SCHEDULE",
  ],
  description:
    "Interact with Google Calendar through LifeOps. " +
    "USE this action for: viewing today's or this week's schedule; checking the next upcoming event; " +
    "searching events by title, attendee, location, or date range; creating new calendar events; " +
    "querying travel itineraries, flights, hotel stays, and trip windows. " +
    "DO NOT use this action for email inbox work, drafting or sending emails — use GMAIL_ACTION instead. " +
    "DO NOT use this action for personal habits, goals, routines, or reminders — use LIFE instead. " +
    "This action provides the final grounded reply; do not pair it with a speculative REPLY action.",
  validate: async (runtime, message) => {
    return hasLifeOpsAccess(runtime, message);
  },
  handler: async (runtime, message, state, options, callback?: HandlerCallback) => {
    if (!(await hasLifeOpsAccess(runtime, message))) {
      const text =
        "Calendar actions are restricted to the owner, explicitly granted users, and the agent.";
      await callback?.({ text });
      return {
        success: false,
        text,
      };
    }

    const rawParams = (options as HandlerOptions | undefined)
      ?.parameters as CalendarActionParams | undefined;
    const params = rawParams ?? ({} as CalendarActionParams);
    const intent = resolveCalendarIntent(params.intent, message, state);
    const details = normalizeCalendarDetails(params.details);
    const shouldPlanWithLlm =
      !params.subaction ||
      (!params.query &&
        (params.queries?.length ?? 0) === 0 &&
        !detailString(details, "query") &&
        (detailArray(details, "queries")?.length ?? 0) === 0 &&
        !params.title &&
        !detailString(details, "title"));
    const llmPlan = shouldPlanWithLlm
      ? await extractCalendarPlanWithLlm(runtime, message, state, intent)
      : {
          subaction: null,
          queries: [],
        };
    const heuristicQuery = inferCalendarSearchQuery(intent);
    const inferredQuery = sanitizeCalendarQuery(
      params.query ?? detailString(details, "query"),
      intent,
    );
    const inferredQueries = dedupeCalendarQueries([
      inferredQuery,
      ...llmPlan.queries,
      ...(params.queries ?? []),
      ...(detailArray(details, "queries")?.map((value) =>
        typeof value === "string" ? value : undefined,
      ) ?? []),
    ]);
    const explicitTitle =
      (typeof params.title === "string" && params.title.trim().length > 0
        ? params.title.trim()
        : undefined) ??
      detailString(details, "title") ??
      llmPlan.title;
    const inferredTitle = explicitTitle ?? inferCreateEventTitle(intent);
    const tripWindowIntent =
      llmPlan.tripLocation && llmPlan.tripLocation.trim().length > 0
        ? { location: llmPlan.tripLocation.trim() }
        : inferTripWindowIntent(intent);
    let subaction: CalendarSubaction;
    if (tripWindowIntent) {
      subaction = "trip_window";
    } else if (params.subaction) {
      subaction = params.subaction as CalendarSubaction;
    } else if (llmPlan.subaction) {
      subaction = llmPlan.subaction;
    } else {
      runtime.logger?.warn?.(
        { src: "action:calendar", intent },
        "Calendar LLM plan returned no subaction; falling back to regex inference",
      );
      subaction = inferCalendarSubaction(
        normalizeText(intent),
        details,
        inferredQuery ?? heuristicQuery,
      );
    }
    const service = new LifeOpsService(runtime);
    const respond = async <T extends Record<string, unknown> | undefined>(
      payload: { success: boolean; text: string; data?: T },
    ) => {
      await callback?.({
        text: payload.text,
        source: "action",
        action: "CALENDAR_ACTION",
      });
      return payload;
    };

    try {
      const google = await getGoogleCapabilityStatus(service);

      if (subaction === "next_event") {
        if (!google.hasCalendarRead) {
          return respond({
            success: false,
            text: calendarReadUnavailableMessage(google),
          });
        }
        const context = await service.getNextCalendarEventContext(INTERNAL_URL, {
          calendarId: detailString(details, "calendarId"),
          timeZone: resolveCalendarTimeZone(details),
        });
        return respond({
          success: true,
          text: formatNextEventContext(context),
          data: toActionData(context),
        });
      }

      if (subaction === "create_event") {
        if (!google.hasCalendarWrite) {
          return respond({
            success: false,
            text: calendarWriteUnavailableMessage(google),
          });
        }
        const needsCreateExtraction = !(
          inferredTitle &&
          (detailString(details, "startAt") ||
            detailString(details, "endAt") ||
            detailNumber(details, "durationMinutes") ||
            detailString(details, "windowPreset"))
        );
        const extractedDetails = needsCreateExtraction
          ? await inferCreateEventDetails(runtime, message, state, intent)
          : {};
        const title =
          explicitTitle ??
          (typeof extractedDetails.title === "string"
            ? extractedDetails.title.trim()
            : undefined) ??
          inferredTitle;
        if (!title) {
          return respond({
            success: false,
            text: "CALENDAR_ACTION create_event needs a title.",
          });
        }
        const extractedTimeZone =
          typeof extractedDetails.timeZone === "string"
            ? extractedDetails.timeZone.trim()
            : undefined;
        const extractedWindowPreset =
          typeof extractedDetails.windowPreset === "string"
            ? extractedDetails.windowPreset.trim()
            : undefined;
        const extractedDuration =
          typeof extractedDetails.durationMinutes === "string"
            ? Number(extractedDetails.durationMinutes)
            : typeof extractedDetails.durationMinutes === "number"
              ? extractedDetails.durationMinutes
              : undefined;
        const explicitStartAt = detailString(details, "startAt");
        const explicitEndAt = detailString(details, "endAt");
        const explicitWindowPreset = detailString(details, "windowPreset");
        const explicitDuration = detailNumber(details, "durationMinutes");
        const durationMinutes = resolveCreateEventDurationMinutes({
          explicitDuration,
          extractedDuration: Number.isFinite(extractedDuration)
            ? extractedDuration
            : undefined,
          intent,
          title,
          hasExplicitEndAt:
            Boolean(explicitEndAt) ||
            (typeof extractedDetails.endAt === "string" &&
              extractedDetails.endAt.trim().length > 0),
          hasExplicitWindowPreset:
            Boolean(explicitWindowPreset) || Boolean(extractedWindowPreset),
          hasExplicitStartAt:
            Boolean(explicitStartAt) ||
            (typeof extractedDetails.startAt === "string" &&
              extractedDetails.startAt.trim().length > 0),
        });
        const request: CreateLifeOpsCalendarEventRequest = {
          mode: (detailString(details, "mode") as
            | "local"
            | "remote"
            | "cloud_managed"
            | undefined),
          side: (detailString(details, "side") as "owner" | "agent" | undefined),
          calendarId: detailString(details, "calendarId"),
          title,
          description:
            detailString(details, "description") ??
            (typeof extractedDetails.description === "string"
              ? extractedDetails.description.trim()
              : undefined),
          location:
            detailString(details, "location") ??
            (typeof extractedDetails.location === "string"
              ? extractedDetails.location.trim()
              : undefined),
          startAt:
            explicitStartAt ??
            (typeof extractedDetails.startAt === "string"
              ? extractedDetails.startAt.trim()
              : undefined),
          endAt:
            explicitEndAt ??
            (typeof extractedDetails.endAt === "string"
              ? extractedDetails.endAt.trim()
              : undefined),
          timeZone: detailString(details, "timeZone") ?? extractedTimeZone,
          durationMinutes,
          windowPreset: (explicitWindowPreset ?? extractedWindowPreset) as
            | "tomorrow_morning"
            | "tomorrow_afternoon"
            | "tomorrow_evening"
            | undefined,
          attendees: normalizeCalendarAttendees(details),
        };
        const event = await service.createCalendarEvent(INTERNAL_URL, request);
        return respond({
          success: true,
          text: `Created calendar event "${event.title}" for ${new Date(event.startAt).toLocaleString()}.`,
          data: toActionData(event),
        });
      }

      if (!google.hasCalendarRead) {
        return respond({
          success: false,
          text: calendarReadUnavailableMessage(google),
        });
      }

      if (subaction === "trip_window" && tripWindowIntent) {
        const feed = await service.getCalendarFeed(INTERNAL_URL, {
          mode: (detailString(details, "mode") as
            | "local"
            | "remote"
            | "cloud_managed"
            | undefined),
          side: (detailString(details, "side") as "owner" | "agent" | undefined),
          ...resolveTripWindowRequest(details),
        });
        const itineraryEvents = resolveTripWindowEvents(
          feed.events,
          tripWindowIntent.location,
        );
        if (!itineraryEvents || itineraryEvents.length === 0) {
          return respond({
            success: true,
            text: `I couldn't find a clear trip window for ${tripWindowIntent.location} in your upcoming calendar.`,
            data: toActionData({
              ...feed,
              location: tripWindowIntent.location,
              events: [],
            }),
          });
        }
        return respond({
          success: true,
          text: formatTripWindowResults(itineraryEvents, tripWindowIntent.location),
          data: toActionData({
            ...feed,
            location: tripWindowIntent.location,
            events: itineraryEvents,
          }),
        });
      }

      const { request, label } = resolveCalendarWindow(
        intent,
        details,
        subaction === "search_events",
      );
      const feed = await service.getCalendarFeed(INTERNAL_URL, {
        mode: (detailString(details, "mode") as
          | "local"
          | "remote"
          | "cloud_managed"
          | undefined),
        side: (detailString(details, "side") as "owner" | "agent" | undefined),
        ...request,
      });

      if (subaction === "search_events") {
        const searchQueries = await resolveCalendarSearchQueries(
          runtime,
          message,
          state,
          [
            ...inferredQueries,
          ],
          intent,
          llmPlan,
        );
        const query = searchQueries[0];
        if (!query || searchQueries.length === 0) {
          return respond({
            success: false,
            text: "I couldn't infer what to look for in your calendar yet. Try naming a person, place, trip, or date.",
          });
        }
        const rankedEvents = feed.events
          .map((event) => {
            const matchedQueries: string[] = [];
            let score = 0;
            for (const candidateQuery of searchQueries) {
              const queryScore = scoreCalendarEvent(event, candidateQuery);
              if (queryScore > 0) {
                matchedQueries.push(candidateQuery);
                score += queryScore;
              }
            }
            if (matchedQueries.length > 1) {
              score += (matchedQueries.length - 1) * 12;
            }
            return { event, score, matchedQueries };
          })
          .filter(
            (candidate) =>
              candidate.score > 0 && candidate.matchedQueries.length > 0,
          )
          .sort((left, right) => {
            if (right.score !== left.score) {
              return right.score - left.score;
            }
            return Date.parse(left.event.startAt) - Date.parse(right.event.startAt);
          });
        const strongestScore = rankedEvents[0]?.score ?? 0;
        const strongestThreshold =
          strongestScore >= 30 ? Math.max(16, strongestScore - 12) : 1;
        const filteredEvents = rankedEvents
          .filter((candidate) => candidate.score >= strongestThreshold)
          .map((candidate) => candidate.event);
        return respond({
          success: true,
          text: formatCalendarSearchResults(filteredEvents, query, label, intent),
          data: toActionData({
            ...feed,
            query,
            queries: searchQueries,
            events: filteredEvents,
          }),
        });
      }

      return respond({
        success: true,
        text: formatCalendarFeed(feed, label),
        data: toActionData(feed),
      });
    } catch (error) {
      if (error instanceof LifeOpsServiceError) {
        return respond({ success: false, text: error.message });
      }
      throw error;
    }
  },
  parameters: [
    {
      name: "subaction",
      description:
        "Calendar operation. Use search_events for flights, itinerary, travel, appointments, or keyword lookup; feed for agenda/schedule reads; next_event for the next upcoming event; create_event only when creating a new event.",
      required: false,
      schema: {
        type: "string" as const,
        enum: ["feed", "next_event", "search_events", "create_event", "trip_window"],
      },
    },
    {
      name: "intent",
      description:
        'Natural language calendar request, especially schedule or itinerary questions. Examples: "what is on my calendar today", "do i have any flights this week", "when do i fly back from denver", "create a meeting tomorrow at 3pm".',
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "title",
      description:
        "Event title when creating an event. Optional for read/search actions.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "query",
      description:
        "Short search phrase for search_events, such as flight, dentist, Denver, or return flight.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "queries",
      description:
        "Optional array of search phrases for search_events. The action will combine and dedupe them.",
      required: false,
      schema: {
        type: "array" as const,
        items: { type: "string" as const },
      },
    },
    {
      name: "details",
      description:
        "Optional structured calendar fields such as time bounds, timezone, calendar id, create-event timing, location, and attendees.",
      required: false,
      schema: { type: "object" as const },
    },
  ],
  examples: [
    [
      {
        name: "{{name1}}",
        content: { text: "What's on my calendar today?" },
      },
      {
        name: "{{agentName}}",
        content: { text: "Events today:\n- **Team sync** (10:00 AM – 10:30 AM)" },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: { text: "What is my next meeting?" },
      },
      {
        name: "{{agentName}}",
        content: { text: "**Next event: Product review** (2:00 PM – 3:00 PM) — in 45 min" },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: { text: "Create a dentist appointment for tomorrow at 3pm." },
      },
      {
        name: "{{agentName}}",
        content: { text: "Created calendar event \"Dentist appointment\" for tomorrow at 3:00 PM." },
      },
    ],
  ] as ActionExample[][],
};
