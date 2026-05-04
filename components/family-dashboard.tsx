import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ScheduleEditor } from '@/components/schedule-editor';
import { ScheduleGrid } from '@/components/schedule-grid';
import { useAuth } from '@/lib/auth-context';
import { useFocus } from '@/lib/focus-context';
import { fetchChildSchedule, type ScheduleBlock } from '@/lib/schedule';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius, shadowSm, space } from '@/lib/theme';
import { fetchChildUpcomingWork, type UpcomingWorkRow as UpcomingWorkRecord } from '@/lib/upcoming-work';

type LinkedChild = {
  user_id: string;
  email: string;
  displayName: string | null;
  entertainment_seconds: number;
  educational_seconds: number;
  video_count: number;
};

type ActiveRemoteSession = {
  id: string;
  child_user_id: string;
  ends_at: string;
  anchor_title: string | null;
};

function emailPrefix(email: string): string {
  return email.split('@')[0];
}

function displayLabel(child: LinkedChild): string {
  return child.displayName ?? emailPrefix(child.email);
}

export function FamilyDashboard() {
  const { state, effectiveDailyLimitMinutes, assignments } = useFocus();
  const { session } = useAuth();
  const [children, setChildren] = useState<LinkedChild[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeRemoteByChild, setActiveRemoteByChild] = useState<Record<string, ActiveRemoteSession>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<LinkedChild | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [renameSubmitting, setRenameSubmitting] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const todayDate = new Date().toISOString().split('T')[0];

  const refresh = async () => {
    setLoading(true);
    setError(null);
    // Fetch stats and display names in parallel — kept as separate RPCs so we
    // don't have to migrate get_my_children_with_stats.
    const [statsRes, namesRes] = await Promise.all([
      supabase.rpc('get_my_children_with_stats', { stats_date: todayDate }),
      supabase.rpc('get_child_display_names'),
    ]);
    setLoading(false);
    if (statsRes.error) {
      setError(statsRes.error.message);
      return;
    }
    const namesMap = new Map<string, string>();
    for (const n of (namesRes.data ?? []) as { user_id: string; display_name: string | null }[]) {
      if (n.display_name) namesMap.set(n.user_id, n.display_name);
    }
    const list = ((statsRes.data ?? []) as Omit<LinkedChild, 'displayName'>[]).map((c) => ({
      ...c,
      displayName: namesMap.get(c.user_id) ?? null,
    }));
    setChildren(list);
    // Auto-select first child once loaded so the detail panel always has a target.
    setSelectedId((curr) => curr && list.some((c) => c.user_id === curr) ? curr : list[0]?.user_id ?? null);
  };

  const refreshRemote = async () => {
    if (!session) return;
    const { data } = await supabase
      .from('remote_focus_sessions')
      .select('id, child_user_id, ends_at, anchor_title')
      .eq('parent_user_id', session.user.id)
      .gt('ends_at', new Date().toISOString());
    const map: Record<string, ActiveRemoteSession> = {};
    (data ?? []).forEach((s) => {
      map[(s as ActiveRemoteSession).child_user_id] = s as ActiveRemoteSession;
    });
    setActiveRemoteByChild(map);
  };

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    refreshRemote();
    if (!session) return;
    const channel = supabase
      .channel(`remote-focus-parent:${session.user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'remote_focus_sessions', filter: `parent_user_id=eq.${session.user.id}` },
        () => { refreshRemote(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  // Realtime: refetch whenever a reachable daily_stats row changes (RLS limits
  // this to the parent's own and their children's rows).
  useEffect(() => {
    const channel = supabase
      .channel('children-stats-watch')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_stats' },
        () => { refresh(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = children?.find((c) => c.user_id === selectedId) ?? null;

  return (
    <View>
      <View style={styles.headerRow}>
        <Text style={styles.sectionLabel}>Kids</Text>
        <Pressable onPress={refresh} hitSlop={8} disabled={loading}>
          {loading
            ? <ActivityIndicator size="small" color={colors.textMuted} />
            : <Ionicons name="refresh" size={16} color={colors.textSecondary} />}
        </Pressable>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      {children === null && !loading && (
        <View style={styles.emptyCard}>
          <ActivityIndicator color={colors.textMuted} />
        </View>
      )}

      {children?.length === 0 && (
        <View style={styles.emptyCard}>
          <Ionicons name="people-outline" size={28} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No kids linked yet</Text>
          <Text style={styles.emptyBody}>
            Share your family code (above) so your child can sign up and connect their device.
            Their stats and pending reviews will show up here once they're linked.
          </Text>
        </View>
      )}

      {children && children.length > 0 && (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.bubbleRow}>
            {children.map((c) => (
              <ChildBubble
                key={c.user_id}
                child={c}
                selected={c.user_id === selectedId}
                hasActiveFocus={!!activeRemoteByChild[c.user_id]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setSelectedId(c.user_id);
                }}
              />
            ))}
          </ScrollView>

          {selected && (
            <ChildDetail
              child={selected}
              pendingClaims={assignments
                .filter((a) => a.studentUserId === selected.user_id && a.status === 'pending_review')
                .map((a) => ({ id: a.id, title: a.title, minutesEarned: a.minutesEarned }))}
              activeSession={activeRemoteByChild[selected.user_id] ?? null}
              limitMinutes={effectiveDailyLimitMinutes}
              focusOn={state.focusModeEnabled}
              onRename={() => {
                setRenameTarget(selected);
                setRenameInput(selected.displayName ?? '');
                setRenameError(null);
              }}
            />
          )}
        </>
      )}

      <Modal
        animationType="fade"
        transparent
        visible={!!renameTarget}
        onRequestClose={() => setRenameTarget(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Rename {renameTarget ? emailPrefix(renameTarget.email) : ''}
            </Text>
            <Text style={styles.modalSub}>
              Pick a name for this account. Leave blank to revert to their email.
            </Text>
            <TextInput
              value={renameInput}
              onChangeText={setRenameInput}
              placeholder="e.g. Sarah"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
              autoFocus
              maxLength={32}
              returnKeyType="done"
              style={styles.renameInput}
            />
            {renameError && <Text style={styles.errorText}>{renameError}</Text>}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <Pressable
                onPress={() => setRenameTarget(null)}
                disabled={renameSubmitting}
                style={({ pressed }) => [styles.modalCancel, pressed && { opacity: 0.85 }]}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  if (!renameTarget) return;
                  setRenameSubmitting(true);
                  setRenameError(null);
                  const { error } = await supabase.rpc('set_child_display_name', {
                    p_child_user_id: renameTarget.user_id,
                    p_name: renameInput.trim(),
                  });
                  setRenameSubmitting(false);
                  if (error) {
                    setRenameError(error.message);
                    return;
                  }
                  setRenameTarget(null);
                  setRenameInput('');
                  refresh();
                }}
                disabled={renameSubmitting}
                style={({ pressed }) => [styles.modalStart, pressed && { opacity: 0.85 }]}>
                {renameSubmitting
                  ? <ActivityIndicator color={colors.textInverse} />
                  : <Text style={styles.modalStartText}>Save</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function ChildBubble({
  child,
  selected,
  hasActiveFocus,
  onPress,
}: {
  child: LinkedChild;
  selected: boolean;
  hasActiveFocus: boolean;
  onPress: () => void;
}) {
  const display = displayLabel(child);
  const initial = display.charAt(0).toUpperCase();

  return (
    <Pressable onPress={onPress} hitSlop={4} style={({ pressed }) => [
      styles.bubbleWrap,
      pressed && { transform: [{ scale: 0.96 }] },
    ]}>
      <View style={[styles.bubbleRing, selected && styles.bubbleRingSelected]}>
        <View style={styles.bubble}>
          <Text style={styles.bubbleInitial}>{initial}</Text>
        </View>
        {hasActiveFocus && <View style={styles.bubbleStatusDot} />}
      </View>
      <Text
        style={[styles.bubbleName, selected && styles.bubbleNameSelected]}
        numberOfLines={1}>
        {display}
      </Text>
    </Pressable>
  );
}

function ChildDetail({
  child,
  pendingClaims,
  activeSession,
  limitMinutes,
  focusOn,
  onRename,
}: {
  child: LinkedChild;
  pendingClaims: { id: string; title: string; minutesEarned: number }[];
  activeSession: ActiveRemoteSession | null;
  limitMinutes: number;
  focusOn: boolean;
  onRename: () => void;
}) {
  const entMins = Math.floor(child.entertainment_seconds / 60);
  const eduMins = Math.floor(child.educational_seconds / 60);
  const overLimit = focusOn && entMins >= limitMinutes;
  const pct = limitMinutes > 0 ? Math.min(100, (entMins / limitMinutes) * 100) : 0;
  const name = displayLabel(child);

  return (
    <View style={styles.detailCard}>
      <View style={styles.detailHeader}>
        <View style={{ flex: 1 }}>
          <View style={styles.detailNameRow}>
            <Text style={styles.detailEmail} numberOfLines={1}>{name}</Text>
            <Pressable onPress={onRename} hitSlop={8} style={styles.detailRenameBtn}>
              <Ionicons name="create-outline" size={14} color={colors.textMuted} />
            </Pressable>
          </View>
          <Text style={styles.detailMetaSecondary}>
            {activeSession ? 'Focus active · entertainment locked' : 'Idle'}
          </Text>
        </View>
        <RemoteFocusButton
          childUserId={child.user_id}
          childEmail={name}
          activeSession={activeSession}
        />
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCol}>
          <Text style={[styles.statValue, overLimit && { color: colors.danger }]}>{entMins}m</Text>
          <Text style={styles.statLabel} numberOfLines={1}>Watched</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCol}>
          <Text style={[styles.statValue, { color: colors.accent }]}>{eduMins}m</Text>
          <Text style={styles.statLabel} numberOfLines={1}>Learning</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCol}>
          <Text style={styles.statValue}>{child.video_count}</Text>
          <Text style={styles.statLabel} numberOfLines={1}>Videos</Text>
        </View>
      </View>

      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${pct}%` },
            overLimit && { backgroundColor: colors.danger },
          ]}
        />
      </View>
      <Text style={styles.progressMeta}>
        {entMins} of {limitMinutes}m entertainment today
      </Text>

      {pendingClaims.length > 0 && (
        <View style={styles.pendingWrap}>
          <Text style={styles.pendingHeader}>
            {pendingClaims.length} pending review{pendingClaims.length === 1 ? '' : 's'}
          </Text>
          <View style={{ gap: 6 }}>
            {pendingClaims.map((a) => (
              <PendingAssignmentRow
                key={a.id}
                assignmentId={a.id}
                title={a.title}
                minutes={a.minutesEarned}
              />
            ))}
          </View>
        </View>
      )}

      <ChildUpcomingWork childUserId={child.user_id} />
      <ChildSchedule childUserId={child.user_id} />
    </View>
  );
}

