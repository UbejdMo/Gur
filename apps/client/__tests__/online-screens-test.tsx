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
import type * as ReactNative from 'react-native';
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
    find: jest.fn(),
  },
}));

const mocks = () => ({
  router: (jest.requireMock('expo-router') as { router: { push: jest.Mock; replace: jest.Mock } }).router,
  params: (jest.requireMock('expo-router') as { useLocalSearchParams: jest.Mock }).useLocalSearchParams,
  online: (
    jest.requireMock('@/online/connection') as {
      online: {
        savedName: jest.Mock;
        hasSavedSession: jest.Mock;
        create: jest.Mock;
        join: jest.Mock;
        find: jest.Mock;
      };
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
    members: NAMES.map((name, i) => ({
      name,
      bot: false,
      connected: true,
      host: i === 0,
      avatarUrl: null,
      publicId: null,
      chatId: `chat-${i}`,
    })),
    settings: { aceHigh: true, rounds: 1, fillWithBots: false },
    game: null,
    kind: 'friends',
    startsAt: null,
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

describe('Play online', () => {
  beforeEach(() => localStorage.clear());

  it('asks a guest for a name and 12-13-1, finds a table, and remembers the choice', async () => {
    mocks().online.find.mockResolvedValue({ ok: true, code: 'QWERT' });
    await render(<Home />);
    await fireEvent.press(screen.getByRole('button', { name: 'Play online' }));
    const setup = within(screen.getByTestId('online-setup'));
    expect(setup.getByLabelText('Your name').props.value).toBe('Ana');
    expect(setup.getByRole('switch', { name: 'Allow 12-13-1' }).props.value).toBe(true);
    await fireEvent(setup.getByRole('switch', { name: 'Allow 12-13-1' }), 'valueChange', false);
    await fireEvent.press(setup.getByRole('button', { name: 'Find players' }));
    expect(mocks().online.find).toHaveBeenCalledWith('Ana', false);
    expect(mocks().router.push).toHaveBeenCalledWith('/lobby');
    expect(JSON.parse(localStorage.getItem('gur.online')!)).toEqual({ aceHigh: false });
  });

  it("needs a name, and shows the server's reason when it refuses", async () => {
    mocks().online.find.mockResolvedValue({ ok: false, error: 'The server is full right now. Please try again later' });
    await render(<Home />);
    await fireEvent.press(screen.getByRole('button', { name: 'Play online' }));
    await fireEvent.changeText(screen.getByLabelText('Your name'), '  ');
    await fireEvent.press(screen.getByRole('button', { name: 'Find players' }));
    expect(screen.getByTestId('online-error')).toHaveTextContent('Please choose a name');
    expect(mocks().online.find).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Your name'), 'Ana');
    await fireEvent.press(screen.getByRole('button', { name: 'Find players' }));
    expect(screen.getByTestId('online-error')).toHaveTextContent(
      'The server is full right now. Please try again later',
    );
    expect(mocks().router.push).not.toHaveBeenCalled();
  });

  it('remembers 12-13-1 off from an earlier visit', async () => {
    localStorage.setItem('gur.online', JSON.stringify({ aceHigh: false }));
    await render(<Home />);
    await fireEvent.press(screen.getByRole('button', { name: 'Play online' }));
    expect(screen.getByRole('switch', { name: 'Allow 12-13-1' }).props.value).toBe(false);
  });
});

describe('waiting at a public table', () => {
  const room = (players: number, startsAt: number | null) =>
    lobby({
      kind: 'public',
      startsAt,
      you: 0,
      members: lobby()
        .members.slice(0, players)
        .map((m) => ({ ...m, host: false })),
      settings: { aceHigh: false, rounds: 1, fillWithBots: false },
    });
  const props = () => ({
    onSettings: jest.fn(),
    onStart: jest.fn(),
    onInvite: jest.fn(),
    onLeave: jest.fn(),
    clockOffset: 0,
  });

  it('shows the seats filling up and when the game starts, with no options, no leader and no bots', async () => {
    const p = props();
    await render(<LobbyRoom lobby={room(2, Date.now() + 20_400)} {...p} />);
    expect(screen.getByRole('header', { name: 'Finding players' })).toBeOnTheScreen();
    expect(await screen.findByText('The game starts in 21 seconds, or as soon as four are here.')).toBeOnTheScreen();
    expect(screen.getAllByTestId('member')).toHaveLength(2);
    expect(screen.getAllByText('Looking for a player…')).toHaveLength(2);
    expect(screen.getByTestId('table-rules')).toHaveTextContent('12-13-1 not allowed · One round');
    expect(screen.getByTestId('lobby-code')).toHaveTextContent(/type WRCCS/);
    expect(screen.queryByText(/bot/i)).toBeNull();
    for (const name of ['Start the game', 'Allow 12-13-1', 'Play against bots']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    expect(screen.queryByText('Leader')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Stop looking' }));
    expect(p.onLeave).toHaveBeenCalled();
  });

  it('a player alone waits for at least one more, however long it takes, with no clock', async () => {
    for (const players of [1, 2]) {
      // two seats, but one player dropped: the server has stopped the clock
      await render(<LobbyRoom lobby={room(players, null)} {...props()} />);
      expect(screen.getByTestId('match-status')).toHaveTextContent(
        'Looking for players… The game starts when at least one more player comes.',
      );
      expect(screen.queryByRole('button', { name: 'Play against bots' })).toBeNull();
    }
  });

  it('on a phone on its side, puts the seats beside the choices', async () => {
    const rn = jest.requireActual<typeof ReactNative>('react-native');
    const size = jest
      .spyOn(rn, 'useWindowDimensions')
      .mockReturnValue({ width: 844, height: 390, scale: 3, fontScale: 1 });
    try {
      await render(<LobbyRoom lobby={room(1, null)} {...props()} />);
      expect(screen.getByRole('header', { name: 'Finding players' })).toHaveStyle({ fontSize: 22 });
    } finally {
      size.mockRestore();
    }
  });
});

describe('Play with friends', () => {
  it('starts with the choice: create a lobby or join one', async () => {
    await render(<Friends />);
    expect(screen.getByRole('button', { name: 'Create a lobby' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Join a lobby' })).toBeOnTheScreen();
    expect(screen.queryByLabelText('Lobby code')).toBeNull();
    // joining asks for the code; Back returns to the choice, and then to the first screen
    await fireEvent.press(screen.getByRole('button', { name: 'Join a lobby' }));
    expect(screen.getByLabelText('Lobby code')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Create a lobby' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: 'Create a lobby' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(mocks().router.replace).toHaveBeenCalledWith('/');
  });

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
    await fireEvent.press(screen.getByRole('button', { name: 'Join a lobby' }));
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
    await fireEvent.press(screen.getByRole('button', { name: 'Join a lobby' }));
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
  const invite = jest.fn(async (): Promise<Ack<{ seconds: number }>> => ({ ok: true, seconds: 10 }));

  it('shows the code, who is here and the free seats; the host sets the options and starts', async () => {
    const onSettings = jest.fn(async (): Promise<Ack> => ({ ok: true }));
    const onStart = jest.fn(async (): Promise<Ack> => ({ ok: true }));
    await render(
      <LobbyRoom lobby={lobby()} onSettings={onSettings} onStart={onStart} onLeave={jest.fn()} onInvite={invite} />,
    );
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

  it('the others see the code and the players, and wait for the lobby leader: no options, no invites', async () => {
    await render(
      <LobbyRoom lobby={lobby({ you: 1 })} onSettings={ok} onStart={ok} onLeave={jest.fn()} onInvite={invite} />,
    );
    expect(screen.getByTestId('lobby-code')).toHaveTextContent('WRCCS');
    expect(screen.getAllByTestId('member')).toHaveLength(3);
    expect(within(screen.getAllByTestId('member')[0]!).getByText('Leader')).toBeOnTheScreen();
    expect(screen.getByTestId('waiting-for-host')).toHaveTextContent(
      'Waiting for the lobby leader (Ana) to start the game…',
    );
    expect(screen.queryByRole('button', { name: 'Start the game' })).toBeNull();
    expect(screen.queryByLabelText('Allow 12-13-1')).toBeNull();
    expect(screen.queryByLabelText('Fill empty seats with bots')).toBeNull();
    expect(screen.queryByRole('radio', { name: '3 rounds' })).toBeNull();
    expect(screen.queryByTestId('invite-friends')).toBeNull();
  });

  it('alone, the host is told what is missing; with bots the empty seats say so', async () => {
    const alone = lobby({
      members: [
        { name: 'Ana', bot: false, connected: true, host: true, avatarUrl: null, publicId: null, chatId: 'chat-ana' },
      ],
    });
    const onStart = jest.fn(async (): Promise<Ack> => ({ ok: true }));
    const view = await render(
      <LobbyRoom lobby={alone} onSettings={ok} onStart={onStart} onLeave={jest.fn()} onInvite={invite} />,
    );
    expect(screen.getByText(/You need at least 2 players/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Start the game' }));
    expect(onStart).not.toHaveBeenCalled();

    const withBots = { ...alone, settings: { ...alone.settings, fillWithBots: true } };
    await view.rerender(
      <LobbyRoom lobby={withBots} onSettings={ok} onStart={onStart} onLeave={jest.fn()} onInvite={invite} />,
    );
    expect(screen.getAllByText('A bot will sit here')).toHaveLength(3);
    await fireEvent.press(screen.getByRole('button', { name: 'Start the game' }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("shows who is away, the server's reason for a refusal, and lets you leave", async () => {
    const away = lobby();
    away.members[2] = { ...away.members[2]!, connected: false };
    const onLeave = jest.fn();
    const refuse = jest.fn(async (): Promise<Ack> => ({ ok: false, error: 'This game has already started' }));
    await render(<LobbyRoom lobby={away} onSettings={ok} onStart={refuse} onLeave={onLeave} onInvite={invite} />);
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

  it('pops what a player just said up over their seat for a few seconds; the chat button opens the chat', async () => {
    jest.useFakeTimers();
    const say = jest.fn(async (): Promise<Ack> => ({ ok: true }));
    const fake = {
      act: jest.fn(async () => ({ ok: true })),
      next: jest.fn(),
      say,
      report: jest.fn(),
    } as unknown as Connection;
    const line = (id: number, seat: number, text: string, fresh: boolean) => ({
      id,
      from: `chat-${seat}`,
      seat,
      name: NAMES[seat]!,
      text,
      at: id,
      fresh,
    });
    // Cem said something before you came back (history: no bubble); Ben just sent a fire
    const chat = [line(1, 2, 'hello all', false), line(2, 1, '🔥', true)];
    await render(
      <OnlineTable
        lobby={table(game(1))}
        connection={fake}
        clockOffset={0}
        status="online"
        onLeave={jest.fn()}
        chat={chat}
      />,
    );
    const ben = screen.getAllByTestId('seat').find((s) => /^Ben/.test(s.props.accessibilityLabel as string))!;
    expect(within(ben).getByTestId('speech')).toHaveTextContent('🔥');
    expect(screen.getAllByTestId('speech')).toHaveLength(1);
    await act(() => jest.advanceTimersByTime(4_100));
    expect(screen.queryByTestId('speech')).toBeNull();
    jest.useRealTimers();

    await fireEvent.press(screen.getByRole('button', { name: 'Chat, 2 unread' }));
    expect(screen.getByText('hello all')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Send 👏' }));
    expect(say).toHaveBeenCalledWith('👏');
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

describe('after the round at a public table', () => {
  it('offers to play again at a new table, or to leave; nobody waits for a leader', async () => {
    let g = game(1);
    while (g.status === 'playing') g = timeoutMove(g);
    const onPlayAgain = jest.fn();
    const onLeave = jest.fn();
    const room = lobby({ game: playerView(g, 0) }) as LobbyState & { game: PlayerView };
    await render(
      <OnlineTable
        lobby={{ ...room, kind: 'public', members: room.members.map((m) => ({ ...m, host: false })) }}
        connection={{ act: jest.fn(), next: jest.fn() } as unknown as Connection}
        clockOffset={0}
        status="online"
        onLeave={onLeave}
        onPlayAgain={onPlayAgain}
      />,
    );
    expect(screen.queryByText(/Waiting for/)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Play again' }));
    expect(onPlayAgain).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Leave' }));
    expect(onLeave).toHaveBeenCalled();
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

  it('on a phone on its side, puts points and hand side by side, with the buttons outside the part that scrolls', async () => {
    const rn = jest.requireActual<typeof ReactNative>('react-native');
    const size = jest
      .spyOn(rn, 'useWindowDimensions')
      .mockReturnValue({ width: 844, height: 390, scale: 3, fontScale: 1 });
    try {
      let g = game(1, 3);
      while (g.status === 'playing') g = timeoutMove(g);
      const next = jest.fn();
      await render(
        <ResultsOverlay
          view={playerView(g, 0)}
          names={NAMES}
          primary={{ label: 'Next round', onPress: next }}
          note="The next round starts in 9 seconds"
          onMenu={jest.fn()}
        />,
      );
      const body = screen.getByTestId('results-body');
      expect(body.props.contentContainerStyle).toEqual(
        expect.arrayContaining([expect.objectContaining({ flexDirection: 'row' })]),
      );
      // however much there is to read, the buttons are never scrolled away
      expect(within(body).queryByRole('button')).toBeNull();
      await fireEvent.press(screen.getByRole('button', { name: 'Next round' }));
      expect(next).toHaveBeenCalled();
    } finally {
      size.mockRestore();
    }
  });
});
