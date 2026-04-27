import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { describeDecision, type AccessDecision } from '@/lib/access';
import { colors, radius, shadow, space } from '@/lib/theme';

export function BlockModal({
  decision,
  onClose,
  onAddOverride,
  showOverride = false,
}: {
  decision: AccessDecision | null;
  onClose: () => void;
  onAddOverride?: () => void;
  showOverride?: boolean;
}) {
  if (!decision) return null;
  const desc = describeDecision(decision);

  const isCount = decision.reason === 'creator_count_limit';
  const isDaily = decision.reason === 'daily_limit';
  const isChannel = decision.reason === 'channel_limit';
  const isNotFound = decision.reason === 'not_found';

  return (
    <Modal animationType="fade" transparent visible={!!decision} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons
              name={isNotFound ? 'help-circle' : 'lock-closed'}
              size={26}
              color={colors.danger}
            />
          </View>

          <Text style={styles.headline}>{desc.headline}</Text>
          <Text style={styles.detail}>{desc.detail}</Text>

          {decision.video && (
            <View style={styles.videoCard}>
              <Text style={styles.videoTitle} numberOfLines={2}>{decision.video.title}</Text>
              <Text style={styles.videoChannel}>{decision.video.channelTitle}</Text>
            </View>
          )}

          {isCount && decision.details && (
            <BigStat
              value={`${decision.details.creatorVideosUsed} / ${decision.details.creatorAllowanceVideos}`}
              label={`Videos from ${decision.details.creatorName} today`}
            />
          )}
          {isDaily && decision.details && (
            <BigStat
              value={`${decision.details.entertainmentMinutesUsed}m / ${decision.details.dailyLimitMinutes}m`}
              label="Entertainment time today"
            />
          )}
          {isChannel && decision.details && (
            <BigStat
              value={`${decision.details.channelMinutesUsed}m / ${decision.details.channelLimitMinutes}m`}
              label={`${decision.details.channelLabel} today`}
            />
          )}

          <View style={styles.actions}>
            {showOverride && onAddOverride && (
              <Pressable
                onPress={onAddOverride}
                style={({ pressed }) => [styles.btnSecondary, pressed && { opacity: 0.85 }]}>
                <Text style={styles.btnSecondaryText}>+15 min</Text>
              </Pressable>
            )}
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.btn, pressed && { opacity: 0.9 }]}>
              <Text style={styles.btnText}>Got it</Text>
            </Pressable>
          </View>

          <Text style={styles.footnote}>Resets at midnight.</Text>
        </View>
      </View>
    </Modal>
  );
}

function BigStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.bigStat}>
      <Text style={styles.bigStatValue}>{value}</Text>
      <Text style={styles.bigStatLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 18, 16, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 26,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    ...shadow,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  headline: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 6,
    textAlign: 'center',
  },
  detail: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 16,
  },
  videoCard: {
    width: '100%',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: space.md,
    marginBottom: 16,
  },
  videoTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
    marginBottom: 4,
  },
  videoChannel: {
    color: colors.textSecondary,
    fontSize: 12,
  },

  bigStat: { alignItems: 'center', marginBottom: 18, gap: 4 },
  bigStatValue: {
    color: colors.danger,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  bigStatLabel: {
    color: colors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },

  actions: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
    marginBottom: 12,
  },
  btn: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 13,
    alignItems: 'center',
  },
  btnText: { color: colors.textInverse, fontWeight: '700', fontSize: 14, letterSpacing: 0.2 },
  btnSecondary: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnSecondaryText: { color: colors.textSecondary, fontWeight: '700', fontSize: 13 },

  footnote: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
  },
});
