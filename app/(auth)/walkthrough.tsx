import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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

import { Mascot, type MascotPose } from '@/components/mascot';
import { useFocus } from '@/lib/focus-context';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius, shadowSm, space } from '@/lib/theme';

// Tap-through walkthrough for new parents. Each step is a full-screen card
// with the mascot + headline + body + (optional) bullets, and a Continue
// button. No spotlight UI highlighting — that's a follow-up. Step 6 ("wait
// for first kid") doesn't gate on the kid actually joining; the flow is
// purely tap-through right now.
//
// On finish: mark_walkthrough_complete RPC fires, AuthGate sees the new
// timestamp on the next profile reload and routes the parent into the app.

type Step = {
  pose: MascotPose;
  eyebrow: string;
  title: string;
  body: string;
  bullets?: string[];
  ctaLabel?: string; // override "Continue" on a specific step
};

const STEPS: Step[] = [
  {
    pose: 'excited',
    eyebrow: 'Step 1 of 7 · Welcome',
    title: 'Hey, I\'m Pandu!',
    body: "I'll walk you through setting up your family in about a minute. The big idea: your kids earn screen time by doing focused work — not the other way around.",
  },
  {
    pose: 'encouraging',
    eyebrow: 'Step 2 of 7 · Family code',
    title: 'Your family code',
    body: 'Find your unique family code at the top of the Settings tab. Share it with each of your kids — they enter it when signing up so their account links to yours.',
    bullets: [
      'Settings → top of the page',
      'Tap-and-hold the code to copy',
      'Share via text, email, or AirDrop',
    ],
  },
  {
    pose: 'thinking',
    eyebrow: 'Step 3 of 7 · Set limits',
    title: 'Set daily limits',
    body: "Open Family → Limits & Locks. Pick a daily entertainment cap and (if you want) require finished assignments before unlocking it. Use the kid-icon row to apply the same rules to all your kids at once.",
    bullets: [
      'Family tab → Limits & Locks',
      'Slider sets the daily cap',
      'Tap kid icons to pick who it applies to',
    ],
  },
  {
    pose: 'happy',
    eyebrow: 'Step 4 of 7 · First goal',
    title: 'Create your first goal',
    body: "Goals are how kids earn bonus minutes. Open Family → Quests & Goals → Add. Set a title (e.g., 'Finish weekly homework'), how many minutes it's worth, and which kids it applies to.",
    bullets: [
      'Family tab → Quests & Goals → Add',
      'Pick reward minutes (15, 30, 60…)',
      'Repeatable for daily wins; one-time for big targets',
    ],
  },
  {
    pose: 'thinking',
    eyebrow: 'Step 5 of 7 · Schedule (optional)',
    title: 'Block time windows',
    body: "If you want to lock down screens during school or homework hours, the Schedule panel lets you set recurring windows per kid. Skip this if a flat daily limit is enough — you can always set it up later.",
    bullets: [
      'Family tab → Schedule',
      'Tap "+ New window" for school/homework hours',
      'Choose which apps to block',
    ],
  },
  {
    pose: 'meditating',
    eyebrow: 'Step 6 of 7 · Wait for your kids',
    title: 'Now invite your kids',
    body: "Once your child signs up with the family code, their profile shows up in your Family tab automatically. They'll get the same rules you set above — no extra setup needed on your side.",
    bullets: [
      'Kids download Pandu and sign up with the family code',
      "Their profile appears in your Family tab",
      'You\'ll review their first quest claim or assignment from there',
    ],
  },
  {
    pose: 'excited',
    eyebrow: 'Step 7 of 7 · All set',
    title: "You're ready to go",
    body: "That's it — you've got the basics. As your kids start using Pandu, watch their progress on the Activity tab and review pending claims on the Family tab. I'll pop up with hints the first time you visit each screen.",
    ctaLabel: 'Take me to the app',
  },
];

export default function WalkthroughScreen() {
  const insets = useSafeAreaInsets();
  const { reloadProfile, markWalkthroughCompleteLocally } = useFocus();

  const [step, setStep] = useState(0);
  const [finishing, setFinishing] = useState(false);

  const advance = () => {
    Haptics.selectionAsync().catch(() => {});
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else finish();
  };

  const back = () => {
    Haptics.selectionAsync().catch(() => {});
    setStep((s) => Math.max(0, s - 1));
  };

  const skip = async () => {
    Haptics.selectionAsync().catch(() => {});
    await finish();
  };

  const finish = async () => {
    if (finishing) return;
    setFinishing(true);
    const { error } = await supabase.rpc('mark_walkthrough_complete');
    if (error) {
      // Surface but don't block — worst case the user sees the walkthrough
      // again on next launch.
      console.warn('[Pandu] mark_walkthrough_complete failed:', error.message);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    // Synchronously stamp the local profile so AuthGate doesn't see stale
    // null and bounce us back; reloadProfile then catches up with the
    // server's authoritative timestamp on the next fetch.
    markWalkthroughCompleteLocally();
    reloadProfile();
    router.replace('/');
  };

  const current = STEPS[step];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        {step > 0 ? (
          <Pressable onPress={back} hitSlop={8} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
          </Pressable>
        ) : (
          <View style={styles.iconBtn} />
        )}
        <ProgressBar value={(step + 1) / STEPS.length} />
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.headerWrap}>
          <Mascot pose={current.pose} size={140} />
          <Text style={styles.eyebrow}>{current.eyebrow}</Text>
          <Text style={styles.title}>{current.title}</Text>
          <Text style={styles.body}>{current.body}</Text>
        </View>

        {current.bullets && current.bullets.length > 0 && (
          <View style={styles.bulletWrap}>
            {current.bullets.map((b, i) => (
              <View key={i} style={styles.bulletRow}>
                <View style={styles.bulletDotWrap}>
                  <Ionicons name="checkmark" size={12} color={colors.accent} />
                </View>
                <Text style={styles.bulletText}>{b}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          onPress={advance}
          disabled={finishing}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }]}>
          {finishing ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={styles.ctaText}>{current.ctaLabel ?? 'Continue'}</Text>
          )}
        </Pressable>
        {step < STEPS.length - 1 && (
          <Pressable onPress={skip} hitSlop={6} style={styles.skipLink}>
            <Text style={styles.skipText}>Skip walkthrough</Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

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

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 14,
    gap: 12,
  },
  iconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
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
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 12,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    fontFamily: fonts.serifBold,
    letterSpacing: -0.6,
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 320,
  },
  body: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
    textAlign: 'center',
    maxWidth: 340,
  },

  bulletWrap: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: space.lg,
    gap: 12,
    ...shadowSm,
  },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bulletDotWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accentSoft,
    borderWidth: 0.5,
    borderColor: colors.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulletText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.medium,
  },

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
  ctaText: { color: colors.textInverse, fontSize: 14, fontFamily: fonts.bold, letterSpacing: 0.3 },
  skipLink: { alignItems: 'center', marginTop: 12, padding: 6 },
  skipText: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.medium },
});
