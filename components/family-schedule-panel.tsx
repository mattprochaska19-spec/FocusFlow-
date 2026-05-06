import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ScheduleEditor } from '@/components/schedule-editor';
import { ScheduleGrid } from '@/components/schedule-grid';
import { fetchChildSchedule, type ScheduleBlock } from '@/lib/schedule';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius } from '@/lib/theme';

import type { LinkedChild } from './family-limits-editor';

// Family-level schedule panel for the Family tab. Shows ONE kid's blocks at
// a time via a small pill selector (so the grid stays readable), but new
// windows can fan out to multiple kids via the editor's "Apply to" picker.
//
// View kid != target kid — viewing is just a lens; targets are picked at
// create time inside the modal.
export function FamilySchedulePanel({ linkedChildren }: { linkedChildren: LinkedChild[] }) {
  const [viewKidId, setViewKidId] = useState<string | null>(linkedChildren[0]?.user_id ?? null);
  const [blocks, setBlocks] = useState<ScheduleBlock[] | null>(null);
  const [editing, setEditing] = useState<ScheduleBlock | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  // Re-pin the view kid if the linked-children list changes (kid added/removed).
  useEffect(() => {
    if (!viewKidId || !linkedChildren.find((c) => c.user_id === viewKidId)) {
      setViewKidId(linkedChildren[0]?.user_id ?? null);
    }
  }, [linkedChildren, viewKidId]);

  const refresh = async () => {
    if (!viewKidId) return;
    const rows = await fetchChildSchedule(viewKidId);
    setBlocks(rows);
  };

  useEffect(() => {
    if (!viewKidId) {
      setBlocks(null);
      return;
    }
    let cancelled = false;
    fetchChildSchedule(viewKidId).then((rows) => {
      if (!cancelled) setBlocks(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [viewKidId]);

  // Realtime: refetch when ANY of the parent's kids' schedule rows change.
  // (RLS limits scope to linked children — the parent has access to all of
  // them, so we'd need to refetch for any change anyway.)
  useEffect(() => {
    if (!viewKidId) return;
    const channel = supabase
      .channel(`family-schedule:${viewKidId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'child_schedule_blocks',
          filter: `child_user_id=eq.${viewKidId}`,
        },
        () => { refresh(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKidId]);

  const openNew = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const openEdit = (block: ScheduleBlock) => {
    setEditing(block);
    setEditorOpen(true);
  };

  if (linkedChildren.length === 0) {
    return <Text style={styles.empty}>Link a kid to set up schedule windows.</Text>;
  }

  return (
    <View>
      <View style={styles.headerRow}>
        <Text style={styles.viewLabel}>Viewing</Text>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={openNew}
          hitSlop={6}
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}>
          <Ionicons name="add" size={16} color={colors.accent} />
          <Text style={styles.addBtnText}>New window</Text>
        </Pressable>
      </View>

      <View style={styles.kidPillRow}>
        {linkedChildren.map((c) => {
          const on = c.user_id === viewKidId;
          return (
            <Pressable
              key={c.user_id}
              onPress={() => setViewKidId(c.user_id)}
              style={({ pressed }) => [styles.kidPill, on && styles.kidPillOn, pressed && { opacity: 0.85 }]}>
              <Text style={[styles.kidPillText, on && styles.kidPillTextOn]} numberOfLines={1}>
                {c.displayName}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {blocks === null ? (
        <ActivityIndicator color={colors.textMuted} style={{ marginVertical: 24 }} />
      ) : (
        <>
          <ScheduleGrid blocks={blocks} onBlockPress={openEdit} />
          {blocks.length === 0 && (
            <Text style={styles.empty}>
              No windows yet. Tap "New window" to block apps fully or set a tighter cap during
              recurring time slots like school hours or homework time.
            </Text>
          )}
        </>
      )}

      <ScheduleEditor
        visible={editorOpen}
        childUserId={viewKidId ?? ''}
        linkedChildren={linkedChildren}
        defaultTargetChildIds={viewKidId ? [viewKidId] : []}
        block={editing}
        onClose={() => setEditorOpen(false)}
        onSaved={refresh}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  viewLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontFamily: fonts.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  addBtnText: { color: colors.accent, fontSize: 12, fontFamily: fonts.bold },

  kidPillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  kidPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  kidPillOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  kidPillText: { color: colors.textSecondary, fontSize: 12, fontFamily: fonts.semibold },
  kidPillTextOn: { color: colors.accent },

  empty: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 12,
    textAlign: 'center',
  },
});
