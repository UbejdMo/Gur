import { createClient } from '@supabase/supabase-js';
import type { AuthBackend, Profile } from './account';
import type { AddStatus, FriendsBackend, Person } from './friends';
import type { Blocked, Chat, Line, MessagesBackend, ReportStatus, SendStatus } from './messages';
import { strings } from '@/i18n';

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
type LineRow = { id: number; from_me: boolean; body: string; created_at: string; read_at: string | null };
const toLine = (row: LineRow): Line => ({
  id: Number(row.id),
  fromMe: row.from_me,
  body: row.body,
  at: row.created_at,
  readAt: row.read_at,
});

export function supabaseBackend(
  url: string,
  key: string,
): AuthBackend & { friends: FriendsBackend; messages: MessagesBackend } {
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
      return error ? strings().profile.signInFailed : null;
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
    // Messages, blocking and reporting go through the database's own functions too
    // (supabase/migrations/0004_messages.sql), which only act for the caller.
    messages: {
      conversations: async () => {
        const { data, error } = await client.rpc('my_conversations');
        if (error) throw new Error(error.message);
        return (data as (Row & { last_body: string; last_at: string; last_from_me: boolean; unread: number })[]).map(
          (row): Chat => ({
            ...toProfile(row),
            lastBody: row.last_body,
            lastAt: row.last_at,
            lastFromMe: row.last_from_me,
            unread: Number(row.unread),
          }),
        );
      },
      thread: async (other, beforeId) => {
        const { data, error } = await client.rpc('conversation', { other, before_id: beforeId, max_rows: 50 });
        if (error) throw new Error(error.message);
        return (data as LineRow[]).map(toLine);
      },
      send: async (to, body) => {
        const { data, error } = await client.rpc('send_message', { to_player: to, message: body });
        const answer = (data as ({ status: SendStatus } & Partial<LineRow>)[] | null)?.[0];
        if (error || !answer) throw new Error(error?.message ?? 'No answer');
        const line =
          answer.status === 'sent' && answer.id !== undefined && answer.id !== null
            ? toLine({
                id: answer.id,
                from_me: true,
                body: answer.body!,
                created_at: answer.created_at!,
                read_at: null,
              })
            : null;
        return { status: answer.status, line };
      },
      markRead: async (other) => {
        const { error } = await client.rpc('mark_read', { other });
        if (error) throw new Error(error.message);
      },
      block: async (who) => {
        const { error } = await client.rpc('block_player', { who });
        if (error) throw new Error(error.message);
      },
      unblock: async (who) => {
        const { error } = await client.rpc('unblock_player', { who });
        if (error) throw new Error(error.message);
      },
      blocks: async () => {
        const { data, error } = await client.rpc('my_blocks');
        if (error) throw new Error(error.message);
        return (data as Row[]).map((row): Blocked => toProfile(row));
      },
      report: async (who, why, note) => {
        const { data, error } = await client.rpc('report_player', { who, why, note: note || null });
        if (error) throw new Error(error.message);
        return data as ReportStatus;
      },
    },
  };
}
