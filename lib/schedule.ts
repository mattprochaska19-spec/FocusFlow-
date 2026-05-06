// Per-child screen-time schedule (Phase D groundwork).
//
// Each child has 0-N "blocks" — time windows on a given day-of-week during
// which specific apps are blocked. Outside any active block, the regular
// daily-limit rules apply. Blocks can cover a single app, a subset, or 'all'.
//
// Parent writes via direct supabase CRUD (RLS policy: parent of linked child).
// Child reads via realtime subscription on their own user_id.

import { supabase } from './supabase';

export type BlockedApp = 'tiktok' | 'instagram' | 'facebook' | 'twitter' | 'youtube' | 'all';

export type ScheduleBlock = {
  id: string;
  childUserId: string;
  dayOfWeek: number;       // 0=Sun..6=Sat
  startMinutes: number;    // 0..1439
  endMinutes: number;      // 1..1440
  blockedApps: BlockedApp[];
  // null = fully blocked during the window. Number = entertainment-minutes cap
  // during the window (educational still passes). 0 is treated like null.
  limitMinutes: number | null;
  label: string | null;
};

// Used when creating a new block (no id yet) or upserting.
export type ScheduleBlockInput = Omit<ScheduleBlock, 'id' | 'childUserId'> & {
  id?: string;
  childUserId: string;
};

export const DAY_LABELS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
export const DAY_LABELS_FULL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export const ALL_BLOCKABLE_APPS: BlockedApp[] = [
  'tiktok',
  'instagram',
  'facebook',
  'twitter',
  'youtube',
];

export const BLOCKABLE_APP_LABEL: Record<BlockedApp, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
  twitter: 'Twitter',
  youtube: 'YouTube',
  all: 'All',
};

// ── Time formatting ─────────────────────────────────────────────────────────

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function formatBlockedApps(apps: BlockedApp[]): string {
  if (apps.length === 0) return 'None';
  if (apps.includes('all') || apps.length >= ALL_BLOCKABLE_APPS.length) return 'All apps';
  return apps.map((a) => BLOCKABLE_APP_LABEL[a]).join(', ');
}

// ── Active-block detection (used by access rules + UI) ─────────────────────

// Given a Date, return all blocks active at that moment for that child.
export function getActiveBlocks(blocks: ScheduleBlock[], now: Date = new Date()): ScheduleBlock[] {
  const dow = now.getDay();
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  return blocks.filter(
    (b) => b.dayOfWeek === dow && minutesNow >= b.startMinutes && minutesNow < b.endMinutes,
  );
}

// True if any active block blocks the given app (or has 'all').
export function isAppBlockedNow(
  blocks: ScheduleBlock[],
  app: BlockedApp,
  now: Date = new Date(),
): boolean {
  const active = getActiveBlocks(blocks, now);
  return active.some((b) => b.blockedApps.includes('all') || b.blockedApps.includes(app));
}

// ── Supabase CRUD ──────────────────────────────────────────────────────────

type Row = {
  id: string;
  child_user_id: string;
  day_of_week: number;
  start_minutes: number;
  end_minutes: number;
  blocked_apps: string[];
  limit_minutes: number | null;
  label: string | null;
};

function fromRow(r: Row): ScheduleBlock {
  return {
    id: r.id,
    childUserId: r.child_user_id,
    dayOfWeek: r.day_of_week,
    startMinutes: r.start_minutes,
    endMinutes: r.end_minutes,
    blockedApps: (r.blocked_apps ?? []) as BlockedApp[],
    limitMinutes: r.limit_minutes,
    label: r.label,
  };
}

export async function fetchChildSchedule(childUserId: string): Promise<ScheduleBlock[]> {
  const { data, error } = await supabase
    .from('child_schedule_blocks')
    .select('id, child_user_id, day_of_week, start_minutes, end_minutes, blocked_apps, limit_minutes, label')
    .eq('child_user_id', childUserId)
    .order('day_of_week', { ascending: true })
    .order('start_minutes', { ascending: true });

  if (error) {
    console.warn('[Pandu] fetchChildSchedule failed:', error.message);
    return [];
  }
  return (data as Row[] ?? []).map(fromRow);
}

export async function upsertScheduleBlock(input: ScheduleBlockInput): Promise<{ error?: string }> {
  const row = {
    child_user_id: input.childUserId,
    day_of_week: input.dayOfWeek,
    start_minutes: input.startMinutes,
    end_minutes: input.endMinutes,
    blocked_apps: input.blockedApps,
    limit_minutes: input.limitMinutes,
    label: input.label && input.label.trim().length > 0 ? input.label.trim() : null,
  };

  if (input.id) {
    const { error } = await supabase.from('child_schedule_blocks').update(row).eq('id', input.id);
    if (error) return { error: error.message };
    return {};
  }
  const { error } = await supabase.from('child_schedule_blocks').insert(row);
  if (error) return { error: error.message };
  return {};
}

export async function deleteScheduleBlock(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.from('child_schedule_blocks').delete().eq('id', id);
  if (error) return { error: error.message };
  return {};
}
