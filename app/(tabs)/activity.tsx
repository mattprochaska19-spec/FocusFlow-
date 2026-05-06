import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChildBubble } from '@/components/child-bubble';
import { useFocus, type ChildOverride } from '@/lib/focus-context';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius, shadowSm, space } from '@/lib/theme';
import { categoryName, EDUCATIONAL_CATEGORIES } from '@/lib/youtube-filter';

// Shape we render in the bars below — works for both the parent's selected
// child stats and the student's own stats. Pulled from a daily_stats row's
// `data` JSONB column (which mirrors TodayStats in focus-context).
type StatsView = {
  date: string;
  videoCount: number;
  educationalSeconds: number;
  entertainmentSeconds: number;
  channelTime: Record<string, { name: string; seconds: number }>;
  categoryTime: Record<string, number>;
};

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useFocus();
  const isParent = profile?.role === 'parent';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.lg, paddingBottom: 48 }]}>
      <Text style={styles.pageTitle}>Activity</Text>
      <Text style={styles.pageSub}>
        {isParent ? 'Per-child viewing today.' : `Today, ${formatDate(todayKey())}`}
      </Text>

      {isParent ? <ParentActivity /> : <StudentActivity />}
    </ScrollView>
  );
}

// Parent view: fetch all linked children + their display names, render the
// shared ChildBubble picker, then load the selected child's stats from the
// daily_stats row directly. Realtime-subscribed so parents see updates live.
function ParentActivity() {
  const { childOverrides, state: parentState } = useFocus();
  const [children, setChildren] = useState<{ user_id: string; displayName: string }[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stats, setStats] = useState<StatsView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const todayDate = todayKey();

  // Load linked children once on mount. Display names come from the same RPC
  // the Family tab uses (so labels match).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [statsRes, namesRes] = await Promise.all([
        supabase.rpc('get_my_children_with_stats', { stats_date: todayDate }),
        supabase.rpc('get_child_display_names'),
      ]);
      if (cancelled) return;
      if (statsRes.error) {
        setError(statsRes.error.message);
        setChildren([]);
        return;
      }
      const namesMap = new Map<string, string>();
      for (const n of (namesRes.data ?? []) as { user_id: string; display_name: string | null }[]) {
        if (n.display_name) namesMap.set(n.user_id, n.display_name);
      }
      const list = ((statsRes.data ?? []) as { user_id: string; email: string }[]).map((c) => ({
        user_id: c.user_id,
        displayName: namesMap.get(c.user_id) ?? c.email.split('@')[0],
      }));
      setChildren(list);
      setSelectedId((curr) => curr && list.some((c) => c.user_id === curr) ? curr : list[0]?.user_id ?? null);
    })();
    return () => { cancelled = true; };
  }, [todayDate]);

  // Fetch the selected child's full daily_stats row + subscribe to changes.
  useEffect(() => {
    if (!selectedId) {
      setStats(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const fetchStats = async () => {
      const { data, error: err } = await supabase
        .from('daily_stats')
        .select('data')
        .eq('user_id', selectedId)
        .eq('date', todayDate)
        .maybeSingle();
      if (cancelled) return;
      if (err) setError(err.message);
      const raw = (data?.data ?? null) as Partial<StatsView> | null;
      setStats(
        raw
          ? {
              date: raw.date ?? todayDate,
              videoCount: raw.videoCount ?? 0,
              educationalSeconds: raw.educationalSeconds ?? 0,
              entertainmentSeconds: raw.entertainmentSeconds ?? 0,
              channelTime: raw.channelTime ?? {},
              categoryTime: raw.categoryTime ?? {},
            }
          : null,
      );
      setLoading(false);
    };
    fetchStats();

    const channel = supabase
      .channel(`activity:${selectedId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'daily_stats',
          filter: `user_id=eq.${selectedId}`,
        },
        () => { fetchStats(); },
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [selectedId, todayDate]);

  // Effective limit for the selected child (override → parent default).
  const childOverride: ChildOverride | undefined = useMemo(
    () => childOverrides.find((o) => o.childUserId === selectedId),
    [childOverrides, selectedId],
  );
  const effectiveLimit = childOverride?.dailyLimitMinutes ?? parentState.dailyLimitMinutes;

  if (children === null) {
    return <ActivityIndicator color={colors.textMuted} style={{ marginTop: 32 }} />;
  }

  if (children.length === 0) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>No kids linked yet</Text>
        <Text style={styles.emptyBody}>
          Share your family code from Settings so your child can sign up. Their viewing activity will appear here.
        </Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.bubbleRow}>
        {children.map((c) => (
          <ChildBubble
            key={c.user_id}
            displayName={c.displayName}
            selected={c.user_id === selectedId}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setSelectedId(c.user_id);
            }}
          />
        ))}
      </ScrollView>

      {error && <Text style={styles.error}>{error}</Text>}

      {selectedId && (
        loading && !stats
          ? <ActivityIndicator color={colors.textMuted} style={{ marginTop: 24 }} />
          : <StatsBody stats={stats} dailyLimitMinutes={effectiveLimit} />
      )}
    </>
  );
}

// Student view: same charts, sourced from local state (the kid's own stats).
function StudentActivity() {
  const { state, effectiveDailyLimitMinutes } = useFocus();
  return <StatsBody stats={state.today} dailyLimitMinutes={effectiveDailyLimitMinutes} />;
}

function StatsBody({
  stats,
  dailyLimitMinutes,
}: {
  stats: StatsView | null;
  dailyLimitMinutes: number;
}) {
  const channelEntries = useMemo(
    () =>
      Object.entries(stats?.channelTime ?? {})
        .map(([id, w]) => ({ id, name: w.name, seconds: w.seconds }))
        .sort((a, b) => b.seconds - a.seconds),
    [stats?.channelTime],
  );

  const categoryEntries = useMemo(
    () =>
      Object.entries(stats?.categoryTime ?? {})
        .map(([id, seconds]) => ({ id, seconds }))
        .sort((a, b) => b.seconds - a.seconds),
    [stats?.categoryTime],
  );

  const eduMins = Math.floor((stats?.educationalSeconds ?? 0) / 60);
  const entMins = Math.floor((stats?.entertainmentSeconds ?? 0) / 60);
  const videoCount = stats?.videoCount ?? 0;

  const channelMax = channelEntries[0]?.seconds ?? 1;
  const categoryMax = categoryEntries[0]?.seconds ?? 1;

  return (
    <>
      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryBlock}>
            <Text style={styles.summaryValue}>{videoCount}</Text>
            <Text style={styles.summaryLabel}>Videos watched</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryBlock}>
            <Text style={[styles.summaryValue, styles.summaryValueAccent]}>{eduMins}m</Text>
            <Text style={styles.summaryLabel}>Educational</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryBlock}>
            <Text style={styles.summaryValue}>
              {entMins}<Text style={styles.summaryValueSuffix}>/{dailyLimitMinutes}m</Text>
            </Text>
            <Text style={styles.summaryLabel}>Entertainment</Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionLabel}>Top Channels</Text>
      <View style={styles.card}>
        {channelEntries.length === 0 ? (
          <Text style={styles.empty}>No channels watched yet today.</Text>
        ) : (
          channelEntries.map((c, i) => (
            <View key={c.id}>
              <BarRow label={c.name} seconds={c.seconds} max={channelMax} />
              {i < channelEntries.length - 1 && <View style={styles.divider} />}
            </View>
          ))
        )}
      </View>

      <Text style={styles.sectionLabel}>By Genre</Text>
      <View style={styles.card}>
        {categoryEntries.length === 0 ? (
          <Text style={styles.empty}>No genre data yet today.</Text>
        ) : (
          categoryEntries.map((c, i) => {
            const isEdu = EDUCATIONAL_CATEGORIES.has(c.id);
            return (
              <View key={c.id}>
                <BarRow label={categoryName(c.id)} seconds={c.seconds} max={categoryMax} accent={isEdu} />
                {i < categoryEntries.length - 1 && <View style={styles.divider} />}
              </View>
            );
          })
        )}
      </View>

      <Text style={styles.footnote}>Stats reset at midnight. Watches are recorded as videos play.</Text>
    </>
  );
}

function BarRow({
  label,
  seconds,
  max,
  accent = false,
}: {
  label: string;
  seconds: number;
  max: number;
  accent?: boolean;
}) {
  const minutes = Math.floor(seconds / 60);
  const display = minutes >= 1 ? `${minutes}m` : `${seconds}s`;
  const pct = Math.max(2, Math.min(100, (seconds / Math.max(1, max)) * 100));
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <View style={styles.rowHeader}>
          <Text style={styles.rowLabel} numberOfLines={1}>{label}</Text>
          <Text style={[styles.rowValue, accent && styles.rowValueAccent]}>{display}</Text>
        </View>
        <View style={styles.barTrack}>
          <View
            style={[
              styles.barFill,
              { width: `${pct}%`, backgroundColor: accent ? colors.accent : colors.textSecondary },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

function todayKey(): string {
  return new Date().toISOString().split('T')[0];
}

function formatDate(iso: string): string {
  // iso is YYYY-MM-DD
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10));
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 24 },

  pageTitle: { fontSize: 32, fontFamily: fonts.serifBold, color: colors.textPrimary, letterSpacing: -1, marginBottom: 4 },
  pageSub: { fontSize: 13, color: colors.textSecondary, marginBottom: 18 },

  bubbleRow: {
    paddingVertical: 6,
    paddingRight: 12,
    marginBottom: 18,
  },

  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: 22,
    paddingHorizontal: space.lg,
    marginBottom: space.xl,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadowSm,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryBlock: { flex: 1, alignItems: 'center', gap: 6 },
  summaryDivider: { width: 1, height: 36, backgroundColor: colors.divider },
  summaryValue: { color: colors.textPrimary, fontSize: 24, fontFamily: fonts.bold, letterSpacing: -0.5 },
  summaryValueAccent: { color: colors.accent },
  summaryValueSuffix: { color: colors.textMuted, fontSize: 13, fontFamily: fonts.medium },
  summaryLabel: { color: colors.textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, fontFamily: fonts.semibold },

  sectionLabel: {
    fontSize: 10,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontFamily: fonts.bold,
    marginBottom: 10,
    marginLeft: 4,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    marginBottom: space.xl,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadowSm,
  },

  row: { paddingVertical: 8 },
  rowHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 },
  rowLabel: { color: colors.textPrimary, fontSize: 14, fontFamily: fonts.semibold, letterSpacing: -0.2, flex: 1, marginRight: 12 },
  rowValue: { color: colors.textSecondary, fontSize: 13, fontFamily: fonts.bold },
  rowValueAccent: { color: colors.accent },
  barTrack: {
    height: 4,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: radius.pill },

  divider: { height: 1, backgroundColor: colors.divider, marginVertical: 4 },

  empty: { color: colors.textMuted, fontSize: 13, paddingVertical: 6 },
  footnote: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: -8 },

  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.xl,
    marginBottom: space.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    ...shadowSm,
  },
  emptyTitle: { color: colors.textPrimary, fontSize: 16, fontFamily: fonts.serifBold, marginBottom: 6 },
  emptyBody: { color: colors.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 18 },

  error: { color: colors.danger, fontSize: 12, marginTop: 8, marginBottom: 8 },
});
