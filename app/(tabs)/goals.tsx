import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Mascot } from '@/components/mascot';
import { SpeechBubble } from '@/components/speech-bubble';
import { useAuth } from '@/lib/auth-context';
import { useFocus, type ParentQuest, type QuestClaim } from '@/lib/focus-context';
import { colors, fonts, radius, shadowSm, space } from '@/lib/theme';

export default function GoalsScreen() {
  const insets = useSafeAreaInsets();
  const { quests, questClaims, claimQuest } = useFocus();
  const { session } = useAuth();

  // Latest claim per quest, for status pill rendering. Sorted by claimedAt desc
  // already so first hit wins.
  const latestClaimByQuest = useMemo(() => {
    const map = new Map<string, QuestClaim>();
    if (!session) return map;
    for (const c of questClaims) {
      if (c.childUserId !== session.user.id) continue;
      if (!map.has(c.questId)) map.set(c.questId, c);
    }
    return map;
  }, [questClaims, session?.user.id]);

  const goals = quests.filter((q) => q.kind === 'goal');
  const extraWork = quests.filter((q) => q.kind === 'extra_work');

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.lg, paddingBottom: 48 }]}>
      <Text style={styles.pageTitle}>Goals</Text>
      <Text style={styles.pageSub}>Earn extra screen time by hitting your goals.</Text>

      <View style={styles.mascotHero}>
        <Mascot pose="encouraging" size={180} />
        <SpeechBubble
          text="Crush your goals to earn bonus screen time!"
          tail="none"
          style={styles.mascotBubble}
        />
      </View>

      <Section title="Bonus Goals" empty="No goals yet — your parent can add some.">
        {goals.map((q) => (
          <QuestCard
            key={q.id}
            quest={q}
            claim={latestClaimByQuest.get(q.id) ?? null}
            onClaim={() => claimQuest(q.id)}
          />
        ))}
      </Section>

      <Section title="Extra Work" empty="No extra work right now. Optional tasks your parent adds will show up here.">
        {extraWork.map((q) => (
          <QuestCard
            key={q.id}
            quest={q}
            claim={latestClaimByQuest.get(q.id) ?? null}
            onClaim={() => claimQuest(q.id)}
          />
        ))}
      </Section>
    </ScrollView>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const arr = Array.isArray(children) ? children : [children];
  const hasContent = arr.some((c) => c);
  return (
    <View style={{ marginBottom: 28 }}>
      <Text style={styles.sectionLabel}>{title}</Text>
      {hasContent ? (
        <View style={{ gap: 8 }}>{children}</View>
      ) : (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Ionicons name="trophy-outline" size={20} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyText}>{empty}</Text>
        </View>
      )}
    </View>
  );
}

function QuestCard({
  quest,
  claim,
  onClaim,
}: {
  quest: ParentQuest;
  claim: QuestClaim | null;
  onClaim: () => Promise<{ id?: string; error?: string }>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClaim = async () => {
    setBusy(true);
    setError(null);
    const r = await onClaim();
    setBusy(false);
    if (r.error) setError(r.error);
  };

  // Render-state machine: completed (latest) > pending > rejected > available.
  // Repeatable quests can be re-claimed after completion or rejection.
  const lastStatus = claim?.status;
  const canClaimAgain =
    !claim ||
    lastStatus === 'rejected' ||
    (quest.repeatable && lastStatus === 'completed');

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={2}>{quest.title}</Text>
        <View style={styles.rewardPill}>
          <Ionicons name="add" size={11} color={colors.accent} />
          <Text style={styles.rewardText}>{quest.rewardMinutes}m</Text>
        </View>
      </View>
      {quest.description && (
        <Text style={styles.cardDesc}>{quest.description}</Text>
      )}
      <View style={styles.cardMetaRow}>
        <Text style={styles.cardMeta}>{quest.repeatable ? 'Repeatable' : 'One-time'}</Text>
        {claim && (
          <>
            <Text style={styles.cardMetaDot}>·</Text>
            <StatusPill status={claim.status} />
          </>
        )}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {canClaimAgain ? (
        <Pressable
          onPress={handleClaim}
          disabled={busy}
          style={({ pressed }) => [styles.claimBtn, pressed && { opacity: 0.85 }]}>
          {busy
            ? <ActivityIndicator color={colors.textInverse} size="small" />
            : <Text style={styles.claimText}>{claim ? "Claim again" : "I'm done — claim"}</Text>}
        </Pressable>
      ) : null}
    </View>
  );
}

function StatusPill({ status }: { status: QuestClaim['status'] }) {
  if (status === 'pending_review') {
    return (
      <View style={[styles.statusPill, styles.statusPending]}>
        <Text style={styles.statusPendingText}>Awaiting review</Text>
      </View>
    );
  }
  if (status === 'completed') {
    return (
      <View style={[styles.statusPill, styles.statusDone]}>
        <Ionicons name="checkmark" size={11} color={colors.accent} />
        <Text style={styles.statusDoneText}>Approved</Text>
      </View>
    );
  }
  return (
    <View style={[styles.statusPill, styles.statusRejected]}>
      <Text style={styles.statusRejectedText}>Rejected</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 24 },
  pageTitle: {
    color: colors.textPrimary,
    fontSize: 30,
    fontFamily: fonts.serifBold,
    letterSpacing: -0.8,
    marginBottom: 4,
  },
  pageSub: {
    color: colors.textMuted,
    fontSize: 13,
    fontFamily: fonts.medium,
    marginBottom: 20,
  },
  mascotHero: { alignItems: 'center', marginTop: 4, marginBottom: 28 },
  mascotBubble: { marginTop: -6, maxWidth: 320 },

  sectionLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontFamily: fonts.bold,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
    marginBottom: 12,
    marginLeft: 2,
  },

  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.hairline,
    padding: 18,
    alignItems: 'center',
    ...shadowSm,
  },
  emptyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyText: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.medium, textAlign: 'center', lineHeight: 17 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.hairline,
    padding: 14,
    ...shadowSm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, color: colors.textPrimary, fontSize: 15, fontFamily: fonts.semibold, letterSpacing: -0.2 },
  cardDesc: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 6 },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  cardMeta: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.medium },
  cardMetaDot: { color: colors.textMuted, fontSize: 11, marginHorizontal: 6 },

  rewardPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    borderWidth: 0.5,
    borderColor: colors.accentBorder,
  },
  rewardText: { color: colors.accent, fontSize: 12, fontFamily: fonts.bold, letterSpacing: 0.2 },

  claimBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 11,
    borderRadius: radius.pill,
    alignItems: 'center',
    marginTop: 12,
  },
  claimText: { color: colors.textInverse, fontSize: 13, fontFamily: fonts.bold, letterSpacing: 0.3 },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 0.5,
  },
  statusPending: { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle },
  statusPendingText: { color: colors.textSecondary, fontSize: 10, fontFamily: fonts.bold },
  statusDone: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  statusDoneText: { color: colors.accent, fontSize: 10, fontFamily: fonts.bold },
  statusRejected: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerBorder },
  statusRejectedText: { color: colors.danger, fontSize: 10, fontFamily: fonts.bold },

  error: { color: colors.danger, fontSize: 12, marginTop: 8 },
});
