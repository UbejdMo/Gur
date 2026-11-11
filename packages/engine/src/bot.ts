/**
 * Simple computer players, plus the arrangement search they use.
 *
 * Bots arrange their own racks perfectly. Human racks are never rearranged by
 * the engine: a person's arrangement is theirs, and unconnected tiles count as
 * they left them.
 */
import { faceOf, isRealJoker, tileValue } from './tiles';
import type { Face, Joker, TileId } from './tiles';
import { isMeld } from './melds';
import { isMosaic, isSevenPairs } from './hand';
import { arrange, close, discard, draw, handOf } from './game';
import type { Game } from './game';

export interface Arrangement {
  /** Valid melds. */
  melds: TileId[][];
  /** Tiles left out of every meld. */
  loose: TileId[];
  /** Sum of the loose tiles' values: what this rack would cost if someone closed now. */
  penalty: number;
}

/** Could these tiles still grow into a set or a run? Used to prune the meld search. */
function couldBecomeMeld(faces: readonly Face[]): boolean {
  const fixed = faces.filter((f): f is Exclude<Face, { wild: true }> => !f.wild);
  if (fixed.length <= 1) return faces.length <= 14;
  const sameNumber = fixed.every((f) => f.number === fixed[0]!.number);
  const distinctColors = new Set(fixed.map((f) => f.color)).size === fixed.length;
  if (sameNumber && distinctColors && faces.length <= 4) return true;
  const sameColor = fixed.every((f) => f.color === fixed[0]!.color);
  if (!sameColor || faces.length > 14) return false;
  const nums = fixed.filter((f) => f.number !== 1).map((f) => f.number);
  const ones = fixed.length - nums.length;
  return new Set(nums).size === nums.length && ones <= 2;
}

/**
 * Analyses one hand once: finds every meld in it, then answers "what is the
 * cheapest arrangement of these tiles?" for the whole hand or any part of it.
 */
class HandAnalysis {
  private readonly faces: Face[];
  private readonly values: number[];
  private readonly melds: number[] = [];
  private readonly memo = new Map<number, { cost: number; meld: number }>();

  constructor(
    readonly hand: readonly TileId[],
    joker: Joker,
    aceHigh: boolean,
  ) {
    if (hand.length > 20) throw new RangeError('Too many tiles to arrange');
    this.faces = hand.map((id) => faceOf(id, joker));
    this.values = hand.map((id) => tileValue(id, joker));
    const walk = (start: number, mask: number, picked: Face[]) => {
      if (picked.length >= 3 && isMeld(picked, aceHigh)) this.melds.push(mask);
      for (let i = start; i < hand.length; i++) {
        const next = [...picked, this.faces[i]!];
        if (couldBecomeMeld(next)) walk(i + 1, mask | (1 << i), next);
      }
    };
    walk(0, 0, []);
  }

  get all(): number {
    return (1 << this.hand.length) - 1;
  }

  maskWithout(tile: TileId): number {
    return this.all & ~(1 << this.hand.indexOf(tile));
  }

  /** Fewest points left unconnected using only the tiles in mask. */
  cost(mask: number): number {
    if (mask === 0) return 0;
    const hit = this.memo.get(mask);
    if (hit) return hit.cost;
    const low = mask & -mask;
    let best = { cost: this.values[31 - Math.clz32(low)]! + this.cost(mask ^ low), meld: 0 };
    for (const m of this.melds) {
      if ((m & low) === 0 || (m & mask) !== m) continue;
      const c = this.cost(mask ^ m);
      if (c < best.cost) best = { cost: c, meld: m };
    }
    this.memo.set(mask, best);
    return best.cost;
  }

  arrangement(mask: number): Arrangement {
    const penalty = this.cost(mask);
    const result: Arrangement = { melds: [], loose: [], penalty };
    while (mask) {
      const low = mask & -mask;
      const choice = this.memo.get(mask)!.meld;
      if (choice === 0) {
        result.loose.push(this.hand[31 - Math.clz32(low)]!);
        mask ^= low;
      } else {
        result.melds.push(this.hand.filter((_, i) => choice & (1 << i)));
        mask ^= choice;
      }
    }
    return result;
  }
}

/** The split of a hand into melds that leaves the fewest points unconnected. */
export function bestArrangement(hand: readonly TileId[], joker: Joker, aceHigh: boolean): Arrangement {
  if (hand.length > 16) throw new RangeError('Too many tiles to arrange');
  const a = new HandAnalysis(hand, joker, aceHigh);
  return a.arrangement(a.all);
}

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

function discardIn(a: HandAnalysis, joker: Joker): TileId {
  const keepJokers = a.hand.some((t) => !isRealJoker(t, joker));
  let best: { tile: TileId; cost: number; value: number } | null = null;
  for (const tile of a.hand) {
    if (keepJokers && isRealJoker(tile, joker)) continue;
    const cost = a.cost(a.maskWithout(tile));
    const value = tileValue(tile, joker);
    if (!best || cost < best.cost || (cost === best.cost && value > best.value)) best = { tile, cost, value };
  }
  return best!.tile;
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
  return discardIn(new HandAnalysis(hand, joker, aceHigh), joker);
}

/** Whether taking the last discard would leave a cheaper rack than the current one, or let the bot close. */
export function shouldTakeDiscard(hand: readonly TileId[], tile: TileId, joker: Joker, aceHigh: boolean): boolean {
  const a = new HandAnalysis([...hand, tile], joker, aceHigh);
  if (hand.length === 14 && closingTileIn(a, joker, aceHigh) !== null) return true;
  const now = a.cost(a.maskWithout(tile));
  const after = a.cost(a.maskWithout(discardIn(a, joker)));
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
  if (closing !== null) return close(g, seat, closing);

  const out = discardIn(a, joker);
  const { melds, loose } = a.arrangement(a.maskWithout(out));
  g = arrange(g, seat, [...melds, ...loose.map((t) => [t]), [out]]);
  return discard(g, seat, out);
}
