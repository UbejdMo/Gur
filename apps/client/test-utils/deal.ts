import { TILES, createGameWithDeal, tileId } from '@gur/engine';
import type { Color, Game, TileId } from '@gur/engine';
import { PLAYER_NAMES } from '@/game/usePracticeGame';

const C: Record<string, Color> = { R: 'red', Y: 'yellow', B: 'blue', K: 'black' };

/** t('R4') = red 4, t('Y1b') = second copy of yellow 1, t('J') = printed joker. */
export function t(code: string): TileId {
  if (code === 'J') return 104;
  if (code === 'Jb') return 105;
  const copy = code.endsWith('b') ? 1 : 0;
  const body = copy ? code.slice(0, -1) : code;
  return tileId(C[body[0]!]!, Number(body.slice(1)), copy as 0 | 1);
}

export const ts = (codes: string) => codes.trim().split(/\s+/).map(t);

export const NORMAL = 'K11 B11 R11 Y11 Y7 Y8 Y9 Y10 R3 R4 R5 K3 B3 R3b';
/**
 * A closing hand that is already laid out as dealt: the rack deals 7 tiles to each row,
 * so each row is a run of seven. NORMAL could close too, but only after it is arranged.
 */
export const READY = 'R1 R2 R3 R4 R5 R6 R7 K1 K2 K3 K4 K5 K6 K7';
/** Like NORMAL but one tile short of a closing hand (blue 9 instead of the third 3). */
export const ALMOST = 'K11 B11 R11 Y11 Y7 Y8 Y9 Y10 R3 R4 R5 K3 B3 B9';
export const FILLER = [
  'B1b B2b B3b B5b B6b B7b K1b K2b K3b K5b K6b K7b B13b K13b',
  'Y1b Y2b Y3b Y5b Y6b R6b R7b R8b R10b R11b R12b R13b B4b K4b',
  'Y7b Y12b R1b R5b B8b B5 Y13b R2b B12b K8b B10b K9b Y9b R4b',
];

/** A 4-player practice game from a fixed deal: you are seat 0, `starter` plays first. */
export function practiceGame(
  opts: { you?: string; starter?: number; middleTop?: string[]; indicator?: string; aceHigh?: boolean } = {},
): Game {
  const hands = [opts.you ?? NORMAL, ...FILLER].map(ts);
  const top = (opts.middleTop ?? ['R9b']).map(t);
  const indicator = t(opts.indicator ?? 'R12');
  const used = new Set([indicator, ...hands.flat(), ...top]);
  const rest = TILES.map((x) => x.id).filter((id) => !used.has(id));
  return createGameWithDeal({ aceHigh: opts.aceHigh ?? true, rounds: 1 }, PLAYER_NAMES, opts.starter ?? 0, {
    indicator,
    hands,
    middle: [...top, ...rest],
  });
}
