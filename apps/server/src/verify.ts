/**
 * Checks who a signed-in player is. The app sends the token it got when the player signed
 * in with Google; this asks Supabase (which issued it) whose it is, and reads that player's
 * profile. The server never takes a player's word for their name.
 */
import type { SignedInPlayer } from './lobby';

export type Verifier = (token: string) => Promise<SignedInPlayer | null>;

/** Pictures are only ever shown from https addresses of a sane length. */
export function safePictureUrl(raw: unknown): string | null {
  return typeof raw === 'string' && raw.length <= 500 && /^https:\/\/[^\s"'<>]+$/.test(raw) ? raw : null;
}

/**
 * A verifier for a Supabase project. `key` is the project's publishable key (the one that is
 * safe to show in public); the player's own token decides what may be read.
 * Returns null when the token is not valid (any more), or the player has no profile.
 */
export function supabaseVerifier(url: string, key: string, fetcher: typeof fetch = fetch): Verifier {
  const base = url.replace(/\/+$/, '');
  return async (token) => {
    const headers = { apikey: key, Authorization: `Bearer ${token}` };
    const signal = AbortSignal.timeout(8_000);

    const who = await fetcher(`${base}/auth/v1/user`, { headers, signal });
    if (!who.ok) return null;
    const user = (await who.json()) as { id?: unknown };
    if (typeof user.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(user.id)) return null;

    const found = await fetcher(
      `${base}/rest/v1/profiles?id=eq.${user.id}&select=username,public_id,avatar_url&limit=1`,
      { headers, signal },
    );
    if (!found.ok) throw new Error(`Reading the profile failed: ${found.status}`);
    const [profile] = (await found.json()) as { username?: unknown; public_id?: unknown; avatar_url?: unknown }[];
    if (!profile || typeof profile.username !== 'string' || typeof profile.public_id !== 'string') return null;

    return {
      userId: user.id,
      username: profile.username,
      publicId: profile.public_id,
      avatarUrl: safePictureUrl(profile.avatar_url),
    };
  };
}

export type FriendsCheck = (token: string, userId: string) => Promise<boolean>;

/**
 * Asks the database whether the player whose token this is has `userId` among their friends
 * (accepted, not just asked). It reads the player's own list, as the app does, so it can see
 * nothing the player could not.
 */
export function supabaseFriendsCheck(url: string, key: string, fetcher: typeof fetch = fetch): FriendsCheck {
  const base = url.replace(/\/+$/, '');
  return async (token, userId) => {
    const answer = await fetcher(`${base}/rest/v1/rpc/my_friends`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(8_000),
    });
    if (!answer.ok) return false;
    const rows = (await answer.json()) as { id?: unknown; state?: unknown }[];
    return Array.isArray(rows) && rows.some((row) => row.id === userId && row.state === 'friend');
  };
}
