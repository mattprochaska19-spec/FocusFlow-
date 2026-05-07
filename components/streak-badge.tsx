import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts, radius } from '@/lib/theme';

// Visual streak indicator. Two states:
//   - Active (count > 0): orange flame + "N-day streak"
//   - Idle (count === 0): muted flame + nudge copy
//
// Variant `compact` is for the parent-side per-child view (smaller); default
// is for the kid's Goals tab (more prominent).
export function StreakBadge({
  count,
  variant = 'full',
  style,
}: {
  count: number;
  variant?: 'full' | 'compact';
  style?: StyleProp<ViewStyle>;
}) {
  const active = count > 0;
  const compact = variant === 'compact';

  if (compact) {
    return (
      <View
        style={[
          styles.compact,
          active ? styles.compactActive : styles.compactIdle,
          style,
        ]}>
        <Ionicons
          name="flame"
          size={12}
          color={active ? colors.danger : colors.textMuted}
        />
        <Text style={[styles.compactText, active && styles.compactTextActive]}>
          {active ? `${count}d` : '—'}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.full,
        active ? styles.fullActive : styles.fullIdle,
        style,
      ]}>
      <View style={styles.flameWrap}>
        <Ionicons
          name="flame"
          size={28}
          color={active ? colors.danger : colors.textMuted}
        />
      </View>
      <View style={{ flex: 1 }}>
        {active ? (
          <>
            <Text style={styles.fullValue}>
              {count}-day <Text style={styles.fullValueSoft}>streak</Text>
            </Text>
            <Text style={styles.fullSub}>
              {count === 1
                ? "You're off to a start. Don't break the chain!"
                : "Don't break the chain — claim a goal today to keep it going."}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.fullValueIdle}>Start a streak</Text>
            <Text style={styles.fullSub}>
              Claim a goal today and keep going every day to build a streak.
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Full variant — kid's Goals tab
  full: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  fullActive: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerBorder,
  },
  fullIdle: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.borderSubtle,
  },
  flameWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullValue: {
    color: colors.danger,
    fontSize: 16,
    fontFamily: fonts.serifBold,
    letterSpacing: -0.4,
  },
  fullValueIdle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontFamily: fonts.serifBold,
    letterSpacing: -0.4,
  },
  fullValueSoft: {
    color: colors.textPrimary,
    fontFamily: fonts.serifSemibold,
  },
  fullSub: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },

  // Compact variant — parent-side ChildDetail
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 0.5,
  },
  compactActive: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerBorder,
  },
  compactIdle: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.borderSubtle,
  },
  compactText: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: fonts.bold,
    letterSpacing: 0.2,
  },
  compactTextActive: { color: colors.danger },
});