function ChildUpcomingWork({ childUserId }: { childUserId: string }) {
  const { assignments } = useFocus();
  const [items, setItems] = useState<UpcomingWorkRecord[] | null>(null);

  // Cross-reference: any completed claim from this child whose googleEventId
  // matches an upcoming-work external_id is the "done" state for that row.
  const completedByExternalId = new Map<string, number>();
  for (const a of assignments) {
    if (a.studentUserId === childUserId && a.status === 'completed') {
      completedByExternalId.set(a.googleEventId, a.minutesEarned);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetchChildUpcomingWork(childUserId).then((rows) => {
      if (!cancelled) setItems(rows);
    });
    return () => { cancelled = true; };
  }, [childUserId]);

  // Live updates when the kid's device pushes a new sync.
  useEffect(() => {
    const channel = supabase
      .channel(`upcoming-work:${childUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'child_upcoming_work',
          filter: `child_user_id=eq.${childUserId}`,
        },
        async () => {
          const rows = await fetchChildUpcomingWork(childUserId);
          setItems(rows);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [childUserId]);

  if (items === null) return null;

  const lastSyncedAt = items[0]?.syncedAt ?? null;

  return (
    <View style={styles.workWrap}>
      <View style={styles.workHeader}>
        <Text style={styles.workSectionLabel}>Upcoming work</Text>
        {lastSyncedAt && (
          <Text style={styles.workStaleness}>Updated {timeAgo(lastSyncedAt)}</Text>
        )}
      </View>

      {items.length === 0 ? (
        <Text style={styles.workEmpty}>
          {lastSyncedAt
            ? 'No upcoming assignments in the next two weeks.'
            : "Hasn't synced yet — they'll appear here once your child opens FocusFlow and Calendar/Classroom is connected."}
        </Text>
      ) : (
        <View style={{ gap: 6 }}>
          {items.map((item) => (
            <UpcomingWorkRow
              key={item.id}
              item={item}
              completedMinutes={completedByExternalId.get(item.externalId) ?? null}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function ChildSchedule({ childUserId }: { childUserId: string }) {
  const [blocks, setBlocks] = useState<ScheduleBlock[] | null>(null);
  const [editing, setEditing] = useState<ScheduleBlock | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const refresh = async () => {
    const rows = await fetchChildSchedule(childUserId);
    setBlocks(rows);
  };

  useEffect(() => {
    let cancelled = false;
    fetchChildSchedule(childUserId).then((rows) => {
      if (!cancelled) setBlocks(rows);
    });
    return () => { cancelled = true; };
  }, [childUserId]);

  // Realtime: refetch when any of the child's schedule rows change.
  useEffect(() => {
    const channel = supabase
      .channel(`schedule:${childUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'child_schedule_blocks',
          filter: `child_user_id=eq.${childUserId}`,
        },
        () => { refresh(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childUserId]);

  const openNew = () => {
    setEditing(null);
    setEditorOpen(true);
    if (!expanded) setExpanded(true);
  };

  const openEdit = (block: ScheduleBlock) => {
    setEditing(block);
    setEditorOpen(true);
  };

  const count = blocks?.length ?? 0;
  const summary =
    count === 0
      ? 'No windows'
      : count === 1
        ? '1 window'
        : `${count} windows`;

  return (
    <View style={styles.scheduleWrap}>
      <View style={styles.scheduleHeader}>
        <Pressable
          onPress={() => setExpanded((x) => !x)}
          hitSlop={6}
          style={({ pressed }) => [styles.scheduleHeaderToggle, pressed && { opacity: 0.85 }]}>
          <Ionicons
            name={expanded ? 'chevron-down' : 'chevron-forward'}
            size={14}
            color={colors.textMuted}
          />
          <Text style={styles.scheduleSectionLabel}>Schedule</Text>
          {!expanded && count > 0 && (
            <Text style={styles.scheduleSummary}>· {summary}</Text>
          )}
        </Pressable>
        <Pressable
          onPress={openNew}
          hitSlop={6}
          style={({ pressed }) => [styles.scheduleAddBtn, pressed && { opacity: 0.85 }]}>
          <Ionicons name="add" size={16} color={colors.accent} />
          <Text style={styles.scheduleAddText}>New window</Text>
        </Pressable>
      </View>

      {expanded && (
        <View style={{ marginTop: 10 }}>
          {blocks === null ? (
            <ActivityIndicator color={colors.textMuted} style={{ marginVertical: 16 }} />
          ) : (
            <>
              <ScheduleGrid blocks={blocks} onBlockPress={openEdit} />
              {blocks.length === 0 && (
                <Text style={styles.scheduleEmpty}>
                  No windows yet. Tap "New window" to block apps fully or set a tighter cap during
                  recurring time slots like school hours or homework time.
                </Text>
              )}
            </>
          )}
        </View>
      )}

      <ScheduleEditor
        visible={editorOpen}
        childUserId={childUserId}
        block={editing}
        onClose={() => setEditorOpen(false)}
        onSaved={refresh}
      />
    </View>
  );
}

function UpcomingWorkRow({
  item,
  completedMinutes,
}: {
  item: UpcomingWorkRecord;
  completedMinutes: number | null;
}) {
  const due = item.dueAt ? formatDue(item.dueAt, item.isAllDay) : null;
  const meta = [item.source === 'classroom' ? item.courseTitle : null, due].filter(Boolean).join(' · ');
  const done = completedMinutes !== null;

  return (
    <View style={[styles.workRow, done && styles.workRowDone]}>
      {done ? (
        <View style={styles.workCheckBadge}>
          <Ionicons name="checkmark" size={14} color={colors.textInverse} />
        </View>
      ) : (
        <View style={[
          styles.workSourcePill,
          item.source === 'classroom' ? styles.workSourcePillClassroom : styles.workSourcePillCalendar,
        ]}>
          <Text style={[
            styles.workSourcePillText,
            item.source === 'classroom' ? styles.workSourcePillTextClassroom : styles.workSourcePillTextCalendar,
          ]}>
            {item.source === 'classroom' ? 'Class' : 'Cal'}
          </Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text
          style={[styles.workTitle, done && styles.workTitleDone]}
          numberOfLines={2}>
          {item.title}
        </Text>
        {meta.length > 0 && (
          <Text style={[styles.workMeta, done && styles.workMetaDone]} numberOfLines={1}>{meta}</Text>
        )}
      </View>
      {done && (
        <View style={styles.workEarnedPill}>
          <Text style={styles.workEarnedText}>+{completedMinutes}m</Text>
        </View>
      )}
    </View>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'just now';
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDue(iso: string, isAllDay: boolean): string | null {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    if (isAllDay) {
      return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    }
    return d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
}

function RemoteFocusButton({
  childUserId,
  childEmail,
  activeSession,
}: {
  childUserId: string;
  childEmail: string;
  activeSession: ActiveRemoteSession | null;
}) {
  const { startRemoteFocus, endRemoteFocus } = useFocus();
  const [showPicker, setShowPicker] = useState(false);
  const [duration, setDuration] = useState(25);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!activeSession) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [activeSession?.id]);

  if (activeSession) {
    const remainingMs = Math.max(0, new Date(activeSession.ends_at).getTime() - Date.now());
    const mm = Math.floor(remainingMs / 60_000);
    const ss = Math.floor((remainingMs % 60_000) / 1000);
    const display = `${mm}:${String(ss).padStart(2, '0')}`;

    const handleEnd = async () => {
      setSubmitting(true);
      const { error } = await endRemoteFocus(activeSession.id);
      setSubmitting(false);
      if (error) setErr(error);
    };

    return (
      <View style={styles.remoteActiveWrap}>
        <View style={styles.remoteActivePill}>
          <Ionicons name="lock-closed" size={11} color={colors.accent} />
          <Text style={styles.remoteActiveText} suppressHighlighting>{display}</Text>
        </View>
        <Pressable onPress={handleEnd} disabled={submitting} hitSlop={6}>
          {submitting
            ? <ActivityIndicator size="small" color={colors.danger} />
            : <Text style={styles.remoteEndText}>End</Text>}
        </Pressable>
      </View>
    );
  }

  const start = async () => {
    setSubmitting(true);
    setErr(null);
    const { error } = await startRemoteFocus({
      childUserId,
      durationMinutes: duration,
      anchorTitle: undefined,
    });
    setSubmitting(false);
    if (error) {
      setErr(error);
      return;
    }
    setShowPicker(false);
  };

  return (
    <>
      <Pressable
        onPress={() => setShowPicker(true)}
        hitSlop={6}
        style={({ pressed }) => [styles.remoteFocusBtn, pressed && { opacity: 0.85 }]}>
        <Ionicons name="timer-outline" size={14} color={colors.accent} />
        <Text style={styles.remoteFocusBtnText}>Focus</Text>
      </Pressable>

      <Modal animationType="fade" transparent visible={showPicker} onRequestClose={() => setShowPicker(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Start focus for {childEmail}</Text>
            <Text style={styles.modalSub}>
              Their entertainment locks immediately on their device. They can't end it — only you can.
            </Text>

            <View style={styles.sliderValueRow}>
              <Text style={styles.sliderValue}>{duration}</Text>
              <Text style={styles.sliderValueUnit}>min</Text>
            </View>
            <Slider
              value={duration}
              minimumValue={5}
              maximumValue={240}
              step={5}
              minimumTrackTintColor={colors.accent}
              maximumTrackTintColor={colors.borderSubtle}
              thumbTintColor={colors.accent}
              onValueChange={(v) => setDuration(Math.round(v))}
              style={styles.slider}
            />
            <View style={styles.sliderRange}>
              <Text style={styles.sliderRangeText}>5m</Text>
              <Text style={styles.sliderRangeText}>240m</Text>
            </View>

            {err && <Text style={styles.errorText}>{err}</Text>}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <Pressable
                onPress={() => setShowPicker(false)}
                disabled={submitting}
                style={({ pressed }) => [styles.modalCancel, pressed && { opacity: 0.85 }]}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={start}
                disabled={submitting}
                style={({ pressed }) => [styles.modalStart, pressed && { opacity: 0.85 }]}>
                {submitting
                  ? <ActivityIndicator color={colors.textInverse} />
                  : <Text style={styles.modalStartText}>Start</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function PendingAssignmentRow({
  assignmentId,
  title,
  minutes,
}: {
  assignmentId: string;
  title: string;
  minutes: number;
}) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const approve = async () => {
    setBusy('approve');
    const { error } = await supabase.rpc('approve_assignment', { p_id: assignmentId });
    setBusy(null);
    if (error) setError(error.message);
  };

  const reject = async () => {
    setBusy('reject');
    const { error } = await supabase.rpc('reject_assignment', { p_id: assignmentId });
    setBusy(null);
    if (error) setError(error.message);
  };

  return (
    <View style={styles.pendingRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.pendingTitle} numberOfLines={2}>{title}</Text>
        <Text style={styles.pendingMeta}>+{minutes}m if approved</Text>
        {error && <Text style={styles.errorText}>{error}</Text>}
      </View>
      <Pressable
        onPress={reject}
        disabled={!!busy}
        style={({ pressed }) => [styles.pendingBtn, styles.pendingReject, pressed && { opacity: 0.85 }]}>
        {busy === 'reject'
          ? <ActivityIndicator size="small" color={colors.danger} />
          : <Ionicons name="close" size={16} color={colors.danger} />}
      </Pressable>
      <Pressable
        onPress={approve}
        disabled={!!busy}
        style={({ pressed }) => [styles.pendingBtn, styles.pendingApprove, pressed && { opacity: 0.85 }]}>
        {busy === 'approve'
          ? <ActivityIndicator size="small" color={colors.textInverse} />
          : <Ionicons name="checkmark" size={16} color={colors.textInverse} />}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    marginLeft: 2,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  errorText: { color: colors.danger, fontSize: 12, marginBottom: 10 },

  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.xl,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    gap: 10,
    ...shadowSm,
  },
  emptyTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
  emptyBody: { color: colors.textMuted, fontSize: 12, lineHeight: 17, textAlign: 'center' },

  // Netflix-style profile bubbles
  bubbleRow: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    gap: 18,
    alignItems: 'flex-start',
  },
  bubbleWrap: { alignItems: 'center', gap: 8, width: 76 },
  bubbleRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    padding: 3,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleRingSelected: { borderColor: colors.accent },
  bubble: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleInitial: {
    color: colors.textInverse,
    fontSize: 28,
    fontFamily: fonts.serifBlack,
    letterSpacing: -1,
  },
  bubbleStatusDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  bubbleName: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: -0.1,
    maxWidth: 76,
    textAlign: 'center',
  },
  bubbleNameSelected: { color: colors.textPrimary },

  // Selected child detail
  detailCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    marginTop: 18,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadowSm,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  detailNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailEmail: { color: colors.textPrimary, fontSize: 15, fontWeight: '700', letterSpacing: -0.2, flexShrink: 1 },
  detailRenameBtn: { padding: 2 },
  detailMetaSecondary: { color: colors.textMuted, fontSize: 11, marginTop: 2 },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderTopWidth: 0.5,
    borderTopColor: colors.hairline,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.hairline,
    marginBottom: 12,
  },
  statCol: { flex: 1, alignItems: 'flex-start' },
  statValue: {
    color: colors.textPrimary,
    fontSize: 22,
    fontFamily: fonts.serifSemibold,
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  statDivider: { width: 0.5, height: 28, backgroundColor: colors.hairline, marginHorizontal: 4 },

  progressTrack: {
    height: 4,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 999 },
  progressMeta: { color: colors.textMuted, fontSize: 11, marginBottom: 4 },

  pendingWrap: {
    marginTop: 14,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: radius.md,
    padding: 12,
  },
  pendingHeader: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
  },
  pendingTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  pendingMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  pendingBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingReject: { backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.dangerBorder },
  pendingApprove: { backgroundColor: colors.accent },

  remoteFocusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: radius.pill,
  },
  remoteFocusBtnText: { color: colors.accent, fontSize: 12, fontWeight: '700' },

  remoteActiveWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  remoteActivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: radius.pill,
  },
  remoteActiveText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  remoteEndText: { color: colors.danger, fontSize: 12, fontWeight: '700' },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(11, 10, 8, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 22,
    width: '100%',
    maxWidth: 380,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadowSm,
  },
  modalTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '700', letterSpacing: -0.3, marginBottom: 4 },
  modalSub: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginBottom: 16 },
  modalCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.pill,
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  modalCancelText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  modalStart: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.pill,
    alignItems: 'center',
    backgroundColor: colors.accent,
  },
  modalStartText: { color: colors.textInverse, fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },

  renameInput: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    marginTop: 4,
  },

  sliderValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 4 },
  sliderValue: { color: colors.accent, fontSize: 36, fontWeight: '800', letterSpacing: -1 },
  sliderValueUnit: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  slider: { width: '100%', height: 36, marginTop: 4 },
  sliderRange: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
    paddingHorizontal: 2,
  },
  sliderRangeText: { color: colors.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },

  // Upcoming work (Layer 2: child's Calendar+Classroom snapshot)
  workWrap: { marginTop: 16 },
  workHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  workSectionLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  workStaleness: { color: colors.textMuted, fontSize: 10, fontWeight: '600' },
  workEmpty: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  workRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 0.5,
    borderColor: colors.hairline,
    borderRadius: radius.md,
  },
  workSourcePill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 0.5,
  },
  workSourcePillClassroom: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  workSourcePillCalendar: { backgroundColor: colors.surface, borderColor: colors.hairline },
  workSourcePillText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  workSourcePillTextClassroom: { color: colors.accent },
  workSourcePillTextCalendar: { color: colors.textSecondary },
  workTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: '600', letterSpacing: -0.1 },
  workMeta: { color: colors.textMuted, fontSize: 11, marginTop: 1 },

  // Done state
  workRowDone: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBorder,
  },
  workCheckBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workTitleDone: {
    color: colors.textSecondary,
    textDecorationLine: 'line-through',
    textDecorationColor: colors.textMuted,
  },
  workMetaDone: { color: colors.textMuted, opacity: 0.85 },
  workEarnedPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  workEarnedText: {
    color: colors.textInverse,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
    fontVariant: ['tabular-nums'],
  },

  // Schedule section (per child)
  scheduleWrap: { marginTop: 18 },
  scheduleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scheduleHeaderToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  scheduleSectionLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  scheduleSummary: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 2,
  },
  scheduleAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: 999,
  },
  scheduleAddText: { color: colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  scheduleEmpty: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 12,
    textAlign: 'center',
  },
});
