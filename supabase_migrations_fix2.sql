-- ============================================================================
-- Fix: parent_quests.parent_user_id was NOT NULL but had no default, so
-- creating a quest from the client (which doesn't pass parent_user_id) failed
-- the row-level security WITH CHECK. Default it to auth.uid() so inserts
-- auto-fill correctly.
-- Run AFTER the previous fix. Idempotent.
-- ============================================================================

alter table public.parent_quests
  alter column parent_user_id set default auth.uid();
