import { createClient } from '@supabase/supabase-js';
import type { AuthBackend, Profile } from './account';
import type { AddStatus, FriendsBackend, Person } from './friends';

type Row = { id: string; public_id: string; username: string; avatar_url: string | null };
const COLUMNS = 'id, public_id, username, avatar_url';
const toProfile = (row: Row): Profile => ({
  id: row.id,
  publicId: row.public_id,
  username: row.username,
  avatarUrl: row.avatar_url,
});

/**
 * Accounts kept in a Supabase project: Google sign-in through Supabase Auth, and the
 * `profiles` table from supabase/migrations. The sign-in is remembered by the browser and
 * picked up again when the player comes back from Google.
 */
export function supabaseBackend(url: string, key: string): AuthBackend & { friends: FriendsBackend } {
  const client = createClient(url, key, {
    auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
  });
  return {
    session: async () => {
      const { data } = await client.auth.getSession();
      return data.session ? { userId: data.session.user.id, token: data.session.access_token } : null;
    },
    onChange: (listener) => {
      const { data } = client.auth.onAuthStateChange(() => listener());
      return () => data.subscription.unsubscribe();
    },
    signInWithGoogle: async (returnTo) => {
      const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: returnTo } });
      return error ? 'Signing in did not work. Please try again' : null;
    },
    signOut: async () => {
      await client.auth.signOut();
    },
    profile: async (userId) => {
      const { data } = await client.from('profiles').select(COLUMNS).eq('id', userId).maybeSingle<Row>();
      return data ? toProfile(data) : null;
    },
    rename: async (userId, username) => {
      const { data, error } = await client
        .from('profiles')
        .update({ username })
        .eq('id', userId)
        .select(COLUMNS)
        .single<Row>();
      if (data) return { ok: true, profile: toProfile(data) };
      // Postgres codes: 23505 = the name is taken (unique), 23514 = it breaks the shape rule (check).
      return { ok: false, reason: error?.code === '23505' ? 'taken' : error?.code === '23514' ? 'invalid' : 'failed' };
    },
    deleteAccount: async () => {
      // `delete_account` (supabase/migrations) removes the caller's own account, and nobody else's.
      const { error } = await client.rpc('delete_account');
      if (error) return false;
      // The account is gone, so there is nothing left to sign out of on the service: just forget it here.
      await client.auth.signOut({ scope: 'local' });
      return true;
    },
    // Friends go through the database's own functions (supabase/migrations), which only act for the caller.
    friends: {
      list: async () => {
        const { data, error } = await client.rpc('my_friends');
        if (error) throw new Error(error.message);
        return (data as (Row & { state: Person['state'] })[]).map((row) => ({ ...toProfile(row), state: row.state }));
      },
      add: async (who) => {
        const { data, error } = await client.rpc('add_friend', { who });
        const answer = (data as { status: AddStatus; username: string | null }[] | null)?.[0];
        if (error || !answer) throw new Error(error?.message ?? 'No answer');
        return answer;
      },
      accept: async (id) => {
        const { error } = await client.rpc('accept_friend', { who: id });
        if (error) throw new Error(error.message);
      },
      remove: async (id) => {
        const { error } = await client.rpc('remove_friend', { who: id });
        if (error) throw new Error(error.message);
      },
    },
  };
}
