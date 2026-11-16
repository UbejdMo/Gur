-- Player profiles for Gur.
--
-- Every player who signs in gets one row here, made by itself on their first sign-in:
--   * username:  the name other players see. Unique, whatever the letter case. The player can change it.
--   * public_id: eight digits to give to a friend ("add me, I'm 48213377"). Never changes.
--   * avatar_url: the picture from their Google account.
--
-- Run this once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- It is safe to run again.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  public_id text not null unique,
  username text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  -- 3 to 16 letters, digits or underscores (letters of any alphabet: ë and ç are fine).
  constraint profiles_username_shape check (char_length(username) between 3 and 16 and username !~ '[^[:alnum:]_]'),
  constraint profiles_public_id_shape check (public_id ~ '^[0-9]{8}$')
);

-- "Ana" and "ana" are the same name.
create unique index if not exists profiles_username_unique on public.profiles (lower(username));

-- Who may do what. Profiles are public (a name, a picture, an id): anyone may read them.
-- A player may change only their own row, and in it only the name and the picture.
alter table public.profiles enable row level security;

drop policy if exists "Profiles can be read by anyone" on public.profiles;
create policy "Profiles can be read by anyone" on public.profiles for select using (true);

drop policy if exists "Players change their own profile" on public.profiles;
create policy "Players change their own profile" on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update (username, avatar_url) on public.profiles to authenticated;

-- Makes a player's profile. The username starts as their Google name without spaces
-- ("Ubejd Morina" -> "UbejdMorina"); if that is taken, four digits are added until a free one
-- is found. Only the database itself may call this: players cannot.
create or replace function public.new_profile(user_id uuid, meta jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  candidate text;
  new_id text;
begin
  base := regexp_replace(coalesce(meta ->> 'name', meta ->> 'full_name', ''), '[^[:alnum:]_]', '', 'g');
  if char_length(base) < 3 then
    base := 'Player';
  end if;
  candidate := left(base, 16);
  while exists (select 1 from public.profiles where lower(username) = lower(candidate)) loop
    candidate := left(base, 12) || (floor(random() * 9000) + 1000)::int::text;
  end loop;

  loop
    new_id := lpad(floor(random() * 100000000)::bigint::text, 8, '0');
    exit when not exists (select 1 from public.profiles where public_id = new_id);
  end loop;

  insert into public.profiles (id, public_id, username, avatar_url)
  values (user_id, new_id, candidate, coalesce(meta ->> 'avatar_url', meta ->> 'picture'));
end;
$$;

revoke all on function public.new_profile(uuid, jsonb) from public, anon, authenticated;

-- Makes the profile when somebody signs in for the first time.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.new_profile(new.id, coalesce(new.raw_user_meta_data, '{}'::jsonb));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Anyone who signed in before this was run gets their profile now.
do $$
declare
  missing record;
begin
  for missing in
    select u.id, u.raw_user_meta_data from auth.users u
    where not exists (select 1 from public.profiles p where p.id = u.id)
  loop
    perform public.new_profile(missing.id, coalesce(missing.raw_user_meta_data, '{}'::jsonb));
  end loop;
end;
$$;
