-- Gur: messages between friends, blocking, and reporting.
--
-- Applied by the Deploy workflow after a merge; never change this file afterwards.
-- As with friends, nobody reads or writes these tables directly: everything goes through the
-- functions below, which only ever act for the player who calls them.

-- ---------- blocking ----------

-- `blocker` does not want anything to do with `blocked`: no friendship, no requests, no
-- messages, either way. Only the blocker knows.
create table if not exists public.blocks (
  blocker uuid not null references public.profiles (id) on delete cascade,
  blocked uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  constraint blocks_not_yourself check (blocker <> blocked)
);
create index if not exists blocks_by_blocked on public.blocks (blocked);
alter table public.blocks enable row level security;
revoke all on public.blocks from public, anon, authenticated;

-- ---------- messages ----------

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  sender uuid not null references public.profiles (id) on delete cascade,
  recipient uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint messages_body_length check (char_length(body) between 1 and 500),
  constraint messages_not_yourself check (sender <> recipient)
);
create index if not exists messages_by_pair
  on public.messages (least(sender, recipient), greatest(sender, recipient), id desc);
create index if not exists messages_unread on public.messages (recipient) where read_at is null;
create index if not exists messages_by_sender on public.messages (sender, created_at desc);
alter table public.messages enable row level security;
revoke all on public.messages from public, anon, authenticated;

-- Words that are starred out of messages ("idiot" -> "*****"), whole words, any letter case.
-- The game's owner keeps this list in the Supabase dashboard (Table Editor > blocked_words).
create table if not exists public.blocked_words (
  word text primary key,
  constraint blocked_words_shape check (word = lower(word) and word ~ '^[[:alnum:]]+( [[:alnum:]]+)*$')
);
alter table public.blocked_words enable row level security;
revoke all on public.blocked_words from public, anon, authenticated;

-- ---------- reports ----------

-- What a player reported about another, for the game's owner to look at in the Supabase
-- dashboard (Table Editor > reports). The reported player's name and ID, and the last
-- messages between the two, are copied in, so the report still says what happened if an
-- account is deleted afterwards. Reports are deleted a year after they were made.
create table if not exists public.reports (
  id bigint generated always as identity primary key,
  reporter uuid references public.profiles (id) on delete set null,
  reported uuid references public.profiles (id) on delete set null,
  reported_username text not null,
  reported_public_id text not null,
  reason text not null,
  details text,
  recent_messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  handled boolean not null default false,
  constraint reports_reason check (reason in ('harassment', 'hate', 'spam', 'name_or_picture', 'cheating', 'other')),
  constraint reports_details_length check (details is null or char_length(details) <= 500)
);
create index if not exists reports_by_reporter on public.reports (reporter, created_at desc);
create index if not exists reports_by_age on public.reports (created_at);
alter table public.reports enable row level security;
revoke all on public.reports from public, anon, authenticated;

-- ---------- helpers (not callable by players) ----------

-- Whether either of the two blocked the other.
create or replace function public.blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks k
    where (k.blocker = a and k.blocked = b) or (k.blocker = b and k.blocked = a)
  );
$$;
revoke all on function public.blocked_between(uuid, uuid) from public, anon, authenticated;

-- ---------- friends, again: a block keeps requests out ----------

-- As in 0003_friends.sql, plus two answers:
--   blocked     you blocked that player; unblock them first
--   not_found   also when that player blocked you, so a block is never given away
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
  if exists (select 1 from public.blocks k where k.blocker = me and k.blocked = them.id) then
    return query select 'blocked'::text, them.username;
    return;
  end if;
  if exists (select 1 from public.blocks k where k.blocker = them.id and k.blocked = me) then
    return query select 'not_found'::text, null::text;
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

  if (select count(*) from public.friendships f where f.requester = me or f.addressee = me) >= 200
    or (select count(*) from public.friendships f where f.requester = me and not f.accepted) >= 50 then
    return query select 'full'::text, them.username;
    return;
  end if;

  insert into public.friendships (requester, addressee) values (me, them.id);
  return query select 'sent'::text, them.username;
