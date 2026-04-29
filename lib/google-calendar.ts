// Thin wrapper over the Google Calendar v3 REST API.
// Uses the Google access token Supabase puts on session.provider_token after
// the Google OAuth sign-in. Token expires after ~1 hour; for now, callers see
// a 401 and the user is asked to sign in again.

export type CalendarEvent = {
  id: string;
  summary: string;          // event title
  description?: string;
  start: string;            // ISO timestamp (or date for all-day)
  end: string;
  isAllDay: boolean;
  htmlLink?: string;
};

export async function fetchUpcomingEvents(
  accessToken: string,
  opts: { calendarId?: string; daysAhead?: number; maxResults?: number } = {}
): Promise<CalendarEvent[]> {
  if (!accessToken) throw new Error('No Google access token. Sign in with Google first.');

  const calendarId = opts.calendarId ?? 'primary';
  const daysAhead = opts.daysAhead ?? 14;
  const maxResults = opts.maxResults ?? 50;

  const timeMin = new Date();
  timeMin.setHours(0, 0, 0, 0);
  const timeMax = new Date(timeMin);
  timeMax.setDate(timeMax.getDate() + daysAhead);

  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',     // expands recurring into individual instances
    orderBy: 'startTime',
    maxResults: String(maxResults),
  });

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (resp.status === 401) throw new Error('Google session expired. Sign in again.');
  if (!resp.ok) throw new Error(`Calendar API error: ${resp.status}`);

  const data = (await resp.json()) as {
    items?: {
      id: string;
      summary?: string;
      description?: string;
      htmlLink?: string;
      start: { dateTime?: string; date?: string };
      end: { dateTime?: string; date?: string };
    }[];
  };

  return (data.items ?? []).map((item) => {
    const startVal = item.start.dateTime ?? item.start.date;
    const endVal = item.end.dateTime ?? item.end.date;
    return {
      id: item.id,
      summary: item.summary ?? '(no title)',
      description: item.description,
      start: startVal!,
      end: endVal!,
      isAllDay: !item.start.dateTime,
      htmlLink: item.htmlLink,
    };
  });
}
