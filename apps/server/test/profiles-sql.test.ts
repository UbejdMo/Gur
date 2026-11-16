/**
 * Runs the profiles migration on a real Postgres (PGlite, in this process) and checks the
 * rules it sets up. Supabase's own parts (the auth schema, the roles, auth.uid()) are
 * stood in for by the few lines at the top.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(
  fileURLToPath(new URL('../../../supabase/migrations/0001_profiles.sql', import.meta.url)),
  'utf8',
);

const SUPABASE_STAND_IN = `
  create schema auth;
  create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
  create role anon;
  create role authenticated;
  grant usage on schema public to anon, authenticated;
  -- Supabase reads the signed-in user from the request; here a setting plays that part.
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
`;

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

describe('the profiles migration', () => {
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
