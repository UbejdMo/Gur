/**
 * A stand-in for the Supabase project, for the browser tests only. It answers the few
 * requests the app and the game server make: the trip to "Google" and back, exchanging the
 * code for a sign-in, who a token belongs to, and reading and renaming profiles.
 *
 * Nobody types a password: every trip to "Google" comes back as a brand-new player.
 * Everything is kept in memory and is gone when the tests end.
 */
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 3191);

/** @typedef {{ id: string, public_id: string, username: string, avatar_url: string | null }} Profile */
/** @type {Map<string, Profile>} */
const profiles = new Map();
/** Codes handed out on the way back from "Google": code -> who, and the challenge to answer. */
const codes = new Map();
/** Sign-in tokens -> user id. */
const tokens = new Map();
/** Friend requests and friendships: who asked whom, and whether it was accepted. */
let friendships = [];
let players = 0;

// A name that is always taken, for the "somebody already has that name" case.
profiles.set('00000000-0000-4000-8000-000000000001', {
  id: '00000000-0000-4000-8000-000000000001',
  public_id: '10000001',
  username: 'Taken',
  avatar_url: null,
});

const base64url = (value) => Buffer.from(value).toString('base64url');

function newToken(userId) {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = [
    base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
    base64url(JSON.stringify({ sub: userId, role: 'authenticated', aud: 'authenticated', exp: expires })),
    base64url(randomUUID()),
  ].join('.');
  tokens.set(token, userId);
  return { token, expires };
}

const userOf = (request) => tokens.get((request.headers.authorization ?? '').replace(/^Bearer /, '')) ?? null;

function send(response, status, body, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  response.end(body === undefined ? undefined : JSON.stringify(body));
}

async function bodyOf(request) {
  let text = '';
  for await (const chunk of request) text += chunk;
  return text ? JSON.parse(text) : {};
}

/** Answers with one row or a list, whichever was asked for (the way PostgREST does). */
function sendRows(request, response, rows) {
  if (!(request.headers.accept ?? '').includes('vnd.pgrst.object')) return send(response, 200, rows);
  if (rows.length === 1) return send(response, 200, rows[0]);
  return send(response, 406, { code: 'PGRST116', message: 'The result contains 0 rows', details: null, hint: null });
}

