import { supabase } from './supabase';

export type QuestKind = 'goal' | 'extra_work';
export type QuestClaimStatus = 'pending_review' | 'completed' | 'rejected';

export type ParentQuest = {
  id: string;
  parentUserId: string;
  kind: QuestKind;
  title: string;
  description: string | null;
  rewardMinutes: number;
  repeatable: boolean;
  archivedAt: string | null;
  createdAt: string;
  // child user_ids this quest targets; empty = all linked kids
  targets: string[];
};

export type QuestClaim = {
  id: string;
  questId: string;
  childUserId: string;
  status: QuestClaimStatus;
  claimedAt: string;
  reviewedAt: string | null;
  parentNote: string | null;
  minutesEarned: number;
};

type QuestRow = {
  id: string;
  parent_user_id: string;
  kind: QuestKind;
  title: string;
  description: string | null;
  reward_minutes: number;
  repeatable: boolean;
  archived_at: string | null;
  created_at: string;
};

type TargetRow = { quest_id: string; child_user_id: string };

type ClaimRow = {
  id: string;
  quest_id: string;
  child_user_id: string;
  status: QuestClaimStatus;
  claimed_at: string;
  reviewed_at: string | null;
  parent_note: string | null;
  minutes_earned: number;
};

function mapQuest(row: QuestRow, targets: string[]): ParentQuest {
  return {
    id: row.id,
    parentUserId: row.parent_user_id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    rewardMinutes: row.reward_minutes,
    repeatable: row.repeatable,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    targets,
  };
}

function mapClaim(row: ClaimRow): QuestClaim {
  return {
    id: row.id,
    questId: row.quest_id,
    childUserId: row.child_user_id,
    status: row.status,
    claimedAt: row.claimed_at,
    reviewedAt: row.reviewed_at,
    parentNote: row.parent_note,
    minutesEarned: row.minutes_earned,
  };
}

// Loads quests visible to the caller (RLS handles parent vs child scope) and
// joins their target rows. Returns active quests only — archived ones are
// hidden by the RLS policy for kids and filtered here for parents.
export async function fetchQuests(): Promise<{ quests: ParentQuest[]; error?: string }> {
  const [questsRes, targetsRes] = await Promise.all([
    supabase.from('parent_quests').select('*').is('archived_at', null).order('created_at', { ascending: false }),
    supabase.from('parent_quest_targets').select('*'),
  ]);

  if (questsRes.error) return { quests: [], error: questsRes.error.message };
  if (targetsRes.error) return { quests: [], error: targetsRes.error.message };

  const targetsByQuest = new Map<string, string[]>();
  for (const t of (targetsRes.data ?? []) as TargetRow[]) {
    const list = targetsByQuest.get(t.quest_id) ?? [];
    list.push(t.child_user_id);
    targetsByQuest.set(t.quest_id, list);
  }

  return {
    quests: ((questsRes.data ?? []) as QuestRow[]).map((q) =>
      mapQuest(q, targetsByQuest.get(q.id) ?? []),
    ),
  };
}

// Loads quest claims visible to the caller (parents see their kids', kids see own).
export async function fetchQuestClaims(): Promise<{ claims: QuestClaim[]; error?: string }> {
  const { data, error } = await supabase
    .from('parent_quest_claims')
    .select('*')
    .order('claimed_at', { ascending: false });
  if (error) return { claims: [], error: error.message };
  return { claims: ((data ?? []) as ClaimRow[]).map(mapClaim) };
}

// Parent: create a new quest. targetChildIds=[] means "all my kids".
export async function createQuest(input: {
  kind: QuestKind;
  title: string;
  description?: string | null;
  rewardMinutes: number;
  repeatable: boolean;
  targetChildIds: string[];
}): Promise<{ id?: string; error?: string }> {
  const { data, error } = await supabase
    .from('parent_quests')
    .insert({
      kind: input.kind,
      title: input.title,
      description: input.description ?? null,
      reward_minutes: input.rewardMinutes,
      repeatable: input.repeatable,
    })
    .select('id')
    .single();
  if (error || !data) return { error: error?.message ?? 'create failed' };

  if (input.targetChildIds.length > 0) {
    const rows = input.targetChildIds.map((cid) => ({ quest_id: data.id, child_user_id: cid }));
    const { error: tErr } = await supabase.from('parent_quest_targets').insert(rows);
    if (tErr) return { error: tErr.message };
  }
  return { id: data.id };
}

// Parent: update an existing quest's targets (replace-all semantics).
export async function setQuestTargets(questId: string, targetChildIds: string[]): Promise<{ error?: string }> {
  const del = await supabase.from('parent_quest_targets').delete().eq('quest_id', questId);
  if (del.error) return { error: del.error.message };
  if (targetChildIds.length === 0) return {};
  const rows = targetChildIds.map((cid) => ({ quest_id: questId, child_user_id: cid }));
  const { error } = await supabase.from('parent_quest_targets').insert(rows);
  if (error) return { error: error.message };
  return {};
}

// Parent: edit core fields (title, description, reward, repeatable).
export async function updateQuest(
  questId: string,
  patch: { title?: string; description?: string | null; rewardMinutes?: number; repeatable?: boolean },
): Promise<{ error?: string }> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.title !== undefined) dbPatch.title = patch.title;
  if (patch.description !== undefined) dbPatch.description = patch.description;
  if (patch.rewardMinutes !== undefined) dbPatch.reward_minutes = patch.rewardMinutes;
  if (patch.repeatable !== undefined) dbPatch.repeatable = patch.repeatable;
  if (Object.keys(dbPatch).length === 0) return {};
  const { error } = await supabase.from('parent_quests').update(dbPatch).eq('id', questId);
  if (error) return { error: error.message };
  return {};
}

// Parent: soft-delete (archive) a quest. Existing claims are preserved.
export async function archiveQuest(questId: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('parent_quests')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', questId);
  if (error) return { error: error.message };
  return {};
}

// Kid: claim a quest (creates a pending_review claim).
export async function claimQuest(questId: string): Promise<{ id?: string; error?: string }> {
  const { data, error } = await supabase.rpc('claim_quest', { p_quest_id: questId });
  if (error) return { error: error.message };
  return { id: data as string };
}

// Parent: approve a pending claim → mints reward minutes.
export async function approveQuestClaim(claimId: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('approve_quest_claim', { p_claim_id: claimId });
  if (error) return { error: error.message };
  return {};
}

// Parent: reject a pending claim with optional note.
export async function rejectQuestClaim(claimId: string, note?: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('reject_quest_claim', {
    p_claim_id: claimId,
    p_note: note ?? null,
  });
  if (error) return { error: error.message };
  return {};
}
