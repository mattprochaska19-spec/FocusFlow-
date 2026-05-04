import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useAuth } from './auth-context';
import { getMySubmissionState } from './classroom';
import { fetchChildSchedule, type ScheduleBlock } from './schedule';
import { supabase } from './supabase';
import { DEFAULT_EDU_KEYWORDS, DEFAULT_ENT_KEYWORDS } from './youtube-filter';

export type AppId = 'tiktok' | 'instagram' | 'facebook' | 'twitter';

export type LimitedApp = {
  id: AppId;
  name: string;
  enabled: boolean;
  dailyLimitMinutes: number;
};

export type ChannelLimit = { name: string; minutes: number };

export type CreatorAllowance = {
  channelId: string;
  name: string;
  thumbnailUrl?: string;
  dailyVideoLimit: number;
};

export type EducationalChannel = {
  channelId: string;
  name: string;
  thumbnailUrl?: string;
};

export type ChannelWatch = { name: string; seconds: number };

export type TodayStats = {
  date: string;
  entertainmentSeconds: number;
  educationalSeconds: number;
  videoCount: number;
  watchedVideoIds: string[];
  channelTime: Record<string, ChannelWatch>;
  categoryTime: Record<string, number>;
  creatorVideoCount: Record<string, number>; // lowercased channelTitle → entertainment count
};

export type Override = { minutesAdded: number; expiresAt: number } | null;

export type ActiveFocusSession = {
  startedAt: number;       // epoch ms
  endsAt: number;          // epoch ms
  durationMinutes: number; // original duration, for display
  anchorTitle: string | null;       // optional assignment label
  anchorEventId: string | null;     // optional id (Calendar event id, or 'gc:*' Classroom prefix)
  anchorDueAt: string | null;       // ISO due-at carried through for auto-complete
  classroomCourseId: string | null;       // present when anchored to a Classroom assignment
  classroomCourseWorkId: string | null;   // ditto — the pair drives submission polling
  remoteSessionId?: string;         // present if parent-imposed (read from Supabase)
};

export type RemoteFocusSession = ActiveFocusSession & {
  remoteSessionId: string;
  parentUserId: string;
  childUserId: string;
};

export const FOCUS_BONUS_MULTIPLIER = 1.5;

export type Profile = {
  userId: string;
  role: 'parent' | 'student';
  familyCode: string | null;
  parentId: string | null;
};

export type AssignmentStatus = 'pending_review' | 'completed' | 'rejected';

export type Assignment = {
  id: string;
  studentUserId: string;
  googleEventId: string;
  title: string;
  dueAt: string | null;
  status: AssignmentStatus;
  completedAt: string | null;
  minutesEarned: number;
  createdAt: string;
};

export type FocusState = {
  focusModeEnabled: boolean;
  apiKey: string;
  dailyLimitMinutes: number;
  educationalChannels: EducationalChannel[];
  educationalKeywords: string[];
  entertainmentKeywords: string[];
  channelLimits: Record<string, ChannelLimit>;
  creatorAllowances: CreatorAllowance[];
  limitedApps: LimitedApp[];
  today: TodayStats;
  override: Override;
  allowFinishCurrentVideo: boolean;
  allowOverride: boolean;
  minutesPerAssignment: number;
  lockUntilAssignmentsComplete: boolean;
  assignmentLockThreshold: number;
  bulkBonusMinutes: number;
  bulkBonusThreshold: number;
};

const DEFAULT_LIMITED_APPS: LimitedApp[] = [
  { id: 'tiktok',    name: 'TikTok',    enabled: true, dailyLimitMinutes: 30 },
  { id: 'instagram', name: 'Instagram', enabled: true, dailyLimitMinutes: 30 },
  { id: 'facebook',  name: 'Facebook',  enabled: true, dailyLimitMinutes: 30 },
  { id: 'twitter',   name: 'Twitter',   enabled: true, dailyLimitMinutes: 30 },
];

function todayKey(): string {
  return new Date().toISOString().split('T')[0];
}

