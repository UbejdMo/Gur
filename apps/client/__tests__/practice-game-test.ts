import { act, renderHook } from '@testing-library/react-native';
import { handOf } from '@gur/engine';
import { usePracticeGame } from '@/game/usePracticeGame';
import { chooseClosingTile, closingTiles, initialState, practiceReducer } from '@/game/practiceReducer';
import { colsOf, layoutGroups, sameGroups } from '@/game/rackLayout';
import { ALMOST, READY, practiceGame, t } from '../test-utils/deal';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const setup = (game = practiceGame(), timer = false) =>
  renderHook(() => usePracticeGame({ aceHigh: true, botDelayMs: 100, timer, newGame: () => game }));

async function runBots(result: { current: ReturnType<typeof usePracticeGame> }) {
  for (let i = 0; i < 10 && result.current.game.status === 'playing' && result.current.game.round.current !== 0; i++) {
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
  }
}

describe('practiceReducer', () => {
  it('starts with 7 tiles on top, 7 below, and the drawn tile on its own', () => {
    const s = initialState(practiceGame());
    expect(s.layout.filter((x) => x !== null)).toHaveLength(15);
    expect(layoutGroups(s.layout).map((g) => g.length)).toEqual([7, 1, 7]);
  });

  it('keeps the engine arrangement in step with the rack after every move', () => {
    let s = initialState(practiceGame());
    s = practiceReducer(s, { type: 'drop', tile: t('Y7'), slot: 20 });
    s = practiceReducer(s, { type: 'drop', tile: t('Y8'), slot: 21 });
    s = practiceReducer(s, { type: 'drop', tile: t('Y9'), slot: 22 });
    expect(sameGroups(layoutGroups(s.layout), s.game.players[0]!.groups)).toBe(true);
    expect(s.game.players[0]!.groups).toContainEqual([t('Y7'), t('Y8'), t('Y9')]);
  });

  it('dragging up discards only during your discard', () => {
    let s = initialState(practiceGame({ you: ALMOST }));
    s = practiceReducer(s, { type: 'dropUp', tile: t('R9b') });
    expect(s.game.round.lastDiscard).toEqual({ tile: t('R9b'), by: 0 });
    expect(s.layout).not.toContain(t('R9b'));
    const again = practiceReducer(s, { type: 'dropUp', tile: t('Y7') });
    expect(again).toBe(s);
  });

  // Regression: a player with a complete hand couldn't close (Close needed a picked tile)
  // and dragging the extra tile up discarded it instead of closing.
  it('closing never needs a picked tile', () => {
    const s = initialState(practiceGame({ you: READY, middleTop: ['Y4b'] }));
    expect(closingTiles(s.game)).toEqual([t('Y4b')]);
    expect(chooseClosingTile(s)).toBe(t('Y4b'));
    const closed = practiceReducer(s, { type: 'close' });
    expect(closed.game.results[0]).toMatchObject({
      reason: 'close',
      winners: [0],
      scores: [-10, expect.any(Number), expect.any(Number), expect.any(Number)],
    });
    expect(closed.log).toBe('You closed');
  });

  // For closing the rack must show the melds; for points it doesn't matter (see the engine tests).
  it('tiles that could close but are not connected on the rack cannot close', () => {
    // NORMAL is a closing hand, but as dealt it lies in two rows of seven that are not melds.
    let s = initialState(practiceGame({ middleTop: ['Y4b'] }));
    expect(closingTiles(s.game)).toEqual([]);
    expect(practiceReducer(s, { type: 'close' }).message).toMatch(/Connect all your tiles/);

    // Lay the melds out: 11s . Y7-Y10 on top, R3 R4 R5 . three 3s below, the spare tile far away.
    const moves: [string, number][] = [
      ['Y4b', 23],
      ['Y10', 8],
      ['Y9', 7],
      ['Y8', 6],
      ['Y7', 5],
      ['R3b', 19],
      ['B3', 18],
      ['K3', 17],
    ];
    for (const [tile, slot] of moves) s = practiceReducer(s, { type: 'drop', tile: t(tile), slot });
    expect(closingTiles(s.game)).toEqual([t('Y4b')]);
    expect(practiceReducer(s, { type: 'close' }).game.results[0]).toMatchObject({ reason: 'close', winners: [0] });

    // Pulling a tile out of the middle of a meld leaves a gap, so that is not a close.
    expect(closingTiles(s.game)).not.toContain(t('Y8'));
  });

  it('dragging the spare tile up from an unconnected rack only discards it', () => {
    const s = initialState(practiceGame({ middleTop: ['Y4b'] }));
    const next = practiceReducer(s, { type: 'dropUp', tile: t('Y4b') });
    expect(next.game.status).toBe('playing');
    expect(next.game.round.lastDiscard).toEqual({ tile: t('Y4b'), by: 0 });
  });

  it('dragging the closing tile up closes instead of discarding', () => {
    const s = initialState(practiceGame({ you: READY, middleTop: ['Y4b'] }));
    const next = practiceReducer(s, { type: 'dropUp', tile: t('Y4b') });
    expect(next.game.status).toBe('matchOver');
    expect(next.game.results[0]!.winners).toEqual([0]);
  });

  it('dragging up the joker that completes the hand closes with a double', () => {
    // indicator yellow 1 makes yellow 2 the joker; draw it as the 15th tile
    const s = initialState(practiceGame({ you: READY, indicator: 'Y1', middleTop: ['Y2'] }));
    expect(closingTiles(s.game)[0]).toBe(t('Y2'));
    const next = practiceReducer(s, { type: 'dropUp', tile: t('Y2') });
    expect(next.game.results[0]).toMatchObject({ double: true });
    expect(next.game.results[0]!.scores[0]).toBe(-20);
  });

  it('Close explains itself when the hand is not complete', () => {
    const s = initialState(practiceGame({ you: ALMOST }));
    expect(closingTiles(s.game)).toEqual([]);
    expect(practiceReducer(s, { type: 'close' }).message).toMatch(/Connect all your tiles/);
  });

  it('nothing can close when it is not your turn', () => {
    const s = initialState(practiceGame({ starter: 1, middleTop: ['Y4b'] }));
    expect(closingTiles(s.game)).toEqual([]);
  });

  it('describes what happens at the table', () => {
    let s = initialState(practiceGame());
    s = practiceReducer(s, { type: 'discard', tile: t('R9b') });
    expect(s.log).toBe('You discarded red 9');
    s = practiceReducer(s, { type: 'bot' });
    expect(s.log).toMatch(/^Bot 1 (drew from the middle|picked up the last discarded tile) and discarded /);
  });

  it('a tile dropped on another slides in beside it instead of swapping', () => {
    let s = initialState(practiceGame());
    // top row as dealt: K11 B11 R11 Y11 Y7 Y8 Y9; drop the spare R9b on the right half of Y8
    s = practiceReducer(s, { type: 'drop', tile: t('R9b'), slot: 5, side: 'right' });
    expect(s.layout.slice(4, 8)).toEqual([t('Y7'), t('Y8'), t('R9b'), t('Y9')]);
    // and on the left half of the first tile: it goes in front, everything else moves along
    s = practiceReducer(s, { type: 'drop', tile: t('R9b'), slot: 0, side: 'left' });
    expect(s.layout.slice(0, 3)).toEqual([t('R9b'), t('K11'), t('B11')]);
    expect(sameGroups(layoutGroups(s.layout), s.game.players[0]!.groups)).toBe(true);
  });

  it('a discard or a middle tile dragged onto the rack lands where it is dropped', () => {
    // Bot 3 starts and discards; then it is your turn to draw
    let s = initialState(practiceGame({ starter: 3 }));
    s = practiceReducer(s, { type: 'bot' });
    const offered = s.game.round.lastDiscard!.tile;
    const taken = practiceReducer(s, { type: 'takeDiscard', at: { slot: 1, side: 'left' } });
    expect(taken.layout[1]).toBe(offered);
    expect(taken.layout.slice(0, 3)).toEqual([t('K11'), offered, t('B11')]);
    expect(taken.game.round.discards).not.toContain(offered);

    const top = s.game.round.middle[0]!;
    const drawn = practiceReducer(s, { type: 'drawMiddle', at: { slot: 22, side: 'right' } });
    expect(drawn.layout[22]).toBe(top);
    // tapping instead puts the tile in a free slot of its own
    const tapped = practiceReducer(s, { type: 'drawMiddle' });
    expect(layoutGroups(tapped.layout)).toContainEqual([top]);
  });

  it('a discard nobody took stays on the table but can never be taken again', () => {
    let s = initialState(practiceGame());
    s = practiceReducer(s, { type: 'discard', tile: t('R9b') });
    s = practiceReducer(s, { type: 'bot' });
    s = practiceReducer(s, { type: 'bot' });
    s = practiceReducer(s, { type: 'bot' });
    // your turn: only Bot 3's tile is on offer, and the older ones still lie there
    const { round } = s.game;
    expect(round.current).toBe(0);
    expect(round.discards.at(-1)).toBe(round.lastDiscard!.tile);
    expect(round.discards.length).toBeGreaterThanOrEqual(2);
    s = practiceReducer(s, { type: 'drawMiddle' });
    expect(s.game.round.lastDiscard).toBeNull();
    expect(s.game.round.discards).toEqual(round.discards);
    expect(practiceReducer(s, { type: 'takeDiscard' }).message).toMatch(/already drawn/);
  });

  it('the rack grows with the screen and keeps its tiles', () => {
    let s = initialState(practiceGame());
    const before = layoutGroups(s.layout);
    s = practiceReducer(s, { type: 'resize', cols: 20 });
    expect(colsOf(s.layout)).toBe(20);
    expect(layoutGroups(s.layout)).toEqual(before);
    // a new round keeps the wide rack
    s = practiceReducer(s, { type: 'newGame', game: practiceGame() });
    expect(colsOf(s.layout)).toBe(20);
  });

  it('a rule error becomes a message and changes nothing else', () => {
    const s = initialState(practiceGame());
    const next = practiceReducer(s, { type: 'drawMiddle' });
    expect(next.message).toMatch(/already drawn/);
    expect(next.game).toBe(s.game);
  });
});

