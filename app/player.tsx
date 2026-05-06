import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import YoutubePlayer from 'react-native-youtube-iframe';

import { BlockModal } from '@/components/block-modal';
import { decideAccess, type AccessDecision } from '@/lib/access';
import { useFocus } from '@/lib/focus-context';
import { colors, radius, shadowSm, space } from '@/lib/theme';

const HEARTBEAT_SECONDS = 30;

export default function PlayerScreen() {
  const insets = useSafeAreaInsets();
  const { videoId } = useLocalSearchParams<{ videoId: string }>();
  const {
    state,
    recordWatch,
    addOverride,
    completedAssignmentsToday,
    activeFocusSession,
    scheduleBlocks,
    effectiveLockUntilAssignmentsComplete,
    effectiveAssignmentLockThreshold,
  } = useFocus();
  const lockOverride = {
    enabled: effectiveLockUntilAssignmentsComplete,
    threshold: effectiveAssignmentLockThreshold,
  };

  const [decision, setDecision] = useState<AccessDecision | null>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState<AccessDecision | null>(null);

  // Refs let the heartbeat read live values without re-creating the interval.
  const playingRef = useRef(false);
  const stateRef = useRef(state);
  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { stateRef.current = state; }, [state]);

  // Initial access check: decide allow/block before showing the iframe at all.
  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    setLoading(true);
    decideAccess(
      videoId,
      stateRef.current,
      completedAssignmentsToday,
      {
        active: !!activeFocusSession,
        remainingSeconds: activeFocusSession
          ? Math.max(0, Math.floor((activeFocusSession.endsAt - Date.now()) / 1000))
          : 0,
        anchorTitle: activeFocusSession?.anchorTitle ?? undefined,
      },
      scheduleBlocks,
      lockOverride,
    ).then((d) => {
      if (cancelled) return;
      setDecision(d);
      setLoading(false);
      if (!d.allowed) {
        setBlocked(d);
      } else {
        setPlaying(true);
      }
    });
    return () => { cancelled = true; };
  }, [videoId, completedAssignmentsToday]);

  // 30-second heartbeat: record watch time and re-check access mid-video.
  // If a limit is hit and "Finish current video" is OFF, pause and show the block screen.
  useEffect(() => {
    if (!decision?.allowed || !decision.video || !decision.classification) return;
    const video = decision.video;
    const isEducational = decision.classification.isEducational;

    const id = setInterval(async () => {
      if (!playingRef.current) return;
      recordWatch({
        seconds: HEARTBEAT_SECONDS,
        isEducational,
        videoId: video.id,
        channelId: video.channelId,
        channelTitle: video.channelTitle,
        categoryId: video.categoryId,
      });
      const next = await decideAccess(
        video.id,
        stateRef.current,
        completedAssignmentsToday,
        {
          active: !!activeFocusSession,
          remainingSeconds: activeFocusSession
            ? Math.max(0, Math.floor((activeFocusSession.endsAt - Date.now()) / 1000))
            : 0,
          anchorTitle: activeFocusSession?.anchorTitle ?? undefined,
        },
        scheduleBlocks,
        lockOverride,
      );
      if (!next.allowed && !stateRef.current.allowFinishCurrentVideo) {
        setPlaying(false);
        setBlocked(next);
      }
    }, HEARTBEAT_SECONDS * 1000);

    return () => clearInterval(id);
  }, [decision, recordWatch]);

  const screenWidth = Dimensions.get('window').width;
  const playerHeight = Math.floor(screenWidth * 9 / 16);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Player</Text>
        <View style={{ width: 32 }} />
      </View>

      {loading && (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>Checking access…</Text>
        </View>
      )}

      {!loading && decision?.allowed && decision.video && (
        <>
          <View style={styles.playerFrame}>
            <YoutubePlayer
              height={playerHeight}
              width={screenWidth}
              play={playing}
              videoId={videoId as string}
              onChangeState={(s) => {
                if (s === 'playing') setPlaying(true);
                else if (s === 'paused' || s === 'ended') setPlaying(false);
              }}
              onError={(err) => console.warn('YouTube player error', err)}
              webViewProps={{ allowsInlineMediaPlayback: true }}
            />
          </View>

          <View style={styles.meta}>
            <Text style={styles.title} numberOfLines={3}>{decision.video.title}</Text>
            <Text style={styles.channel}>{decision.video.channelTitle}</Text>

            <View style={styles.badgeRow}>
              {decision.classification?.isEducational ? (
                <View style={[styles.badge, styles.badgeEdu]}>
                  <View style={styles.dot} />
                  <Text style={styles.badgeEduText}>Educational</Text>
                </View>
              ) : (
                <View style={[styles.badge, styles.badgeEnt]}>
                  <Text style={styles.badgeEntText}>Entertainment</Text>
                </View>
              )}

              {decision.reason === 'creator_allowance' && decision.details && (
                <View style={[styles.badge, styles.badgeNeutral]}>
                  <Text style={styles.badgeNeutralText}>
                    {decision.details.creatorVideosUsed} / {decision.details.creatorAllowanceVideos} today
                  </Text>
                </View>
              )}
            </View>
          </View>
        </>
      )}

      <BlockModal
        decision={blocked}
        onClose={() => {
          setBlocked(null);
          router.back();
        }}
        showOverride={state.allowOverride && blocked?.reason === 'daily_limit'}
        onAddOverride={() => {
          addOverride(15);
          setBlocked(null);
          setPlaying(true);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.surface,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: colors.textSecondary, fontSize: 13 },

  playerFrame: {
    backgroundColor: '#000',
  },

  meta: {
    padding: 20,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    ...shadowSm,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: 23,
    marginBottom: 6,
  },
  channel: { color: colors.textSecondary, fontSize: 13, marginBottom: 14 },

  badgeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  badgeEdu: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  badgeEduText: { color: colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  badgeEnt: { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle },
  badgeEntText: { color: colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  badgeNeutral: { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle },
  badgeNeutralText: { color: colors.textSecondary, fontSize: 11, fontWeight: '600', letterSpacing: 0.2 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
});
