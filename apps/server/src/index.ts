import { createGameServer } from './server';

// The host sets PORT. ALLOWED_ORIGINS is a comma-separated list of web addresses that may
// connect (for example https://ubejdmo.github.io); without it any address may.
const port = Number(process.env.PORT ?? 3001);
const origins = process.env.ALLOWED_ORIGINS?.split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const server = createGameServer({ corsOrigin: origins?.length ? origins : '*' });
server.http.listen(port, () => {
  process.stdout.write(`Gur game server listening on port ${port}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
