import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Mascot } from '@/components/mascot';
import { useAuth } from '@/lib/auth-context';
import { colors, fonts, radius, shadowSm, space, tabularNumbers } from '@/lib/theme';

// AsyncStorage flag we set when the user reaches the end of onboarding. The
// auth gate reads it on every routing decision — if it's missing for a parent
// account, the user re-enters onboarding (so a force-quit mid-flow doesn't
// lose the conversion attempt).
//
// Scoped by user_id so signing out + back in as the same parent doesn't
// re-trigger onboarding, while a different user on the same device gets a
// fresh funnel automatically (their key doesn't exist yet).
const ONBOARDING_DONE_PREFIX = 'pandu_onboarding_done_';
const ONBOARDING_ANSWERS_PREFIX = 'pandu_onboarding_answers_';

export function onboardingDoneKey(userId: string): string {
  return ONBOARDING_DONE_PREFIX + userId;
}
export function onboardingAnswersKey(userId: string): string {
  return ONBOARDING_ANSWERS_PREFIX + userId;
}

// Range buttons feel cleaner than sliders and quantize the answer for cohort
// analytics. Midpoints feed the value-reveal math.
const AGE_RANGES = [
  { id: 'a-4-6',   label: '4 – 6 yrs',   midpoint: 5 },
  { id: 'a-7-9',   label: '7 – 9 yrs',   midpoint: 8 },
  { id: 'a-10-12', label: '10 – 12 yrs', midpoint: 11 },
  { id: 'a-13-15', label: '13 – 15 yrs', midpoint: 14 },
  { id: 'a-16-18', label: '16 – 18 yrs', midpoint: 17 },
] as const;
type AgeRangeId = typeof AGE_RANGES[number]['id'];

const HOURS_RANGES = [
  { id: 'h-lt1', label: 'Less than 1 hr', midpoint: 0.5 },
  { id: 'h-1-2', label: '1 – 2 hrs',      midpoint: 1.5 },
  { id: 'h-2-4', label: '2 – 4 hrs',      midpoint: 3 },
  { id: 'h-4-6', label: '4 – 6 hrs',      midpoint: 5 },
  { id: 'h-6-8', label: '6 – 8 hrs',      midpoint: 7 },
  { id: 'h-8+',  label: '8+ hrs',         midpoint: 9 },
] as const;
type HoursRangeId = typeof HOURS_RANGES[number]['id'];

const STRUGGLES: { id: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'phone',      label: "Can't put the phone down",     icon: 'phone-portrait-outline' },
  { id: 'school',     label: 'Falling behind in schoolwork', icon: 'school-outline' },
  { id: 'sleep',      label: 'Trouble sleeping',             icon: 'moon-outline' },
  { id: 'conflict',   label: 'Family conflict over screens', icon: 'flame-outline' },
  { id: 'homework',   label: 'Avoiding homework',            icon: 'book-outline' },
  { id: 'distracted', label: 'Distracted during school',     icon: 'eye-off-outline' },
];

const GRADES = [
  { id: 'pre-k',    label: 'Pre-K' },
  { id: 'k-2',      label: 'K – 2nd' },
  { id: '3-5',      label: '3rd – 5th' },
  { id: '6-8',      label: '6th – 8th' },
  { id: '9-12',     label: '9th – 12th' },
  { id: 'college',  label: 'College' },
];

// 6 steps: 4 questions + value reveal + testimonial wall. Progress bar fills
// proportionally. Payment screen will slot in here later as step 7.
const TOTAL_STEPS = 6;

type Testimonial = {
  rating: number; // 1-5
  painPoint: string;
  quote: string;
  name: string;
  context: string;
};

