# Gur game server

Lets friends play together: one creates a lobby, shares its code, the others join, and the server runs the game. It uses the same rules engine as the app (`@gur/engine`), so the rules cannot differ between them.

## What it does

- **Play online (public tables).** `find` seats a player at an open public table whose players made the same 12-13-1 choice (the one with the most players waiting), or opens a new one. A public table is a lobby with no leader: one round, no bots (only people play online), and it starts by itself when four players are there, or with the two or three who are there 30 seconds (`MATCH_WAIT_MS`; `MATCH_WAIT_SECONDS` overrides it) after the second player sat down, however long the first waited alone, so others can still join. A player alone never starts a game and has no clock; if a table drops back to one player, the clock stops and starts again when somebody comes. Players whose app dropped before the start lose their seat. A friend can join a waiting public table by its code. After the round, players `find` again for a new table.
- **Lobbies with codes.** Five characters that are easy to read out (no O/0, no I/1/L). Up to four players. The player who creates the lobby is the host: they choose the options (12-13-1, 1/3/5 rounds, bots for empty seats) and start the game.
- **The server decides.** The app sends what a player wants to do; the server checks it against the rules and refuses it, with a reason in words, if it isn't allowed.
- **Nobody sees another rack.** Each player is sent only their own view: their own tiles, how many tiles the others hold, and how many are left in the middle. Every rack is shown once a round is over.
- **The clock.** 15 seconds a turn. When time runs out the server plays the timeout move. Bots take 1.5 to 4 seconds. After a round the next one starts by itself after 12 seconds, or at once when the host says so.
- **Dropped connections.** A player who loses the connection keeps their seat and gets back in with the key they were given when they joined. A player who drops during their turn keeps what is left of that turn, in case it was a blip. While they are gone and others are playing, the server plays their next turns after 1.5 seconds (`awayDelayMs`) instead of waiting out the clock, the same as for a player who left the game for good. Back again, they get their full clock. With nobody connected at the table, the normal clock runs.
- **Accounts.** A player who signed in sends their token when they open or join a lobby. The server asks Supabase whose it is and takes the name and picture from that player's profile, never from what the app says. One account holds one seat in a lobby. Players without a token are guests under the name they typed.
- **Invites.** A signed-in player with the app open says `hello` with their token, and the server keeps a room per account for their open connections (not saved anywhere). The lobby leader can `invite` a friend before the game: the server checks the leader's token, asks Supabase whether the two are friends (`supabaseFriendsCheck`), and sends `invited` to every open app of the friend. An invite lasts 10 seconds; until then it cannot be sent again.
- **Chat at the table.** Everyone in a lobby can `say` a line (up to 200 characters, at most 5 in 10 seconds), in the waiting room and during the game. Offensive words are starred out by Supabase's `star_out` (if it does not answer in 2 seconds, the line goes out as it is), and the line goes to everyone at the table as `chat`. The lobby keeps the last 50 lines in memory, sent to whoever (re)joins, and nothing is saved. Each member has a `chatId` that is not their key. A signed-in player can `report` another signed-in player there: the server calls `report_table_player` with the reporter's token and the last 20 lines the reported player said, so the report shows what was really said, and blocks them too if asked.
- **Message nudges.** Messages between friends are kept in the database, never here. After writing one, the app sends `poke`: the server checks the sender's token and that the two are friends, and tells the friend's open apps (and the sender's other ones) `news`, so they fetch it. At most 30 pokes a minute from one connection are passed on.
- **Clean-up.** A lobby is removed when everyone has left it, or when nobody has been connected to it for ten minutes. Games are kept in memory only: a restart of the server ends them.

## Layout

| File              | What it is                                                               |
| ----------------- | ------------------------------------------------------------------------ |
| `src/protocol.ts` | The messages between app and server. Types only; the app imports them.   |
| `src/lobby.ts`    | One lobby and its game: who may do what, and the clock. No network code. |
| `src/lobbies.ts`  | All lobbies, found by code; clean-up.                                    |
| `src/server.ts`   | Socket.IO: connects players' apps to lobbies.                            |
| `src/verify.ts`   | Checks a signed-in player's token against Supabase.                      |
| `src/index.ts`    | Starts the server on `PORT`.                                             |

## Running it

From the repo root:

- `pnpm dev:server` starts it on port 3001 and restarts when the code changes.
- `pnpm --filter @gur/server test` runs its tests (the lobby on fake time, real connections against a server on a spare port, and the database setup in `supabase/migrations` on a Postgres inside the test).
- `pnpm --filter @gur/server rehearse:migrations` applies `supabase/migrations` to a database made for the test, with the same tool that updates the real one after a merge (needs the `supabase` command; CI has it).
- `pnpm --filter @gur/server build` bundles it into `dist/index.js`; `pnpm --filter @gur/server start` runs that.

Settings, read from the environment:

| Name              | Meaning                                                                           |
| ----------------- | --------------------------------------------------------------------------------- |
| `PORT`            | Port to listen on. Default 3001.                                                  |
| `ALLOWED_ORIGINS` | Web addresses that may connect, separated by commas. Without it, any address may. |
| `SUPABASE_URL`    | The Supabase project that holds the accounts. Without it, everybody is a guest.   |
| `SUPABASE_KEY`    | That project's publishable key (`sb_publishable_...`). Never a secret key.        |

`GET /health` answers `ok`, for the host's health check.

## Hosting

`render.yaml` in the repo root describes the server for [Render](https://render.com) (free plan). On the free plan the server goes to sleep after 15 minutes without traffic and takes about a minute to wake up; messages from a game in progress keep it awake.
