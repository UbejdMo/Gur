import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { createGameWithDeal, discard, nextRound, playerView, timeoutMove } from '@gur/engine';
import type { Game, PlayerView } from '@gur/engine';
import type { Ack, LobbyState } from '@gur/server/protocol';
import Friends from '@/app/friends';
import Home from '@/app/index';
import { LobbyRoom } from '@/components/LobbyRoom';
import { OnlineTable } from '@/components/OnlineTable';
import { ResultsOverlay } from '@/components/ResultsOverlay';
import type { Connection } from '@/online/connection';
import { FILLER, NORMAL, t, ts } from '../test-utils/deal';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock('@/online/connection', () => ({
  online: {
    savedName: jest.fn(() => 'Ana'),
    hasSavedSession: jest.fn(() => false),
    create: jest.fn(),
    join: jest.fn(),
  },
}));

const mocks = () => ({
  router: (jest.requireMock('expo-router') as { router: { push: jest.Mock; replace: jest.Mock } }).router,
  params: (jest.requireMock('expo-router') as { useLocalSearchParams: jest.Mock }).useLocalSearchParams,
  online: (
    jest.requireMock('@/online/connection') as {
      online: { savedName: jest.Mock; hasSavedSession: jest.Mock; create: jest.Mock; join: jest.Mock };
    }
  ).online,
});

beforeEach(() => jest.clearAllMocks());

const NAMES = ['Ana', 'Ben', 'Cem'];

/** Three players at a table; `starter` holds the 15th tile, red 9. */
function game(starter = 0, rounds: 1 | 3 = 1): Game {
  const hands = [NORMAL, FILLER[0]!, FILLER[1]!].map(ts);
  const top = t('R9b');
  const used = new Set([...hands.flat(), t('R12'), top]);
  const rest = Array.from({ length: 106 }, (_, id) => id).filter((id) => !used.has(id));
  return createGameWithDeal({ aceHigh: true, rounds }, NAMES, starter, {
    indicator: t('R12'),
    hands,
    middle: [top, ...rest],
  });
}

function lobby(over: Partial<LobbyState> = {}): LobbyState {
  return {
    code: 'WRCCS',
    you: 0,
    members: NAMES.map((name, i) => ({ name, bot: false, connected: true, host: i === 0 })),
    settings: { aceHigh: true, rounds: 1, fillWithBots: false },
    game: null,
    turnEndsAt: null,
    nextRoundAt: null,
    now: Date.now(),
    ...over,
  };
}

describe('Home', () => {
  it('leads to playing with friends', async () => {
    await render(<Home />);
    await fireEvent.press(screen.getByRole('button', { name: 'Play with friends' }));
    expect(mocks().router.push).toHaveBeenCalledWith('/friends');
  });
});

