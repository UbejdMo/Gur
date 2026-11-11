import { handOf, isRealJoker, jokerFromIndicator, seededRng, tileId } from '@gur/engine';
import { dealPractice, sortForDisplay } from '@/practice';

describe('practice deal', () => {
  it('gives the viewer the first turn with 15 tiles', () => {
    const { game, hand } = dealPractice(seededRng(1));
    expect(game.round.starter).toBe(0);
    expect(game.round.current).toBe(0);
    expect(hand).toHaveLength(15);
    expect([...hand].sort()).toEqual([...handOf(game.players[0]!)].sort());
  });

  it('sorts jokers first and printed jokers last', () => {
    const joker = jokerFromIndicator(tileId('yellow', 1)); // joker = yellow 2
    const ids = [104, tileId('black', 5), tileId('yellow', 2), tileId('red', 9), tileId('red', 3)];
    const sorted = sortForDisplay(ids, joker);
    expect(isRealJoker(sorted[0]!, joker)).toBe(true);
    expect(sorted.at(-1)).toBe(104);
    expect(sorted.slice(1, 4)).toEqual([tileId('red', 3), tileId('red', 9), tileId('black', 5)]);
  });
});