end;
$$;

-- ---------- blocking ----------

-- Blocks a player: ends any friendship or request between you. Does nothing for an
-- unknown player or yourself.
create or replace function public.block_player(who uuid)
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
  if who is null or who = me or not exists (select 1 from public.profiles p where p.id = who) then
    return;
  end if;
  insert into public.blocks (blocker, blocked) values (me, who) on conflict do nothing;
  delete from public.friendships f
  where (f.requester = me and f.addressee = who) or (f.requester = who and f.addressee = me);
end;
$$;

create or replace function public.unblock_player(who uuid)
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
  delete from public.blocks k where k.blocker = me and k.blocked = who;
end;
$$;

-- The players you blocked, newest first.
create or replace function public.my_blocks()
returns table (id uuid, public_id text, username text, avatar_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.public_id, p.username, p.avatar_url
  from public.blocks k
  join public.profiles p on p.id = k.blocked
  where k.blocker = auth.uid()
  order by k.created_at desc;
$$;

-- ---------- messages ----------

-- Sends a message to a friend. Answers with what happened, and the message as it was kept
-- (with any blocked words starred out):
--   sent          it is on its way
--   empty         there was nothing to send
--   too_long      more than 500 characters
--   not_friends   you can only write to your friends (also when either of you blocked the other)
--   too_fast      more than 20 messages in a minute
create or replace function public.send_message(to_player uuid, message text)
returns table (status text, id bigint, body text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  cleaned text := btrim(coalesce(message, ''));
  bad text;
  kept public.messages%rowtype;
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  if cleaned = '' then
    return query select 'empty'::text, null::bigint, null::text, null::timestamptz;
    return;
  end if;
  if char_length(cleaned) > 500 then
    return query select 'too_long'::text, null::bigint, null::text, null::timestamptz;
    return;
  end if;
  if to_player is null
    or not exists (
      select 1 from public.friendships f
      where f.accepted and ((f.requester = me and f.addressee = to_player) or (f.requester = to_player and f.addressee = me))
    )
    or public.blocked_between(me, to_player) then
    return query select 'not_friends'::text, null::bigint, null::text, null::timestamptz;
    return;
  end if;
  if (select count(*) from public.messages m where m.sender = me and m.created_at > now() - interval '1 minute') >= 20 then
    return query select 'too_fast'::text, null::bigint, null::text, null::timestamptz;
    return;
  end if;

  for bad in select w.word from public.blocked_words w loop
    cleaned := regexp_replace(cleaned, '\m' || bad || '\M', repeat('*', char_length(bad)), 'gi');
  end loop;

  insert into public.messages as m (sender, recipient, body) values (me, to_player, cleaned) returning m.* into kept;
  -- Housekeeping: reports older than a year go.
  delete from public.reports r where r.created_at < now() - interval '1 year';
  return query select 'sent'::text, kept.id, kept.body, kept.created_at;
end;
$$;

-- The messages between you and another player, newest first, in pages: the next page is
-- the one before the oldest id you have (`before_id`). At most 100 at a time.
create or replace function public.conversation(other uuid, before_id bigint default null, max_rows integer default 50)
returns table (id bigint, from_me boolean, body text, created_at timestamptz, read_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.sender = auth.uid(), m.body, m.created_at, m.read_at
  from public.messages m
  where ((m.sender = auth.uid() and m.recipient = other) or (m.sender = other and m.recipient = auth.uid()))
    and (before_id is null or m.id < before_id)
  order by m.id desc
  limit least(greatest(coalesce(max_rows, 50), 1), 100);
$$;

-- Marks the messages another player sent you as read.
create or replace function public.mark_read(other uuid)
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
  update public.messages m set read_at = now()
  where m.sender = other and m.recipient = me and m.read_at is null;
end;
$$;

-- Everybody you have messages with, the latest conversation first: who, the last message,
-- and how many of theirs you have not read. Players you blocked are left out.
create or replace function public.my_conversations()
returns table (
  id uuid,
  public_id text,
  username text,
  avatar_url text,
  last_body text,
  last_at timestamptz,
  last_from_me boolean,
  unread integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.public_id, p.username, p.avatar_url, l.body, l.created_at, l.sender = auth.uid(),
    (select count(*)::integer from public.messages u
     where u.sender = p.id and u.recipient = auth.uid() and u.read_at is null)
  from (
    select distinct on (case when m.sender = auth.uid() then m.recipient else m.sender end)
      case when m.sender = auth.uid() then m.recipient else m.sender end as other,
      m.body, m.created_at, m.sender
    from public.messages m
    where m.sender = auth.uid() or m.recipient = auth.uid()
    order by case when m.sender = auth.uid() then m.recipient else m.sender end, m.id desc
  ) l
  join public.profiles p on p.id = l.other
  where not exists (select 1 from public.blocks k where k.blocker = auth.uid() and k.blocked = p.id)
  order by l.created_at desc;
$$;

-- ---------- reporting ----------

-- Reports a player to the game's owner. `why` is one of: harassment, hate, spam,
-- name_or_picture, cheating, other; `note` says more (up to 500 characters). Answers:
--   sent        the report is in
--   invalid     no such reason, or the note is too long
--   not_found   no such player
--   yourself    that is you
--   too_many    more than 10 reports in a day
create or replace function public.report_player(who uuid, why text, note text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  them public.profiles%rowtype;
  said text := nullif(btrim(coalesce(note, '')), '');
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  if why is null or why not in ('harassment', 'hate', 'spam', 'name_or_picture', 'cheating', 'other')
    or char_length(coalesce(said, '')) > 500 then
    return 'invalid';
  end if;
  select p.* into them from public.profiles p where p.id = who;
  if not found then
    return 'not_found';
  end if;
  if them.id = me then
    return 'yourself';
  end if;
  if (select count(*) from public.reports r where r.reporter = me and r.created_at > now() - interval '1 day') >= 10 then
    return 'too_many';
  end if;

  insert into public.reports (reporter, reported, reported_username, reported_public_id, reason, details, recent_messages)
  values (
    me, them.id, them.username, them.public_id, why, said,
    coalesce((
      select jsonb_agg(jsonb_build_object('from', case when x.sender = me then 'reporter' else 'reported' end,
                                          'body', x.body, 'at', x.created_at) order by x.id)
      from (
        select m.id, m.sender, m.body, m.created_at from public.messages m
        where (m.sender = me and m.recipient = them.id) or (m.sender = them.id and m.recipient = me)
        order by m.id desc
        limit 20
      ) x
    ), '[]'::jsonb)
  );
  delete from public.reports r where r.created_at < now() - interval '1 year';
  return 'sent';
end;
$$;

-- ---------- who may call what ----------

revoke all on function public.block_player(uuid) from public, anon;
revoke all on function public.unblock_player(uuid) from public, anon;
revoke all on function public.my_blocks() from public, anon;
revoke all on function public.send_message(uuid, text) from public, anon;
revoke all on function public.conversation(uuid, bigint, integer) from public, anon;
revoke all on function public.mark_read(uuid) from public, anon;
revoke all on function public.my_conversations() from public, anon;
revoke all on function public.report_player(uuid, text, text) from public, anon;
grant execute on function public.block_player(uuid) to authenticated;
grant execute on function public.unblock_player(uuid) to authenticated;
grant execute on function public.my_blocks() to authenticated;
grant execute on function public.send_message(uuid, text) to authenticated;
grant execute on function public.conversation(uuid, bigint, integer) to authenticated;
grant execute on function public.mark_read(uuid) to authenticated;
grant execute on function public.my_conversations() to authenticated;
grant execute on function public.report_player(uuid, text, text) to authenticated;
