-- Gur: friends.
--
-- A player asks another to be friends, by username or by player ID; the other accepts or
-- declines. Applied by the Deploy workflow after a merge; never change this file afterwards.
--
-- One row per pair of players: `requester` asked `addressee`. It is a friendship once
-- `accepted` is true, and a request waiting for an answer until then.

create table if not exists public.friendships (
  requester uuid not null references public.profiles (id) on delete cascade,
  addressee uuid not null references public.profiles (id) on delete cascade,
  accepted boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  constraint friendships_not_yourself check (requester <> addressee)
);

-- Two players have one row between them, whoever asked.
create unique index if not exists friendships_one_per_pair
  on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index if not exists friendships_by_addressee on public.friendships (addressee);

-- Nobody reads or writes the table directly: everything goes through the functions below,
-- which only ever act for the player who calls them.
alter table public.friendships enable row level security;
revoke all on public.friendships from public, anon, authenticated;

-- Asks a player to be friends. `who` is their username (in any letter case) or their
-- eight-digit ID. Answers with what happened and the name of the player it found:
--   sent        the request is on its way
--   friends     they had already asked you, so you are friends now
--   already     you are friends already
--   waiting     you asked before and they have not answered yet
--   not_found   nobody has that name or ID
--   yourself    that is you
--   full        you have too many friends and requests, or too many unanswered requests
create or replace function public.add_friend(who text)
returns table (status text, username text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  wanted text := btrim(coalesce(who, ''));
  them public.profiles%rowtype;
  between_us public.friendships%rowtype;
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;

  -- An ID is looked for first, so a name made of eight digits cannot stand in the way of one.
  select p.* into them from public.profiles p where p.public_id = wanted;
  if not found then
    select p.* into them from public.profiles p where lower(p.username) = lower(wanted);
  end if;
  if not found then
    return query select 'not_found'::text, null::text;
    return;
  end if;
  if them.id = me then
    return query select 'yourself'::text, them.username;
    return;
  end if;

  select f.* into between_us from public.friendships f
  where (f.requester = me and f.addressee = them.id) or (f.requester = them.id and f.addressee = me);
  if found then
    if between_us.accepted then
      return query select 'already'::text, them.username;
    elsif between_us.requester = me then
      return query select 'waiting'::text, them.username;
    else
      update public.friendships f set accepted = true where f.requester = them.id and f.addressee = me;
      return query select 'friends'::text, them.username;
    end if;
    return;
  end if;

  -- Limits, so that nobody can flood others with requests.
  if (select count(*) from public.friendships f where f.requester = me or f.addressee = me) >= 200
    or (select count(*) from public.friendships f where f.requester = me and not f.accepted) >= 50 then
    return query select 'full'::text, them.username;
    return;
  end if;

  insert into public.friendships (requester, addressee) values (me, them.id);
  return query select 'sent'::text, them.username;
end;
$$;

-- Accepts the request that `who` sent you. Does nothing if there is none.
create or replace function public.accept_friend(who uuid)
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
  update public.friendships f set accepted = true where f.requester = who and f.addressee = me;
end;
$$;

-- Ends whatever is between you and `who`: a friendship, a request you sent (taking it back)
-- or a request they sent (declining it). The other player is not told.
create or replace function public.remove_friend(who uuid)
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
  delete from public.friendships f
  where (f.requester = me and f.addressee = who) or (f.requester = who and f.addressee = me);
end;
$$;

-- Your friends and requests, each with the other player's profile:
--   incoming   they asked you
--   friend     you are friends
--   outgoing   you asked them
create or replace function public.my_friends()
returns table (id uuid, public_id text, username text, avatar_url text, state text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  return query
    select x.id, x.public_id, x.username, x.avatar_url, x.state
    from (
      select p.id, p.public_id, p.username, p.avatar_url,
        case when f.accepted then 'friend' when f.addressee = me then 'incoming' else 'outgoing' end as state
      from public.friendships f
      join public.profiles p on p.id = case when f.requester = me then f.addressee else f.requester end
      where f.requester = me or f.addressee = me
    ) x
    order by x.state = 'incoming' desc, x.state = 'friend' desc, lower(x.username);
end;
$$;

revoke all on function public.add_friend(text) from public, anon;
revoke all on function public.accept_friend(uuid) from public, anon;
revoke all on function public.remove_friend(uuid) from public, anon;
revoke all on function public.my_friends() from public, anon;
grant execute on function public.add_friend(text) to authenticated;
grant execute on function public.accept_friend(uuid) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.my_friends() to authenticated;
