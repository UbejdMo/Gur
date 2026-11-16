import { createGameServer } from './server';
import { supabaseVerifier } from './verify';

// The host sets PORT. ALLOWED_ORIGINS is a comma-separated list of web addresses that may
// connect (for example https://ubejdmo.github.io); without it any address may.
const port = Number(process.env.PORT ?? 3001);
const origins = process.env.ALLOWED_ORIGINS?.split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// With SUPABASE_URL and SUPABASE_KEY (the project's publishable key) set, players who signed
// in are checked against that project. Without them everybody plays as a guest.
const { SUPABASE_URL, SUPABASE_KEY } = process.env;
const verify = SUPABASE_URL && SUPABASE_KEY ? supabaseVerifier(SUPABASE_URL, SUPABASE_KEY) : undefined;

const server = createGameServer({ corsOrigin: origins?.length ? origins : '*', verify });
server.http.listen(port, () => {
  process.stdout.write(`Gur game server listening on port ${port} (${verify ? 'accounts on' : 'guests only'})\n`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
