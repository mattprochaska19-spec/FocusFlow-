import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChannelSearch } from '@/components/channel-search';
import { decideAccess, describeDecision, type AccessDecision } from '@/lib/access';
import { useAuth } from '@/lib/auth-context';
import { useFocus } from '@/lib/focus-context';
import { supabase } from '@/lib/supabase';
import { colors, radius, shadowSm, space } from '@/lib/theme';
import { extractVideoId, type ChannelSearchResult } from '@/lib/youtube-filter';

const LIMIT_MIN_MINUTES = 1;
const LIMIT_MAX_MINUTES = 180;

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const {
    state,
    setApiKey,
    setDailyLimitMinutes,
    addOverride,
    addEducationalChannel,
    removeEducationalChannel,
    setChannelLimit,
    removeChannelLimit,
    addCreatorAllowance,
    removeCreatorAllowance,
    setAllowFinishCurrentVideo,
    setAllowOverride,
    setMinutesPerAssignment,
    effectiveDailyLimitMinutes,
  } = useFocus();

  const { profile } = useFocus();
  const isStudent = profile?.role === 'student';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.lg, paddingBottom: 48 }]}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.pageTitle}>{isStudent ? 'Account' : 'Settings'}</Text>
        <Text style={styles.pageSub}>
          {isStudent
            ? 'Your parent manages the rules. They sync to this device automatically.'
            : 'Tune the rules that keep you focused.'}
        </Text>

        <FamilySection />

        {!isStudent && (
          <>
            <ApiKeySection apiKey={state.apiKey} onChange={setApiKey} />

            <TestAccessSection />

            <DailyLimitSection
              minutes={state.dailyLimitMinutes}
              effective={effectiveDailyLimitMinutes}
              onSet={setDailyLimitMinutes}
            />

            <BehaviorSection
              allowFinishCurrentVideo={state.allowFinishCurrentVideo}
              allowOverride={state.allowOverride}
              onSetAllowFinishCurrentVideo={setAllowFinishCurrentVideo}
              onSetAllowOverride={setAllowOverride}
            />

            <EarnTimeSection
              minutes={state.minutesPerAssignment}
              onSet={setMinutesPerAssignment}
            />

            {state.allowOverride && (
              <OverrideSection
                override={state.override}
                dailyLimit={state.dailyLimitMinutes}
                effective={effectiveDailyLimitMinutes}
                onAdd={addOverride}
              />
            )}

            <EducationalChannelsSection
              channels={state.educationalChannels}
              apiKey={state.apiKey}
              onAdd={addEducationalChannel}
              onRemove={removeEducationalChannel}
            />

            <CreatorAllowancesSection
              allowances={state.creatorAllowances}
              apiKey={state.apiKey}
              onAdd={addCreatorAllowance}
              onRemove={removeCreatorAllowance}
            />

            <ChannelLimitsSection
              limits={state.channelLimits}
              apiKey={state.apiKey}
              onSet={setChannelLimit}
              onRemove={removeChannelLimit}
            />
          </>
        )}

        <AccountSection />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function FamilySection() {
  const { profile } = useFocus();
  if (!profile) return null;

  if (profile.role === 'parent') {
    return (
      <Card icon="people-outline" title="Family">
        <Text style={styles.familyHint}>Share this code with your child to link their device.</Text>
        <View style={styles.familyCodeBox}>
          <Text style={styles.familyCodeText}>{profile.familyCode ?? '— —'}</Text>
        </View>
        <Text style={styles.hint}>
          When your child signs up and enters this code, your rules apply to their device automatically.
        </Text>

        <View style={styles.toggleDivider} />

        <ChildrenList />
      </Card>
    );
  }

  return (
    <Card icon="people-outline" title="Family">
      {profile.parentId ? (
        <>
          <Text style={styles.familyHint}>Linked to a parent account.</Text>
          <View style={[styles.familyCodeBox, { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder }]}>
            <Ionicons name="checkmark-circle" size={20} color={colors.accent} style={{ marginRight: 8 }} />
            <Text style={[styles.familyCodeText, { fontSize: 14, letterSpacing: -0.2 }]}>Rules sync from parent</Text>
          </View>
        </>
      ) : (
        <LinkToParentForm />
      )}
    </Card>
  );
}

