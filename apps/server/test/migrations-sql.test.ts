/**
 * Runs the migrations on a real Postgres (PGlite, in this process), in the order of their
 * names, and checks the rules they set up. Supabase's own parts (the auth schema, the roles, auth.uid()) are
 * stood in for by the few lines at the top.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const folder = fileURLToPath(new URL('../../../supabase/migrations/', import.meta.url));
const files = readdirSync(folder)
  .filter((name) => name.endsWith('.sql'))
  .sort();
const migration = files.map((name) => readFileSync(folder + name, 'utf8')).join('\n');

const SUPABASE_STAND_IN = readFileSync(fileURLToPath(new URL('./supabase-stand-in.sql', import.meta.url)), 'utf8');

const ANA = '00000000-0000-0000-0000-00000000000a';
const BEN = '00000000-0000-0000-0000-00000000000b';
/** Signed in before the migration was run. */
const EARLY = '00000000-0000-0000-0000-00000000000e';

let db: PGlite;
const profile = async (id: string) =>
  (
    await db.query<{ username: string; public_id: string; avatar_url: string | null }>(
      'select username, public_id, avatar_url from public.profiles where id = $1',
      [id],
    )
  ).rows[0]!;
const signUp = (id: string, meta: Record<string, string>) =>
  db.query('insert into auth.users (id, raw_user_meta_data) values ($1, $2)', [id, JSON.stringify(meta)]);

/** Runs statements as a signed-in player (or as a visitor when `user` is null). */
async function as(user: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`set role ${user ? 'authenticated' : 'anon'}; set request.uid = '${user ?? ''}';`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec(`reset role; reset request.uid;`);
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STAND_IN);
  await db.query('insert into auth.users (id, raw_user_meta_data) values ($1, $2)', [
    EARLY,
    JSON.stringify({ name: 'Early Bird' }),
  ]);
  await db.exec(migration);
});

