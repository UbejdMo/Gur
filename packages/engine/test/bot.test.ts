import { describe, expect, it } from 'vitest';
import {
  TILE_COUNT,
  bestArrangement,
  botTurn,
  chooseDiscard,
  createGame,
  createGameWithDeal,
  discard,
  findClosingTile,
  handOf,
  jokerFromIndicator,
  seededRng,
  shouldTakeDiscard,
  unconnectedTiles,
} from '../src';
import type { Game, Settings } from '../src';
import { makeDeal, t, ts } from './helpers';

const plain = jokerFromIndicator(t('R12')); // joker = red 13
const yellowTwo = jokerFromIndicator(t('Y1')); // joker = yellow 2
const SETTINGS: Settings = { aceHigh: true, rounds: 1 };

function tileCount(g: Game): number {
  // every tile is in a hand, in the middle, discarded, or the indicator (which a player may have taken)
  const onTable = g.round.indicatorTakenBy === null ? 1 : 0;
  return (
    g.players.reduce((s, p) => s + handOf(p).length, 0) + g.round.middle.length + g.round.discards.length + onTable
  );
}

describe('bestArrangement', () => {
  it('finds the melds and leaves the fewest points loose', () => {
    const a = bestArrangement(ts('B1 B2 B3 K5 R5 Y5 K13 R9'), plain, true);
    expect(a.melds).toHaveLength(2);
    expect(a.loose.sort()).toEqual(ts('K13 R9').sort());
    expect(a.penalty).toBe(22);
  });

  it('prefers leaving low tiles loose over high ones', () => {
    expect(bestArrangement(ts('B11 B12 B13 B3 K3 R3b'), plain, false).penalty).toBe(0);
    // B13 fits the run 11-12-13 or the set of 13s, not both: the set leaves 11 + 12 = 23, the run 13 + 13 = 26
    const b = bestArrangement(ts('B11 B12 B13 Y13 K13'), plain, false);
    expect(b.penalty).toBe(23);
    expect(b.loose.sort()).toEqual(ts('B11 B12').sort());
  });

  it('uses the joker to fill a gap', () => {
    const a = bestArrangement(ts('R5 R7 Y2 K9'), yellowTwo, true);
    expect(a.melds).toEqual([ts('R5 R7 Y2')]);
    expect(a.loose).toEqual(ts('K9'));
  });

  it('an empty hand costs nothing', () => {
    expect(bestArrangement([], plain, true)).toEqual({ melds: [], loose: [], penalty: 0 });
  });

  it('refuses hands too large to search', () => {
    expect(() =>
      bestArrangement(
        new Array(17).fill(0).map((_, i) => i),
        plain,
        true,
      ),
    ).toThrow(RangeError);
  });
});

describe('closing and discarding choices', () => {
  const normal = ts('K11 B11 R11 Y11 Y7 Y8 Y9 Y10 R3 R4 R5 K3 B3 R3b');

  it('finds the tile to close with', () => {
    expect(findClosingTile([...normal, t('B9')], plain, true)).toBe(t('B9'));
    expect(findClosingTile(ts('B1 B5 B9 K2 K6 K10 R1 R4 R8 R12 Y3 Y6 Y9 Y12 K13'), plain, true)).toBeNull();
  });

  it('prefers closing with a real joker, for a double', () => {
    // with yellow 2 as joker, the hand closes by discarding either B9 or the joker
    expect(findClosingTile([...normal, t('B9'), t('Y2')].slice(1), yellowTwo, true)).not.toBeNull();
    const hand = [...normal, t('Y2')];
    expect(findClosingTile(hand, yellowTwo, true)).toBe(t('Y2'));
  });

  it('discards the tile that leaves the cheapest rack and keeps jokers', () => {
    expect(chooseDiscard(ts('B1 B2 B3 K13 R4'), plain, true)).toBe(t('K13'));
    expect(chooseDiscard(ts('B1 B2 B3 Y2 K13'), yellowTwo, true)).toBe(t('K13'));
    expect(chooseDiscard(ts('Y2 Y2b'), yellowTwo, true)).toBe(t('Y2'));
  });

  it('takes a discard only when it helps', () => {
    expect(shouldTakeDiscard(ts('B1 B2 K13'), t('B3'), plain, true)).toBe(true);
    expect(shouldTakeDiscard(ts('B1 B2 K9'), t('R12b'), plain, true)).toBe(false);
    expect(shouldTakeDiscard(normal.slice(0, 13).concat(ts('K13')), t('R3b'), plain, true)).toBe(true);
  });
});

