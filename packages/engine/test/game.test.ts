import { describe, expect, it } from 'vitest';
import {
  RuleError,
  TILE_COUNT,
  acceptRestart,
  arrange,
  close,
  createGame,
  createGameWithDeal,
  discard,
  draw,
  handOf,
  nextRoundWithDeal,
  randomDeal,
  seededRng,
  timeoutMove,
  turnSeconds,
} from '../src';
import type { Game, Settings } from '../src';
import { makeDeal, t, ts } from './helpers';

const SETTINGS: Settings = { aceHigh: true, rounds: 1 };
const NORMAL = 'K11 B11 R11 Y11 Y7 Y8 Y9 Y10 R3 R4 R5 K3 B3 R3b';
// Second player: three melds plus two unconnected 13s.
const LOSER = 'B1b B2b B3b B5b B6b B7b K1b K2b K3b K5b K6b K7b B13b K13b';
const LOSER_GROUPS = ['B1b B2b B3b', 'B5b B6b B7b', 'K1b K2b K3b', 'K5b K6b K7b', 'B13b', 'K13b'].map(ts);

function tileCount(g: Game): number {
  const hands = g.players.reduce((s, p) => s + handOf(p).length, 0);
  return hands + g.round.middle.length + g.round.discards.length + 1;
}

function closingGame(indicator: string, closingTile: string, settings = SETTINGS): Game {
  const g = createGameWithDeal(settings, ['a', 'b'], 0, makeDeal(indicator, [NORMAL, LOSER], [closingTile]));
  return arrange(g, 1, LOSER_GROUPS);
}

describe('dealing', () => {
  it('deals 14 each, the starter draws to 15, and the middle starts at 48 / 62 / 76', () => {
    for (const [n, middle] of [
      [4, 48],
      [3, 62],
      [2, 76],
    ] as const) {
      const g = createGame(SETTINGS, ['a', 'b', 'c', 'd'].slice(0, n), seededRng(n));
      const sizes = g.players.map((p) => handOf(p).length);
      expect(sizes.filter((s) => s === 15)).toHaveLength(1);
      expect(sizes.filter((s) => s === 14)).toHaveLength(n - 1);
      expect(g.round.middle).toHaveLength(middle);
      expect(tileCount(g)).toBe(TILE_COUNT);
      expect(g.round.phase).toBe('discard');
    }
  });

  it('never uses a printed joker as the indicator', () => {
    for (let s = 0; s < 300; s++) {
      const g = createGame(SETTINGS, ['a', 'b'], seededRng(s));
      expect(g.round.indicator).toBeLessThan(104);
    }
  });

  it('gives 15 seconds for every turn, including the first', () => {
    const g = closingGame('R12', 'R4b');
    expect(turnSeconds(g)).toBe(15);
    expect(turnSeconds(discard(g, 0, t('R4b')))).toBe(15);
  });
});

describe('turns', () => {
  it('runs counter-clockwise; only the latest discard can be taken', () => {
    let g = createGame(SETTINGS, ['a', 'b', 'c'], seededRng(7));
    const s0 = g.round.current;
    const s1 = (s0 + 1) % 3;
    const s2 = (s0 + 2) % 3;
    const first = handOf(g.players[s0]!)[0]!;
    expect(() => discard(g, s1, handOf(g.players[s1]!)[0]!)).toThrow(RuleError);
    g = discard(g, s0, first);
    expect(g.round.current).toBe(s1);
    expect(() => discard(g, s1, handOf(g.players[s1]!)[0]!)).toThrow(/draw/);
    g = draw(g, s1, 'middle');
    expect(() => draw(g, s1, 'middle')).toThrow(/already drawn/);
    expect(g.round.lastDiscard).toBeNull(); // s0's discard is gone
    const second = handOf(g.players[s1]!)[0]!;
    g = discard(g, s1, second);
    g = draw(g, s2, 'discard');
    expect(handOf(g.players[s2]!)).toContain(second);
    expect(handOf(g.players[s2]!)).not.toContain(first);
    expect(tileCount(g)).toBe(TILE_COUNT);
  });

  it('rejects an arrangement that is not exactly your tiles', () => {
    const g = closingGame('R12', 'R4b');
    expect(() => arrange(g, 1, [ts('B1b B2b')])).toThrow(RuleError);
  });
});

describe('closing and scoring', () => {
  it('ordinary close: winner -10, others count unconnected tiles', () => {
    const g = close(closingGame('R12', 'R4b'), 0, t('R4b'));
    expect(g.results[0]).toMatchObject({ reason: 'close', winners: [0], scores: [-10, 26], double: false });
    expect(g.status).toBe('matchOver');
  });

  it('double: closing with the real joker scores -20 and doubles the others (13 + 13 = 52)', () => {
    const g = close(closingGame('Y1', 'Y2'), 0, t('Y2'));
    expect(g.results[0]).toMatchObject({ scores: [-20, 52], double: true });
  });

  it('closing with the printed joker is an ordinary close', () => {
    const g = close(closingGame('Y1', 'J'), 0, t('J'));
    expect(g.results[0]).toMatchObject({ scores: [-10, 26], double: false });
  });

  it('a badly arranged hand costs points', () => {
    let g = createGameWithDeal(SETTINGS, ['a', 'b'], 0, makeDeal('R12', [NORMAL, LOSER], ['R4b']));
    g = close(g, 0, t('R4b')); // loser never arranged: every tile counts
    expect(g.results[0]!.scores[1]).toBe(ts(LOSER).reduce((s, id) => s + (id % 13) + 1, 0));
  });

  it('refuses a close that is not a closing hand', () => {
    const g = closingGame('R12', 'R4b');
    expect(() => close(g, 0, t('R3'))).toThrow(/closing hand/);
  });
});