function endOfToday(): number {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function freshTodayStats(): TodayStats {
  return {
    date: todayKey(),
    entertainmentSeconds: 0,
    educationalSeconds: 0,
    videoCount: 0,
    watchedVideoIds: [],
    channelTime: {},
    categoryTime: {},
    creatorVideoCount: {},
  };
}

const ENV_API_KEY = process.env.EXPO_PUBLIC_YT_API_KEY ?? '';

const DEFAULT_STATE: FocusState = {
  focusModeEnabled: true,
  apiKey: ENV_API_KEY,
  dailyLimitMinutes: 60,
  educationalChannels: [],
  educationalKeywords: DEFAULT_EDU_KEYWORDS,
  entertainmentKeywords: DEFAULT_ENT_KEYWORDS,
  channelLimits: {},
  creatorAllowances: [],
  limitedApps: DEFAULT_LIMITED_APPS,
  today: freshTodayStats(),
  override: null,
  allowFinishCurrentVideo: true,
  allowOverride: true,
  minutesPerAssignment: 15,
  lockUntilAssignmentsComplete: false,
  assignmentLockThreshold: 1,
  bulkBonusMinutes: 0,
  bulkBonusThreshold: 3,
};

const STORAGE_KEY = 'focusflow_state_v1';

export type RecordWatchInput = {
  seconds: number;
  isEducational: boolean;
  videoId?: string;
  channelId?: string;
  channelTitle?: string;
  categoryId?: string;
};

type FocusContextValue = {
  state: FocusState;
  hydrated: boolean;
  profile: Profile | null;
  assignments: Assignment[];
  earnedMinutesToday: number;
  setMinutesPerAssignment: (minutes: number) => void;
  setFocusMode: (enabled: boolean) => void;
  toggleApp: (id: AppId) => void;
  updateApp: (id: AppId, patch: Partial<Omit<LimitedApp, 'id'>>) => void;
  setApiKey: (key: string) => void;
  setDailyLimitMinutes: (minutes: number) => void;
  addEducationalChannel: (channel: { channelId: string; name: string; thumbnailUrl?: string }) => void;
  removeEducationalChannel: (channelId: string) => void;
  setChannelLimit: (channelId: string, limit: ChannelLimit) => void;
  removeChannelLimit: (channelId: string) => void;
  addCreatorAllowance: (channel: { channelId: string; name: string; thumbnailUrl?: string }, dailyVideoLimit: number) => void;
  removeCreatorAllowance: (channelId: string) => void;
  recordWatch: (input: RecordWatchInput) => void;
  addOverride: (minutes: number) => void;
  setAllowFinishCurrentVideo: (allow: boolean) => void;
  setAllowOverride: (allow: boolean) => void;
  setLockUntilAssignmentsComplete: (v: boolean) => void;
  setAssignmentLockThreshold: (n: number) => void;
  setBulkBonusMinutes: (m: number) => void;
  setBulkBonusThreshold: (n: number) => void;
  activeFocusSession: ActiveFocusSession | null;
  startFocusSession: (opts: {
    durationMinutes: number;
    anchorTitle?: string;
    anchorEventId?: string;
    anchorDueAt?: string | null;
    classroomCourseId?: string;
    classroomCourseWorkId?: string;
  }) => void;
  endFocusSession: () => void;
  startRemoteFocus: (opts: { childUserId: string; durationMinutes: number; anchorTitle?: string }) => Promise<{ error?: string; sessionId?: string }>;
  endRemoteFocus: (sessionId: string) => Promise<{ error?: string }>;
  completedAssignmentsToday: number;
  effectiveDailyLimitMinutes: number;
  scheduleBlocks: ScheduleBlock[];
  resetToday: () => void;
  reloadProfile: () => void;
};

const FocusContext = createContext<FocusContextValue | null>(null);

export function FocusProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FocusState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [cloudHydrated, setCloudHydrated] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selfFocusSession, setSelfFocusSession] = useState<ActiveFocusSession | null>(null);
  const [remoteFocusSession, setRemoteFocusSession] = useState<RemoteFocusSession | null>(null);
  const [scheduleBlocks, setScheduleBlocks] = useState<ScheduleBlock[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const { session, googleAccessToken } = useAuth();

  // Hashes of last cloud-known settings/today blobs, to prevent realtime echo
  // loops (a write triggers a realtime event that would otherwise re-write).
  const lastSettingsHashRef = useRef('');
  const lastTodayHashRef = useRef('');
  const prevUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        if (raw) {
          try {
            const loaded = JSON.parse(raw) as Partial<FocusState>;
            const merged: FocusState = { ...DEFAULT_STATE, ...loaded };
            // env var beats a previously-saved empty key, but a user-set key always wins
            if (!merged.apiKey?.trim() && ENV_API_KEY) {
              merged.apiKey = ENV_API_KEY;
            }
            // Roll over today's stats if the day changed, or if the channelTime shape
            // is from an older version (used to be Record<string, number>).
            if (!merged.today || merged.today.date !== todayKey()) {
              merged.today = freshTodayStats();
            } else {
              const sample = Object.values(merged.today.channelTime ?? {})[0];
              if (sample !== undefined && typeof sample !== 'object') {
                merged.today = freshTodayStats();
              }
            }
            // Drop expired override
            if (merged.override && merged.override.expiresAt < Date.now()) {
              merged.override = null;
            }
            // Drop pre-search-era creator allowances that lack a channelId — they
            // can't be matched against video.channelId anyway.
            if (Array.isArray(merged.creatorAllowances)) {
              merged.creatorAllowances = merged.creatorAllowances.filter(
                (c) => typeof (c as { channelId?: unknown }).channelId === 'string' && (c as { channelId: string }).channelId
              );
            }
            // Educational channels used to be a string[] of bare channel IDs.
            // Drop those entries (they have no name/thumbnail) — user re-adds via search.
            if (Array.isArray(merged.educationalChannels)) {
              merged.educationalChannels = merged.educationalChannels.filter(
                (c): c is EducationalChannel =>
                  typeof c === 'object' && c !== null && typeof (c as EducationalChannel).channelId === 'string'
              );
            }
            setState(merged);
          } catch {
            // ignore parse error, fall back to defaults
          }
        }
        setHydrated(true);
      })
      .catch(() => setHydrated(true));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, hydrated]);

  // Reset today's stats when the clock crosses midnight while the app is open.
  // Hydration handles cold starts; this handles long-lived sessions.
  useEffect(() => {
    if (!hydrated) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const now = new Date();
      const next = new Date(now);
      next.setHours(24, 0, 5, 0); // a few seconds past midnight to avoid racing the date
      timer = setTimeout(() => {
        setState((s) => (s.today.date === todayKey() ? s : { ...s, today: freshTodayStats() }));
        schedule();
      }, next.getTime() - now.getTime());
    };
    schedule();
    return () => clearTimeout(timer);
  }, [hydrated]);

  // ─── Supabase: load on auth, reset on sign-out ────────────────────────────
  useEffect(() => {
    const userId = session?.user.id ?? null;
    const prevUserId = prevUserIdRef.current;
    prevUserIdRef.current = userId;

    // Just signed out — wipe local state so nothing leaks between accounts
    if (prevUserId && !userId) {
      setCloudHydrated(false);
      setProfile(null);
      lastSettingsHashRef.current = '';
      lastTodayHashRef.current = '';
      setState(DEFAULT_STATE);
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
      return;
    }

    if (!userId) return;

    let cancelled = false;
    setCloudHydrated(false);
    (async () => {
      // Step 1: load own profile (role + parent_id determine where settings come from)
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('user_id, role, family_code, parent_id')
        .eq('user_id', userId)
        .maybeSingle();
      if (cancelled) return;

      const myProfile: Profile | null = profileRow
        ? {
            userId: profileRow.user_id,
            role: profileRow.role as 'parent' | 'student',
            familyCode: profileRow.family_code ?? null,
            parentId: profileRow.parent_id ?? null,
          }
        : null;
      setProfile(myProfile);

      // Settings come from the parent's row for students, own row for parents
      const settingsOwnerId =
        myProfile?.role === 'student' ? myProfile.parentId : userId;

      // Step 2: load settings (from owner), today's stats (always self), and assignments
      // (RLS filters automatically — students see own, parents see children's)
      const today = todayKey();
      const [settingsRes, statsRes, assignmentsRes] = await Promise.all([
        settingsOwnerId
          ? supabase.from('user_settings').select('data').eq('user_id', settingsOwnerId).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from('daily_stats').select('data').eq('user_id', userId).eq('date', today).maybeSingle(),
        supabase.from('assignments').select('*').order('created_at', { ascending: false }),
      ]);
      if (cancelled) return;

      setAssignments(mapAssignments(assignmentsRes.data ?? []));

      setState((prev) => {
        const next: FocusState = { ...DEFAULT_STATE, ...prev };
        if (settingsRes.data?.data) {
          Object.assign(next, settingsRes.data.data as Partial<FocusState>);
        }
        if (statsRes.data?.data) {
          next.today = { ...freshTodayStats(), ...(statsRes.data.data as Partial<TodayStats>) };
        } else {
          next.today = freshTodayStats();
        }
        if (!next.apiKey?.trim() && ENV_API_KEY) {
          next.apiKey = ENV_API_KEY;
        }
        const { today: t, ...settingsOnly } = next;
        lastSettingsHashRef.current = JSON.stringify(settingsOnly);
        lastTodayHashRef.current = JSON.stringify(next.today);
        return next;
      });
      setCloudHydrated(true);
    })();
    return () => { cancelled = true; };
  }, [session?.user.id, reloadKey]);

  // ─── Supabase: debounced write of settings on change ──────────────────────
  // Only parents persist settings; students are read-only consumers of their parent's row.
  useEffect(() => {
    if (!cloudHydrated || !session || !profile) return;
    if (profile.role !== 'parent') return;
    const { today, ...settings } = state;
    const settingsHash = JSON.stringify(settings);
    if (settingsHash === lastSettingsHashRef.current) return;

    const handle = setTimeout(() => {
      lastSettingsHashRef.current = settingsHash;
      supabase
        .from('user_settings')
        .upsert({ user_id: session.user.id, data: settings }, { onConflict: 'user_id' })
        .then(({ error }) => {
          if (error) console.warn('[FocusFlow] settings upsert failed:', error.message);
        });
    }, 1000);
    return () => clearTimeout(handle);
  }, [state, cloudHydrated, session, profile]);

  // ─── Supabase: debounced write of today's stats on change ─────────────────
  useEffect(() => {
    if (!cloudHydrated || !session) return;
    const todayHash = JSON.stringify(state.today);
    if (todayHash === lastTodayHashRef.current) return;

    const handle = setTimeout(() => {
      lastTodayHashRef.current = todayHash;
      supabase
        .from('daily_stats')
        .upsert(
          { user_id: session.user.id, date: state.today.date, data: state.today },
          { onConflict: 'user_id,date' }
        )
        .then(({ error }) => {
          if (error) console.warn('[FocusFlow] daily_stats upsert failed:', error.message);
        });
    }, 2000);
    return () => clearTimeout(handle);
  }, [state.today, cloudHydrated, session]);

  // ─── Supabase realtime: assignments (claims, approvals, rejections) ──────
  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel('assignments-watch')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'assignments' },
        async () => {
          const { data } = await supabase
            .from('assignments')
            .select('*')
            .order('created_at', { ascending: false });
          setAssignments(mapAssignments(data ?? []));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user.id]);

  // ─── Supabase realtime: settings sync across devices ──────────────────────
  // Subscribes to whoever owns the rules: own row for parents, parent's row for students.
  useEffect(() => {
    if (!session || !profile) return;
    const ownerId = profile.role === 'student' ? profile.parentId : session.user.id;
    if (!ownerId) return;

    const channel = supabase
      .channel(`user_settings:${ownerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_settings', filter: `user_id=eq.${ownerId}` },
        (payload) => {
          const newData = (payload.new as { data?: Partial<FocusState> } | null)?.data;
          if (!newData) return;
          const newHash = JSON.stringify(newData);
          if (newHash === lastSettingsHashRef.current) return;
          lastSettingsHashRef.current = newHash;
          setState((s) => ({ ...s, ...newData, today: s.today }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user.id, profile?.role, profile?.parentId]);

  const setFocusMode = useCallback((enabled: boolean) => {
    setState((s) => ({ ...s, focusModeEnabled: enabled }));
  }, []);

  const toggleApp = useCallback((id: AppId) => {
    setState((s) => ({
      ...s,
      limitedApps: s.limitedApps.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)),
    }));
  }, []);

  const updateApp = useCallback((id: AppId, patch: Partial<Omit<LimitedApp, 'id'>>) => {
    setState((s) => ({
      ...s,
      limitedApps: s.limitedApps.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
  }, []);

  const setApiKey = useCallback((key: string) => {
    setState((s) => ({ ...s, apiKey: key }));
  }, []);

  const setDailyLimitMinutes = useCallback((minutes: number) => {
    setState((s) => ({ ...s, dailyLimitMinutes: minutes }));
  }, []);

  const addEducationalChannel = useCallback(
    (channel: { channelId: string; name: string; thumbnailUrl?: string }) => {
      if (!channel.channelId) return;
      setState((s) => {
        if (s.educationalChannels.some((c) => c.channelId === channel.channelId)) return s;
        return { ...s, educationalChannels: [...s.educationalChannels, channel] };
      });
    },
    []
  );

  const removeEducationalChannel = useCallback((channelId: string) => {
    setState((s) => ({
      ...s,
      educationalChannels: s.educationalChannels.filter((c) => c.channelId !== channelId),
    }));
  }, []);

  const setChannelLimit = useCallback((channelId: string, limit: ChannelLimit) => {
    setState((s) => ({
      ...s,
      channelLimits: { ...s.channelLimits, [channelId]: limit },
    }));
  }, []);

  const removeChannelLimit = useCallback((channelId: string) => {
    setState((s) => {
      const next = { ...s.channelLimits };
      delete next[channelId];
      return { ...s, channelLimits: next };
    });
  }, []);

  const addCreatorAllowance = useCallback(
    (channel: { channelId: string; name: string; thumbnailUrl?: string }, dailyVideoLimit: number) => {
      if (!channel.channelId || !Number.isFinite(dailyVideoLimit) || dailyVideoLimit < 1) return;
      setState((s) => {
        const existing = s.creatorAllowances.findIndex((c) => c.channelId === channel.channelId);
        const entry: CreatorAllowance = { ...channel, dailyVideoLimit };
        if (existing >= 0) {
          const next = [...s.creatorAllowances];
          next[existing] = entry;
          return { ...s, creatorAllowances: next };
        }
        return { ...s, creatorAllowances: [...s.creatorAllowances, entry] };
      });
    },
    []
  );

  const removeCreatorAllowance = useCallback((channelId: string) => {
    setState((s) => ({
      ...s,
      creatorAllowances: s.creatorAllowances.filter((c) => c.channelId !== channelId),
    }));
  }, []);

  const recordWatch = useCallback((input: RecordWatchInput) => {
    setState((s) => {
      const today = s.today.date === todayKey() ? { ...s.today } : freshTodayStats();
      today.channelTime = { ...today.channelTime };
      today.categoryTime = { ...today.categoryTime };
      today.watchedVideoIds = [...today.watchedVideoIds];
      if (input.isEducational) {
        today.educationalSeconds += input.seconds;
      } else {
        today.entertainmentSeconds += input.seconds;
      }
      // Track channel time for all watches so the Activity tab summarizes everything,
      // not just entertainment.
      if (input.channelId) {
        const existing = today.channelTime[input.channelId];
        today.channelTime[input.channelId] = {
          name: input.channelTitle ?? existing?.name ?? input.channelId,
          seconds: (existing?.seconds ?? 0) + input.seconds,
        };
      }
      if (input.categoryId) {
        today.categoryTime[input.categoryId] = (today.categoryTime[input.categoryId] ?? 0) + input.seconds;
      }
      if (input.videoId && !today.watchedVideoIds.includes(input.videoId)) {
        today.watchedVideoIds.push(input.videoId);
        today.videoCount += 1;
        // Count entertainment videos per channelId for the creator-allowance rule
        if (!input.isEducational && input.channelId) {
          today.creatorVideoCount = { ...(today.creatorVideoCount ?? {}) };
          today.creatorVideoCount[input.channelId] =
            (today.creatorVideoCount[input.channelId] ?? 0) + 1;
        }
      }
      return { ...s, today };
    });
  }, []);

  const addOverride = useCallback((minutes: number) => {
    setState((s) => {
      if (!s.allowOverride) return s;
      const current = s.override?.minutesAdded ?? 0;
      return { ...s, override: { minutesAdded: current + minutes, expiresAt: endOfToday() } };
    });
  }, []);

  const setAllowFinishCurrentVideo = useCallback((allow: boolean) => {
    setState((s) => ({ ...s, allowFinishCurrentVideo: allow }));
  }, []);

  const setAllowOverride = useCallback((allow: boolean) => {
    setState((s) => ({ ...s, allowOverride: allow }));
  }, []);

  const resetToday = useCallback(() => {
    setState((s) => ({ ...s, today: freshTodayStats() }));
  }, []);

  // Re-runs the full profile + settings load. Use after a profile change
  // (e.g. linking to a parent via family code).
  const reloadProfile = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  // Today's approved assignments, used to compute earned minutes and the
  // assignment-lock gate. Students see their own; parents see their children's.
  const completedAssignmentsToday = useMemo(() => {
    if (!session) return 0;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return assignments.filter(
      (a) =>
        a.studentUserId === session.user.id &&
        a.status === 'completed' &&
        a.completedAt &&
        new Date(a.completedAt) >= start
    ).length;
  }, [assignments, session?.user.id]);

  // Sum minutes earned by completing assignments today, plus the one-time
  // bulk bonus when the threshold is hit.
  const earnedMinutesToday = useMemo(() => {
    if (!session) return 0;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const todayApproved = assignments.filter(
      (a) =>
        a.studentUserId === session.user.id &&
        a.status === 'completed' &&
        a.completedAt &&
        new Date(a.completedAt) >= start
    );
    const perAssignment = todayApproved.reduce((sum, a) => sum + a.minutesEarned, 0);
    const bulk =
      state.bulkBonusMinutes > 0 && todayApproved.length >= state.bulkBonusThreshold
        ? state.bulkBonusMinutes
        : 0;
    return perAssignment + bulk;
  }, [assignments, session?.user.id, state.bulkBonusMinutes, state.bulkBonusThreshold]);

  const effectiveDailyLimitMinutes = useMemo(() => {
    const overrideMinutes =
      state.allowOverride && state.override && state.override.expiresAt > Date.now()
        ? state.override.minutesAdded
        : 0;
    return state.dailyLimitMinutes + overrideMinutes + earnedMinutesToday;
  }, [state.dailyLimitMinutes, state.override, state.allowOverride, earnedMinutesToday]);

  const setMinutesPerAssignment = useCallback((minutes: number) => {
    setState((s) => ({ ...s, minutesPerAssignment: Math.max(1, minutes) }));
  }, []);

  const setLockUntilAssignmentsComplete = useCallback((v: boolean) => {
    setState((s) => ({ ...s, lockUntilAssignmentsComplete: v }));
  }, []);

  const setAssignmentLockThreshold = useCallback((n: number) => {
    setState((s) => ({ ...s, assignmentLockThreshold: Math.max(1, Math.round(n)) }));
  }, []);

  const setBulkBonusMinutes = useCallback((m: number) => {
    setState((s) => ({ ...s, bulkBonusMinutes: Math.max(0, Math.round(m)) }));
  }, []);

  const setBulkBonusThreshold = useCallback((n: number) => {
    setState((s) => ({ ...s, bulkBonusThreshold: Math.max(1, Math.round(n)) }));
  }, []);

  const startFocusSession = useCallback(
    (opts: {
      durationMinutes: number;
      anchorTitle?: string;
      anchorEventId?: string;
      anchorDueAt?: string | null;
      classroomCourseId?: string;
      classroomCourseWorkId?: string;
    }) => {
      const duration = Math.max(1, Math.round(opts.durationMinutes));
      const startedAt = Date.now();
      setSelfFocusSession({
        startedAt,
        endsAt: startedAt + duration * 60_000,
        durationMinutes: duration,
        anchorTitle: opts.anchorTitle ?? null,
        anchorEventId: opts.anchorEventId ?? null,
        anchorDueAt: opts.anchorDueAt ?? null,
        classroomCourseId: opts.classroomCourseId ?? null,
        classroomCourseWorkId: opts.classroomCourseWorkId ?? null,
      });
    },
    []
  );

  const endFocusSession = useCallback(() => {
    setSelfFocusSession(null);
  }, []);

  const startRemoteFocus = useCallback(
    async (opts: { childUserId: string; durationMinutes: number; anchorTitle?: string }) => {
      const { data, error } = await supabase.rpc('start_remote_focus', {
        p_child_user_id: opts.childUserId,
        p_duration_minutes: Math.max(1, Math.round(opts.durationMinutes)),
        p_anchor_title: opts.anchorTitle ?? null,
      });
      if (error) return { error: error.message };
      return { sessionId: data as string };
    },
    []
  );

  const endRemoteFocus = useCallback(async (sessionId: string) => {
    const { error } = await supabase.rpc('end_remote_focus', { p_session_id: sessionId });
    if (error) return { error: error.message };
    return {};
  }, []);

  // Auto-clear self-session when its timer expires
  useEffect(() => {
    if (!selfFocusSession) return;
    const remaining = selfFocusSession.endsAt - Date.now();
    if (remaining <= 0) {
      setSelfFocusSession(null);
      return;
    }
    const id = setTimeout(() => setSelfFocusSession(null), remaining);
    return () => clearTimeout(id);
  }, [selfFocusSession?.endsAt]);

  // Phase B: poll Classroom submission state during a Classroom-anchored
  // self-session. On TURNED_IN/RETURNED, mint the 1.5× bonus directly via
  // auto_complete_classroom_assignment (no parent approval — API is the
  // source of truth) and end the session. AppState 'active' triggers an
  // immediate poll so the kid sees auto-end within ~500ms of returning to
  // FocusFlow after submitting in the Classroom app.
  useEffect(() => {
    const sess = selfFocusSession;
    if (!sess?.classroomCourseId || !sess?.classroomCourseWorkId) return;
    if (!googleAccessToken) return;

    let stopped = false;
    const minutesPerAssignment = state.minutesPerAssignment;

    const poll = async () => {
      if (stopped) return;
      try {
        const subState = await getMySubmissionState(
          googleAccessToken,
          sess.classroomCourseId!,
          sess.classroomCourseWorkId!,
        );
        if (subState !== 'TURNED_IN' && subState !== 'RETURNED') return;

        const minutes = Math.round(minutesPerAssignment * FOCUS_BONUS_MULTIPLIER);
        const { error } = await supabase.rpc('auto_complete_classroom_assignment', {
          p_google_event_id: sess.anchorEventId,
          p_title: sess.anchorTitle,
          p_due_at: sess.anchorDueAt,
          p_minutes: minutes,
        });
        if (error) {
          console.warn('[FocusFlow] auto-complete failed:', error.message);
          return; // retry on next poll
        }
        stopped = true;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setSelfFocusSession(null);
      } catch (e) {
        if (e instanceof Error && /expired/i.test(e.message)) {
          // Token expired mid-session — keep the session running on its timer,
          // just stop polling. Kid can re-auth after the session ends.
          stopped = true;
          console.warn('[FocusFlow] Google token expired during focus session');
        }
      }
    };

    poll(); // initial poll on mount / on session start

    const intervalId = setInterval(poll, 30_000);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') poll();
    });

    return () => {
      stopped = true;
      clearInterval(intervalId);
      sub.remove();
    };
  }, [
    selfFocusSession?.classroomCourseId,
    selfFocusSession?.classroomCourseWorkId,
    selfFocusSession?.anchorEventId,
    selfFocusSession?.anchorTitle,
    selfFocusSession?.anchorDueAt,
    googleAccessToken,
    state.minutesPerAssignment,
  ]);

  // Auto-clear remote session when its timer expires (the row stays in DB as
  // history; we just stop displaying it as active locally)
  useEffect(() => {
    if (!remoteFocusSession) return;
    const remaining = remoteFocusSession.endsAt - Date.now();
    if (remaining <= 0) {
      setRemoteFocusSession(null);
      return;
    }
    const id = setTimeout(() => setRemoteFocusSession(null), remaining);
    return () => clearTimeout(id);
  }, [remoteFocusSession?.endsAt]);

  // Subscribe to remote focus sessions targeting this user (students only).
  // Parent-imposed sessions arrive here and trigger the same lockdown UI.
  useEffect(() => {
    if (!session) return;
    const userId = session.user.id;

    const refetch = async () => {
      const { data } = await supabase
        .from('remote_focus_sessions')
        .select('*')
        .eq('child_user_id', userId)
        .gt('ends_at', new Date().toISOString())
        .order('ends_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        const s = data as {
          id: string; parent_user_id: string; child_user_id: string;
          started_at: string; ends_at: string; duration_minutes: number; anchor_title: string | null;
        };
        setRemoteFocusSession({
          remoteSessionId: s.id,
          parentUserId: s.parent_user_id,
          childUserId: s.child_user_id,
          startedAt: new Date(s.started_at).getTime(),
          endsAt: new Date(s.ends_at).getTime(),
          durationMinutes: s.duration_minutes,
          anchorTitle: s.anchor_title,
          anchorEventId: null,
          anchorDueAt: null,
          classroomCourseId: null,
          classroomCourseWorkId: null,
        });
      } else {
        setRemoteFocusSession(null);
      }
    };
    refetch();

    const channel = supabase
      .channel(`remote-focus:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'remote_focus_sessions', filter: `child_user_id=eq.${userId}` },
        () => { refetch(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user.id]);

  // Schedule blocks (kid's own). Empty for parents (their child_user_id is
  // never set). Subscribed via realtime so parent edits propagate within
  // seconds to the child's access decisions.
  useEffect(() => {
    if (!session) {
      setScheduleBlocks([]);
      return;
    }
    const userId = session.user.id;
    const refetchSchedule = async () => {
      const rows = await fetchChildSchedule(userId);
      setScheduleBlocks(rows);
    };
    refetchSchedule();

    const channel = supabase
      .channel(`schedule-self:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'child_schedule_blocks', filter: `child_user_id=eq.${userId}` },
        () => { refetchSchedule(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user.id]);

  // Whichever active session has the latest endsAt wins for lockdown purposes.
  // Remote takes precedence on equality so the child can't bypass via self-end.
  const activeFocusSession = useMemo<ActiveFocusSession | null>(() => {
    const now = Date.now();
    const remoteActive = remoteFocusSession && remoteFocusSession.endsAt > now ? remoteFocusSession : null;
    const selfActive = selfFocusSession && selfFocusSession.endsAt > now ? selfFocusSession : null;
    if (remoteActive && selfActive) {
      return remoteActive.endsAt >= selfActive.endsAt ? remoteActive : selfActive;
    }
    return remoteActive ?? selfActive;
  }, [remoteFocusSession, selfFocusSession]);

  const value: FocusContextValue = {
    state,
    hydrated,
    profile,
    setFocusMode,
    toggleApp,
    updateApp,
    setApiKey,
    setDailyLimitMinutes,
    addEducationalChannel,
    removeEducationalChannel,
    setChannelLimit,
    removeChannelLimit,
    addCreatorAllowance,
    removeCreatorAllowance,
    recordWatch,
    addOverride,
    setAllowFinishCurrentVideo,
    setAllowOverride,
    setMinutesPerAssignment,
    setLockUntilAssignmentsComplete,
    setAssignmentLockThreshold,
    setBulkBonusMinutes,
    setBulkBonusThreshold,
    activeFocusSession,
    startFocusSession,
    endFocusSession,
    startRemoteFocus,
    endRemoteFocus,
    completedAssignmentsToday,
    assignments,
    earnedMinutesToday,
    effectiveDailyLimitMinutes,
    scheduleBlocks,
    resetToday,
    reloadProfile,
  };

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}

type AssignmentRow = {
  id: string;
  student_user_id: string;
  google_event_id: string;
  title: string;
  due_at: string | null;
  status: AssignmentStatus;
  completed_at: string | null;
  minutes_earned: number;
  created_at: string;
};

function mapAssignments(rows: AssignmentRow[]): Assignment[] {
  return rows.map((r) => ({
    id: r.id,
    studentUserId: r.student_user_id,
    googleEventId: r.google_event_id,
    title: r.title,
    dueAt: r.due_at,
    status: r.status,
    completedAt: r.completed_at,
    minutesEarned: r.minutes_earned,
    createdAt: r.created_at,
  }));
}

export function useFocus(): FocusContextValue {
  const v = useContext(FocusContext);
  if (!v) throw new Error('useFocus must be used inside <FocusProvider>');
  return v;
}
