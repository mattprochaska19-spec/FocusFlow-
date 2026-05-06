import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useFocus, type ParentQuest, type QuestKind } from '@/lib/focus-context';
import { colors, fonts, radius, space } from '@/lib/theme';

type LinkedChildLite = { user_id: string; displayName: string };

// Modal create/edit form for a parent_quest. When `quest` is provided we're
// editing — kind is locked (changing quest type would invalidate existing
// claims), title/description/reward/repeatable/targets are mutable.
export function QuestEditorModal({
  visible,
  quest,
  defaultKind = 'goal',
  childUserId,
  linkedChildren,
  onClose,
}: {
  visible: boolean;
  quest: ParentQuest | null;
  defaultKind?: QuestKind;
  // If passed, the quest is created targeting only this child by default.
  childUserId?: string;
  linkedChildren: LinkedChildLite[];
  onClose: () => void;
}) {
  const { createQuest, updateQuest, setQuestTargets } = useFocus();
  const [kind, setKind] = useState<QuestKind>(defaultKind);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reward, setReward] = useState('15');
  const [repeatable, setRepeatable] = useState(true);
  const [targets, setTargets] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form whenever it opens. Editing → prefill from the quest; creating
  // → start from the per-section default + the focused child as the only target.
  useEffect(() => {
    if (!visible) return;
    if (quest) {
      setKind(quest.kind);
      setTitle(quest.title);
      setDescription(quest.description ?? '');
      setReward(String(quest.rewardMinutes));
      setRepeatable(quest.repeatable);
      setTargets(quest.targets);
    } else {
      setKind(defaultKind);
      setTitle('');
      setDescription('');
      setReward(defaultKind === 'extra_work' ? '20' : '60');
      setRepeatable(defaultKind === 'extra_work');
      setTargets(childUserId ? [childUserId] : []);
    }
    setError(null);
  }, [visible, quest, defaultKind, childUserId]);

  const toggleTarget = (id: string) => {
    setTargets((curr) => (curr.includes(id) ? curr.filter((c) => c !== id) : [...curr, id]));
  };

  const submit = async () => {
    const rewardNum = parseInt(reward, 10);
    if (!title.trim()) { setError('Title is required'); return; }
    if (!Number.isFinite(rewardNum) || rewardNum < 0) { setError('Reward minutes must be a number'); return; }

    setSubmitting(true);
    setError(null);

    if (quest) {
      const updRes = await updateQuest(quest.id, {
        title: title.trim(),
        description: description.trim() || null,
        rewardMinutes: rewardNum,
        repeatable,
      });
      if (updRes.error) { setSubmitting(false); setError(updRes.error); return; }
      const tRes = await setQuestTargets(quest.id, targets);
      if (tRes.error) { setSubmitting(false); setError(tRes.error); return; }
    } else {
      const r = await createQuest({
        kind,
        title: title.trim(),
        description: description.trim() || null,
        rewardMinutes: rewardNum,
        repeatable,
        targetChildIds: targets,
      });
      if (r.error) { setSubmitting(false); setError(r.error); return; }
    }
    setSubmitting(false);
    onClose();
  };

  const isEditing = !!quest;

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.backdrop}>
        <View style={styles.card}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg }}>
            <Text style={styles.title}>{isEditing ? 'Edit quest' : kind === 'extra_work' ? 'New extra work' : 'New goal'}</Text>
            <Text style={styles.sub}>
              {kind === 'extra_work'
                ? 'Optional task your child can pick up to earn extra minutes.'
                : 'A bonus goal — your child claims it when complete and you approve.'}
            </Text>

            {!isEditing && (
              <View style={styles.kindRow}>
                <KindBtn label="Goal" active={kind === 'goal'} onPress={() => setKind('goal')} />
                <KindBtn label="Extra work" active={kind === 'extra_work'} onPress={() => setKind('extra_work')} />
              </View>
            )}

            <Text style={styles.label}>Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={kind === 'extra_work' ? 'e.g. Khan Academy: 3 lessons' : 'e.g. Finish all weekly homework'}
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              autoFocus
            />

            <Text style={styles.label}>Description (optional)</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Any specifics your kid needs to know"
              placeholderTextColor={colors.textMuted}
              multiline
              style={[styles.input, { minHeight: 64, textAlignVertical: 'top' }]}
            />

            <Text style={styles.label}>Reward minutes</Text>
            <TextInput
              value={reward}
              onChangeText={setReward}
              placeholder="15"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              style={styles.input}
            />

            <View style={styles.toggleRow}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={styles.toggleLabel}>Repeatable</Text>
                <Text style={styles.toggleDesc}>
                  {repeatable
                    ? 'Kid can claim this more than once over time.'
                    : 'One-time only — disappears after first approval.'}
                </Text>
              </View>
              <Switch
                value={repeatable}
                onValueChange={setRepeatable}
                trackColor={{ false: '#D9D3C7', true: colors.accent }}
                thumbColor={colors.surface}
                ios_backgroundColor="#D9D3C7"
              />
            </View>

            <Text style={styles.label}>Who it applies to</Text>
            <Text style={styles.targetHint}>
              {targets.length === 0
                ? 'No kids selected — will apply to all your linked children.'
                : `${targets.length} of ${linkedChildren.length} selected`}
            </Text>
            <View style={{ gap: 6, marginTop: 6 }}>
              {linkedChildren.map((c) => {
                const on = targets.includes(c.user_id);
                return (
                  <Pressable
                    key={c.user_id}
                    onPress={() => toggleTarget(c.user_id)}
                    style={({ pressed }) => [
                      styles.targetRow,
                      on && styles.targetRowOn,
                      pressed && { opacity: 0.85 },
                    ]}>
                    <Ionicons
                      name={on ? 'checkmark-circle' : 'ellipse-outline'}
                      size={18}
                      color={on ? colors.accent : colors.textMuted}
                    />
                    <Text style={[styles.targetName, on && { color: colors.accent }]}>{c.displayName}</Text>
                  </Pressable>
                );
              })}
            </View>

            {error && <Text style={styles.error}>{error}</Text>}

            <View style={styles.actions}>
              <Pressable
                onPress={onClose}
                disabled={submitting}
                style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.85 }]}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={submit}
                disabled={submitting}
                style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }]}>
                {submitting
                  ? <ActivityIndicator color={colors.textInverse} />
                  : <Text style={styles.saveText}>{isEditing ? 'Save' : 'Create'}</Text>}
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function KindBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.kindBtn, active && styles.kindBtnActive, pressed && { opacity: 0.85 }]}>
      <Text style={[styles.kindBtnText, active && styles.kindBtnTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    width: '100%',
    maxWidth: 480,
    maxHeight: '88%',
  },
  title: { color: colors.textPrimary, fontSize: 22, fontFamily: fonts.serifBold, letterSpacing: -0.5, marginBottom: 4 },
  sub: { color: colors.textSecondary, fontSize: 13, marginBottom: 18, lineHeight: 18 },

  kindRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  kindBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
  },
  kindBtnActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  kindBtnText: { color: colors.textSecondary, fontSize: 13, fontFamily: fonts.semibold },
  kindBtnTextActive: { color: colors.accent },

  label: {
    color: colors.textMuted,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: fonts.bold,
    marginTop: 14,
    marginBottom: 6,
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
    fontFamily: fonts.medium,
  },

  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  toggleLabel: { color: colors.textPrimary, fontSize: 14, fontFamily: fonts.semibold },
  toggleDesc: { color: colors.textMuted, fontSize: 12, marginTop: 2, lineHeight: 16 },

  targetHint: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
  },
  targetRowOn: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  targetName: { color: colors.textPrimary, fontSize: 14, fontFamily: fonts.semibold },

  error: { color: colors.danger, fontSize: 12, marginTop: 12 },

  actions: { flexDirection: 'row', gap: 8, marginTop: 20 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
  },
  cancelText: { color: colors.textSecondary, fontSize: 13, fontFamily: fonts.bold },
  saveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  saveText: { color: colors.textInverse, fontSize: 13, fontFamily: fonts.bold, letterSpacing: 0.3 },
});