describe('the migrations', () => {
  it('are numbered, so they run in the order they were written', () => {
    expect(files.length).toBeGreaterThan(1);
    files.forEach((name, i) => expect(name).toMatch(new RegExp(`^${String(i + 1).padStart(4, '0')}_[a-z_]+\\.sql$`)));
  });

  it('can be run a second time without harm', async () => {
    await expect(db.exec(migration)).resolves.toBeDefined();
  });

  it('gives a profile to anyone who signed in before it was run', async () => {
    expect(await profile(EARLY)).toMatchObject({ username: 'EarlyBird', public_id: expect.stringMatching(/^\d{8}$/) });
  });

  it('makes a profile on first sign-in: name without spaces, eight-digit id, the Google picture', async () => {
    await signUp(ANA, { name: 'Ana Krasniqi', avatar_url: 'https://example.com/ana.png' });
    const ana = await profile(ANA);
    expect(ana.username).toBe('AnaKrasniqi');
    expect(ana.public_id).toMatch(/^\d{8}$/);
    expect(ana.avatar_url).toBe('https://example.com/ana.png');
  });

  it('never gives two players the same name, whatever the letter case', async () => {
    await signUp(BEN, { full_name: 'ana krasniqi', picture: 'https://example.com/ben.png' });
    const ben = await profile(BEN);
    expect(ben.username).toMatch(/^anakrasniqi\d{4}$/);
    expect(ben.avatar_url).toBe('https://example.com/ben.png');
    expect(ben.public_id).not.toBe((await profile(ANA)).public_id);
  });

  it('copes with names it cannot use: too short, symbols only, very long, letters of other alphabets', async () => {
    const cases: [string, Record<string, string>, RegExp][] = [
      ['00000000-0000-0000-0000-000000000001', { name: 'Al' }, /^Player(\d{4})?$/],
      ['00000000-0000-0000-0000-000000000002', { name: '★ ☆ ★' }, /^Player\d{4}$/],
      ['00000000-0000-0000-0000-000000000003', {}, /^Player\d{4}$/],
      ['00000000-0000-0000-0000-000000000004', { name: 'Maximilian Alexander von Hohenzollern' }, /^MaximilianAlexan$/],
      ['00000000-0000-0000-0000-000000000005', { name: 'Çelë Shpëtim' }, /^ÇelëShpëtim$/],
    ];
    for (const [id, meta, expected] of cases) {
      await signUp(id, meta);
      const made = await profile(id);
      expect(made.username).toMatch(expected);
      expect(made.username.length).toBeLessThanOrEqual(16);
    }
  });

  it('lets anyone read profiles, signed in or not', async () => {
    const visitor = await as(null, 'select username from public.profiles where id = $1', [ANA]);
    expect(visitor.rows).toEqual([{ username: 'AnaKrasniqi' }]);
    const player = await as(BEN, 'select count(*)::int as n from public.profiles');
    expect((player.rows[0] as { n: number }).n).toBeGreaterThanOrEqual(2);
  });

  it('lets a player rename themselves, within the rules', async () => {
    await as(ANA, `update public.profiles set username = 'Ana_K' where id = $1`, [ANA]);
    expect((await profile(ANA)).username).toBe('Ana_K');
    // taken by somebody else, in another case
    const taken = (await profile(BEN)).username.toUpperCase();
    await expect(as(ANA, `update public.profiles set username = $2 where id = $1`, [ANA, taken])).rejects.toMatchObject(
      { code: '23505' },
    );
    for (const bad of ['ab', 'has space', 'way_too_long_a_name_', 'semi;colon']) {
      await expect(as(ANA, `update public.profiles set username = $2 where id = $1`, [ANA, bad])).rejects.toMatchObject(
        { code: '23514' },
      );
    }
    expect((await profile(ANA)).username).toBe('Ana_K');
  });

  it('does not let a player touch another profile, their own id, or anything as a visitor', async () => {
    // somebody else's row: the rule hides it, so nothing changes
    await as(ANA, `update public.profiles set username = 'Hacked' where id = $1`, [BEN]);
    expect((await profile(BEN)).username).not.toBe('Hacked');
    // the eight-digit id is not theirs to change
    await expect(as(ANA, `update public.profiles set public_id = '00000000' where id = $1`, [ANA])).rejects.toThrow(
      /permission denied/,
    );
    await expect(as(null, `update public.profiles set username = 'Visitor' where id = $1`, [ANA])).rejects.toThrow(
      /permission denied/,
    );
    await expect(as(ANA, `delete from public.profiles where id = $1`, [ANA])).rejects.toThrow(/permission denied/);
    // the database's own profile maker is not theirs to call
    for (const who of [ANA, null]) {
      await expect(as(who, `select public.new_profile($1, '{"name":"Sneaky"}')`, [BEN])).rejects.toThrow(
        /permission denied/,
      );
    }
    await expect(
      as(ANA, `insert into public.profiles (id, public_id, username) values ($1, '12345678', 'Extra')`, [ANA]),
    ).rejects.toThrow(/permission denied/);
  });

  it('removes the profile when the account is deleted', async () => {
    await db.query('delete from auth.users where id = $1', [BEN]);
    expect((await db.query('select 1 from public.profiles where id = $1', [BEN])).rows).toHaveLength(0);
  });
});

