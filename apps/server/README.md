# Gur game server

Lets friends play together: one creates a lobby, shares its code, the others join, and the server runs the game. It uses the same rules engine as the app (`@gur/engine`), so the rules cannot differ between them.

## What it does

- **Lobbies with codes.** Five characters that are easy to read out (no O/0, no I/1/L). Up to four players. The player who creates the lobby is the host: they choose the options (12-13-1, 1/3/5 rounds, bots for empty seats) and start the game.
- **The server decides.** The app sends what a player wants to do; the server checks it against the rules and refuses it, with a reason in words, if it isn't allowed.
- **Nobody sees another rack.** Each player is sent only their own view: their own tiles, how many tiles the others hold, and how many are left in the middle. Every rack is shown once a round is over.
- **The clock.** 15 seconds a turn. When time runs out the server plays the timeout move. Bots take 1.5 to 4 seconds. After a round the next one starts by itself after 12 seconds, or at once when the host says so.
- **Dropped connections.** A player who loses the connection keeps their seat and gets back in with the key they were given when they joined. A player who leaves a game for good is played for by the server.
- **Clean-up.** A lobby is removed when everyone has left it, or when nobody has been connected to it for ten minutes. Games are kept in memory only: a restart of the server ends them.

## Layout

| File              | What it is                                                               |
| ----------------- | ------------------------------------------------------------------------ |
| `src/protocol.ts` | The messages between app and server. Types only; the app imports them.   |
| `src/lobby.ts`    | One lobby and its game: who may do what, and the clock. No network code. |
| `src/lobbies.ts`  | All lobbies, found by code; clean-up.                                    |
| `src/server.ts`   | Socket.IO: connects players' apps to lobbies.                            |
| `src/index.ts`    | Starts the server on `PORT`.                                             |

## Running it

From the repo root:

- `pnpm dev:server` starts it on port 3001 and restarts when the code changes.
- `pnpm --filter @gur/server test` runs its tests (the lobby on fake time, and real connections against a server on a spare port).
- `pnpm --filter @gur/server build` bundles it into `dist/index.js`; `pnpm --filter @gur/server start` runs that.

Settings, read from the environment:

| Name              | Meaning                                                                           |
| ----------------- | --------------------------------------------------------------------------------- |
| `PORT`            | Port to listen on. Default 3001.                                                  |
| `ALLOWED_ORIGINS` | Web addresses that may connect, separated by commas. Without it, any address may. |

`GET /health` answers `ok`, for the host's health check.

## Hosting

`render.yaml` in the repo root describes the server for [Render](https://render.com) (free plan). On the free plan the server goes to sleep after 15 minutes without traffic and takes about a minute to wake up; messages from a game in progress keep it awake.
