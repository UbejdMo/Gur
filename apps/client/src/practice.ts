import { COLORS, createGame, getTile, handOf, isRealJoker } from '@gur/engine';
import type { Game, Joker, TileId } from '@gur/engine';

export type PracticeDeal = {
  game: Game;
  hand: TileId[];
};

/** Deals a 4-player practice round; the viewer sits in seat 0 and starts, so they hold 15 tiles. */
export function dealPractice(rng: () => number = Math.random): PracticeDeal {
  const game = createGame({ aceHigh: true, rounds: 1 }, ['you', 'bot 1', 'bot 2', 'bot 3'], seededAfterStarter(rng));
  return { game, hand: sortForDisplay(handOf(game.players[0]!), game.round.joker) };
}

/** Starter is seat 0 (first draw returns 0), then the remaining draws come from rng. */
function seededAfterStarter(rng: () => number): () => number {
  let first = true;
  return () => {
    if (first) {
      first = false;
      return 0;
    }
    return rng();
  };
}

/** Jokers first, then by colour and number, printed jokers last. Display only: the engine keeps the player's own arrangement. */
export function sortForDisplay(ids: TileId[], joker: Joker): TileId[] {
  const key = (id: TileId) => {
    const t = getTile(id);
    if (isRealJoker(id, joker)) return -1;
    if (t.printedJoker) return 1000;
    return COLORS.indexOf(t.color!) * 100 + t.number!;
  };
  return [...ids].sort((a, b) => key(a) - key(b));
}