function LinkToParentForm() {
  const { reloadProfile } = useFocus();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = code.trim().length >= 4;

  const submit = async () => {
    if (!valid || submitting) return;
    setError(null);
    setSubmitting(true);
    const { error: rpcErr } = await supabase.rpc('signup_as_student', { code: code.trim() });
    setSubmitting(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setCode('');
    reloadProfile();
  };

  return (
    <>
      <Text style={styles.familyHint}>
        Enter the 6-character family code your parent shared to link this account.
      </Text>
      <TextInput
        value={code}
        onChangeText={(v) => { setCode(v.toUpperCase()); setError(null); }}
        placeholder="ABC123"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={8}
        returnKeyType="go"
        onSubmitEditing={submit}
        style={[styles.input, styles.linkCodeInput]}
      />
      <Pressable
        onPress={submit}
        disabled={!valid || submitting}
        style={({ pressed }) => [
          styles.linkBtn,
          (!valid || submitting) && styles.addBtnDisabled,
          pressed && { opacity: 0.9 },
        ]}>
        {submitting
          ? <ActivityIndicator color={colors.textInverse} />
          : <Text style={styles.addBtnText}>Link to parent</Text>}
      </Pressable>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </>
  );
}

type LinkedChild = {
  user_id: string;
  email: string;
  entertainment_seconds: number;
  educational_seconds: number;
  video_count: number;
};

function ChildrenList() {
  const { state, effectiveDailyLimitMinutes, assignments } = useFocus();
  const [children, setChildren] = useState<LinkedChild[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const todayDate = new Date().toISOString().split('T')[0];

  const refresh = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc('get_my_children_with_stats', { stats_date: todayDate });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setChildren((data ?? []) as LinkedChild[]);
  };

  useEffect(() => { refresh(); }, []);

  // Realtime: refetch whenever any reachable daily_stats row changes.
  // RLS limits this to own + children's rows, so this fires on either parent or child writes.
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

  return (
    <View>
      <View style={styles.childrenHeader}>
        <Text style={styles.childrenTitle}>Linked children</Text>
        <Pressable onPress={refresh} hitSlop={8} disabled={loading}>
          {loading
            ? <ActivityIndicator size="small" color={colors.textMuted} />
            : <Ionicons name="refresh" size={16} color={colors.textSecondary} />}
        </Pressable>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      {children === null && !loading && (
        <Text style={styles.empty}>—</Text>
      )}

      {children?.length === 0 && (
        <Text style={styles.empty}>
          No children linked yet. Share your family code so they can sign up and connect.
        </Text>
      )}

      {children && children.length > 0 && (
        <View style={{ gap: 8 }}>
          {children.map((c) => {
            const entMins = Math.floor(c.entertainment_seconds / 60);
            const eduMins = Math.floor(c.educational_seconds / 60);
            const limit = effectiveDailyLimitMinutes;
            const overLimit = state.focusModeEnabled && entMins >= limit;
            const childPending = assignments.filter(
              (a) => a.studentUserId === c.user_id && a.status === 'pending_review'
            );
            return (
              <View key={c.user_id} style={{ gap: 8 }}>
                <View style={styles.childRow}>
                  <View style={styles.childAvatar}>
                    <Text style={styles.childAvatarText}>{c.email.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.childEmail} numberOfLines={1}>{c.email}</Text>
                    <View style={styles.childStatsRow}>
                      <Text style={[styles.childStat, overLimit && { color: colors.danger }]}>
                        {entMins}m / {limit}m entertainment
                      </Text>
                      <Text style={styles.childStatDivider}>·</Text>
                      <Text style={[styles.childStat, { color: colors.accent }]}>{eduMins}m edu</Text>
                    </View>
                    <Text style={styles.childStatSecondary}>{c.video_count} videos today</Text>
                  </View>
                </View>

                {childPending.length > 0 && (
                  <View style={styles.pendingWrap}>
                    <Text style={styles.pendingHeader}>
                      {childPending.length} pending review
                    </Text>
                    {childPending.map((a) => (
                      <PendingAssignmentRow key={a.id} assignmentId={a.id} title={a.title} minutes={a.minutesEarned} />
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
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

function AccountSection() {
  const { session, signOut, deleteAccount } = useAuth();
  const { profile } = useFocus();
  const [deleting, setDeleting] = useState(false);
  if (!session) return null;

  const isParent = profile?.role === 'parent';

  const confirmDelete = () => {
    const message = isParent
      ? "This permanently removes your account, settings, and all activity history. Linked children will be unlinked but their accounts won't be deleted. This can't be undone."
      : "This permanently removes your account and all activity history. You'll need to sign up again with your parent's family code to use FocusFlow. This can't be undone.";

    Alert.alert(
      'Delete account?',
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            const { error } = await deleteAccount();
            setDeleting(false);
            if (error) {
              Alert.alert('Could not delete account', error);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  return (
    <Card icon="person-circle-outline" title="Account">
      <Text style={styles.accountEmail}>{session.user.email}</Text>
      <Pressable
        onPress={signOut}
        disabled={deleting}
        style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.85 }]}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
      <Pressable
        onPress={confirmDelete}
        disabled={deleting}
        style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.85 }]}>
        {deleting
          ? <ActivityIndicator color={colors.danger} />
          : <Text style={styles.deleteText}>Delete account</Text>}
      </Pressable>
    </Card>
  );
}

function ApiKeySection({ apiKey, onChange }: { apiKey: string; onChange: (k: string) => void }) {
  const [reveal, setReveal] = useState(false);
  return (
    <Card icon="key-outline" title="YouTube Data API Key">
      <View style={styles.inputRow}>
        <TextInput
          value={apiKey}
          onChangeText={onChange}
          placeholder="AIzaSy..."
          placeholderTextColor={colors.textMuted}
          secureTextEntry={!reveal}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { flex: 1 }]}
        />
        <Pressable onPress={() => setReveal((v) => !v)} style={styles.iconBtn}>
          <Ionicons name={reveal ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textSecondary} />
        </Pressable>
      </View>
      <Text style={styles.hint}>
        Get a free key at console.cloud.google.com → enable YouTube Data API v3 → Credentials → Create API key.
      </Text>
    </Card>
  );
}

function DailyLimitSection({
  minutes,
  effective,
  onSet,
}: {
  minutes: number;
  effective: number;
  onSet: (m: number) => void;
}) {
  // Track value live during drag without thrashing AsyncStorage; commit on release
  const [liveValue, setLiveValue] = useState(minutes);
  useEffect(() => { setLiveValue(minutes); }, [minutes]);

  return (
    <Card icon="time-outline" title="Daily Entertainment Limit">
      <View style={styles.sliderValueRow}>
        <Text style={styles.sliderValue}>{liveValue}</Text>
        <Text style={styles.sliderValueUnit}>min / day</Text>
      </View>
      <Slider
        value={minutes}
        minimumValue={LIMIT_MIN_MINUTES}
        maximumValue={LIMIT_MAX_MINUTES}
        step={1}
        minimumTrackTintColor={colors.accent}
        maximumTrackTintColor={colors.borderSubtle}
        thumbTintColor={colors.accent}
        onValueChange={(v) => setLiveValue(Math.round(v))}
        onSlidingComplete={(v) => onSet(Math.round(v))}
        style={styles.slider}
      />
      <View style={styles.sliderRange}>
        <Text style={styles.sliderRangeText}>{LIMIT_MIN_MINUTES}m</Text>
        <Text style={styles.sliderRangeText}>{LIMIT_MAX_MINUTES}m</Text>
      </View>
      <Text style={styles.hint}>
        Cap on YouTube entertainment per day. Today's effective cap with overrides:{' '}
        <Text style={styles.hintStrong}>{effective}m</Text>.
      </Text>
    </Card>
  );
}

function EarnTimeSection({
  minutes,
  onSet,
}: {
  minutes: number;
  onSet: (m: number) => void;
}) {
  const presets = [5, 10, 15, 30, 45, 60];
  return (
    <Card icon="ribbon-outline" title="Earn Time per Assignment">
      <View style={styles.presetRow}>
        {presets.map((m) => {
          const active = m === minutes;
          return (
            <Pressable
              key={m}
              onPress={() => onSet(m)}
              style={({ pressed }) => [
                styles.presetBtn,
                active && styles.presetBtnActive,
                pressed && { opacity: 0.9 },
              ]}>
              <Text style={[styles.presetBtnText, active && styles.presetBtnTextActive]}>{m}m</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>
        When a child marks an assignment done and you approve it, they earn this many minutes of
        entertainment time on top of their daily limit.
      </Text>
    </Card>
  );
}

function BehaviorSection({
  allowFinishCurrentVideo,
  allowOverride,
  onSetAllowFinishCurrentVideo,
  onSetAllowOverride,
}: {
  allowFinishCurrentVideo: boolean;
  allowOverride: boolean;
  onSetAllowFinishCurrentVideo: (v: boolean) => void;
  onSetAllowOverride: (v: boolean) => void;
}) {
  return (
    <Card icon="shield-checkmark-outline" title="Behavior">
      <ToggleRow
        label="Finish current video"
        description="When the limit hits mid-video, let the current one finish before blocking. Off = pause immediately."
        value={allowFinishCurrentVideo}
        onValueChange={onSetAllowFinishCurrentVideo}
      />
      <View style={styles.toggleDivider} />
      <ToggleRow
        label="Allow overrides"
        description="Add bonus minutes today (+5/+15/+30m). Off = the cap is a hard limit, no exceptions."
        value={allowOverride}
        onValueChange={onSetAllowOverride}
      />
    </Card>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onValueChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleDesc}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#D9D3C7', true: colors.accent }}
        thumbColor={colors.surface}
        ios_backgroundColor="#D9D3C7"
      />
    </View>
  );
}

function OverrideSection({
  override,
  dailyLimit,
  effective,
  onAdd,
}: {
  override: { minutesAdded: number; expiresAt: number } | null;
  dailyLimit: number;
  effective: number;
  onAdd: (m: number) => void;
}) {
  const added = override?.minutesAdded ?? 0;
  return (
    <Card icon="add-circle-outline" title="Override (today only)">
      <View style={styles.presetRow}>
        {[5, 15, 30].map((m) => (
          <Pressable
            key={m}
            onPress={() => onAdd(m)}
            style={({ pressed }) => [styles.presetBtn, pressed && { opacity: 0.85 }]}>
            <Text style={styles.presetBtnText}>+{m}m</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.hint}>
        {added > 0
          ? `Added ${added}m to today's limit (${dailyLimit}m → ${effective}m). Resets at midnight.`
          : "Stretch today's entertainment cap. Resets at midnight."}
      </Text>
    </Card>
  );
}

function EducationalChannelsSection({
  channels,
  apiKey,
  onAdd,
  onRemove,
}: {
  channels: { channelId: string; name: string; thumbnailUrl?: string }[];
  apiKey: string;
  onAdd: (channel: { channelId: string; name: string; thumbnailUrl?: string }) => void;
  onRemove: (channelId: string) => void;
}) {
  const handleSelect = (c: ChannelSearchResult) => {
    onAdd({ channelId: c.channelId, name: c.title, thumbnailUrl: c.thumbnailUrl });
  };

  return (
    <Card icon="checkmark-circle-outline" title="Educational Channels">
      {channels.length === 0 ? (
        <Text style={[styles.empty, { marginBottom: 14 }]}>No channels added yet.</Text>
      ) : (
        <View style={{ gap: 8, marginBottom: 14 }}>
          {channels.map((c) => (
            <View key={c.channelId} style={styles.listItem}>
              <ChannelAvatar uri={c.thumbnailUrl} />
              <View style={{ flex: 1 }}>
                <Text style={styles.listItemName} numberOfLines={1}>{c.name}</Text>
                <Text style={styles.listItemMeta}>Always allowed</Text>
              </View>
              <Pressable onPress={() => onRemove(c.channelId)} hitSlop={8} style={styles.listItemRemove}>
                <Ionicons name="close" size={16} color={colors.danger} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <ChannelSearch apiKey={apiKey} onSelect={handleSelect} placeholder="Search channel name…" />

      <Text style={styles.hint}>
        Search a channel by name, tap to add. Whitelisted channels bypass all limits regardless of category.
      </Text>
    </Card>
  );
}

function CreatorAllowancesSection({
  allowances,
  apiKey,
  onAdd,
  onRemove,
}: {
  allowances: { channelId: string; name: string; thumbnailUrl?: string; dailyVideoLimit: number }[];
  apiKey: string;
  onAdd: (channel: { channelId: string; name: string; thumbnailUrl?: string }, dailyVideoLimit: number) => void;
  onRemove: (channelId: string) => void;
}) {
  const [selected, setSelected] = useState<ChannelSearchResult | null>(null);
  const [count, setCount] = useState('3');

  const parsedCount = parseInt(count, 10);
  const canAdd = !!selected && Number.isFinite(parsedCount) && parsedCount > 0;

  const handleAdd = () => {
    if (!canAdd || !selected) return;
    onAdd(
      { channelId: selected.channelId, name: selected.title, thumbnailUrl: selected.thumbnailUrl },
      parsedCount
    );
    setSelected(null);
    setCount('3');
  };

  return (
    <Card icon="film-outline" title="Creator Allowances">
      {allowances.length === 0 ? (
        <Text style={styles.empty}>No creators added yet.</Text>
      ) : (
        <View style={{ gap: 8, marginBottom: 14 }}>
          {allowances.map((c) => (
            <View key={c.channelId} style={styles.listItem}>
              <ChannelAvatar uri={c.thumbnailUrl} />
              <View style={{ flex: 1 }}>
                <Text style={styles.listItemName} numberOfLines={1}>{c.name}</Text>
                <Text style={styles.listItemMeta}>
                  {c.dailyVideoLimit} {c.dailyVideoLimit === 1 ? 'video' : 'videos'} / day
                </Text>
              </View>
              <Pressable onPress={() => onRemove(c.channelId)} hitSlop={8} style={styles.listItemRemove}>
                <Ionicons name="close" size={16} color={colors.danger} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {selected ? (
        <View style={styles.selectedCard}>
          <ChannelAvatar uri={selected.thumbnailUrl} />
          <View style={{ flex: 1 }}>
            <Text style={styles.listItemName} numberOfLines={1}>{selected.title}</Text>
            <Text style={styles.listItemMeta}>Selected</Text>
          </View>
          <Pressable onPress={() => setSelected(null)} hitSlop={8} style={styles.listItemRemove}>
            <Ionicons name="close" size={16} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : (
        <ChannelSearch apiKey={apiKey} onSelect={setSelected} placeholder="Search creator name…" />
      )}

      {selected && (
        <View style={[styles.inputRow, { marginTop: 8 }]}>
          <TextInput
            value={count}
            onChangeText={setCount}
            placeholder="Videos per day"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            returnKeyType="done"
            onSubmitEditing={handleAdd}
            style={[styles.input, { flex: 1 }]}
          />
          <Pressable
            onPress={handleAdd}
            disabled={!canAdd}
            style={({ pressed }) => [
              styles.addBtn,
              !canAdd && styles.addBtnDisabled,
              pressed && { opacity: 0.9 },
            ]}>
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.hint}>
        Search a creator by name, pick from the suggestions, then set the daily video limit.
      </Text>
    </Card>
  );
}

function ChannelAvatar({ uri }: { uri?: string }) {
  if (uri) return <Image source={{ uri }} style={styles.listAvatar} />;
  return (
    <View style={[styles.listAvatar, styles.listAvatarFallback]}>
      <Ionicons name="person" size={14} color={colors.textMuted} />
    </View>
  );
}

function ChannelLimitsSection({
  limits,
  apiKey,
  onSet,
  onRemove,
}: {
  limits: Record<string, { name: string; minutes: number }>;
  apiKey: string;
  onSet: (id: string, limit: { name: string; minutes: number }) => void;
  onRemove: (id: string) => void;
}) {
  const [selected, setSelected] = useState<ChannelSearchResult | null>(null);
  const [mins, setMins] = useState('30');

  const entries = useMemo(() => Object.entries(limits), [limits]);
  const parsedMins = parseInt(mins, 10);
  const canAdd = !!selected && Number.isFinite(parsedMins) && parsedMins > 0;

  const handleAdd = () => {
    if (!canAdd || !selected) return;
    onSet(selected.channelId, { name: selected.title, minutes: parsedMins });
    setSelected(null);
    setMins('30');
  };

  return (
    <Card icon="tv-outline" title="Per-Channel Limits">
      {entries.length === 0 ? (
        <Text style={styles.empty}>No per-channel limits set.</Text>
      ) : (
        <View style={{ gap: 8, marginBottom: 14 }}>
          {entries.map(([id, limit]) => (
            <View key={id} style={styles.listItem}>
              <ChannelAvatar />
              <View style={{ flex: 1 }}>
                <Text style={styles.listItemName} numberOfLines={1}>{limit.name}</Text>
                <Text style={styles.listItemMeta} numberOfLines={1}>{limit.minutes}m / day</Text>
              </View>
              <Pressable onPress={() => onRemove(id)} hitSlop={8} style={styles.listItemRemove}>
                <Ionicons name="close" size={16} color={colors.danger} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {selected ? (
        <View style={styles.selectedCard}>
          <ChannelAvatar uri={selected.thumbnailUrl} />
          <View style={{ flex: 1 }}>
            <Text style={styles.listItemName} numberOfLines={1}>{selected.title}</Text>
            <Text style={styles.listItemMeta}>Selected</Text>
          </View>
          <Pressable onPress={() => setSelected(null)} hitSlop={8} style={styles.listItemRemove}>
            <Ionicons name="close" size={16} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : (
        <ChannelSearch apiKey={apiKey} onSelect={setSelected} placeholder="Search channel name…" />
      )}

      {selected && (
        <View style={[styles.inputRow, { marginTop: 8 }]}>
          <TextInput
            value={mins}
            onChangeText={setMins}
            placeholder="Minutes / day"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            returnKeyType="done"
            onSubmitEditing={handleAdd}
            style={[styles.input, { flex: 1 }]}
          />
          <Pressable
            onPress={handleAdd}
            disabled={!canAdd}
            style={({ pressed }) => [
              styles.addBtn,
              !canAdd && styles.addBtnDisabled,
              pressed && { opacity: 0.9 },
            ]}>
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.hint}>Optional per-channel time cap, separate from the global daily limit.</Text>
    </Card>
  );
}

function TestAccessSection() {
  const { state } = useFocus();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [decision, setDecision] = useState<AccessDecision | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const run = async () => {
    setParseError(null);
    setDecision(null);
    const id = extractVideoId(input);
    if (!id) {
      setParseError('Could not extract a video ID. Paste a YouTube URL or 11-char ID.');
      return;
    }
    setLoading(true);
    const d = await decideAccess(id, state);
    setLoading(false);
    setDecision(d);
  };

  const desc = decision ? describeDecision(decision) : null;
  const allowed = decision?.allowed ?? false;
  const isFocusOff = decision?.reason === 'focus_off';

  return (
    <Card icon="checkmark-done-circle-outline" title="Test Access">
      <Text style={styles.testHint}>
        Paste a YouTube URL to see what the filter would do right now, given Focus Mode and your current limits.
      </Text>
      <TextInput
        value={input}
        onChangeText={(v) => { setInput(v); setParseError(null); }}
        placeholder="https://youtube.com/watch?v=..."
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="go"
        onSubmitEditing={run}
        style={styles.input}
      />
      <Pressable
        onPress={run}
        disabled={loading || !input.trim()}
        style={({ pressed }) => [
          styles.testBtn,
          (loading || !input.trim()) && styles.testBtnDisabled,
          pressed && { opacity: 0.9 },
          { marginTop: 10 },
        ]}>
        {loading ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.testBtnText}>Check Access</Text>}
      </Pressable>

      {parseError && <Text style={styles.errorText}>{parseError}</Text>}

      {decision && desc && (
        <View
          style={[
            styles.decisionCard,
            allowed ? styles.decisionAllowed : styles.decisionBlocked,
            isFocusOff && styles.decisionNeutral,
          ]}>
          <View
            style={[
              styles.decisionPill,
              allowed
                ? isFocusOff
                  ? styles.decisionPillNeutral
                  : styles.decisionPillAllowed
                : styles.decisionPillBlocked,
            ]}>
            <Text
              style={[
                styles.decisionPillText,
                allowed
                  ? isFocusOff
                    ? styles.decisionPillTextNeutral
                    : styles.decisionPillTextAllowed
                  : styles.decisionPillTextBlocked,
              ]}>
              {desc.headline}
            </Text>
          </View>
          {decision.video && (
            <>
              <Text style={styles.decisionTitle} numberOfLines={2}>{decision.video.title}</Text>
              <Text style={styles.decisionChannel}>{decision.video.channelTitle}</Text>
            </>
          )}
          <Text style={styles.decisionReason}>{desc.detail}</Text>
        </View>
      )}
    </Card>
  );
}

function Card({
  icon,
  title,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardIcon}>
          <Ionicons name={icon} size={15} color={colors.accent} />
        </View>
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 24 },

  pageTitle: { fontSize: 32, fontWeight: '800', color: colors.textPrimary, letterSpacing: -1, marginBottom: 4 },
  pageSub: { fontSize: 13, color: colors.textSecondary, marginBottom: 24 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    marginBottom: space.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadowSm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: space.md,
  },
  cardIcon: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },

  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: colors.textPrimary,
    fontSize: 14,
  },
  iconBtn: {
    width: 42,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDisabled: { backgroundColor: colors.neutral },
  addBtnText: { color: colors.textInverse, fontWeight: '700', fontSize: 13, letterSpacing: 0.2 },

  hint: { fontSize: 11, color: colors.textMuted, marginTop: 12, lineHeight: 16 },
  hintStrong: { color: colors.textSecondary, fontWeight: '600' },
  empty: { color: colors.textMuted, fontSize: 12, marginVertical: 4 },

  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  presetBtnActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  presetBtnText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  presetBtnTextActive: { color: colors.accent },

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

  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
  },
  listItemName: { color: colors.textPrimary, fontSize: 14, fontWeight: '600', letterSpacing: -0.2 },
  listItemMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  listItemRemove: { padding: 4 },
  listAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
  },
  listAvatarFallback: { alignItems: 'center', justifyContent: 'center' },

  selectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: radius.md,
  },

  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  toggleLabel: { color: colors.textPrimary, fontSize: 14, fontWeight: '600', letterSpacing: -0.2 },
  toggleDesc: { color: colors.textMuted, fontSize: 12, marginTop: 4, lineHeight: 16 },
  toggleDivider: { height: 1, backgroundColor: colors.divider, marginVertical: 14 },

  testHint: { color: colors.textSecondary, fontSize: 12, marginBottom: 10, lineHeight: 17 },
  testBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: 'center',
  },
  testBtnDisabled: { backgroundColor: colors.neutral },
  testBtnText: { color: colors.textInverse, fontWeight: '700', fontSize: 14, letterSpacing: 0.2 },
  errorText: { color: colors.danger, fontSize: 12, marginTop: 10 },

  decisionCard: {
    marginTop: 14,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  decisionAllowed: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  decisionBlocked: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerBorder },
  decisionNeutral: { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle },

  decisionPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginBottom: 10,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  decisionPillAllowed: { borderColor: colors.accentBorder },
  decisionPillBlocked: { borderColor: colors.dangerBorder },
  decisionPillNeutral: { borderColor: colors.borderSubtle },
  decisionPillText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  decisionPillTextAllowed: { color: colors.accent },
  decisionPillTextBlocked: { color: colors.danger },
  decisionPillTextNeutral: { color: colors.textSecondary },

  decisionTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '600', marginBottom: 4, lineHeight: 20 },
  decisionChannel: { color: colors.textSecondary, fontSize: 13, marginBottom: 8 },
  decisionReason: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },

  familyHint: { color: colors.textSecondary, fontSize: 13, marginBottom: 10, lineHeight: 18 },
  familyCodeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 14,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    marginBottom: 4,
  },
  familyCodeText: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 4,
    fontVariant: ['tabular-nums'],
  },

  childrenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  childrenTitle: {
    color: colors.textMuted,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
  },
  childAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  childAvatarText: { color: colors.textInverse, fontSize: 15, fontWeight: '700' },
  childEmail: { color: colors.textPrimary, fontSize: 14, fontWeight: '600', letterSpacing: -0.2 },
  childStatsRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 },
  childStat: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  childStatDivider: { color: colors.textMuted, fontSize: 12 },
  childStatSecondary: { color: colors.textMuted, fontSize: 11, marginTop: 2 },

  pendingWrap: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: radius.md,
    padding: 10,
    gap: 8,
  },
  pendingHeader: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
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

  linkCodeInput: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 4,
    textAlign: 'center',
    marginTop: 4,
  },
  linkBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },

  accountEmail: { color: colors.textSecondary, fontSize: 13, marginBottom: 12 },
  signOutBtn: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: 'center',
  },
  signOutText: { color: colors.danger, fontSize: 14, fontWeight: '700', letterSpacing: 0.2 },

  deleteBtn: {
    marginTop: 10,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: 'center',
  },
  deleteText: { color: colors.danger, fontSize: 13, fontWeight: '600', letterSpacing: 0.2 },
});
