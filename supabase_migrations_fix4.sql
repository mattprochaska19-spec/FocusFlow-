-- ============================================================================
-- Tooltip + walkthrough state on profiles. Both belong server-side so they
-- persist across devices and reinstalls — a parent who completes the
-- walkthrough on their phone shouldn't see it again on a tablet.
-- ============================================================================

alter table public.profiles
  add column if not exists dismissed_tooltips text[] not null default '{}',
  add column if not exists walkthrough_completed_at timestamptz;

-- Idempotent dismiss: appends a tooltip id to the user's dismissed array
-- if it isn't already there. Bypasses the need to round-trip a select +
-- update on the client.
create or replace function public.dismiss_tooltip(p_tooltip_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update public.profiles
    set dismissed_tooltips =
      case
        when p_tooltip_id = any(dismissed_tooltips) then dismissed_tooltips
        else array_append(dismissed_tooltips, p_tooltip_id)
      end
    where user_id = auth.uid();
end $$;

grant execute on function public.dismiss_tooltip(text) to authenticated;

-- Mark the parent walkthrough as complete. No-op if already set.
create or replace function public.mark_walkthrough_complete()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update public.profiles
    set walkthrough_completed_at = coalesce(walkthrough_completed_at, now())
    where user_id = auth.uid();
end $$;

grant execute on function public.mark_walkthrough_complete() to authenticated;
