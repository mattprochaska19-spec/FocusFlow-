import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useAuth } from './auth-context';
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
  effectiveDailyLimitMinutes: number;
  resetToday: () => void;
};

const FocusContext = createContext<FocusContextValue | null>(null);

export function FocusProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FocusState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [cloudHydrated, setCloudHydrated] = useState(false);
  const { session } = useAuth();

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
      const today = todayKey();
      const [settingsRes, statsRes] = await Promise.all([
        supabase.from('user_settings').select('data').eq('user_id', userId).maybeSingle(),
        supabase.from('daily_stats').select('data').eq('user_id', userId).eq('date', today).maybeSingle(),
      ]);
      if (cancelled) return;

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
  }, [session?.user.id]);

  // ─── Supabase: debounced write of settings on change ──────────────────────
  useEffect(() => {
    if (!cloudHydrated || !session) return;
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
  }, [state, cloudHydrated, session]);

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

  // ─── Supabase realtime: settings sync across devices ──────────────────────
  useEffect(() => {
    if (!session) return;
    const userId = session.user.id;

    const channel = supabase
      .channel(`user_settings:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_settings', filter: `user_id=eq.${userId}` },
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
  }, [session?.user.id]);

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

  const effectiveDailyLimitMinutes = useMemo(() => {
    if (!state.allowOverride) return state.dailyLimitMinutes;
    const overrideMinutes = state.override && state.override.expiresAt > Date.now() ? state.override.minutesAdded : 0;
    return state.dailyLimitMinutes + overrideMinutes;
  }, [state.dailyLimitMinutes, state.override, state.allowOverride]);

  const value: FocusContextValue = {
    state,
    hydrated,
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
    effectiveDailyLimitMinutes,
    resetToday,
  };

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}

export function useFocus(): FocusContextValue {
  const v = useContext(FocusContext);
  if (!v) throw new Error('useFocus must be used inside <FocusProvider>');
  return v;
}