const server = createServer((request, response) => {
  void (async () => {
    const url = new URL(request.url ?? '/', `http://localhost:${port}`);
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', request.headers['access-control-request-headers'] ?? '*');
    if (request.method === 'OPTIONS') return send(response, 204);
    if (url.pathname === '/health') return send(response, 200, { ok: true });

    // The trip to "Google": a new player is made, and the browser is sent back with a code.
    if (url.pathname === '/auth/v1/authorize') {
      const back = new URL(url.searchParams.get('redirect_to') ?? '');
      const id = randomUUID();
      players += 1;
      profiles.set(id, {
        id,
        public_id: String(20000000 + players),
        username: `Ana${1000 + players}`,
        avatar_url: 'https://pictures.test/ana.png',
      });
      const code = randomUUID();
      codes.set(code, { id, challenge: url.searchParams.get('code_challenge') });
      back.searchParams.set('code', code);
      response.writeHead(302, { Location: back.toString() });
      return response.end();
    }

    // The code is exchanged for a sign-in; it only works with the secret the challenge was made from.
    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'pkce') {
      const { auth_code: code, code_verifier: verifier } = await bodyOf(request);
      const pending = codes.get(code);
      codes.delete(code);
      const answer = createHash('sha256')
        .update(String(verifier ?? ''))
        .digest('base64url');
      if (!pending || pending.challenge !== answer) {
        return send(response, 400, { code: 400, error_code: 'flow_state_not_found', msg: 'Invalid code' });
      }
      const { token, expires } = newToken(pending.id);
      const user = { id: pending.id, aud: 'authenticated', role: 'authenticated', email: 'ana@example.com' };
      return send(response, 200, {
        access_token: token,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: expires,
        refresh_token: randomUUID(),
        user,
      });
    }

    if (url.pathname === '/auth/v1/user') {
      const id = userOf(request);
      if (!id) return send(response, 401, { code: 401, error_code: 'bad_jwt', msg: 'Invalid token' });
      return send(response, 200, { id, aud: 'authenticated', role: 'authenticated', email: 'ana@example.com' });
    }

    if (url.pathname === '/auth/v1/logout') {
      tokens.delete((request.headers.authorization ?? '').replace(/^Bearer /, ''));
      return send(response, 204);
    }

    if (url.pathname === '/rest/v1/profiles') {
      const id = (url.searchParams.get('id') ?? '').replace(/^eq\./, '');
      const row = profiles.get(id);
      if (request.method === 'GET') return sendRows(request, response, row ? [row] : []);

      if (request.method === 'PATCH') {
        // A player may change only their own row, as the database's rules say.
        if (!row || userOf(request) !== id) return sendRows(request, response, []);
        const { username } = await bodyOf(request);
        const refuse = (code, message) => send(response, code === '23505' ? 409 : 400, { code, message });
        if (typeof username !== 'string' || !/^[\p{L}\p{N}_]{3,16}$/u.test(username)) {
          return refuse('23514', 'new row violates check constraint "profiles_username_shape"');
        }
        const lower = username.toLowerCase();
        if ([...profiles.values()].some((p) => p.id !== id && p.username.toLowerCase() === lower)) {
          return refuse('23505', 'duplicate key value violates unique constraint "profiles_username_unique"');
        }
        row.username = username;
        return sendRows(request, response, [row]);
      }
    }

    // Friends: the same four functions as in supabase/migrations/0003_friends.sql, in short.
    if (url.pathname.startsWith('/rest/v1/rpc/') && url.pathname.includes('friend')) {
      const me = userOf(request);
      if (!me) return send(response, 401, { code: '42501', message: 'permission denied' });
      const { who } = await bodyOf(request);
      const between = (other) =>
        friendships.find(
          (f) => (f.requester === me && f.addressee === other) || (f.requester === other && f.addressee === me),
        );
      switch (url.pathname.split('/').pop()) {
        case 'my_friends':
          return send(
            response,
            200,
            friendships
              .filter((f) => f.requester === me || f.addressee === me)
              .map((f) => ({
                ...profiles.get(f.requester === me ? f.addressee : f.requester),
                state: f.accepted ? 'friend' : f.addressee === me ? 'incoming' : 'outgoing',
              })),
          );
        case 'add_friend': {
          const wanted = String(who ?? '')
            .trim()
            .toLowerCase();
          const them = [...profiles.values()].find(
            (p) => p.public_id === wanted || p.username.toLowerCase() === wanted,
          );
          const answer = (status) => send(response, 200, [{ status, username: them?.username ?? null }]);
          if (!them) return answer('not_found');
          if (them.id === me) return answer('yourself');
          const row = between(them.id);
          if (row?.accepted) return answer('already');
          if (row?.requester === me) return answer('waiting');
          if (row) {
            row.accepted = true;
            return answer('friends');
          }
          friendships.push({ requester: me, addressee: them.id, accepted: false });
          return answer('sent');
        }
        case 'accept_friend': {
          const row = friendships.find((f) => f.requester === who && f.addressee === me);
          if (row) row.accepted = true;
          return send(response, 204);
        }
        case 'remove_friend':
          friendships = friendships.filter((f) => f !== between(who));
          return send(response, 204);
      }
    }

    // A player deletes their own account: the profile goes, and their sign-ins stop working.
    if (url.pathname === '/rest/v1/rpc/delete_account' && request.method === 'POST') {
      const id = userOf(request);
      if (!id) return send(response, 401, { code: '42501', message: 'permission denied for function delete_account' });
      profiles.delete(id);
      friendships = friendships.filter((f) => f.requester !== id && f.addressee !== id);
      for (const [token, owner] of tokens) if (owner === id) tokens.delete(token);
      return send(response, 204);
    }

    return send(response, 404, { message: `Not part of the stand-in: ${request.method} ${url.pathname}` });
  })().catch((error) => send(response, 500, { message: String(error) }));
});

server.listen(port, () => process.stdout.write(`Stand-in Supabase on port ${port}\n`));
