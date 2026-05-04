import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  ALL_BLOCKABLE_APPS,
  BLOCKABLE_APP_LABEL,
  DAY_LABELS_SHORT,
  deleteScheduleBlock,
  minutesToTime,
  upsertScheduleBlock,
  type BlockedApp,
  type ScheduleBlock,
} from '@/lib/schedule';
import { colors, radius, shadowSm } from '@/lib/theme';

const DEFAULT_START = 9 * 60;  // 9:00 AM
const DEFAULT_END = 15 * 60;   // 3:00 PM

// Modal for creating or editing a schedule block. Create mode supports
// multi-day batch (one row per selected day); edit mode is single-block.
export function ScheduleEditor({
  visible,
  childUserId,
  block,
  defaultDay,
  onClose,
  onSaved,
}: {
  visible: boolean;
  childUserId: string;
  block: ScheduleBlock | null; // null = create new
  defaultDay?: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = block !== null;

  const [days, setDays] = useState<number[]>([]);
  const [startMin, setStartMin] = useState(DEFAULT_START);
  const [endMin, setEndMin] = useState(DEFAULT_END);
  const [apps, setApps] = useState<BlockedApp[]>([]);
  const [mode, setMode] = useState<'block' | 'limit'>('block');
  const [limitMin, setLimitMin] = useState(15);
  const [label, setLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens with a new target.
  useEffect(() => {
    if (!visible) return;
    if (block) {
      setDays([block.dayOfWeek]);
      setStartMin(block.startMinutes);
      setEndMin(block.endMinutes);
      setApps(block.blockedApps);
      setMode(block.limitMinutes === null ? 'block' : 'limit');
      setLimitMin(block.limitMinutes ?? 15);
      setLabel(block.label ?? '');
    } else {
      setDays(defaultDay !== undefined ? [defaultDay] : []);
      setStartMin(DEFAULT_START);
      setEndMin(DEFAULT_END);
      setApps([]);
      setMode('block');
      setLimitMin(15);
      setLabel('');
    }
    setError(null);
    setSubmitting(false);
  }, [visible, block?.id, defaultDay]);

  const toggleDay = (d: number) => {
    setDays((curr) => (curr.includes(d) ? curr.filter((x) => x !== d) : [...curr, d].sort()));
  };

  const toggleApp = (a: BlockedApp) => {
    setApps((curr) => {
      if (a === 'all') {
        // 'all' is exclusive; selecting it clears the rest, deselecting clears.
        return curr.includes('all') ? [] : ['all'];
      }
      if (curr.includes('all')) return [a]; // switching out of "all"
      return curr.includes(a) ? curr.filter((x) => x !== a) : [...curr, a];
    });
  };

  const isValid =
    days.length > 0 &&
    endMin > startMin &&
    apps.length > 0;

  const save = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError(null);

    const limitMinutes = mode === 'limit' ? limitMin : null;

    if (isEdit && block) {
      const { error: err } = await upsertScheduleBlock({
        id: block.id,
        childUserId,
        dayOfWeek: days[0],
        startMinutes: startMin,
        endMinutes: endMin,
        blockedApps: apps,
        limitMinutes,
        label,
      });
      setSubmitting(false);
      if (err) {
        setError(err);
        return;
      }
    } else {
      // Create one row per selected day (batch).
      for (const d of days) {
        const { error: err } = await upsertScheduleBlock({
          childUserId,
          dayOfWeek: d,
          startMinutes: startMin,
          endMinutes: endMin,
          blockedApps: apps,
          limitMinutes,
          label,
        });
        if (err) {
          setError(err);
          setSubmitting(false);
          return;
        }
      }
      setSubmitting(false);
    }
    onSaved();
    onClose();
  };

  const remove = async () => {
    if (!block || submitting) return;
    Alert.alert('Delete this window?', 'This block will no longer apply.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setSubmitting(true);
          const { error: err } = await deleteScheduleBlock(block.id);
          setSubmitting(false);
          if (err) {
            setError(err);
            return;
          }
          onSaved();
          onClose();
        },
      },
    ]);
  };

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.backdrop}>
        <View style={styles.card}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>
              {isEdit ? 'Edit window' : 'New schedule window'}
            </Text>
            <Text style={styles.sub}>
              Block specific apps during a recurring time window. Outside this window, the regular
              daily limits apply.
            </Text>

            {!isEdit && (
              <>
                <Text style={styles.fieldLabel}>Days</Text>
                <View style={styles.daysRow}>
                  {DAY_LABELS_SHORT.map((label, i) => {
                    const selected = days.includes(i);
                    return (
                      <Pressable
                        key={i}
                        onPress={() => toggleDay(i)}
                        style={({ pressed }) => [
                          styles.dayChip,
                          selected && styles.dayChipSelected,
                          pressed && { opacity: 0.85 },
                        ]}>
                        <Text style={[
                          styles.dayChipText,
                          selected && styles.dayChipTextSelected,
                        ]}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            <Text style={styles.fieldLabel}>Start</Text>
            <View style={styles.timeRow}>
              <Text style={styles.timeValue}>{minutesToTime(startMin)}</Text>
            </View>
            <Slider
              value={startMin}
              minimumValue={0}
              maximumValue={1425}
              step={15}
              minimumTrackTintColor={colors.accent}
              maximumTrackTintColor={colors.borderSubtle}
              thumbTintColor={colors.accent}
              onValueChange={(v) => setStartMin(Math.round(v))}
              style={styles.slider}
            />

            <Text style={styles.fieldLabel}>End</Text>
            <View style={styles.timeRow}>
              <Text style={styles.timeValue}>{minutesToTime(endMin)}</Text>
            </View>
            <Slider
              value={endMin}
              minimumValue={15}
              maximumValue={1440}
              step={15}
              minimumTrackTintColor={colors.accent}
              maximumTrackTintColor={colors.borderSubtle}
              thumbTintColor={colors.accent}
              onValueChange={(v) => setEndMin(Math.round(v))}
              style={styles.slider}
            />

            <Text style={styles.fieldLabel}>Apps</Text>
            <View style={styles.appsRow}>
              <AppChip
                app="all"
                selected={apps.includes('all')}
                onPress={() => toggleApp('all')}
              />
              {ALL_BLOCKABLE_APPS.map((a) => (
                <AppChip
                  key={a}
                  app={a}
                  selected={apps.includes(a) && !apps.includes('all')}
                  onPress={() => toggleApp(a)}
                />
              ))}
            </View>

            <Text style={styles.fieldLabel}>Access during window</Text>
            <View style={styles.modeRow}>
              <Pressable
                onPress={() => setMode('block')}
                style={({ pressed }) => [
                  styles.modeBtn,
                  mode === 'block' && styles.modeBtnSelected,
                  pressed && { opacity: 0.85 },
                ]}>
                <Text style={[styles.modeBtnText, mode === 'block' && styles.modeBtnTextSelected]}>
                  Block fully
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setMode('limit')}
                style={({ pressed }) => [
                  styles.modeBtn,
                  mode === 'limit' && styles.modeBtnSelected,
                  pressed && { opacity: 0.85 },
                ]}>
                <Text style={[styles.modeBtnText, mode === 'limit' && styles.modeBtnTextSelected]}>
                  Allow some
                </Text>
              </Pressable>
            </View>
            {mode === 'limit' && (
              <View style={styles.limitWrap}>
                <View style={styles.timeRow}>
                  <Text style={styles.timeValue}>{limitMin}</Text>
                  <Text style={styles.limitUnit}>min allowed</Text>
                </View>
                <Slider
                  value={limitMin}
                  minimumValue={1}
                  maximumValue={120}
                  step={1}
                  minimumTrackTintColor={colors.accent}
                  maximumTrackTintColor={colors.borderSubtle}
                  thumbTintColor={colors.accent}
                  onValueChange={(v) => setLimitMin(Math.round(v))}
                  style={styles.slider}
                />
                <Text style={styles.limitHint}>
                  During this window, entertainment caps at {limitMin} min. Educational content
                  is still allowed.
                </Text>
              </View>
            )}

            <Text style={styles.fieldLabel}>Label (optional)</Text>
            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder="e.g. School hours"
              placeholderTextColor={colors.textMuted}
              maxLength={32}
              style={styles.input}
            />

            {error && <Text style={styles.errorText}>{error}</Text>}
          </ScrollView>

          <View style={styles.actions}>
            {isEdit && (
              <Pressable
                onPress={remove}
                disabled={submitting}
                style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.85 }]}>
                <Ionicons name="trash-outline" size={14} color={colors.danger} />
              </Pressable>
            )}
            <Pressable
              onPress={onClose}
              disabled={submitting}
              style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.85 }]}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={save}
              disabled={!isValid || submitting}
              style={({ pressed }) => [
                styles.saveBtn,
                (!isValid || submitting) && styles.saveBtnDisabled,
                pressed && { opacity: 0.85 },
              ]}>
              {submitting
                ? <ActivityIndicator color={colors.textInverse} />
                : <Text style={styles.saveText}>Save</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function AppChip({
  app,
  selected,
  onPress,
}: {
  app: BlockedApp;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.appChip,
        selected && styles.appChipSelected,
        pressed && { opacity: 0.85 },
      ]}>
      <Text style={[styles.appChipText, selected && styles.appChipTextSelected]}>
        {BLOCKABLE_APP_LABEL[app]}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(11, 10, 8, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 20,
    width: '100%',
    maxWidth: 420,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadowSm,
  },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  sub: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 4, marginBottom: 14 },

  fieldLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginTop: 12,
    marginBottom: 8,
  },

  daysRow: { flexDirection: 'row', gap: 6 },
  dayChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
  },
  dayChipSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  dayChipText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  dayChipTextSelected: { color: colors.accent },

  timeRow: { marginBottom: 4 },
  timeValue: {
    color: colors.accent,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  slider: { width: '100%', height: 36 },

  appsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  appChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  appChipSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  appChipText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  appChipTextSelected: { color: colors.accent, fontWeight: '700' },

  modeRow: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.pill,
    padding: 3,
    gap: 2,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: radius.pill,
  },
  modeBtnSelected: { backgroundColor: colors.accent },
  modeBtnText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  modeBtnTextSelected: { color: colors.textInverse },

  limitWrap: { marginTop: 12 },
  limitUnit: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
  limitHint: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: -4,
  },

  input: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: colors.textPrimary,
    fontSize: 14,
  },
  errorText: { color: colors.danger, fontSize: 12, marginTop: 10 },

  actions: { flexDirection: 'row', gap: 8, marginTop: 16, alignItems: 'center' },
  deleteBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.pill,
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  cancelText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  saveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.pill,
    alignItems: 'center',
    backgroundColor: colors.accent,
  },
  saveBtnDisabled: { backgroundColor: colors.neutral },
  saveText: { color: colors.textInverse, fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
});
