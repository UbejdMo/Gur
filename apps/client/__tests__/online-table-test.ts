import { createGameWithDeal, discard, draw, nextRoundWithDeal, playerView, timeoutMove } from '@gur/engine';
import type { Deal, Game } from '@gur/engine';
import { FILLER, NEEDS_K13, NORMAL, t, ts } from '../test-utils/deal';
import { colsOf, layoutGroups } from '@/game/rackLayout';
import { seatsAround, tableFlags } from '@/game/tableModel';
import { describeChange, initialOnlineTable, onlineTableReducer } from '@/online/onlineTable';
import type { OnlineTableState } from '@/online/onlineTable';

const NAMES = ['Ana', 'Ben', 'Cem'];

/** A deal for three players: you (seat 0) get `you`; red 9 is on top of the middle. */
function deal(you = NORMAL, indicator = 'R12'): Deal {
  const hands = [you, FILLER[0]!, FILLER[1]!].map(ts);
  const top = t('R9b');
  const used = new Set([...hands.flat(), t(indicator), top]);
  const rest = Array.from({ length: 106 }, (_, id) => id).filter((id) => !used.has(id));
  return { indicator: t(indicator), hands, middle: [top, ...rest] };
}

/** Three players; `starter` draws the red 9 and plays first. The table is seen from seat 0. */
function game(starter = 1, you = NORMAL, indicator = 'R12'): Game {
  return createGameWithDeal({ aceHigh: true, rounds: 3 }, NAMES, starter, deal(you, indicator));
}

const follow = (state: OnlineTableState, g: Game) =>
  onlineTableReducer(state, { type: 'server', view: playerView(g, 0), names: NAMES });

describe('seats around the table', () => {
  it('puts the next player on your right, whatever your seat', () => {
    expect(seatsAround(0, 4)).toEqual({ right: 1, across: 2, left: 3 });
    expect(seatsAround(2, 4)).toEqual({ right: 3, across: 0, left: 1 });
    // three players: nobody across; two players: the other one sits across
    expect(seatsAround(1, 3)).toEqual({ right: 2, across: null, left: 0 });
    expect(seatsAround(1, 2)).toEqual({ right: null, across: 0, left: null });
  });
});

