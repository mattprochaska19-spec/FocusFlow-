import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Mascot } from '@/components/mascot';
import { MascotWithSpeech } from '@/components/speech-bubble';
import { useAuth } from '@/lib/auth-context';
import { fetchClassroomAssignments, type ClassroomAssignment } from '@/lib/classroom';
import { useFocus } from '@/lib/focus-context';
import { colors, radius, shadow, shadowSm, space } from '@/lib/theme';

const DEFAULT_DURATION = 25;

type StartOpts = {
  durationMinutes: number;
  anchorTitle?: string;
  anchorEventId?: string;
  anchorDueAt?: string | null;
  classroomCourseId?: string;
  classroomCourseWorkId?: string;
};

export function FocusSessionCard() {
  const { profile, activeFocusSession, startFocusSession, endFocusSession } = useFocus();

  if (activeFocusSession) {
    return <ActiveCard onEnd={endFocusSession} />;
  }
  return <IdleCard onStart={startFocusSession} role={profile?.role ?? null} />;
}

function IdleCard({
  onStart,
  role,
}: {
  onStart: (opts: StartOpts) => void;
  role: 'parent' | 'student' | null;
}) {
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const { googleAccessToken, getClassroomAccessToken } = useAuth();
  const [classroomItems, setClassroomItems] = useState<ClassroomAssignment[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isStudent = role === 'student';

  // Pull upcoming Classroom assignments so the student can anchor the session
  // to one. The Phase B auto-end only triggers when a Classroom anchor is set.
  // Uses the secondary school account when linked, falling back to primary.
  useEffect(() => {
    if (!isStudent || !googleAccessToken) return;
    let cancelled = false;
    (async () => {
      const token = await getClassroomAccessToken();
      if (cancelled || !token) return;
      try {
        const items = await fetchClassroomAssignments(token, { daysAhead: 14 });
        if (!cancelled) setClassroomItems(items);
      } catch {
        if (!cancelled) setClassroomItems([]);
      }
    })();
    return () => { cancelled = true; };
  }, [isStudent, googleAccessToken, getClassroomAccessToken]);

  const selected = classroomItems?.find((c) => c.id === selectedId) ?? null;

  return (
    <>
      <Text style={styles.sectionLabel}>Focus Session</Text>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.iconWrap}>
            <Ionicons name="timer-outline" size={18} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Lock in for {duration} minutes</Text>
            <Text style={styles.headerSub}>
              {isStudent
                ? selected
                  ? 'Submit in Classroom and the timer auto-ends with 1.5× bonus minutes.'
                  : 'Entertainment is fully blocked. Pick a Classroom assignment for auto-detect, or skip for a plain timer.'
                : 'Entertainment is fully blocked for you while the timer runs. Use it to get deep work done.'}
            </Text>
          </View>
        </View>

        <View style={styles.sliderValueRow}>
          <Text style={styles.sliderValue}>{duration}</Text>
          <Text style={styles.sliderValueUnit}>min</Text>
        </View>
        <Slider
          value={duration}
          minimumValue={5}
          maximumValue={120}
          step={5}
          minimumTrackTintColor={colors.accent}
          maximumTrackTintColor={colors.borderSubtle}
          thumbTintColor={colors.accent}
          onValueChange={(v) => setDuration(Math.round(v))}
          style={styles.slider}
        />
        <View style={styles.sliderRange}>
          <Text style={styles.sliderRangeText}>5m</Text>
          <Text style={styles.sliderRangeText}>120m</Text>
        </View>

        {isStudent && classroomItems && classroomItems.length > 0 && (
          <View style={styles.pickerWrap}>
            <Text style={styles.pickerLabel}>Anchor to a Classroom assignment</Text>
            {classroomItems.map((item) => {
              const isSelected = item.id === selectedId;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setSelectedId(isSelected ? null : item.id)}
                  style={({ pressed }) => [
                    styles.pickerRow,
                    isSelected && styles.pickerRowSelected,
                    pressed && { opacity: 0.85 },
                  ]}>
                  <Ionicons
                    name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                    size={16}
                    color={isSelected ? colors.accent : colors.textMuted}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.pickerMeta} numberOfLines={1}>{item.courseTitle}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        <Pressable
          onPress={() =>
            onStart({
              durationMinutes: duration,
              anchorTitle: selected?.title,
              anchorEventId: selected?.id,
              anchorDueAt: selected?.dueAt,
              classroomCourseId: selected?.courseId,
              classroomCourseWorkId: selected?.courseWorkId,
            })
          }
          style={({ pressed }) => [styles.startBtn, pressed && { opacity: 0.9 }]}>
          <Ionicons name="play" size={14} color={colors.textInverse} style={{ marginRight: 6 }} />
          <Text style={styles.startBtnText}>
            {selected ? 'Start · auto-detect on' : 'Start Focus'}
          </Text>
        </Pressable>
      </View>
    </>
  );
}

function ActiveCard({ onEnd }: { onEnd: () => void }) {
  const { activeFocusSession } = useFocus();
  const isRemote = !!activeFocusSession?.remoteSessionId;
  const [remaining, setRemaining] = useState(() =>
    activeFocusSession ? Math.max(0, activeFocusSession.endsAt - Date.now()) : 0
  );

  useEffect(() => {
    if (!activeFocusSession) return;
    const tick = () => {
      setRemaining(Math.max(0, activeFocusSession.endsAt - Date.now()));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [activeFocusSession?.endsAt]);

  if (!activeFocusSession) return null;

  const totalMs = activeFocusSession.durationMinutes * 60_000;
  const elapsedMs = totalMs - remaining;
  const pct = Math.max(0, Math.min(100, (elapsedMs / totalMs) * 100));

  const mm = Math.floor(remaining / 60_000);
  const ss = Math.floor((remaining % 60_000) / 1000);

  const encouragement = pickEncouragement(pct, activeFocusSession.anchorTitle);

  return (
    <>
      <Text style={[styles.sectionLabel, { color: colors.accent }]}>Focusing</Text>
      <View style={[styles.card, styles.cardActive]}>
        <MascotWithSpeech
          pose="meditating"
          text={encouragement}
          size="md"
          containerStyle={{ marginBottom: 14 }}
        />
        {activeFocusSession.anchorTitle ? (
          <Text style={styles.activeAnchor} numberOfLines={2}>
            {activeFocusSession.anchorTitle}
          </Text>
        ) : (
          <Text style={styles.activeAnchor}>Deep work in progress</Text>
        )}

        <Text style={styles.bigCountdown}>
          {String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}
        </Text>
        <Text style={styles.countdownLabel}>remaining</Text>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${pct}%` }]} />
        </View>

        <View style={styles.activeFooter}>
          <Ionicons name="lock-closed" size={12} color={colors.accent} />
          <Text style={styles.activeFooterText}>
            {isRemote ? 'Locked by parent — entertainment blocked' : 'Entertainment is locked'}
          </Text>
        </View>

        {isRemote ? (
          <View style={styles.endBtnDisabled}>
            <Text style={styles.endBtnDisabledText}>Only your parent can end this</Text>
          </View>
        ) : (
          <Pressable
            onPress={onEnd}
            style={({ pressed }) => [styles.endBtn, pressed && { opacity: 0.85 }]}>
            <Text style={styles.endBtnText}>End early</Text>
          </Pressable>
        )}
      </View>
    </>
  );
}

// Bucketed encouragement messages for active focus sessions. Computed from
// percent-elapsed; updates 4-5 times during a session, which is plenty
// without being noisy. Anchor title woven in when present for context.
function pickEncouragement(pct: number, anchor: string | null): string {
  if (pct < 20) return anchor ? `Settling in on "${anchor}". You got this.` : 'Settling in. Deep breath.';
  if (pct < 50) return anchor ? `In the zone with "${anchor}".` : "You're getting in the zone!";
  if (pct < 75) return 'Halfway there — keep going!';
  if (pct < 92) return 'Almost done — push through!';
  return 'Final stretch! 💪';
}

const styles = StyleSheet.create({
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
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadowSm,
  },
  cardActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBorder,
    ...shadow,
  },

  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  headerSub: { color: colors.textSecondary, fontSize: 12, marginTop: 4, lineHeight: 17 },

  sliderValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 4 },
  sliderValue: { color: colors.accent, fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  sliderValueUnit: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  slider: { width: '100%', height: 36, marginTop: 4 },
  sliderRange: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -4, paddingHorizontal: 2 },
  sliderRangeText: { color: colors.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },

  anchorHint: { color: colors.textMuted, fontSize: 12, marginTop: 12, marginBottom: 4 },
  anchorTitle: { color: colors.textPrimary, fontWeight: '600' },

  pickerWrap: { marginTop: 14, gap: 6 },
  pickerLabel: {
    color: colors.textMuted,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '700',
    marginBottom: 4,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  pickerRowSelected: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBorder,
  },
  pickerTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: '600', letterSpacing: -0.1 },
  pickerMeta: { color: colors.textMuted, fontSize: 11, marginTop: 1 },

  startBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  startBtnText: { color: colors.textInverse, fontWeight: '700', fontSize: 14, letterSpacing: 0.2 },

  // Active state
  activeMascot: { alignSelf: 'center', marginBottom: 4 },
  activeAnchor: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  bigCountdown: {
    color: colors.accent,
    fontSize: 56,
    fontWeight: '800',
    letterSpacing: -2,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    marginVertical: 4,
  },
  countdownLabel: {
    color: colors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 14,
  },
  progressTrack: {
    height: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressFill: { height: '100%', backgroundColor: colors.accent, borderRadius: radius.pill },

  activeFooter: { flexDirection: 'row', alignItems: 'center', gap: 5, justifyContent: 'center', marginBottom: 12 },
  activeFooterText: { color: colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },

  endBtn: {
    paddingVertical: 11,
    borderRadius: radius.pill,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  endBtnText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  endBtnDisabled: {
    paddingVertical: 11,
    borderRadius: radius.pill,
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderStyle: 'dashed',
  },
  endBtnDisabledText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
});
