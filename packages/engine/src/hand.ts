/**
 * Closing hands and unconnected tiles.
 *
 * A player closes by discarding their 15th tile; the other 14 must be one of:
 * - melds: any split into melds of 3 or more (covers Normal, Bicolor, Minors,
 *   Majors, Monocolor and Eight of a kind, which all score the same)
 * - seven pairs: 7 pairs of identical tiles
 * - mosaic: one run 1..13 then 1 in mixed colours (needs 12-13-1 on)
 */
import { COLORS, faceOf, physicalKey, tileValue } from './tiles';
import type { Color, Face, Joker, TileId } from './tiles';
import { isMeld } from './melds';

export type ClosingHand = { kind: 'melds'; groups: TileId[][] } | { kind: 'sevenPairs' } | { kind: 'mosaic' };

function popcount(m: number): number {
  let c = 0;
  while (m) {
    m &= m - 1;
    c++;
  }
  return c;
}

/** Finds a split of all the tiles into melds, or null if none exists. */
export function findMeldPartition(ids: readonly TileId[], joker: Joker, aceHigh: boolean): TileId[][] | null {
  const n = ids.length;
  if (n === 0) return [];
  if (n > 20) throw new RangeError('Too many tiles to search');
  const faces = ids.map((id) => faceOf(id, joker));
  const meldCache = new Map<number, boolean>();
  const memo = new Map<number, number[] | null>();

  const isMeldMask = (mask: number): boolean => {
    let v = meldCache.get(mask);
    if (v === undefined) {
      const fs: Face[] = [];
      for (let i = 0; i < n; i++) if (mask & (1 << i)) fs.push(faces[i]!);
      v = isMeld(fs, aceHigh);
      meldCache.set(mask, v);
    }
    return v;
  };

  const solve = (mask: number): number[] | null => {
    if (mask === 0) return [];
    const cached = memo.get(mask);
    if (cached !== undefined) return cached;
    const low = mask & -mask;
    const rest = mask ^ low;
    let result: number[] | null = null;
    for (let sub = rest; sub > 0; sub = (sub - 1) & rest) {
      const group = sub | low;
      if (popcount(group) < 3 || !isMeldMask(group)) continue;
      const r = solve(mask ^ group);
      if (r) {
        result = [group, ...r];
        break;
      }
    }
    memo.set(mask, result);
    return result;
  };

  const masks = solve((1 << n) - 1);
  if (!masks) return null;
  return masks.map((m) => ids.filter((_, i) => m & (1 << i)));
}

/** 7 pairs of identical tiles. A wild can pair with anything. */
export function isSevenPairs(ids: readonly TileId[], joker: Joker): boolean {
  if (ids.length !== 14) return false;
  const counts = new Map<string, number>();
  let wilds = 0;
  for (const id of ids) {
    const f = faceOf(id, joker);
    if (f.wild) wilds++;
    else counts.set(`${f.color}-${f.number}`, (counts.get(`${f.color}-${f.number}`) ?? 0) + 1);
  }
  let leftover = 0;
  for (const c of counts.values()) leftover += c % 2;
  return leftover <= wilds && (wilds - leftover) % 2 === 0;
}

/**
 * Mosaic: 1, 2, ... 13, 1 in mixed colours. The first 4 tiles are all different
 * colours and every later tile differs in colour from the one before it.
 * Only possible when 12-13-1 is on. Wilds can take any position and colour.
 */
export function isMosaic(ids: readonly TileId[], joker: Joker, aceHigh: boolean): boolean {
  if (!aceHigh || ids.length !== 14) return false;
  type Slot = Color | undefined;
  const slots: Slot[] = new Array<Slot>(14).fill(undefined);
  const ones: Color[] = [];
  for (const id of ids) {
    const f = faceOf(id, joker);
    if (f.wild) continue;
    if (f.number === 1) ones.push(f.color);
    else {
      if (slots[f.number - 1] !== undefined) return false;
      slots[f.number - 1] = f.color;
    }
  }
  if (ones.length > 2) return false;
  const orders: [Slot, Slot][] =
    ones.length === 2
      ? [
          [ones[0], ones[1]],
          [ones[1], ones[0]],
        ]
      : ones.length === 1
        ? [
            [ones[0], undefined],
            [undefined, ones[0]],
          ]
        : [[undefined, undefined]];

  const ok = (s: Slot[]): boolean => {
    if (new Set(s.slice(0, 4)).size !== 4) return false;
    for (let p = 4; p < 14; p++) if (s[p] === s[p - 1]) return false;
    return true;
  };
  const fill = (s: Slot[], i: number): boolean => {
    if (i === 14) return ok(s);
    if (s[i] !== undefined) return fill(s, i + 1);
    for (const c of COLORS) {
      s[i] = c;
      if (fill(s, i + 1)) return true;
    }
    s[i] = undefined;
    return false;
  };

  for (const [first, last] of orders) {
    const s = [...slots];
    s[0] = first;
    s[13] = last;
    if (fill(s, 0)) return true;
  }
  return false;
}

/** Checks the 14 tiles left after the closing discard. */
export function checkClosingHand(ids: readonly TileId[], joker: Joker, aceHigh: boolean): ClosingHand | null {
  if (ids.length !== 14) return null;
  const groups = findMeldPartition(ids, joker, aceHigh);
  if (groups) return { kind: 'melds', groups };
  if (isSevenPairs(ids, joker)) return { kind: 'sevenPairs' };
  if (isMosaic(ids, joker, aceHigh)) return { kind: 'mosaic' };
  return null;
}

/**
 * Tiles not in a valid meld, as the player arranged them.
 * The app never rearranges a hand, so a badly arranged hand costs points.
 */
export function unconnectedTiles(groups: readonly (readonly TileId[])[], joker: Joker, aceHigh: boolean): TileId[] {
  const out: TileId[] = [];
  for (const g of groups) {
    if (
      !isMeld(
        g.map((id) => faceOf(id, joker)),
        aceHigh,
      )
    )
      out.push(...g);
  }
  return out;
}

export function penalty(groups: readonly (readonly TileId[])[], joker: Joker, aceHigh: boolean): number {
  return unconnectedTiles(groups, joker, aceHigh).reduce((sum, id) => sum + tileValue(id, joker), 0);
}

/** Number of identical pairs in a hand (two copies of the same tile). 3 or more triggers the restart offer. */
export function identicalPairCount(ids: readonly TileId[]): number {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(physicalKey(id), (counts.get(physicalKey(id)) ?? 0) + 1);
  let pairs = 0;
  for (const c of counts.values()) pairs += Math.floor(c / 2);
  return pairs;
}