describe('usePracticeGame', () => {
  it('lets you discard, then the bots play and it comes back to you', async () => {
    const { result } = await setup();
    expect(result.current.yourTurn).toBe(true);
    await act(async () => result.current.select(t('R9b')));
    expect(result.current.canDiscard).toBe(true);
    await act(async () => result.current.discard());
    expect(result.current.yourTurn).toBe(false);
    await runBots(result);
    expect(result.current.yourTurn).toBe(true);
    expect(result.current.game.round.phase).toBe('draw');

    // drawing places the new tile on the rack
    await act(async () => result.current.drawMiddle());
    expect(result.current.layout.filter((x) => x !== null)).toHaveLength(15);
  });

  it('only allows closing with a tile when the other 14 are a closing hand', async () => {
    const { result } = await setup(practiceGame({ you: READY, middleTop: ['Y4b'] }));
    expect([...result.current.canCloseWith]).toEqual([t('Y4b')]);
    // Close is on without picking a tile first
    expect(result.current.canClose).toBe(true);
    await act(async () => result.current.close());
    expect(result.current.game.results[0]!.scores[0]).toBe(-10);
  });

  it('tap a tile, then tap a slot, to move it', async () => {
    const { result } = await setup();
    await act(async () => result.current.select(t('Y7')));
    await act(async () => result.current.moveSelected(10));
    expect(result.current.layout[10]).toBe(t('Y7'));
    expect(result.current.selected).toBeNull();
  });

  it('the timer gives 15 seconds, then plays for you', async () => {
    const { result } = await setup(practiceGame(), true);
    expect(result.current.secondsLeft).toBe(15);
    await act(async () => {
      jest.advanceTimersByTime(10_500);
    });
    expect(result.current.yourTurn).toBe(true);
    await act(async () => {
      jest.advanceTimersByTime(5_000);
    });
    expect(result.current.yourTurn).toBe(false);
    expect(handOf(result.current.game.players[0]!)).toHaveLength(14);
    expect(result.current.layout.filter((x) => x !== null)).toHaveLength(14);
  });

  it('bots take their time, and moving your tiles meanwhile does not hold them up', async () => {
    const game = practiceGame({ starter: 1 });
    const { result } = await renderHook(() =>
      usePracticeGame({ aceHigh: true, botDelayMs: [4000, 10000], timer: false, newGame: () => game }),
    );
    // not before 4 seconds
    await act(async () => {
      jest.advanceTimersByTime(3_900);
    });
    expect(result.current.game.round.current).toBe(1);
    // arranging your rack while the bot thinks must not restart its clock
    for (let i = 0; i < 7; i++) {
      await act(async () => result.current.drop(t('Y7'), 16 + (i % 2)));
      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });
    }
    // 10.9 seconds have passed: Bot 1 has played by now
    expect(result.current.game.round.turn).toBeGreaterThanOrEqual(1);
  });

  it('bots play first when one of them starts', async () => {
    const { result } = await setup(practiceGame({ starter: 2 }));
    expect(result.current.yourTurn).toBe(false);
    await runBots(result);
    const g = result.current.game;
    expect(g.status === 'playing' ? g.round.current : 0).toBe(0);
  });

  it('play again deals a new round', async () => {
    const { result } = await setup(practiceGame({ you: READY, middleTop: ['Y4b'] }));
    await act(async () => result.current.close(t('Y4b')));
    await act(async () => result.current.playAgain());
    expect(result.current.game.status).toBe('playing');
    expect(result.current.hand.sort()).toEqual([...READY.split(' ').map(t), t('Y4b')].sort());
  });
});
