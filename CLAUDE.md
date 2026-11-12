# Gur

Gur is a closed-hand tile rummy game, played the way it is in Kosovo, for web, Android and iOS. "Gur" is Albanian for stone, which is what players call the tiles.

## Layout

| Path              | What it is                                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/engine` | The rules: tiles, joker, melds, closing hands, turns, scoring, plus simple bots (`src/bot.ts`). Pure TypeScript, no dependencies. Used by the server (authoritative) and the app (offline bots).  |
| `apps/client`     | Expo app (Expo Router) for web, Android and iOS. Screens in `src/app/`, components in `src/components/`, game state hooks in `src/game/`. See `apps/client/AGENTS.md` for Expo-specific guidance. |
| `apps/server`     | Node game server: lobbies, matchmaking, turn timer (not created yet).                                                                                                                             |

## Commands

Run from the repo root. Node 22 and pnpm 9 (via `corepack enable`).

- `pnpm install`
- `pnpm check` runs everything CI runs: format check, lint, typecheck, tests, build. Run it before every commit.
- `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm format`
- One package: `pnpm --filter @gur/engine test`
- `pnpm dev` builds the engine and starts the Expo dev server (press `w` for web, or scan the QR code with Expo Go)
- `pnpm test:e2e` builds the web app and runs the Playwright browser tests (desktop and phone sizes)
- Add Expo packages from `apps/client` with `pnpm exec expo install <package>`, never plain `pnpm add`, so versions match the Expo SDK.
- Stay on TypeScript 6.x until typescript-eslint supports TypeScript 7. Keep `@types/node` on 22.x to match Node 22. Dependabot is configured to skip both, and to skip Expo-pinned packages (upgrade those with `pnpm exec expo install --fix`).

## Rules for working in this repo

- **Never change a game rule without a test.** The rulebook ("Kosovo Rummy: rulebook and app spec" doc) is the source of truth. If code and rulebook disagree, ask before changing either.
- Key rules that are easy to get wrong:
  - The joker is the indicator's number + 1 in the same colour (13 → 1). Both real copies are wild. The printed joker is not wild: it counts as the joker number.
  - Scoring: the winner gets -10, or -20 when closing by discarding a real joker (a "double"), which also doubles everyone else's points. Special closing hands score the same as a normal close.
  - Points and closing treat the rack differently. For points, a loser always counts their best possible hand (the fewest unconnected points), however the rack is arranged. For closing, the rack decides: every group on it must be a meld once the 15th tile is taken off (seven pairs and mosaic count however they are placed). The app only offers Close when the rack shows that.
  - Discarded tiles stay on the table and the app shows the latest six. Only the newest can be taken, only by the next player, and only on that turn; after that it is gone for good.
  - The app shows a two-row rack as wide as the screen (12 or more slots a row, dealt 7 on top and 7 below); tiles side by side form a group, and the engine's arrangement always mirrors the rack. A tile dropped on another slides in beside it; tiles never swap.
  - 12-13-1 is a table option; 13-1-2 is never valid.
- The server is authoritative: clients send intentions, the server validates them with `@gur/engine`. Never trust a client's game state.
- Engine functions are pure: they return a new state and never mutate their input. Illegal moves throw `RuleError`.
- The app imports the engine's built output, so the engine must be built first (`pnpm dev` and Turbo do this).
- Every screen element a test needs gets a `testID` or an accessibility label; tests query by role and label first.
- Keep coverage thresholds in `packages/engine/vitest.config.ts` passing; don't lower them to make CI green.
- Work on a branch, open a pull request into `main`, and merge only when CI is green. Use clear commit messages (`feat:`, `fix:`, `test:`, `chore:`, `docs:`).
- Text files use LF line endings and UTF-8 (`.gitattributes`, `.editorconfig`).
