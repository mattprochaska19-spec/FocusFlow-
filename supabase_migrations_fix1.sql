-- ============================================================================
-- Fix: infinite recursion in parent_quests / parent_quest_targets RLS
-- Run this AFTER the initial migration. Idempotent — safe to re-run.
--
-- Cause: parent_quests policies queried parent_quest_targets, and
-- parent_quest_targets policies queried parent_quests, creating an evaluation
-- loop. The fix encapsulates each cross-table lookup in a SECURITY DEFINER
-- helper that bypasses RLS on the referenced table.
-- ============================================================================

-- ─── Helpers (SECURITY DEFINER bypass) ───────────────────────────────────────

-- Does the calling user own (= created) the given quest?
create or replace function public._user_owns_quest(p_quest_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from parent_quests
    where id = p_quest_id and parent_user_id = auth.uid()
  );
$$;

grant execute on function public._user_owns_quest(uuid) to authenticated;

-- Is the given quest visible to the calling user as a child target?
-- A quest with no targets is treated as "applies to all the parent's kids".
create or replace function public._quest_targets_caller(p_quest_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    not exists (select 1 from parent_quest_targets where quest_id = p_quest_id)
    or exists (
      select 1 from parent_quest_targets
      where quest_id = p_quest_id and child_user_id = auth.uid()
    );
$$;

grant execute on function public._quest_targets_caller(uuid) to authenticated;

-- ─── Re-create the two recursive policies using the helpers ─────────────────

drop policy if exists "parent_quests_child_read" on public.parent_quests;
create policy "parent_quests_child_read" on public.parent_quests
  for select using (
    archived_at is null
    and exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.parent_id = parent_quests.parent_user_id
    )
    and public._quest_targets_caller(parent_quests.id)
  );

drop policy if exists "parent_quest_targets_parent_all" on public.parent_quest_targets;
create policy "parent_quest_targets_parent_all" on public.parent_quest_targets
  for all
  using (public._user_owns_quest(parent_quest_targets.quest_id))
  with check (public._user_owns_quest(parent_quest_targets.quest_id));
