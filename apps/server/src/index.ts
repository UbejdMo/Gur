import { createGameServer } from './server';
import { supabaseFriendsCheck, supabaseTableTools, supabaseVerifier } from './verify';

// The host sets PORT. ALLOWED_ORIGINS is a comma-separated list of web addresses that may
// connect (for example https://ubejdmo.github.io); without it any address may.
const port = Number(process.env.PORT ?? 3001);
const origins = process.env.ALLOWED_ORIGINS?.split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// With SUPABASE_URL and SUPABASE_KEY (the project's publishable key) set, players who signed
// in are checked against that project. Without them everybody plays as a guest.
const { SUPABASE_URL, SUPABASE_KEY } = process.env;
const accounts = SUPABASE_URL && SUPABASE_KEY;
const verify = accounts ? supabaseVerifier(SUPABASE_URL, SUPABASE_KEY) : undefined;
// Only friends can be invited into a lobby; the friends list lives in the same project.
const areFriends = accounts ? supabaseFriendsCheck(SUPABASE_URL, SUPABASE_KEY) : undefined;

// The chat at a table: bad words starred out, and reports and blocks, through the same project.
const table = accounts ? supabaseTableTools(SUPABASE_URL, SUPABASE_KEY) : undefined;

const server = createGameServer({ corsOrigin: origins?.length ? origins : '*', verify, areFriends, ...table });
server.http.listen(port, () => {
  process.stdout.write(`Gur game server listening on port ${port} (${verify ? 'accounts on' : 'guests only'})\n`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
