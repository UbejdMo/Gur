/**
 * Simple computer players. They arrange their own racks with the same search
 * that scoring uses (see arrange.ts).
 */
import { isRealJoker } from './tiles';
import type { Joker, TileId } from './tiles';
import { HandAnalysis } from './arrange';
import { isMosaic, isSevenPairs } from './hand';
import { arrange, close, discard, draw, handOf } from './game';
import type { Game } from './game';

function closingTileIn(a: HandAnalysis, joker: Joker, aceHigh: boolean): TileId | null {
  // Real jokers first: closing with one is a double.
  const candidates = [...a.hand].sort((x, y) => Number(isRealJoker(y, joker)) - Number(isRealJoker(x, joker)));
  for (const tile of candidates) {
    if (a.cost(a.maskWithout(tile)) === 0) return tile;
    const rest = a.hand.filter((t) => t !== tile);
    if (isSevenPairs(rest, joker) || isMosaic(rest, joker, aceHigh)) return tile;
  }
  return null;
}

/**
 * A tile that can be discarded to close from a 15-tile hand, or null.
 * Prefers a real joker, because closing with it is a double.
 */
export function findClosingTile(hand: readonly TileId[], joker: Joker, aceHigh: boolean): TileId | null {
  if (hand.length !== 15) return null;
  return closingTileIn(new HandAnalysis(hand, joker, aceHigh), joker, aceHigh);
}

/** The discard that leaves the cheapest rack. Real jokers are kept unless nothing else is left. */
export function chooseDiscard(hand: readonly TileId[], joker: Joker, aceHigh: boolean): TileId {
  return new HandAnalysis(hand, joker, aceHigh).bestDiscard();
}

/** Whether taking the last discard would leave a cheaper rack than the current one, or let the bot close. */
export function shouldTakeDiscard(hand: readonly TileId[], tile: TileId, joker: Joker, aceHigh: boolean): boolean {
  const a = new HandAnalysis([...hand, tile], joker, aceHigh);
  if (hand.length === 14 && closingTileIn(a, joker, aceHigh) !== null) return true;
  const now = a.cost(a.maskWithout(tile));
  const after = a.cost(a.maskWithout(a.bestDiscard()));
  return after < now;
}

/** Plays one whole turn for the current player: draw, then close if possible, otherwise discard. */
export function botTurn(game: Game): Game {
  const seat = game.round.current;
  const { joker } = game.round;
  const { aceHigh } = game.settings;
  let g = game;

  if (g.round.phase === 'draw') {
    const last = g.round.lastDiscard;
    const takeIt =
      last !== null &&
      (g.round.middle.length === 0 || shouldTakeDiscard(handOf(g.players[seat]!), last.tile, joker, aceHigh));
    g = draw(g, seat, takeIt ? 'discard' : 'middle');
  }

  const a = new HandAnalysis(handOf(g.players[seat]!), joker, aceHigh);
  const closing = closingTileIn(a, joker, aceHigh);
  // The rack is arranged before either move: a close only counts with the melds laid out.
  const out = closing ?? a.bestDiscard();
  const { melds, loose } = a.arrangement(a.maskWithout(out));
  g = arrange(g, seat, [...melds, ...loose.map((t) => [t]), [out]]);
  return closing !== null ? close(g, seat, out) : discard(g, seat, out);
}