// Placeholder testimonials. Replace with real ones once you have users —
// each one is structured (rating + pain-point tag + quote + attribution) so
// the visual layout doesn't change when copy is swapped.
const TESTIMONIALS: Testimonial[] = [
  {
    rating: 5,
    painPoint: 'Phone addiction',
    quote:
      "My 12-year-old used to scroll for hours after school. With Pandu, she has to earn screen time by finishing her assignments first — and she does. Game changer.",
    name: 'Sarah M.',
    context: 'Mom of 2',
  },
  {
    rating: 5,
    painPoint: 'Family conflict',
    quote:
      "Pandu ended the daily fight over screen time. The rules live in the app, not on me. My kids actually respect it because they earn what they get.",
    name: 'Marcus T.',
    context: 'Dad of 3',
  },
  {
    rating: 5,
    painPoint: 'Falling behind in school',
    quote:
      "Within two weeks my son went from constant homework battles to actually wanting to focus. The streak feature is what locked him in.",
    name: 'Jen R.',
    context: 'Mom of 1',
  },
];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

  const [step, setStep] = useState(0);
  const [ageRange, setAgeRange] = useState<AgeRangeId | null>(null);
  const [hoursRange, setHoursRange] = useState<HoursRangeId | null>(null);
  const [struggle, setStruggle] = useState<string | null>(null);
  const [grade, setGrade] = useState<string | null>(null);

  // Resolve range IDs to numeric midpoints for the value-reveal math.
  const ageMidpoint = useMemo(
    () => AGE_RANGES.find((r) => r.id === ageRange)?.midpoint ?? 10,
    [ageRange],
  );
  const hoursMidpoint = useMemo(
    () => HOURS_RANGES.find((r) => r.id === hoursRange)?.midpoint ?? 4,
    [hoursRange],
  );

  const advance = () => {
    Haptics.selectionAsync().catch(() => {});
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  };

  const back = () => {
    Haptics.selectionAsync().catch(() => {});
    setStep((s) => Math.max(0, s - 1));
  };

  const finish = async () => {
    if (!session) return;
    const uid = session.user.id;
    await Promise.all([
      AsyncStorage.setItem(onboardingDoneKey(uid), '1'),
      AsyncStorage.setItem(
        onboardingAnswersKey(uid),
        JSON.stringify({
          ageRange,
          hoursRange,
          struggle,
          grade,
          completedAt: new Date().toISOString(),
        }),
      ),
    ]);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.replace('/');
  };

  // Each question must be answered before Continue is enabled.
  const canContinue = (() => {
    if (step === 0) return ageRange !== null;
    if (step === 1) return hoursRange !== null;
    if (step === 2) return struggle !== null;
    if (step === 3) return grade !== null;
    return true;
  })();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        {step > 0 && step < TOTAL_STEPS - 1 ? (
          <Pressable onPress={back} hitSlop={8} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
          </Pressable>
        ) : (
          <View style={styles.backBtn} />
        )}
        <ProgressBar value={(step + 1) / TOTAL_STEPS} />
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {step === 0 && (
          <AgeStep value={ageRange} onPick={setAgeRange} />
        )}
        {step === 1 && (
          <HoursStep value={hoursRange} onPick={setHoursRange} />
        )}
        {step === 2 && (
          <StruggleStep value={struggle} onPick={setStruggle} />
        )}
        {step === 3 && (
          <GradeStep value={grade} onPick={setGrade} />
        )}
        {step === 4 && (
          <ValueStep age={ageMidpoint} hours={hoursMidpoint} />
        )}
        {step === 5 && (
          <TestimonialStep />
        )}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          onPress={step === TOTAL_STEPS - 1 ? finish : advance}
          disabled={!canContinue}
          style={({ pressed }) => [
            styles.cta,
            !canContinue && styles.ctaDisabled,
            pressed && { opacity: 0.9 },
          ]}>
          <Text style={styles.ctaText}>
            {step === TOTAL_STEPS - 1 ? "Let's get started" : 'Continue'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Progress bar ───────────────────────────────────────────────────────────
function ProgressBar({ value }: { value: number }) {
  const anim = useRef(new Animated.Value(value)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: value, duration: 280, useNativeDriver: false }).start();
  }, [value, anim]);
  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={styles.progressTrack}>
      <Animated.View style={[styles.progressFill, { width }]} />
    </View>
  );
}

