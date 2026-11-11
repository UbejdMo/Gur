import { act, renderHook } from '@testing-library/react-native';
import { handOf } from '@gur/engine';
import { usePracticeGame } from '@/game/usePracticeGame';
import { initialState, practiceReducer } from '@/game/practiceReducer';
import { layoutGroups, sameGroups } from '@/game/rackLayout';
import { NORMAL, practiceGame, t } from '../test-utils/deal';

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
    let s = initialState(practiceGame());
    s = practiceReducer(s, { type: 'dropUp', tile: t('R9b') });
    expect(s.game.round.lastDiscard).toEqual({ tile: t('R9b'), by: 0 });
    expect(s.layout).not.toContain(t('R9b'));
    const again = practiceReducer(s, { type: 'dropUp', tile: t('Y7') });
    expect(again).toBe(s);
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
    const { result } = await setup(practiceGame({ middleTop: ['Y4b'] }));
    expect([...result.current.canCloseWith]).toEqual([t('Y4b')]);
    await act(async () => result.current.select(t('Y4b')));
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

  it('bots play first when one of them starts', async () => {
    const { result } = await setup(practiceGame({ starter: 2 }));
    expect(result.current.yourTurn).toBe(false);
    await runBots(result);
    const g = result.current.game;
    expect(g.status === 'playing' ? g.round.current : 0).toBe(0);
  });

  it('play again deals a new round', async () => {
    const { result } = await setup(practiceGame({ middleTop: ['Y4b'] }));
    await act(async () => result.current.close(t('Y4b')));
    await act(async () => result.current.playAgain());
    expect(result.current.game.status).toBe('playing');
    expect(result.current.hand.sort()).toEqual([...NORMAL.split(' ').map(t), t('Y4b')].sort());
  });
});