describe('Play with friends', () => {
  it('remembers your name, opens a lobby and goes to it', async () => {
    const { online, router } = mocks();
    online.create.mockResolvedValue({ ok: true, code: 'WRCCS' });
    await render(<Friends />);
    expect(screen.getByLabelText('Your name')).toHaveProp('value', 'Ana');
    await fireEvent.press(screen.getByRole('button', { name: 'Create a lobby' }));
    expect(online.create).toHaveBeenCalledWith('Ana');
    expect(router.replace).toHaveBeenCalledWith('/lobby');
  });

  it("joins with a code, typed in any case, and shows the server's reason when it is refused", async () => {
    const { online, router } = mocks();
    online.join.mockResolvedValue({ ok: false, error: 'No lobby has that code. Check it and try again' });
    await render(<Friends />);
    await fireEvent.changeText(screen.getByLabelText('Lobby code'), 'wrccs');
    expect(screen.getByLabelText('Lobby code')).toHaveProp('value', 'WRCCS');
    await fireEvent.press(screen.getByRole('button', { name: 'Join' }));
    expect(online.join).toHaveBeenCalledWith('WRCCS', 'Ana');
    expect(screen.getByTestId('friends-error')).toHaveTextContent(/No lobby has that code/);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('asks for a name and a code before bothering the server', async () => {
    const { online } = mocks();
    online.savedName.mockReturnValueOnce('');
    await render(<Friends />);
    await fireEvent.press(screen.getByRole('button', { name: 'Create a lobby' }));
    expect(screen.getByTestId('friends-error')).toHaveTextContent('Please choose a name');
    await fireEvent.changeText(screen.getByLabelText('Your name'), 'Ben');
    await fireEvent.press(screen.getByRole('button', { name: 'Join' }));
    expect(screen.getByTestId('friends-error')).toHaveTextContent(/Type the code/);
    expect(online.create).not.toHaveBeenCalled();
    expect(online.join).not.toHaveBeenCalled();
  });

  it('fills the code in from an invitation link, and offers the way back into an earlier game', async () => {
    const { online, params, router } = mocks();
    params.mockReturnValueOnce({ code: 'abcde' });
    online.hasSavedSession.mockReturnValueOnce(true);
    await render(<Friends />);
    expect(screen.getByLabelText('Lobby code')).toHaveProp('value', 'ABCDE');
    await fireEvent.press(screen.getByRole('button', { name: 'Go back to your game' }));
    expect(router.replace).toHaveBeenCalledWith('/lobby');
  });
});

describe('the waiting room', () => {
  const ok = jest.fn(async (): Promise<Ack> => ({ ok: true }));

  it('shows the code, who is here and the free seats; the host sets the options and starts', async () => {
    const onSettings = jest.fn(async (): Promise<Ack> => ({ ok: true }));
    const onStart = jest.fn(async (): Promise<Ack> => ({ ok: true }));
    await render(<LobbyRoom lobby={lobby()} onSettings={onSettings} onStart={onStart} onLeave={jest.fn()} />);
    expect(screen.getByTestId('lobby-code')).toHaveTextContent('WRCCS');
    expect(screen.getAllByTestId('member')).toHaveLength(3);
    expect(screen.getByText('Ana (you)')).toBeOnTheScreen();
    expect(screen.getByText('Waiting for a player…')).toBeOnTheScreen();

    await fireEvent(screen.getByLabelText('Allow 12-13-1'), 'valueChange', false);
    expect(onSettings).toHaveBeenLastCalledWith({ aceHigh: false });
    await fireEvent(screen.getByLabelText('Fill empty seats with bots'), 'valueChange', true);
    expect(onSettings).toHaveBeenLastCalledWith({ fillWithBots: true });
    await fireEvent.press(screen.getByRole('radio', { name: '5 rounds' }));
    expect(onSettings).toHaveBeenLastCalledWith({ rounds: 5 });
    expect(screen.getByRole('radio', { name: '1 round' })).toBeChecked();

    await fireEvent.press(screen.getByRole('button', { name: 'Start the game' }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('a guest waits for the host and cannot change anything', async () => {
    const onSettings = jest.fn(async (): Promise<Ack> => ({ ok: true }));
    await render(<LobbyRoom lobby={lobby({ you: 1 })} onSettings={onSettings} onStart={ok} onLeave={jest.fn()} />);
    expect(screen.getByTestId('waiting-for-host')).toHaveTextContent('Waiting for Ana to start the game…');
    expect(screen.queryByRole('button', { name: 'Start the game' })).toBeNull();
    expect(screen.getByLabelText('Allow 12-13-1')).toHaveProp('disabled', true);
    await fireEvent.press(screen.getByRole('radio', { name: '3 rounds' }));
    expect(onSettings).not.toHaveBeenCalled();
  });

  it('alone, the host is told what is missing; with bots the empty seats say so', async () => {
    const alone = lobby({ members: [{ name: 'Ana', bot: false, connected: true, host: true }] });
    const onStart = jest.fn(async (): Promise<Ack> => ({ ok: true }));
    const view = await render(<LobbyRoom lobby={alone} onSettings={ok} onStart={onStart} onLeave={jest.fn()} />);
    expect(screen.getByText(/You need at least 2 players/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Start the game' }));
    expect(onStart).not.toHaveBeenCalled();

    const withBots = { ...alone, settings: { ...alone.settings, fillWithBots: true } };
    await view.rerender(<LobbyRoom lobby={withBots} onSettings={ok} onStart={onStart} onLeave={jest.fn()} />);
    expect(screen.getAllByText('A bot will sit here')).toHaveLength(3);
    await fireEvent.press(screen.getByRole('button', { name: 'Start the game' }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("shows who is away, the server's reason for a refusal, and lets you leave", async () => {
    const away = lobby();
    away.members[2] = { ...away.members[2]!, connected: false };
    const onLeave = jest.fn();
    const refuse = jest.fn(async (): Promise<Ack> => ({ ok: false, error: 'This game has already started' }));
    await render(<LobbyRoom lobby={away} onSettings={ok} onStart={refuse} onLeave={onLeave} />);
    expect(within(screen.getAllByTestId('member')[2]!).getByText('Away')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Start the game' }));
    expect(screen.getByTestId('lobby-error')).toHaveTextContent('This game has already started');
    await fireEvent.press(screen.getByRole('button', { name: 'Leave the lobby' }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});

describe('the online table', () => {
  function connection(answer: Ack = { ok: true }) {
    const act = jest.fn(async () => answer);
    const next = jest.fn(async (): Promise<Ack> => ({ ok: true }));
    return { act, next, fake: { act, next } as unknown as Connection };
  }
  const table = (g: Game, seat = 0, over: Partial<LobbyState> = {}) =>
    lobby({ you: seat, game: playerView(g, seat), ...over }) as LobbyState & { game: PlayerView };

  it('seats the others by name and tells the server how your rack lies', async () => {
    const c = connection();
    await render(
      <OnlineTable lobby={table(game(1))} connection={c.fake} clockOffset={0} status="online" onLeave={jest.fn()} />,
    );
    const seats = screen.getAllByTestId('seat');
    expect(seats).toHaveLength(2);
    expect(seats.map((s) => s.props.accessibilityLabel as string).join(' ')).toMatch(/Cem.*Ben|Ben.*Cem/);
    expect(screen.getByTestId('status')).toHaveTextContent('Ben is playing…');
    // the rack is dealt in two rows; the server still has one long group, so it is told
    expect(c.act).toHaveBeenCalledWith({ type: 'arrange', groups: [ts(NORMAL).slice(0, 7), ts(NORMAL).slice(7)] });
    expect(c.act).toHaveBeenCalledTimes(1);
  });

  it("sends your moves as intentions and shows the server's reason when one is refused", async () => {
    let g = discard(game(1), 1, t('R9b'));
    g = timeoutMove(g);
    const c = connection({ ok: false, error: 'It is not your turn' });
    await render(
      <OnlineTable lobby={table(g)} connection={c.fake} clockOffset={0} status="online" onLeave={jest.fn()} />,
    );
    expect(screen.getByTestId('status')).toHaveTextContent(/^Your turn/);
    await fireEvent.press(screen.getByTestId('draw-middle'));
    expect(c.act).toHaveBeenCalledWith({ type: 'draw', source: 'middle' });
    expect(await screen.findByTestId('message')).toHaveTextContent('It is not your turn');
    await fireEvent.press(screen.getByTestId('indicator'));
    expect(c.act).toHaveBeenLastCalledWith({ type: 'draw', source: 'indicator' });
  });

  it('discards the picked tile, and follows the game as the server sends it', async () => {
    const start = game(0);
    const c = connection();
    const view = await render(
      <OnlineTable lobby={table(start)} connection={c.fake} clockOffset={0} status="online" onLeave={jest.fn()} />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'red 9' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Discard' }));
    expect(c.act).toHaveBeenLastCalledWith({ type: 'discard', tile: t('R9b') });
    // the server agrees and sends the new state
    await view.rerender(
      <OnlineTable
        lobby={table(discard(start, 0, t('R9b')))}
        connection={c.fake}
        clockOffset={0}
        status="online"
        onLeave={jest.fn()}
      />,
    );
    expect(screen.getAllByTestId('rack-tile')).toHaveLength(14);
    expect(screen.getByTestId('log')).toHaveTextContent('You discarded red 9');
    expect(within(screen.getByLabelText('Tiles left for Ben')).getByTestId('last-discard')).toBeOnTheScreen();
  });

  it('says when the connection is lost', async () => {
    const c = connection();
    await render(
      <OnlineTable lobby={table(game(1))} connection={c.fake} clockOffset={0} status="offline" onLeave={jest.fn()} />,
    );
    expect(screen.getByTestId('connection-lost')).toHaveTextContent(/Connection lost/);
  });

  it('after a round the host can start the next one at once; the others see the countdown', async () => {
    jest.useFakeTimers();
    try {
      let g = game(1, 3);
      while (g.status === 'playing') g = timeoutMove(g);
      expect(g.status).toBe('roundOver');
      const c = connection();
      const onLeave = jest.fn();
      const soon = { nextRoundAt: Date.now() + 9_000 };
      const view = await render(
        <OnlineTable lobby={table(g, 0, soon)} connection={c.fake} clockOffset={0} status="online" onLeave={onLeave} />,
      );
      await act(async () => {
        jest.advanceTimersByTime(300);
      });
      expect(screen.getByTestId('round-count')).toHaveTextContent('Round 1 of 3');
      expect(screen.getByTestId('results-note')).toHaveTextContent('The next round starts in 9 seconds');
      expect(screen.getByTestId('total-0')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Next round now' }));
      expect(c.next).toHaveBeenCalledTimes(1);
      await fireEvent.press(screen.getByRole('button', { name: 'Leave' }));
      expect(onLeave).toHaveBeenCalledTimes(1);

      await view.rerender(
        <OnlineTable lobby={table(g, 1, soon)} connection={c.fake} clockOffset={0} status="online" onLeave={onLeave} />,
      );
      expect(screen.queryByRole('button', { name: 'Next round now' })).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('results of a match of several rounds', () => {
  it('shows round points and totals, and says who won the match', async () => {
    let g = game(1, 3);
    for (let round = 0; round < 3; round++) {
      while (g.status === 'playing') g = timeoutMove(g);
      if (g.status === 'roundOver') g = nextRound(g, () => 0.5);
    }
    expect(g.status).toBe('matchOver');
    const view = playerView(g, 0);
    await render(<ResultsOverlay view={view} names={NAMES} primary={null} note="Waiting for Ana" onMenu={jest.fn()} />);
    expect(screen.getByTestId('round-count')).toHaveTextContent(/wins the match|You win the match|shared/);
    for (const seat of [0, 1, 2]) {
      expect(screen.getByTestId(`total-${seat}`)).toHaveTextContent(String(view.players[seat]!.total));
    }
    expect(screen.getByTestId('results-note')).toHaveTextContent('Waiting for Ana');
    expect(screen.getByText('Ana (you)', { exact: false })).toBeOnTheScreen();
  });
});
