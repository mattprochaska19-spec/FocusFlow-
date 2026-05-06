import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { QuestEditorModal } from '@/components/quest-editor-modal';
import { useFocus, type ParentQuest, type QuestKind } from '@/lib/focus-context';
import { colors, fonts, radius, space } from '@/lib/theme';

type LinkedChildLite = { user_id: string; displayName: string };

// Per-child quests panel for the parent's Family tab. Lists active goals +
// extra-work tasks scoped to this child, surfaces pending claims at the top
// for review, and provides a + button that opens the create modal.
export function ChildQuestsSection({
  childUserId,
  childName,
  linkedChildren,
}: {
  childUserId: string;
  childName: string;
  linkedChildren: LinkedChildLite[];
}) {
  const { quests, questClaims, approveQuestClaim, rejectQuestClaim, archiveQuest } = useFocus();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorKind, setEditorKind] = useState<QuestKind>('goal');
  const [editingQuest, setEditingQuest] = useState<ParentQuest | null>(null);

  // Filter quests that target this child. Empty target list = applies to all
  // the parent's kids (resolved here so a quest with no targets shows up
  // automatically under every child).
  const visibleQuests = useMemo(
    () =>
      quests.filter(
        (q) => q.targets.length === 0 || q.targets.includes(childUserId),
      ),
    [quests, childUserId],
  );

  const goals = visibleQuests.filter((q) => q.kind === 'goal');
  const extraWork = visibleQuests.filter((q) => q.kind === 'extra_work');

  const pendingClaims = questClaims.filter(
    (c) => c.childUserId === childUserId && c.status === 'pending_review',
  );

  const openCreate = (kind: QuestKind) => {
    setEditingQuest(null);
    setEditorKind(kind);
    setEditorOpen(true);
  };

  const openEdit = (quest: ParentQuest) => {
    setEditingQuest(quest);
    setEditorKind(quest.kind);
    setEditorOpen(true);
  };

  return (
    <View>
      {/* Pending review surface — visible at the top so parents act fast */}
      {pendingClaims.length > 0 && (
        <View style={styles.pendingWrap}>
          <Text style={styles.pendingHeader}>
            {pendingClaims.length} pending review{pendingClaims.length === 1 ? '' : 's'}
          </Text>
          <View style={{ gap: 6 }}>
            {pendingClaims.map((claim) => {
              const quest = quests.find((q) => q.id === claim.questId);
              return (
                <PendingClaimRow
                  key={claim.id}
                  claimId={claim.id}
                  title={quest?.title ?? 'Quest'}
                  minutes={claim.minutesEarned}
                  onApprove={() => approveQuestClaim(claim.id)}
                  onReject={() => rejectQuestClaim(claim.id)}
                />
              );
            })}
          </View>
        </View>
      )}

      <QuestList
        title="Bonus Goals"
        emptyHint={`No goals set for ${childName} yet. Create one to give a target — kid claims when done, you approve.`}
        quests={goals}
        onAdd={() => openCreate('goal')}
        onEdit={openEdit}
        onArchive={(id) => archiveQuest(id)}
      />

      <View style={styles.divider} />

      <QuestList
        title="Extra Work"
        emptyHint={`No extra work for ${childName}. Add things like Khan Academy lessons or SAT study time.`}
        quests={extraWork}
        onAdd={() => openCreate('extra_work')}
        onEdit={openEdit}
        onArchive={(id) => archiveQuest(id)}
      />

      <QuestEditorModal
        visible={editorOpen}
        quest={editingQuest}
        defaultKind={editorKind}
        childUserId={childUserId}
        linkedChildren={linkedChildren}
        onClose={() => setEditorOpen(false)}
      />
    </View>
  );
}

function QuestList({
  title,
  emptyHint,
  quests,
  onAdd,
  onEdit,
  onArchive,
}: {
  title: string;
  emptyHint: string;
  quests: ParentQuest[];
  onAdd: () => void;
  onEdit: (q: ParentQuest) => void;
  onArchive: (id: string) => void;
}) {
  return (
    <View>
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>{title}</Text>
        <Pressable onPress={onAdd} hitSlop={8} style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}>
          <Ionicons name="add" size={16} color={colors.textInverse} />
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>
      {quests.length === 0 ? (
        <Text style={styles.empty}>{emptyHint}</Text>
      ) : (
        <View style={{ gap: 8 }}>
          {quests.map((q) => (
            <QuestRow key={q.id} quest={q} onEdit={() => onEdit(q)} onArchive={() => onArchive(q.id)} />
          ))}
        </View>
      )}
    </View>
  );
}

function QuestRow({
  quest,
  onEdit,
  onArchive,
}: {
  quest: ParentQuest;
  onEdit: () => void;
  onArchive: () => void;
}) {
  return (
    <Pressable onPress={onEdit} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={2}>{quest.title}</Text>
        <Text style={styles.rowMeta}>
          +{quest.rewardMinutes}m{quest.repeatable ? ' · repeatable' : ' · one-time'}
          {quest.targets.length === 0 ? ' · all kids' : ''}
        </Text>
      </View>
      <Pressable onPress={onArchive} hitSlop={8} style={styles.deleteBtn}>
        <Ionicons name="trash-outline" size={14} color={colors.danger} />
      </Pressable>
    </Pressable>
  );
}

function PendingClaimRow({
  claimId,
  title,
  minutes,
  onApprove,
  onReject,
}: {
  claimId: string;
  title: string;
  minutes: number;
  onApprove: () => Promise<{ error?: string }>;
  onReject: () => Promise<{ error?: string }>;
}) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  return (
    <View style={styles.pendingRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.pendingRowTitle} numberOfLines={2}>{title}</Text>
        <Text style={styles.pendingRowMeta}>+{minutes}m on approval</Text>
      </View>
      <Pressable
        onPress={async () => {
          setBusy('reject');
          await onReject();
          setBusy(null);
        }}
        disabled={!!busy}
        style={({ pressed }) => [styles.rejectBtn, pressed && { opacity: 0.85 }]}>
        {busy === 'reject'
          ? <ActivityIndicator size="small" color={colors.danger} />
          : <Ionicons name="close" size={16} color={colors.danger} />}
      </Pressable>
      <Pressable
        onPress={async () => {
          setBusy('approve');
          await onApprove();
          setBusy(null);
        }}
        disabled={!!busy}
        style={({ pressed }) => [styles.approveBtn, pressed && { opacity: 0.85 }]}>
        {busy === 'approve'
          ? <ActivityIndicator size="small" color={colors.textInverse} />
          : <Ionicons name="checkmark" size={16} color={colors.textInverse} />}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pendingWrap: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 14,
  },
  pendingHeader: {
    color: colors.accent,
    fontSize: 11,
    fontFamily: fonts.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pendingRowTitle: { color: colors.textPrimary, fontSize: 13, fontFamily: fonts.semibold, letterSpacing: -0.2 },
  pendingRowMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  rejectBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  approveBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },

  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  listTitle: { color: colors.textPrimary, fontSize: 13, fontFamily: fonts.bold, letterSpacing: -0.2 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  addBtnText: { color: colors.textInverse, fontSize: 12, fontFamily: fonts.bold },

  empty: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.medium, lineHeight: 16 },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: 16 },

  row: {
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
  rowTitle: { color: colors.textPrimary, fontSize: 14, fontFamily: fonts.semibold, letterSpacing: -0.2 },
  rowMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  deleteBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center', justifyContent: 'center',
  },
});
