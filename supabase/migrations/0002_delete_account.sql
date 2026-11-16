-- Gur: a player can delete their own account.
--
-- Run this once in the Supabase project: Dashboard > SQL Editor > paste > Run.
-- It is safe to run again.
--
-- Deleting the sign-in (the row in auth.users) takes everything kept with it along:
-- the profile goes too, because it belongs to that row (on delete cascade).

-- Deletes the account of whoever calls it, and only theirs: there is nobody else to name.
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
