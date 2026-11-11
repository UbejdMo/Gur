import { fireEvent, render, screen } from '@testing-library/react-native';
import Home from '@/app/index';

describe('Home screen', () => {
  it('shows the title, the joker and a 15-tile practice hand', async () => {
    await render(<Home />);
    expect(screen.getByRole('header', { name: 'Gur' })).toBeOnTheScreen();
    expect(screen.getByTestId('joker')).toBeOnTheScreen();
    // 15 in the hand plus the indicator
    expect(screen.getAllByTestId('tile')).toHaveLength(16);
    expect(screen.getByTestId('middle-count')).toHaveTextContent('48');
  });

  it('deals a new hand', async () => {
    await render(<Home />);
    const before = screen.getAllByTestId('tile').map((t) => t.props.accessibilityLabel);
    let changed = false;
    for (let i = 0; i < 5 && !changed; i++) {
      await fireEvent.press(screen.getByRole('button', { name: 'Deal again' }));
      const after = screen.getAllByTestId('tile').map((t) => t.props.accessibilityLabel);
      changed = after.join() !== before.join();
    }
    expect(changed).toBe(true);
    expect(screen.getAllByTestId('tile')).toHaveLength(16);
  });
});
