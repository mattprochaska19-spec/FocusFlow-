import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { decideAccess, type AccessDecision } from '@/lib/access';
import { checkVideoCached } from '@/lib/cache';
import { useFocus, type AppId } from '@/lib/focus-context';
import { colors, radius, shadow, shadowSm, space } from '@/lib/theme';
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
  const entOver = focusOn && entMins >= effectiveDailyLimitMinutes;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.lg, paddingBottom: 40 }]}
      keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <View style={styles.logoMark}>
          <Text style={styles.logoChar}>F</Text>
        </View>
        <View>
          <Text style={styles.brand}>FocusFlow</Text>
          <Text style={styles.brandSub}>Less scroll. More learn.</Text>
        </View>
      </View>

      <View style={[styles.hero, focusOn && styles.heroOn]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroLabel}>FOCUS MODE</Text>
          <Text style={styles.heroStatus}>
            {focusOn ? 'On' : 'Off'}
          </Text>
          <Text style={styles.heroSub}>
            {focusOn
              ? `${limitedActiveCount} ${limitedActiveCount === 1 ? 'app' : 'apps'} limited today`
              : 'All apps unrestricted'}
          </Text>
        </View>
        <Switch
          value={focusOn}
          onValueChange={setFocusMode}
          trackColor={{ false: '#D9D3C7', true: colors.accent }}
          thumbColor={colors.surface}
          ios_backgroundColor="#D9D3C7"
          style={{ transform: [{ scaleX: 1.15 }, { scaleY: 1.15 }] }}
        />
      </View>

      <Text style={styles.sectionLabel}>Currently Limited</Text>
      <View style={styles.card}>
        {state.limitedApps.map((app, i) => {
          const isLimited = focusOn && app.enabled;
          return (
            <View key={app.id}>
              <AppRow id={app.id} name={app.name} limitMinutes={app.dailyLimitMinutes} isLimited={isLimited} />
              {i < state.limitedApps.length - 1 && <View style={styles.divider} />}
            </View>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>YouTube</Text>
      <View style={[styles.card, styles.cardAccent]}>
        <View style={styles.row}>
          <View style={[styles.iconWrap, { backgroundColor: '#FFE5E5' }]}>
            <FontAwesome5 name="youtube" size={16} color="#FF0000" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.appName}>YouTube</Text>
            <Text style={styles.eduTagline}>Educational only · Unlimited</Text>
          </View>
          <View style={styles.badgeOn}>
            <View style={styles.badgeDot} />
            <Text style={styles.badgeOnText}>Allowed</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.statsRow}>
          <View style={styles.statBlock}>
            <Text style={[styles.statValue, styles.statValueEdu]}>{eduMins}m</Text>
            <Text style={styles.statLabel}>Educational</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBlock}>
            <Text style={[styles.statValue, entOver && styles.statValueDanger]}>
              {entMins}<Text style={styles.statValueSuffix}> / {effectiveDailyLimitMinutes}m</Text>
            </Text>
            <Text style={styles.statLabel}>Entertainment</Text>
          </View>
        </View>
      </View>

      <AssignmentsSection />

      <FilterTester />
    </ScrollView>
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
      <View style={[styles.iconWrap, { backgroundColor: isLimited ? brand.color : colors.neutral }]}>
        <FontAwesome5 name={brand.icon} size={16} color={isLimited ? '#FFF' : colors.textMuted} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.appName, !isLimited && styles.appNameOff]}>{name}</Text>
        <Text style={styles.appSub}>{isLimited ? `${limitMinutes} min / day` : 'Unrestricted'}</Text>
      </View>
      <View style={isLimited ? styles.badgeMuted : styles.badgeOff}>
        <Text style={isLimited ? styles.badgeMutedText : styles.badgeOffText}>
          {isLimited ? 'Limited' : 'Off'}
        </Text>
      </View>
    </View>
  );
}

