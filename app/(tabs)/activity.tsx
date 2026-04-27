import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFocus } from '@/lib/focus-context';
import { colors, radius, shadowSm, space } from '@/lib/theme';
import { categoryName, EDUCATIONAL_CATEGORIES } from '@/lib/youtube-filter';

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const { state, effectiveDailyLimitMinutes } = useFocus();
  const { today } = state;

  const channelEntries = useMemo(
    () =>
      Object.entries(today.channelTime)
        .map(([id, w]) => ({ id, name: w.name, seconds: w.seconds }))
        .sort((a, b) => b.seconds - a.seconds),
    [today.channelTime]
  );

  const categoryEntries = useMemo(
    () =>
      Object.entries(today.categoryTime)
        .map(([id, seconds]) => ({ id, seconds }))
        .sort((a, b) => b.seconds - a.seconds),
    [today.categoryTime]
  );

  const eduMins = Math.floor(today.educationalSeconds / 60);
  const entMins = Math.floor(today.entertainmentSeconds / 60);
  const dateLabel = formatDate(today.date);

  const channelMax = channelEntries[0]?.seconds ?? 1;
  const categoryMax = categoryEntries[0]?.seconds ?? 1;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.lg, paddingBottom: 48 }]}>
      <Text style={styles.pageTitle}>Activity</Text>
      <Text style={styles.pageSub}>Today, {dateLabel}</Text>

      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryBlock}>
            <Text style={styles.summaryValue}>{today.videoCount}</Text>
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
              {entMins}<Text style={styles.summaryValueSuffix}>/{effectiveDailyLimitMinutes}m</Text>
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

      <Text style={styles.footnote}>
        Stats reset at midnight. Watches are recorded as you play videos in the app — for now, use the Test Filter on Home and tap "Mark as watched" to populate.
      </Text>
    </ScrollView>
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

function formatDate(iso: string): string {
  // iso is YYYY-MM-DD
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10));
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 24 },

  pageTitle: { fontSize: 32, fontWeight: '800', color: colors.textPrimary, letterSpacing: -1, marginBottom: 4 },
  pageSub: { fontSize: 13, color: colors.textSecondary, marginBottom: 24 },

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
  summaryValue: { color: colors.textPrimary, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  summaryValueAccent: { color: colors.accent },
  summaryValueSuffix: { color: colors.textMuted, fontSize: 13, fontWeight: '500' },
  summaryLabel: { color: colors.textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '600' },

  sectionLabel: {
    fontSize: 10,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontWeight: '700',
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
  rowLabel: { color: colors.textPrimary, fontSize: 14, fontWeight: '600', letterSpacing: -0.2, flex: 1, marginRight: 12 },
  rowValue: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
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
});
