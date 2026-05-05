import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Celebration } from '@/components/celebration';
import { Mascot } from '@/components/mascot';
import { useAuth } from '@/lib/auth-context';
import { fetchClassroomAssignments } from '@/lib/classroom';
import { FOCUS_BONUS_MULTIPLIER, useFocus, type Assignment } from '@/lib/focus-context';
import { fetchUpcomingEvents } from '@/lib/google-calendar';
import { supabase } from '@/lib/supabase';
import { colors, radius, shadowSm } from '@/lib/theme';
import { syncMyUpcomingWork, type UpcomingWorkItem } from '@/lib/upcoming-work';

// Unified shape rendered in this section. Calendar events and Classroom
// coursework both map into this — id is opaque and round-trips into the
// submit_assignment RPC as p_google_event_id (Classroom uses gc:* prefix).
type DisplayItem = {
  id: string;
  title: string;
  dueAt: string | null;
  isAllDay: boolean;
  source: 'calendar' | 'classroom';
  courseTitle?: string;
};

// Student-only section: fetches upcoming Google Calendar events and lets the
// student claim "I'm done" on each. A claim creates a pending_review assignment
// that the parent then approves to unlock earned minutes.
export function AssignmentsSection() {
  const { session, googleAccessToken } = useAuth();
  const { profile, assignments, earnedMinutesToday, state, activeFocusSession } = useFocus();
  const [items, setItems] = useState<DisplayItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState<{ title: string; subtitle?: string; pose?: 'excited' | 'happy' | 'encouraging' } | null>(null);
  const lastDoneCountRef = useRef<number | null>(null);

  const accessToken = googleAccessToken;

  // Index existing assignment claims by id for quick lookup. The googleEventId
  // column stores either a Calendar event id or a 'gc:*' Classroom prefix.
  const claimsByEvent = new Map<string, Assignment>();
  for (const a of assignments) {
    if (a.studentUserId === session?.user.id) claimsByEvent.set(a.googleEventId, a);
  }

  const refresh = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    // Fetch both sources in parallel; either failing alone shouldn't blank
    // the other. Aggregate the first error, if any, into the surfaced message.
    const [calRes, classRes] = await Promise.allSettled([
      fetchUpcomingEvents(accessToken, { daysAhead: 14, maxResults: 30 }),
      fetchClassroomAssignments(accessToken, { daysAhead: 14 }),
    ]);

    const out: DisplayItem[] = [];
    if (calRes.status === 'fulfilled') {
      for (const ev of calRes.value) {
        out.push({
          id: ev.id,
          title: ev.summary,
          dueAt: ev.end ?? null,
          isAllDay: ev.isAllDay,
          source: 'calendar',
        });
      }
    }
    if (classRes.status === 'fulfilled') {
      for (const cw of classRes.value) {
        out.push({
          id: cw.id,
          title: cw.title,
          dueAt: cw.dueAt,
          isAllDay: cw.isAllDay,
          source: 'classroom',
          courseTitle: cw.courseTitle,
        });
      }
    }
    out.sort((a, b) => {
      if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt);
      if (a.dueAt) return -1;
      if (b.dueAt) return 1;
      return a.title.localeCompare(b.title);
    });
    setItems(out);

    const firstErr = [calRes, classRes].find((r) => r.status === 'rejected') as
      | PromiseRejectedResult
      | undefined;
    if (firstErr) {
      const msg = firstErr.reason instanceof Error ? firstErr.reason.message : 'Failed to load assignments';
      setError(msg);
    }
    setLoading(false);

    // Layer 2: push the merged snapshot to Supabase so the linked parent's
    // Family tab can see what this child has to do. Only sync when at least
    // one source succeeded — a double-failure round shouldn't wipe the last
    // good sync. Fire-and-forget; sync errors don't surface to the kid.
    if (calRes.status === 'fulfilled' || classRes.status === 'fulfilled') {
      const syncItems: UpcomingWorkItem[] = out.map((item) => ({
        source: item.source,
        externalId: item.id,
        title: item.title,
        dueAt: item.dueAt,
        courseTitle: item.courseTitle,
        isAllDay: item.isAllDay,
      }));
      syncMyUpcomingWork(syncItems).then((res) => {
        if (res.error) console.warn('[FocusFlow] upcoming-work sync failed:', res.error);
      });
    }
  };

  useEffect(() => {
    if (accessToken) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  // Milestone: when the kid transitions from "some left to do" to "everything
  // done today", celebrate. Skip the initial mount (prev=null) so opening the
  // app to an already-clean slate doesn't re-trigger the celebration.
  useEffect(() => {
    if (!items || items.length === 0) {
      lastDoneCountRef.current = null;
      return;
    }
    const completedExternalIds = new Set(
      assignments
        .filter((a) => a.studentUserId === session?.user.id && a.status === 'completed')
        .map((a) => a.googleEventId),
    );
    const doneCount = items.filter((item) => completedExternalIds.has(item.id)).length;
    const total = items.length;
    const prev = lastDoneCountRef.current;
    if (prev !== null && prev < total && doneCount === total) {
      const name = profile?.displayName ?? '';
      setCelebrate({
        pose: 'excited',
        title: name ? `All done, ${name}!` : 'All done!',
        subtitle: 'Way to go — you crushed today.',
      });
    }
    lastDoneCountRef.current = doneCount;
  }, [items, assignments, session?.user.id, profile?.displayName]);

  const submit = async (item: DisplayItem) => {
    setSubmitting(item.id);
    const minutes = activeFocusSession
      ? Math.round(state.minutesPerAssignment * FOCUS_BONUS_MULTIPLIER)
      : state.minutesPerAssignment;
    const { error: rpcErr } = await supabase.rpc('submit_assignment', {
      p_google_event_id: item.id,
      p_title: item.title,
      p_due_at: item.dueAt,
      p_minutes: minutes,
    });
    setSubmitting(null);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    const name = profile?.displayName ?? '';
    const who = name ? `, ${name}` : '';
    setCelebrate({
      title: `Nice work${who}!`,
      subtitle: activeFocusSession
        ? `Submitted with 1.5× bonus — ${minutes} min if your parent approves.`
        : `Submitted — ${minutes} min if your parent approves.`,
    });
  };

  // Only students see this section
  if (profile?.role !== 'student') return null;

  if (!accessToken) {
    return (
      <>
        <Text style={styles.sectionLabel}>Assignments</Text>
        <View style={styles.card}>
          <Text style={styles.empty}>
            Sign out and sign back in with Google to connect Calendar and Classroom — you'll be
            able to mark assignments done here to earn screen time.
          </Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Text style={styles.sectionLabel}>Assignments</Text>
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Earn screen time</Text>
            <Text style={styles.headerSub}>
              {earnedMinutesToday > 0
                ? `+${earnedMinutesToday}m earned today`
                : `Mark done → parent approves → +${state.minutesPerAssignment}m each`}
            </Text>
          </View>
          <Pressable onPress={refresh} hitSlop={8} disabled={loading}>
            {loading
              ? <ActivityIndicator size="small" color={colors.textMuted} />
              : <Ionicons name="refresh" size={16} color={colors.textSecondary} />}
          </Pressable>
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        {items && items.length === 0 && (
          <View style={styles.emptyWrap}>
            <Mascot pose="thinking" size="md" />
            <Text style={styles.empty}>No upcoming assignments in the next two weeks.</Text>
          </View>
        )}

        {items && items.length > 0 && (
          <View style={{ gap: 8, marginTop: 8 }}>
            {items.map((item) => {
              const claim = claimsByEvent.get(item.id);
              return (
                <AssignmentRow
                  key={item.id}
                  item={item}
                  claim={claim}
                  submitting={submitting === item.id}
                  onSubmit={() => submit(item)}
                />
              );
            })}
          </View>
        )}
      </View>

      <Celebration
        visible={celebrate !== null}
        pose={celebrate?.pose ?? 'excited'}
        title={celebrate?.title ?? ''}
        subtitle={celebrate?.subtitle}
        onDismiss={() => setCelebrate(null)}
      />
    </>
  );
}

function AssignmentRow({
  item,
  claim,
  submitting,
  onSubmit,
}: {
  item: DisplayItem;
  claim?: Assignment;
  submitting: boolean;
  onSubmit: () => void;
}) {
  const due = item.dueAt ? formatDue(item.dueAt, item.isAllDay) : null;
  const meta = [item.source === 'classroom' ? item.courseTitle : null, due].filter(Boolean).join(' · ');

  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <View style={styles.titleRow}>
          {item.source === 'classroom' && (
            <View style={styles.sourcePill}>
              <Text style={styles.sourcePillText}>Classroom</Text>
            </View>
          )}
          <Text style={styles.rowTitle} numberOfLines={2}>{item.title}</Text>
        </View>
        {meta.length > 0 && <Text style={styles.rowMeta}>{meta}</Text>}
      </View>
      <RowAction claim={claim} submitting={submitting} onSubmit={onSubmit} />
    </View>
  );
}

function RowAction({
  claim,
  submitting,
  onSubmit,
}: {
  claim?: Assignment;
  submitting: boolean;
  onSubmit: () => void;
}) {
  const { activeFocusSession } = useFocus();

  if (!claim) {
    return (
      <Pressable
        onPress={onSubmit}
        disabled={submitting}
        style={({ pressed }) => [
          styles.doneBtn,
          activeFocusSession && styles.doneBtnFocusBonus,
          pressed && { opacity: 0.85 },
        ]}>
        {submitting
          ? <ActivityIndicator color={colors.textInverse} size="small" />
          : <Text style={styles.doneBtnText}>{activeFocusSession ? "I'm done · 1.5×" : "I'm done"}</Text>}
      </Pressable>
    );
  }

  if (claim.status === 'pending_review') {
    return (
      <View style={[styles.statusPill, styles.statusPending]}>
        <Text style={styles.statusPendingText}>Awaiting</Text>
      </View>
    );
  }

  if (claim.status === 'completed') {
    return (
      <View style={[styles.statusPill, styles.statusDone]}>
        <Ionicons name="checkmark" size={12} color={colors.accent} />
        <Text style={styles.statusDoneText}>+{claim.minutesEarned}m</Text>
      </View>
    );
  }

  // rejected → let them re-submit
  return (
    <Pressable
      onPress={onSubmit}
      disabled={submitting}
      style={({ pressed }) => [styles.doneBtn, styles.doneBtnRetry, pressed && { opacity: 0.85 }]}>
      <Text style={styles.doneBtnText}>Retry</Text>
    </Pressable>
  );
}

function formatDue(end: string, isAllDay: boolean): string | null {
  if (!end) return null;
  try {
    const d = new Date(end);
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

const styles = StyleSheet.create({
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
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadowSm,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  headerTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
  headerSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  rowTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '600', letterSpacing: -0.2, flexShrink: 1 },
  rowMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },

  sourcePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
    borderWidth: 0.5,
    borderColor: colors.accentBorder,
  },
  sourcePillText: {
    color: colors.accent,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  doneBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  doneBtnFocusBonus: { backgroundColor: '#1F4F36' },
  doneBtnRetry: { backgroundColor: colors.textSecondary },
  doneBtnText: { color: colors.textInverse, fontWeight: '700', fontSize: 12, letterSpacing: 0.2 },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  statusPending: { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
  statusPendingText: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
  statusDone: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  statusDoneText: { color: colors.accent, fontSize: 11, fontWeight: '700' },

  emptyWrap: { alignItems: 'center', gap: 8, marginVertical: 12 },
  empty: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 8, textAlign: 'center' },
  errorText: { color: colors.danger, fontSize: 12, marginTop: 8 },
});
