import type {
  Action,
  HandlerOptions,
  Memory,
  ProviderDataRecord,
} from "@elizaos/core";
import {
  extractDurationMinutesFromText,
  extractWebsiteTargetsFromText,
  normalizeWebsiteTargets,
} from "@miladyai/plugin-selfcontrol/selfcontrol";
import { checkSenderRole } from "@miladyai/plugin-roles";
import type {
  CreateLifeOpsDefinitionRequest,
  CreateLifeOpsGoalRequest,
  LifeOpsCadence,
  LifeOpsCalendarEvent,
  LifeOpsCalendarFeed,
  LifeOpsDailySlot,
  LifeOpsDefinitionRecord,
  LifeOpsDomain,
  LifeOpsGmailTriageFeed,
  LifeOpsGoalRecord,
  LifeOpsGoogleConnectorStatus,
  LifeOpsNextCalendarEventContext,
  LifeOpsOverview,
  LifeOpsReminderIntensity,
  LifeOpsReminderStep,
  SetLifeOpsReminderPreferenceRequest,
  UpdateLifeOpsDefinitionRequest,
  UpdateLifeOpsGoalRequest,
} from "@miladyai/shared/contracts/lifeops";
import { LIFEOPS_REMINDER_INTENSITIES } from "@miladyai/shared/contracts/lifeops";
import { LifeOpsService, LifeOpsServiceError } from "../lifeops/service.js";

// ── Types ─────────────────────────────────────────────

type LifeOperation =
  | "create_definition"
  | "create_goal"
  | "update_definition"
  | "update_goal"
  | "delete_definition"
  | "delete_goal"
  | "complete_occurrence"
  | "skip_occurrence"
  | "snooze_occurrence"
  | "review_goal"
  | "capture_phone"
  | "configure_escalation"
  | "set_reminder_preference"
  | "query_calendar_today"
  | "query_calendar_next"
  | "query_email"
  | "query_overview";

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

const INTERNAL_URL = new URL("http://127.0.0.1/");

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

  if (looksLikeDefinitionCreateIntent(lower)) {
    return "create_definition";
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

  // Create goal — "I want to", "my goal is", "life goal"
  if (/\b(goal|life goal|want to .{5,}|aspir|aim to|commit to)\b/.test(lower)) return "create_goal";

  // Default: create a task/habit/routine
  return "create_definition";
}

