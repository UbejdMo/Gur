import { fireEvent, render, screen } from '@testing-library/react-native';
import Home from '@/app/index';
import { Table } from '@/components/Table';
import { ALMOST, practiceGame } from '../test-utils/deal';

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
    expect(screen.getByTestId('status')).toHaveTextContent('You can close! Drag your extra tile up, or press Close');
  });

  it('tells you to discard when the hand is not complete, and keeps Close off', async () => {
    await renderTable(practiceGame({ you: ALMOST }));
    expect(screen.getByTestId('status')).toHaveTextContent('Drag a tile up off your rack to discard it');
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('results')).toBeNull();
  });

  it('closes a hand and shows the results', async () => {
    await renderTable(practiceGame({ middleTop: ['Y4b'] }));
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