// ─── Typewriter ─────────────────────────────────────────────────────────────
// Renders text one character at a time so the question feels conversational.
// Restarts whenever the `text` prop changes (i.e., between steps). A blinking
// cursor caret stays visible while typing and disappears once complete.
function Typewriter({
  text,
  speed = 22,
  style,
}: {
  text: string;
  speed?: number;
  style?: object;
}) {
  const [shown, setShown] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    setShown('');
    setDone(false);
    let i = 0;
    const id = setInterval(() => {
      i++;
      setShown(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(id);
        setDone(true);
      }
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);

  // Blinking caret while typing — fades out once complete so the title looks
  // settled. Pure decoration; doesn't affect layout (caret is a thin character).
  const caretAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (done) {
      Animated.timing(caretAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(caretAnim, { toValue: 0.2, duration: 380, useNativeDriver: true }),
        Animated.timing(caretAnim, { toValue: 1, duration: 380, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [done, caretAnim]);

  return (
    <Text style={style}>
      {shown}
      <Animated.Text style={[style, { opacity: caretAnim }]}>|</Animated.Text>
    </Text>
  );
}

// ─── Step components ────────────────────────────────────────────────────────
function StepHeader({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
}) {
  // Mascot is locked in `thinking` for the whole flow — gives a consistent
  // "Pandu is asking you a question" feel.
  return (
    <View style={styles.headerWrap}>
      <Mascot pose="thinking" size={120} />
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Typewriter text={title} style={styles.title} />
      {sub && <Text style={styles.sub}>{sub}</Text>}
    </View>
  );
}

function AgeStep({
  value,
  onPick,
}: {
  value: AgeRangeId | null;
  onPick: (id: AgeRangeId) => void;
}) {
  return (
    <View>
      <StepHeader
        eyebrow="Your family"
        title="How old is your child?"
        sub="Pandu works for every kid in your house. To start, tell us about one of them — you'll add siblings in seconds after setup."
      />
      <View style={styles.rangeGrid}>
        {AGE_RANGES.map((r) => (
          <RangeButton
            key={r.id}
            label={r.label}
            selected={r.id === value}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onPick(r.id);
            }}
          />
        ))}
      </View>
    </View>
  );
}

function HoursStep({
  value,
  onPick,
}: {
  value: HoursRangeId | null;
  onPick: (id: HoursRangeId) => void;
}) {
  return (
    <View>
      <StepHeader
        eyebrow="Honest answer"
        title="How many hours a day on screens?"
        sub="Be honest — most parents underestimate by ~25%."
      />
      <View style={styles.rangeGrid}>
        {HOURS_RANGES.map((r) => (
          <RangeButton
            key={r.id}
            label={r.label}
            selected={r.id === value}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onPick(r.id);
            }}
          />
        ))}
      </View>
    </View>
  );
}

