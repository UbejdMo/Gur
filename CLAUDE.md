# Gur

Gur is a closed-hand tile rummy game, played the way it is in Kosovo, for web, Android and iOS. "Gur" is Albanian for stone, which is what players call the tiles.

## Layout

| Path              | What it is                                                                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/engine` | The rules: tiles, joker, melds, closing hands, turns, scoring. Pure TypeScript, no dependencies. Used by the server (authoritative) and the app (offline bots).  |
| `apps/client`     | Expo app (Expo Router) for web, Android and iOS. Screens in `src/app/`, components in `src/components/`. See `apps/client/AGENTS.md` for Expo-specific guidance. |
| `apps/server`     | Node game server: lobbies, matchmaking, turn timer (not created yet).                                                                                            |

## Commands

Run from the repo root. Node 22 and pnpm 9 (via `corepack enable`).

- `pnpm install`
- `pnpm check` runs everything CI runs: format check, lint, typecheck, tests, build. Run it before every commit.
- `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm format`
- One package: `pnpm --filter @gur/engine test`
- `pnpm dev` builds the engine and starts the Expo dev server (press `w` for web, or scan the QR code with Expo Go)
- `pnpm test:e2e` builds the web app and runs the Playwright browser tests (desktop and phone sizes)
- Add Expo packages from `apps/client` with `pnpm exec expo install <package>`, never plain `pnpm add`, so versions match the Expo SDK.

## Rules for working in this repo

- **Never change a game rule without a test.** The rulebook ("Kosovo Rummy: rulebook and app spec" doc) is the source of truth. If code and rulebook disagree, ask before changing either.
- Key rules that are easy to get wrong:
  - The joker is the indicator's number + 1 in the same colour (13 → 1). Both real copies are wild. The printed joker is not wild: it counts as the joker number.
  - Scoring: the winner gets -10, or -20 when closing by discarding a real joker (a "double"), which also doubles everyone else's points. Special closing hands score the same as a normal close.
  - Losers count unconnected tiles exactly as they arranged them. Never rearrange a player's hand for them.
  - 12-13-1 is a table option; 13-1-2 is never valid.
- The server is authoritative: clients send intentions, the server validates them with `@gur/engine`. Never trust a client's game state.
- Engine functions are pure: they return a new state and never mutate their input. Illegal moves throw `RuleError`.
- The app imports the engine's built output, so the engine must be built first (`pnpm dev` and Turbo do this).
- Every screen element a test needs gets a `testID` or an accessibility label; tests query by role and label first.
- Keep coverage thresholds in `packages/engine/vitest.config.ts` passing; don't lower them to make CI green.
- Work on a branch, open a pull request into `main`, and merge only when CI is green. Use clear commit messages (`feat:`, `fix:`, `test:`, `chore:`, `docs:`).
- Text files use LF line endings and UTF-8 (`.gitattributes`, `.editorconfig`).
