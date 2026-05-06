-- ============================================================================
-- FocusFlow migrations: parent quests + per-child rule overrides
-- Run in Supabase SQL editor in order. Idempotent — safe to re-run.
-- ============================================================================

-- ─── parent_quests ──────────────────────────────────────────────────────────
-- Parent-authored bonus goals and extra-work tasks. Single table; UI groups
-- by `kind`. A parent owns the row; the children it applies to are tracked
-- in parent_quest_targets for clean multi-child fan-out.
create table if not exists public.parent_quests (
  id uuid primary key default gen_random_uuid(),
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('goal', 'extra_work')),
  title text not null,
  description text,
  reward_minutes integer not null check (reward_minutes >= 0),
  repeatable boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists parent_quests_parent_idx
  on public.parent_quests (parent_user_id) where archived_at is null;

-- ─── parent_quest_targets ───────────────────────────────────────────────────
-- Many-to-many: which children see which quest. Empty target set = "all my
-- children" (resolved at read time so adding a new child doesn't require
-- rewriting prior quests).
create table if not exists public.parent_quest_targets (
  quest_id uuid not null references public.parent_quests(id) on delete cascade,
  child_user_id uuid not null references auth.users(id) on delete cascade,
  primary key (quest_id, child_user_id)
);

create index if not exists parent_quest_targets_child_idx
  on public.parent_quest_targets (child_user_id);

-- ─── parent_quest_claims ────────────────────────────────────────────────────
-- Kid submits → parent reviews → minutes mint on approval. Mirrors the
-- assignment claim flow.
create table if not exists public.parent_quest_claims (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null references public.parent_quests(id) on delete cascade,
  child_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending_review' check (status in ('pending_review','completed','rejected')),
  claimed_at timestamptz not null default now(),
  reviewed_at timestamptz,
  parent_note text,
  minutes_earned integer not null default 0
);

create index if not exists parent_quest_claims_quest_idx on public.parent_quest_claims (quest_id);
create index if not exists parent_quest_claims_child_idx on public.parent_quest_claims (child_user_id);
create index if not exists parent_quest_claims_status_idx on public.parent_quest_claims (status);

-- ─── child_overrides ────────────────────────────────────────────────────────
-- Per-child overrides for currently-global parent settings. NULL = inherit.
create table if not exists public.child_overrides (
  child_user_id uuid primary key references auth.users(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  daily_limit_minutes integer check (daily_limit_minutes is null or daily_limit_minutes between 0 and 1440),
  lock_until_assignments_complete boolean,
  assignment_lock_threshold integer check (assignment_lock_threshold is null or assignment_lock_threshold between 1 and 50),
  updated_at timestamptz not null default now()
);

create index if not exists child_overrides_parent_idx on public.child_overrides (parent_user_id);

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.parent_quests enable row level security;
alter table public.parent_quest_targets enable row level security;
alter table public.parent_quest_claims enable row level security;
alter table public.child_overrides enable row level security;

-- parent_quests: parent CRUDs own; child reads quests targeting them
drop policy if exists "parent_quests_parent_all" on public.parent_quests;
create policy "parent_quests_parent_all" on public.parent_quests
  for all using (parent_user_id = auth.uid()) with check (parent_user_id = auth.uid());

drop policy if exists "parent_quests_child_read" on public.parent_quests;
create policy "parent_quests_child_read" on public.parent_quests
  for select using (
    archived_at is null
    and exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.parent_id = parent_quests.parent_user_id
    )
    and (
      -- Empty target set = applies to all linked kids
      not exists (select 1 from public.parent_quest_targets t where t.quest_id = parent_quests.id)
      or exists (
        select 1 from public.parent_quest_targets t
        where t.quest_id = parent_quests.id and t.child_user_id = auth.uid()
      )
    )
  );

-- parent_quest_targets: parent manages own quests' targets; child can read
-- targets for quests addressed to them (allows the SELECT-with-check above)
drop policy if exists "parent_quest_targets_parent_all" on public.parent_quest_targets;
create policy "parent_quest_targets_parent_all" on public.parent_quest_targets
  for all using (
    exists (
      select 1 from public.parent_quests q
      where q.id = parent_quest_targets.quest_id and q.parent_user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.parent_quests q
      where q.id = parent_quest_targets.quest_id and q.parent_user_id = auth.uid()
    )
  );

drop policy if exists "parent_quest_targets_child_read" on public.parent_quest_targets;
create policy "parent_quest_targets_child_read" on public.parent_quest_targets
  for select using (child_user_id = auth.uid());

-- parent_quest_claims: child does INSERT for self; parent reads/updates own kids' rows
drop policy if exists "parent_quest_claims_child_select" on public.parent_quest_claims;
create policy "parent_quest_claims_child_select" on public.parent_quest_claims
  for select using (child_user_id = auth.uid());

drop policy if exists "parent_quest_claims_parent_select" on public.parent_quest_claims;
create policy "parent_quest_claims_parent_select" on public.parent_quest_claims
  for select using (
    exists (
      select 1 from public.profiles p
      where p.user_id = parent_quest_claims.child_user_id and p.parent_id = auth.uid()
    )
  );

-- Inserts/updates are gated through RPCs below; deny direct writes for safety
drop policy if exists "parent_quest_claims_no_direct_write" on public.parent_quest_claims;
create policy "parent_quest_claims_no_direct_write" on public.parent_quest_claims
  for insert with check (false);

