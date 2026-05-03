import { getGoogleAccessToken } from "./google-auth";

const BASE = "https://www.googleapis.com/calendar/v3";

async function calFetch(userId: string, path: string, init: RequestInit = {}) {
  const token = await getGoogleAccessToken(userId);
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* keep null */ }
  if (!res.ok) {
    const msg = (data && typeof data === "object" && "error" in data)
      ? JSON.stringify((data as { error: unknown }).error)
      : text || res.statusText;
    throw new Error(`Calendar API ${res.status}: ${msg}`);
  }
  return data;
}

export type EventDateTime =
  | { dateTime: string; timeZone?: string }
  | { date: string };

export type CalendarAttendee = {
  email: string;
  displayName?: string;
  responseStatus?: "needsAction" | "declined" | "tentative" | "accepted";
};

export type CalendarEvent = {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  start: EventDateTime;
  end: EventDateTime;
  attendees?: CalendarAttendee[];
  htmlLink?: string;
  status?: string;
  hangoutLink?: string;
};

export async function listCalendars(userId: string): Promise<Array<{
  id: string;
  summary: string;
  primary: boolean;
  timeZone: string;
}>> {
  const data = await calFetch(userId, "/users/me/calendarList") as {
    items?: Array<{ id: string; summary: string; primary?: boolean; timeZone: string }>;
  };
  return (data.items ?? []).map((c) => ({
    id: c.id,
    summary: c.summary,
    primary: !!c.primary,
    timeZone: c.timeZone,
  }));
}

export async function listEvents(userId: string, args: {
  calendarId?: string;
  timeMin?: string;
  timeMax?: string;
  q?: string;
  maxResults?: number;
}): Promise<CalendarEvent[]> {
  const calendarId = args.calendarId ?? "primary";
  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(Math.min(Math.max(args.maxResults ?? 25, 1), 100)),
  });
  if (args.timeMin) params.set("timeMin", args.timeMin);
  if (args.timeMax) params.set("timeMax", args.timeMax);
  if (args.q) params.set("q", args.q);

  const data = await calFetch(
    userId,
    `/calendars/${encodeURIComponent(calendarId)}/events?${params}`
  ) as { items?: CalendarEvent[] };
  return data.items ?? [];
}

export async function getEvent(
  userId: string,
  calendarId: string,
  eventId: string
): Promise<CalendarEvent> {
  return await calFetch(
    userId,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`
  ) as CalendarEvent;
}

export async function createEvent(
  userId: string,
  calendarId: string,
  event: Omit<CalendarEvent, "id" | "htmlLink" | "status" | "hangoutLink">
): Promise<CalendarEvent> {
  return await calFetch(
    userId,
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      body: JSON.stringify(event),
    }
  ) as CalendarEvent;
}

export async function updateEvent(
  userId: string,
  calendarId: string,
  eventId: string,
  patch: Partial<CalendarEvent>
): Promise<CalendarEvent> {
  return await calFetch(
    userId,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    }
  ) as CalendarEvent;
}

export async function deleteEvent(
  userId: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  await calFetch(
    userId,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" }
  );
}

async function getOwnerEmail(userId: string): Promise<string> {
  // Find the primary calendar's id, which equals the owner email for personal accounts.
  const cals = await listCalendars(userId);
  const primary = cals.find((c) => c.primary);
  return primary?.id ?? "";
}

export async function respondToEvent(
  userId: string,
  calendarId: string,
  eventId: string,
  response: "accepted" | "declined" | "tentative"
): Promise<void> {
  const event = await getEvent(userId, calendarId, eventId);
  const ownerEmail = await getOwnerEmail(userId);
  const attendees = (event.attendees ?? []).map((a) =>
    a.email.toLowerCase() === ownerEmail.toLowerCase()
      ? { ...a, responseStatus: response }
      : a
  );
  await updateEvent(userId, calendarId, eventId, { attendees });
}

type FreeBusyInterval = { start: string; end: string };

function maxIso(a: string, b: string) { return a > b ? a : b; }
function minIso(a: string, b: string) { return a < b ? a : b; }

function mergeIntervals(intervals: FreeBusyInterval[]): FreeBusyInterval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start.localeCompare(b.start));
  const merged: FreeBusyInterval[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const next = sorted[i];
    if (next.start <= last.end) {
      last.end = maxIso(last.end, next.end);
    } else {
      merged.push({ ...next });
    }
  }
  return merged;
}

export async function suggestTime(userId: string, args: {
  durationMinutes: number;
  attendees: string[];
  withinDays?: number;
}): Promise<Array<{ start: string; end: string }>> {
  const duration = Math.max(15, Math.min(args.durationMinutes, 8 * 60));
  const days = Math.max(1, Math.min(args.withinDays ?? 7, 30));

  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + days * 86400_000).toISOString();

  const items = (args.attendees.length > 0 ? args.attendees : ["primary"]).map((email) => ({ id: email }));

  const data = await calFetch(userId, "/freeBusy", {
    method: "POST",
    body: JSON.stringify({ timeMin, timeMax, items }),
  }) as { calendars?: Record<string, { busy?: FreeBusyInterval[] }> };

  const allBusy: FreeBusyInterval[] = [];
  for (const cal of Object.values(data.calendars ?? {})) {
    for (const interval of cal.busy ?? []) {
      allBusy.push({ start: interval.start, end: interval.end });
    }
  }
  const busy = mergeIntervals(allBusy);

  // Walk forward day-by-day, business hours 9–17 in user's local timezone (best-effort: server local TZ).
  const slots: Array<{ start: string; end: string }> = [];
  const slotMs = duration * 60_000;

  for (let d = 0; d < days && slots.length < 5; d++) {
    const day = new Date(now);
    day.setDate(day.getDate() + d);
    day.setHours(9, 0, 0, 0);
    const dayStart = new Date(day);
    const dayEnd = new Date(day);
    dayEnd.setHours(17, 0, 0, 0);

    if (dayEnd.getTime() <= now.getTime()) continue;
    const windowStart = new Date(Math.max(dayStart.getTime(), now.getTime()));

    let cursor = windowStart.getTime();
    const windowEndMs = dayEnd.getTime();

    while (cursor + slotMs <= windowEndMs && slots.length < 5) {
      const startIso = new Date(cursor).toISOString();
      const endIso = new Date(cursor + slotMs).toISOString();

      const conflict = busy.some(
        (b) => maxIso(b.start, startIso) < minIso(b.end, endIso)
      );
      if (!conflict) {
        slots.push({ start: startIso, end: endIso });
        cursor += slotMs;
      } else {
        // Jump to the end of the conflicting busy block
        const blocking = busy.find((b) => maxIso(b.start, startIso) < minIso(b.end, endIso));
        cursor = blocking ? new Date(blocking.end).getTime() : cursor + 30 * 60_000;
      }
    }
  }
  return slots;
}
