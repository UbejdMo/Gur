# @gur/engine

The rules of Gur as pure TypeScript with no dependencies. The game server uses it to deal and check every move; the app uses it for offline games against bots.

| File           | What it covers                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| `src/tiles.ts` | 106 tiles, joker from the indicator (13 → 1), printed joker, tile values                                      |
| `src/melds.ts` | Sets, runs, the 12-13-1 option                                                                                |
| `src/hand.ts`  | Closing hands (melds, seven pairs, mosaic), unconnected tiles, restart check                                  |
| `src/bot.ts`   | Simple bots: best arrangement, when to take a discard, what to discard, when to close                         |
| `src/game.ts`  | Dealing, restart, draw and discard, closing, doubles, the middle running out, scoring, rounds, the timer move |

Every action takes a game and returns a new one. An illegal move throws `RuleError`. Seats are numbered counter-clockwise.

```ts
import { createGame, discard, draw, close, timeoutMove, turnSeconds } from '@gur/engine';

let game = createGame({ aceHigh: true, rounds: 3 }, ['ana', 'besa', 'dren', 'era'], Math.random);
game = discard(game, game.round.current, tileId); // the first player starts with 15 tiles
game = draw(game, seat, 'discard'); // or 'middle'
game = close(game, seat, tileId); // discards the 15th tile and closes
game = timeoutMove(game); // call when turnSeconds(game) runs out
```
