import { describe, expect, it, vi } from 'vitest';
import { safePictureUrl, supabaseVerifier } from '../src/verify';

const USER = '11111111-2222-3333-4444-555555555555';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A stand-in for Supabase: answers the two addresses the verifier asks. */
function supabase(answers: { user?: Response; profiles?: Response }) {
  return vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/auth/v1/user')) return answers.user ?? json({ id: USER });
    if (url.includes('/rest/v1/profiles')) {
      return (
        answers.profiles ?? json([{ username: 'AnaK', public_id: '48213377', avatar_url: 'https://example.com/a.png' }])
      );
    }
    return json({}, 404);
  });
}

describe('checking a sign-in with Supabase', () => {
  it("asks Supabase whose token it is, then reads that player's profile with the same token", async () => {
    const fetcher = supabase({});
    const verify = supabaseVerifier('https://abc.supabase.co/', 'sb_publishable_x', fetcher as typeof fetch);
    expect(await verify('the-token')).toEqual({
      userId: USER,
      username: 'AnaK',
      publicId: '48213377',
      avatarUrl: 'https://example.com/a.png',
    });
    const [first, second] = fetcher.mock.calls;
    expect(first![0]).toBe('https://abc.supabase.co/auth/v1/user');
    expect(String(second![0])).toBe(
      `https://abc.supabase.co/rest/v1/profiles?id=eq.${USER}&select=username,public_id,avatar_url&limit=1`,
    );
    for (const call of [first!, second!]) {
      expect(call[1]!.headers).toEqual({ apikey: 'sb_publishable_x', Authorization: 'Bearer the-token' });
    }
  });

  it('says no to a token Supabase does not accept, and asks nothing more', async () => {
    const fetcher = supabase({ user: json({ message: 'invalid JWT' }, 401) });
    const verify = supabaseVerifier('https://abc.supabase.co', 'key', fetcher as typeof fetch);
    expect(await verify('expired')).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('says no when the answer is not a real account id, or the player has no profile', async () => {
    for (const user of [json({}), json({ id: 42 }), json({ id: "x' or 1=1" })]) {
      const verify = supabaseVerifier('https://abc.supabase.co', 'key', supabase({ user }) as typeof fetch);
      expect(await verify('t')).toBeNull();
    }
    for (const profiles of [json([]), json([{ username: 5, public_id: '1' }])]) {
      const verify = supabaseVerifier('https://abc.supabase.co', 'key', supabase({ profiles }) as typeof fetch);
      expect(await verify('t')).toBeNull();
    }
  });

  it('reports a fault when the profiles cannot be read at all (the database is not set up)', async () => {
    const verify = supabaseVerifier(
      'https://abc.supabase.co',
      'key',
      supabase({ profiles: json({}, 404) }) as typeof fetch,
    );
    await expect(verify('t')).rejects.toThrow(/Reading the profile failed: 404/);
  });

  it('only passes on pictures from ordinary https addresses', async () => {
    expect(safePictureUrl('https://lh3.googleusercontent.com/a/abc=s96-c')).toBe(
      'https://lh3.googleusercontent.com/a/abc=s96-c',
    );
    for (const bad of [
      null,
      7,
      'http://example.com/a.png',
      'javascript:alert(1)',
      'https://a.b/"onerror=',
      `https://a.b/${'x'.repeat(500)}`,
    ]) {
      expect(safePictureUrl(bad)).toBeNull();
    }
    const profiles = json([{ username: 'AnaK', public_id: '48213377', avatar_url: 'javascript:alert(1)' }]);
    const verify = supabaseVerifier('https://abc.supabase.co', 'key', supabase({ profiles }) as typeof fetch);
    expect((await verify('t'))!.avatarUrl).toBeNull();
  });
});
