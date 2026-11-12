/**
 * The best way to arrange a hand: the split into melds that leaves the fewest
 * points unconnected. Scoring uses it (losers always count their best possible
 * hand, however their rack was arranged), and so do the bots and the timer.
 */
import { faceOf, isRealJoker, tileValue } from './tiles';
import type { Face, Joker, TileId } from './tiles';
import { isMeld } from './melds';

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
export class HandAnalysis {
  private readonly faces: Face[];
  private readonly values: number[];
  private readonly melds: number[] = [];
  private readonly memo = new Map<number, { cost: number; meld: number }>();

  constructor(
    readonly hand: readonly TileId[],
    private readonly joker: Joker,
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

  /** The discard that leaves the cheapest rack; ties go to the higher tile. Real jokers are kept unless nothing else is left. */
  bestDiscard(): TileId {
    const keepJokers = this.hand.some((t) => !isRealJoker(t, this.joker));
    let best: { tile: TileId; cost: number; value: number } | null = null;
    for (const tile of this.hand) {
      if (keepJokers && isRealJoker(tile, this.joker)) continue;
      const cost = this.cost(this.maskWithout(tile));
      const value = tileValue(tile, this.joker);
      if (!best || cost < best.cost || (cost === best.cost && value > best.value)) best = { tile, cost, value };
    }
    return best!.tile;
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

/** The fewest points a hand can be left with: what it costs when someone else closes. */
export function bestPenalty(hand: readonly TileId[], joker: Joker, aceHigh: boolean): number {
  return bestArrangement(hand, joker, aceHigh).penalty;
}
