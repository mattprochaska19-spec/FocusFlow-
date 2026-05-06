import { supabase } from './supabase';

// Per-child overrides for currently-global parent settings. NULL on a column
// means "inherit the parent default". Resolved client-side in focus-context.
export type ChildOverride = {
  childUserId: string;
  parentUserId: string;
  dailyLimitMinutes: number | null;
  lockUntilAssignmentsComplete: boolean | null;
  assignmentLockThreshold: number | null;
  updatedAt: string;
};

type Row = {
  child_user_id: string;
  parent_user_id: string;
  daily_limit_minutes: number | null;
  lock_until_assignments_complete: boolean | null;
  assignment_lock_threshold: number | null;
  updated_at: string;
};

function mapRow(r: Row): ChildOverride {
  return {
    childUserId: r.child_user_id,
    parentUserId: r.parent_user_id,
    dailyLimitMinutes: r.daily_limit_minutes,
    lockUntilAssignmentsComplete: r.lock_until_assignments_complete,
    assignmentLockThreshold: r.assignment_lock_threshold,
    updatedAt: r.updated_at,
  };
}

// Loads overrides visible to the caller (parents see their kids', kids see own).
export async function fetchChildOverrides(): Promise<{ overrides: ChildOverride[]; error?: string }> {
  const { data, error } = await supabase.from('child_overrides').select('*');
  if (error) return { overrides: [], error: error.message };
  return { overrides: ((data ?? []) as Row[]).map(mapRow) };
}

// Parent: upsert overrides for one of their kids. Pass `null` to inherit
// the parent default for a particular field.
export async function upsertChildOverride(input: {
  childUserId: string;
  dailyLimitMinutes: number | null;
  lockUntilAssignmentsComplete: boolean | null;
  assignmentLockThreshold: number | null;
}): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('upsert_child_override', {
    p_child_user_id: input.childUserId,
    p_daily_limit_minutes: input.dailyLimitMinutes,
    p_lock_until_assignments_complete: input.lockUntilAssignmentsComplete,
    p_assignment_lock_threshold: input.assignmentLockThreshold,
  });
  if (error) return { error: error.message };
  return {};
}