function looksLikeDefinitionCreateIntent(lower: string): boolean {
  if (/\b(goal|my goal is|i want to|aspir|aim to|commit to)\b/.test(lower)) {
    return false;
  }
  return (
    /\b(create|add|set up|setup|start tracking|track|help me|need help|habit named|routine named|task named|remind me to)\b/.test(
      lower,
    ) &&
    /\b(every|daily|weekly|monthly|morning|night|afternoon|evening|twice a day|times a day|throughout the day|with lunch|with breakfast|with dinner|blocks?|unlock|until)\b/.test(
      lower,
    )
  );
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

function toActionData<T extends object>(data: T): ProviderDataRecord {
  return data as unknown as ProviderDataRecord;
}

function messageSource(message: Memory): string | null {
  const source = (message.content as Record<string, unknown> | undefined)?.source;
  return typeof source === "string" ? source : null;
}

function messageText(message: Memory): string {
  const text = (message.content as Record<string, unknown> | undefined)?.text;
  return typeof text === "string" ? text : "";
}

async function hasLifeOpsAccess(
  runtime: Parameters<NonNullable<Action["validate"]>>[0],
  message: Memory,
): Promise<boolean> {
  if (message.entityId === runtime.agentId) return true;
  const role = await checkSenderRole(runtime, message);
  return Boolean(role?.isAdmin);
}

function requestedOwnership(domain?: LifeOpsDomain) {
  if (domain === "agent_ops") {
    return { domain: "agent_ops" as const, subjectType: "agent" as const };
  }
  return { domain: "user_lifeops" as const, subjectType: "owner" as const };
}

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
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

function formatEventTime(event: LifeOpsCalendarEvent): string {
  if (event.isAllDay) return "all day";
  const fmt: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  return `${new Date(event.startAt).toLocaleTimeString(undefined, fmt)} – ${new Date(event.endAt).toLocaleTimeString(undefined, fmt)}`;
}

function formatRelativeMinutes(minutes: number): string {
  if (minutes <= 0) return "now";
  if (minutes < 60) return `in ${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `in ${h}h` : `in ${h}h ${m}m`;
}

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - Date.parse(isoDate);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatCalendarFeed(feed: LifeOpsCalendarFeed, label: string): string {
  if (feed.events.length === 0) return `No events ${label}.`;
  const lines: string[] = [`Events ${label}:`];
  for (const event of feed.events) {
    const time = formatEventTime(event);
    const parts = [`- **${event.title}** (${time})`];
    if (event.location) parts.push(`  Location: ${event.location}`);
    if (event.attendees.length > 0) {
      const names = event.attendees.slice(0, 4).map((a) => a.displayName || a.email || "unknown").join(", ");
      const suffix = event.attendees.length > 4 ? ` +${event.attendees.length - 4} more` : "";
      parts.push(`  With: ${names}${suffix}`);
    }
    if (event.conferenceLink) parts.push(`  Video: ${event.conferenceLink}`);
    lines.push(parts.join("\n"));
  }
  return lines.join("\n");
}

function formatNextEventContext(ctx: LifeOpsNextCalendarEventContext): string {
  if (!ctx.event) return "No upcoming events on your calendar.";
  const event = ctx.event;
  const lines = [`**Next event: ${event.title}** (${formatEventTime(event)})`];
  if (ctx.startsInMinutes !== null) lines[0] += ` — ${formatRelativeMinutes(ctx.startsInMinutes)}`;
  if (ctx.location) lines.push(`Location: ${ctx.location}`);
  if (ctx.conferenceLink) lines.push(`Video link: ${ctx.conferenceLink}`);
  if (ctx.attendeeNames.length > 0) lines.push(`Attendees: ${ctx.attendeeNames.join(", ")}`);
  if (ctx.preparationChecklist.length > 0) {
    lines.push("Preparation:");
    for (const item of ctx.preparationChecklist) lines.push(`- ${item}`);
  }
  if (ctx.linkedMail.length > 0) {
    lines.push("Related emails:");
    for (const mail of ctx.linkedMail.slice(0, 3))
      lines.push(`- "${mail.subject}" from ${mail.from} (${mail.snippet?.slice(0, 60) ?? ""})`);
  }
  return lines.join("\n");
}

function formatEmailTriage(feed: LifeOpsGmailTriageFeed): string {
  if (feed.messages.length === 0) return "No important emails right now.";
  const { summary } = feed;
  const parts: string[] = [];
  if (summary.unreadCount > 0) parts.push(`${summary.unreadCount} unread`);
  if (summary.importantNewCount > 0) parts.push(`${summary.importantNewCount} important`);
  if (summary.likelyReplyNeededCount > 0) parts.push(`${summary.likelyReplyNeededCount} likely need a reply`);
  const lines = [parts.length > 0 ? `Email inbox: ${parts.join(", ")}.` : "Email inbox:"];
  for (const msg of feed.messages.slice(0, 8)) {
    const badges: string[] = [];
    if (msg.isImportant) badges.push("important");
    if (msg.likelyReplyNeeded) badges.push("reply needed");
    const badgeStr = badges.length > 0 ? ` [${badges.join(", ")}]` : "";
    const from = msg.from || msg.fromEmail || "unknown";
    lines.push(`- **${msg.subject}**${badgeStr}`);
    lines.push(`  From: ${from} · ${formatRelativeTime(msg.receivedAt)}`);
    if (msg.snippet) lines.push(`  ${msg.snippet.slice(0, 100)}`);
  }
  return lines.join("\n");
}

function formatOverview(overview: LifeOpsOverview): string {
  const s = overview.owner.summary;
  const lines = [
    "Life Ops overview:",
    `- ${s.activeOccurrenceCount} active items (${s.overdueOccurrenceCount} overdue, ${s.snoozedOccurrenceCount} snoozed)`,
    `- ${s.activeGoalCount} active goals`,
    `- ${s.activeReminderCount} pending reminders`,
  ];
  if (overview.owner.occurrences.length > 0) {
    lines.push("\nCurrent items:");
    for (const occ of overview.owner.occurrences.slice(0, 5)) {
      const state = occ.state !== "visible" ? ` (${occ.state})` : "";
      lines.push(`- ${occ.title}${state}`);
    }
  }
  if (overview.owner.goals.length > 0) {
    lines.push("\nActive goals:");
    for (const goal of overview.owner.goals.slice(0, 3)) lines.push(`- ${goal.title} (${goal.status})`);
  }
  return lines.join("\n");
}

function dayRange(offset: number) {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const start = new Date(base.getTime() + offset * 86_400_000);
  return { timeMin: start.toISOString(), timeMax: new Date(start.getTime() + 86_400_000).toISOString() };
}

function weekRange() {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  return { timeMin: base.toISOString(), timeMax: new Date(base.getTime() + 7 * 86_400_000).toISOString() };
}

async function isGoogleConnected(service: LifeOpsService): Promise<{
  connected: boolean; hasCalendar: boolean; hasGmail: boolean;
}> {
  let status: LifeOpsGoogleConnectorStatus;
  try { status = await service.getGoogleConnectorStatus(INTERNAL_URL); }
  catch { return { connected: false, hasCalendar: false, hasGmail: false }; }
  const caps = status.grantedCapabilities ?? [];
  return {
    connected: status.connected,
    hasCalendar: caps.some((c) => c.startsWith("google.calendar")),
    hasGmail: caps.some((c) => c.startsWith("google.gmail")),
  };
}

// ── Details extractors ────────────────────────────────

function detailString(details: Record<string, unknown> | undefined, key: string): string | undefined {
  const v = details?.[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

function detailNumber(details: Record<string, unknown> | undefined, key: string): number | undefined {
  const v = details?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function detailBoolean(details: Record<string, unknown> | undefined, key: string): boolean | undefined {
  const v = details?.[key];
  return typeof v === "boolean" ? v : undefined;
}

function detailObject(details: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  const v = details?.[key];
  return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : undefined;
}

function detailArray(details: Record<string, unknown> | undefined, key: string): unknown[] | undefined {
  const v = details?.[key];
  return Array.isArray(v) ? v : undefined;
}

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
  if (/\bmorning\b/.test(lower)) windows.push("morning");
  if (/\bafternoon\b/.test(lower)) windows.push("afternoon");
  if (/\bevening\b/.test(lower)) windows.push("evening");
  if (/\bnight\b/.test(lower)) windows.push("night");
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
    /\b(daily|every day|each day|every morning|every afternoon|every evening|every night)\b/.test(
      lower,
    )
  ) {
    return {
      kind: "daily",
      windows: effectiveWindows,
    };
  }

  return null;
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
    "CHECK_CALENDAR",
    "CHECK_EMAIL",
    "CREATE_TASK",
    "CREATE_HABIT",
    "CREATE_GOAL",
    "TRACK_HABIT",
    "COMPLETE_TASK",
    "SNOOZE_REMINDER",
    "SET_REMINDER_INTENSITY",
  ],
  description:
    "Manage the user's personal routines, habits, goals, calendar, and email. Use this for: creating/editing/deleting tasks, habits, routines, and goals; completing, snoozing, or skipping items; checking calendar or email; reviewing goal progress; setting up phone/SMS escalation; and adjusting reminder intensity.",
  validate: async (runtime, message) => {
    const source = messageSource(message);
    return (
      (source === "client_chat" || message.entityId === runtime.agentId) &&
      (await hasLifeOpsAccess(runtime, message))
    );
  },
  handler: async (runtime, message, _state, options) => {
    if (!(await hasLifeOpsAccess(runtime, message))) {
      return { success: false, text: "Life management is restricted to the owner and the agent." };
    }

    const rawParams = (options as HandlerOptions | undefined)?.parameters as LifeParams | undefined;
    const params = rawParams ?? {} as LifeParams;
    const intent = params.intent?.trim() || messageText(message).trim();
    if (!intent) {
      return { success: false, text: "LIFE requires an intent describing what to do." };
    }

    const explicitAction = params.action && ACTION_TO_OPERATION[params.action];
    const operation = explicitAction ?? classifyIntent(intent);
    const service = new LifeOpsService(runtime);
    const details = params.details;
    const domain = detailString(details, "domain") as LifeOpsDomain | undefined;
    const ownership = requestedOwnership(domain);
    const chatText = messageText(message).trim();
    const inferredSeed = inferLifeDefinitionSeed(intent);
    const targetName = params.target ?? params.title ?? inferredSeed?.title;

    try {
    const createDefinition = async () => {
      const seed = inferredSeed;
      const title = params.title ?? seed?.title;
      const cadence =
        (detailObject(details, "cadence") as LifeOpsCadence | undefined) ??
        seed?.cadence;
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
        (detailString(details, "kind") as
          | CreateLifeOpsDefinitionRequest["kind"]
          | undefined) ??
        seed?.kind ??
        "habit";
      const goalRef =
        detailString(details, "goalId") ?? detailString(details, "goalTitle");
      const resolvedGoal = goalRef
        ? await resolveGoal(service, goalRef, domain)
        : null;
      const created = await service.createDefinition({
        ownership,
        kind,
        title,
        description: detailString(details, "description") ?? seed?.description,
        originalIntent: chatText || title,
        cadence,
        priority: detailNumber(details, "priority"),
        progressionRule: detailObject(
          details,
          "progressionRule",
        ) as CreateLifeOpsDefinitionRequest["progressionRule"],
        reminderPlan:
          (detailObject(details, "reminderPlan") as
            | CreateLifeOpsDefinitionRequest["reminderPlan"]
            | undefined) ?? seed?.reminderPlan,
        websiteAccess:
          (detailObject(details, "websiteAccess") as
            | CreateLifeOpsDefinitionRequest["websiteAccess"]
            | undefined) ?? seed?.websiteAccess,
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
      const google = await isGoogleConnected(service);
      if (!google.connected || !google.hasCalendar) {
        return { success: false, text: "Google Calendar is not connected. Connect Google in the settings to check your calendar." };
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
      const google = await isGoogleConnected(service);
      if (!google.connected || !google.hasGmail) {
        return { success: false, text: "Gmail is not connected. Connect Google with Gmail access in the settings to check your email." };
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
      const title = params.title;
      if (!title) return { success: false, text: "I need a name for this goal. What are you trying to achieve?" };
      const created = await service.createGoal({
        ownership,
        title,
        description: detailString(details, "description"),
        cadence: detailObject(details, "cadence"),
        supportStrategy: detailObject(details, "supportStrategy"),
        successCriteria: detailObject(details, "successCriteria"),
        metadata: { source: "chat", originalIntent: chatText || title },
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
        cadence: detailObject(details, "cadence") as LifeOpsCadence | undefined,
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
      required: true,
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
      required: true,
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
        "Structured data when needed. May include: cadence (schedule object), kind (task/habit/routine), description, priority, progressionRule, reminderPlan, preset (snooze preset like 15m/30m/1h/tonight/tomorrow_morning), minutes (snooze minutes), phoneNumber, allowSms, allowVoice, steps (escalation steps array), goalId, goalTitle, supportStrategy, successCriteria, note, limit, domain (user_lifeops/agent_ops), or reminder preference targeting.",
      required: false,
      schema: { type: "object" as const },
    },
  ],
};
