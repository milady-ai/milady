import type { Action, Memory, ProviderDataRecord } from "@elizaos/core";
import type {
  LifeOpsCalendarEvent,
  LifeOpsCalendarFeed,
  LifeOpsGmailBatchReplyDraftsFeed,
  LifeOpsGmailMessageSummary,
  LifeOpsGmailNeedsResponseFeed,
  LifeOpsGmailReplyDraft,
  LifeOpsGmailSearchFeed,
  LifeOpsGmailTriageFeed,
  LifeOpsGoogleConnectorStatus,
  LifeOpsNextCalendarEventContext,
  LifeOpsOverview,
} from "@miladyai/shared/contracts/lifeops";
import type { LifeOpsService } from "../lifeops/service.js";
import { hasPrivateAccess } from "../security/access.js";

export const INTERNAL_URL = new URL("http://127.0.0.1/");

export function toActionData<T extends object>(data: T): ProviderDataRecord {
  return data as unknown as ProviderDataRecord;
}

export function messageSource(message: Memory): string | null {
  const source = (message.content as Record<string, unknown> | undefined)
    ?.source;
  return typeof source === "string" ? source : null;
}

export function messageText(message: Memory): string {
  const text = (message.content as Record<string, unknown> | undefined)?.text;
  return typeof text === "string" ? text : "";
}

export async function hasLifeOpsAccess(
  runtime: Parameters<NonNullable<Action["validate"]>>[0],
  message: Memory,
): Promise<boolean> {
  return hasPrivateAccess(runtime, message);
}

