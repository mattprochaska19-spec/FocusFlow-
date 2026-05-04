// Thin wrapper over the Google Classroom v1 REST API.
// Uses the Google access token captured at sign-in (see auth-context).
// Token expires after ~1 hour; callers see a 401 and the user is asked to
// sign in again — same pattern as google-calendar.ts.

const BASE = 'https://classroom.googleapis.com/v1';

export type ClassroomCourse = {
  id: string;
  name: string;
  section?: string;
};

// Normalized Classroom assignment — fields chosen to merge cleanly with
// CalendarEvent in AssignmentsSection. id is prefixed so it cannot collide
// with a Calendar event id when both sources feed into submit_assignment.
export type ClassroomAssignment = {
  id: string;             // 'gc:{courseId}:{courseWorkId}'
  courseWorkId: string;   // raw id (used by future submission polling)
  courseId: string;
  courseTitle: string;
  title: string;
  description?: string;
  dueAt: string | null;   // ISO timestamp, or date-only midnight
  isAllDay: boolean;
  htmlLink?: string;
};

type RawCourseWork = {
  id: string;
  courseId: string;
  title?: string;
  description?: string;
  alternateLink?: string;
  workType?: 'ASSIGNMENT' | 'SHORT_ANSWER_QUESTION' | 'MULTIPLE_CHOICE_QUESTION' | string;
  state?: string;
  dueDate?: { year: number; month: number; day: number };
  dueTime?: { hours?: number; minutes?: number };
};

async function gfetch<T>(path: string, accessToken: string): Promise<T> {
  if (!accessToken) throw new Error('No Google access token. Sign in with Google first.');
  const resp = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (resp.status === 401) throw new Error('Google session expired. Sign in again.');
  if (resp.status === 403) {
    throw new Error('Classroom access not granted. Sign out and back in to refresh permissions.');
  }
  if (!resp.ok) throw new Error(`Classroom API error: ${resp.status}`);
  return (await resp.json()) as T;
}

export async function listActiveCourses(accessToken: string): Promise<ClassroomCourse[]> {
  const data = await gfetch<{ courses?: { id: string; name: string; section?: string }[] }>(
    '/courses?courseStates=ACTIVE&studentId=me&pageSize=50',
    accessToken,
  );
  return (data.courses ?? []).map((c) => ({ id: c.id, name: c.name, section: c.section }));
}

export async function listCourseWork(
  accessToken: string,
  courseId: string,
): Promise<RawCourseWork[]> {
  const data = await gfetch<{ courseWork?: RawCourseWork[] }>(
    `/courses/${encodeURIComponent(courseId)}/courseWork?courseWorkStates=PUBLISHED&pageSize=50`,
    accessToken,
  );
  return data.courseWork ?? [];
}

export async function fetchClassroomAssignments(
  accessToken: string,
  opts: { daysAhead?: number } = {},
): Promise<ClassroomAssignment[]> {
  const courses = await listActiveCourses(accessToken);
  if (courses.length === 0) return [];

  const work = await Promise.all(
    courses.map((c) => listCourseWork(accessToken, c.id).then((items) => ({ course: c, items }))),
  );

  const daysAhead = opts.daysAhead ?? 14;
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  const cutoffEnd = new Date(cutoff);
  cutoffEnd.setDate(cutoffEnd.getDate() + daysAhead);

  const out: ClassroomAssignment[] = [];
  for (const { course, items } of work) {
    for (const cw of items) {
      const { iso, isAllDay } = toIso(cw.dueDate, cw.dueTime);
      // Filter to "not yet past + within window"; coursework with no due date
      // stays visible (homework rolling assignments often have no due date).
      if (iso) {
        const due = new Date(iso);
        if (due < cutoff || due > cutoffEnd) continue;
      }
      out.push({
        id: `gc:${course.id}:${cw.id}`,
        courseWorkId: cw.id,
        courseId: course.id,
        courseTitle: course.name,
        title: cw.title ?? '(untitled)',
        description: cw.description,
        dueAt: iso,
        isAllDay,
        htmlLink: cw.alternateLink,
      });
    }
  }

  // Earliest due date first; no-due-date items sink to the bottom.
  out.sort((a, b) => {
    if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt);
    if (a.dueAt) return -1;
    if (b.dueAt) return 1;
    return a.title.localeCompare(b.title);
  });
  return out;
}

// Submission state for an individual coursework. Returns the most recent
// submission state for the signed-in user. Used by the focus-session polling
// loop to auto-end on TURNED_IN.
export type SubmissionState =
  | 'NEW'
  | 'CREATED'
  | 'TURNED_IN'
  | 'RETURNED'
  | 'RECLAIMED_BY_STUDENT'
  | 'SUBMISSION_STATE_UNSPECIFIED';

export async function getMySubmissionState(
  accessToken: string,
  courseId: string,
  courseWorkId: string,
): Promise<SubmissionState | null> {
  const data = await gfetch<{ studentSubmissions?: { state?: string }[] }>(
    `/courses/${encodeURIComponent(courseId)}/courseWork/${encodeURIComponent(courseWorkId)}/studentSubmissions?userId=me`,
    accessToken,
  );
  const subs = data.studentSubmissions ?? [];
  if (subs.length === 0) return null;
  return (subs[0].state as SubmissionState) ?? null;
}

// Classroom returns due dates as { year, month, day } and times as
// { hours, minutes } in UTC. Combine into ISO; if no time, treat as all-day.
function toIso(
  dueDate?: { year: number; month: number; day: number },
  dueTime?: { hours?: number; minutes?: number },
): { iso: string | null; isAllDay: boolean } {
  if (!dueDate) return { iso: null, isAllDay: false };
  const { year, month, day } = dueDate;
  if (!dueTime || (dueTime.hours == null && dueTime.minutes == null)) {
    const d = new Date(Date.UTC(year, month - 1, day));
    return { iso: d.toISOString(), isAllDay: true };
  }
  const d = new Date(Date.UTC(year, month - 1, day, dueTime.hours ?? 0, dueTime.minutes ?? 0));
  return { iso: d.toISOString(), isAllDay: false };
}
