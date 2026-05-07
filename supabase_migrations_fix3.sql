-- ============================================================================
-- Add classroom_account_email visibility to profiles so parents can see
-- which of their kids have a school Google Classroom account linked.
--
-- The kid's device writes the email when they link Classroom (Settings →
-- School Classroom Account); the parent's Family tab reads it via the new
-- RPC below to render a per-child status badge. OAuth tokens themselves
-- stay device-local — only the email is shared, so a Supabase breach
-- doesn't expose access to anyone's school account.
-- ============================================================================

alter table public.profiles
  add column if not exists classroom_account_email text;

-- Parent-only RPC: returns each linked child's classroom email (or null).
-- SECURITY DEFINER so the parent can read across their kids' profiles
-- without needing a permissive cross-row RLS policy on the profiles table.
create or replace function public.get_child_classroom_emails()
returns table(user_id uuid, email text)
language sql
security definer
stable
set search_path = public
as $$
  select p.user_id, p.classroom_account_email
  from public.profiles p
  where p.parent_id = auth.uid();
$$;

grant execute on function public.get_child_classroom_emails() to authenticated;
