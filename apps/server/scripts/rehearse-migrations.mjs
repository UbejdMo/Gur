/**
 * A rehearsal for the database update that runs after every merge (.github/workflows/deploy.yml).
 *
 * It starts a Postgres inside this process (PGlite) that looks enough like the Supabase project,
 * and lets the same tool the update uses, the Supabase CLI, push `supabase/migrations` to it:
 * once from nothing, and once more to see that a second run finds nothing left to do.
 * So a migration the tool cannot read or apply is caught here, before it meets the real database.
 *
 * Needs the `supabase` command (CI installs it; on your own computer: `npm i -g supabase`).
 */
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const standIn = readFileSync(new URL('../test/supabase-stand-in.sql', import.meta.url), 'utf8');
const files = readdirSync(`${root}supabase/migrations`)
  .filter((name) => name.endsWith('.sql'))
  .sort();
const port = Number(process.env.REHEARSAL_PORT ?? 54329);
const url = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`;

/** Runs the tool and resolves to how it ended and what it said. */
function push() {
  return new Promise((resolve) => {
    const tool = spawn('supabase', ['db', 'push', '--yes', `--remote=${url}`, '--workdir', root]);
    let said = '';
    tool.stdout.on('data', (chunk) => (said += chunk));
    tool.stderr.on('data', (chunk) => (said += chunk));
    tool.on('error', (error) => resolve({ status: -1, said: String(error) }));
    tool.on('close', (status) => resolve({ status, said }));
  });
}

const db = await PGlite.create();
await db.exec(standIn);
const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' });
await server.start();

let problem = null;
try {
  const first = await push();
  process.stdout.write(first.said);
  if (first.status === -1) {
    problem = 'The `supabase` command was not found. Install it with: npm i -g supabase';
  } else if (first.status !== 0) {
    problem = 'The migrations could not be applied (see above).';
  } else {
    const applied = (await db.query('select version from supabase_migrations.schema_migrations order by version')).rows;
    const expected = files.map((name) => name.split('_')[0]);
    if (JSON.stringify(applied.map((row) => row.version)) !== JSON.stringify(expected)) {
      problem = `Applied ${JSON.stringify(applied)} but expected ${JSON.stringify(expected)}.`;
    } else {
      const second = await push();
      process.stdout.write(second.said);
      const after = (await db.query('select count(*)::int as n from supabase_migrations.schema_migrations')).rows[0].n;
      if (second.status !== 0 || after !== files.length) problem = 'A second run was not a quiet one.';
    }
  }
} finally {
  await server.stop();
  await db.close();
}

if (problem) {
  process.stderr.write(`\nRehearsal failed: ${problem}\n`);
  process.exit(1);
}
process.stdout.write(
  `\nRehearsal passed: ${files.length} migrations applied in order, and a second run changed nothing.\n`,
);
process.exit(0);
