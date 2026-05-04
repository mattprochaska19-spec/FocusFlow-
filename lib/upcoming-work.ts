// Cross-account assignment sync (Layer 2 of the parent dashboard).
//
// Children's Calendar/Classroom data lives on their device (fetched with their
// own Google access token). Parents need to see what their kids have to do.
// Path: child's device upserts a snapshot to `child_upcoming_work` on each
// fetch; the parent's Family tab reads from there with RLS scoped to linked
// children.

import { supabase } from './supabase';

export type UpcomingWorkSource = 'calendar' | 'classroom';

export type UpcomingWorkItem = {
  source: UpcomingWorkSource;
  externalId: string;        // Calendar event id or 'gc:{courseId}:{courseWorkId}'
  title: string;
  dueAt: string | null;      // ISO timestamp, or null when not set
  courseTitle?: string;      // Classroom only
  isAllDay: boolean;
};

export type UpcomingWorkRow = UpcomingWorkItem & {
  id: string;
  childUserId: string;
  syncedAt: string;
};

// Push the caller's current upcoming-work snapshot. The RPC atomically wipes
// existing rows and replaces with this list — no need for the client to track
// what was added/removed. Caller is the child (auth.uid()).
export async function syncMyUpcomingWork(items: UpcomingWorkItem[]): Promise<{ error?: string }> {
  const payload = items.map((i) => ({
    source: i.source,
    external_id: i.externalId,
    title: i.title,
    due_at: i.dueAt ?? '',
    course_title: i.courseTitle ?? '',
    is_all_day: i.isAllDay,
  }));
  const { error } = await supabase.rpc('sync_my_upcoming_work', { p_items: payload });
  if (error) return { error: error.message };
  return {};
}

// Parent-side read for a specific linked child. RLS enforces the parent-child
// link; this fails silently (returns []) if the child isn't linked.
export async function fetchChildUpcomingWork(childUserId: string): Promise<UpcomingWorkRow[]> {
  const { data, error } = await supabase
    .from('child_upcoming_work')
    .select('id, child_user_id, source, external_id, title, due_at, course_title, is_all_day, synced_at')
    .eq('child_user_id', childUserId)
    .order('due_at', { ascending: true, nullsFirst: false });

  if (error) {
    console.warn('[FocusFlow] fetchChildUpcomingWork failed:', error.message);
    return [];
  }

  return (data ?? []).map((r) => ({
    id: r.id as string,
    childUserId: r.child_user_id as string,
    source: r.source as UpcomingWorkSource,
    externalId: r.external_id as string,
    title: r.title as string,
    dueAt: r.due_at as string | null,
    courseTitle: (r.course_title as string | null) ?? undefined,
    isAllDay: r.is_all_day as boolean,
    syncedAt: r.synced_at as string,
  }));
}
