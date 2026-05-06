import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { useFocus } from '@/lib/focus-context';
import { colors, fonts, radius, space } from '@/lib/theme';

export type SiblingLite = { user_id: string; displayName: string };

const LIMIT_MIN = 1;
const LIMIT_MAX = 240;

// Per-child override editor for the three rules that used to be global on the
// parent's account: daily entertainment limit, lock-until-assignments, and the
// completion threshold. NULL on any field = inherit the parent's default.
//
// `siblings` is the list of OTHER linked children (excluding the one being
// edited). When non-empty, an "Apply to all my kids" button appears at the
// bottom that fans out the current values to every sibling.
export function ChildLimitsEditor({
  childUserId,
  siblings = [],
}: {
  childUserId: string;
  siblings?: SiblingLite[];
}) {
  const { state, childOverrides, setChildOverride } = useFocus();
  const override = childOverrides.find((o) => o.childUserId === childUserId) ?? null;

  // Effective values (falling back to parent default) drive the live UI; the
  // inheriting/editing toggles control whether we persist NULL or the value.
  const effLimit = override?.dailyLimitMinutes ?? state.dailyLimitMinutes;
  const effLockEnabled = override?.lockUntilAssignmentsComplete ?? state.lockUntilAssignmentsComplete;
  const effLockThreshold = override?.assignmentLockThreshold ?? state.assignmentLockThreshold;

  const [limitOverride, setLimitOverride] = useState<number | null>(override?.dailyLimitMinutes ?? null);
  const [liveLimit, setLiveLimit] = useState<number>(effLimit);
  const [lockOverride, setLockOverrideState] = useState<boolean | null>(
    override?.lockUntilAssignmentsComplete ?? null,
  );
  const [thresholdOverride, setThresholdOverride] = useState<number | null>(
    override?.assignmentLockThreshold ?? null,
  );
  const [liveThreshold, setLiveThreshold] = useState<number>(effLockThreshold);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLimitOverride(override?.dailyLimitMinutes ?? null);
    setLiveLimit(override?.dailyLimitMinutes ?? state.dailyLimitMinutes);
    setLockOverrideState(override?.lockUntilAssignmentsComplete ?? null);
    setThresholdOverride(override?.assignmentLockThreshold ?? null);
    setLiveThreshold(override?.assignmentLockThreshold ?? state.assignmentLockThreshold);
  }, [
    override?.dailyLimitMinutes,
    override?.lockUntilAssignmentsComplete,
    override?.assignmentLockThreshold,
    state.dailyLimitMinutes,
    state.lockUntilAssignmentsComplete,
    state.assignmentLockThreshold,
  ]);

  const persist = async (next: {
    dailyLimitMinutes: number | null;
    lockUntilAssignmentsComplete: boolean | null;
    assignmentLockThreshold: number | null;
  }) => {
    setSubmitting(true);
    setError(null);
    const r = await setChildOverride({ childUserId, ...next });
    setSubmitting(false);
    if (r.error) setError(r.error);
  };

  const usingLimitOverride = limitOverride !== null;
  const usingLockOverride = lockOverride !== null;
  const usingThresholdOverride = thresholdOverride !== null;

  return (
    <View>
      {/* Daily limit */}
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>Daily entertainment limit</Text>
          <Text style={styles.rowDesc}>
            {usingLimitOverride
              ? `Custom · ${limitOverride}m / day`
              : `Inheriting · ${state.dailyLimitMinutes}m / day`}
          </Text>
        </View>
        <Switch
          value={usingLimitOverride}
          onValueChange={(v) => {
            const next = v ? state.dailyLimitMinutes : null;
            setLimitOverride(next);
            setLiveLimit(next ?? state.dailyLimitMinutes);
            persist({
              dailyLimitMinutes: next,
              lockUntilAssignmentsComplete: lockOverride,
              assignmentLockThreshold: thresholdOverride,
            });
          }}
          trackColor={{ false: '#D9D3C7', true: colors.accent }}
          thumbColor={colors.surface}
          ios_backgroundColor="#D9D3C7"
          disabled={submitting}
        />
      </View>
      {usingLimitOverride && (
        <>
          <View style={styles.sliderValueRow}>
            <Text style={styles.sliderValue}>{liveLimit}</Text>
            <Text style={styles.sliderValueUnit}>min / day</Text>
          </View>
          <Slider
            value={limitOverride ?? state.dailyLimitMinutes}
            minimumValue={LIMIT_MIN}
            maximumValue={LIMIT_MAX}
            step={1}
            minimumTrackTintColor={colors.accent}
            maximumTrackTintColor={colors.borderSubtle}
            thumbTintColor={colors.accent}
            onValueChange={(v) => setLiveLimit(Math.round(v))}
            onSlidingComplete={(v) => {
              const next = Math.round(v);
              setLimitOverride(next);
              persist({
                dailyLimitMinutes: next,
                lockUntilAssignmentsComplete: lockOverride,
                assignmentLockThreshold: thresholdOverride,
              });
            }}
            style={styles.slider}
          />
        </>
      )}

      <View style={styles.divider} />

      {/* Lock until assignments complete */}
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>Lock entertainment until done</Text>
          <Text style={styles.rowDesc}>
            {usingLockOverride
              ? `Custom · ${lockOverride ? 'on' : 'off'}`
              : `Inheriting · ${state.lockUntilAssignmentsComplete ? 'on' : 'off'}`}
          </Text>
        </View>
        <Switch
          value={usingLockOverride}
          onValueChange={(v) => {
            const next = v ? state.lockUntilAssignmentsComplete : null;
            setLockOverrideState(next);
            persist({
              dailyLimitMinutes: limitOverride,
              lockUntilAssignmentsComplete: next,
              assignmentLockThreshold: thresholdOverride,
            });
          }}
          trackColor={{ false: '#D9D3C7', true: colors.accent }}
          thumbColor={colors.surface}
          ios_backgroundColor="#D9D3C7"
          disabled={submitting}
        />
      </View>
      {usingLockOverride && (
        <View style={styles.subRow}>
          <Text style={styles.rowLabel}>Block until done</Text>
          <Switch
            value={lockOverride ?? false}
            onValueChange={(v) => {
              setLockOverrideState(v);
              persist({
                dailyLimitMinutes: limitOverride,
                lockUntilAssignmentsComplete: v,
                assignmentLockThreshold: thresholdOverride,
              });
            }}
            trackColor={{ false: '#D9D3C7', true: colors.accent }}
            thumbColor={colors.surface}
            ios_backgroundColor="#D9D3C7"
            disabled={submitting}
          />
        </View>
      )}

      {/* Threshold (only meaningful when lock effective is on) */}
      {effLockEnabled && (
        <>
          <View style={styles.divider} />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Approved assignments required</Text>
              <Text style={styles.rowDesc}>
                {usingThresholdOverride
                  ? `Custom · ${thresholdOverride} ${thresholdOverride === 1 ? 'assignment' : 'assignments'}`
                  : `Inheriting · ${state.assignmentLockThreshold} ${state.assignmentLockThreshold === 1 ? 'assignment' : 'assignments'}`}
              </Text>
            </View>
            <Switch
              value={usingThresholdOverride}
              onValueChange={(v) => {
                const next = v ? state.assignmentLockThreshold : null;
                setThresholdOverride(next);
                setLiveThreshold(next ?? state.assignmentLockThreshold);
                persist({
                  dailyLimitMinutes: limitOverride,
                  lockUntilAssignmentsComplete: lockOverride,
                  assignmentLockThreshold: next,
                });
              }}
              trackColor={{ false: '#D9D3C7', true: colors.accent }}
              thumbColor={colors.surface}
              ios_backgroundColor="#D9D3C7"
              disabled={submitting}
            />
          </View>
          {usingThresholdOverride && (
            <>
              <View style={styles.sliderValueRow}>
                <Text style={styles.sliderValue}>{liveThreshold}</Text>
                <Text style={styles.sliderValueUnit}>{liveThreshold === 1 ? 'assignment' : 'assignments'}</Text>
              </View>
              <Slider
                value={thresholdOverride ?? state.assignmentLockThreshold}
                minimumValue={1}
                maximumValue={10}
                step={1}
                minimumTrackTintColor={colors.accent}
                maximumTrackTintColor={colors.borderSubtle}
                thumbTintColor={colors.accent}
                onValueChange={(v) => setLiveThreshold(Math.round(v))}
                onSlidingComplete={(v) => {
                  const next = Math.round(v);
                  setThresholdOverride(next);
                  persist({
                    dailyLimitMinutes: limitOverride,
                    lockUntilAssignmentsComplete: lockOverride,
                    assignmentLockThreshold: next,
                  });
                }}
                style={styles.slider}
              />
            </>
          )}
        </>
      )}

      {siblings.length > 0 && (
        <BulkApplyButton
          siblings={siblings}
          values={{
            dailyLimitMinutes: limitOverride,
            lockUntilAssignmentsComplete: lockOverride,
            assignmentLockThreshold: thresholdOverride,
          }}
          onApply={async (values) => {
            // Fan out the current child's three override fields to every
            // sibling. Each call is independent — one failure doesn't roll
            // back the others, but we surface the first error.
            const results = await Promise.all(
              siblings.map((s) =>
                setChildOverride({ childUserId: s.user_id, ...values }),
              ),
            );
            const firstErr = results.find((r) => r.error);
            if (firstErr?.error) setError(firstErr.error);
            else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          }}
        />
      )}

      {error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.footnote}>
        Toggle a row to override the family default just for this child. Off = uses your global setting.
      </Text>
    </View>
  );
}