describe('deleting an account', () => {
  const CEM = '00000000-0000-0000-0000-00000000000c';
  const DEA = '00000000-0000-0000-0000-00000000000d';
  const count = async (table: string, id: string) =>
    Number((await db.query<{ n: string }>(`select count(*) as n from ${table} where ${id}`)).rows[0]!.n);

  it('a player deletes their own account: the sign-in, the profile and what was kept with it', async () => {
    await signUp(CEM, { name: 'Cem' });
    await signUp(DEA, { name: 'Dea' });
    await db.query('insert into auth.sessions (user_id) values ($1), ($2)', [CEM, DEA]);

    await as(CEM, 'select public.delete_account()');
    expect(await count('auth.users', `id = '${CEM}'`)).toBe(0);
    expect(await count('public.profiles', `id = '${CEM}'`)).toBe(0);
    expect(await count('auth.sessions', `user_id = '${CEM}'`)).toBe(0);

    // nobody else is touched
    expect(await count('auth.users', `id = '${DEA}'`)).toBe(1);
    expect(await count('auth.sessions', `user_id = '${DEA}'`)).toBe(1);
    expect((await profile(DEA)).username).toBe('Dea');

    // the name is free again
    await as(DEA, `update public.profiles set username = 'Cem' where id = $1`, [DEA]);
    expect((await profile(DEA)).username).toBe('Cem');
  });

  it('is only for a signed-in player, and takes nobody to name', async () => {
    await expect(as(null, 'select public.delete_account()')).rejects.toThrow(/permission denied/);
    await expect(as(DEA, 'select public.delete_account($1)', [ANA])).rejects.toThrow(/does not exist/);
    // deleting twice does nothing the second time
    await as(DEA, 'select public.delete_account()');
    await as(DEA, 'select public.delete_account()');
    expect(await count('auth.users', `id = '${ANA}'`)).toBe(1);
  });
});