function FilterTester() {
  const { state, recordWatch, addOverride, completedAssignmentsToday } = useFocus();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FilterResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [recordedSec, setRecordedSec] = useState(0);
  const [blocked, setBlocked] = useState<AccessDecision | null>(null);

  // Reset the watched counter whenever a new test runs
  useEffect(() => { setRecordedSec(0); }, [result]);

  const run = async () => {
    setParseError(null);
    setResult(null);
    const id = extractVideoId(input);
    if (!id) {
      setParseError('Could not extract a video ID. Paste a YouTube URL or 11-char ID.');
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

    const decision = await decideAccess(video.id, state, completedAssignmentsToday);
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
      <View style={styles.card}>
        <Text style={styles.testHint}>Paste a YouTube URL or video ID to see how the filter classifies it.</Text>
        <TextInput
          value={input}
          onChangeText={(v) => { setInput(v); setParseError(null); }}
          placeholder="https://youtube.com/watch?v=..."
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
          {loading ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.testBtnText}>Check Video</Text>}
        </Pressable>

        {parseError && <Text style={styles.errorText}>{parseError}</Text>}
        {result && <ResultCard result={result} />}

        {result?.ok && (
          <View style={styles.actionsRow}>
            <Pressable
              onPress={() => router.push({ pathname: '/player', params: { videoId: result.video.id } })}
              style={({ pressed }) => [styles.watchBtn, pressed && { opacity: 0.9 }]}>
              <Ionicons name="play" size={14} color={colors.textInverse} style={{ marginRight: 4 }} />
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
  content: { paddingHorizontal: space.xl + space.xs }, // 24

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: space.xxl },
  logoMark: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowSm,
  },
  logoChar: { color: colors.textInverse, fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  brand: { color: colors.textPrimary, fontSize: 19, fontWeight: '700', letterSpacing: -0.4 },
  brandSub: { color: colors.textMuted, fontSize: 12, marginTop: 1 },

  hero: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 22,
    paddingVertical: 24,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.xxl,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadow,
  },
  heroOn: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBorder,
  },
  heroLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    marginBottom: 6,
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  heroStatus: { fontSize: 32, fontWeight: '800', letterSpacing: -1, color: colors.textPrimary, lineHeight: 36 },
  heroSub: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },

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
  cardAccent: {
    borderColor: colors.accentBorder,
  },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: { color: colors.textPrimary, fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },
  appNameOff: { color: colors.textMuted },
  appSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  eduTagline: { color: colors.accent, fontSize: 12, marginTop: 2, fontWeight: '500' },

  divider: { height: 1, backgroundColor: colors.divider, marginVertical: 6 },

  badgeOn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  badgeOnText: { color: colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  badgeMuted: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.neutral,
    borderWidth: 1,
    borderColor: colors.neutralBorder,
  },
  badgeMutedText: { color: colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  badgeOff: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  badgeOffText: { color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },

  statsRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
  statBlock: { flex: 1, alignItems: 'center', gap: 4 },
  statDivider: { width: 1, height: 32, backgroundColor: colors.divider },
  statValue: { color: colors.textPrimary, fontSize: 22, fontWeight: '700', letterSpacing: -0.5 },
  statValueSuffix: { color: colors.textMuted, fontSize: 14, fontWeight: '500' },
  statValueEdu: { color: colors.accent },
  statValueDanger: { color: colors.danger },
  statLabel: {
    fontSize: 10,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },

  testHint: { color: colors.textSecondary, fontSize: 12, marginBottom: 12, lineHeight: 17 },
  testInput: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: 14,
    marginBottom: 10,
  },
  testBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 13,
    alignItems: 'center',
  },
  testBtnDisabled: { backgroundColor: colors.neutral },
  testBtnText: { color: colors.textInverse, fontWeight: '700', fontSize: 14, letterSpacing: 0.2 },
  errorText: { color: colors.danger, fontSize: 12, marginTop: 10 },

  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  watchBtn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 11,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  watchBtnText: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  recordBtn: {
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  recordBtnText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  resultCard: {
    marginTop: 14,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  resultEdu: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  resultEnt: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerBorder },
  resultErr: {
    marginTop: 10,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.neutral,
    borderWidth: 1,
    borderColor: colors.neutralBorder,
  },
  resultErrText: { color: colors.textSecondary, fontSize: 13 },

  resultPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginBottom: 12,
  },
  resultPillEdu: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accentBorder },
  resultPillEnt: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.dangerBorder },
  resultPillText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  resultPillTextEdu: { color: colors.accent },
  resultPillTextEnt: { color: colors.danger },

  resultTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '600', marginBottom: 4, lineHeight: 20 },
  resultChannel: { color: colors.textSecondary, fontSize: 13, marginBottom: 8 },
  resultReason: { color: colors.textMuted, fontSize: 12, fontStyle: 'italic' },
});
