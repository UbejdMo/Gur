import { describe, expect, it } from 'vitest';
import { arrange, close, createGame, createGameWithDeal, discard, handOf, playerView, seededRng } from '../src';
import { makeDeal, t, ts } from './helpers';

const SETTINGS = { aceHigh: true, rounds: 1 } as const;
const NORMAL = 'K11 B11 R11 Y11 Y7 Y8 Y9 Y10 R3 R4 R5 K3 B3 R3b';
const OTHER = 'B1b B2b B3b B5b B6b B7b K2b K3b K4b K5b K6b K7b B13b K13b';

describe('playerView', () => {
  it("shows a player their own rack and nobody else's", () => {
    const g = createGame(SETTINGS, ['a', 'b', 'c', 'd'], seededRng(7));
    for (let seat = 0; seat < 4; seat++) {
      const v = playerView(g, seat);
      expect(v.seat).toBe(seat);
      expect(v.players[seat]!.groups).toEqual(g.players[seat]!.groups);
      v.players.forEach((p, i) => {
        expect(p.tileCount).toBe(handOf(g.players[i]!).length);
        if (i !== seat) expect(p.groups).toBeNull();
      });
    }
  });

  it('never sends a hidden tile: not another hand, not the middle', () => {
    const g = createGame(SETTINGS, ['a', 'b', 'c'], seededRng(11));
    const v = playerView(g, 0);
    // every tile id anywhere in the view
    const sent = new Set<number>();
    JSON.stringify(v, (key, value: unknown) => {
      if (key === 'groups' && Array.isArray(value)) (value as number[][]).flat().forEach((x) => sent.add(x));
      if (key === 'tile' || key === 'indicator') sent.add(value as number);
      return value;
    });
    const mine = handOf(g.players[0]!);
    expect([...sent].sort()).toEqual([...mine, g.round.indicator].sort());
    expect(v.round).not.toHaveProperty('middle');
    expect(v.round.middleCount).toBe(g.round.middle.length);
  });

  it('carries everything public: indicator, joker, discards, whose turn', () => {
    let g = createGameWithDeal(SETTINGS, ['a', 'b'], 0, makeDeal('R12', [NORMAL, OTHER], ['R4b']));
    g = discard(g, 0, t('R4b'));
    const v = playerView(g, 1);
    expect(v.round).toMatchObject({
      indicator: t('R12'),
      joker: { color: 'red', number: 13 },
      discards: [{ tile: t('R4b'), by: 0 }],
      lastDiscard: { tile: t('R4b'), by: 0 },
      current: 1,
      phase: 'draw',
      turn: 1,
      indicatorTakenBy: null,
      restartOffered: false,
    });
  });

  it('tells only the player concerned that they may ask for a restart', () => {
    // seat 1 is dealt three identical pairs
    const pairs = 'R1 R1b Y6 Y6b K9 K9b B2 B4 B6 B8 B10 B12 Y1 Y3';
    const g = createGameWithDeal(SETTINGS, ['a', 'b'], 0, makeDeal('R12', [NORMAL, pairs], ['R4b']));
    expect(playerView(g, 1).round.restartOffered).toBe(true);
    expect(playerView(g, 0).round.restartOffered).toBe(false);
    expect(playerView(discard(g, 0, t('R4b')), 1).round.restartOffered).toBe(false);
  });

  it('shows every rack once the round is over', () => {
    let g = createGameWithDeal(SETTINGS, ['a', 'b'], 0, makeDeal('R12', [NORMAL, OTHER], ['R4b']));
    g = arrange(g, 0, [...['K11 B11 R11 Y11', 'Y7 Y8 Y9 Y10', 'R3 R4 R5', 'K3 B3 R3b'].map(ts), ts('R4b')]);
    g = close(g, 0, t('R4b'));
    const v = playerView(g, 1);
    expect(v.status).toBe('matchOver');
    expect(v.players[0]!.groups).not.toBeNull();
    expect(v.results[0]).toMatchObject({ winners: [0], scores: [-10, 26] });
    expect(v.matchWinners).toEqual([0]);
  });

  it('is a copy: changing it does not touch the game', () => {
    const g = createGame(SETTINGS, ['a', 'b'], seededRng(3));
    const v = playerView(g, 0);
    v.players[0]!.groups![0]!.length = 0;
    v.round.discards.push({ tile: 1, by: 0 });
    expect(handOf(g.players[0]!).length).toBeGreaterThanOrEqual(14);
    expect(g.round.discards).toHaveLength(0);
  });

  it('rejects a seat that is not at the table', () => {
    const g = createGame(SETTINGS, ['a', 'b'], seededRng(3));
    expect(() => playerView(g, 2)).toThrow();
    expect(() => playerView(g, -1)).toThrow();
  });
});
