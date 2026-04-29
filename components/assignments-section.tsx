import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth-context';
import { useFocus, type Assignment } from '@/lib/focus-context';
import { fetchUpcomingEvents, type CalendarEvent } from '@/lib/google-calendar';
import { supabase } from '@/lib/supabase';
import { colors, radius, shadowSm } from '@/lib/theme';

// Student-only section: fetches upcoming Google Calendar events and lets the
// student claim "I'm done" on each. A claim creates a pending_review assignment
// that the parent then approves to unlock earned minutes.
export function AssignmentsSection() {
  const { session } = useAuth();
  const { profile, assignments, earnedMinutesToday, state } = useFocus();
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  const accessToken = session?.provider_token ?? null;

  // Index existing assignment claims by Google event id for quick lookup
  const claimsByEvent = new Map<string, Assignment>();
  for (const a of assignments) {
    if (a.studentUserId === session?.user.id) claimsByEvent.set(a.googleEventId, a);
  }

  const refresh = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const ev = await fetchUpcomingEvents(accessToken, { daysAhead: 14, maxResults: 30 });
      setEvents(ev);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load calendar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accessToken) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const submit = async (ev: CalendarEvent) => {
    setSubmitting(ev.id);
    const { error: rpcErr } = await supabase.rpc('submit_assignment', {
      p_google_event_id: ev.id,
      p_title: ev.summary,
      p_due_at: ev.end ?? null,
      p_minutes: state.minutesPerAssignment,
    });
    setSubmitting(null);
    if (rpcErr) setError(rpcErr.message);
  };

  // Only students see this section
  if (profile?.role !== 'student') return null;

  if (!accessToken) {
    return (
      <>
        <Text style={styles.sectionLabel}>Assignments</Text>
        <View style={styles.card}>
          <Text style={styles.empty}>
            Sign out and sign back in with Google to connect your calendar — you'll be able to mark
            assignments done here to earn screen time.
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

        {events && events.length === 0 && (
          <Text style={styles.empty}>No upcoming calendar events in the next two weeks.</Text>
        )}

        {events && events.length > 0 && (
          <View style={{ gap: 8, marginTop: 8 }}>
            {events.map((ev) => {
              const claim = claimsByEvent.get(ev.id);
              return (
                <EventRow
                  key={ev.id}
                  event={ev}
                  claim={claim}
                  submitting={submitting === ev.id}
                  onSubmit={() => submit(ev)}
                />
              );
            })}
          </View>
        )}
      </View>
    </>
  );
}

function EventRow({
  event,
  claim,
  submitting,
  onSubmit,
}: {
  event: CalendarEvent;
  claim?: Assignment;
  submitting: boolean;
  onSubmit: () => void;
}) {
  const due = formatDue(event.end, event.isAllDay);

  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={2}>{event.summary}</Text>
        {due && <Text style={styles.rowMeta}>{due}</Text>}
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
  if (!claim) {
    return (
      <Pressable
        onPress={onSubmit}
        disabled={submitting}
        style={({ pressed }) => [styles.doneBtn, pressed && { opacity: 0.85 }]}>
        {submitting
          ? <ActivityIndicator color={colors.textInverse} size="small" />
          : <Text style={styles.doneBtnText}>I'm done</Text>}
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
  rowTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '600', letterSpacing: -0.2 },
  rowMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },

  doneBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
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

  empty: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 8 },
  errorText: { color: colors.danger, fontSize: 12, marginTop: 8 },
});
