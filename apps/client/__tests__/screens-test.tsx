import { fireEvent, render, screen } from '@testing-library/react-native';
import Home from '@/app/index';
import { Table } from '@/components/Table';
import { practiceGame } from '../test-utils/deal';

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
    expect(screen.getByTestId('middle-count')).toHaveTextContent('48');
    expect(screen.getByTestId('status')).toHaveTextContent('Pick the tile to discard, or close');
  });

  it('closes a hand and shows the results', async () => {
    await renderTable(practiceGame({ middleTop: ['Y4b'] }));
    await fireEvent.press(screen.getByRole('button', { name: 'yellow 4' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByTestId('results')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'You closed!' })).toBeOnTheScreen();
    expect(screen.getByTestId('score-0')).toHaveTextContent('-10');
  });

  it('outlines a group once it becomes a meld', async () => {
    await renderTable();
    expect(screen.queryAllByTestId('rack-meld')).toHaveLength(0);
    const tile = (name: string) => screen.getAllByRole('button', { name })[0]!;
    await fireEvent.press(tile('yellow 7'));
    await fireEvent.press(screen.getByRole('button', { name: 'New group' }));
    await fireEvent.press(tile('yellow 8'));
    await fireEvent.press(tile('yellow 7'));
    expect(screen.queryAllByTestId('rack-meld')).toHaveLength(0);
    await fireEvent.press(tile('yellow 9'));
    await fireEvent.press(tile('yellow 8'));
    expect(screen.getAllByTestId('rack-meld')).toHaveLength(1);
  });
});
