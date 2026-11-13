import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import Home from '@/app/index';
import { Table } from '@/components/Table';
import { StyleSheet } from 'react-native';
import { DiscardRow } from '@/components/DiscardRow';
import { colors, tileInk } from '@/theme';
import { ALMOST, NEEDS_K13, READY, practiceGame, t, ts } from '../test-utils/deal';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));

describe('Home', () => {
  it('offers the 12-13-1 option and starts a game against bots', async () => {
    const { router } = jest.requireMock('expo-router') as { router: { push: jest.Mock } };
    await render(<Home />);
    expect(screen.getByRole('header', { name: 'Gur' })).toBeOnTheScreen();
    await fireEvent(screen.getByLabelText('Allow 12-13-1'), 'valueChange', false);
    await fireEvent.press(screen.getByRole('button', { name: 'Play against bots' }));
    expect(router.push).toHaveBeenCalledWith('/play?aceHigh=0');
  });

  it('lets you make the bots play fast', async () => {
    const { router } = jest.requireMock('expo-router') as { router: { push: jest.Mock } };
    await render(<Home />);
    await fireEvent(screen.getByLabelText('Bots take their time'), 'valueChange', false);
    await fireEvent.press(screen.getByRole('button', { name: 'Play against bots' }));
    expect(router.push).toHaveBeenLastCalledWith('/play?aceHigh=1&bots=fast');
  });
});

