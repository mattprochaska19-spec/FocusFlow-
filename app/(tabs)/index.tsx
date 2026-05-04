import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AssignmentsSection } from '@/components/assignments-section';
import { BlockModal } from '@/components/block-modal';
import { FocusSessionCard } from '@/components/focus-session-card';
import { decideAccess, type AccessDecision } from '@/lib/access';
import { checkVideoCached } from '@/lib/cache';
import { useFocus, type AppId } from '@/lib/focus-context';
import { colors, fonts, radius, shadowSm, space, tabularNumbers } from '@/lib/theme';
import { extractVideoId, type FilterResult } from '@/lib/youtube-filter';

const BRAND = {
  tiktok:    { color: '#000000', icon: 'tiktok' as const },
  instagram: { color: '#E1306C', icon: 'instagram' as const },
  facebook:  { color: '#1877F2', icon: 'facebook-f' as const },
  twitter:   { color: '#1DA1F2', icon: 'twitter' as const },
};

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { state, setFocusMode, effectiveDailyLimitMinutes } = useFocus();

  const focusOn = state.focusModeEnabled;
  const limitedActiveCount = focusOn ? state.limitedApps.filter((a) => a.enabled).length : 0;
  const eduMins = Math.floor(state.today.educationalSeconds / 60);
  const entMins = Math.floor(state.today.entertainmentSeconds / 60);
  const limit = effectiveDailyLimitMinutes;
  const pct = limit > 0 ? Math.min(100, (entMins / limit) * 100) : 0;
  const remaining = Math.max(0, limit - entMins);
  const overLimit = focusOn && entMins >= limit;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.lg, paddingBottom: 48 }]}
      keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <View style={styles.logoMark}>
          <Text style={styles.logoChar}>F</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.brand}>FocusFlow</Text>
          <Text style={styles.brandSub}>Less scroll. More learn.</Text>
        </View>
        <View style={[styles.statusDot, focusOn && styles.statusDotOn]} />
      </View>

      {/* Hero stat: today's entertainment usage */}
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>Entertainment Today</Text>
        <View style={styles.heroNumRow}>
          <Text style={[styles.heroNum, overLimit && styles.heroNumDanger]}>{entMins}</Text>
          <Text style={styles.heroNumUnit}>min</Text>
        </View>
        <Text style={styles.heroSub}>
          {overLimit ? 'Daily limit reached' : `${remaining} left of ${limit} today`}
        </Text>

        <View style={styles.heroBarTrack}>
          <View
            style={[
              styles.heroBarFill,
              { width: `${pct}%` },
              overLimit && styles.heroBarFillDanger,
            ]}
          />
        </View>

        <View style={styles.heroFooter}>
          <View style={styles.heroFooterStat}>
            <Text style={styles.heroFooterValue}>{eduMins}m</Text>
            <Text style={styles.heroFooterLabel}>Educational</Text>
          </View>
          <View style={styles.heroFooterDivider} />
          <View style={styles.heroFooterStat}>
            <Text style={styles.heroFooterValue}>{state.today.videoCount}</Text>
            <Text style={styles.heroFooterLabel}>Videos</Text>
          </View>
          <View style={styles.heroFooterDivider} />
          <View style={styles.heroFooterStat}>
            <View style={styles.toggleRow}>
              <Switch
                value={focusOn}
                onValueChange={(v) => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setFocusMode(v);
                }}
                trackColor={{ false: colors.surfaceAlt, true: colors.accent }}
                thumbColor={colors.textPrimary}
                ios_backgroundColor={colors.surfaceAlt}
                style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
              />
            </View>
            <Text style={styles.heroFooterLabel}>Focus {focusOn ? 'on' : 'off'}</Text>
          </View>
        </View>
      </View>

      <FocusSessionCard />

      <Text style={styles.sectionLabel}>Limited Apps</Text>
      <View style={styles.list}>
        {state.limitedApps.map((app, i) => {
          const isLimited = focusOn && app.enabled;
          return (
            <View key={app.id}>
              <AppRow id={app.id} name={app.name} limitMinutes={app.dailyLimitMinutes} isLimited={isLimited} />
              {i < state.limitedApps.length - 1 && <View style={styles.hairline} />}
            </View>
          );
        })}
        <View style={styles.hairline} />
        <View style={styles.row}>
          <View style={[styles.iconWrap, { backgroundColor: colors.dangerSoft }]}>
            <FontAwesome5 name="youtube" size={14} color="#FF4D4D" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowName}>YouTube</Text>
            <Text style={styles.rowMetaAccent}>Educational only · Unlimited</Text>
          </View>
          <View style={styles.dotPill}>
            <View style={styles.greenDot} />
            <Text style={styles.dotPillText}>Allowed</Text>
          </View>
        </View>
      </View>

      <AssignmentsSection />

      <FilterTester />
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

