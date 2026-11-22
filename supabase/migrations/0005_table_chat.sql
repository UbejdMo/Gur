-- Gur: the chat at a table.
--
-- Applied by the Deploy workflow after a merge; never change this file afterwards.
-- The chat itself lives on the game server and is never kept here. The game server asks the
-- database for two things: starring out words on the owner's list (for guests too), and
-- filing a report about a player at the table, with what they said there.

-- Stars out the words on the blocked list in a piece of text, as whole words, in any letter
-- case, exactly as send_message does. Anyone may call it: it gives nothing away but stars.
create or replace function public.star_out(message text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cleaned text := coalesce(message, '');
  bad text;
begin
  if char_length(cleaned) > 1000 then
    return left(cleaned, 1000);
  end if;
  for bad in select w.word from public.blocked_words w loop
    cleaned := regexp_replace(cleaned, '\m' || bad || '\M', repeat('*', char_length(bad)), 'gi');
  end loop;
  return cleaned;
end;
$$;

-- What the reported player said at the table, as the game server passed it on.
alter table public.reports add column if not exists table_chat jsonb;

-- Reports a player you met at a table. As report_player, plus `said`: what they said there
-- (at most 20 lines of at most 200 characters), kept with the report. Same answers as
-- report_player.
create or replace function public.report_table_player(who uuid, why text, note text, said jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  them public.profiles%rowtype;
  said_lines jsonb;
  remark text := nullif(btrim(coalesce(note, '')), '');
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  if why is null or why not in ('harassment', 'hate', 'spam', 'name_or_picture', 'cheating', 'other')
    or char_length(coalesce(remark, '')) > 500 then
    return 'invalid';
  end if;
  -- Only a list of short lines is kept; anything else is left out.
  if said is not null and jsonb_typeof(said) = 'array' then
    select coalesce(jsonb_agg(left(x.value, 200)), '[]'::jsonb) into said_lines
    from (
      select e.value, e.ordinality from jsonb_array_elements_text(said) with ordinality e
      order by e.ordinality desc limit 20
    ) x;
  else
    said_lines := '[]'::jsonb;
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

  insert into public.reports (reporter, reported, reported_username, reported_public_id, reason, details, table_chat)
  values (me, them.id, them.username, them.public_id, why, remark, said_lines);
  delete from public.reports r where r.created_at < now() - interval '1 year';
  return 'sent';
end;
$$;

revoke all on function public.star_out(text) from public;
grant execute on function public.star_out(text) to anon, authenticated;
revoke all on function public.report_table_player(uuid, text, text, jsonb) from public, anon;
grant execute on function public.report_table_player(uuid, text, text, jsonb) to authenticated;
