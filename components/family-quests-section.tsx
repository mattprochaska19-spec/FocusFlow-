import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { QuestEditorModal } from '@/components/quest-editor-modal';
import { useFocus, type ParentQuest, type QuestKind } from '@/lib/focus-context';
import { colors, fonts, radius } from '@/lib/theme';

import type { LinkedChild } from './family-limits-editor';

// Family-level quests panel for the Family tab. The list is ALL quests the
// parent has authored — not filtered by selected kid. Each quest shows a
// summary of its targets (e.g. "all kids" or "Sarah, Dan"). The QuestEditorModal
// already handles multi-kid target selection.
//
// Pending claims are rendered separately in the per-kid section above (because
// claims are inherently per-kid: each row is one kid's submission).
export function FamilyQuestsSection({ linkedChildren }: { linkedChildren: LinkedChild[] }) {
  const { quests, archiveQuest } = useFocus();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorKind, setEditorKind] = useState<QuestKind>('goal');
  const [editingQuest, setEditingQuest] = useState<ParentQuest | null>(null);

  const goals = quests.filter((q) => q.kind === 'goal');
  const extraWork = quests.filter((q) => q.kind === 'extra_work');

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
      <QuestList
        title="Bonus Goals"
        emptyHint="No goals yet. Create one to give your kids a target — they claim when done, you approve."
        quests={goals}
        linkedChildren={linkedChildren}
        onAdd={() => openCreate('goal')}
        onEdit={openEdit}
        onArchive={(id) => archiveQuest(id)}
      />

      <View style={styles.divider} />

      <QuestList
        title="Extra Work"
        emptyHint="No extra work yet. Add things like Khan Academy lessons or SAT study time."
        quests={extraWork}
        linkedChildren={linkedChildren}
        onAdd={() => openCreate('extra_work')}
        onEdit={openEdit}
        onArchive={(id) => archiveQuest(id)}
      />

      <QuestEditorModal
        visible={editorOpen}
        quest={editingQuest}
        defaultKind={editorKind}
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
  linkedChildren,
  onAdd,
  onEdit,
  onArchive,
}: {
  title: string;
  emptyHint: string;
  quests: ParentQuest[];
  linkedChildren: LinkedChild[];
  onAdd: () => void;
  onEdit: (q: ParentQuest) => void;
  onArchive: (id: string) => void;
}) {
  return (
    <View>
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>{title}</Text>
        <Pressable
          onPress={onAdd}
          hitSlop={8}
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}>
          <Ionicons name="add" size={16} color={colors.textInverse} />
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>
      {quests.length === 0 ? (
        <Text style={styles.empty}>{emptyHint}</Text>
      ) : (
        <View style={{ gap: 8 }}>
          {quests.map((q) => (
            <QuestRow
              key={q.id}
              quest={q}
              linkedChildren={linkedChildren}
              onEdit={() => onEdit(q)}
              onArchive={() => onArchive(q.id)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function QuestRow({
  quest,
  linkedChildren,
  onEdit,
  onArchive,
}: {
  quest: ParentQuest;
  linkedChildren: LinkedChild[];
  onEdit: () => void;
  onArchive: () => void;
}) {
  // Resolve quest.targets into a friendly summary. Empty targets = "all kids".
  const targetLabel =
    quest.targets.length === 0
      ? 'All kids'
      : quest.targets
          .map((id) => linkedChildren.find((c) => c.user_id === id)?.displayName ?? '?')
          .join(', ');

  return (
    <Pressable onPress={onEdit} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={2}>{quest.title}</Text>
        <Text style={styles.rowMeta}>
          +{quest.rewardMinutes}m · {quest.repeatable ? 'repeatable' : 'one-time'} · {targetLabel}
        </Text>
      </View>
      <Pressable onPress={onArchive} hitSlop={8} style={styles.deleteBtn}>
        <Ionicons name="trash-outline" size={14} color={colors.danger} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