export function detailString(
  details: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = details?.[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

export function detailNumber(
  details: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = details?.[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export function detailBoolean(
  details: Record<string, unknown> | undefined,
  key: string,
): boolean | undefined {
  const value = details?.[key];
  return typeof value === "boolean" ? value : undefined;
}

export function detailObject(
  details: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const value = details?.[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function detailArray(
  details: Record<string, unknown> | undefined,
  key: string,
): unknown[] | undefined {
  const value = details?.[key];
  return Array.isArray(value) ? value : undefined;
}

export function dayRange(offset: number) {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const start = new Date(base.getTime() + offset * 86_400_000);
  return {
    timeMin: start.toISOString(),
    timeMax: new Date(start.getTime() + 86_400_000).toISOString(),
  };
}

export function weekRange() {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  return {
    timeMin: base.toISOString(),
    timeMax: new Date(base.getTime() + 7 * 86_400_000).toISOString(),
  };
}

export function futureRange(days: number) {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  return {
    timeMin: base.toISOString(),
    timeMax: new Date(base.getTime() + days * 86_400_000).toISOString(),
  };
}

function formatEventTime(event: LifeOpsCalendarEvent): string {
  if (event.isAllDay) {
    return "all day";
  }
  const format: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
  };
  return `${new Date(event.startAt).toLocaleTimeString(undefined, format)} – ${new Date(event.endAt).toLocaleTimeString(undefined, format)}`;
}

export function formatRelativeMinutes(minutes: number): string {
  if (minutes <= 0) {
    return "now";
  }
  if (minutes < 60) {
    return `in ${Math.round(minutes)} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);
  return remainingMinutes === 0
    ? `in ${hours}h`
    : `in ${hours}h ${remainingMinutes}m`;
}

export function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - Date.parse(isoDate);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatCalendarFeed(
  feed: LifeOpsCalendarFeed,
  label: string,
): string {
  if (feed.events.length === 0) {
    return `No events ${label}.`;
  }
  const lines: string[] = [`Events ${label}:`];
  for (const event of feed.events) {
    const time = formatEventTime(event);
    const parts = [`- **${event.title}** (${time})`];
    if (event.location) {
      parts.push(`  Location: ${event.location}`);
    }
    if (event.attendees.length > 0) {
      const names = event.attendees
        .slice(0, 4)
        .map((attendee) => attendee.displayName || attendee.email || "unknown")
        .join(", ");
      const suffix =
        event.attendees.length > 4
          ? ` +${event.attendees.length - 4} more`
          : "";
      parts.push(`  With: ${names}${suffix}`);
    }
    if (event.conferenceLink) {
      parts.push(`  Video: ${event.conferenceLink}`);
    }
    lines.push(parts.join("\n"));
  }
  return lines.join("\n");
}

export function formatNextEventContext(
  context: LifeOpsNextCalendarEventContext,
): string {
  if (!context.event) {
    return "No upcoming events on your calendar.";
  }
  const lines = [
    `**Next event: ${context.event.title}** (${formatEventTime(context.event)})`,
  ];
  if (context.startsInMinutes !== null) {
    lines[0] += ` — ${formatRelativeMinutes(context.startsInMinutes)}`;
  }
  if (context.location) {
    lines.push(`Location: ${context.location}`);
  }
  if (context.conferenceLink) {
    lines.push(`Video link: ${context.conferenceLink}`);
  }
  if (context.attendeeNames.length > 0) {
    lines.push(`Attendees: ${context.attendeeNames.join(", ")}`);
  }
  if (context.preparationChecklist.length > 0) {
    lines.push("Preparation:");
    for (const item of context.preparationChecklist) {
      lines.push(`- ${item}`);
    }
  }
  if (context.linkedMail.length > 0) {
    lines.push("Related emails:");
    for (const mail of context.linkedMail.slice(0, 3)) {
      lines.push(
        `- "${mail.subject}" from ${mail.from} (${mail.snippet?.slice(0, 60) ?? ""})`,
      );
    }
  }
  return lines.join("\n");
}

export function formatEmailTriage(feed: LifeOpsGmailTriageFeed): string {
  if (feed.messages.length === 0) {
    return "No important emails right now.";
  }
  const { summary } = feed;
  const parts: string[] = [];
  if (summary.unreadCount > 0) {
    parts.push(`${summary.unreadCount} unread`);
  }
  if (summary.importantNewCount > 0) {
    parts.push(`${summary.importantNewCount} important`);
  }
  if (summary.likelyReplyNeededCount > 0) {
    parts.push(`${summary.likelyReplyNeededCount} likely need a reply`);
  }
  const lines = [
    parts.length > 0 ? `Email inbox: ${parts.join(", ")}.` : "Email inbox:",
  ];
  for (const message of feed.messages.slice(0, 8)) {
    const badges: string[] = [];
    if (message.isImportant) {
      badges.push("important");
    }
    if (message.likelyReplyNeeded) {
      badges.push("reply needed");
    }
    const badgeText = badges.length > 0 ? ` [${badges.join(", ")}]` : "";
    const from = message.from || message.fromEmail || "unknown";
    lines.push(`- **${message.subject}**${badgeText}`);
    lines.push(`  From: ${from} · ${formatRelativeTime(message.receivedAt)}`);
    if (message.snippet) {
      lines.push(`  ${message.snippet.slice(0, 100)}`);
    }
  }
  return lines.join("\n");
}

export function formatEmailNeedsResponse(
  feed: LifeOpsGmailNeedsResponseFeed,
): string {
  if (feed.messages.length === 0) {
    return "No emails look like they need a reply right now.";
  }
  const lines = [
    `Emails that likely need a reply: ${feed.summary.totalCount}.`,
  ];
  for (const message of feed.messages.slice(0, 8)) {
    const from = message.from || message.fromEmail || "unknown";
    lines.push(
      `- **${message.subject}** from ${from} · ${formatRelativeTime(message.receivedAt)}`,
    );
    if (message.snippet) {
      lines.push(`  ${message.snippet.slice(0, 120)}`);
    }
  }
  return lines.join("\n");
}

function describeEmailSearchQuery(query: string): string {
  const parts = query
    .trim()
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) {
    return `"${query}"`;
  }

  const sender = parts
    .find((part) => /^from:/i.test(part))
    ?.replace(/^from:/i, "")
    .replace(/^"|"$/g, "");
  const newerThan = parts
    .find((part) => /^newer_than:/i.test(part))
    ?.replace(/^newer_than:/i, "");
  const before = parts
    .find((part) => /^before:/i.test(part))
    ?.replace(/^before:/i, "");
  const after = parts
    .find((part) => /^after:/i.test(part))
    ?.replace(/^after:/i, "");
  const isUnread = parts.some((part) => /^is:unread$/i.test(part));
  const isImportant = parts.some((part) => /^is:important$/i.test(part));
  const keywords = parts.filter(
    (part) =>
      !/^(from|newer_than|before|after|is):/i.test(part) &&
      part.trim().length > 0,
  );

  const descriptions: string[] = [];
  const formatRelativeWindow = (value: string) => {
    const match = value.match(/^(\d+)([dmy])$/i);
    if (!match) {
      return value;
    }
    const unit =
      match[2].toLowerCase() === "d"
        ? "day"
        : match[2].toLowerCase() === "m"
          ? "month"
          : "year";
    const amount = Number(match[1]);
    return `${amount} ${unit}${amount === 1 ? "" : "s"}`;
  };
  if (sender) {
    descriptions.push(`sender "${sender}"`);
  }
  if (keywords.length > 0) {
    descriptions.push(`matching "${keywords.join(" ")}"`);
  }
  if (newerThan) {
    descriptions.push(`from the last ${formatRelativeWindow(newerThan)}`);
  }
  if (after) {
    descriptions.push(`after ${after}`);
  }
  if (before) {
    descriptions.push(`before ${before}`);
  }
  if (isUnread) {
    descriptions.push("that are unread");
  }
  if (isImportant) {
    descriptions.push("that are marked important");
  }

  return descriptions.length > 0 ? descriptions.join(" ") : `"${query}"`;
}

type LifeOpsGmailReadResultLike = {
  query: string | null;
  message: LifeOpsGmailMessageSummary;
  bodyText: string;
};

export function formatEmailSearch(feed: LifeOpsGmailSearchFeed): string {
  const queryDescription = describeEmailSearchQuery(feed.query);
  if (feed.messages.length === 0) {
    return `No email matched ${queryDescription}.`;
  }
  const lines = [
    `Found ${feed.summary.totalCount} email${feed.summary.totalCount === 1 ? "" : "s"} for ${queryDescription}.`,
  ];
  for (const message of feed.messages.slice(0, 8)) {
    const badges: string[] = [];
    if (message.isImportant) {
      badges.push("important");
    }
    if (message.likelyReplyNeeded) {
      badges.push("reply needed");
    }
    const badgeText = badges.length > 0 ? ` [${badges.join(", ")}]` : "";
    const from = message.from || message.fromEmail || "unknown";
    lines.push(
      `- **${message.subject}**${badgeText} from ${from} · ${formatRelativeTime(message.receivedAt)}`,
    );
    if (message.snippet) {
      lines.push(`  ${message.snippet.slice(0, 120)}`);
    }
  }
  return lines.join("\n");
}

export function formatEmailRead(result: LifeOpsGmailReadResultLike): string {
  const from = result.message.from || result.message.fromEmail || "unknown";
  const bodyText = result.bodyText.trim();
  const maxChars = 2_500;
  const truncated = bodyText.length > maxChars;
  const preview = truncated
    ? `${bodyText.slice(0, maxChars).trimEnd()}\n\n[truncated]`
    : bodyText;
  const lines = [
    `**${result.message.subject}** from ${from} · ${formatRelativeTime(result.message.receivedAt)}`,
  ];
  if (result.query) {
    lines.push(`Resolved from ${describeEmailSearchQuery(result.query)}.`);
  }
  if (preview.length > 0) {
    lines.push(preview);
  } else if (result.message.snippet) {
    lines.push(
      `No readable body was available. Snippet: ${result.message.snippet}`,
    );
  } else {
    lines.push("No readable body was available for that email.");
  }
  return lines.join("\n\n");
}

export function formatGmailReplyDraft(draft: LifeOpsGmailReplyDraft): string {
  const lines = [`Drafted reply for **${draft.subject}**.`];
  if (draft.to.length > 0) {
    lines.push(`To: ${draft.to.join(", ")}`);
  }
  if (draft.cc.length > 0) {
    lines.push(`Cc: ${draft.cc.join(", ")}`);
  }
  lines.push("Preview:");
  for (const line of draft.previewLines.slice(0, 5)) {
    lines.push(`- ${line}`);
  }
  lines.push(
    draft.sendAllowed
      ? "Send is allowed, but still requires explicit confirmation."
      : "Send is not allowed with the current Google grant.",
  );
  return lines.join("\n");
}

export function formatGmailBatchReplyDrafts(
  batch: LifeOpsGmailBatchReplyDraftsFeed,
): string {
  if (batch.drafts.length === 0) {
    return "No Gmail reply drafts were created.";
  }
  const lines = [
    `Drafted ${batch.summary.totalCount} Gmail repl${batch.summary.totalCount === 1 ? "y" : "ies"}.`,
  ];
  for (const draft of batch.drafts.slice(0, 5)) {
    lines.push(
      `- **${draft.subject}** → ${draft.to.join(", ") || "reply recipients"}`,
    );
  }
  if (batch.summary.requiresConfirmationCount > 0) {
    lines.push(
      `${batch.summary.requiresConfirmationCount} draft${batch.summary.requiresConfirmationCount === 1 ? "" : "s"} still require send confirmation.`,
    );
  }
  return lines.join("\n");
}

export function formatOverview(overview: LifeOpsOverview): string {
  const summary = overview.owner.summary;
  const lines = [
    "Life Ops overview:",
    `- ${summary.activeOccurrenceCount} active items (${summary.overdueOccurrenceCount} overdue, ${summary.snoozedOccurrenceCount} snoozed)`,
    `- ${summary.activeGoalCount} active goals`,
    `- ${summary.activeReminderCount} pending reminders`,
  ];
  if (overview.owner.occurrences.length > 0) {
    lines.push("\nCurrent items:");
    for (const occurrence of overview.owner.occurrences.slice(0, 5)) {
      const state =
        occurrence.state !== "visible" ? ` (${occurrence.state})` : "";
      lines.push(`- ${occurrence.title}${state}`);
    }
  }
  if (overview.owner.goals.length > 0) {
    lines.push("\nActive goals:");
    for (const goal of overview.owner.goals.slice(0, 3)) {
      lines.push(`- ${goal.title} (${goal.status})`);
    }
  }
  return lines.join("\n");
}

export type GoogleCapabilityStatus = {
  status: LifeOpsGoogleConnectorStatus | null;
  connected: boolean;
  hasCalendarRead: boolean;
  hasCalendarWrite: boolean;
  hasGmailTriage: boolean;
  hasGmailSend: boolean;
};

export async function getGoogleCapabilityStatus(
  service: LifeOpsService,
): Promise<GoogleCapabilityStatus> {
  let status: LifeOpsGoogleConnectorStatus;
  try {
    status = await service.getGoogleConnectorStatus(INTERNAL_URL);
  } catch {
    return {
      status: null,
      connected: false,
      hasCalendarRead: false,
      hasCalendarWrite: false,
      hasGmailTriage: false,
      hasGmailSend: false,
    };
  }
  const capabilities = new Set(status.grantedCapabilities ?? []);
  return {
    status,
    connected: status.connected,
    hasCalendarRead:
      capabilities.has("google.calendar.read") ||
      capabilities.has("google.calendar.write"),
    hasCalendarWrite: capabilities.has("google.calendar.write"),
    hasGmailTriage: capabilities.has("google.gmail.triage"),
    hasGmailSend: capabilities.has("google.gmail.send"),
  };
}

export function calendarReadUnavailableMessage(
  google: GoogleCapabilityStatus,
): string {
  return google.connected
    ? "Google Calendar access is limited. Reconnect Google in LifeOps settings to grant calendar access."
    : "Google Calendar is not connected. Connect Google in LifeOps settings to use calendar actions.";
}

export function calendarWriteUnavailableMessage(
  google: GoogleCapabilityStatus,
): string {
  return google.connected
    ? "Google Calendar write access is not granted. Reconnect Google in LifeOps settings to allow calendar event creation."
    : "Google Calendar is not connected. Connect Google in LifeOps settings before creating calendar events.";
}

export function gmailReadUnavailableMessage(
  google: GoogleCapabilityStatus,
): string {
  return google.connected
    ? "Gmail access is limited. Reconnect Google in LifeOps settings to grant Gmail triage and search access."
    : "Gmail is not connected. Connect Google in LifeOps settings to use Gmail actions.";
}

export function gmailSendUnavailableMessage(
  google: GoogleCapabilityStatus,
): string {
  return google.connected
    ? "Gmail send access is not granted. Reconnect Google in LifeOps settings to allow email sending."
    : "Gmail is not connected. Connect Google in LifeOps settings before sending email.";
}
