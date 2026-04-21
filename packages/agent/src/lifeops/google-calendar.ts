import type { LifeOpsCalendarEvent } from "@miladyai/shared/contracts/lifeops";
import { GoogleApiError } from "./google-api-error.js";

const GOOGLE_CALENDAR_EVENTS_ENDPOINT =
  "https://www.googleapis.com/calendar/v3/calendars";

interface GoogleCalendarEventDate {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

interface GoogleCalendarApiEvent {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  hangoutLink?: string;
  iCalUID?: string;
  recurringEventId?: string;
  created?: string;
  updated?: string;
  start?: GoogleCalendarEventDate;
  end?: GoogleCalendarEventDate;
  organizer?: {
    email?: string;
    displayName?: string;
    self?: boolean;
  };
  attendees?: Array<{
    email?: string;
    displayName?: string;
    responseStatus?: string;
    self?: boolean;
    organizer?: boolean;
    optional?: boolean;
  }>;
  conferenceData?: {
    entryPoints?: Array<{
      uri?: string;
      label?: string;
      entryPointType?: string;
    }>;
  };
}

interface GoogleCalendarCreateRequestBody {
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  attendees?: Array<{
    email: string;
    displayName?: string;
    optional?: boolean;
  }>;
}

export interface SyncedGoogleCalendarEvent
  extends Omit<
    LifeOpsCalendarEvent,
    "id" | "agentId" | "provider" | "side" | "syncedAt" | "updatedAt"
  > {}

function readGoogleEventInstant(
  value: GoogleCalendarEventDate | undefined,
): { iso: string; isAllDay: boolean; timeZone: string | null } | null {
  if (!value) {
    return null;
  }
  if (typeof value.dateTime === "string" && value.dateTime.trim().length > 0) {
    return {
      iso: new Date(value.dateTime).toISOString(),
      isAllDay: false,
      timeZone: value.timeZone?.trim() || null,
    };
  }
  if (typeof value.date === "string" && value.date.trim().length > 0) {
    return {
      iso: new Date(`${value.date}T00:00:00.000Z`).toISOString(),
      isAllDay: true,
      timeZone: value.timeZone?.trim() || null,
    };
  }
  return null;
}

function readConferenceLink(event: GoogleCalendarApiEvent): string | null {
  if (event.hangoutLink?.trim()) {
    return event.hangoutLink.trim();
  }
  const entryPoint = event.conferenceData?.entryPoints?.find(
    (candidate) =>
      typeof candidate.uri === "string" && candidate.uri.trim().length > 0,
  );
  return entryPoint?.uri?.trim() || null;
}

function normalizeGoogleCalendarEvent(
  calendarId: string,
  event: GoogleCalendarApiEvent,
): SyncedGoogleCalendarEvent | null {
  const externalId = event.id?.trim();
  const start = readGoogleEventInstant(event.start);
  const end = readGoogleEventInstant(event.end);
  if (!externalId || !start || !end) {
    return null;
  }

  return {
    externalId,
    calendarId,
    title: event.summary?.trim() || "Untitled event",
    description: event.description?.trim() || "",
    location: event.location?.trim() || "",
    status: event.status?.trim() || "confirmed",
    startAt: start.iso,
    endAt: end.iso,
    isAllDay: start.isAllDay,
    timezone: start.timeZone || end.timeZone,
    htmlLink: event.htmlLink?.trim() || null,
    conferenceLink: readConferenceLink(event),
    organizer: event.organizer
      ? {
          email: event.organizer.email?.trim() || null,
          displayName: event.organizer.displayName?.trim() || null,
          self: Boolean(event.organizer.self),
        }
      : null,
    attendees: (event.attendees ?? []).map((attendee) => ({
      email: attendee.email?.trim() || null,
      displayName: attendee.displayName?.trim() || null,
      responseStatus: attendee.responseStatus?.trim() || null,
      self: Boolean(attendee.self),
      organizer: Boolean(attendee.organizer),
      optional: Boolean(attendee.optional),
    })),
    metadata: {
      iCalUID: event.iCalUID?.trim() || null,
      recurringEventId: event.recurringEventId?.trim() || null,
      createdAt: event.created?.trim() || null,
    },
  };
}

async function readGoogleCalendarError(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) {
    return `Google Calendar request failed with ${response.status}`;
  }
  try {
    const parsed = JSON.parse(text) as {
      error?: { message?: string };
    };
    return parsed.error?.message || text;
  } catch {
    return text;
  }
}

export async function fetchGoogleCalendarEvents(args: {
  accessToken: string;
  calendarId?: string;
  timeMin: string;
  timeMax: string;
  timeZone?: string;
}): Promise<SyncedGoogleCalendarEvent[]> {
  const calendarId = args.calendarId ?? "primary";
  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    showDeleted: "false",
    maxResults: "50",
    timeMin: args.timeMin,
    timeMax: args.timeMax,
    fields:
      "items(id,status,summary,description,location,htmlLink,hangoutLink,iCalUID,recurringEventId,created,updated,start,end,organizer(email,displayName,self),attendees(email,displayName,responseStatus,self,organizer,optional),conferenceData(entryPoints(uri,label,entryPointType)))",
  });
  if (args.timeZone?.trim()) {
    params.set("timeZone", args.timeZone.trim());
  }

  const response = await fetch(
    `${GOOGLE_CALENDAR_EVENTS_ENDPOINT}/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new GoogleApiError(
      response.status,
      await readGoogleCalendarError(response),
    );
  }

  const parsed = (await response.json()) as {
    items?: GoogleCalendarApiEvent[];
  };
  const events: SyncedGoogleCalendarEvent[] = [];
  for (const item of parsed.items ?? []) {
    const normalized = normalizeGoogleCalendarEvent(calendarId, item);
    if (normalized) {
      events.push(normalized);
    }
  }
  return events;
}

export async function createGoogleCalendarEvent(args: {
  accessToken: string;
  calendarId?: string;
  title: string;
  description?: string;
  location?: string;
  startAt: string;
  endAt: string;
  timeZone: string;
  attendees?: Array<{
    email: string;
    displayName?: string;
    optional?: boolean;
  }>;
}): Promise<SyncedGoogleCalendarEvent> {
  const calendarId = args.calendarId ?? "primary";
  const body: GoogleCalendarCreateRequestBody = {
    summary: args.title,
    start: {
      dateTime: args.startAt,
      timeZone: args.timeZone,
    },
    end: {
      dateTime: args.endAt,
      timeZone: args.timeZone,
    },
  };
  if (args.description?.trim()) {
    body.description = args.description.trim();
  }
  if (args.location?.trim()) {
    body.location = args.location.trim();
  }
  if (args.attendees && args.attendees.length > 0) {
    body.attendees = args.attendees.map((attendee) => ({
      email: attendee.email,
      ...(attendee.displayName?.trim()
        ? { displayName: attendee.displayName.trim() }
        : {}),
      ...(attendee.optional ? { optional: true } : {}),
    }));
  }

  const response = await fetch(
    `${GOOGLE_CALENDAR_EVENTS_ENDPOINT}/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    throw new GoogleApiError(
      response.status,
      await readGoogleCalendarError(response),
    );
  }

  const parsed = (await response.json()) as GoogleCalendarApiEvent;
  const normalized = normalizeGoogleCalendarEvent(calendarId, parsed);
  if (!normalized) {
    throw new Error(
      "Google Calendar create event returned an invalid payload.",
    );
  }
  return normalized;
}