describe('Table', () => {
  const renderTable = (game = practiceGame()) =>
    render(<Table aceHigh timer={false} botDelayMs={100} newGame={() => game} onMenu={jest.fn()} />);

  it('shows three opponents, the middle and your 15 tiles', async () => {
    await renderTable();
    expect(screen.getAllByTestId('seat')).toHaveLength(3);
    expect(screen.getAllByTestId('rack-tile')).toHaveLength(15);
    expect(screen.getAllByTestId('rack-row')).toHaveLength(2);
    expect(screen.getByTestId('middle-count')).toHaveTextContent('48');
    // in front of every player a row for the tiles left for them, all empty at the start
    expect(screen.getAllByTestId('discards')).toHaveLength(4);
    expect(screen.getByLabelText('Tiles left for Bot 3')).toBeOnTheScreen();
    expect(screen.queryByTestId('last-discard')).toBeNull();
  });

  it('offers Close as soon as the rack shows a closing hand', async () => {
    await renderTable(practiceGame({ you: READY }));
    expect(screen.getByTestId('status')).toHaveTextContent('You can close! Drag your extra tile up, or press Close');
    expect(screen.getByRole('button', { name: 'Close' })).toBeOnTheScreen();
  });

  it('hides Close while tiles that could close are not connected on the rack', async () => {
    // the default hand is a closing hand, but as dealt it is not laid out as melds
    await renderTable();
    expect(screen.getByTestId('status')).toHaveTextContent('Drag a tile up off your rack to discard it');
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('tells you to discard when the hand is not complete, and shows no Close button', async () => {
    await renderTable(practiceGame({ you: ALMOST }));
    expect(screen.getByTestId('status')).toHaveTextContent('Drag a tile up off your rack to discard it');
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('a tile you discard lies in front of the next player, not in front of you', async () => {
    await renderTable(practiceGame({ you: ALMOST }));
    await fireEvent.press(screen.getAllByRole('button', { name: 'red 9' })[0]!);
    await fireEvent.press(screen.getByRole('button', { name: 'Discard' }));
    // Bot 1 plays after you, so the tile is left for Bot 1
    const next = within(screen.getByLabelText('Tiles left for Bot 1'));
    expect(next.getByTestId('last-discard')).toHaveProp('accessibilityLabel', 'red 9');
    expect(within(screen.getByLabelText('Tiles left for you')).queryByTestId('last-discard')).toBeNull();
  });

  it('closes a hand and shows the results', async () => {
    await renderTable(practiceGame({ you: READY, middleTop: ['Y4b'] }));
    await fireEvent.press(screen.getByRole('button', { name: 'yellow 4' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByTestId('results')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'You closed!' })).toBeOnTheScreen();
    expect(screen.getByTestId('score-0')).toHaveTextContent('-10');
  });

  it('shows a green bar once tiles side by side form a meld', async () => {
    await renderTable();
    expect(screen.queryAllByTestId('rack-meld')).toHaveLength(0);
    const tile = (name: string) => screen.getAllByRole('button', { name })[0]!;
    // the bottom row's last five slots (21 to 24) are empty; put yellow 7, 8, 9 side by side there
    const moves: [string, string][] = [
      ['yellow 7', 'Empty slot 21'],
      ['yellow 8', 'Empty slot 22'],
    ];
    for (const [name, slot] of moves) {
      await fireEvent.press(tile(name));
      await fireEvent.press(screen.getByRole('button', { name: slot }));
    }
    // moving the yellow 7 and 8 away leaves the four 11s side by side: already a meld
    expect(screen.getAllByTestId('rack-meld')).toHaveLength(1);
    await fireEvent.press(tile('yellow 9'));
    await fireEvent.press(screen.getByRole('button', { name: 'Empty slot 23' }));
    expect(screen.getAllByTestId('rack-meld')).toHaveLength(2);
  });
});

describe('DiscardRow', () => {
  const joker = { color: 'red', number: 13 } as const;
  const props = { name: 'Bot 3', joker, tileWidth: 30, onDropAt: jest.fn() };

  it("shows a player's latest six discards; only the newest can be taken, and only on your turn to draw", async () => {
    const onTake = jest.fn();
    const discards = ts('B1 B2 B3 B4 B5 B6 B7 B8');
    await render(<DiscardRow {...props} discards={discards} last={t('B8')} takeable onTake={onTake} />);
    expect(screen.getByLabelText('Tiles left for Bot 3')).toBeOnTheScreen();
    expect(screen.getAllByTestId('gone-discard')).toHaveLength(5);
    expect(screen.queryByLabelText('blue 2')).toBeNull();
    expect(screen.getByLabelText('blue 3')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('last-discard'));
    expect(onTake).toHaveBeenCalledTimes(1);
  });

  it('tiles that are out of the game keep their full colour on a darker face, not faded', async () => {
    await render(<DiscardRow {...props} discards={ts('B1 R2')} last={null} takeable={false} onTake={jest.fn()} />);
    for (const tile of screen.getAllByTestId('gone-discard')) {
      const style = StyleSheet.flatten(tile.props.style as object) as { backgroundColor: string; opacity?: number };
      expect(style.backgroundColor).toBe(colors.tileGone);
      expect(style.opacity ?? 1).toBe(1);
    }
    // the number and the dot under it both carry the tile's colour
    const blue = within(screen.getByLabelText('blue 1'));
    expect(StyleSheet.flatten(blue.getByText('1').props.style as object)).toMatchObject({ color: tileInk.blue });
  });

  it('once the next player has drawn, every tile there is gone for good', async () => {
    const onTake = jest.fn();
    await render(<DiscardRow {...props} discards={ts('B1 B2 B3')} last={null} takeable={false} onTake={onTake} />);
    expect(screen.getAllByTestId('gone-discard')).toHaveLength(3);
    expect(screen.queryByTestId('last-discard')).toBeNull();
  });

  it('a discard left for another player cannot be taken by you', async () => {
    const onTake = jest.fn();
    await render(<DiscardRow {...props} discards={ts('B1 B2')} last={t('B2')} takeable={false} onTake={onTake} />);
    await fireEvent.press(screen.getByTestId('last-discard'));
    expect(onTake).not.toHaveBeenCalled();
  });
});

describe('Table: whose tiles lie where', () => {
  it('the tile you may take lies in front of you, with the ones you passed up', async () => {
    jest.useFakeTimers();
    try {
      // Bot 3 starts, so its first discard is left for you
      await render(
        <Table
          aceHigh
          timer={false}
          botDelayMs={100}
          newGame={() => practiceGame({ starter: 3 })}
          onMenu={jest.fn()}
        />,
      );
      await act(async () => {
        jest.advanceTimersByTime(150);
      });
      const yours = within(screen.getByLabelText('Tiles left for you'));
      expect(yours.getByTestId('last-discard')).toBeOnTheScreen();
      // pass it up: draw from the middle instead; it stays in front of you, gone for good
      await fireEvent.press(screen.getByTestId('draw-middle'));
      expect(yours.queryByTestId('last-discard')).toBeNull();
      expect(yours.getAllByTestId('gone-discard')).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('Table: the indicator', () => {
  /** Black 13 is the indicator; Bot 3 starts and discards, then it is your turn to draw. */
  async function yourDraw(you: string) {
    await render(
      <Table
        aceHigh
        timer={false}
        botDelayMs={100}
        newGame={() => practiceGame({ you, indicator: 'K13', starter: 3 })}
        onMenu={jest.fn()}
      />,
    );
    await act(async () => {
      jest.advanceTimersByTime(150);
    });
  }
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('tapping it takes it when it completes your hand; you are then told to close', async () => {
    await yourDraw(NEEDS_K13);
    const middle = screen.getByTestId('middle-count').props.children as number;
    await fireEvent.press(screen.getByTestId('indicator'));
    expect(screen.queryByTestId('indicator')).toBeNull();
    expect(screen.getByTestId('indicator-taken')).toBeOnTheScreen();
    expect(screen.getAllByTestId('rack-tile')).toHaveLength(15);
    expect(screen.getByRole('button', { name: 'black 13' })).toBeOnTheScreen();
    // it is not a draw from the middle
    expect(screen.getByTestId('middle-count')).toHaveTextContent(String(middle));
    expect(screen.getByTestId('status')).toHaveTextContent(/You took the indicator: connect your tiles/);
  });

  it('tapping it when it would not complete your hand takes nothing and says why', async () => {
    await yourDraw(ALMOST);
    const middle = screen.getByTestId('middle-count').props.children as number;
    await fireEvent.press(screen.getByTestId('indicator'));
    expect(screen.getByTestId('message')).toHaveTextContent(/only take the indicator when it lets you close/);
    expect(screen.getByTestId('indicator')).toBeOnTheScreen();
    expect(screen.getAllByTestId('rack-tile')).toHaveLength(14);
    expect(screen.getByTestId('middle-count')).toHaveTextContent(String(middle));
  });
});