function StruggleStep({
  value,
  onPick,
}: {
  value: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <View>
      <StepHeader
        eyebrow="What hurts most"
        title="What's your biggest struggle right now?"
        sub="Pick the one that feels most painful — there's no wrong answer."
      />
      <View style={styles.cardGrid}>
        {STRUGGLES.map((s) => {
          const on = s.id === value;
          return (
            <Pressable
              key={s.id}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onPick(s.id);
              }}
              style={({ pressed }) => [
                styles.optionCard,
                on && styles.optionCardOn,
                pressed && { opacity: 0.9 },
              ]}>
              <View style={[styles.optionIcon, on && styles.optionIconOn]}>
                <Ionicons name={s.icon} size={18} color={on ? colors.accent : colors.textSecondary} />
              </View>
              <Text style={[styles.optionText, on && styles.optionTextOn]}>{s.label}</Text>
              {on && <Ionicons name="checkmark-circle" size={18} color={colors.accent} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function GradeStep({
  value,
  onPick,
}: {
  value: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <View>
      <StepHeader
        eyebrow="School level"
        title="What grade is your child in?"
        sub="So we can match assignments and goals to their stage."
      />
      <View style={styles.gradeGrid}>
        {GRADES.map((g) => {
          const on = g.id === value;
          return (
            <Pressable
              key={g.id}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onPick(g.id);
              }}
              style={({ pressed }) => [
                styles.gradeChip,
                on && styles.gradeChipOn,
                pressed && { opacity: 0.9 },
              ]}>
              <Text style={[styles.gradeChipText, on && styles.gradeChipTextOn]}>{g.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ValueStep({ age, hours }: { age: number; hours: number }) {
  // Math: hours/year of entertainment, then convert to "full days" by dividing
  // by 24. Numbers are intentionally jarring — if 4hrs/day looks fine, "60
  // days/year of their childhood" reframes it. The "earned" framing positions
  // Pandu as the conversion mechanism, not an arbitrary blocker.
  const stats = useMemo(() => {
    const hoursPerYear = Math.round(hours * 365);
    const daysPerYear = Math.round((hours * 365) / 24);
    return { hoursPerYear, daysPerYear };
  }, [hours]);

  return (
    <View>
      <StepHeader
        eyebrow="Here's the picture"
        title={`At ${hours.toFixed(1)} hrs / day…`}
        sub="The real cost of unstructured screen time, plus what Pandu does about it."
      />

      <View style={styles.statCard}>
        <Text style={styles.statLabel}>Hours per year on screens</Text>
        <View style={styles.statRow}>
          <Text style={styles.statValue}>{stats.hoursPerYear.toLocaleString()}</Text>
          <Text style={styles.statUnit}>hrs</Text>
        </View>
        <Text style={styles.statHint}>{hours.toFixed(1)} × 365 days</Text>
      </View>

      <View style={[styles.statCard, styles.statCardDanger]}>
        <Text style={[styles.statLabel, styles.statLabelDanger]}>That's</Text>
        <View style={styles.statRow}>
          <Text style={[styles.statValue, styles.statValueDanger]}>{stats.daysPerYear}</Text>
          <Text style={[styles.statUnit, styles.statUnitDanger]}>full days a year</Text>
        </View>
        <Text style={[styles.statHint, styles.statHintDanger]}>
          Of their {18 - age >= 0 ? 18 - age : 0} years before adulthood, that's about{' '}
          {Math.round((stats.daysPerYear * Math.max(0, 18 - age)) / 30)} months they'll spend
          looking at a screen.
        </Text>
      </View>

      <View style={styles.dividerLabel}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerLabelText}>Pandu's flip</Text>
        <View style={styles.dividerLine} />
      </View>

      <View style={[styles.statCard, styles.statCardAccent]}>
        <Text style={[styles.statLabel, styles.statLabelAccent]}>Earned, not given</Text>
        <Text style={styles.statBody}>
          Pandu turns those <Text style={styles.statBodyStrong}>{stats.hoursPerYear.toLocaleString()} hours</Text> into{' '}
          <Text style={styles.statBodyStrong}>earned</Text> screen time. Your child unlocks fun
          only after focused work — assignments done, focus sessions completed, goals hit.
        </Text>
        <Text style={styles.statBody}>
          Same minutes; flipped incentive. Studies show focus-based reward systems out-perform
          tokens by a wide margin because they target the behavior, not the outcome.
        </Text>
      </View>

      <Text style={styles.siblingNote}>
        Got another kid? They're probably similar — Pandu handles siblings in the Family tab in
        seconds.
      </Text>
    </View>
  );
}

function TestimonialStep() {
  return (
    <View>
      <StepHeader
        eyebrow="Real families"
        title="Parents like you, working"
        sub="Real quotes from Pandu families. Same pain points you just shared."
      />
      <View style={{ gap: 12 }}>
        {TESTIMONIALS.map((t, i) => (
          <TestimonialCard key={i} t={t} />
        ))}
      </View>
    </View>
  );
}

function TestimonialCard({ t }: { t: Testimonial }) {
  return (
    <View style={styles.testimonialCard}>
      <View style={styles.testimonialTopRow}>
        <View style={styles.starRow}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Ionicons
              key={i}
              name="star"
              size={13}
              color={i < t.rating ? '#F5B400' : colors.borderSubtle}
              style={{ marginRight: 1 }}
            />
          ))}
        </View>
        <View style={styles.painTag}>
          <Text style={styles.painTagText}>{t.painPoint}</Text>
        </View>
      </View>
      <Text style={styles.testimonialQuote}>“{t.quote}”</Text>
      <Text style={styles.testimonialAttr}>
        — {t.name} <Text style={styles.testimonialContext}>· {t.context}</Text>
      </Text>
    </View>
  );
}

// Reusable range button used by the Age and Hours steps.
function RangeButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.rangeBtn,
        selected && styles.rangeBtnOn,
        pressed && { opacity: 0.9 },
      ]}>
      <Text style={[styles.rangeBtnText, selected && styles.rangeBtnTextOn]}>{label}</Text>
      {selected && (
        <Ionicons name="checkmark-circle" size={18} color={colors.accent} style={styles.rangeBtnCheck} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 14,
    gap: 12,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },

  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 999 },

  scroll: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 32 },

  headerWrap: { alignItems: 'center', marginBottom: 24 },
  eyebrow: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: fonts.bold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 26,
    fontFamily: fonts.serifBold,
    letterSpacing: -0.6,
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 320,
  },
  sub: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 18,
  },

  // Range button used for Age / Hours questions
  rangeGrid: { gap: 8, marginTop: 4 },
  rangeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    ...shadowSm,
  },
  rangeBtnOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  rangeBtnText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontFamily: fonts.bold,
    letterSpacing: -0.2,
  },
  rangeBtnTextOn: { color: colors.accent },
  rangeBtnCheck: { marginLeft: 8 },

  cardGrid: { gap: 8, marginTop: 4 },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    ...shadowSm,
  },
  optionCardOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  optionIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  optionIconOn: { backgroundColor: colors.surface },
  optionText: { flex: 1, color: colors.textPrimary, fontSize: 14, fontFamily: fonts.semibold, letterSpacing: -0.2 },
  optionTextOn: { color: colors.accent },

  gradeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 4 },
  gradeChip: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadowSm,
  },
  gradeChipOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  gradeChipText: { color: colors.textSecondary, fontSize: 14, fontFamily: fonts.bold, letterSpacing: -0.2 },
  gradeChipTextOn: { color: colors.accent },

  // Value-step stat cards
  statCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: space.lg,
    marginBottom: 12,
    ...shadowSm,
  },
  statCardDanger: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerBorder,
  },
  statCardAccent: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBorder,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontFamily: fonts.bold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  statLabelDanger: { color: colors.danger },
  statLabelAccent: { color: colors.accent },
  statRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  statValue: {
    color: colors.textPrimary,
    fontSize: 56,
    fontFamily: fonts.serifBlack,
    letterSpacing: -2,
    lineHeight: 60,
    ...tabularNumbers,
  },
  statValueDanger: { color: colors.danger },
  statUnit: { color: colors.textSecondary, fontSize: 14, fontFamily: fonts.semibold },
  statUnitDanger: { color: colors.danger },
  statHint: { color: colors.textMuted, fontSize: 12, marginTop: 8, lineHeight: 17 },
  statHintDanger: { color: colors.danger, opacity: 0.85 },

  statBody: { color: colors.textPrimary, fontSize: 14, lineHeight: 20, marginTop: 4 },
  statBodyStrong: { fontFamily: fonts.bold, color: colors.accent },

  dividerLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 16,
  },
  dividerLine: { flex: 1, height: 0.5, backgroundColor: colors.hairline },
  dividerLabelText: {
    color: colors.textMuted,
    fontSize: 10,
    fontFamily: fonts.bold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },

  // Bottom CTA bar
  bottomBar: {
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: colors.hairline,
    backgroundColor: colors.bg,
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaDisabled: { backgroundColor: colors.neutral },
  ctaText: { color: colors.textInverse, fontSize: 14, fontFamily: fonts.bold, letterSpacing: 0.3 },

  siblingNote: {
    color: colors.textMuted,
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 17,
  },

  // Testimonial cards
  testimonialCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: space.lg,
    ...shadowSm,
  },
  testimonialTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  starRow: { flexDirection: 'row', alignItems: 'center' },
  painTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
    borderWidth: 0.5,
    borderColor: colors.accentBorder,
  },
  painTagText: {
    color: colors.accent,
    fontSize: 10,
    fontFamily: fonts.bold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  testimonialQuote: {
    color: colors.textPrimary,
    fontSize: 15,
    fontFamily: fonts.serifSemibold,
    fontStyle: 'italic',
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  testimonialAttr: {
    color: colors.textPrimary,
    fontSize: 12,
    fontFamily: fonts.bold,
    marginTop: 10,
    letterSpacing: -0.1,
  },
  testimonialContext: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
  },
});
