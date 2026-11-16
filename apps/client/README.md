# @gur/client

The Gur app for web, Android and iOS, built with Expo and Expo Router.

| Command (from the repo root)      | What it does                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| `pnpm dev`                        | Builds the engine and starts the Expo dev server                                   |
| `pnpm --filter @gur/client test`  | Component tests (Jest and React Native Testing Library)                            |
| `pnpm --filter @gur/client build` | Exports the web build to `dist/`                                                   |
| `pnpm test:e2e`                   | Builds the web app and the server, then runs Playwright at desktop and phone sizes |

Screens live in `src/app/` (each file is a route), shared components in `src/components/`. Component tests are in `__tests__/` and browser tests in `e2e/`.

## Two ways to play, one table

- **Against bots** (`src/game/`): the whole game runs on the device. `usePracticeGame` holds it.
- **With friends** (`src/online/`): the game runs on the server (`apps/server`). `connection.ts` is the app's one line to it, `useOnlineTable` follows the state the server sends and turns your moves into requests. Your rack is arranged on your device and the server is told how it lies.

Both produce a `TableModel` (`src/game/tableModel.ts`), and `GameTable` draws it. The table seats two to four players.

- **Accounts** (`src/account/`): signing in with Google is optional. `account.ts` holds who you are (name, eight-digit ID, picture) for the whole app; `supabaseBackend.ts` is the only file that talks to Supabase. Without a Supabase project in `config.ts`, nothing about signing in is shown. Setting it up: [`docs/sign-in-setup.md`](../../docs/sign-in-setup.md).

The server's address is in `src/online/config.ts`. To use a server on your own computer, start it with `pnpm dev:server` and the app with `EXPO_PUBLIC_SERVER_URL=http://localhost:3001 pnpm dev`.
