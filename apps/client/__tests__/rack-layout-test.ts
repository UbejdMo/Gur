import {
  MIN_COLS,
  colsOf,
  initialLayout,
  layoutGroups,
  placeTile,
  reconcile,
  resizeLayout,
  sameGroups,
} from '@/game/rackLayout';
import type { Layout } from '@/game/rackLayout';
import { dropTarget, placeAt } from '@/components/Rack';

const hand14 = Array.from({ length: 14 }, (_, i) => i + 1);
const COLS = MIN_COLS;

/** A rack from a picture: '1 2 3 . 5' is a row, '.' an empty slot; short rows are padded. */
function rack(top: string, bottom = '', cols = COLS): Layout {
  const row = (s: string) => {
    const cells = s.trim()
      ? s
          .trim()
          .split(/\s+/)
          .map((c) => (c === '.' ? null : Number(c)))
      : [];
    return [...cells, ...new Array<null>(cols - cells.length).fill(null)];
  };
  return [...row(top), ...row(bottom)];
}

describe('rack layout', () => {
  it('deals 7 tiles to the top row and 7 to the bottom', () => {
    const layout = initialLayout(hand14);
    expect(layout).toHaveLength(COLS * 2);
    expect(layout.slice(0, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(layout.slice(COLS, COLS + 7)).toEqual([8, 9, 10, 11, 12, 13, 14]);
    expect(layoutGroups(layout)).toEqual([
      [1, 2, 3, 4, 5, 6, 7],
      [8, 9, 10, 11, 12, 13, 14],
    ]);
  });

  it('a wider rack has more columns, dealt the same way', () => {
    const layout = initialLayout(hand14, 20);
    expect(colsOf(layout)).toBe(20);
    expect(layout.slice(20, 27)).toEqual([8, 9, 10, 11, 12, 13, 14]);
  });

  it('puts a 15th tile in a slot of its own, away from other tiles', () => {
    const layout = initialLayout([...hand14, 99]);
    const slot = layout.indexOf(99);
    expect(layout[slot - 1]).toBeNull();
    expect(layoutGroups(layout)).toContainEqual([99]);
  });

  it('an empty slot splits a row into groups, and rows never join', () => {
    const layout = initialLayout(hand14);
    const moved = placeTile(layout, 4, 10);
    expect(layoutGroups(moved)).toEqual([[1, 2, 3], [5, 6, 7], [4], [8, 9, 10, 11, 12, 13, 14]]);
    // last slot of the top row and first of the bottom row are not neighbours
    const edge = placeTile(layout, 7, COLS - 1);
    expect(layoutGroups(edge)).toContainEqual([7]);
  });

  it('follows the hand: removes discards and places new tiles', () => {
    const layout = initialLayout(hand14);
    const next = reconcile(
      layout,
      hand14.filter((t) => t !== 3),
    );
    expect(next).not.toContain(3);
    expect(next[2]).toBeNull();
    expect(reconcile(layout, [...hand14, 50])).toContain(50);
  });

  it('compares groups regardless of order', () => {
    expect(sameGroups([[1, 2], [3]], [[3], [2, 1]])).toBe(true);
    expect(sameGroups([[1, 2], [3]], [[1], [2, 3]])).toBe(false);
  });

  it('rejects unknown slots', () => {
    const layout = initialLayout(hand14);
    expect(() => placeTile(layout, 1, 99)).toThrow();
    expect(() => placeTile(layout, 1, -1)).toThrow();
  });
});

describe('dropping a tile on another tile', () => {
  it('never swaps: it slides in on the side it was dropped on', () => {
    // 9 comes from the bottom row and lands between 1 and 2
    expect(placeTile(rack('1 2 3', '9'), 9, 1, 'left')).toEqual(rack('1 9 2 3'));
    expect(placeTile(rack('1 2 3', '9'), 9, 0, 'right')).toEqual(rack('1 9 2 3'));
    // left half of the first tile: it goes in front
    expect(placeTile(rack('1 2 3', '9'), 9, 0, 'left')).toEqual(rack('9 1 2 3'));
    // right half of the last tile: it goes after
    expect(placeTile(rack('1 2 3', '9'), 9, 2, 'right')).toEqual(rack('1 2 3 9'));
  });

  it('only shifts the tiles up to the next empty slot', () => {
    expect(placeTile(rack('1 2 . 4 5', '9'), 9, 0, 'right')).toEqual(rack('1 9 2 4 5'));
    expect(placeTile(rack('1 2 . . 5', '9'), 9, 0, 'right')).toEqual(rack('1 9 2 . 5'));
  });

  it('reorders inside a group without moving the group', () => {
    expect(placeTile(rack('1 2 3'), 1, 2, 'right')).toEqual(rack('2 3 1'));
    expect(placeTile(rack('1 2 3'), 1, 2, 'left')).toEqual(rack('2 1 3'));
    expect(placeTile(rack('1 2 3'), 3, 0, 'left')).toEqual(rack('3 1 2'));
    expect(placeTile(rack('1 2 3'), 3, 0, 'right')).toEqual(rack('1 3 2'));
    // dropped on its own neighbour's near half: nothing changes
    expect(placeTile(rack('1 2 3'), 2, 2, 'left')).toEqual(rack('1 2 3'));
    expect(placeTile(rack('1 2 3'), 2, 0, 'right')).toEqual(rack('1 2 3'));
    expect(placeTile(rack('1 2 3'), 2, 1, 'right')).toEqual(rack('1 2 3'));
  });

  it('at the end of a row the tiles shift the other way', () => {
    const end = rack('. . . . . . . . . 1 2 3', '9');
    expect(placeTile(end, 9, COLS - 1, 'right')).toEqual(rack('. . . . . . . . 1 2 3 9'));
    expect(placeTile(end, 9, COLS - 1, 'left')).toEqual(rack('. . . . . . . . 1 2 9 3'));
    const start = rack('1 2 3 4 5 6 7 8 9 10 11 .', '99');
    expect(placeTile(start, 99, 0, 'left')).toEqual(rack('99 1 2 3 4 5 6 7 8 9 10 11'));
  });

  it('places a newly drawn tile the same way', () => {
    expect(placeTile(rack('1 2 3'), 9, 1, 'right')).toEqual(rack('1 2 9 3'));
    expect(placeTile(rack('1 2 3'), 9, 6)).toEqual(rack('1 2 3 . . . 9'));
  });

  it('in a full row, where nothing can shift, the two trade places', () => {
    const full = rack('1 2 3 4 5 6 7 8 9 10 11 12', '99');
    const next = placeTile(full, 99, 3, 'left');
    expect(next[3]).toBe(99);
    expect(next[COLS]).toBe(4);
    // a new tile that cannot fit there goes to a free slot instead
    const drawn = placeTile(rack('1 2 3 4 5 6 7 8 9 10 11 12'), 50, 3, 'left');
    expect(drawn.slice(0, COLS)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(drawn).toContain(50);
  });
});

describe('resizing the rack', () => {
  it('keeps every tile in place when the rack gets wider', () => {
    const wide = resizeLayout(rack('1 2 . 4', '. 9'), 18);
    expect(colsOf(wide)).toBe(18);
    expect(wide).toEqual(rack('1 2 . 4', '. 9', 18));
    expect(resizeLayout(wide, 18)).toBe(wide);
  });

  it('keeps tiles in place when it gets narrower and they still fit', () => {
    expect(resizeLayout(rack('1 2 . 4', '. 9', 18), 12)).toEqual(rack('1 2 . 4', '. 9'));
  });

  it('packs the groups together, still apart, when they no longer fit', () => {
    const wide = rack('1 2 3 . . . . . . . . . . 4 5', '. . . . . . . . . . . . . . . 6', 18);
    const narrow = resizeLayout(wide, 12);
    expect(layoutGroups(narrow)).toEqual([[1, 2, 3], [4, 5], [6]]);
    expect(narrow).toEqual(rack('1 2 3 . 4 5 . 6'));
  });

  it('as a last resort fills the slots in order, and never loses a tile', () => {
    const tiles = Array.from({ length: 15 }, (_, i) => i + 1);
    const wide = rack(tiles.join(' '), '', 18);
    const narrow = resizeLayout(wide, 12);
    expect(narrow.filter((t) => t !== null)).toEqual(tiles);
    expect(() => resizeLayout(wide, 5)).toThrow();
  });
});

describe('dropTarget', () => {
  const slot = 30;
  const stride = 60;
  const at = (from: number, dx: number, dy: number) => dropTarget(from, dx, dy, slot, stride, COLS);

  it('finds the slot from how far the tile moved', () => {
    expect(at(0, 0, 0)).toMatchObject({ slot: 0 });
    expect(at(0, 95, 0)).toMatchObject({ slot: 3 });
    expect(at(2, -61, 0)).toMatchObject({ slot: 0 });
    expect(at(0, 0, 58)).toMatchObject({ slot: COLS });
    expect(at(COLS + 1, 0, -62)).toMatchObject({ slot: 1 });
  });

  it('tells which half of the slot the tile landed on', () => {
    expect(at(0, 80, 0)).toEqual({ slot: 3, side: 'left' });
    expect(at(0, 100, 0)).toEqual({ slot: 3, side: 'right' });
    expect(at(5, -40, 0)).toEqual({ slot: 4, side: 'left' });
  });

  it('treats a drag up off the rack as a discard', () => {
    expect(at(3, 0, -45)).toBe('up');
    expect(at(COLS + 3, 10, -120)).toBe('up');
  });

  it('just past either end still counts as the end slot; further out snaps back', () => {
    expect(at(0, -20, 0)).toEqual({ slot: 0, side: 'left' });
    expect(at(COLS - 1, 20, 0)).toEqual({ slot: COLS - 1, side: 'right' });
    expect(at(0, -40, 0)).toBeNull();
    expect(at(COLS - 1, 40, 0)).toBeNull();
    expect(at(COLS, 0, 70)).toBeNull();
  });

  it('finds the place under a point for tiles dragged in from the table', () => {
    expect(placeAt(2.2, 0.5, COLS)).toEqual({ slot: 2, side: 'left' });
    expect(placeAt(2.8, 1.5, COLS)).toEqual({ slot: COLS + 2, side: 'right' });
    expect(placeAt(2, -0.2, COLS)).toBeNull();
    expect(placeAt(2, 2.1, COLS)).toBeNull();
    expect(placeAt(20, 0.5, 18)).toBeNull();
  });
});
