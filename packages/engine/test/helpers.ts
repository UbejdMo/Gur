import { TILES, tileId } from '../src';
import type { Color, Deal, TileId } from '../src';

const C: Record<string, Color> = { R: 'red', Y: 'yellow', B: 'blue', K: 'black' };

/** t('R4') = red 4, t('Y1b') = second copy of yellow 1, t('J') / t('Jb') = printed jokers. */
export function t(code: string): TileId {
  if (code === 'J') return 104;
  if (code === 'Jb') return 105;
  const copy = code.endsWith('b') ? 1 : 0;
  const body = copy ? code.slice(0, -1) : code;
  return tileId(C[body[0]!]!, Number(body.slice(1)), copy as 0 | 1);
}

export function ts(codes: string): TileId[] {
  return codes.trim().split(/\s+/).map(t);
}

/** A full deal: given hands and the first middle tiles; the rest of the middle is filled with the unused tiles. */
export function makeDeal(indicator: string, hands: string[], middleTop: string[] = []): Deal {
  const handIds = hands.map(ts);
  const top = middleTop.map(t);
  const used = new Set([t(indicator), ...handIds.flat(), ...top]);
  const rest = TILES.map((x) => x.id).filter((id) => !used.has(id));
  return { indicator: t(indicator), hands: handIds, middle: [...top, ...rest] };
}
