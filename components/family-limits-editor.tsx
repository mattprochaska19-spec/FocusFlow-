import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { useFocus } from '@/lib/focus-context';
import { colors, fonts, radius } from '@/lib/theme';

const LIMIT_MIN = 1;
const LIMIT_MAX = 240;
const THRESHOLD_MIN = 1;
const THRESHOLD_MAX = 10;

export type LinkedChild = { user_id: string; displayName: string };

// Family-level limits editor. The parent composes a value (daily limit, lock
// toggle, threshold), picks which kids it applies to via kid icons, then taps
// Apply. Each tap writes the same override to every selected kid in parallel.
//
// Pre-fills with family defaults (the parent's global state). To customize a
// single kid, deselect everyone else; to roll out the same rules to all,
// leave everyone selected (which is the default).
export function FamilyLimitsEditor({ linkedChildren }: { linkedChildren: LinkedChild[] }) {
  const { state, childOverrides, setChildOverride } = useFocus();

  // Live values being composed. Pre-filled with family defaults so the slider
  // starts in a sensible spot.
  const [dailyLimit, setDailyLimit] = useState(state.dailyLimitMinutes);
  const [lockEnabled, setLockEnabled] = useState(state.lockUntilAssignmentsComplete);
  const [lockThreshold, setLockThreshold] = useState(state.assignmentLockThreshold);

  // Multi-select kid targets. Default = all linked kids (the common case is
  // "same rules for every kid"). Tap to toggle a kid.
  const [selectedKids, setSelectedKids] = useState<string[]>(
    linkedChildren.map((c) => c.user_id),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedAt, setAppliedAt] = useState<number | null>(null);

  const toggleKid = (id: string) => {
    setSelectedKids((curr) => (curr.includes(id) ? curr.filter((c) => c !== id) : [...curr, id]));
  };

  const apply = async () => {
    if (selectedKids.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    setAppliedAt(null);
    const results = await Promise.all(
      selectedKids.map((id) =>
        setChildOverride({
          childUserId: id,
          dailyLimitMinutes: dailyLimit,
          lockUntilAssignmentsComplete: lockEnabled,
          assignmentLockThreshold: lockThreshold,
        }),
      ),
    );
    setSubmitting(false);
    const firstErr = results.find((r) => r.error);
    if (firstErr?.error) {
      setError(firstErr.error);
      return;
    }
    setAppliedAt(Date.now());
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  // Tiny helper: per-kid one-line summary so the parent can see who already
  // has a custom limit before they overwrite it.
  const summaryForKid = (id: string): string => {
    const o = childOverrides.find((c) => c.childUserId === id);
    if (!o || o.dailyLimitMinutes === null) return 'Default';
    return `${o.dailyLimitMinutes}m`;
  };

  return (
    <View>
      <Text style={styles.label}>Daily entertainment limit</Text>
      <View style={styles.sliderValueRow}>
        <Text style={styles.sliderValue}>{dailyLimit}</Text>
        <Text style={styles.sliderValueUnit}>min / day</Text>
      </View>
      <Slider
        value={dailyLimit}
        minimumValue={LIMIT_MIN}
        maximumValue={LIMIT_MAX}
        step={1}
        minimumTrackTintColor={colors.accent}
        maximumTrackTintColor={colors.borderSubtle}
        thumbTintColor={colors.accent}
        onValueChange={(v) => setDailyLimit(Math.round(v))}
        style={styles.slider}
      />

      <View style={styles.divider} />

      <View style={styles.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Lock entertainment until done</Text>
          <Text style={styles.hint}>
            Block YouTube entertainment until the threshold below is met. Educational content stays unlocked.
          </Text>
        </View>
        <Switch
          value={lockEnabled}
          onValueChange={setLockEnabled}
          trackColor={{ false: '#D9D3C7', true: colors.accent }}
          thumbColor={colors.surface}
          ios_backgroundColor="#D9D3C7"
        />
      </View>

      {lockEnabled && (
        <>
          <Text style={styles.label}>Approved assignments required</Text>
          <View style={styles.sliderValueRow}>
            <Text style={styles.sliderValue}>{lockThreshold}</Text>
            <Text style={styles.sliderValueUnit}>{lockThreshold === 1 ? 'assignment' : 'assignments'}</Text>
          </View>
          <Slider
            value={lockThreshold}
            minimumValue={THRESHOLD_MIN}
            maximumValue={THRESHOLD_MAX}
            step={1}
            minimumTrackTintColor={colors.accent}
            maximumTrackTintColor={colors.borderSubtle}
            thumbTintColor={colors.accent}
            onValueChange={(v) => setLockThreshold(Math.round(v))}
            style={styles.slider}
          />
        </>
      )}

      <View style={styles.divider} />

      <Text style={styles.label}>Apply to</Text>
      <View style={styles.kidRow}>
        {linkedChildren.map((c) => {
          const on = selectedKids.includes(c.user_id);
          const initial = (c.displayName || '?').charAt(0).toUpperCase();
          return (
            <Pressable
              key={c.user_id}
              onPress={() => toggleKid(c.user_id)}
              style={({ pressed }) => [styles.kidWrap, pressed && { transform: [{ scale: 0.96 }] }]}>
              <View style={[styles.kidRing, on && styles.kidRingOn]}>
                <View style={[styles.kidBubble, on && styles.kidBubbleOn]}>
                  <Text style={[styles.kidInitial, on && styles.kidInitialOn]}>{initial}</Text>
                </View>
                {on && (
                  <View style={styles.checkBadge}>
                    <Ionicons name="checkmark" size={10} color={colors.textInverse} />
                  </View>
                )}
              </View>
              <Text style={[styles.kidName, on && styles.kidNameOn]} numberOfLines={1}>
                {c.displayName}
              </Text>
              <Text style={styles.kidSummary}>{summaryForKid(c.user_id)}</Text>
            </Pressable>
          );
        })}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        onPress={apply}
        disabled={submitting || selectedKids.length === 0}
        style={({ pressed }) => [
          styles.applyBtn,
          (submitting || selectedKids.length === 0) && styles.applyBtnDisabled,
          pressed && { opacity: 0.85 },
        ]}>
        {submitting ? (
          <ActivityIndicator color={colors.textInverse} />
        ) : (
          <Text style={styles.applyBtnText}>
            {appliedAt
              ? 'Applied · update again?'
              : selectedKids.length === linkedChildren.length
                ? 'Apply to all kids'
                : selectedKids.length === 0
                  ? 'Pick at least one kid'
                  : `Apply to ${selectedKids.length} ${selectedKids.length === 1 ? 'kid' : 'kids'}`}
          </Text>
        )}
      </Pressable>

      <Text style={styles.footnote}>
        Each kid's "Default" label means they'll inherit your global setting (same as not selecting them
        here). A minutes value means they have a custom override.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    color: colors.textMuted,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: fonts.bold,
    marginTop: 6,
    marginBottom: 6,
  },
  hint: { color: colors.textMuted, fontSize: 11, lineHeight: 15, marginTop: 2 },

  sliderValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  sliderValue: { color: colors.accent, fontSize: 32, fontFamily: fonts.bold, letterSpacing: -1 },
  sliderValueUnit: { color: colors.textSecondary, fontSize: 12, fontFamily: fonts.semibold },
  slider: { width: '100%', height: 32 },

  divider: { height: 1, backgroundColor: colors.divider, marginVertical: 14 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },

  kidRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  kidWrap: { alignItems: 'center', width: 64, gap: 4 },
  kidRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    padding: 3,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  kidRingOn: { borderColor: colors.accent },
  kidBubble: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kidBubbleOn: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  kidInitial: { color: colors.textMuted, fontSize: 20, fontFamily: fonts.serifBold },
  kidInitialOn: { color: colors.accent },
  checkBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  kidName: {
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 64,
  },
  kidNameOn: { color: colors.textPrimary },
  kidSummary: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  applyBtn: {
    marginTop: 16,
    backgroundColor: colors.accent,
    paddingVertical: 13,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  applyBtnDisabled: { backgroundColor: colors.neutral },
  applyBtnText: { color: colors.textInverse, fontSize: 14, fontFamily: fonts.bold, letterSpacing: 0.3 },

  error: { color: colors.danger, fontSize: 12, marginTop: 10 },
  footnote: { color: colors.textMuted, fontSize: 11, marginTop: 14, lineHeight: 15 },
});
