# Gur

Gur is a closed-hand tile rummy game, played the way it is in Kosovo, for web, Android and iOS. "Gur" is Albanian for stone, which is what players call the tiles.

## Layout

| Path              | What it is                                                                                                                                                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/engine` | The rules: tiles, joker, melds, closing hands, turns, scoring, plus simple bots (`src/bot.ts`). Pure TypeScript, no dependencies. Used by the server (authoritative) and the app (offline bots).                                                                               |
| `apps/client`     | Expo app (Expo Router) for web, Android and iOS. Screens in `src/app/`, components in `src/components/`, the practice game and rack in `src/game/`, playing with friends in `src/online/`, accounts in `src/account/`. See `apps/client/AGENTS.md` for Expo-specific guidance. |
| `apps/server`     | Node game server (Socket.IO): lobbies with codes, authoritative play, turn timer, bots for empty seats. `src/lobby.ts` holds the logic, `src/server.ts` the network, `src/protocol.ts` the messages (the app imports its types).                                               |
| `supabase`        | The database behind the accounts: `migrations/` holds the SQL that sets it up (player profiles).                                                                                                                                                                               |

## Commands

Run from the repo root. Node 22 and pnpm 9 (via `corepack enable`).

- `pnpm install`
- `pnpm check` runs everything CI runs: format check, lint, typecheck, tests, build. Run it before every commit.
- `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm format`
- One package: `pnpm --filter @gur/engine test`
- `pnpm dev` builds the engine and starts the Expo dev server (press `w` for web, or scan the QR code with Expo Go)
- `pnpm dev:server` builds the engine and starts the game server on port 3001, restarting when its code changes
- `pnpm test:e2e` builds the web app and the server and runs the Playwright browser tests (desktop, phone upright and phone sideways). The tests start their own game server and play with two browsers against it.
- Add Expo packages from `apps/client` with `pnpm exec expo install <package>`, never plain `pnpm add`, so versions match the Expo SDK.
- Stay on TypeScript 6.x until typescript-eslint supports TypeScript 7. Keep `@types/node` on 22.x to match Node 22. Dependabot is configured to skip both, and to skip Expo-pinned packages (upgrade those with `pnpm exec expo install --fix`).

## Rules for working in this repo

- **Never change a game rule without a test.** The rulebook ("Kosovo Rummy: rulebook and app spec" doc) is the source of truth. If code and rulebook disagree, ask before changing either.
- Key rules that are easy to get wrong:
  - The joker is the indicator's number + 1 in the same colour (13 → 1). Both real copies are wild. The printed joker is not wild: it counts as the joker number.
  - Scoring: the winner gets -10, or -20 when closing by discarding a real joker (a "double"), which also doubles everyone else's points. Special closing hands score the same as a normal close.
  - Points and closing treat the rack differently. For points, a loser always counts their best possible hand (the fewest unconnected points), however the rack is arranged. For closing, the rack decides: every group on it must be a meld once the 15th tile is taken off (seven pairs and mosaic count however they are placed). The app only offers Close when the rack shows that.
  - Discarded tiles stay on the table. A discard is left for the next player, so it lies in front of them, not in front of whoever discarded it; the app shows the latest six in front of each player. Only the newest can be taken, only by the next player, and only on that turn; after that it is gone for good.
  - The app shows a two-row rack (12 slots a row on an upright phone, up to 14 sideways, dealt 7 on top and 7 below); tiles side by side form a group, and the engine's arrangement always mirrors the rack. A tile dropped on another slides in beside it; tiles never swap.
  - The indicator can be taken instead of drawing, but only when it completes the hand (the 15 tiles then hold a closing hand), and the player must close on that turn. The app never hints at when that is. If their time runs out after taking it, the game closes for them.
  - 12-13-1 is a table option; 13-1-2 is never valid.
- The server is authoritative: clients send intentions, the server validates them with `@gur/engine`. Never trust a client's game state. A player is only ever sent their own view (`playerView` in the engine): never another rack, never the order of the middle. Anything a player may be told is refused with a `LobbyError`, whose message is shown to that player.
- One table, two sources: `GameTable` draws a `TableModel` (a `PlayerView` plus the rack and the actions). `usePracticeGame` builds it from a game on the device, `useOnlineTable` from the server's state. A change to the table must work for both, and for 2, 3 and 4 players.
- The app talks to the game server through `src/online/connection.ts` only. The server's address is `DEFAULT_SERVER` in `src/online/config.ts`; `EXPO_PUBLIC_SERVER_URL` overrides it at build time (a local server is `http://localhost:3001`).
- Accounts are optional and live in a Supabase project (`docs/sign-in-setup.md`, `supabase/migrations/`). The app reaches Supabase through `src/account/supabaseBackend.ts` only, and shows nothing about signing in while `src/account/config.ts` has no project. Only the project URL and the publishable key (`sb_publishable_...`) ever go into this repo; never a secret key. The game server takes a signed-in player's name and picture from their profile, checked with their token (`apps/server/src/verify.ts`), never from what the app says. A change to the database is a new file in `supabase/migrations/` (the next number, `0003_some_name.sql`) with a test in `apps/server/test/`. After a merge the Deploy workflow applies new files to the real database by itself, before the web game goes out, so: never change a file that was merged (write a new one), and make each change one the app that is live right now can still work with (add first; remove in a later step).
- The privacy policy and the terms of service are plain pages next to the web game: `apps/client/public/privacy.html` and `terms.html` (styled by `legal.css`, no scripts). Google's sign-in settings and the app stores link to them, so their addresses must not change. When the game starts keeping something new about players, or a new company's service is used, the privacy policy changes in the same pull request, with its date.
- Engine functions are pure: they return a new state and never mutate their input. Illegal moves throw `RuleError`.
- The app imports the engine's built output, so the engine must be built first (`pnpm dev` and Turbo do this).
- Every screen element a test needs gets a `testID` or an accessibility label; tests query by role and label first.
- Keep coverage thresholds in `packages/engine/vitest.config.ts` passing; don't lower them to make CI green.
- Work on a branch, open a pull request into `main`, and merge only when CI is green. Use clear commit messages (`feat:`, `fix:`, `test:`, `chore:`, `docs:`).
- Text files use LF line endings and UTF-8 (`.gitattributes`, `.editorconfig`).
