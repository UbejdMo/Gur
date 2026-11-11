# @gur/client

The Gur app for web, Android and iOS, built with Expo and Expo Router.

| Command (from the repo root)      | What it does                                                      |
| --------------------------------- | ----------------------------------------------------------------- |
| `pnpm dev`                        | Builds the engine and starts the Expo dev server                  |
| `pnpm --filter @gur/client test`  | Component tests (Jest and React Native Testing Library)           |
| `pnpm --filter @gur/client build` | Exports the web build to `dist/`                                  |
| `pnpm test:e2e`                   | Builds the web app and runs Playwright at desktop and phone sizes |

Screens live in `src/app/` (each file is a route), shared components in `src/components/`. Component tests are in `__tests__/` and browser tests in `e2e/`.
