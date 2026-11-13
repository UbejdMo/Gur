/**
 * Simple computer players. They arrange their own racks with the same search
 * that scoring uses (see arrange.ts).
 */
import type { Joker, TileId } from './tiles';
import { HandAnalysis, closingDiscard } from './arrange';
import { arrange, canTakeIndicator, close, discard, draw, handOf } from './game';
import type { Game } from './game';

/**
 * A tile that can be discarded to close from a 15-tile hand, or null.
 * Prefers a real joker, because closing with it is a double.
 */
export function findClosingTile(hand: readonly TileId[], joker: Joker, aceHigh: boolean): TileId | null {
  return closingDiscard(hand, joker, aceHigh);
}

/** The discard that leaves the cheapest rack. Real jokers are kept unless nothing else is left. */
export function chooseDiscard(hand: readonly TileId[], joker: Joker, aceHigh: boolean): TileId {
  return new HandAnalysis(hand, joker, aceHigh).bestDiscard();
}

/** Whether taking the last discard would leave a cheaper rack than the current one, or let the bot close. */
export function shouldTakeDiscard(hand: readonly TileId[], tile: TileId, joker: Joker, aceHigh: boolean): boolean {
  const a = new HandAnalysis([...hand, tile], joker, aceHigh);
  if (closingDiscard(a.hand, joker, aceHigh) !== null) return true;
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
    // The indicator may be taken when it completes the hand: a certain win, so it comes first.
    g = draw(g, seat, canTakeIndicator(g, seat) ? 'indicator' : takeIt ? 'discard' : 'middle');
  }

  const a = new HandAnalysis(handOf(g.players[seat]!), joker, aceHigh);
  const closing = closingDiscard(a.hand, joker, aceHigh);
  // The rack is arranged before either move: a close only counts with the melds laid out.
  const out = closing ?? a.bestDiscard();
  const { melds, loose } = a.arrangement(a.maskWithout(out));
  g = arrange(g, seat, [...melds, ...loose.map((t) => [t]), [out]]);
  return closing !== null ? close(g, seat, out) : discard(g, seat, out);
}
