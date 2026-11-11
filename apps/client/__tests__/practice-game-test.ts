import { act, renderHook } from '@testing-library/react-native';
import { handOf } from '@gur/engine';
import { usePracticeGame } from '@/game/usePracticeGame';
import { NORMAL, practiceGame, t } from '../test-utils/deal';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const setup = (game = practiceGame(), timer = false) =>
  renderHook(() => usePracticeGame({ aceHigh: true, botDelayMs: 100, timer, newGame: () => game }));

describe('usePracticeGame', () => {
  it('lets you discard, then the bots play and it comes back to you', async () => {
    const { result } = await setup();
    expect(result.current.yourTurn).toBe(true);
    expect(result.current.hand).toHaveLength(15);

    await act(async () => result.current.select(t('R9b')));
    expect(result.current.canDiscard).toBe(true);
    await act(async () => result.current.discardSelected());
    expect(result.current.yourTurn).toBe(false);

    // three bots, one move every 100 ms
    for (let i = 0; i < 10 && result.current.game.round.current !== 0; i++) {
      await act(async () => {
        jest.advanceTimersByTime(100);
      });
    }
    expect(result.current.game.round.current).toBe(0);
    expect(result.current.yourTurn).toBe(true);
    expect(result.current.game.round.phase).toBe('draw');
  });

  it('shows a rule error instead of crashing', async () => {
    const { result } = await setup();
    await act(async () => result.current.drawMiddle());
    expect(result.current.message).toMatch(/already drawn/);
    expect(result.current.hand).toHaveLength(15);
  });

  it('only enables Close when the other 14 tiles are a closing hand', async () => {
    const { result } = await setup(practiceGame({ middleTop: ['Y4b'] }));
    await act(async () => result.current.select(t('Y4b')));
    expect(result.current.canClose).toBe(true);
    await act(async () => result.current.select(t('Y4b')));
    await act(async () => result.current.select(t('R3')));
    expect(result.current.canClose).toBe(false);
  });

  it('closing ends the round with -10 for you', async () => {
    const { result } = await setup(practiceGame({ middleTop: ['Y4b'] }));
    await act(async () => result.current.select(t('Y4b')));
    await act(async () => result.current.closeWithSelected());
    expect(result.current.game.status).toBe('matchOver');
    expect(result.current.game.results[0]!.scores[0]).toBe(-10);
  });

  it('moves tiles only where you put them', async () => {
    const { result } = await setup();
    // dealt tiles start as one row, plus the tile you drew
    expect(result.current.groups).toHaveLength(2);
    await act(async () => result.current.select(t('Y7')));
    await act(async () => result.current.moveSelected({ newGroup: true }));
    await act(async () => result.current.select(t('Y8')));
    await act(async () => result.current.moveSelected({ after: t('Y7') }));
    expect(result.current.groups.at(-1)).toEqual([t('Y7'), t('Y8')]);
    expect(result.current.groups).toHaveLength(3);
    expect(result.current.selected).toBeNull();
  });

  it('the timer plays for you when it runs out', async () => {
    const { result } = await setup(practiceGame(), true);
    expect(result.current.secondsLeft).toBe(15);
    await act(async () => {
      jest.advanceTimersByTime(15_500);
    });
    expect(result.current.yourTurn).toBe(false);
    expect(handOf(result.current.game.players[0]!)).toHaveLength(14);
  });

  it('bots play first when one of them starts', async () => {
    const { result } = await setup(practiceGame({ starter: 2 }));
    expect(result.current.yourTurn).toBe(false);
    for (let i = 0; i < 10 && result.current.game.round.current !== 0; i++) {
      await act(async () => {
        jest.advanceTimersByTime(100);
      });
    }
    // bot 2 and bot 3 played; now it is your turn unless a bot closed
    const g = result.current.game;
    expect(g.status === 'playing' ? g.round.current : 0).toBe(0);
  });

  it('play again deals a new round', async () => {
    const { result } = await setup(practiceGame({ middleTop: ['Y4b'] }));
    await act(async () => result.current.select(t('Y4b')));
    await act(async () => result.current.closeWithSelected());
    await act(async () => result.current.playAgain());
    expect(result.current.game.status).toBe('playing');
    expect(result.current.hand.sort()).toEqual([...NORMAL.split(' ').map(t), t('Y4b')].sort());
  });
});