describe('the middle running out', () => {
  it('ends after the last middle tile is drawn and discarded; lowest total wins, ties share', () => {
    for (let s = 0; s < 20; s++) {
      let g = createGame(SETTINGS, ['a', 'b', 'c', 'd'], seededRng(100 + s));
      let turns = 0;
      while (g.status === 'playing') {
        g = timeoutMove(g);
        expect(tileCount(g)).toBe(TILE_COUNT);
        turns++;
      }
      expect(turns).toBe(49); // first discard + 48 middle tiles
      const r = g.results[0]!;
      expect(r.reason).toBe('stockOut');
      expect(g.round.middle).toHaveLength(0);
      const best = Math.min(...r.scores);
      expect(r.winners).toEqual(r.scores.flatMap((x, i) => (x === best ? [i] : [])));
      expect(r.scores.every((x) => x >= 0)).toBe(true); // nobody scores -10
    }
  });
});

describe('timer', () => {
  it('draws from the middle, then discards the highest unconnected tile, keeping jokers', () => {
    // joker = yellow 2; player 1 holds an unconnected joker and an unconnected black 13
    const hand1 = 'B1b B2b B3b B5b B6b B7b K1b K2b K3b K5b K6b K7b Y2 K13b';
    let g = createGameWithDeal(SETTINGS, ['a', 'b'], 0, makeDeal('Y1', [NORMAL, hand1], ['R4b', 'R1b']));
    g = arrange(g, 1, ['B1b B2b B3b', 'B5b B6b B7b', 'K1b K2b K3b', 'K5b K6b K7b', 'Y2', 'K13b'].map(ts));
    g = discard(g, 0, t('R4b'));
    g = timeoutMove(g);
    expect(handOf(g.players[1]!)).toContain(t('R1b')); // drew from the middle
    expect(g.round.lastDiscard).toEqual({ tile: t('K13b'), by: 1 });
    expect(handOf(g.players[1]!)).toContain(t('Y2'));
  });
});

describe('restart', () => {
  const pairs = 'R1 R1b Y6 Y6b K9 K9b B2 B4 B6 B8 B10 B12 R12 R13';

  it('offers a restart for 3 identical pairs; accepting redeals everyone', () => {
    const g = createGameWithDeal(SETTINGS, ['a', 'b'], 0, makeDeal('K12', [NORMAL, pairs], ['R4b']));
    expect(g.round.restartOffers).toEqual([1]);
    expect(() => acceptRestart(g, 0, seededRng(1))).toThrow(/not offered/);
    const r = acceptRestart(g, 1, seededRng(1));
    expect(handOf(r.players[0]!).sort()).not.toEqual(handOf(g.players[0]!).sort());
    expect(tileCount(r)).toBe(TILE_COUNT);
    expect(r.round.number).toBe(1);
  });

  it('the player can ignore it, and it closes after the first discard', () => {
    let g = createGameWithDeal(SETTINGS, ['a', 'b'], 0, makeDeal('K12', [NORMAL, pairs], ['R4b']));
    g = discard(g, 0, t('R4b'));
    expect(() => acceptRestart(g, 1, seededRng(1))).toThrow(RuleError);
  });
});

describe('rounds', () => {
  it('rotates the starter counter-clockwise and the lowest total wins the match', () => {
    const settings: Settings = { aceHigh: true, rounds: 3 };
    const third = 'Y1b Y2b Y3b Y4b Y5b Y6b R6b R7b R8b R9b R10b R11b R12b R13b';
    let g = createGameWithDeal(settings, ['a', 'b', 'c'], 2, makeDeal('R12', [LOSER, third, NORMAL], ['R4b']));
    g = close(g, 2, t('R4b'));
    expect(g.status).toBe('roundOver');
    const rng = seededRng(5);
    for (const expectedStarter of [0, 1]) {
      g = nextRoundWithDeal(g, randomDeal(3, rng));
      expect(g.round.starter).toBe(expectedStarter);
      expect(g.round.number).toBe(expectedStarter + 2);
      while (g.status === 'playing') g = timeoutMove(g);
    }
    expect(g.status).toBe('matchOver');
    const totals = g.players.map((p) => p.total);
    expect(totals).toEqual([0, 1, 2].map((i) => g.results.reduce((s, r) => s + r.scores[i]!, 0)));
    const best = Math.min(...totals);
    expect(g.matchWinners).toEqual(totals.flatMap((x, i) => (x === best ? [i] : [])));
    expect(() => nextRoundWithDeal(g, randomDeal(3, rng))).toThrow(RuleError);
  });
});