// Inline bulk-apply pill. Disabled while a fan-out is in flight; shows a
// confirmation Alert before doing anything destructive.
function BulkApplyButton({
  siblings,
  values,
  onApply,
}: {
  siblings: SiblingLite[];
  values: {
    dailyLimitMinutes: number | null;
    lockUntilAssignmentsComplete: boolean | null;
    assignmentLockThreshold: number | null;
  };
  onApply: (values: {
    dailyLimitMinutes: number | null;
    lockUntilAssignmentsComplete: boolean | null;
    assignmentLockThreshold: number | null;
  }) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const count = siblings.length;
  const otherNames = siblings.map((s) => s.displayName).join(', ');

  const confirm = () => {
    Alert.alert(
      'Apply these limits to your other kids?',
      `This will overwrite the daily limit, lock toggle, and threshold for ${otherNames}. Their current overrides for these fields will be replaced.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: count === 1 ? 'Apply to 1 kid' : `Apply to ${count} kids`,
          onPress: async () => {
            setBusy(true);
            await onApply(values);
            setBusy(false);
          },
        },
      ],
    );
  };

  return (
    <Pressable
      onPress={confirm}
      disabled={busy}
      style={({ pressed }) => [styles.bulkBtn, pressed && { opacity: 0.85 }]}>
      {busy ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : (
        <>
          <Ionicons name="people-outline" size={14} color={colors.accent} />
          <Text style={styles.bulkBtnText}>
            Apply to my other {count === 1 ? 'kid' : `${count} kids`}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingLeft: 14,
    borderLeftWidth: 2,
    borderLeftColor: colors.accentBorder,
    marginVertical: 4,
  },
  rowLabel: { color: colors.textPrimary, fontSize: 13, fontFamily: fonts.semibold, letterSpacing: -0.2 },
  rowDesc: { color: colors.textMuted, fontSize: 11, marginTop: 2, lineHeight: 15 },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: 6 },

  sliderValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 8, marginBottom: 0 },
  sliderValue: { color: colors.accent, fontSize: 32, fontFamily: fonts.bold, letterSpacing: -1 },
  sliderValueUnit: { color: colors.textSecondary, fontSize: 12, fontFamily: fonts.semibold },
  slider: { width: '100%', height: 32 },

  error: { color: colors.danger, fontSize: 12, marginTop: 8 },
  footnote: { color: colors.textMuted, fontSize: 11, marginTop: 12, lineHeight: 15 },

  bulkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  bulkBtnText: { color: colors.accent, fontSize: 12, fontFamily: fonts.bold, letterSpacing: 0.2 },
});