describe('the online table follows the server', () => {
  it('deals your tiles 7 on top and 7 below', () => {
    const s = initialOnlineTable(playerView(game(), 0), NAMES);
    expect(s.layout.slice(0, 7)).toEqual(ts(NORMAL).slice(0, 7));
    expect(s.layout.slice(12, 19)).toEqual(ts(NORMAL).slice(7));
    expect(s.names).toEqual(NAMES);
  });

  it('a tile you drag from the table lands on the slot you dropped it on', () => {
    let g = discard(game(), 1, t('R9b'));
    g = timeoutMove(g); // Cem
    let s = follow(initialOnlineTable(playerView(game(), 0), NAMES), g);
    expect(tableFlags(s.view, layoutGroups(s.layout), null).yourTurn).toBe(true);
    s = onlineTableReducer(s, { type: 'pending', at: { slot: 22, side: 'left' } });
    const top = g.round.middle[0]!;
    s = follow(s, draw(g, 0, 'middle'));
    expect(s.layout[22]).toBe(top);
    expect(s.pending).toBeNull();
    expect(s.log).toBe('You drew from the middle');
  });

  it('without a drop place the new tile goes to a free slot of its own', () => {
    let g = discard(game(), 1, t('R9b'));
    g = timeoutMove(g);
    let s = follow(initialOnlineTable(playerView(game(), 0), NAMES), g);
    const top = g.round.middle[0]!;
    s = follow(s, draw(g, 0, 'middle'));
    expect(layoutGroups(s.layout)).toContainEqual([top]);
  });

  it('your own tiles stay where you put them while others play', () => {
    let s = initialOnlineTable(playerView(game(), 0), NAMES);
    s = onlineTableReducer(s, { type: 'drop', tile: t('K11'), slot: 22 });
    s = onlineTableReducer(s, { type: 'select', tile: t('B11') });
    const before = s.layout;
    s = follow(s, discard(game(), 1, t('R9b')));
    expect(s.layout).toEqual(before);
    expect(s.selected).toBe(t('B11'));
    expect(s.log).toBe('Ben discarded red 9');
  });

  it('a tile that left your hand leaves the rack, and is no longer picked', () => {
    const start = game(0);
    let s = initialOnlineTable(playerView(start, 0), NAMES);
    s = onlineTableReducer(s, { type: 'select', tile: t('R9b') });
    s = follow(s, discard(start, 0, t('R9b')));
    expect(s.layout).not.toContain(t('R9b'));
    expect(s.selected).toBeNull();
    expect(s.log).toBe('You discarded red 9');
  });

  it('a new round deals a fresh rack and keeps its width', () => {
    let s = initialOnlineTable(playerView(game(), 0), NAMES);
    s = onlineTableReducer(s, { type: 'resize', cols: 14 });
    // play the round out by timeouts, then deal round two
    let g = game();
    while (g.status === 'playing') g = timeoutMove(g);
    s = follow(s, g);
    expect(s.log).toMatch(/closed|The middle ran out/);
    s = follow(s, nextRoundWithDeal(g, deal(NEEDS_K13)));
    expect(colsOf(s.layout)).toBe(14);
    expect(s.layout.slice(0, 7)).toEqual(ts(NEEDS_K13).slice(0, 7));
    expect(s.layout.slice(14, 21)).toEqual(ts(NEEDS_K13).slice(7));
    expect(s.log).toBe('Round 2');
  });

  it('tap moves, messages and resizing work as on the practice table', () => {
    let s = initialOnlineTable(playerView(game(), 0), NAMES);
    expect(onlineTableReducer(s, { type: 'moveSelected', slot: 10 })).toBe(s);
    expect(onlineTableReducer(s, { type: 'drop', tile: 999, slot: 10 })).toBe(s);
    s = onlineTableReducer(s, { type: 'select', tile: t('K11') });
    s = onlineTableReducer(s, { type: 'moveSelected', slot: 10 });
    expect(s.layout[10]).toBe(t('K11'));
    expect(s.selected).toBeNull();
    s = onlineTableReducer(s, { type: 'select', tile: t('B11') });
    expect(onlineTableReducer(s, { type: 'select', tile: t('B11') }).selected).toBeNull();
    s = onlineTableReducer(s, { type: 'message', text: 'It is not your turn' });
    expect(s.message).toBe('It is not your turn');
    expect(onlineTableReducer(s, { type: 'message', text: 'It is not your turn' })).toBe(s);
  });
});

describe('what happened, in words', () => {
  const names = NAMES;
  it('tells draws apart: the middle, the last discard, the indicator', () => {
    let g = discard(game(), 1, t('R9b'));
    const cemDraws = draw(g, 2, 'middle');
    expect(describeChange(playerView(g, 0), playerView(cemDraws, 0), names)).toBe('Cem drew from the middle');
    const cemTakes = draw(g, 2, 'discard');
    expect(describeChange(playerView(g, 0), playerView(cemTakes, 0), names)).toBe(
      'Cem picked up the last discarded tile',
    );
    // black 13 is the indicator and completes Ana's hand
    g = discard(game(1, NEEDS_K13, 'K13'), 1, t('R9b'));
    g = timeoutMove(g);
    const taken = draw(g, 0, 'indicator');
    expect(describeChange(playerView(g, 0), playerView(taken, 0), names)).toBe('You took the indicator');
    const closed = timeoutMove(taken);
    expect(describeChange(playerView(taken, 0), playerView(closed, 0), names)).toBe(
      'You took the indicator and closed',
    );
    expect(describeChange(playerView(taken, 1), playerView(closed, 1), names)).toBe(
      'Ana took the indicator and closed',
    );
  });

  it('says nothing when somebody only moves tiles on their own rack', () => {
    const g = game();
    expect(describeChange(playerView(g, 0), playerView(g, 0), names)).toBeNull();
  });
});