describe('friends', () => {
  const EDA = '00000000-0000-0000-0000-0000000000e1';
  const FLO = '00000000-0000-0000-0000-0000000000f1';
  const GON = '00000000-0000-0000-0000-000000000091';
  type Row = { id: string; username: string; public_id: string; state: string };
  const add = async (me: string, who: string) =>
    (await as(me, 'select * from public.add_friend($1)', [who])).rows[0] as { status: string; username: string | null };
  const list = async (me: string) =>
    ((await as(me, 'select * from public.my_friends()')).rows as Row[]).map((r) => `${r.username}:${r.state}`);

  beforeAll(async () => {
    await signUp(EDA, { name: 'Eda' });
    await signUp(FLO, { name: 'Flo' });
    await signUp(GON, { name: 'Gon' });
  });

  it('a request is sent by username in any letter case, and waits for an answer', async () => {
    expect(await add(EDA, '  fLO ')).toEqual({ status: 'sent', username: 'Flo' });
    expect(await list(EDA)).toEqual(['Flo:outgoing']);
    expect(await list(FLO)).toEqual(['Eda:incoming']);
    // asking again changes nothing
    expect(await add(EDA, 'Flo')).toEqual({ status: 'waiting', username: 'Flo' });
    expect(await list(FLO)).toEqual(['Eda:incoming']);
  });

  it('accepting makes both friends; the list comes with the other player and their id', async () => {
    await as(FLO, 'select public.accept_friend($1)', [EDA]);
    expect(await list(EDA)).toEqual(['Flo:friend']);
    expect(await list(FLO)).toEqual(['Eda:friend']);
    expect(await add(FLO, 'Eda')).toEqual({ status: 'already', username: 'Eda' });
    const row = (await as(EDA, 'select * from public.my_friends()')).rows[0] as Row;
    expect(row).toMatchObject({ id: FLO, username: 'Flo', public_id: (await profile(FLO)).public_id });
  });

  it('a request can be sent by player id; asking somebody who asked you makes you friends at once', async () => {
    expect(await add(GON, (await profile(EDA)).public_id)).toEqual({ status: 'sent', username: 'Eda' });
    expect(await list(EDA)).toEqual(['Gon:incoming', 'Flo:friend']);
    expect(await add(EDA, 'Gon')).toEqual({ status: 'friends', username: 'Gon' });
    expect(await list(EDA)).toEqual(['Flo:friend', 'Gon:friend']);
    expect(await list(GON)).toEqual(['Eda:friend']);
  });

  it('says so when there is nobody by that name or id, and when it is you', async () => {
    expect(await add(EDA, 'Nobody_Here')).toEqual({ status: 'not_found', username: null });
    expect(await add(EDA, '99999999')).toEqual({ status: 'not_found', username: null });
    expect(await add(EDA, '')).toEqual({ status: 'not_found', username: null });
    expect(await add(EDA, 'eda')).toEqual({ status: 'yourself', username: 'Eda' });
  });

  it('an id is looked for before a name, so a name of eight digits cannot hide a player', async () => {
    const id = (await profile(GON)).public_id;
    await as(FLO, `update public.profiles set username = $1 where id = $2`, [id, FLO]);
    expect(await add(FLO, id)).toMatchObject({ status: 'sent', username: 'Gon' });
    await as(FLO, 'select public.remove_friend($1)', [GON]);
    await as(FLO, `update public.profiles set username = 'Flo' where id = $1`, [FLO]);
  });

  it('removing ends a friendship for both, takes a request back, or declines one', async () => {
    await as(GON, 'select public.remove_friend($1)', [EDA]);
    expect(await list(EDA)).toEqual(['Flo:friend']);
    expect(await list(GON)).toEqual([]);

    // taking a request back
    await add(GON, 'Flo');
    await as(GON, 'select public.remove_friend($1)', [FLO]);
    expect(await list(FLO)).toEqual(['Eda:friend']);
    // declining one; after that it cannot be accepted any more
    await add(GON, 'Flo');
    await as(FLO, 'select public.remove_friend($1)', [GON]);
    await as(FLO, 'select public.accept_friend($1)', [GON]);
    expect(await list(GON)).toEqual([]);
  });

  it('nobody can accept for somebody else, or make themselves a friend without being asked', async () => {
    await add(GON, 'Flo');
    // Gon accepts "his own" request, Eda accepts one that is not hers: nothing happens
    await as(GON, 'select public.accept_friend($1)', [FLO]);
    await as(EDA, 'select public.accept_friend($1)', [GON]);
    expect(await list(FLO)).toEqual(['Gon:incoming', 'Eda:friend']);
    expect(await list(GON)).toEqual(['Flo:outgoing']);
    await as(GON, 'select public.remove_friend($1)', [FLO]);
  });

  it('is closed to visitors, and the table cannot be read or written directly', async () => {
    for (const call of ["add_friend('Eda')", `accept_friend('${EDA}')`, `remove_friend('${EDA}')`, 'my_friends()']) {
      await expect(as(null, `select public.${call}`)).rejects.toThrow(/permission denied/);
    }
    for (const who of [EDA, null]) {
      await expect(as(who, 'select * from public.friendships')).rejects.toThrow(/permission denied/);
      await expect(
        as(who, 'insert into public.friendships (requester, addressee, accepted) values ($1, $2, true)', [GON, FLO]),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it('holds back a player who floods others with requests', async () => {
    const SPAM = '00000000-0000-0000-0000-0000000000aa';
    await signUp(SPAM, { name: 'Spammer' });
    for (let i = 0; i < 50; i++) {
      const id = `00000000-0000-0000-0001-${String(i).padStart(12, '0')}`;
      await signUp(id, { name: `Crowd${i}` });
      expect((await add(SPAM, `Crowd${i}`)).status).toBe('sent');
    }
    expect(await add(SPAM, 'Eda')).toEqual({ status: 'full', username: 'Eda' });
    // an answer makes room again
    await as('00000000-0000-0000-0001-000000000000', 'select public.accept_friend($1)', [SPAM]);
    expect((await add(SPAM, 'Eda')).status).toBe('sent');
    await as(SPAM, 'select public.delete_account()');
  });

  it('a deleted account disappears from its friends lists', async () => {
    expect(await list(FLO)).toEqual(['Eda:friend']);
    await as(EDA, 'select public.delete_account()');
    expect(await list(FLO)).toEqual([]);
  });
});

describe('messages, blocking and reporting', () => {
  const HAL = '00000000-0000-0000-0000-0000000000a2';
  const IVA = '00000000-0000-0000-0000-0000000000b2';
  const JON = '00000000-0000-0000-0000-0000000000c2';
  type Sent = { status: string; id: string | null; body: string | null };
  type Line = { id: string; from_me: boolean; body: string; read_at: string | null };
  type Chat = { username: string; last_body: string; last_from_me: boolean; unread: number };

  const send = async (me: string, to: string, message: string) =>
    (await as(me, 'select * from public.send_message($1, $2)', [to, message])).rows[0] as Sent;
  const thread = async (me: string, other: string, before: string | null = null, max = 50) =>
    (await as(me, 'select * from public.conversation($1, $2, $3)', [other, before, max])).rows as Line[];
  const chats = async (me: string) =>
    ((await as(me, 'select * from public.my_conversations()')).rows as Chat[]).map(
      (c) => `${c.username}:${c.last_body}:${c.last_from_me ? 'me' : 'them'}:${c.unread}`,
    );
  const befriend = async (a: string, b: string) => {
    await as(a, 'select * from public.add_friend($1)', [(await profile(b)).public_id]);
    await as(b, 'select public.accept_friend($1)', [a]);
  };
  const report = async (me: string, who: string, why: string, note: string | null = null) =>
    (await as(me, 'select public.report_player($1, $2, $3) as status', [who, why, note])).rows[0] as { status: string };

  beforeAll(async () => {
    await signUp(HAL, { name: 'Hal' });
    await signUp(IVA, { name: 'Iva' });
    await signUp(JON, { name: 'Jon' });
    await befriend(HAL, IVA);
  });

  it('friends write to each other; each sees the conversation from their side, newest first', async () => {
    expect(await send(HAL, IVA, '  Hi Iva!  ')).toMatchObject({ status: 'sent', body: 'Hi Iva!' });
    expect(await send(IVA, HAL, 'Hey Hal')).toMatchObject({ status: 'sent' });
    expect((await thread(HAL, IVA)).map((l) => `${l.from_me ? 'me' : 'them'}:${l.body}`)).toEqual([
      'them:Hey Hal',
      'me:Hi Iva!',
    ]);
    expect((await thread(IVA, HAL)).map((l) => l.from_me)).toEqual([true, false]);
  });

  it('lists conversations with the last message and the unread count; reading clears it', async () => {
    expect(await chats(HAL)).toEqual(['Iva:Hey Hal:them:1']);
    expect(await chats(IVA)).toEqual(['Hal:Hey Hal:me:1']);
    await as(HAL, 'select public.mark_read($1)', [IVA]);
    expect(await chats(HAL)).toEqual(['Iva:Hey Hal:them:0']);
    // the sender sees that it was read
    expect((await thread(IVA, HAL))[0]!.read_at).not.toBeNull();
    // her own unread messages are not touched by his reading
    expect(await chats(IVA)).toEqual(['Hal:Hey Hal:me:1']);
  });

  it('comes in pages', async () => {
    const all = await thread(HAL, IVA);
    const first = await thread(HAL, IVA, null, 1);
    expect(first.map((l) => l.body)).toEqual(['Hey Hal']);
    expect((await thread(HAL, IVA, first[0]!.id, 1)).map((l) => l.body)).toEqual(['Hi Iva!']);
    expect(await thread(HAL, IVA, all.at(-1)!.id)).toEqual([]);
  });

  it('refuses empty and over-long messages, and messages to anyone who is not a friend', async () => {
    expect((await send(HAL, IVA, '   ')).status).toBe('empty');
    expect((await send(HAL, IVA, 'x'.repeat(501))).status).toBe('too_long');
    expect((await send(HAL, IVA, 'x'.repeat(500))).status).toBe('sent');
    expect((await send(HAL, JON, 'hello stranger')).status).toBe('not_friends');
    // a request that was not accepted is not enough
    await as(HAL, 'select * from public.add_friend($1)', ['Jon']);
    expect((await send(HAL, JON, 'hello?')).status).toBe('not_friends');
    await as(HAL, 'select public.remove_friend($1)', [JON]);
    // nobody can read somebody else's conversation
    expect(await thread(JON, IVA)).toEqual([]);
  });

  it('stars out the words on the blocked list, as whole words, in any letter case', async () => {
    await db.query("insert into public.blocked_words (word) values ('darn'), ('silly goose')");
    await expect(db.query("insert into public.blocked_words (word) values ('Shout')")).rejects.toThrow(/check/);
    await expect(db.query("insert into public.blocked_words (word) values ('a.*')")).rejects.toThrow(/check/);
    expect((await send(HAL, IVA, 'DARN it, you Silly Goose! darnation')).body).toBe(
      '**** it, you ***********! darnation',
    );
    await db.query('delete from public.blocked_words');
  });

  it('holds back a player who sends more than 20 messages in a minute', async () => {
    await db.query("delete from public.messages where sender = $1 and created_at > now() - interval '1 minute'", [IVA]);
    for (let i = 0; i < 20; i++) expect((await send(IVA, HAL, `message ${i}`)).status).toBe('sent');
    expect((await send(IVA, HAL, 'one more')).status).toBe('too_fast');
    // a minute later it is fine again
    await db.query("update public.messages set created_at = now() - interval '2 minutes' where sender = $1", [IVA]);
    expect((await send(IVA, HAL, 'one more')).status).toBe('sent');
  });

  it('blocking ends the friendship, stops messages and requests both ways, and hides the conversation', async () => {
    await as(IVA, 'select public.block_player($1)', [HAL]);
    expect(((await as(HAL, 'select * from public.my_friends()')).rows as unknown[]).length).toBe(0);
    expect((await send(HAL, IVA, 'are you there?')).status).toBe('not_friends');
    expect((await send(IVA, HAL, 'bye')).status).toBe('not_friends');
    // he is told nobody has that name; she is told she blocked him
    expect((await as(HAL, 'select * from public.add_friend($1)', ['Iva'])).rows[0]).toEqual({
      status: 'not_found',
      username: null,
    });
    expect((await as(IVA, 'select * from public.add_friend($1)', ['Hal'])).rows[0]).toEqual({
      status: 'blocked',
      username: 'Hal',
    });
    // she no longer sees the conversation in her list; he still has his copy
    expect(await chats(IVA)).toEqual([]);
    expect((await chats(HAL)).length).toBe(1);
    expect(
      ((await as(IVA, 'select * from public.my_blocks()')).rows as { username: string }[]).map((r) => r.username),
    ).toEqual(['Hal']);
    // blocking twice, yourself, or nobody does nothing
    await as(IVA, 'select public.block_player($1)', [HAL]);
    await as(IVA, 'select public.block_player($1)', [IVA]);
    await as(IVA, 'select public.block_player($1)', ['00000000-0000-0000-0000-00000000ffff']);
    expect(Number((await db.query<{ n: string }>('select count(*) as n from public.blocks')).rows[0]!.n)).toBe(1);
  });

  it('unblocking lets them become friends again (by a new request)', async () => {
    await as(IVA, 'select public.unblock_player($1)', [HAL]);
    expect((await as(IVA, 'select * from public.my_blocks()')).rows).toEqual([]);
    expect((await send(HAL, IVA, 'hi again')).status).toBe('not_friends');
    await befriend(HAL, IVA);
    expect((await send(HAL, IVA, 'hi again')).status).toBe('sent');
    expect((await chats(IVA))[0]).toMatch(/^Hal:hi again:them:/);
  });

  it('a report keeps the reason, the note and the last messages, for the owner only', async () => {
    expect(await report(IVA, HAL, 'harassment', '  He keeps writing  ')).toEqual({ status: 'sent' });
    const row = (
      await db.query<{
        reporter: string;
        reported: string;
        reported_username: string;
        reason: string;
        details: string;
        recent_messages: { from: string; body: string }[];
      }>('select * from public.reports')
    ).rows[0]!;
    expect(row).toMatchObject({ reporter: IVA, reported: HAL, reported_username: 'Hal', reason: 'harassment' });
    expect(row.details).toBe('He keeps writing');
    expect(row.recent_messages.length).toBe(20);
    expect(row.recent_messages.at(-1)).toMatchObject({ from: 'reported', body: 'hi again' });
    // players cannot read, change or remove reports
    for (const sql of [
      'select * from public.reports',
      'delete from public.reports',
      'update public.reports set handled = true',
    ]) {
      await expect(as(HAL, sql)).rejects.toThrow(/permission denied/);
    }
  });

  it('refuses a report without a proper reason, about nobody, or about yourself, and too many in a day', async () => {
    expect(await report(IVA, HAL, 'boring')).toEqual({ status: 'invalid' });
    expect(await report(IVA, HAL, 'other', 'x'.repeat(501))).toEqual({ status: 'invalid' });
    expect(await report(IVA, '00000000-0000-0000-0000-00000000ffff', 'spam')).toEqual({ status: 'not_found' });
    expect(await report(IVA, IVA, 'spam')).toEqual({ status: 'yourself' });
    // a report about somebody you never wrote to is fine: it has no messages
    expect(await report(JON, HAL, 'name_or_picture')).toEqual({ status: 'sent' });
    for (let i = 0; i < 9; i++) expect((await report(JON, IVA, 'spam')).status).toBe('sent');
    expect(await report(JON, IVA, 'spam')).toEqual({ status: 'too_many' });
  });

  it('a report outlives the account it is about; it is gone after a year', async () => {
    const TMP = '00000000-0000-0000-0000-0000000000d2';
    await signUp(TMP, { name: 'Gone Soon' });
    await report(HAL, TMP, 'hate');
    await as(TMP, 'select public.delete_account()');
    const kept = (
      await db.query<{ reported: string | null; reported_username: string }>(
        "select reported, reported_username from public.reports where reported_username = 'GoneSoon'",
      )
    ).rows;
    expect(kept).toEqual([{ reported: null, reported_username: 'GoneSoon' }]);
    await db.query(
      "update public.reports set created_at = now() - interval '13 months' where reported_username = 'GoneSoon'",
    );
    await send(HAL, IVA, 'tidy up');
    expect((await db.query("select * from public.reports where reported_username = 'GoneSoon'")).rows).toEqual([]);
  });

  it('is closed to visitors, and the tables cannot be read or written directly', async () => {
    for (const call of [
      `send_message('${IVA}', 'hi')`,
      `conversation('${IVA}')`,
      `mark_read('${IVA}')`,
      'my_conversations()',
      `block_player('${IVA}')`,
      `unblock_player('${IVA}')`,
      'my_blocks()',
      `report_player('${IVA}', 'spam')`,
    ]) {
      await expect(as(null, `select public.${call}`)).rejects.toThrow(/permission denied/);
    }
    for (const table of ['messages', 'blocks', 'blocked_words', 'reports']) {
      await expect(as(HAL, `select * from public.${table}`)).rejects.toThrow(/permission denied/);
    }
    await expect(as(HAL, `select public.blocked_between('${HAL}', '${IVA}')`)).rejects.toThrow(/permission denied/);
    await expect(
      as(HAL, 'insert into public.messages (sender, recipient, body) values ($1, $2, $3)', [IVA, HAL, 'fake']),
    ).rejects.toThrow(/permission denied/);
  });

  it('a deleted account takes its messages and blocks with it', async () => {
    await as(IVA, 'select public.block_player($1)', [JON]);
    await as(HAL, 'select public.delete_account()');
    expect(await chats(IVA)).toEqual([]);
    expect(Number((await db.query<{ n: string }>('select count(*) as n from public.messages')).rows[0]!.n)).toBe(0);
    await as(JON, 'select public.delete_account()');
    expect((await as(IVA, 'select * from public.my_blocks()')).rows).toEqual([]);
  });
});