describe('botTurn', () => {
  const NORMAL = 'K11 B11 R11 Y11 Y7 Y8 Y9 Y10 R3 R4 R5 K3 B3 R3b';
  const OTHER = 'B1b B2b B3b B5b B6b B7b K1b K2b K3b K5b K6b K7b B13b K13b';

  it('closes when it can, with a double if possible', () => {
    const g = createGameWithDeal(SETTINGS, ['bot', 'p'], 0, makeDeal('Y1', [NORMAL, OTHER], ['Y2']));
    const after = botTurn(g);
    expect(after.results[0]).toMatchObject({ reason: 'close', winners: [0], double: true });
  });

  it('takes the indicator when that completes its hand, and closes', () => {
    // black 13 is the indicator; the bot holds two 13s and needs the third
    const waiting = 'R2 K2 Y2 K1 R13 B13 R8 K6 K7 K8 K9 K10 Y10 R10';
    const other = 'B1b B2b B3b B5b B6b B7b K2b K3b K4b K5b K6b K7b B13b K13b';
    let g = createGameWithDeal(SETTINGS, ['bot', 'b'], 1, makeDeal('K13', [waiting, other], ['R1b']));
    g = discard(g, 1, t('R1b'));
    g = botTurn(g);
    expect(g.round.indicatorTakenBy).toBe(0);
    expect(g.results[0]).toMatchObject({ reason: 'close', winners: [0], scores: [-10, 26] });
  });

  it('draws, arranges its rack, and discards when it cannot close', () => {
    let g = createGameWithDeal(SETTINGS, ['p', 'bot'], 0, makeDeal('R12', [NORMAL, OTHER], ['R9b', 'Y4b']));
    g = discard(g, 0, t('R9b'));
    g = botTurn(g);
    const bot = g.players[1]!;
    expect(handOf(bot)).toHaveLength(14);
    expect(g.round.current).toBe(0);
    // its rack is arranged: only the truly loose tiles are unconnected
    expect(unconnectedTiles(bot.groups, g.round.joker, true).length).toBeLessThanOrEqual(3);
  });

  it('takes the last discard when the middle is empty', () => {
    let g = createGameWithDeal(SETTINGS, ['p', 'bot'], 0, makeDeal('R12', [NORMAL, OTHER], ['R9b']));
    g = discard(g, 0, t('R9b'));
    g = { ...g, round: { ...g.round, middle: [] } };
    const taken = g.round.lastDiscard!.tile;
    // the round ends when the middle is empty and the bot discards
    g = botTurn(g);
    expect(g.results[0]?.reason ?? 'none').toMatch(/stockOut|close/);
    expect(handOf(g.players[1]!).includes(taken) || g.round.discards.some((d) => d.tile === taken)).toBe(true);
  });

  it('four bots can play whole rounds without breaking a rule', () => {
    for (let s = 0; s < 6; s++) {
      let g = createGame({ aceHigh: s % 2 === 0, rounds: 1 }, ['a', 'b', 'c', 'd'], seededRng(500 + s));
      let turns = 0;
      while (g.status === 'playing' && turns < 1000) {
        g = botTurn(g);
        expect(tileCount(g)).toBe(TILE_COUNT);
        turns++;
      }
      // bots also take useful discards, so a round can outlast the 48 middle tiles, but it always ends
      expect(turns).toBeGreaterThan(0);
      expect(turns).toBeLessThan(1000);
      expect(g.results).toHaveLength(1);
    }
  }, 60_000);
});