function AppRow({
  id,
  name,
  limitMinutes,
  isLimited,
}: {
  id: AppId;
  name: string;
  limitMinutes: number;
  isLimited: boolean;
}) {
  const brand = BRAND[id];
  return (
    <View style={styles.row}>
      <View style={[styles.iconWrap, { backgroundColor: isLimited ? brand.color : colors.surfaceMuted }]}>
        <FontAwesome5 name={brand.icon} size={14} color={isLimited ? '#FFF' : colors.textMuted} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowName, !isLimited && styles.rowNameOff]}>{name}</Text>
        <Text style={styles.rowMeta}>{isLimited ? `${limitMinutes} min / day` : 'Unrestricted'}</Text>
      </View>
      <Text style={[styles.statusText, isLimited ? styles.statusTextLimited : styles.statusTextOff]}>
        {isLimited ? 'Limited' : 'Off'}
      </Text>
    </View>
  );
}

function FilterTester() {
  const { state, recordWatch, addOverride, completedAssignmentsToday, activeFocusSession, scheduleBlocks } = useFocus();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FilterResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [recordedSec, setRecordedSec] = useState(0);
  const [blocked, setBlocked] = useState<AccessDecision | null>(null);

  useEffect(() => { setRecordedSec(0); }, [result]);

  const run = async () => {
    setParseError(null);
    setResult(null);
    const id = extractVideoId(input);
    if (!id) {
      setParseError('Paste a YouTube URL or 11-char ID.');
      return;
    }
    setLoading(true);
    const r = await checkVideoCached(id, {
      apiKey: state.apiKey,
      educationalChannels: state.educationalChannels,
      educationalKeywords: state.educationalKeywords,
      entertainmentKeywords: state.entertainmentKeywords,
    });
    setLoading(false);
    setResult(r);
  };

  const markWatched = async () => {
    if (!result || !result.ok) return;
    const { video, classification } = result;
    const decision = await decideAccess(video.id, state, completedAssignmentsToday, {
      active: !!activeFocusSession,
      remainingSeconds: activeFocusSession
        ? Math.max(0, Math.floor((activeFocusSession.endsAt - Date.now()) / 1000))
        : 0,
      anchorTitle: activeFocusSession?.anchorTitle ?? undefined,
    }, scheduleBlocks);
    if (!decision.allowed) {
      setBlocked(decision);
      return;
    }
    recordWatch({
      seconds: 60,
      isEducational: classification.isEducational,
      videoId: video.id,
      channelId: video.channelId,
      channelTitle: video.channelTitle,
      categoryId: video.categoryId,
    });
    setRecordedSec((s) => s + 60);
  };

  const showOverrideOnBlock = state.allowOverride && blocked?.reason === 'daily_limit';

  return (
    <>
      <Text style={styles.sectionLabel}>Test Filter</Text>
      <View style={styles.testCard}>
        <TextInput
          value={input}
          onChangeText={(v) => { setInput(v); setParseError(null); }}
          placeholder="Paste a YouTube URL"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={run}
          style={styles.testInput}
        />
        <Pressable
          onPress={run}
          disabled={loading || !input.trim()}
          style={({ pressed }) => [
            styles.testBtn,
            (loading || !input.trim()) && styles.testBtnDisabled,
            pressed && { opacity: 0.9 },
          ]}>
          {loading ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.testBtnText}>Check</Text>}
        </Pressable>

        {parseError && <Text style={styles.errorText}>{parseError}</Text>}
        {result && <ResultCard result={result} />}

        {result?.ok && (
          <View style={styles.actionsRow}>
            <Pressable
              onPress={() => router.push({ pathname: '/player', params: { videoId: result.video.id } })}
              style={({ pressed }) => [styles.watchBtn, pressed && { opacity: 0.9 }]}>
              <Ionicons name="play" size={12} color={colors.textInverse} style={{ marginRight: 4 }} />
              <Text style={styles.watchBtnText}>Watch in app</Text>
            </Pressable>
            <Pressable
              onPress={markWatched}
              style={({ pressed }) => [styles.recordBtn, pressed && { opacity: 0.85 }]}>
              <Text style={styles.recordBtnText}>
                {recordedSec === 0 ? '+1m' : `+1m (${Math.floor(recordedSec / 60)}m)`}
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      <BlockModal
        decision={blocked}
        onClose={() => setBlocked(null)}
        showOverride={showOverrideOnBlock}
        onAddOverride={() => {
          addOverride(15);
          setBlocked(null);
        }}
      />
    </>
  );
}

function ResultCard({ result }: { result: FilterResult }) {
  if (!result.ok) {
    const msg =
      result.reason === 'missing_api_key'
        ? 'No API key configured. Add one in Settings.'
        : result.reason === 'not_found'
          ? 'Video not found.'
          : `Fetch failed: ${result.error ?? 'unknown error'}`;
    return (
      <View style={styles.resultErr}>
        <Text style={styles.resultErrText}>{msg}</Text>
      </View>
    );
  }

  const { video, classification } = result;
  const edu = classification.isEducational;
  const reasonLabel = ({
    whitelisted_channel: 'Channel whitelisted by you',
    category: `Category ${classification.categoryId} (educational)`,
    keywords: `Keyword scoring (edu ${classification.eduHits} vs ent ${classification.entHits})`,
    entertainment: 'No educational signals matched',
  } as const)[classification.reason];

  return (
    <View style={[styles.resultCard, edu ? styles.resultEdu : styles.resultEnt]}>
      <View style={[styles.resultPill, edu ? styles.resultPillEdu : styles.resultPillEnt]}>
        <Text style={[styles.resultPillText, edu ? styles.resultPillTextEdu : styles.resultPillTextEnt]}>
          {edu ? 'Educational' : 'Entertainment'}
        </Text>
      </View>
      <Text style={styles.resultTitle} numberOfLines={2}>{video.title}</Text>
      <Text style={styles.resultChannel}>{video.channelTitle}</Text>
      <Text style={styles.resultReason}>{reasonLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 24 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 36 },
  logoMark: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoChar: { color: colors.textInverse, fontSize: 18, fontFamily: fonts.serifBlack, letterSpacing: -0.5 },
  brand: { color: colors.textPrimary, fontSize: 22, fontFamily: fonts.serifBold, letterSpacing: -0.6 },
  brandSub: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.medium, marginTop: 2, fontStyle: 'italic' },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textMuted },
  statusDotOn: { backgroundColor: colors.accent },

  // Hero stat block — editorial layout, sits directly on the page
  hero: {
    marginBottom: 40,
    paddingTop: 4,
  },
  heroLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: fonts.bold,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
    marginBottom: 14,
  },
  heroNumRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  heroNum: {
    color: colors.textPrimary,
    fontSize: 96,
    fontFamily: fonts.serifBlack,
    letterSpacing: -4,
    lineHeight: 96,
    ...tabularNumbers,
  },
  heroNumDanger: { color: colors.danger },
  heroNumUnit: {
    color: colors.textMuted,
    fontSize: 20,
    fontFamily: fonts.serifSemibold,
    letterSpacing: -0.3,
    fontStyle: 'italic',
  },
  heroSub: { color: colors.textSecondary, fontSize: 13, fontFamily: fonts.medium, marginTop: 10, marginBottom: 26 },

  heroBarTrack: {
    height: 3,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 22,
  },
  heroBarFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 999 },
  heroBarFillDanger: { backgroundColor: colors.danger },

  heroFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 18,
    borderTopWidth: 0.5,
    borderTopColor: colors.hairline,
  },
  heroFooterStat: { flex: 1, alignItems: 'flex-start' },
  heroFooterValue: {
    color: colors.textPrimary,
    fontSize: 22,
    fontFamily: fonts.serifSemibold,
    letterSpacing: -0.4,
    ...tabularNumbers,
  },
  heroFooterLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontFamily: fonts.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 4,
  },
  heroFooterDivider: { width: 0.5, height: 32, backgroundColor: colors.hairline, marginHorizontal: 4 },
  toggleRow: { alignItems: 'flex-start', marginLeft: -6, marginBottom: 2 },

  sectionLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontFamily: fonts.bold,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
    marginBottom: 14,
    marginLeft: 2,
  },

  // List with hairline-separated rows (replaces card-per-app)
  list: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.hairline,
    paddingHorizontal: 14,
    marginBottom: 24,
    ...shadowSm,
  },
  hairline: { height: 0.5, backgroundColor: colors.hairline },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowName: { color: colors.textPrimary, fontSize: 14, fontFamily: fonts.semibold, letterSpacing: -0.2 },
  rowNameOff: { color: colors.textMuted },
  rowMeta: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.medium, marginTop: 2 },
  rowMetaAccent: { color: colors.accent, fontSize: 11, fontFamily: fonts.medium, marginTop: 2 },
  statusText: { fontSize: 10, fontFamily: fonts.bold, letterSpacing: 0.6, textTransform: 'uppercase' },
  statusTextLimited: { color: colors.textSecondary },
  statusTextOff: { color: colors.textMuted },

  dotPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
  },
  greenDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.accent },
  dotPillText: { color: colors.accent, fontSize: 10, fontFamily: fonts.bold, letterSpacing: 0.5, textTransform: 'uppercase' },

  // Test Filter card
  testCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 24,
    borderWidth: 0.5,
    borderColor: colors.hairline,
    ...shadowSm,
  },
  testInput: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 0.5,
    borderColor: colors.hairline,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: colors.textPrimary,
    fontSize: 14,
    fontFamily: fonts.medium,
    marginBottom: 8,
  },
  testBtn: {
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: 'center',
  },
  testBtnDisabled: { backgroundColor: colors.neutral },
  testBtnText: { color: colors.textInverse, fontFamily: fonts.bold, fontSize: 13, letterSpacing: 0.3 },
  errorText: { color: colors.danger, fontSize: 12, fontFamily: fonts.medium, marginTop: 8 },

  resultCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 0.5,
  },
  resultEdu: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  resultEnt: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerBorder },
  resultErr: {
    marginTop: 8,
    padding: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 0.5,
    borderColor: colors.hairline,
  },
  resultErrText: { color: colors.textSecondary, fontSize: 13 },

  resultPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    marginBottom: 10,
  },
  resultPillEdu: { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.accentBorder },
  resultPillEnt: { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.dangerBorder },
  resultPillText: { fontSize: 10, fontFamily: fonts.bold, letterSpacing: 0.6, textTransform: 'uppercase' },
  resultPillTextEdu: { color: colors.accent },
  resultPillTextEnt: { color: colors.danger },

  resultTitle: { color: colors.textPrimary, fontSize: 14, fontFamily: fonts.semibold, marginBottom: 4, lineHeight: 19, letterSpacing: -0.2 },
  resultChannel: { color: colors.textSecondary, fontSize: 12, fontFamily: fonts.medium, marginBottom: 6 },
  resultReason: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.regular, fontStyle: 'italic' },

  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  watchBtn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 10,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  watchBtnText: { color: colors.textInverse, fontSize: 13, fontFamily: fonts.bold, letterSpacing: 0.3 },
  recordBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 0.5,
    borderColor: colors.hairline,
  },
  recordBtnText: { color: colors.textSecondary, fontSize: 12, fontFamily: fonts.semibold },
});