-- child_overrides: parent manages own kids' rows; child reads own row
drop policy if exists "child_overrides_parent_all" on public.child_overrides;
create policy "child_overrides_parent_all" on public.child_overrides
  for all using (parent_user_id = auth.uid()) with check (parent_user_id = auth.uid());

drop policy if exists "child_overrides_child_select" on public.child_overrides;
create policy "child_overrides_child_select" on public.child_overrides
  for select using (child_user_id = auth.uid());

-- ============================================================================
-- RPCs
-- ============================================================================

-- claim_quest: kid submits a quest. Validates the quest targets them, that
-- it's not archived, and (for non-repeatable) that they haven't already
-- claimed it. Returns the created claim id.
create or replace function public.claim_quest(p_quest_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child uuid := auth.uid();
  v_quest record;
  v_existing uuid;
  v_claim_id uuid;
begin
  if v_child is null then raise exception 'not authenticated'; end if;

  select * into v_quest from public.parent_quests where id = p_quest_id and archived_at is null;
  if not found then raise exception 'quest not found'; end if;

  -- Quest must target this child (empty target set = all the parent's kids)
  if not exists (
    select 1 from public.profiles p
    where p.user_id = v_child and p.parent_id = v_quest.parent_user_id
  ) then
    raise exception 'not your parents quest';
  end if;

  if exists (select 1 from public.parent_quest_targets t where t.quest_id = p_quest_id)
     and not exists (
       select 1 from public.parent_quest_targets t
       where t.quest_id = p_quest_id and t.child_user_id = v_child
     ) then
    raise exception 'this quest is not assigned to you';
  end if;

  -- Repeatable=false → only one non-rejected claim allowed per child
  if not v_quest.repeatable then
    select id into v_existing from public.parent_quest_claims
    where quest_id = p_quest_id and child_user_id = v_child and status <> 'rejected'
    limit 1;
    if found then raise exception 'already claimed'; end if;
  else
    -- Repeatable: prevent stacking of pending claims (must wait for review)
    select id into v_existing from public.parent_quest_claims
    where quest_id = p_quest_id and child_user_id = v_child and status = 'pending_review'
    limit 1;
    if found then raise exception 'already submitted, awaiting review'; end if;
  end if;

  insert into public.parent_quest_claims (quest_id, child_user_id, minutes_earned)
  values (p_quest_id, v_child, v_quest.reward_minutes)
  returning id into v_claim_id;

  return v_claim_id;
end $$;

grant execute on function public.claim_quest(uuid) to authenticated;

-- approve_quest_claim: parent approves a pending claim, minting reward minutes.
create or replace function public.approve_quest_claim(p_claim_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent uuid := auth.uid();
  v_claim record;
  v_quest record;
begin
  if v_parent is null then raise exception 'not authenticated'; end if;

  select * into v_claim from public.parent_quest_claims where id = p_claim_id;
  if not found then raise exception 'claim not found'; end if;
  if v_claim.status <> 'pending_review' then raise exception 'claim already reviewed'; end if;

  select * into v_quest from public.parent_quests where id = v_claim.quest_id;
  if v_quest.parent_user_id <> v_parent then raise exception 'not your quest'; end if;

  update public.parent_quest_claims
    set status = 'completed',
        reviewed_at = now(),
        minutes_earned = v_quest.reward_minutes
    where id = p_claim_id;
end $$;

grant execute on function public.approve_quest_claim(uuid) to authenticated;

-- reject_quest_claim: parent rejects with optional note.
create or replace function public.reject_quest_claim(p_claim_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent uuid := auth.uid();
  v_claim record;
  v_quest record;
begin
  if v_parent is null then raise exception 'not authenticated'; end if;

  select * into v_claim from public.parent_quest_claims where id = p_claim_id;
  if not found then raise exception 'claim not found'; end if;
  if v_claim.status <> 'pending_review' then raise exception 'claim already reviewed'; end if;

  select * into v_quest from public.parent_quests where id = v_claim.quest_id;
  if v_quest.parent_user_id <> v_parent then raise exception 'not your quest'; end if;

  update public.parent_quest_claims
    set status = 'rejected',
        reviewed_at = now(),
        parent_note = p_note,
        minutes_earned = 0
    where id = p_claim_id;
end $$;

grant execute on function public.reject_quest_claim(uuid, text) to authenticated;

-- upsert_child_override: parent sets/clears overrides for one of their kids.
-- Pass NULL to a column to inherit the parent default for that field.
create or replace function public.upsert_child_override(
  p_child_user_id uuid,
  p_daily_limit_minutes integer default null,
  p_lock_until_assignments_complete boolean default null,
  p_assignment_lock_threshold integer default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent uuid := auth.uid();
begin
  if v_parent is null then raise exception 'not authenticated'; end if;

  if not exists (
    select 1 from public.profiles p
    where p.user_id = p_child_user_id and p.parent_id = v_parent
  ) then
    raise exception 'not your child';
  end if;

  insert into public.child_overrides (
    child_user_id, parent_user_id,
    daily_limit_minutes, lock_until_assignments_complete, assignment_lock_threshold,
    updated_at
  )
  values (
    p_child_user_id, v_parent,
    p_daily_limit_minutes, p_lock_until_assignments_complete, p_assignment_lock_threshold,
    now()
  )
  on conflict (child_user_id) do update set
    daily_limit_minutes = excluded.daily_limit_minutes,
    lock_until_assignments_complete = excluded.lock_until_assignments_complete,
    assignment_lock_threshold = excluded.assignment_lock_threshold,
    updated_at = now();
end $$;

grant execute on function public.upsert_child_override(uuid, integer, boolean, integer) to authenticated;
