# Gur

A closed-hand tile rummy game, played the way it is in Kosovo, for web, Android and iOS. "Gur" is Albanian for stone, which is what players call the tiles.

[![CI](https://github.com/UbejdMo/Gur/actions/workflows/ci.yml/badge.svg)](https://github.com/UbejdMo/Gur/actions/workflows/ci.yml)

## Getting started

You need Node 22 and pnpm 9.

```sh
corepack enable
pnpm install
pnpm check
```

`pnpm check` runs the same steps as CI: format check, lint, typecheck, tests and build. `pnpm test:e2e` runs the browser tests against the web build.

To run the app: `pnpm dev`, then press `w` to open it in the browser, or scan the QR code with the Expo Go app on your phone.

## Packages

| Package                              | Status                                           |
| ------------------------------------ | ------------------------------------------------ |
| [`packages/engine`](packages/engine) | Rules engine with tests                          |
| [`apps/client`](apps/client)         | Expo app for web, Android and iOS: first screen  |
| `apps/server`                        | Planned: game server for lobbies and online play |

## How changes get in

1. Create a branch from `main`.
2. Make the change with tests, and run `pnpm check`.
3. Open a pull request. CI runs on every push.
4. Merge when CI is green.
